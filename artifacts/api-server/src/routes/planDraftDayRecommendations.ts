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
 *   broadCategories  — comma-separated muscle broad-category names for the day
 *                      (e.g. "Klatka piersiowa,Plecy").  Maps directly to
 *                      exercise.mainMuscleGroup values.
 *   alreadyAdded     — comma-separated exercise IDs already in this day.
 *                      Excluded from results (same exercise may still be used
 *                      on a different day).
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
 *
 *   hasLocationData = false when training location or equipment is missing from
 *   the survey — caller should surface the "missing data" warning to the trainer.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, clientsTable, surveysTable, exercisesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import {
  isLocationCompatible,
  isEquipmentCompatible,
  selectDayRecommendations,
  type ScoredAndFilteredExercise,
} from "../services/planDraftDayRecommendationsService";

const router: IRouter = Router();

const MAX_PER_TARGET = 3;
const MAX_TOTAL = 8;

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const QuerySchema = z.object({
  broadCategories: z.string().optional(),
  alreadyAdded: z.string().optional(),
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

    // hasLocationData = both training location AND equipment are present in survey.
    // When false the UI should warn that recommendations are not filtered.
    const hasLocationData =
      !!(survey.trainingLocation?.trim()) && !!(survey.equipment?.trim());

    // Avoided exercise IDs are stored as an integer array on the survey row.
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
      // Exclude exercises already added to this day (same exercise may appear on other days).
      if (alreadyAddedIds.has(ex.id)) continue;

      // Hard-exclude exercises incompatible with the client's training location.
      if (!isLocationCompatible(ex.trainingLocation ?? [], survey.trainingLocation)) continue;

      // Hard-exclude exercises incompatible with the client's available equipment.
      if (!isEquipmentCompatible(ex.equipment ?? [], survey.equipment)) continue;

      // Delegate scoring entirely to the existing engine — no scoring logic here.
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
        // Avoided status is metadata only — does NOT change the score.
        isAvoided: avoidedExerciseIds.has(ex.id),
      });
    }

    // Sort pool by score descending, then name ascending (deterministic).
    pool.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"));

    // ── Select, deduplicate, and limit ─────────────────────────────────────────
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
