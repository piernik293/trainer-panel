/**
 * Exercise Session Ordering — Stage 2 (Exercise Priority Engine)
 *
 * Pure module: no API calls, no database access, no React, no side effects.
 *
 * Responsibility: ordering rules for exercises within a single training session.
 * Classification logic (tiers, fatigue bands, priority ranks) lives in
 * exerciseClassification.ts and is imported here — never duplicated.
 *
 * Stage 2 ordering rules:
 *   1. Session tier     (primary_compound → secondary_compound → accessory → isolation → core_finisher)
 *   2. Neurological fatigue   descending (higher demand earlier)
 *   3. Exercise priority rank ascending  (lower rank = higher priority = earlier)
 *   4. Learning difficulty    descending (more technical earlier)
 *   5. Original array index   ascending  (stable deterministic tie-breaker)
 *
 * Not yet active (Stage 3+):
 *   - movement-pattern balancing
 *   - priority-muscle placement
 *   - weekly volume optimisation
 *   - weighted AI scoring
 */

import { getSessionTier, getPriorityRank, type SessionTier } from "./exerciseClassification";

// ─── Tier ordinal map ─────────────────────────────────────────────────────────

/**
 * Maps each SessionTier to a numeric sort key.
 * Lower number → earlier in the session.
 */
const TIER_ORDER: Record<SessionTier, number> = {
  primary_compound:   0,
  secondary_compound: 1,
  accessory:          2,
  isolation:          3,
  core_finisher:      4,
};

// ─── Ordering input contract ──────────────────────────────────────────────────

/**
 * Minimum classification fields required to determine session order.
 * All fields are optional — missing values trigger safe fallbacks defined in
 * exerciseClassification.ts (getSessionTier → "accessory", getPriorityRank → 2).
 */
export interface ExerciseOrderingInput {
  readonly exerciseType?: string | null;
  readonly neurologicalFatigue?: number | null;
  readonly learningDifficulty?: number | null;
  readonly exercisePriority?: string | null;
  readonly mainMuscleGroup?: string | null;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Return a new array with exercises sorted in trainer-like session order.
 *
 * The input array is never mutated.
 * The output contains exactly the same elements — only their order changes.
 *
 * Comparator priority (first difference wins):
 *   1. Session tier      — ascending by TIER_ORDER (compound first, core last)
 *   2. neurologicalFatigue — descending (higher = earlier; null treated as 0)
 *   3. getPriorityRank() — ascending  (lower rank = higher priority = earlier)
 *   4. learningDifficulty  — descending (higher = earlier; null treated as 0)
 *   5. Original index    — ascending  (deterministic stable tie-breaker)
 *
 * Generic over T so the caller keeps the full concrete type of each element.
 */
export function orderExercisesForSession<T extends ExerciseOrderingInput>(
  exercises: ReadonlyArray<T>,
): T[] {
  // Capture original indices before any reordering.
  const indexed = exercises.map((ex, idx) => ({ ex, idx }));

  indexed.sort((a, b) => {
    // 1. Session tier
    const tierA = TIER_ORDER[getSessionTier(a.ex)];
    const tierB = TIER_ORDER[getSessionTier(b.ex)];
    if (tierA !== tierB) return tierA - tierB;

    // 2. Neurological fatigue — descending (null → 0)
    const fatA = a.ex.neurologicalFatigue ?? 0;
    const fatB = b.ex.neurologicalFatigue ?? 0;
    if (fatB !== fatA) return fatB - fatA;

    // 3. Exercise priority rank — ascending (lower rank = higher priority)
    const prA = getPriorityRank(a.ex.exercisePriority);
    const prB = getPriorityRank(b.ex.exercisePriority);
    if (prA !== prB) return prA - prB;

    // 4. Learning difficulty — descending (null → 0)
    const ldA = a.ex.learningDifficulty ?? 0;
    const ldB = b.ex.learningDifficulty ?? 0;
    if (ldB !== ldA) return ldB - ldA;

    // 5. Original index — ascending (stable deterministic tie-breaker)
    return a.idx - b.idx;
  });

  return indexed.map(({ ex }) => ex);
}
