/**
 * Workout-day duration estimator (trainer plan editor).
 *
 * Formula per day:
 *   estimatedTotal =
 *     10 min mandatory warm-up
 *     + Σ sets_i × midpointReps_i × secondsPerRep_i    (working time)
 *     + Σ (sets_i − 1) × restSeconds_i                 (inter-set rest, no rest after final set)
 *     + Σ setupSeconds_i                               (per-exercise setup / transition)
 *
 * Tempo interpretation:
 *   "3-1-1-0" → 3+1+1+0 = 5 s/rep
 *   "2-0-X-0" → X treated as 1 for estimation → 2+0+1+0 = 3 s/rep
 *   fallback (no tempo, no default assignable) → 4 s/rep
 *
 * This module is DISTINCT from sessionDurationEstimator.ts (which uses a
 * simpler per-set formula for the auto-fill session cap check) and must not
 * replace it.
 */

import type { DraftExercise, ExerciseClass } from "./exerciseDraftHelpers";

export const WORKOUT_DURATION_SPEC = {
  /** Mandatory warm-up: 10 minutes, cannot be configured to zero. */
  WARMUP_SECONDS: 600,
  /** Fallback seconds-per-rep when no tempo can be resolved. */
  FALLBACK_SECONDS_PER_REP: 4,
} as const;

/**
 * Default tempo string for an exercise class and experience level.
 * Applied only when the exercise has no stored tempo — never overwrites
 * a trainer-set value.
 *
 * Mapping:
 *   plyometric_power                      → "2-0-X-0"  (explosive concentric)
 *   regression_beginner / Brak aktywności → "3-1-2-0"  (slow, technique focus)
 *   main_compound                         → "2-0-1-0"  (strength pattern)
 *   everything else                       → "3-1-1-0"  (general hypertrophy)
 */
export function getDefaultTempo(
  exerciseClass: ExerciseClass | undefined,
  experienceLevel: string | null | undefined,
): string {
  if (exerciseClass === "plyometric_power") return "2-0-X-0";
  if (
    experienceLevel === "Brak aktywności fizycznej" ||
    exerciseClass === "regression_beginner"
  ) return "3-1-2-0";
  if (exerciseClass === "main_compound") return "2-0-1-0";
  return "3-1-1-0";
}

/**
 * Parse a tempo string into seconds per rep.
 * "X" is treated as 1 second for duration estimation only.
 *
 * @returns { secondsPerRep, isFallback: true } when the tempo cannot be parsed.
 */
export function parseTempoSeconds(tempo: string | undefined): {
  secondsPerRep: number;
  isFallback: boolean;
} {
  if (!tempo) {
    return { secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP, isFallback: true };
  }
  const chars = tempo.toUpperCase().replace(/-/g, "").split("");
  if (chars.length !== 4) {
    return { secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP, isFallback: true };
  }
  let total = 0;
  for (const ch of chars) {
    if (ch === "X") { total += 1; continue; }
    const n = parseInt(ch, 10);
    if (isNaN(n)) {
      return { secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP, isFallback: true };
    }
    total += n;
  }
  return { secondsPerRep: total, isFallback: false };
}

/**
 * Setup / transition time per exercise based on class.
 *
 * isolation / core / regression_beginner → 30 s  (simple machine, minimal setup)
 * secondary_compound                     → 45 s  (accessory / dumbbell)
 * main_compound / plyometric_power       → 60 s  (barbell / complex setup)
 * unknown                                → 45 s
 */
export function getSetupSeconds(exerciseClass: ExerciseClass | undefined): number {
  switch (exerciseClass) {
    case "isolation":
    case "core":
    case "regression_beginner":
      return 30;
    case "secondary_compound":
      return 45;
    case "main_compound":
    case "plyometric_power":
      return 60;
    default:
      return 45;
  }
}

export interface WorkoutDayDurationResult {
  warmupMinutes: number;
  workingMinutes: number;
  restingMinutes: number;
  setupTransitionMinutes: number;
  estimatedTotalMinutes: number;
  availableMinutes: number | null;
  /** Positive minutes over the available duration; null when within or no target set. */
  exceededByMinutes: number | null;
  /** Colour status relative to available duration. "no_target" when none is set. */
  status: "green" | "orange" | "red" | "no_target";
  /** True when any exercise had to use the 4 s/rep fallback because tempo was unresolvable. */
  hasFallbackTempo: boolean;
}

/**
 * Derive the `ExerciseClass` for an exercise using its catalogue metadata.
 *
 * Mirrors the server's `deriveExerciseClass` logic in recommendation-engine.ts.
 * Use this on the frontend wherever the full Exercise object is available to
 * populate `exerciseClass` on newly added draft exercises.
 *
 * Priority order (first match wins):
 *   1. suitableForNoActivity flag  → "regression_beginner"
 *   2. Brzuch muscle group         → "core"
 *   3. exerciseType = "Izolowane"  → "isolation"
 *   4. movementCategory/Key contains "plyomet" → "plyometric_power"
 *   5. exerciseType = "Złożone" + priority Bardzo wysoki/Wysoki → "main_compound"
 *   6. exerciseType = "Złożone"    → "secondary_compound"
 *   7. fallback                    → "secondary_compound"
 *
 * All inputs are optional/nullable — always returns a valid ExerciseClass.
 */
export function deriveExerciseClass(input: {
  exerciseType?: string | null;
  exercisePriority?: string | null;
  mainMuscleGroup?: string | null;
  /** Raw DB movementCategory value (e.g. "Plyometryczne"). */
  movementCategory?: string | null;
  /** Canonical movement-category key resolved by autoFill (e.g. "plyometryczne"). */
  movementCategoryKey?: string | null;
  /** True for exercises tagged "suitable for no-activity" clients. */
  suitableForNoActivity?: boolean | null;
}): ExerciseClass {
  if (input.suitableForNoActivity === true) return "regression_beginner";

  const mg = (input.mainMuscleGroup ?? "").trim().toLowerCase();
  if (mg === "brzuch") return "core";

  const et = (input.exerciseType ?? "").toLowerCase();
  if (et === "izolowane") return "isolation";

  const mc = (input.movementCategory ?? "").toLowerCase();
  const mck = (input.movementCategoryKey ?? "").toLowerCase();
  if (mc.includes("plyomet") || mck.includes("plyomet")) return "plyometric_power";

  if (et === "złożone") {
    const pri = input.exercisePriority;
    if (pri === "Bardzo wysoki" || pri === "Wysoki") return "main_compound";
    return "secondary_compound";
  }

  return "secondary_compound"; // functional / unlabelled fallback
}

/**
 * Estimate total workout-day duration from the exercise draft.
 *
 * Colour rules:
 *   green  — estimatedTotal ≤ availableMinutes
 *   orange — 1–10 min over
 *   red    — more than 10 min over
 *
 * The function never silently removes exercises, reduces sets, or changes tempo.
 *
 * @param exercises             Exercises for this day.
 * @param sessionDurationMinutes Available session duration from the interview
 *                               (null/undefined when not set).
 * @param experienceLevel       Client experience level (drives default tempo).
 */
export function estimateWorkoutDayDuration(
  exercises: DraftExercise[],
  sessionDurationMinutes: number | null | undefined,
  experienceLevel: string | null | undefined,
): WorkoutDayDurationResult {
  let workingSeconds = 0;
  let restingSeconds = 0;
  let setupSeconds = 0;
  let hasFallbackTempo = false;

  for (const ex of exercises) {
    const midpoint = (ex.repsMin + ex.repsMax) / 2;
    const resolvedTempo =
      ex.tempo ?? getDefaultTempo(ex.exerciseClass, experienceLevel);
    const { secondsPerRep, isFallback } = parseTempoSeconds(resolvedTempo);
    if (isFallback) hasFallbackTempo = true;

    workingSeconds += ex.sets * midpoint * secondsPerRep;
    restingSeconds += Math.max(0, ex.sets - 1) * ex.restSeconds;
    setupSeconds += getSetupSeconds(ex.exerciseClass);
  }

  const totalSeconds =
    WORKOUT_DURATION_SPEC.WARMUP_SECONDS + workingSeconds + restingSeconds + setupSeconds;

  const warmupMinutes = WORKOUT_DURATION_SPEC.WARMUP_SECONDS / 60; // always 10
  const workingMinutes = Math.round(workingSeconds / 60);
  const restingMinutes = Math.round(restingSeconds / 60);
  const setupTransitionMinutes = Math.round(setupSeconds / 60);
  const estimatedTotalMinutes = Math.round(totalSeconds / 60);

  const availableMinutes = sessionDurationMinutes ?? null;
  let exceededByMinutes: number | null = null;
  let status: WorkoutDayDurationResult["status"] = "no_target";

  if (availableMinutes !== null) {
    const diff = estimatedTotalMinutes - availableMinutes;
    exceededByMinutes = diff > 0 ? diff : null;
    if (estimatedTotalMinutes <= availableMinutes) {
      status = "green";
    } else if (diff <= 10) {
      status = "orange";
    } else {
      status = "red";
    }
  }

  return {
    warmupMinutes,
    workingMinutes,
    restingMinutes,
    setupTransitionMinutes,
    estimatedTotalMinutes,
    availableMinutes,
    exceededByMinutes,
    status,
    hasFallbackTempo,
  };
}
