/**
 * Movement Balance — Stage 4
 *
 * Pure helper for within-session movement pattern balancing.
 * No Auto Fill knowledge. No ScoreTuple knowledge.
 *
 * Lower penalty = pattern is underrepresented = preferred.
 */

/**
 * Returns the number of exercises already committed in this day for the same
 * movement category as the candidate exercise.
 *
 * 0 = pattern not yet used this day (maximum preference among same-score candidates).
 * 1 = one exercise of this pattern already committed.
 * 2 = two exercises, etc.
 *
 * null/undefined movementCategoryKey → returns 0 (neutral; no penalty for unknown pattern).
 */
export function movementPatternPenalty(
  movementCategoryKey: string | null | undefined,
  patternsAddedThisDay: ReadonlyMap<string, number>,
): number {
  if (!movementCategoryKey) return 0;
  return patternsAddedThisDay.get(movementCategoryKey) ?? 0;
}
