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
