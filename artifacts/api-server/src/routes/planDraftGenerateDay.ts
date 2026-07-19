/**
 * Plan-Draft Generate Day — HTTP route
 *
 * POST /api/clients/:clientId/plan-draft/generate-day
 *
 * True empty-session generator: builds a complete training day from scratch
 * using ExerciseSelectionEngineV0.  Unlike the day-recommendations endpoint
 * (which continues an already-started session via alreadyAdded), this route
 * starts with ZERO selected exercises and fills all slots in one call.
 *
 * Body (JSON):
 *   { "v0SessionType": "push" | "pull" | "legs" | "upper" | "lower" }
 *
 * Generation guarantees:
 *   - usedExerciseIds is created empty at session start
 *   - no alreadyAdded seed is accepted or required
 *   - equipment / location hard filters applied (same as recommendations route)
 *   - avoided exercises excluded
 *   - V0 slot structure enforced (core last, no near-duplicates, etc.)
 *   - returns 422 when required slots cannot be filled
 *
 * The OLD autofill path (GET .../day-recommendations) is completely unchanged.
 *
 * Response:
 *   { hasProfile, hasLocationData, sessionType, exercises: DayRecommendationExercise[] }
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import {
  isLocationCompatible,
  isEquipmentCompatible,
  type SubTargetBiases,
} from "../services/planDraftDayRecommendationsService";
import { normalizeMovementCategory } from "../services/planAnalyzer";
import {
  runExerciseSelectionEngineV0,
  type V0SessionType,
  type V0PriorityContext,
} from "../services/ExerciseSelectionEngineV0";
import { PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS } from "@workspace/api-zod";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  /**
   * V0 session type — determines which slot template to apply.
   * "push" | "pull" | "legs" | "upper" | "lower"
   */
  v0SessionType: z.enum(["push", "pull", "legs", "upper", "lower"]),
  /**
   * Controlled variety index (optional, default 0).
   *
   * 0 = stable default — rank-1 candidate always wins each slot (deterministic).
   * 1 = first alternative — prefer the first pattern-diverse candidate in each slot's band.
   * 2 = second alternative — prefer the second pattern-diverse candidate, etc.
   *
   * Protected main-lift slots draw from a band of 3; accessory slots from a band of 5.
   * Passing any value > 0 produces a structurally identical but exercise-diverse session.
   */
  alternativeIndex: z.number().int().min(0).optional(),
});

router.post(
  "/clients/:clientId/plan-draft/generate-day",
  async (req, res): Promise<void> => {
    // ── Parse + validate inputs ────────────────────────────────────────────────
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = BodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error:
          "v0SessionType is required: push | pull | legs | upper | lower",
      });
      return;
    }

    const { clientId } = params.data;
    const { v0SessionType } = body.data;

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

    // ── Fetch all active exercises ─────────────────────────────────────────────
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

    // ── Build scored pool — equipment + location hard filters applied ──────────
    //
    // KEY DIFFERENCE from the recommendations route:
    //   alreadyAddedIds is intentionally absent — the pool includes ALL eligible
    //   exercises; deduplication happens inside V0 via usedExerciseIds (empty).
    const pool = [];
    for (const ex of completeExercises) {
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
        exerciseType: ex.exerciseType ?? null,
        neurologicalFatigue: ex.neurologicalFatigue ?? null,
        learningDifficulty: ex.learningDifficulty ?? null,
        exercisePriority: ex.exercisePriority ?? null,
        movementPattern: ex.movementPattern ?? null,
        movementCategoryKey: normalizeMovementCategory(
          ex.movementPattern ?? null,
          ex.movementCategory ?? null,
        ),
        subTargetBiases: (ex.subTargetBiases as SubTargetBiases | null) ?? null,
      });
    }

    // Sort by score desc, then name asc (deterministic, same as recommendations route).
    pool.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"));

    // ── Priority context — experience-aware muscle tier assignment ─────────────
    //
    // Builds the V0PriorityContext from survey fields.  Only intermediate and
    // advanced clients get true priority-muscle slot influence (Tier A / B / C).
    // Beginners and inactive clients fall back to balanced general-development
    // sorting (isPriorityEligible = false → sortDeterministic inside V0).
    const isPriorityEligible =
      !!survey.experienceLevel &&
      PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS.has(survey.experienceLevel);

    const priorityContext: V0PriorityContext = {
      isPriorityEligible,
      tierA: survey.priorityMuscle1 ? [survey.priorityMuscle1] : [],
      tierB: [survey.priorityMuscle2, survey.priorityMuscle3].filter(
        (v): v is string => v !== null && v !== undefined && v.trim() !== "",
      ),
    };

    // ── TRUE EMPTY-SESSION START ───────────────────────────────────────────────
    //
    // usedExerciseIds begins completely empty — no pre-seeded exercises,
    // no alreadyAdded, no continuation of a prior session.
    // V0 fills every slot from scratch.
    const usedExerciseIds = new Set<string>();

    console.log("SESSION_START: empty");
    console.log(`DAY_TYPE: ${v0SessionType}`);
    console.log(`USED_EXERCISE_IDS: []`);

    // ── Run V0 slot-based generator ────────────────────────────────────────────
    const alternativeIndex = body.data.alternativeIndex ?? 0;
    const v0Result = runExerciseSelectionEngineV0(
      pool,
      v0SessionType as V0SessionType,
      usedExerciseIds,
      priorityContext,
      { alternativeIndex },
    );

    if (!v0Result.valid) {
      res.status(422).json({
        error: v0Result.error,
        hasProfile: true,
        hasLocationData,
        sessionType: v0SessionType,
        exercises: [],
      });
      return;
    }

    console.log(
      `SESSION_COMPLETE: ${v0Result.exercises.length} exercises selected for ${v0SessionType.toUpperCase()}`,
    );

    res.json({
      hasProfile: true,
      hasLocationData,
      sessionType: v0SessionType,
      exercises: v0Result.exercises,
    });
  },
);

export default router;
