/**
 * Exercise Recommendations — REST endpoint
 *
 * GET /clients/:clientId/exercise-recommendations
 *
 * Returns complete + active exercises scored against the client's latest survey
 * profile, sorted by descending score.
 *
 * Architecture note
 * -----------------
 * This route is intentionally thin: all business logic lives in
 * `../lib/recommendation-engine`. The route is responsible only for:
 *   1. Fetching the client + latest survey from the DB.
 *   2. Fetching the eligible exercise pool (isActive + isComplete).
 *   3. Delegating scoring to the engine.
 *   4. Applying optional post-score filters (mainMuscleGroup, limit).
 *   5. Serialising the response.
 *
 * FUTURE: AI plan-generation engine can call `scoreExercise` directly on its
 * own exercise pool without going through HTTP — no changes to this file needed.
 */

import { mainPlanRoleCondition } from "../lib/exerciseRoles";
import { withEffectiveLevel } from "../lib/effectiveLevel";
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, clientsTable, surveysTable, exercisesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ListExerciseRecommendationsResponse } from "@workspace/api-zod";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import { buildCompatibilityFilter } from "../services/planDraftDayRecommendationsService";
const router: IRouter = Router();

const RecommendationsParams = z.object({
  clientId: z.coerce.number().int().positive(),
});

const RecommendationsQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  mainMuscleGroup: z.string().optional(),
});

router.get("/clients/:clientId/exercise-recommendations", requireAuth, async (req, res): Promise<void> => {
  const params = RecommendationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = RecommendationsQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { clientId } = params.data;
  const { limit = 30, mainMuscleGroup } = query.data;

  // Verify the client belongs to the authenticated trainer.
  const [client] = await db
    .select({ id: clientsTable.id, experienceLevelOverride: clientsTable.experienceLevelOverride })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  // Fetch the latest survey.
  const [rawSurvey] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, clientId))
    .orderBy(desc(surveysTable.createdAt))
    .limit(1);
  // The generator works on the effective level (2-year rule, trainer override).
  const survey = rawSurvey ? withEffectiveLevel(rawSurvey, client.experienceLevelOverride) : undefined;

  if (!survey) {
    res.json(
      ListExerciseRecommendationsResponse.parse({
        clientId,
        hasProfile: false,
        exercises: [],
      }),
    );
    return;
  }

  // Fetch all active exercises.
  const conditions = [eq(exercisesTable.isActive, true)];
  if (mainMuscleGroup) {
    conditions.push(eq(exercisesTable.mainMuscleGroup, mainMuscleGroup));
  }

  const exercises = await db
    .select()
    .from(exercisesTable)
    .where(and(...conditions, mainPlanRoleCondition()))
    .orderBy(exercisesTable.name);

  // Compute completeness for all exercises in one DB round-trip.
  const statsMap = await fetchMuscleStats(exercises.map((e) => e.id));

  // Filter to complete-only exercises.
  // FUTURE: AI plan generation engine should use the same filter before
  // building its exercise pool to ensure only ready exercises are used.
  const completeExercises = exercises.filter((ex) => {
    const stats = statsMap.get(ex.id);
    const { isComplete } = computeCompleteness(ex, stats);
    return isComplete;
  });

  // Missing equipment is deliberately handled as bodyweight-only by the shared
  // compatibility filter. Recommendations must never imply that an undeclared
  // barbell, machine, or bench is available.
  const isCompatible = buildCompatibilityFilter(
    survey.trainingLocation,
    survey.equipment,
    new Set<number>(),
  );
  const compatibleExercises = completeExercises.filter((ex) =>
    isCompatible({
      id: ex.id,
      trainingLocation: ex.trainingLocation ?? [],
      equipment: ex.equipment ?? [],
      requiredEquipmentAll: ex.requiredEquipmentAll ?? [],
    }),
  );

  // Score each exercise against the client's survey profile.
  const scored = compatibleExercises
    .map((ex) => {
      const { score, matchReasons, warnReasons } = scoreExercise(ex, survey);
      return {
        id: ex.id,
        name: ex.name,
        mainMuscleGroup: ex.mainMuscleGroup,
        secondaryMuscleGroups: ex.secondaryMuscleGroups,
        equipment: ex.equipment,
        trainingLocation: ex.trainingLocation,
        difficultyLevel: ex.difficultyLevel ?? null,
        exerciseType: ex.exerciseType ?? null,
        movementPattern: ex.movementPattern ?? null,
        exercisePriority: ex.exercisePriority ?? null,
        score,
        matchReasons,
        warnReasons,
      };
    })
    // Sort by score descending; break ties alphabetically.
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"))
    .slice(0, limit);

  res.json(
    ListExerciseRecommendationsResponse.parse({
      clientId,
      hasProfile: true,
      exercises: scored,
    }),
  );
});

export default router;
