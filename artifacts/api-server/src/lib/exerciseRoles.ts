import { or, isNull, notInArray, type SQL } from "drizzle-orm";
import { exercisesTable } from "@workspace/db";

/** Warm-up and stretching exercises are offered only in the warm-up / cool-down of the training flow, never as main plan exercises. */
export const WARMUP_ROLES = ["rozgrzewka", "rozciąganie"] as const;

/** Roles kept out of the main plan: warm-up / stretching, running-technique drills (sport module) and jump preparation (used only by the plyometric block). */
export const NON_MAIN_ROLES = [...WARMUP_ROLES, "technika biegu", "przygotowanie do skoków"] as const;

export function isMainPlanExercise(ex: { role?: string | null }): boolean {
  return !ex.role || !(NON_MAIN_ROLES as readonly string[]).includes(ex.role);
}

/** SQL condition for generator / recommendation pools. */
export function mainPlanRoleCondition(): SQL {
  return or(isNull(exercisesTable.role), notInArray(exercisesTable.role, [...NON_MAIN_ROLES]))!;
}

const ADVANCED_LEVELS = ["Średniozaawansowany", "Zaawansowany"];

/** Difficulty of an exercise: BA 0, P 1, Ś 2, Z 3. The highest difficulty a client may get: BA and P → "Początkujący". */
const DIFFICULTY_RANK: Record<string, number> = { "Brak aktywności fizycznej": 0, "Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3 };
const MAX_DIFFICULTY_FOR_LEVEL: Record<string, number> = { "Brak aktywności fizycznej": 1, "Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3 };
/** True when the exercise is harder than the level allows. Unknown level or unknown difficulty → false (other filters decide). */
export function exceedsLevel(difficulty: string | null | undefined, effectiveLevel: string | null | undefined): boolean {
  const d = difficulty ? DIFFICULTY_RANK[difficulty] : undefined;
  const max = effectiveLevel ? MAX_DIFFICULTY_FOR_LEVEL[effectiveLevel] : undefined;
  return d !== undefined && max !== undefined && d > max;
}

/**
 * Generator pool safety for imported / reviewed status (owner's decision 25.10.2026):
 *  - hidden exercises are never used (never deleted);
 *  - exercises not yet reviewed by the trainer (imports) only for effective level intermediate / advanced;
 *  - plyometrics (intensity set) never for "Brak aktywności" / beginner; intensity "wysoka" only for advanced.
 * Manual adding by the trainer is not affected (this runs on generator pools only).
 */
export function isGeneratorSafe(
  ex: { hidden?: boolean | null; reviewedByTrainer?: boolean | null; intensity?: string | null; difficultyLevel?: string | null },
  effectiveLevel: string | null | undefined,
): boolean {
  if (ex.hidden) return false;
  // Owner's decision 50b (28.10.2026): an exercise's own difficulty never exceeds the client's effective level
  // (BA and P = "Początkujący", Ś up to "Średniozaawansowany", Z everything). Manual adding by the trainer is not affected.
  if (exceedsLevel(ex.difficultyLevel, effectiveLevel)) return false;
  const advancedEnough = !!effectiveLevel && ADVANCED_LEVELS.includes(effectiveLevel);
  if (ex.reviewedByTrainer === false && !advancedEnough) return false;
  if (ex.intensity) {
    if (!advancedEnough) return false;
    if (ex.intensity === "wysoka" && effectiveLevel !== "Zaawansowany") return false;
  }
  return true;
}

/**
 * Variants (owner's decision 25.10.2026): the generator takes the main exercise by default and a variant only when the main
 * exercise is not usable for this client (equipment of the place, a joint to spare, level, hidden…). `list` is the pool after all
 * compatibility filters, so "the parent is in the list" means "the parent fits".
 */
export function preferMainOverVariants<T extends { id: number; parentExerciseId?: number | null }>(list: readonly T[]): T[] {
  const ids = new Set(list.map((e) => e.id));
  return list.filter((e) => e.parentExerciseId == null || !ids.has(e.parentExerciseId));
}
