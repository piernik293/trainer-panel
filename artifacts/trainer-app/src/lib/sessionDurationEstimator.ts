/**
 * Session Duration Estimator — Stage 7A
 *
 * Provides a deterministic estimate of session duration used as a safety gate
 * in the auto-fill generator.
 *
 * Formula (all quantities per working set or per exercise):
 *
 *   estimatedSeconds =
 *       SESSION_WARMUP_SECONDS
 *     + totalSets × (SECS_PER_REP × REPS_PER_SET + REST_SECONDS_PER_SET)
 *     + max(0, totalExercises − 1) × TRANSITION_SECONDS_BETWEEN_EXERCISES
 *
 * ─── Sources ─────────────────────────────────────────────────────────────────
 * Two constants are sourced from existing system defaults:
 *
 *   REST_SECONDS_PER_SET (90)
 *     Source: DRAFT_EXERCISE_DEFAULTS.restSeconds in exerciseDraftHelpers.ts.
 *     Every exercise added by auto-fill uses this value as its rest prescription
 *     unless the trainer manually overrides it. Not an assumption.
 *
 *   REPS_PER_SET (10)
 *     Source: midpoint of DRAFT_EXERCISE_DEFAULTS (repsMin=8, repsMax=12).
 *     Auto-fill exercises are committed with these rep defaults.
 *     Not an assumption — derived from the actual committed defaults.
 *
 * ─── Estimation assumptions (no data source in current model) ────────────────
 * Three constants cannot be derived from data in the current data model. They are
 * named here so they are visible, discoverable, and easily replaced:
 *
 *   SECS_PER_REP (3)
 *     Assumption: 3 seconds per repetition (≈2 s eccentric + 1 s concentric).
 *     The exercises table has a `tempo` column but it is NOT surfaced in
 *     AutoFillRecExercise. When per-exercise tempo data is added to the
 *     recommendation API response, this constant should be retired.
 *
 *   SESSION_WARMUP_SECONDS (300)
 *     Assumption: 5-minute general warm-up at session start.
 *     No warm-up time field exists in the current data model.
 *
 *   TRANSITION_SECONDS_BETWEEN_EXERCISES (60)
 *     Assumption: 60-second average transition between exercises
 *     (equipment adjustment, brief mobilisation, movement setup).
 *     No transition-time field exists in the current data model.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * All duration-estimation constants in one place.
 *
 * Fields marked "From defaults" are sourced from DRAFT_EXERCISE_DEFAULTS.
 * Fields marked "Assumption" have no data-model source — they are documented
 * estimates that should be replaced once the data model supports them.
 */
export const DURATION_ESTIMATE_ASSUMPTIONS = {
  // ─── From DRAFT_EXERCISE_DEFAULTS ─────────────────────────────────────────

  /**
   * Rest between working sets, in seconds.
   * From: DRAFT_EXERCISE_DEFAULTS.restSeconds (exerciseDraftHelpers.ts).
   */
  REST_SECONDS_PER_SET: 90,

  /**
   * Repetitions per working set for active-time estimation.
   * From: midpoint of DRAFT_EXERCISE_DEFAULTS.repsMin=8 and repsMax=12.
   */
  REPS_PER_SET: 10,

  // ─── Estimation assumptions ───────────────────────────────────────────────

  /**
   * Seconds per repetition.
   * Assumption: 3 s (≈2 s eccentric + 1 s concentric) for simple compound
   * exercises typical of a "Brak aktywności fizycznej" programme.
   * Data required to remove: `tempo` field in AutoFillRecExercise.
   */
  SECS_PER_REP: 3,

  /**
   * Seconds added once at session start for a general warm-up.
   * Assumption: 5 minutes (300 s).
   * Data required to remove: a per-session warm-up time field in the data model.
   */
  SESSION_WARMUP_SECONDS: 300,

  /**
   * Seconds between consecutive exercises (setup, brief mobilisation).
   * Assumption: 60 s.
   * Data required to remove: a per-exercise transition-time field.
   */
  TRANSITION_SECONDS_BETWEEN_EXERCISES: 60,
} as const;

// ─── Estimators ───────────────────────────────────────────────────────────────

/**
 * Returns the estimated session duration in seconds.
 *
 * Uses DURATION_ESTIMATE_ASSUMPTIONS for all constants.
 *
 * @param totalExercises  Total committed exercises (existing + auto-filled).
 * @param totalSets       Total committed working sets (existing + auto-filled).
 */
export function estimateSessionDurationSeconds(
  totalExercises: number,
  totalSets: number,
): number {
  const {
    REST_SECONDS_PER_SET,
    REPS_PER_SET,
    SECS_PER_REP,
    SESSION_WARMUP_SECONDS,
    TRANSITION_SECONDS_BETWEEN_EXERCISES,
  } = DURATION_ESTIMATE_ASSUMPTIONS;

  const activeSeconds  = totalSets * REPS_PER_SET * SECS_PER_REP;
  const restSeconds    = totalSets * REST_SECONDS_PER_SET;
  const transitionSecs = Math.max(0, totalExercises - 1) * TRANSITION_SECONDS_BETWEEN_EXERCISES;

  return SESSION_WARMUP_SECONDS + activeSeconds + restSeconds + transitionSecs;
}

/**
 * Returns the estimated session duration in minutes (decimal).
 */
export function estimateSessionDurationMinutes(
  totalExercises: number,
  totalSets: number,
): number {
  return estimateSessionDurationSeconds(totalExercises, totalSets) / 60;
}
