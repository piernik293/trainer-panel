/**
 * Core / brzuch coverage — pure helpers (no React, no DB).
 *
 * "Brzuch" is the reliable, DB-level exercise classification.
 * It comes from exercises.mainMuscleGroup (set when an exercise is created in
 * the Library), NOT from exercise-name matching.
 *
 * The auxiliaryCoreBlock stores direct set allocations, so Core coverage is
 * expressed in raw working sets — not in effective-set points.
 */

import type { DraftExercise, ExerciseDraftByDay } from "./exerciseDraftHelpers";
import type { AuxiliaryCoreBlockType } from "@workspace/api-zod";

/** The canonical DB value for the Core / abdominal muscle group. */
export const CORE_MUSCLE_GROUP = "Brzuch" as const;

/**
 * Returns true when an exercise is a direct Core / abdominal exercise.
 * Uses the DB-level mainMuscleGroup field — never exercise-name matching.
 *
 * Does NOT count incidental trunk stabilization from compound lifts
 * (squats, deadlifts, presses, rows) because those exercises have a
 * different mainMuscleGroup (e.g. "Mięśnie czworogłowe uda", "Plecy").
 */
export function isCoreExercise(ex: DraftExercise): boolean {
  return ex.mainMuscleGroup === CORE_MUSCLE_GROUP;
}

/**
 * Count the actual working sets dedicated to Core work for one workout day.
 * Counts only exercises where mainMuscleGroup === "Brzuch".
 */
export function countCoreActualSetsForDay(exercises: DraftExercise[]): number {
  return exercises
    .filter(isCoreExercise)
    .reduce((sum, ex) => sum + ex.sets, 0);
}

/**
 * Count the total actual Core working sets across the whole week.
 */
export function countCoreWeeklySets(exerciseDraft: ExerciseDraftByDay): number {
  return Object.values(exerciseDraft)
    .flat()
    .filter(isCoreExercise)
    .reduce((sum, ex) => sum + ex.sets, 0);
}

/**
 * Get the planned Core sets for one workout day from the auxiliaryCoreBlock.
 * Returns 0 when no Core allocation is defined for that day.
 */
export function getCorePlanForDay(
  auxiliaryCoreBlock: AuxiliaryCoreBlockType,
  dayIndex: number,
): number {
  return auxiliaryCoreBlock.dayAllocations.find((a) => a.dayIndex === dayIndex)?.sets ?? 0;
}

// ─── Polish pluralization for sets ────────────────────────────────────────────

/**
 * Returns a Polish-correct plural form for a count of series (sets).
 * Examples: 1 → "1 seria", 2–4 → "2 serie", 5+ → "5 serii"
 */
export function pluralizeSets(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 1) return `1 seria`;
  if (abs >= 2 && abs <= 4) return `${n} serie`;
  return `${n} serii`;
}

/**
 * Returns a Polish-correct "Pozostała/Pozostało" phrase for Core sets.
 */
export function formatCoreRemaining(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 1) return `Pozostała: 1 seria`;
  if (abs >= 2 && abs <= 4) return `Pozostało: ${n} serie`;
  return `Pozostało: ${n} serii`;
}
