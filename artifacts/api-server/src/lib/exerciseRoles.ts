import { or, isNull, notInArray, type SQL } from "drizzle-orm";
import { exercisesTable } from "@workspace/db";

/** Warm-up and stretching exercises are offered only in the warm-up / cool-down of the training flow, never as main plan exercises. */
export const WARMUP_ROLES = ["rozgrzewka", "rozciąganie"] as const;

export function isMainPlanExercise(ex: { role?: string | null }): boolean {
  return !ex.role || !(WARMUP_ROLES as readonly string[]).includes(ex.role);
}

/** SQL condition for generator / recommendation pools. */
export function mainPlanRoleCondition(): SQL {
  return or(isNull(exercisesTable.role), notInArray(exercisesTable.role, [...WARMUP_ROLES]))!;
}

const ADVANCED_LEVELS = ["Średniozaawansowany", "Zaawansowany"];

/**
 * Generator pool safety for imported / reviewed status (owner's decision 25.10.2026):
 *  - hidden exercises are never used (never deleted);
 *  - exercises not yet reviewed by the trainer (imports) only for effective level intermediate / advanced;
 *  - plyometrics (intensity set) never for "Brak aktywności" / beginner; intensity "wysoka" only for advanced.
 * Manual adding by the trainer is not affected (this runs on generator pools only).
 */
export function isGeneratorSafe(
  ex: { hidden?: boolean | null; reviewedByTrainer?: boolean | null; intensity?: string | null },
  effectiveLevel: string | null | undefined,
): boolean {
  if (ex.hidden) return false;
  const advancedEnough = !!effectiveLevel && ADVANCED_LEVELS.includes(effectiveLevel);
  if (ex.reviewedByTrainer === false && !advancedEnough) return false;
  if (ex.intensity) {
    if (!advancedEnough) return false;
    if (ex.intensity === "wysoka" && effectiveLevel !== "Zaawansowany") return false;
  }
  return true;
}
