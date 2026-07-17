/**
 * Exercise Classification Foundation — Stage 1 (Exercise Priority Engine)
 *
 * Pure module: no API calls, no database access, no React, no side effects.
 *
 * Provides:
 *   - Canonical Polish string constants for DB-stored enumerated values.
 *   - A narrow classification input type (not a general exercise model).
 *   - Deterministic helpers: getFatigueBand, getPriorityRank,
 *     isHighDemandExercise, getSessionTier.
 *   - An optional combined classifyExercise() helper.
 *
 * Stage 1 constraints:
 *   - movementPattern is carried through as a future extension point only.
 *     It is NOT used in any tier derivation here.
 *   - Classification output is NOT yet used for exercise scoring or ordering.
 *   - All helpers must return a safe default when inputs are missing or invalid.
 */

// ─── Canonical database value constants ────────────────────────────────────────

/**
 * Canonical values for the `exercise_type` column.
 * Use these constants instead of duplicating the Polish string literals.
 */
export const EXERCISE_TYPE = {
  COMPOUND:  "Złożone",
  ISOLATION: "Izolowane",
} as const;

export type ExerciseTypeName = (typeof EXERCISE_TYPE)[keyof typeof EXERCISE_TYPE];

/**
 * Canonical values for the `exercise_priority` column.
 * Use these constants instead of duplicating the Polish string literals.
 */
export const EXERCISE_PRIORITY = {
  VERY_HIGH: "Bardzo wysoki",
  HIGH:      "Wysoki",
  MEDIUM:    "Średni",
  LOW:       "Niski",
} as const;

export type ExercisePriorityName = (typeof EXERCISE_PRIORITY)[keyof typeof EXERCISE_PRIORITY];

// ─── Classification input type ────────────────────────────────────────────────

/**
 * Narrow input type built from existing exercise metadata fields.
 * All fields are optional/nullable so callers without complete data are safe.
 *
 * Do NOT extend this with unrelated exercise fields.
 * Do NOT use this as a general exercise model or DB row type.
 */
export interface ExerciseClassificationInput {
  /** Maps to DB `exercise_type`. "Złożone" | "Izolowane" or null. */
  exerciseType?: string | null;
  /** Maps to DB `neurological_fatigue`. Integer 1–5 or null. */
  neurologicalFatigue?: number | null;
  /** Maps to DB `learning_difficulty`. Integer 1–5 or null. */
  learningDifficulty?: number | null;
  /** Maps to DB `exercise_priority`. Polish priority string or null. */
  exercisePriority?: string | null;
  /**
   * Maps to DB `movement_pattern`.
   * Passed through as an extension point for Stage 2+.
   * Not used in any tier derivation in Stage 1.
   */
  movementPattern?: string | null;
  /** Maps to DB `main_muscle_group`. Used to identify core exercises. */
  mainMuscleGroup?: string | null;
}

// ─── Output types ──────────────────────────────────────────────────────────────

/** Fatigue/demand band derived from neurological_fatigue. */
export type FatigueBand = "high" | "medium" | "low";

/**
 * Session position tier for an exercise.
 *
 * Tiers represent early-to-late order within a session:
 *   primary_compound → secondary_compound → accessory → isolation → core_finisher
 *
 * Stage 1 defines and classifies tiers.
 * Stage 2+ will use them to influence exercise ordering and selection.
 */
export type SessionTier =
  | "primary_compound"
  | "secondary_compound"
  | "accessory"
  | "isolation"
  | "core_finisher";

// ─── Internal constants ────────────────────────────────────────────────────────

/**
 * Main muscle group strings that identify a core or abdominal exercise.
 * Calves and other low-fatigue finishers are intentionally excluded.
 */
const CORE_MAIN_MUSCLE_GROUPS = new Set<string>(["Brzuch"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a fatigue band from a neurological_fatigue score (1–5).
 *
 * Rules:
 *   4–5 → "high"
 *   2–3 → "medium"
 *   1   → "low"
 *   null / undefined / non-finite / out-of-range → "medium"
 */
export function getFatigueBand(neurologicalFatigue: number | null | undefined): FatigueBand {
  if (
    typeof neurologicalFatigue !== "number" ||
    !Number.isFinite(neurologicalFatigue) ||
    neurologicalFatigue < 1 ||
    neurologicalFatigue > 5
  ) {
    return "medium";
  }
  if (neurologicalFatigue >= 4) return "high";
  if (neurologicalFatigue >= 2) return "medium";
  return "low"; // neurologicalFatigue === 1
}

/**
 * Convert an exercise priority string to a numeric rank.
 * Lower rank = higher programming priority (placed / trained first).
 *
 * Rules:
 *   "Bardzo wysoki" → 0
 *   "Wysoki"        → 1
 *   "Średni"        → 2
 *   "Niski"         → 3
 *   missing / unknown / differently cased → 2 (treated as medium priority)
 */
export function getPriorityRank(exercisePriority: string | null | undefined): number {
  switch (exercisePriority) {
    case EXERCISE_PRIORITY.VERY_HIGH: return 0;
    case EXERCISE_PRIORITY.HIGH:      return 1;
    case EXERCISE_PRIORITY.MEDIUM:    return 2;
    case EXERCISE_PRIORITY.LOW:       return 3;
    default:                          return 2;
  }
}

/**
 * Returns true when the exercise is compound AND has high neurological
 * fatigue (≥ 4). Identifies exercises that should open a session.
 *
 * Returns false conservatively when any required input is missing.
 */
export function isHighDemandExercise(input: ExerciseClassificationInput): boolean {
  return (
    input.exerciseType === EXERCISE_TYPE.COMPOUND &&
    typeof input.neurologicalFatigue === "number" &&
    Number.isFinite(input.neurologicalFatigue) &&
    input.neurologicalFatigue >= 4
  );
}

/**
 * Derive the session tier for an exercise.
 *
 * Rules (applied in order — first match wins):
 *   1. Recognized core/abdominal mainMuscleGroup          → "core_finisher"
 *   2. Compound + neurological_fatigue ≥ 4               → "primary_compound"
 *   3. Other recognized compound exercise                 → "secondary_compound"
 *   4. Recognized isolation exercise                      → "isolation"
 *   5. Missing, unknown, or unclassified                  → "accessory"
 *
 * Constraints:
 *   - Calves are NOT classified as core_finisher.
 *   - movementPattern is not consulted in Stage 1.
 *   - Exercise names are never used for classification.
 *   - All-null/all-missing input returns "accessory".
 */
export function getSessionTier(input: ExerciseClassificationInput): SessionTier {
  // Rule 1: recognized core/abdominal muscle group → core_finisher
  const mg = input.mainMuscleGroup?.trim() ?? "";
  if (mg.length > 0 && CORE_MAIN_MUSCLE_GROUPS.has(mg)) {
    return "core_finisher";
  }

  // Rules 2–3: compound exercises
  if (input.exerciseType === EXERCISE_TYPE.COMPOUND) {
    if (
      typeof input.neurologicalFatigue === "number" &&
      Number.isFinite(input.neurologicalFatigue) &&
      input.neurologicalFatigue >= 4
    ) {
      return "primary_compound";
    }
    return "secondary_compound";
  }

  // Rule 4: isolation exercises
  if (input.exerciseType === EXERCISE_TYPE.ISOLATION) {
    return "isolation";
  }

  // Rule 5: missing or unknown classification → safe middle tier
  return "accessory";
}

// ─── Combined classification result ───────────────────────────────────────────

/** All derived classification values for one exercise. Immutable. */
export interface ExerciseClassification {
  readonly sessionTier:   SessionTier;
  readonly fatigueBand:   FatigueBand;
  readonly priorityRank:  number;
  readonly isHighDemand:  boolean;
}

/**
 * Compute all classification values in one call.
 * Use when all four values are needed to avoid repeated helper calls.
 */
export function classifyExercise(input: ExerciseClassificationInput): ExerciseClassification {
  return {
    sessionTier:  getSessionTier(input),
    fatigueBand:  getFatigueBand(input.neurologicalFatigue),
    priorityRank: getPriorityRank(input.exercisePriority),
    isHighDemand: isHighDemandExercise(input),
  };
}
