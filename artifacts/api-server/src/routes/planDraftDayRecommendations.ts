/**
 * Plan-Draft Day Recommendations — HTTP route
 *
 * GET /api/clients/:clientId/plan-draft/day-recommendations
 *
 * Thin adapter over the existing Exercise Recommendation Engine (scoreExercise).
 * All scoring is delegated to the existing engine; all selection/deduplication
 * logic is delegated to planDraftDayRecommendationsService.
 *
 * Query params:
 *   broadCategories     — comma-separated muscle broad-category names for the day.
 *                         Used when uncoveredTargetIds is absent (backward-compat).
 *   alreadyAdded        — comma-separated exercise IDs already in this day.
 *   uncoveredTargetIds  — (Phase 4B3) comma-separated volumeTarget IDs that still
 *                         need volume on this day. When present, replaces the
 *                         broadCategories matching with exact targetId matching.
 *   includeCore         — (Phase 4B3) "true" to include Core / brzuch exercises.
 *
 * Automatic hard exclusions (no trainer configuration required):
 *   - inactive exercises (DB filter)
 *   - incomplete exercises (completeness check)
 *   - location-incompatible exercises (when survey.trainingLocation is set)
 *   - equipment-incompatible exercises (when survey.equipment is set)
 *   - already-added exercises for this day
 *
 * Response:
 *   { hasProfile, hasLocationData, exercises: DayRecommendationExercise[] }
 */

import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
  exerciseMuscleAssignmentsTable,
  volumeTargetMembersTable,
  volumeTargetsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import {
  isLocationCompatible,
  isEquipmentCompatible,
  selectDayRecommendations,
  selectByUncoveredTargets,
  type ScoredAndFilteredExercise,
  type ExerciseWithCoveredTargets,
  type UncoveredTargetNeed,
} from "../services/planDraftDayRecommendationsService";
import { normalizeMovementCategory } from "../services/planAnalyzer";

const router: IRouter = Router();

const MAX_PER_TARGET = 3;
const MAX_TOTAL = 8;

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const QuerySchema = z.object({
  broadCategories: z.string().optional(),
  alreadyAdded: z.string().optional(),
  /** Phase 4B3: comma-separated volumeTarget IDs still needing volume. */
  uncoveredTargetIds: z.string().optional(),
  /** Phase 4B3: include Core / brzuch exercises. */
  includeCore: z.string().optional(),
});

router.get(
  "/clients/:clientId/plan-draft/day-recommendations",
  async (req, res): Promise<void> => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const query = QuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const { clientId } = params.data;

    const broadCategories = (query.data.broadCategories ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const alreadyAddedIds = new Set<number>(
      (query.data.alreadyAdded ?? "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n)),
    );

    // Phase 4B3 params
    const uncoveredTargetIdsRaw = (query.data.uncoveredTargetIds ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    const includeCoreFlag = query.data.includeCore === "true";

    // ── Verify client ──────────────────────────────────────────────────────────
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));

    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony" });
      return;
    }

    // ── Fetch latest survey ────────────────────────────────────────────────────
    const [survey] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    if (!survey) {
      res.json({ hasProfile: false, hasLocationData: false, exercises: [] });
      return;
    }

    const hasLocationData =
      !!(survey.trainingLocation?.trim()) && !!(survey.equipment?.trim());

    const avoidedExerciseIds = new Set<number>(survey.avoidedExerciseIds ?? []);

    // ── Fetch active exercises (DB hard filter for isActive) ───────────────────
    const exercises = await db
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.isActive, true))
      .orderBy(exercisesTable.name);

    // ── Filter to complete exercises ───────────────────────────────────────────
    const statsMap = await fetchMuscleStats(exercises.map((e) => e.id));
    const completeExercises = exercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      return isComplete;
    });

    // ── Score + apply hard exclusions ──────────────────────────────────────────
    const pool: ScoredAndFilteredExercise[] = [];

    for (const ex of completeExercises) {
      if (alreadyAddedIds.has(ex.id)) continue;
      if (!isLocationCompatible(ex.trainingLocation ?? [], survey.trainingLocation)) continue;
      if (!isEquipmentCompatible(ex.equipment ?? [], survey.equipment)) continue;

      const { score, matchReasons, warnReasons } = scoreExercise(ex, survey);

      pool.push({
        id: ex.id,
        name: ex.name,
        mainMuscleGroup: ex.mainMuscleGroup ?? "",
        secondaryMuscleGroups: ex.secondaryMuscleGroups ?? [],
        equipment: ex.equipment ?? [],
        trainingLocation: ex.trainingLocation ?? [],
        score,
        matchReasons,
        warnReasons,
        isAvoided: avoidedExerciseIds.has(ex.id),
        // Stage 1: classification metadata — already fetched as part of the full
        // exercise row; passed through unchanged so Auto Fill and future engines
        // can consume them without an additional DB query.
        exerciseType: ex.exerciseType ?? null,
        neurologicalFatigue: ex.neurologicalFatigue ?? null,
        learningDifficulty: ex.learningDifficulty ?? null,
        exercisePriority: ex.exercisePriority ?? null,
        movementPattern: ex.movementPattern ?? null,
        // Stage 4: resolve canonical movement category key once at the API boundary.
        movementCategoryKey: normalizeMovementCategory(
          ex.movementPattern ?? null,
          ex.movementCategory ?? null,
        ),
      });
    }

    // Sort pool by score descending, then name ascending (deterministic).
    pool.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"));

    // ── Phase 4B3: Uncovered-target path ───────────────────────────────────────
    // Activate when either specific targets are uncovered OR Core still needs sets.
    // Both conditions can be true simultaneously; either alone is sufficient.
    if (uncoveredTargetIdsRaw.length > 0 || includeCoreFlag) {
      // 1. Fetch specificMuscleId → targetId mapping for uncovered targets only.
      //    Skipped when no normal targets are uncovered (Core-only path).
      //    Guard against inArray([]) which is invalid SQL.
      const targetMemberRows =
        uncoveredTargetIdsRaw.length > 0
          ? await db
              .select({
                specificMuscleId: volumeTargetMembersTable.specificMuscleId,
                volumeTargetId: volumeTargetMembersTable.volumeTargetId,
              })
              .from(volumeTargetMembersTable)
              .where(inArray(volumeTargetMembersTable.volumeTargetId, uncoveredTargetIdsRaw))
          : [];

      const muscleToTargets = new Map<number, Set<number>>();
      for (const row of targetMemberRows) {
        if (!muscleToTargets.has(row.specificMuscleId)) {
          muscleToTargets.set(row.specificMuscleId, new Set());
        }
        muscleToTargets.get(row.specificMuscleId)!.add(row.volumeTargetId);
      }

      // 2. Fetch muscle assignments for pool exercises.
      const poolExerciseIds = pool.map((ex) => ex.id);
      const assignmentRows =
        poolExerciseIds.length > 0
          ? await db
              .select({
                exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
                specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId,
                coefficient: exerciseMuscleAssignmentsTable.coefficient,
              })
              .from(exerciseMuscleAssignmentsTable)
              .where(inArray(exerciseMuscleAssignmentsTable.exerciseId, poolExerciseIds))
          : [];

      // 3. Build exerciseId → Set<uncoveredTargetId> (coefficient > 0 only).
      const exerciseCoveredTargets = new Map<number, Set<number>>();
      for (const row of assignmentRows) {
        const coeff = Number(row.coefficient);
        if (!isFinite(coeff) || coeff <= 0) continue;
        const targets = muscleToTargets.get(row.specificMuscleId);
        if (!targets || targets.size === 0) continue;
        if (!exerciseCoveredTargets.has(row.exerciseId)) {
          exerciseCoveredTargets.set(row.exerciseId, new Set());
        }
        const existing = exerciseCoveredTargets.get(row.exerciseId)!;
        for (const tid of targets) existing.add(tid);
      }

      // 4. Fetch target names for display in matchingTargets badges.
      //    Guard against inArray([]) which is invalid SQL.
      const targetNameRows =
        uncoveredTargetIdsRaw.length > 0
          ? await db
              .select({ id: volumeTargetsTable.id, name: volumeTargetsTable.name })
              .from(volumeTargetsTable)
              .where(inArray(volumeTargetsTable.id, uncoveredTargetIdsRaw))
          : [];
      const targetNameMap = new Map(targetNameRows.map((r) => [r.id, r.name]));

      // 5. Build ordered needs — preserving frontend's priority order.
      const orderedNeeds: UncoveredTargetNeed[] = uncoveredTargetIdsRaw.map((tid, idx) => ({
        targetId: tid,
        targetName: targetNameMap.get(tid) ?? `Target ${tid}`,
        allocationOrder: idx,
      }));

      // 6. Enrich pool and filter to exercises with at least one match.
      const enrichedPool: ExerciseWithCoveredTargets[] = pool
        .filter((ex) => {
          const covered = exerciseCoveredTargets.get(ex.id) ?? new Set<number>();
          const matchesTarget = covered.size > 0;
          const isCore = includeCoreFlag && ex.mainMuscleGroup === "Brzuch";
          return matchesTarget || isCore;
        })
        .map((ex) => ({
          ...ex,
          coveredTargetIds: exerciseCoveredTargets.get(ex.id) ?? new Set<number>(),
        }));

      // 7. Select, deduplicate, and limit.
      const selected = selectByUncoveredTargets(
        enrichedPool,
        orderedNeeds,
        includeCoreFlag,
        MAX_PER_TARGET,
        MAX_TOTAL,
      );

      res.json({ hasProfile: true, hasLocationData, exercises: selected });
      return;
    }

    // ── Original path: broad-category matching ─────────────────────────────────
    const selected = selectDayRecommendations(
      pool,
      broadCategories,
      MAX_PER_TARGET,
      MAX_TOTAL,
    );

    res.json({
      hasProfile: true,
      hasLocationData,
      exercises: selected,
    });
  },
);

export default router;
