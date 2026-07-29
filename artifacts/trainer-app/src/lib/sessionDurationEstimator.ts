/**
 * Pure, independently tested session-duration estimator for the auto-fill generator.
 *
 * Formula (Stage 7A clarification):
 *
 *   sessionDuration
 *     = warmUpSeconds
 *     + Σᵢ [ Sᵢ × SECS_PER_SET_EXECUTION + (Sᵢ − 1) × restSecondsᵢ ]
 *     + max(0, N − 1) × TRANSITION_SECONDS
 *
 * where N = total exercise count, Sᵢ = working sets for exercise i.
 *
 * When all exercises share the same rest duration R (the common case — all
 * auto-filled exercises receive DRAFT_EXERCISE_DEFAULTS.restSeconds = 90 s,
 * and existing exercises without per-exercise data use the same documented
 * fallback), the per-exercise sum telescopes to:
 *
 *   Σᵢ [ Sᵢ × 60 + (Sᵢ − 1) × R ]
 *   = totalSets × 60 + (totalSets − N) × R
 *
 * "No rest after the final set of an exercise" is built into (Sᵢ − 1) × R.
 *
 * All constants are named and sourced below; nothing is silently assumed.
 */

/**
 * Session-duration constants — every value is either specified by the Stage 7A
 * clarification or derived from an existing documented system default.
 */
export const SESSION_DURATION_SPEC = {
  /**
   * Execution time per working set in seconds.
   * Source: Stage 7A clarification — "number of working sets × 60 seconds of exercise execution".
   */
  SECS_PER_SET_EXECUTION: 60,

  /**
   * Setup/transition time between consecutive exercises in seconds.
   * Source: Stage 7A clarification — "add 60 seconds of transition/setup time between exercises".
   */
  TRANSITION_SECONDS: 60,

  /**
   * Session warm-up duration fallback in seconds.
   * Aligned with workoutDurationEstimator.ts — both estimators use 10 minutes.
   * Source: agreed rule — mandatory 10-minute warm-up applies to all sessions.
   */
  WARMUP_FALLBACK_SECONDS: 600,

  /**
   * Rest duration per inter-set interval fallback in seconds.
   * Source: DRAFT_EXERCISE_DEFAULTS.restSeconds (exerciseDraftHelpers.ts line 80).
   * This is the actual rest time applied to every exercise created by the auto-fill
   * generator, so it is not an approximation for auto-filled exercises.
   * Also used as a fallback for existing exercises whose individual rest times are
   * not available at the selectExercisesForDay call site (only aggregate set counts
   * are passed in — existingExerciseCount / existingSetCount).
   */
  REST_SECONDS_FALLBACK: 90,

  /**
   * Hard session-duration cap in seconds.
   * Exactly MAX_SESSION_SECONDS is ACCEPTED (strict greater-than comparison).
   * Any value strictly above is REJECTED.
   * 3600 s = 10-min mandatory warm-up + 50-min maximum main workout.
   * Source: agreed Brak aktywności fizycznej rule.
   */
  MAX_SESSION_SECONDS: 3600,
} as const;

/**
 * Returns the estimated total session duration in seconds.
 *
 * @param totalExercises  Total exercise count (existing + auto-filled).
 * @param totalSets       Total working-set count (existing + auto-filled).
 * @param restSeconds     Rest duration per inter-set interval.
 *                        Defaults to SESSION_DURATION_SPEC.REST_SECONDS_FALLBACK (90 s).
 * @param warmUpSeconds   Warm-up duration. Pass the plan day's actual warm-up when
 *                        available; otherwise the documented fallback of 300 s is used.
 *                        Defaults to SESSION_DURATION_SPEC.WARMUP_FALLBACK_SECONDS (300 s).
 */
export function estimateSessionDurationSeconds(
  totalExercises: number,
  totalSets: number,
  restSeconds: number = SESSION_DURATION_SPEC.REST_SECONDS_FALLBACK,
  warmUpSeconds: number = SESSION_DURATION_SPEC.WARMUP_FALLBACK_SECONDS,
): number {
  if (totalExercises <= 0 || totalSets <= 0) return warmUpSeconds;

  const { SECS_PER_SET_EXECUTION, TRANSITION_SECONDS } = SESSION_DURATION_SPEC;

  // Execution: every set costs SECS_PER_SET_EXECUTION (60 s)
  const executionTime = totalSets * SECS_PER_SET_EXECUTION;
  // Rest: (S − 1) intervals per exercise, no rest after the final set.
  // With uniform rest: Σ(Sᵢ − 1) × R = (totalSets − N) × R
  const restTime = (totalSets - totalExercises) * restSeconds;
  // Transition: one gap between each pair of consecutive exercises
  const transitionTime = Math.max(0, totalExercises - 1) * TRANSITION_SECONDS;

  return warmUpSeconds + executionTime + restTime + transitionTime;
}

/**
 * Returns true when the projected session duration strictly exceeds the hard
 * 2700-second cap (45 minutes).  Exactly 2700 s returns false (accepted).
 *
 * Parameters match estimateSessionDurationSeconds.
 */
export function exceedsSessionCap(
  totalExercises: number,
  totalSets: number,
  restSeconds?: number,
  warmUpSeconds?: number,
): boolean {
  return (
    estimateSessionDurationSeconds(totalExercises, totalSets, restSeconds, warmUpSeconds) >
    SESSION_DURATION_SPEC.MAX_SESSION_SECONDS
  );
}
