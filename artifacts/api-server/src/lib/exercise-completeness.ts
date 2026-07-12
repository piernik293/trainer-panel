/**
 * Exercise completeness — shared logic used by both the exercise CRUD routes
 * and the recommendation engine.
 *
 * Keeping this in its own module avoids circular imports and lets future
 * systems (AI plan generation, substitution engine) query completeness without
 * importing from a route file.
 */

import { inArray, count, sql } from "drizzle-orm";
import { db, exercisesTable, exerciseMuscleAssignmentsTable } from "@workspace/db";

export type ExerciseRow = typeof exercisesTable.$inferSelect;
export type MuscleStats = { total: number; primaryCount: number };

/** Compute isComplete + missingFields for a single exercise given its muscle stats. */
export function computeCompleteness(
  exercise: ExerciseRow,
  stats: MuscleStats | undefined,
): { isComplete: boolean; missingFields: string[] } {
  const missing: string[] = [];

  if (!exercise.movementPattern) missing.push("Wzorzec ruchowy");
  if (!exercise.difficultyLevel) missing.push("Poziom trudności");
  if (!exercise.equipment || exercise.equipment.length === 0) missing.push("Sprzęt");
  if (!exercise.trainingLocation || exercise.trainingLocation.length === 0) missing.push("Miejsce treningu");
  if (!exercise.exerciseType) missing.push("Typ ćwiczenia");
  if (!exercise.description) missing.push("Opis ćwiczenia");
  if (!exercise.executionInstructions) missing.push("Instrukcje wykonania");
  if (!exercise.commonMistakes) missing.push("Częste błędy");
  if (!exercise.coachingTips) missing.push("Wskazówki trenerskie");

  if (!stats || stats.total === 0) {
    missing.push("Przypisanie mięśni");
  } else if (stats.primaryCount === 0) {
    missing.push("Główny mięsień");
  }

  const hasIntelligence =
    (exercise.suitableExperienceLevels?.length ?? 0) > 0 ||
    (exercise.trainingGoals?.length ?? 0) > 0 ||
    !!exercise.movementCategory ||
    !!exercise.jointStress ||
    !!exercise.exercisePriority;
  if (!hasIntelligence) missing.push("Inteligencja ćwiczenia");

  return { isComplete: missing.length === 0, missingFields: missing };
}

/** Fetch muscle-assignment aggregate stats for a set of exercise IDs in one query. */
export async function fetchMuscleStats(exerciseIds: number[]): Promise<Map<number, MuscleStats>> {
  if (exerciseIds.length === 0) return new Map();

  const rows = await db
    .select({
      exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
      total: count(exerciseMuscleAssignmentsTable.id),
      primaryCount: sql<number>`count(case when ${exerciseMuscleAssignmentsTable.isPrimary} = true then 1 end)::int`,
    })
    .from(exerciseMuscleAssignmentsTable)
    .where(inArray(exerciseMuscleAssignmentsTable.exerciseId, exerciseIds))
    .groupBy(exerciseMuscleAssignmentsTable.exerciseId);

  const map = new Map<number, MuscleStats>();
  for (const row of rows) {
    map.set(row.exerciseId, {
      total: Number(row.total),
      primaryCount: Number(row.primaryCount),
    });
  }
  return map;
}
