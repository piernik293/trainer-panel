/**
 * Session Fatigue Management — Stage 6
 *
 * Pure module: no autoFill state, no ScoreTuple knowledge, no side effects.
 *
 * Computes a soft fatigue penalty for adding a candidate exercise given the
 * exercises already committed to the current session. Stage 6 operates only
 * as a tie-breaker: it is consulted after the existing 8-element ScoreTuple
 * comparison is complete and produces no winner.
 *
 * Overlap weighting:
 *   - Candidate primary  ↔ committed primary:   full weight  (1.0 × NF × sets)
 *   - Candidate primary  ↔ committed secondary:  half weight  (0.5 × NF × sets)
 *   - Candidate secondary ↔ committed primary:   half weight  (0.5 × NF × sets)
 *   - Candidate secondary ↔ committed secondary: quarter weight (0.25 × NF × sets)
 *
 * The accumulated raw load is scaled by the candidate's own neurological
 * fatigue before bucketing into a 0–3 integer penalty.
 *
 * Return value: integer in [0, 3].
 * Lower = preferred (aligns with the ScoreTuple "lower is better" convention).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reduced weight for secondary-muscle overlaps on one side. */
const SECONDARY_WEIGHT = 0.5;

/** Reduced weight when both sides are secondary muscles. */
const SECONDARY_SECONDARY_WEIGHT = SECONDARY_WEIGHT * SECONDARY_WEIGHT; // 0.25

/**
 * Reference NF used to normalise the candidate's own demand.
 * Candidate NF is expressed as a multiple of this reference (NF / NF_REFERENCE)
 * so that NF = 3 → scale factor 1.0 (neutral), NF < 3 → < 1, NF > 3 → > 1.
 */
const NF_REFERENCE = 3;

/**
 * Accumulated scaled-load units required to advance one penalty point.
 * Calibrated so that one high-NF compound (NF = 5, sets = 3) sharing a
 * primary muscle with a low-NF isolation candidate (NF = 2) yields penalty 0,
 * while two matching high-NF compounds yield penalty 1–2.
 *
 * Example reference values (approximate, depends on muscle-data completeness):
 *   Bench Press (NF=5, sets=3) → Cable Fly   (NF=2, same primary):      penalty 0
 *   Bench Press (NF=5, sets=3) → Incline DB  (NF=4, same primary+sec): penalty 2
 *   Squat       (NF=5, sets=3) → Leg Ext     (NF=2, same primary):      penalty 0
 *   RDL         (NF=5, sets=3) → Good Morning (NF=4, same primary+sec): penalty 2
 */
const PENALTY_THRESHOLD = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Case-insensitive, trimmed muscle-group name for comparison. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Minimum candidate metadata required by computeFatiguePenalty.
 * Compatible with AutoFillRecExercise (Stage 6 never imports from autoFill.ts).
 */
export interface FatigueCandidateInput {
  readonly mainMuscleGroup: string;
  readonly secondaryMuscleGroups?: ReadonlyArray<string> | null;
  readonly neurologicalFatigue?: number | null;
}

/**
 * Minimum committed-exercise metadata required by computeFatiguePenalty.
 * Compatible with AutoFillExerciseToAdd.
 */
export interface FatigueCommittedInput {
  readonly mainMuscleGroup: string;
  readonly secondaryMuscleGroups?: ReadonlyArray<string> | null;
  readonly neurologicalFatigue?: number | null;
  readonly sets: number;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Compute a soft fatigue penalty for a candidate exercise given the exercises
 * already committed to the current session.
 *
 * Returns an integer in [0, 3]. Lower is better.
 * Returns 0 immediately when no exercises are committed.
 */
export function computeFatiguePenalty(
  candidate: FatigueCandidateInput,
  committed: ReadonlyArray<FatigueCommittedInput>,
): number {
  if (committed.length === 0) return 0;

  const candidateNF   = candidate.neurologicalFatigue ?? 1;
  const candPrimary   = norm(candidate.mainMuscleGroup);
  const candSecondaries = (candidate.secondaryMuscleGroups ?? []).map(norm);

  let rawLoad = 0;

  for (const ex of committed) {
    const exNF   = ex.neurologicalFatigue ?? 1;
    const load   = exNF * ex.sets;
    const exPrimary     = norm(ex.mainMuscleGroup);
    const exSecondaries = (ex.secondaryMuscleGroups ?? []).map(norm);

    // Case 1: candidate primary ↔ committed primary (strongest overlap)
    if (exPrimary === candPrimary) {
      rawLoad += load;
    }

    // Case 2: candidate primary appears as a secondary of the committed exercise
    if (exSecondaries.includes(candPrimary)) {
      rawLoad += load * SECONDARY_WEIGHT;
    }

    // Cases 3 & 4: candidate secondaries vs committed muscles
    for (const sec of candSecondaries) {
      // Case 3: candidate secondary ↔ committed primary
      if (exPrimary === sec) {
        rawLoad += load * SECONDARY_WEIGHT;
      }
      // Case 4: candidate secondary ↔ committed secondary
      if (exSecondaries.includes(sec)) {
        rawLoad += load * SECONDARY_SECONDARY_WEIGHT;
      }
    }
  }

  // Scale by the candidate's own neurological demand relative to the reference
  const scaledLoad = rawLoad * (candidateNF / NF_REFERENCE);

  return Math.min(3, Math.floor(scaledLoad / PENALTY_THRESHOLD));
}
