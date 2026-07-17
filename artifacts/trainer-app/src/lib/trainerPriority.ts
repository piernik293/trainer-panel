/**
 * Trainer Selection Priority — Stage 3 (Exercise Priority Engine)
 *
 * Pure module: no Auto Fill knowledge, no ScoreTuple knowledge.
 * Single responsibility: compute the trainer-preference rank for one exercise.
 *
 * A lower rank means the trainer would prefer this exercise to be selected
 * first when two candidates produce identical volume outcomes.
 *
 * Formula:  TIER_BASE[getSessionTier(input)] + getPriorityRank(exercisePriority)
 *
 * Range: 0 (primary_compound + Bardzo wysoki)  …  43 (core_finisher + Niski)
 *
 * Missing metadata falls back to the existing helpers' safe defaults:
 *   - getSessionTier  → "accessory"   → base 20
 *   - getPriorityRank → 2 (medium)
 *   → default rank: 22
 */

import { getSessionTier, getPriorityRank, type SessionTier } from "./exerciseClassification";

// ─── Tier base ordinals ───────────────────────────────────────────────────────

/**
 * Base ordinal for each session tier.
 * Explicit 10-point spacing leaves room for getPriorityRank sub-ranking (0–3)
 * without tiers overlapping.
 */
const TIER_BASE: Record<SessionTier, number> = {
  primary_compound:   0,
  secondary_compound: 10,
  accessory:          20,
  isolation:          30,
  core_finisher:      40,
};

// ─── Input type ───────────────────────────────────────────────────────────────

/**
 * Minimum metadata required to compute a trainer selection rank.
 * All fields are optional — missing values use the classification helpers'
 * existing safe defaults.
 */
export interface TrainerPriorityInput {
  readonly exerciseType?: string | null;
  readonly neurologicalFatigue?: number | null;
  readonly mainMuscleGroup?: string | null;
  readonly exercisePriority?: string | null;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Return the trainer selection rank for one exercise.
 *
 * Used as the fifth element (index 4) of the Auto Fill ScoreTuple.
 * Lower rank → stronger trainer preference → selected first when all volume
 * scores (ScoreTuple indices 0–3) are equal.
 */
export function trainerPriorityRank(input: TrainerPriorityInput): number {
  const tier = getSessionTier(input);
  const priorityRank = getPriorityRank(input.exercisePriority);
  return TIER_BASE[tier] + priorityRank;
}
