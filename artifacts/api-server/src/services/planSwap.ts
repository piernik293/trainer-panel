/**
 * "Zamień" one exercise of a plan (owner's decision 26.10.2026): the other exercises stay as they are; the replacement is the same
 * movement pattern and muscle group, DIFFERENT from the removed exercise and from every exercise already in the plan, and passes all the
 * generator's safety filters (visible, reviewed rules for the level, equipment/place/joints, beginner rules, never a higher step).
 * No option → the caller reports it and (on request) leaves the slot empty for a manual choice.
 */
import { and, eq } from "drizzle-orm";
import {
  db, exercisesTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, planChangeLogTable,
} from "@workspace/db";
import { isGeneratorSafe, isMainPlanExercise } from "../lib/exerciseRoles";
import { loadBlockedJoints } from "./jointExclusion";
import { LADDER_RANK, buildLadderRules, loadLadderRows } from "./ladderSelection";
import { buildCompatibilityFilter } from "./planDraftDayRecommendationsService";
import { isPlyoExercise, plyoRule, selectPlyoBlock } from "./plyoBlock";

export interface SwapExercise {
  id: number;
  name: string;
  parentExerciseId: number | null;
  exerciseType: string | null;
  learningDifficulty: number | null;
  difficultyLevel: string | null;
  suitableForNoActivity: boolean | null;
  isActive: boolean | null;
  hidden: boolean | null;
  reviewedByTrainer: boolean | null;
  intensity: string | null;
  role: string | null;
  movementPattern: string | null;
  mainMuscleGroup: string | null;
  createdByTrainerId: number | null;
  equipment: string[];
}

export interface SwapContext {
  level: string | null | undefined;
  trainerId: number;
  removed: SwapExercise;
  /** every exercise already in the plan (all days) */
  inPlan: ReadonlySet<number>;
  avoided: ReadonlySet<number>;
  compatible: (c: SwapExercise) => boolean;
  ladderAllowed: (id: number) => boolean;
  plyo?: { goal: string | null; jumpExperience: string | null };
}

const beginnerLevel = (l: string | null | undefined) => l === "Brak aktywności fizycznej" || l === "Początkujący";

/** Pure: the best replacement or null. Deterministic: main before variant, same type, closest learning difficulty, then id. */
export function pickSwap(candidates: readonly SwapExercise[], ctx: SwapContext): SwapExercise | null {
  const rank = ctx.level != null ? LADDER_RANK[ctx.level] : undefined;
  const removedIsPlyo = isPlyoExercise({ role: ctx.removed.role, intensity: ctx.removed.intensity, equipment: ctx.removed.equipment });
  const ok = candidates.filter((c) => {
    if (c.id === ctx.removed.id || ctx.inPlan.has(c.id) || ctx.avoided.has(c.id)) return false;
    if (!c.isActive || c.hidden) return false;
    if (c.createdByTrainerId !== null && c.createdByTrainerId !== ctx.trainerId) return false;
    if (c.movementPattern !== ctx.removed.movementPattern || c.mainMuscleGroup !== ctx.removed.mainMuscleGroup) return false;
    const cIsPlyo = isPlyoExercise({ role: c.role, intensity: c.intensity, equipment: c.equipment });
    if (removedIsPlyo) {
      const rule = plyoRule({ goal: ctx.plyo?.goal ?? null, effectiveLevel: ctx.level, jumpExperience: ctx.plyo?.jumpExperience });
      if (!cIsPlyo || selectPlyoBlock([{ ...c, difficultyLevel: c.difficultyLevel }], rule, ctx.level).length !== 1) return false;
    } else {
      if (cIsPlyo || !isMainPlanExercise(c)) return false;
      if (!isGeneratorSafe({ hidden: c.hidden, reviewedByTrainer: c.reviewedByTrainer, intensity: c.intensity }, ctx.level)) return false;
    }
    // never a higher step than the client's level
    if (rank !== undefined && (c.difficultyLevel == null || (LADDER_RANK[c.difficultyLevel] ?? 99) > rank)) return false;
    if (ctx.level === "Brak aktywności fizycznej" && c.suitableForNoActivity !== true) return false;
    if (beginnerLevel(ctx.level) && !(c.learningDifficulty != null && c.learningDifficulty >= 1 && c.learningDifficulty <= 2)) return false;
    return ctx.ladderAllowed(c.id) && ctx.compatible(c);
  });
  const want = ctx.removed.learningDifficulty ?? 3;
  ok.sort((a, b) =>
    Number(a.parentExerciseId !== null) - Number(b.parentExerciseId !== null) ||
    Number(b.exerciseType === ctx.removed.exerciseType) - Number(a.exerciseType === ctx.removed.exerciseType) ||
    Math.abs((a.learningDifficulty ?? 3) - want) - Math.abs((b.learningDifficulty ?? 3) - want) ||
    a.id - b.id);
  return ok[0] ?? null;
}

export type SwapResult =
  | { ok: true; outcome: "replaced"; from: { id: number; name: string }; to: { id: number; name: string } }
  | { ok: true; outcome: "removed"; from: { id: number; name: string } }
  | { ok: false; code: "NO_SLOT" | "NO_OPTION" };

/** Replaces the slot (same dosage) or, when there is no option and `removeIfNone`, empties it. Logged in the plan history. */
export async function swapPlanExercise(planId: number, planExerciseId: number, trainerId: number, removeIfNone: boolean): Promise<SwapResult> {
  const [plan] = await db
    .select({ id: workoutPlansTable.id, clientId: workoutPlansTable.clientId, surveyId: workoutPlansTable.surveyId, level: workoutPlansTable.experienceLevelUsed })
    .from(workoutPlansTable).where(eq(workoutPlansTable.id, planId));
  if (!plan) return { ok: false, code: "NO_SLOT" };
  const slots = await db
    .select({ id: workoutPlanExercisesTable.id, exerciseId: workoutPlanExercisesTable.exerciseId })
    .from(workoutPlanExercisesTable)
    .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId))
    .where(eq(workoutPlanDaysTable.planId, planId));
  const slot = slots.find((s) => s.id === planExerciseId);
  if (!slot) return { ok: false, code: "NO_SLOT" };

  const cols = {
    id: exercisesTable.id, name: exercisesTable.name, parentExerciseId: exercisesTable.parentExerciseId, exerciseType: exercisesTable.exerciseType,
    learningDifficulty: exercisesTable.learningDifficulty, difficultyLevel: exercisesTable.difficultyLevel,
    suitableForNoActivity: exercisesTable.suitableForNoActivity, isActive: exercisesTable.isActive, hidden: exercisesTable.hidden,
    reviewedByTrainer: exercisesTable.reviewedByTrainer, intensity: exercisesTable.intensity, role: exercisesTable.role,
    movementPattern: exercisesTable.movementPattern, mainMuscleGroup: exercisesTable.mainMuscleGroup,
    createdByTrainerId: exercisesTable.createdByTrainerId, equipment: exercisesTable.equipment,
    trainingLocation: exercisesTable.trainingLocation, requiredEquipmentAll: exercisesTable.requiredEquipmentAll, jointStressAreas: exercisesTable.jointStressAreas,
  };
  const [removedRow] = await db.select(cols).from(exercisesTable).where(eq(exercisesTable.id, slot.exerciseId));
  if (!removedRow) return { ok: false, code: "NO_SLOT" };

  const [survey] = plan.surveyId
    ? await db.select().from(surveysTable).where(eq(surveysTable.id, plan.surveyId))
    : [undefined];
  const blocked = await loadBlockedJoints(plan.clientId, survey?.healthLimitations);
  const filter = buildCompatibilityFilter(survey?.trainingLocation, survey?.equipment, new Set<number>(), blocked);
  const ladder = buildLadderRules(await loadLadderRows(), plan.level);

  const pool = await db.select(cols).from(exercisesTable).where(and(
    eq(exercisesTable.isActive, true),
    eq(exercisesTable.movementPattern, removedRow.movementPattern ?? ""),
    eq(exercisesTable.mainMuscleGroup, removedRow.mainMuscleGroup),
  ));
  const toEx = (r: (typeof pool)[number]): SwapExercise => ({ ...r, equipment: r.equipment ?? [] });
  const chosen = pickSwap(pool.map(toEx), {
    level: plan.level, trainerId, removed: toEx(removedRow), inPlan: new Set(slots.map((s) => s.exerciseId)),
    avoided: new Set(survey?.avoidedExerciseIds ?? []),
    compatible: (c) => {
      const full = pool.find((p) => p.id === c.id)!;
      return filter({ id: full.id, trainingLocation: full.trainingLocation ?? [], equipment: full.equipment ?? [], requiredEquipmentAll: full.requiredEquipmentAll ?? [], jointStressAreas: full.jointStressAreas });
    },
    ladderAllowed: ladder.allowed,
    plyo: { goal: survey?.trainingGoal ?? null, jumpExperience: survey?.jumpExperience ?? null },
  });

  if (chosen) {
    await db.transaction(async (tx) => {
      await tx.update(workoutPlanExercisesTable).set({ exerciseId: chosen.id }).where(eq(workoutPlanExercisesTable.id, planExerciseId));
      await tx.insert(planChangeLogTable).values({
        planId, trainerId, kind: "zamiana_auto", planExerciseId, fromExerciseId: removedRow.id, fromExerciseName: removedRow.name,
        toExerciseId: chosen.id, toExerciseName: chosen.name, details: "inne ćwiczenie na to samo miejsce (ten sam wzorzec, filtry bezpieczeństwa)",
      });
      await tx.update(workoutPlansTable).set({ updatedAt: new Date() }).where(eq(workoutPlansTable.id, planId));
    });
    return { ok: true, outcome: "replaced", from: { id: removedRow.id, name: removedRow.name }, to: { id: chosen.id, name: chosen.name } };
  }
  if (!removeIfNone) return { ok: false, code: "NO_OPTION" };
  await db.transaction(async (tx) => {
    await tx.delete(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.id, planExerciseId));
    await tx.insert(planChangeLogTable).values({
      planId, trainerId, kind: "usuniecie_brak_zamiennika", planExerciseId, fromExerciseId: removedRow.id, fromExerciseName: removedRow.name,
      details: "brak innego bezpiecznego ćwiczenia — miejsce puste do ręcznego wyboru",
    });
    await tx.update(workoutPlansTable).set({ updatedAt: new Date() }).where(eq(workoutPlansTable.id, planId));
  });
  return { ok: true, outcome: "removed", from: { id: removedRow.id, name: removedRow.name } };
}
