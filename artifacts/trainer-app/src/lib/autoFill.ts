/**
 * Whole Plan Auto-Fill — Phase 4F (Safe Allocation)
 *
 * Key changes from Phase 4E:
 *   - Set counts restricted to ALLOWED_SET_COUNTS = [2, 3, 4].
 *     Auto-fill never assigns 1, 5, or 6 working sets.
 *     Set preference: 3 (best) → 4 → 2.
 *   - Volume-based target resolution: a target is resolved only when
 *     accumulated weekly volume ≥ weeklyPreferredCeiling − RESOLVE_TOLERANCE.
 *     Selecting an exercise does NOT automatically mark its target as resolved.
 *   - Multi-pass selection: the outer loop continues finding the globally best
 *     (target, candidate, sets) triple until no safe improvement is possible.
 *   - Every affected targetId evaluated: evaluateCandidate checks the entire
 *     contribution vector, not only the primary target.
 *   - Daily redistribution limit: auto-fill may not raise any target's daily
 *     effective volume more than +2 above the Step 3 analytical allocation.
 *   - No contribution vector → candidate excluded (no fallback assignment).
 *   - Unresolved-target diagnostics: every unresolved target receives a reason.
 *   - Final whole-plan backend guard: the complete proposed draft is sent through
 *     POST /api/plans/volume-preview before applying. Any violation → proposal
 *     discarded, draft unchanged.
 */

import { CORE_MUSCLE_GROUP } from "./coreCoverageHelpers";
import type { ExerciseDraftByDay } from "./exerciseDraftHelpers";
import { trainerPriorityRank } from "./trainerPriority";
import { movementPatternPenalty } from "./movementBalance";
import { computeFatiguePenalty } from "./fatigueManagement";
import { estimateSessionDurationSeconds } from "./sessionDurationEstimator";

// ─── Safety limits ─────────────────────────────────────────────────────────────

export const MAX_DAY_EXERCISES = 8;
export const MAX_DAY_SETS = 24;

/**
 * The only working-set counts auto-fill may assign.
 * 1, 5, and 6 are explicitly forbidden.
 */
export const ALLOWED_SET_COUNTS = [2, 3, 4] as const;
type AllowedSets = 2 | 3 | 4;

const OVERSHOOT_TOLERANCE = 0.5;
/** A target is volume-resolved when weekly is within this margin of its ceiling. */
const RESOLVE_TOLERANCE = 0.5;
/** Maximum positive effective-volume deviation above Step 3 daily allocation. */
const DAILY_MAX_POSITIVE_DEVIATION = 2.0;

// ─── Diagnostic reasons ────────────────────────────────────────────────────────

export type AutoFillUnresolvedReason =
  | "NO_RECOMMENDATIONS_RETURNED"
  | "NO_EXACT_CONTRIBUTION_VECTOR"
  | "ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT"
  | "EQUIPMENT_OR_LOCATION_FILTERED"
  | "EXPERIENCE_FILTERED"
  | "AVOIDED_EXERCISE_FILTERED"
  | "NO_SAFE_2_3_4_SET_OPTION"
  | "DAILY_REDISTRIBUTION_LIMIT_REACHED";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface AutoFillDayTarget {
  targetId: number;
  targetName: string;
  /** Present on unresolved targets only. */
  diagnosticReason?: AutoFillUnresolvedReason;
}

export interface AutoFillRecExercise {
  id: number;
  name: string;
  mainMuscleGroup: string;
  matchingTargets: string[];
  matchingTargetIds: number[];
  equipment: string[];
  isAvoided: boolean;
  // ── Stage 1: classification metadata (all optional — existing fixtures remain valid) ──
  /** Maps to DB `exercise_type`. "Złożone" | "Izolowane" or null. */
  exerciseType?: string | null;
  /** Maps to DB `neurological_fatigue`. Integer 1–5 or null. */
  neurologicalFatigue?: number | null;
  /** Maps to DB `learning_difficulty`. Integer 1–5 or null. */
  learningDifficulty?: number | null;
  /** Maps to DB `exercise_priority`. Polish priority string or null. */
  exercisePriority?: string | null;
  /** Maps to DB `movement_pattern`. Extension point for Stage 2+. */
  movementPattern?: string | null;
  /** Stage 4: canonical movement category key ("push"|"pull"|"squat"|"hinge"|...) resolved by the API. */
  movementCategoryKey?: string | null;
  /** Stage 6: secondary muscle groups for session fatigue tie-breaking. */
  secondaryMuscleGroups?: string[] | null;
}

export interface AutoFillExerciseToAdd {
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  equipment: string[];
  isCore: boolean;
  /** Always 2, 3, or 4 (a member of ALLOWED_SET_COUNTS). */
  sets: number;
  // ── Stage 2: classification metadata for session ordering ─────────────────
  /** Maps to DB `exercise_type`. "Złożone" | "Izolowane" or null. */
  exerciseType?: string | null;
  /** Maps to DB `neurological_fatigue`. Integer 1–5 or null. */
  neurologicalFatigue?: number | null;
  /** Maps to DB `learning_difficulty`. Integer 1–5 or null. */
  learningDifficulty?: number | null;
  /** Maps to DB `exercise_priority`. Polish priority string or null. */
  exercisePriority?: string | null;
  /** Stage 6: secondary muscle groups for session fatigue tie-breaking. */
  secondaryMuscleGroups?: string[] | null;
}

export interface AutoFillDayResult {
  dayIndex: number;
  toAdd: AutoFillExerciseToAdd[];
  resolvedTargets: AutoFillDayTarget[];
  /** Every entry has a diagnosticReason. */
  unresolvedTargets: AutoFillDayTarget[];
  coreAdded: boolean;
  limitHit: boolean;
}

export interface AutoFillSummary {
  totalAdded: number;
  daysUpdated: number;
  daysCovered: number;
  resolvedTargets: AutoFillDayTarget[];
  unresolvedTargets: AutoFillDayTarget[];
  coreAddedCount: number;
  limitWarnings: string[];
}

export interface RunAutoFillDayInput {
  dayIndex: number;
  broadCategories: string[];
  orderedTargets: AutoFillDayTarget[];
  coreEligible: boolean;
  existingExerciseCount: number;
  existingSetCount: number;
  alreadyAddedExerciseIds: number[];
  /**
   * Step 3 daily analytical allocations for this day.
   * targetId → allocatedVolume (effective sets).
   * Used to enforce the +2 positive-deviation redistribution limit.
   */
  step3DailyAllocations: ReadonlyMap<number, number>;
  // ── Stage 7A: per-level overrides ─────────────────────────────────────────
  /**
   * Requested recommendation candidate pool size sent to the API.
   * When undefined the API uses its own default (MAX_TOTAL = 8).
   * Server enforces a maximum of 30.
   */
  poolSize?: number;
  /**
   * Maximum exercises that may be added to this session (existing + auto-filled).
   * When undefined defaults to MAX_DAY_EXERCISES (8).
   */
  maxDayExercises?: number;
  /**
   * Restrict working-set assignments to this subset of ALLOWED_SET_COUNTS.
   * When undefined defaults to ALLOWED_SET_COUNTS ([2, 3, 4]).
   * Applied to expansion, core selection, and consolidation.
   */
  allowedSetCounts?: ReadonlyArray<2 | 3 | 4>;
  /**
   * Reject any candidate that would push the estimated session duration
   * (per DURATION_ESTIMATE_ASSUMPTIONS in sessionDurationEstimator.ts)
   * above this limit in minutes. When undefined no duration cap is applied.
   */
  maxSessionMinutes?: number;
  /**
   * Minimum exercises that should be present in this session (existing + auto-filled).
   * The generator attempts to reach this count whenever safe candidates remain.
   * Exercises are only added beyond resolved volume targets when they pass all safety
   * checks and genuinely improve session quality (new movement patterns, uncovered
   * muscle groups). When undefined defaults to 0 (no minimum enforced).
   */
  minDayExercises?: number;
  /**
   * Session type string from the distribution result (e.g. "push", "pull",
   * "lower", "upper", "full_body").
   * Forwarded to buildDayFetchUrl so the recommendation endpoint applies the
   * correct muscle-group boundary filter (upper/lower) — preventing cross-day
   * exercises from entering the gap-fill candidate pool.
   * Full-body and unrecognised types receive no boundary filter (safe fallback).
   */
  dayType?: string | null;
}

export interface AutoFillWeeklyTarget {
  targetId: number;
  effectiveSets: number;
  weeklyPreferredCeiling: number;
  hasGuideline: boolean;
  isManuallyOvershot: boolean;
}

export interface AutoFillDailyMuscle {
  targetId: number;
  effectiveSets: number;
  sessionMax: number;
  isDailyOvershot: boolean;
  contributions: ReadonlyArray<{ exerciseId: number; coefficient: number }>;
}

export interface AutoFillVolumeSnapshot {
  weekly: AutoFillWeeklyTarget[];
  days: ReadonlyArray<{
    dayId: number;
    muscles: AutoFillDailyMuscle[];
  }>;
}

export interface TrialPreviewBody {
  clientId: number;
  days: Array<{
    dayId: number;
    dayName: string | null;
    exercises: Array<{ exerciseEntryId: number; exerciseId: number; workingSets: number }>;
  }>;
}

export interface RunAutoFillInput {
  clientId: number;
  daysToProcess: RunAutoFillDayInput[];
  skippedDayCount: number;
  avoidedExerciseIds: ReadonlySet<number>;
  allDistributionDays: ReadonlyArray<{ dayIndex: number; dayName: string | null }>;
  currentDraft: ExerciseDraftByDay;
  currentPreviewResult: AutoFillVolumeSnapshot;
}

export interface RunAutoFillSuccess {
  ok: true;
  dayResults: AutoFillDayResult[];
  summary: AutoFillSummary;
}

export interface RunAutoFillFailure {
  ok: false;
  error: string;
}

export type RunAutoFillResult = RunAutoFillSuccess | RunAutoFillFailure;

// ─── buildDayFetchUrl ─────────────────────────────────────────────────────────

/**
 * Maps a session-type string (as stored in day.dayType) to the "upper"/"lower"
 * dayType query parameter accepted by the recommendations route.
 *
 * "upper" boundaries: push / pull / upper → upper-body exercises only
 * "lower" boundaries: lower / legs         → lower-body exercises only
 * null:               plyo / full_body* / custom / unknown → no filter applied
 *
 * This prevents a push-day gap-fill from surfacing squat variants, and prevents
 * a lower-day gap-fill from surfacing chest-press candidates.
 */
function mapToDayTypeParam(dayType: string | null | undefined): "upper" | "lower" | null {
  if (!dayType) return null;
  const norm = dayType.trim().toLowerCase();
  if (norm === "push" || norm === "pull" || norm === "upper") return "upper";
  if (norm === "lower" || norm === "legs") return "lower";
  return null; // plyo, full_body, full_body_a, full_body_b, custom → no boundary
}

export function buildDayFetchUrl(
  clientId: number,
  broadCategories: string[],
  uncoveredTargetIds: number[],
  coreEligible: boolean,
  alreadyAddedIds: number[],
  poolSize?: number,
  /** Session-type string from the distribution result (e.g. "push", "lower"). */
  dayType?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("broadCategories", broadCategories.join(","));
  if (alreadyAddedIds.length > 0) {
    params.set("alreadyAdded", alreadyAddedIds.join(","));
  }
  if (uncoveredTargetIds.length > 0) {
    params.set("uncoveredTargetIds", uncoveredTargetIds.join(","));
  }
  if (coreEligible) {
    params.set("includeCore", "true");
  }
  if (poolSize !== undefined) {
    params.set("poolSize", String(poolSize));
  }
  // Enforce session-type muscle-group boundaries in the recommendation pool.
  // Without this, the route uses dayType=null and selectExercise skips the
  // boundary filter — allowing cross-day muscle groups into the candidate pool.
  const dayTypeParam = mapToDayTypeParam(dayType);
  if (dayTypeParam) {
    params.set("dayType", dayTypeParam);
  }
  return `/api/clients/${clientId}/plan-draft/day-recommendations?${params}`;
}

// ─── buildTrialPreviewBody ────────────────────────────────────────────────────

/**
 * Builds a trial preview body with all candidate exercises at workingSets=1.
 * Candidates use exerciseEntryId ≥ 100_000 (unique per day × candidate index).
 */
export function buildTrialPreviewBody(
  clientId: number,
  allDistributionDays: ReadonlyArray<{ dayIndex: number; dayName: string | null }>,
  currentDraft: ExerciseDraftByDay,
  candidatesPerDayIndex: ReadonlyMap<number, ReadonlyArray<{ id: number }>>,
): TrialPreviewBody {
  const days = allDistributionDays.map((day) => {
    const existing = (currentDraft[day.dayIndex] ?? []).map((ex, i) => ({
      exerciseEntryId: (day.dayIndex + 1) * 1000 + i + 1,
      exerciseId: ex.exerciseId,
      workingSets: ex.sets,
    }));
    const candidates = (candidatesPerDayIndex.get(day.dayIndex) ?? []).map((c, i) => ({
      exerciseEntryId: 100_000 + day.dayIndex * 1000 + i + 1,
      exerciseId: c.id,
      workingSets: 1,
    }));
    return { dayId: day.dayIndex + 1, dayName: day.dayName, exercises: [...existing, ...candidates] };
  });
  return { clientId, days };
}

// ─── buildFinalGuardPreviewBody ───────────────────────────────────────────────

/**
 * Builds the complete proposed draft (existing + auto-fill at actual set counts)
 * for the whole-plan backend guard call.
 */
function buildFinalGuardPreviewBody(
  clientId: number,
  allDistributionDays: ReadonlyArray<{ dayIndex: number; dayName: string | null }>,
  currentDraft: ExerciseDraftByDay,
  dayResults: AutoFillDayResult[],
): TrialPreviewBody {
  const proposedByDayIndex = new Map<number, AutoFillExerciseToAdd[]>(
    dayResults.map((r) => [r.dayIndex, r.toAdd]),
  );
  const days = allDistributionDays.map((day) => {
    const existing = (currentDraft[day.dayIndex] ?? []).map((ex, i) => ({
      exerciseEntryId: (day.dayIndex + 1) * 1000 + i + 1,
      exerciseId: ex.exerciseId,
      workingSets: ex.sets,
    }));
    const proposed = (proposedByDayIndex.get(day.dayIndex) ?? []).map((ex, i) => ({
      exerciseEntryId: 200_000 + day.dayIndex * 1000 + i + 1,
      exerciseId: ex.exerciseId,
      workingSets: ex.sets, // actual set count, not 1
    }));
    return { dayId: day.dayIndex + 1, dayName: day.dayName, exercises: [...existing, ...proposed] };
  });
  return { clientId, days };
}

// ─── extractCandidateCoefficients ────────────────────────────────────────────

/**
 * Extracts Map<exerciseId, Map<targetId, coefficient>> from the trial response.
 * Only candidate exercise IDs are extracted; existing-draft exercises are ignored.
 * When the same exercise appears in multiple days, the maximum coefficient is kept.
 */
export function extractCandidateCoefficients(
  trialResponse: AutoFillVolumeSnapshot,
  allCandidateIds: ReadonlySet<number>,
): Map<number, Map<number, number>> {
  const result = new Map<number, Map<number, number>>();
  for (const day of trialResponse.days) {
    for (const muscle of day.muscles) {
      for (const contrib of muscle.contributions) {
        if (!allCandidateIds.has(contrib.exerciseId)) continue;
        if (contrib.coefficient <= 0) continue;
        if (!result.has(contrib.exerciseId)) result.set(contrib.exerciseId, new Map());
        const targetMap = result.get(contrib.exerciseId)!;
        const current = targetMap.get(muscle.targetId) ?? 0;
        if (contrib.coefficient > current) targetMap.set(muscle.targetId, contrib.coefficient);
      }
    }
  }
  return result;
}

// ─── Internal rejection cause ─────────────────────────────────────────────────

type RejectionCause =
  | "no_coeff"
  | "manual_overshoot"
  | "weekly_overshoot"
  | "other_target_overshoot"
  | "daily_session_max"
  | "daily_redistribution";

interface EvalAccepted {
  rejected: false;
  /** Partial score — recRank and varietyPenalty are appended by the caller. */
  partialScore: readonly [number, number, number, number];
}
interface EvalRejected {
  rejected: true;
  cause: RejectionCause;
}

/** Score tuple (8 elements): all lower = better.
 *  [0] numRemainingUnresolved  — fewer unresolved targets wins
 *  [1] totalWeeklyRemaining    — less weekly deficit wins
 *  [2] totalDailyRemaining     — less daily deficit wins
 *  [3] setsPreference          — 3→0, 4→1, 2→2
 *  [4] movementPatternPenalty  — exercises of same category already this day (Stage 4)
 *  [5] trainerPriorityRank     — compound first, higher priority first (Stage 3)
 *  [6] recOriginalRank         — API score + freshness order
 *  [7] varietyPenalty          — 0=fresh, 1=already used in another day
 */
export type ScoreTuple = readonly [number, number, number, number, number, number, number, number];

function scoreBetter(a: ScoreTuple, b: ScoreTuple): boolean {
  for (let i = 0; i < 8; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

/** setsPreference encoding: 3→0 (best), 4→1, 2→2. */
function setsPreference(sets: AllowedSets): number {
  return sets === 3 ? 0 : sets === 4 ? 1 : 2;
}

// ─── ContributionSafetyResult ─────────────────────────────────────────────────

/**
 * Discriminated result returned by checkContributionSafety.
 * Consumed by evaluateCandidate (new-exercise scoring) and
 * findBestConsolidation (set-increase evaluation).
 */
export type ContributionSafetyResult =
  | {
      safe: true;
      numRemainingUnresolved: number;
      totalWeeklyRemaining: number;
      totalDailyRemaining: number;
    }
  | { safe: false; cause: RejectionCause };

// ─── checkContributionSafety ──────────────────────────────────────────────────

/**
 * Shared, action-agnostic contribution safety evaluator.
 *
 * Validates a volume delta against all safety rules:
 *   1. Manual overshoot protection.
 *   2. Weekly ceiling protection (ceiling + 0.5 tolerance).
 *   3. Daily overshoot protection (isDailyOvershot flag).
 *   4. Daily session maximum (sessionMax + 0.5 tolerance).
 *   5. Daily redistribution limit (step3Alloc + 2.0 deviation cap).
 *
 * Also computes numRemainingUnresolved, totalWeeklyRemaining, and
 * totalDailyRemaining, which are consumed by both new-exercise scoring
 * (evaluateCandidate) and consolidation selection (findBestConsolidation).
 *
 * Used by both new-exercise evaluation and consolidation delta evaluation so
 * that all safety rules live in exactly one place.
 */
export function checkContributionSafety(
  effectiveDelta: number,
  coeffs: ReadonlyMap<number, number>,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget>,
  weeklyBaseFn: (id: number) => number,
  dailyContextMap: ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>,
  dailyBaseFn: (id: number) => number,
  step3DailyAllocations: ReadonlyMap<number, number>,
  orderedTargets: ReadonlyArray<AutoFillDayTarget>,
): ContributionSafetyResult {
  let totalWeeklyRemaining = 0;
  let totalDailyRemaining = 0;

  for (const [targetId, coeff] of coeffs) {
    if (coeff <= 0) continue;

    // ── Weekly ────────────────────────────────────────────────────────────────
    const wt = weeklyTargets.get(targetId);
    if (wt?.hasGuideline) {
      if (wt.isManuallyOvershot) {
        return { safe: false, cause: "manual_overshoot" };
      }
      const newWeekly = weeklyBaseFn(targetId) + coeff * effectiveDelta;
      if (newWeekly > wt.weeklyPreferredCeiling + OVERSHOOT_TOLERANCE) {
        const isPrimary = orderedTargets.some((t) => t.targetId === targetId);
        return { safe: false, cause: isPrimary ? "weekly_overshoot" : "other_target_overshoot" };
      }
      totalWeeklyRemaining += Math.max(0, wt.weeklyPreferredCeiling - newWeekly);
    }

    // ── Daily session max ─────────────────────────────────────────────────────
    const dc = dailyContextMap.get(targetId);
    if (dc) {
      if (dc.isDailyOvershot) return { safe: false, cause: "daily_session_max" };
      const newDaily = dailyBaseFn(targetId) + coeff * effectiveDelta;
      if (newDaily > dc.sessionMax + OVERSHOOT_TOLERANCE) return { safe: false, cause: "daily_session_max" };
      totalDailyRemaining += Math.max(0, dc.sessionMax - newDaily);
    }

    // ── Daily redistribution limit ────────────────────────────────────────────
    const step3Alloc = step3DailyAllocations.get(targetId);
    if (step3Alloc !== undefined) {
      const newDaily = dailyBaseFn(targetId) + coeff * effectiveDelta;
      if (newDaily > step3Alloc + DAILY_MAX_POSITIVE_DEVIATION) {
        return { safe: false, cause: "daily_redistribution" };
      }
    }
  }

  // Count targets that would still be unresolved after this delta
  let numRemainingUnresolved = 0;
  for (const target of orderedTargets) {
    const wt = weeklyTargets.get(target.targetId);
    if (!wt?.hasGuideline) continue;
    const coeff = coeffs.get(target.targetId) ?? 0;
    const newWeekly = weeklyBaseFn(target.targetId) + coeff * effectiveDelta;
    if (newWeekly < wt.weeklyPreferredCeiling - RESOLVE_TOLERANCE) numRemainingUnresolved++;
  }

  return { safe: true, numRemainingUnresolved, totalWeeklyRemaining, totalDailyRemaining };
}

// ─── evaluateCandidate ────────────────────────────────────────────────────────

/**
 * Evaluates one (candidate, sets) combination against ALL affected targets.
 *
 * New-exercise-specific rules (hard reject):
 *   1. No contribution vector (empty coeffs map).
 *
 * All other safety rules (manual overshoot, weekly ceiling, daily session max,
 * redistribution limit) are delegated to checkContributionSafety so they are
 * maintained in one place and reused by consolidation evaluation.
 *
 * Returns a partial score (without recRank and varietyPenalty) if accepted.
 */
function evaluateCandidate(
  sets: AllowedSets,
  coeffs: ReadonlyMap<number, number>,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget>,
  weeklyBaseFn: (id: number) => number,
  dailyContextMap: ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>,
  dailyBaseFn: (id: number) => number,
  step3DailyAllocations: ReadonlyMap<number, number>,
  orderedTargets: ReadonlyArray<AutoFillDayTarget>,
): EvalAccepted | EvalRejected {
  // Rule 1: no contribution vector → exclude (new-exercise only)
  if (coeffs.size === 0) return { rejected: true, cause: "no_coeff" };

  const safety = checkContributionSafety(
    sets, coeffs, weeklyTargets, weeklyBaseFn, dailyContextMap, dailyBaseFn,
    step3DailyAllocations, orderedTargets,
  );
  if (!safety.safe) return { rejected: true, cause: safety.cause };

  return {
    rejected: false,
    partialScore: [safety.numRemainingUnresolved, safety.totalWeeklyRemaining, safety.totalDailyRemaining, setsPreference(sets)],
  };
}

// ─── Stage 5: Fragmentation tie-breaker ──────────────────────────────────────

export type FragmentationAction = "EXPAND" | "CONSOLIDATE" | "NO_ACTION";

/**
 * Returns true when the expansion candidate provides a concrete benefit that a
 * consolidation (set increase on an existing exercise) cannot provide.
 *
 * Two concrete advantages are recognised:
 *   1. score[0] — expansion resolves more remaining targets than consolidation would.
 *   2. score[4] — expansion adds a movement category not yet in the session (penalty === 0).
 *
 * This helper is owned by the selection logic, not Stage 5, because it
 * understands ScoreTuple semantics. Stage 5 (resolveFragmentationAction) only
 * receives the boolean result, keeping it free of ScoreTuple knowledge.
 *
 * Indices [1]–[3] and [5]–[7] determined which expansion candidate is best
 * (via scoreBetter); they do not express expansion-vs-consolidation advantage
 * and are not consulted here.
 */
export function hasClearExpansionAdvantage(
  expansion: { score: ScoreTuple },
  consolidation: { numRemainingUnresolved: number },
): boolean {
  // Expansion resolves more volume targets than consolidation would
  if (expansion.score[0] < consolidation.numRemainingUnresolved) return true;
  // Expansion adds a movement category not yet represented in the session
  if (expansion.score[4] === 0) return true;
  return false;
}

/**
 * Stage 5 pure tie-breaker.
 *
 * Receives three booleans and returns one FragmentationAction. Does not
 * know about ScoreTuple, target IDs, movement categories, recommendation
 * rank, trainer priority, or penalties.
 *
 * Consolidation is the final fallback: it fires only when expansion has no
 * concrete advantage over adding sets to an already-committed exercise.
 *
 * Decision rules (applied in order):
 *   1. No candidates             → NO_ACTION
 *   2. Expansion only            → EXPAND
 *   3. Consolidation only        → CONSOLIDATE
 *   4. Both, advantage = true    → EXPAND
 *   5. Both, advantage = false   → CONSOLIDATE (simpler program)
 */
export function resolveFragmentationAction(options: {
  hasExpansion: boolean;
  hasConsolidation: boolean;
  expansionHasClearAdvantage: boolean;
}): FragmentationAction {
  const { hasExpansion, hasConsolidation, expansionHasClearAdvantage } = options;
  if (!hasExpansion && !hasConsolidation) return "NO_ACTION";
  if (!hasConsolidation) return "EXPAND";
  if (!hasExpansion) return "CONSOLIDATE";
  return expansionHasClearAdvantage ? "EXPAND" : "CONSOLIDATE";
}

// ─── computeDiagnosticReason ──────────────────────────────────────────────────

/**
 * Determines WHY a target could not be resolved after the full selection pass.
 * Uses the current accumulated volumes (weeklyBaseFn, dailyBaseFn) at the time
 * of evaluation.
 */
function computeDiagnosticReason(
  targetId: number,
  recommendations: AutoFillRecExercise[],
  avoidedExerciseIds: ReadonlySet<number>,
  addedIds: ReadonlySet<number>,
  candidateCoefficients: ReadonlyMap<number, ReadonlyMap<number, number>>,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget>,
  weeklyBaseFn: (id: number) => number,
  dailyContextMap: ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>,
  dailyBaseFn: (id: number) => number,
  step3DailyAllocations: ReadonlyMap<number, number>,
  orderedTargets: ReadonlyArray<AutoFillDayTarget>,
): AutoFillUnresolvedReason {
  // Candidates from the pool that match this target (including already-added ones)
  const matching = recommendations.filter((r) => r.matchingTargetIds.includes(targetId));
  if (matching.length === 0) return "NO_RECOMMENDATIONS_RETURNED";

  // Candidates not already committed to this day
  const available = matching.filter((r) => !addedIds.has(r.id));
  if (available.length === 0) return "NO_RECOMMENDATIONS_RETURNED"; // all used up for other targets

  const nonAvoided = available.filter((r) => !r.isAvoided && !avoidedExerciseIds.has(r.id));
  if (nonAvoided.length === 0) return "AVOIDED_EXERCISE_FILTERED";

  const withCoeff = nonAvoided.filter((r) => (candidateCoefficients.get(r.id)?.size ?? 0) > 0);
  if (withCoeff.length === 0) return "NO_EXACT_CONTRIBUTION_VECTOR";

  let hasDailyRedistribution = false;
  let hasOtherTargetOvershoot = false;

  for (const rec of withCoeff) {
    const coeffs = candidateCoefficients.get(rec.id)!;
    for (const sets of ALLOWED_SET_COUNTS) {
      const result = evaluateCandidate(
        sets, coeffs, weeklyTargets, weeklyBaseFn, dailyContextMap, dailyBaseFn,
        step3DailyAllocations, orderedTargets,
      );
      if (result.rejected) {
        if (result.cause === "daily_redistribution") hasDailyRedistribution = true;
        if (result.cause === "other_target_overshoot") hasOtherTargetOvershoot = true;
      }
    }
  }

  if (hasDailyRedistribution) return "DAILY_REDISTRIBUTION_LIMIT_REACHED";
  if (hasOtherTargetOvershoot) return "ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT";
  return "NO_SAFE_2_3_4_SET_OPTION";
}

// ─── selectExercisesForDay ────────────────────────────────────────────────────

/**
 * Volume-aware, multi-pass exercise selection for one workout day.
 *
 * Each iteration finds the globally best (target, candidate, sets) triple
 * and commits it. Iterations continue until no safe improvement is possible
 * or capacity limits are reached.
 *
 * Target resolution is volume-based: a target is resolved only when its
 * accumulated weekly volume reaches weeklyPreferredCeiling − RESOLVE_TOLERANCE.
 *
 * All parameters after avoidedExerciseIds are optional (empty maps/sets) for
 * backward compatibility with tests that don't need volume-aware selection.
 */
export function selectExercisesForDay(
  dayIndex: number,
  orderedTargets: ReadonlyArray<AutoFillDayTarget>,
  coreEligible: boolean,
  recommendations: AutoFillRecExercise[],
  existingExerciseCount: number,
  existingSetCount: number,
  avoidedExerciseIds: ReadonlySet<number>,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget> = new Map(),
  dailyContext: ReadonlyMap<
    number,
    { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }
  > = new Map(),
  candidateCoefficients: ReadonlyMap<number, ReadonlyMap<number, number>> = new Map(),
  weeklyAddedByPreviousDays: ReadonlyMap<number, number> = new Map(),
  exercisesUsedInOtherDays: ReadonlySet<number> = new Set(),
  step3DailyAllocations: ReadonlyMap<number, number> = new Map(),
  maxDayExercises?: number,
  allowedSetCounts?: ReadonlyArray<2 | 3 | 4>,
  maxSessionMinutes?: number,
  minDayExercises?: number,
): AutoFillDayResult {
  const addedIds = new Set<number>();
  const toAdd: AutoFillExerciseToAdd[] = [];
  let coreAdded = false;
  let limitHit = false;
  let currentCount = existingExerciseCount;
  let currentSets = existingSetCount;

  const weeklyAddedThisDay = new Map<number, number>();
  const dailyAddedThisDay = new Map<number, number>();
  /** Stage 4: exercise count per canonical movement category committed this day. */
  const patternsAddedThisDay = new Map<string, number>();

  const weeklyBase = (id: number): number =>
    (weeklyTargets.get(id)?.effectiveSets ?? 0)
    + (weeklyAddedByPreviousDays.get(id) ?? 0)
    + (weeklyAddedThisDay.get(id) ?? 0);

  const dailyBase = (id: number): number =>
    (dailyContext.get(id)?.effectiveSets ?? 0) + (dailyAddedThisDay.get(id) ?? 0);

  /** Volume-based resolution check. Falls back to selection-based for no-guideline targets. */
  const isVolumeResolved = (targetId: number): boolean => {
    const wt = weeklyTargets.get(targetId);
    if (!wt?.hasGuideline) {
      // No ceiling: resolved when any committed exercise covers this target
      return recommendations.some((r) => addedIds.has(r.id) && r.matchingTargetIds.includes(targetId));
    }
    return weeklyBase(targetId) >= wt.weeklyPreferredCeiling - RESOLVE_TOLERANCE;
  };

  // Stage 7A / Stage 8A: resolve per-level effective constraints (callers may supply overrides)
  const effectiveMaxExercises = maxDayExercises ?? MAX_DAY_EXERCISES;
  const effectiveSetCounts: ReadonlyArray<2 | 3 | 4> = allowedSetCounts ?? ALLOWED_SET_COUNTS;
  const effectiveMaxSessionMinutes = maxSessionMinutes ?? Infinity;
  /** Stage 8A: generator tries to reach this count; stops if no safe candidate remains. */
  const effectiveMinExercises = minDayExercises ?? 0;

  /**
   * Returns true if committing (projectedExercises, projectedSets) total would push the
   * estimated session duration over effectiveMaxSessionMinutes.
   * Short-circuits to false when no cap is active (avoids the estimator call).
   * See sessionDurationEstimator.ts for the formula and its documented assumptions.
   */
  function wouldExceedDuration(projectedExercises: number, projectedSets: number): boolean {
    if (effectiveMaxSessionMinutes === Infinity) return false;
    // Compare in seconds to avoid floating-point division; exactly at the cap is accepted (strict >).
    return estimateSessionDurationSeconds(projectedExercises, projectedSets) > effectiveMaxSessionMinutes * 60;
  }

  const canAddMore = (): boolean => {
    if (currentCount >= effectiveMaxExercises) return false;
    const minSets = Math.min(...effectiveSetCounts);
    if (currentSets + minSets > MAX_DAY_SETS) return false;
    // Check that even the minimum-set addition won't exceed the session duration cap.
    if (wouldExceedDuration(currentCount + 1, currentSets + minSets)) return false;
    return true;
  };

  function commitExercise(rec: AutoFillRecExercise, sets: number, isCore: boolean): void {
    toAdd.push({
      exerciseId: rec.id,
      exerciseName: rec.name,
      mainMuscleGroup: rec.mainMuscleGroup,
      equipment: rec.equipment,
      isCore,
      sets,
      // Stage 2: carry classification metadata through for session ordering
      exerciseType: rec.exerciseType ?? null,
      neurologicalFatigue: rec.neurologicalFatigue ?? null,
      learningDifficulty: rec.learningDifficulty ?? null,
      exercisePriority: rec.exercisePriority ?? null,
      // Stage 6: carry secondary muscles for within-session fatigue tie-breaking
      secondaryMuscleGroups: rec.secondaryMuscleGroups ?? null,
    });
    addedIds.add(rec.id);
    currentCount++;
    currentSets += sets;
    // Stage 4: track exercise count per movement category (not sets)
    if (rec.movementCategoryKey) {
      patternsAddedThisDay.set(
        rec.movementCategoryKey,
        (patternsAddedThisDay.get(rec.movementCategoryKey) ?? 0) + 1,
      );
    }
    const coeffs = candidateCoefficients.get(rec.id);
    if (coeffs) {
      for (const [tid, coeff] of coeffs) {
        if (coeff > 0) {
          weeklyAddedThisDay.set(tid, (weeklyAddedThisDay.get(tid) ?? 0) + coeff * sets);
          dailyAddedThisDay.set(tid, (dailyAddedThisDay.get(tid) ?? 0) + coeff * sets);
        }
      }
    }
  }

  /** Sort: fresh exercises (not used in other days) first, then by original API rank. */
  function sortedWithRank(
    recs: AutoFillRecExercise[],
  ): Array<{ rec: AutoFillRecExercise; originalRank: number }> {
    return recs
      .map((rec, idx) => ({ rec, originalRank: idx }))
      .sort((a, b) => {
        const aUsed = exercisesUsedInOtherDays.has(a.rec.id) ? 1 : 0;
        const bUsed = exercisesUsedInOtherDays.has(b.rec.id) ? 1 : 0;
        return aUsed !== bUsed ? aUsed - bUsed : a.originalRank - b.originalRank;
      });
  }

  /**
   * Three-phase candidate comparison that inserts Stage 6 fatigue between
   * trainerPriority (score[5]) and originalRank (score[6]).
   *
   * Returns true if `candidate` is strictly better than `current`.
   *
   * Phase A — ScoreTuple[0–5]  (unresolved targets → weekly volume →
   *            daily volume → sets preference → movement pattern → trainer priority)
   * Phase B — session fatigue  (computeFatiguePenalty against already-committed toAdd)
   * Phase C — ScoreTuple[6–7]  (original API rank → variety)
   *
   * ScoreTuple is not modified. computeFatiguePenalty is only called when all
   * of indices 0–5 are identical between the two candidates — i.e. every
   * higher-priority criterion has already been exhausted.
   */
  function compareCandidatesWithFatigue(
    candidate: { rec: AutoFillRecExercise; score: ScoreTuple },
    current:   { rec: AutoFillRecExercise; score: ScoreTuple },
  ): boolean {
    // Phase A: indices 0–5
    for (let i = 0; i < 6; i++) {
      if (candidate.score[i]! < current.score[i]!) return true;
      if (candidate.score[i]! > current.score[i]!) return false;
    }
    // Phase B: session fatigue (Stage 6)
    const fp  = computeFatiguePenalty(candidate.rec, toAdd);
    const bfp = computeFatiguePenalty(current.rec,   toAdd);
    if (fp < bfp) return true;
    if (fp > bfp) return false;
    // Phase C: indices 6–7
    for (let i = 6; i < 8; i++) {
      if (candidate.score[i]! < current.score[i]!) return true;
      if (candidate.score[i]! > current.score[i]!) return false;
    }
    return false;
  }

  // ── Stage 5 closures ──────────────────────────────────────────────────────

  /**
   * Finds the globally best new-exercise candidate across all unresolved targets.
   * Pure refactor of the former Phase 1 inner loop — behavior is identical.
   * Extracted so the result can be compared against a consolidation candidate
   * before any action is taken.
   */
  function findBestExpansion(): { rec: AutoFillRecExercise; sets: AllowedSets; score: ScoreTuple } | null {
    let best: { rec: AutoFillRecExercise; sets: AllowedSets; score: ScoreTuple } | null = null;
    const sorted = sortedWithRank(recommendations);

    for (const target of orderedTargets) {
      if (isVolumeResolved(target.targetId)) continue;

      for (const { rec, originalRank } of sorted) {
        if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
        if (addedIds.has(rec.id)) continue;
        if (!rec.matchingTargetIds.includes(target.targetId)) continue;

        const coeffs: ReadonlyMap<number, number> = candidateCoefficients.get(rec.id) ?? new Map();

        // Exercise must actually contribute to the target per the volume calculator
        const primaryCoeff = coeffs.get(target.targetId) ?? 0;
        if (primaryCoeff <= 0 && coeffs.size > 0) continue;

        for (const sets of effectiveSetCounts) {
          if (currentSets + sets > MAX_DAY_SETS) continue;
          // Stage 7A: duration gate — skip this set count if it would push session over cap
          if (wouldExceedDuration(currentCount + 1, currentSets + sets)) continue;

          const eval_ = evaluateCandidate(
            sets, coeffs, weeklyTargets, weeklyBase, dailyContext, dailyBase,
            step3DailyAllocations, orderedTargets,
          );
          if (eval_.rejected) continue;

          const varietyPenalty = exercisesUsedInOtherDays.has(rec.id) ? 1 : 0;
          const score: ScoreTuple = [
            eval_.partialScore[0]!,
            eval_.partialScore[1]!,
            eval_.partialScore[2]!,
            eval_.partialScore[3]!,
            movementPatternPenalty(rec.movementCategoryKey, patternsAddedThisDay),
            trainerPriorityRank(rec),
            originalRank,
            varietyPenalty,
          ];

          if (best === null || compareCandidatesWithFatigue({ rec, score }, best)) {
            best = { rec, sets, score };
          }
        }
      }
    }

    return best;
  }

  /**
   * Finds the best safe set-increase on an already-committed exercise.
   * Decision-only: does not mutate any state.
   *
   * Rules:
   *   - Skips core exercises and exercises already at 4 sets.
   *   - Tries delta = 1 then delta = 2; rejects if sets + delta > 4 or
   *     currentSets + delta > MAX_DAY_SETS.
   *   - Rejects candidates that fail checkContributionSafety.
   *   - Missing or empty coefficient maps are skipped.
   *
   * Candidate preference: lower numRemainingUnresolved → lower delta →
   * earlier index in toAdd (naturally preserved by ascending iteration order).
   */
  function findBestConsolidation(): { index: number; delta: number; numRemainingUnresolved: number } | null {
    // Consolidation only makes sense when there is still volume to contribute toward.
    // If every ordered target is already resolved, adding more sets gains nothing.
    const hasAnyUnresolved = orderedTargets.some((t) => !isVolumeResolved(t.targetId));
    if (!hasAnyUnresolved) return null;

    let best: { index: number; delta: number; numRemainingUnresolved: number } | null = null;

    // Stage 7A: compute effective ceiling once for the whole consolidation pass
    const maxAllowedSets = Math.max(...effectiveSetCounts);
    for (let i = 0; i < toAdd.length; i++) {
      const entry = toAdd[i]!;
      if (entry.isCore) continue;
      if (entry.sets >= maxAllowedSets) continue;

      const coeffs = candidateCoefficients.get(entry.exerciseId);
      if (!coeffs || coeffs.size === 0) continue;

      for (const delta of [1, 2] as const) {
        if (entry.sets + delta > maxAllowedSets) continue;
        if (currentSets + delta > MAX_DAY_SETS) continue;
        // Stage 7A: duration gate for consolidation (exercise count unchanged)
        if (wouldExceedDuration(currentCount, currentSets + delta)) continue;

        const safety = checkContributionSafety(
          delta, coeffs, weeklyTargets, weeklyBase, dailyContext, dailyBase,
          step3DailyAllocations, orderedTargets,
        );
        if (!safety.safe) continue;

        const candidate = { index: i, delta, numRemainingUnresolved: safety.numRemainingUnresolved };

        if (best === null) {
          best = candidate;
        } else if (
          candidate.numRemainingUnresolved < best.numRemainingUnresolved ||
          (candidate.numRemainingUnresolved === best.numRemainingUnresolved && candidate.delta < best.delta)
        ) {
          best = candidate;
        }
        // Equal numRemainingUnresolved and delta: ascending i means the earlier
        // index is already in best — no update needed.
      }
    }

    return best;
  }

  /**
   * Applies an already-decided consolidation atomically.
   *
   * Updates exactly:
   *   - toAdd[index].sets     += delta
   *   - currentSets           += delta
   *   - weeklyAddedThisDay    += coeff * delta  (per contributing target)
   *   - dailyAddedThisDay     += coeff * delta  (per contributing target)
   *
   * Does NOT update: currentCount, addedIds, patternsAddedThisDay.
   * Does NOT perform safety checks or make decisions.
   */
  function applyConsolidation(candidate: { index: number; delta: number }): void {
    const entry = toAdd[candidate.index]!;
    entry.sets += candidate.delta;
    currentSets += candidate.delta;

    const coeffs = candidateCoefficients.get(entry.exerciseId);
    if (coeffs) {
      for (const [targetId, coeff] of coeffs) {
        if (coeff > 0) {
          const contribution = coeff * candidate.delta;
          weeklyAddedThisDay.set(targetId, (weeklyAddedThisDay.get(targetId) ?? 0) + contribution);
          dailyAddedThisDay.set(targetId, (dailyAddedThisDay.get(targetId) ?? 0) + contribution);
        }
      }
    }
  }

  // ── findBestFillExercise ──────────────────────────────────────────────────
  //
  // Stage 8A: used by Phase 1.5 (minimum fill).
  //
  // Selects the globally best exercise from the full recommendation pool,
  // regardless of whether any volume target is still unresolved. Unlike
  // findBestExpansion it does not filter by orderedTargets — any candidate
  // that passes safety checks is eligible. Core exercises are excluded (Phase 2).
  //
  // Ranking uses the identical ScoreTuple and comparator as findBestExpansion so
  // that exercises are still ordered by volume impact, movement pattern novelty,
  // and trainer priority. In practice, when all volume targets are already resolved,
  // score[0] = 0 and score[1]/score[2] ≈ 0 for every candidate, so score[4]
  // (movementPatternPenalty) and score[5] (trainerPriorityRank) become the
  // effective differentiators — compound lifts adding new movement patterns win.

  function findBestFillExercise(): { rec: AutoFillRecExercise; sets: AllowedSets; score: ScoreTuple } | null {
    let best: { rec: AutoFillRecExercise; sets: AllowedSets; score: ScoreTuple } | null = null;
    const sorted = sortedWithRank(recommendations);

    for (const { rec, originalRank } of sorted) {
      if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
      if (addedIds.has(rec.id)) continue;
      // Core exercises are reserved for Phase 2.
      if (rec.mainMuscleGroup === CORE_MUSCLE_GROUP) continue;

      const coeffs: ReadonlyMap<number, number> = candidateCoefficients.get(rec.id) ?? new Map();
      // No contribution vector → skip (same rule as evaluateCandidate).
      if (coeffs.size === 0) continue;

      for (const sets of effectiveSetCounts) {
        if (currentSets + sets > MAX_DAY_SETS) continue;
        // Stage 7A: duration gate applies during fill as well.
        if (wouldExceedDuration(currentCount + 1, currentSets + sets)) continue;

        const eval_ = evaluateCandidate(
          sets, coeffs, weeklyTargets, weeklyBase, dailyContext, dailyBase,
          step3DailyAllocations, orderedTargets,
        );
        if (eval_.rejected) continue;

        const varietyPenalty = exercisesUsedInOtherDays.has(rec.id) ? 1 : 0;
        const score: ScoreTuple = [
          eval_.partialScore[0]!,
          eval_.partialScore[1]!,
          eval_.partialScore[2]!,
          eval_.partialScore[3]!,
          movementPatternPenalty(rec.movementCategoryKey, patternsAddedThisDay),
          trainerPriorityRank(rec),
          originalRank,
          varietyPenalty,
        ];

        if (best === null || compareCandidatesWithFatigue({ rec, score }, best)) {
          best = { rec, sets, score };
        }
      }
    }

    return best;
  }

  // ── Phase 1: Multi-pass target selection with Stage 5 fragmentation tie-breaker

  let didImprove = true;
  while (didImprove && canAddMore()) {
    didImprove = false;

    const expansion = findBestExpansion();
    const consolidation = findBestConsolidation();

    const expansionHasClearAdvantage =
      expansion !== null && consolidation !== null
        ? hasClearExpansionAdvantage(expansion, consolidation)
        : false;

    const action = resolveFragmentationAction({
      hasExpansion: expansion !== null,
      hasConsolidation: consolidation !== null,
      expansionHasClearAdvantage,
    });

    if (action === "EXPAND") {
      commitExercise(expansion!.rec, expansion!.sets, false);
      didImprove = true;
    } else if (action === "CONSOLIDATE") {
      applyConsolidation(consolidation!);
      didImprove = true;
    }
  }

  if (!canAddMore() && orderedTargets.some((t) => !isVolumeResolved(t.targetId))) {
    limitHit = true;
  }

  // ── Phase 1.5: Minimum fill ───────────────────────────────────────────────
  //
  // Stage 8A: runs only when minDayExercises is set and Phase 1 ended below it.
  //
  // After volume targets are resolved Phase 1 stops (didImprove = false). This
  // phase continues adding exercises until the minimum count is reached or no
  // safe candidate remains. Every candidate still passes the full safety pipeline
  // (evaluateCandidate → checkContributionSafety + overshoot / redistribution
  // guards) and the session duration cap, so the minimum is never met by forcing
  // exercises that would worsen the plan.

  while (canAddMore() && currentCount < effectiveMinExercises) {
    const fill = findBestFillExercise();
    if (fill === null) break; // no safe candidate left — stop gracefully
    commitExercise(fill.rec, fill.sets, false);
  }

  // ── Phase 2: Core ─────────────────────────────────────────────────────────

  if (coreEligible) {
    if (!canAddMore()) {
      limitHit = true;
    } else {
      const coreRecs = sortedWithRank(
        recommendations.filter((r) => r.mainMuscleGroup === CORE_MUSCLE_GROUP),
      );

      let bestCore: { rec: AutoFillRecExercise; sets: AllowedSets; score: ScoreTuple } | null = null;

      for (const { rec, originalRank } of coreRecs) {
        if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
        if (addedIds.has(rec.id)) continue;

        const coeffs: ReadonlyMap<number, number> = candidateCoefficients.get(rec.id) ?? new Map();

        for (const sets of effectiveSetCounts) {
          if (currentSets + sets > MAX_DAY_SETS) continue;
          // Stage 7A: duration gate for core exercise
          if (wouldExceedDuration(currentCount + 1, currentSets + sets)) continue;

          const eval_ = evaluateCandidate(
            sets, coeffs, weeklyTargets, weeklyBase, dailyContext, dailyBase,
            step3DailyAllocations, orderedTargets,
          );
          if (eval_.rejected) continue;

          const varietyPenalty = exercisesUsedInOtherDays.has(rec.id) ? 1 : 0;
          const score: ScoreTuple = [
            eval_.partialScore[0]!,
            eval_.partialScore[1]!,
            eval_.partialScore[2]!,
            eval_.partialScore[3]!,
            movementPatternPenalty(rec.movementCategoryKey, patternsAddedThisDay),
            trainerPriorityRank(rec),
            originalRank,
            varietyPenalty,
          ];

          if (bestCore === null || compareCandidatesWithFatigue({ rec, score }, bestCore)) {
            bestCore = { rec, sets, score };
          }
        }
      }

      if (bestCore !== null) {
        commitExercise(bestCore.rec, bestCore.sets, true);
        coreAdded = true;
      }
    }
  }

  // ── Build resolved / unresolved lists ─────────────────────────────────────

  const resolvedTargets: AutoFillDayTarget[] = [];
  const unresolvedTargets: AutoFillDayTarget[] = [];

  for (const target of orderedTargets) {
    if (isVolumeResolved(target.targetId)) {
      resolvedTargets.push(target);
    } else {
      const diagnosticReason = computeDiagnosticReason(
        target.targetId,
        recommendations,
        avoidedExerciseIds,
        addedIds,
        candidateCoefficients,
        weeklyTargets,
        weeklyBase,
        dailyContext,
        dailyBase,
        step3DailyAllocations,
        orderedTargets,
      );
      unresolvedTargets.push({ ...target, diagnosticReason });
    }
  }

  return { dayIndex, toAdd, resolvedTargets, unresolvedTargets, coreAdded, limitHit };
}

// ─── computeAutoFillSummary ───────────────────────────────────────────────────

export function computeAutoFillSummary(
  dayResults: AutoFillDayResult[],
  skippedDayCount: number,
): AutoFillSummary {
  let totalAdded = 0;
  let daysUpdated = 0;
  let coreAddedCount = 0;
  const limitWarnings: string[] = [];

  const resolvedIdsSeen = new Set<number>();
  const unresolvedIdsSeen = new Set<number>();
  const resolvedTargets: AutoFillDayTarget[] = [];
  const unresolvedTargets: AutoFillDayTarget[] = [];

  for (const result of dayResults) {
    if (result.toAdd.length > 0) { totalAdded += result.toAdd.length; daysUpdated++; }
    if (result.coreAdded) coreAddedCount++;
    if (result.limitHit) limitWarnings.push(`Dzień ${result.dayIndex + 1}: osiągnięto limit ćwiczeń lub serii.`);

    for (const t of result.resolvedTargets) {
      if (!resolvedIdsSeen.has(t.targetId)) { resolvedIdsSeen.add(t.targetId); resolvedTargets.push(t); }
    }
    for (const t of result.unresolvedTargets) {
      if (!unresolvedIdsSeen.has(t.targetId) && !resolvedIdsSeen.has(t.targetId)) {
        unresolvedIdsSeen.add(t.targetId);
        unresolvedTargets.push(t);
      }
    }
  }

  return { totalAdded, daysUpdated, daysCovered: skippedDayCount, resolvedTargets, unresolvedTargets, coreAddedCount, limitWarnings };
}

// ─── validateGuardResponse ────────────────────────────────────────────────────

/**
 * Returns true when the guard response passes all safety checks.
 * Checks:
 *   - Weekly: non-overshot targets ≤ ceiling + 0.5; overshot targets not increased.
 *   - Daily: auto-fill contribution per target ≤ step3Alloc + 2.0.
 *
 * The daily check uses computed contributions (from candidateCoefficients) rather
 * than the aggregated backend total, to avoid false rejections from existing
 * manual overshoots.
 */
function validateGuardResponse(
  guardResponse: AutoFillVolumeSnapshot,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget>,
  dayResults: AutoFillDayResult[],
  candidateCoefficients: ReadonlyMap<number, ReadonlyMap<number, number>>,
  step3PerDayId: ReadonlyMap<number, ReadonlyMap<number, number>>,
  currentPreviewResult: AutoFillVolumeSnapshot,
): boolean {
  // 1. Weekly check
  for (const w of guardResponse.weekly) {
    const wt = weeklyTargets.get(w.targetId);
    if (!wt?.hasGuideline) continue;
    if (wt.isManuallyOvershot) {
      if (w.effectiveSets > wt.effectiveSets + 0.01) return false;
    } else {
      if (w.effectiveSets > wt.weeklyPreferredCeiling + OVERSHOOT_TOLERANCE + 0.01) return false;
    }
  }

  // 2. Daily redistribution check: only for auto-fill additions
  for (const dayResult of dayResults) {
    const dayId = dayResult.dayIndex + 1;
    const step3 = step3PerDayId.get(dayId);
    if (!step3) continue;

    const priorDay = currentPreviewResult.days.find((d) => d.dayId === dayId);
    const autoFillByTarget = new Map<number, number>();
    for (const toAdd of dayResult.toAdd) {
      const coeffs = candidateCoefficients.get(toAdd.exerciseId);
      if (coeffs) {
        for (const [tid, coeff] of coeffs) {
          autoFillByTarget.set(tid, (autoFillByTarget.get(tid) ?? 0) + coeff * toAdd.sets);
        }
      }
    }

    for (const [targetId, autoFillContrib] of autoFillByTarget) {
      const alloc = step3.get(targetId);
      if (alloc === undefined) continue;
      const priorContrib = priorDay?.muscles.find((m) => m.targetId === targetId)?.effectiveSets ?? 0;
      if (priorContrib + autoFillContrib > alloc + DAILY_MAX_POSITIVE_DEVIATION + 0.01) return false;
    }
  }

  return true;
}

// ─── runAutoFill ──────────────────────────────────────────────────────────────

/**
 * Orchestrates volume-aware auto-fill for all days.
 *
 * Network calls:
 *   1. One recommendation GET per day (parallel).
 *   2. One trial POST /api/plans/volume-preview (extracts candidate coefficients).
 *   3. One final guard POST /api/plans/volume-preview (validates complete proposal).
 *
 * Atomic: if any fetch fails or the guard rejects the proposal, returns
 * RunAutoFillFailure. The caller must not modify the draft.
 */
export async function runAutoFill(
  input: RunAutoFillInput,
  recommendationFetcher: (url: string) => Promise<AutoFillRecExercise[]>,
  previewFetcher: (body: TrialPreviewBody) => Promise<AutoFillVolumeSnapshot>,
): Promise<RunAutoFillResult> {
  const {
    clientId,
    daysToProcess,
    skippedDayCount,
    avoidedExerciseIds,
    allDistributionDays,
    currentDraft,
    currentPreviewResult,
  } = input;

  // 1. Parallel recommendation fetches
  //
  // Pool size: use the caller-supplied override when set (e.g. 20 for
  // sedentary clients), otherwise default to 20 so the gap-fill always has
  // a wide-enough candidate pool to produce meaningful variety.
  // The old implicit server default (8) was too small: with 2–3 uncovered
  // targets each receiving at most 3 candidates, the same top-scorers always
  // won and the selection felt predetermined.
  //
  // dayType: forwarded to the endpoint so the muscle-group boundary filter
  // (upper/lower) is applied during the recommendation fetch.  Without it
  // the selectExercise gate used dayType=null and cross-session exercises
  // (e.g. squats on a push day) entered the candidate pool.
  const dayUrls = daysToProcess.map((day) =>
    buildDayFetchUrl(
      clientId,
      day.broadCategories,
      day.orderedTargets.map((t) => t.targetId),
      day.coreEligible,
      day.alreadyAddedExerciseIds,
      day.poolSize ?? 20,
      day.dayType,
    ),
  );

  let responsesExercises: AutoFillRecExercise[][];
  try {
    responsesExercises = await Promise.all(dayUrls.map((url) => recommendationFetcher(url)));
  } catch {
    return {
      ok: false,
      error: "Nie udało się przygotować pełnej propozycji. Dotychczasowy szkic nie został zmieniony.",
    };
  }

  // 2. Enrich with exact matchingTargetIds
  const enriched = daysToProcess.map((day, i) => {
    const nameToId = new Map(day.orderedTargets.map((t) => [t.targetName, t.targetId]));
    return (responsesExercises[i] ?? []).map((ex) => ({
      ...ex,
      matchingTargetIds: ex.matchingTargets
        .map((name) => nameToId.get(name))
        .filter((id): id is number => id !== undefined),
    }));
  });

  // 3. Trial preview call → extract candidate coefficients
  const candidatesPerDayIndex = new Map<number, ReadonlyArray<{ id: number }>>(
    daysToProcess.map((day, i) => [day.dayIndex, enriched[i] ?? []]),
  );
  const allCandidateIds = new Set<number>(
    daysToProcess.flatMap((_, i) => (enriched[i] ?? []).map((e) => e.id)),
  );

  let candidateCoefficients: Map<number, Map<number, number>>;
  try {
    const trialBody = buildTrialPreviewBody(clientId, allDistributionDays, currentDraft, candidatesPerDayIndex);
    const trialResponse = await previewFetcher(trialBody);
    candidateCoefficients = extractCandidateCoefficients(trialResponse, allCandidateIds);
  } catch {
    // Trial preview failed → empty coefficients → all candidates rejected (no_coeff)
    candidateCoefficients = new Map();
  }

  // 4. Weekly context
  const weeklyTargets = new Map<number, AutoFillWeeklyTarget>(
    currentPreviewResult.weekly.map((w) => [w.targetId, w]),
  );

  // 5. Step 3 daily allocations per dayId (for the final guard)
  const step3PerDayId = new Map<number, ReadonlyMap<number, number>>(
    daysToProcess.map((day) => [day.dayIndex + 1, day.step3DailyAllocations]),
  );

  // 6. Sequential selection (inter-day weekly accumulation + variety tracking)
  const weeklyAddedCumulative = new Map<number, number>();
  const exercisesUsedInOtherDays = new Set<number>();
  const dayResults: AutoFillDayResult[] = [];

  for (let i = 0; i < daysToProcess.length; i++) {
    const day = daysToProcess[i]!;
    const syntheticDayId = day.dayIndex + 1;

    const daySnap = currentPreviewResult.days.find((d) => d.dayId === syntheticDayId);
    const dailyContext = new Map<
      number,
      { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }
    >((daySnap?.muscles ?? []).map((m) => [
      m.targetId,
      { effectiveSets: m.effectiveSets, sessionMax: m.sessionMax, isDailyOvershot: m.isDailyOvershot },
    ]));

    const result = selectExercisesForDay(
      day.dayIndex,
      day.orderedTargets,
      day.coreEligible,
      enriched[i]!,
      day.existingExerciseCount,
      day.existingSetCount,
      avoidedExerciseIds,
      weeklyTargets,
      dailyContext,
      candidateCoefficients,
      weeklyAddedCumulative,
      exercisesUsedInOtherDays,
      day.step3DailyAllocations,
      day.maxDayExercises,
      day.allowedSetCounts,
      day.maxSessionMinutes,
      day.minDayExercises,
    );

    dayResults.push(result);

    for (const added of result.toAdd) {
      exercisesUsedInOtherDays.add(added.exerciseId);
      const coeffs = candidateCoefficients.get(added.exerciseId);
      if (coeffs) {
        for (const [tid, coeff] of coeffs) {
          if (coeff > 0) {
            weeklyAddedCumulative.set(tid, (weeklyAddedCumulative.get(tid) ?? 0) + coeff * added.sets);
          }
        }
      }
    }
  }

  // 7. Final whole-plan backend guard
  const hasAnyAddition = dayResults.some((r) => r.toAdd.length > 0);
  if (hasAnyAddition) {
    try {
      const guardBody = buildFinalGuardPreviewBody(clientId, allDistributionDays, currentDraft, dayResults);
      const guardResponse = await previewFetcher(guardBody);
      const valid = validateGuardResponse(
        guardResponse, weeklyTargets, dayResults, candidateCoefficients,
        step3PerDayId, currentPreviewResult,
      );
      if (!valid) {
        return {
          ok: false,
          error: "Nie udało się przygotować bezpiecznej propozycji objętości. Szkic nie został zmieniony.",
        };
      }
    } catch {
      // Guard call failed — treat as rejected for safety
      return {
        ok: false,
        error: "Nie udało się przygotować bezpiecznej propozycji objętości. Szkic nie został zmieniony.",
      };
    }
  }

  const summary = computeAutoFillSummary(dayResults, skippedDayCount);
  return { ok: true, dayResults, summary };
}
