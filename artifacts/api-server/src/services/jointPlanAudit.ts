/**
 * Existing plans vs joints the client reported (interview text or "Coś boli?" ≤ 30 days).
 *
 * Plans built before the joint exclusion fix (phase 1, block 1) — or exercises a trainer added on purpose
 * ("Dodaj mimo to") — may still contain exercises that load a reported joint. This module finds them and proposes
 * a replacement from the LOWER steps of the same progression ladder (docs/DRABINKI.md):
 *  - the nearest lower step first (closest in difficulty), never a higher one;
 *  - the replacement must not load any reported joint, must fit the client's location and equipment,
 *    must be active and must pass the level safety rules (no activity: suitableForNoActivity === true;
 *    no activity / beginner: learningDifficulty set; ladder step not above the client's level);
 *  - exercises not on any ladder get no proposal (the trainer picks by hand).
 * Read-only except replaceWithProposal, which swaps only the exercise of one plan slot (prescription unchanged).
 */
import { eq, inArray, ne } from "drizzle-orm";
export { pool } from "@workspace/db";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  jointWarningDecisionsTable,
} from "@workspace/db";
import { loadBlockedJoints, reportedJointsLoaded } from "./jointExclusion";
import { LADDER_RANK, loadLadderRows, type LadderRow } from "./ladderSelection";
import { buildCompatibilityFilter } from "./planDraftDayRecommendationsService";

export interface CandidateInfo {
  id: number;
  name: string;
  isActive: boolean | null;
  jointStressAreas: string[] | null;
  suitableForNoActivity: boolean | null;
  learningDifficulty: number | null;
  trainingLocation: string[];
  equipment: string[];
  requiredEquipmentAll: string[];
}

export interface ReplacementContext {
  level: string | null | undefined;
  blockedJoints: ReadonlySet<string>;
  /** location / equipment / joints filter of the client (buildCompatibilityFilter) */
  compatible: (ex: CandidateInfo) => boolean;
  /** ids already used in the same day — not proposed again */
  excludeIds: ReadonlySet<number>;
}

export interface ReplacementProposal { id: number; name: string; pattern: string; stepOrder: number; level: string }

function safeForLevel(ex: CandidateInfo, level: string | null | undefined): boolean {
  if (level === "Brak aktywności fizycznej" && ex.suitableForNoActivity !== true) return false;
  if ((level === "Brak aktywności fizycznej" || level === "Początkujący") && ex.learningDifficulty == null) return false;
  return true;
}

/** Pure: nearest lower ladder step that is safe for this client, or null. */
export function proposeLadderReplacement(
  exerciseId: number,
  ladder: readonly LadderRow[],
  info: ReadonlyMap<number, CandidateInfo>,
  ctx: ReplacementContext,
): ReplacementProposal | null {
  const clientRank = ctx.level != null ? LADDER_RANK[ctx.level] : undefined;
  for (const own of ladder.filter((r) => r.exerciseId === exerciseId)) {
    const lower = ladder
      .filter((r) => r.pattern === own.pattern && r.stepOrder < own.stepOrder)
      .sort((a, b) => b.stepOrder - a.stepOrder);
    for (const step of lower) {
      const ex = info.get(step.exerciseId);
      if (!ex || !ex.isActive || ctx.excludeIds.has(ex.id)) continue;
      if (clientRank !== undefined && (LADDER_RANK[step.level] ?? 99) > clientRank) continue;
      if (reportedJointsLoaded(ex.jointStressAreas, ctx.blockedJoints).length > 0) continue;
      if (!ctx.compatible(ex) || !safeForLevel(ex, ctx.level)) continue;
      return { id: ex.id, name: ex.name, pattern: step.pattern, stepOrder: step.stepOrder, level: step.level };
    }
  }
  return null;
}

export interface JointConflict {
  clientId: number;
  clientLabel: string;
  planId: number;
  planTitle: string;
  planStatus: string;
  dayId: number;
  dayName: string;
  planExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  joints: string[];
  replacement: ReplacementProposal | null;
  /** the trainer already confirmed "Dodaj mimo to" for this slot */
  trainerDecisionAt: Date | null;
}

const CANDIDATE_COLUMNS = {
  id: exercisesTable.id,
  name: exercisesTable.name,
  isActive: exercisesTable.isActive,
  jointStressAreas: exercisesTable.jointStressAreas,
  suitableForNoActivity: exercisesTable.suitableForNoActivity,
  learningDifficulty: exercisesTable.learningDifficulty,
  trainingLocation: exercisesTable.trainingLocation,
  equipment: exercisesTable.equipment,
  requiredEquipmentAll: exercisesTable.requiredEquipmentAll,
};

/** Ids of all plans that are not archived (audit scope). */
export async function listCurrentPlanIds(): Promise<number[]> {
  return (await db.select({ id: workoutPlansTable.id }).from(workoutPlansTable).where(ne(workoutPlansTable.status, "archived"))).map((p) => p.id);
}

/** Conflicts in the given plans (archived plans are skipped). */
export async function findJointConflicts(planIds: readonly number[], now: Date = new Date()): Promise<JointConflict[]> {
  if (planIds.length === 0) return [];
  const plans = await db
    .select({
      id: workoutPlansTable.id, title: workoutPlansTable.title, status: workoutPlansTable.status, level: workoutPlansTable.experienceLevelUsed,
      clientId: workoutPlansTable.clientId, firstName: clientsTable.firstName, lastName: clientsTable.lastName,
      health: surveysTable.healthLimitations, location: surveysTable.trainingLocation, equipment: surveysTable.equipment,
    })
    .from(workoutPlansTable)
    .innerJoin(clientsTable, eq(clientsTable.id, workoutPlansTable.clientId))
    .innerJoin(surveysTable, eq(surveysTable.id, workoutPlansTable.surveyId))
    .where(inArray(workoutPlansTable.id, [...planIds]));

  const ladder = await loadLadderRows();
  const ladderIds = [...new Set(ladder.map((r) => r.exerciseId))];
  const info = new Map<number, CandidateInfo>(
    ladderIds.length === 0 ? [] : (await db.select(CANDIDATE_COLUMNS).from(exercisesTable).where(inArray(exercisesTable.id, ladderIds)))
      .map((e) => [e.id, { ...e, trainingLocation: e.trainingLocation ?? [], equipment: e.equipment ?? [], requiredEquipmentAll: e.requiredEquipmentAll ?? [] }]),
  );

  const out: JointConflict[] = [];
  for (const p of plans) {
    if (p.status === "archived") continue;
    const blocked = await loadBlockedJoints(p.clientId, p.health, now);
    if (blocked.size === 0) continue;
    const slots = await db
      .select({
        planExerciseId: workoutPlanExercisesTable.id, dayId: workoutPlanDaysTable.id, dayName: workoutPlanDaysTable.dayName,
        dayOrder: workoutPlanDaysTable.dayOrder, orderInDay: workoutPlanExercisesTable.orderInDay,
        exerciseId: exercisesTable.id, exerciseName: exercisesTable.name, joints: exercisesTable.jointStressAreas,
      })
      .from(workoutPlanExercisesTable)
      .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId))
      .innerJoin(exercisesTable, eq(exercisesTable.id, workoutPlanExercisesTable.exerciseId))
      .where(eq(workoutPlanDaysTable.planId, p.id));
    const decisions = await db
      .select({ planExerciseId: jointWarningDecisionsTable.planExerciseId, createdAt: jointWarningDecisionsTable.createdAt })
      .from(jointWarningDecisionsTable)
      .where(eq(jointWarningDecisionsTable.planId, p.id));
    const decidedAt = new Map(decisions.map((d) => [d.planExerciseId, d.createdAt]));
    const filter = buildCompatibilityFilter(p.location, p.equipment, new Set<number>(), blocked);
    const compatible = (ex: CandidateInfo) => filter(ex);

    slots.sort((a, b) => a.dayOrder - b.dayOrder || a.orderInDay - b.orderInDay);
    for (const s of slots) {
      const joints = reportedJointsLoaded(s.joints, blocked);
      if (joints.length === 0) continue;
      const sameDay = new Set(slots.filter((x) => x.dayId === s.dayId).map((x) => x.exerciseId));
      out.push({
        clientId: p.clientId, clientLabel: `#${p.clientId} ${p.firstName} ${(p.lastName ?? "").slice(0, 1)}.`.trim(),
        planId: p.id, planTitle: p.title, planStatus: p.status,
        dayId: s.dayId, dayName: s.dayName ?? `Dzień ${s.dayOrder}`, planExerciseId: s.planExerciseId,
        exerciseId: s.exerciseId, exerciseName: s.exerciseName, joints,
        replacement: proposeLadderReplacement(s.exerciseId, ladder, info, { level: p.level, blockedJoints: blocked, compatible, excludeIds: sameDay }),
        trainerDecisionAt: decidedAt.get(s.planExerciseId) ?? null,
      });
    }
  }
  return out;
}

/**
 * Swaps one plan slot to the server-side proposal (the client cannot choose an arbitrary exercise here).
 * Returns the proposal used, or an error code.
 */
export async function replaceWithProposal(planId: number, planExerciseId: number):
  Promise<{ ok: true; replacement: ReplacementProposal } | { ok: false; code: "NO_WARNING" | "NO_REPLACEMENT" }> {
  const conflict = (await findJointConflicts([planId])).find((c) => c.planExerciseId === planExerciseId);
  if (!conflict) return { ok: false, code: "NO_WARNING" };
  if (!conflict.replacement) return { ok: false, code: "NO_REPLACEMENT" };
  await db.update(workoutPlanExercisesTable)
    .set({ exerciseId: conflict.replacement.id })
    .where(eq(workoutPlanExercisesTable.id, planExerciseId));
  await db.update(workoutPlansTable).set({ updatedAt: new Date() }).where(eq(workoutPlansTable.id, planId));
  return { ok: true, replacement: conflict.replacement };
}
