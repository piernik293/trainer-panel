/**
 * Whole Plan Auto-Fill — Phase 4D
 *
 * Pure functions only. No React, no DB, no side effects.
 *
 * Architecture:
 *   selectExercisesForDay()  — selects exercises from one day's recommendation
 *                              response to cover uncovered targets
 *   buildDayFetchUrl()       — builds the recommendation API URL for one day
 *   computeAutoFillSummary() — rolls up per-day results into a user-facing summary
 *   runAutoFill()            — orchestrates all days with an injectable fetcher
 *                              (the component provides the native fetch implementation;
 *                              tests provide a mock)
 *
 * Reuses:
 *   - Phase 4B3 uncovered-target calculation (EligibleTargetNeed)
 *   - existing recommendation API endpoint + response format
 *   - existing default exercise prescription (DRAFT_EXERCISE_DEFAULTS)
 */

import { DRAFT_EXERCISE_DEFAULTS } from "./exerciseDraftHelpers";
import { CORE_MUSCLE_GROUP } from "./coreCoverageHelpers";

// ─── Safety limits (spec section 5) ──────────────────────────────────────────

export const MAX_DAY_EXERCISES = 8;
export const MAX_DAY_SETS = 24;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Structural type for one uncovered target — intentionally minimal so tests
 * do not need to import EligibleTargetNeed from coreCoverageHelpers.
 */
export interface AutoFillDayTarget {
  targetId: number;
  targetName: string;
}

/**
 * One exercise from the recommendation API response, enriched with exact
 * targetIds by runAutoFill before being passed to selectExercisesForDay.
 *
 * The API returns only `matchingTargets` (names). `matchingTargetIds` is
 * populated by runAutoFill by cross-referencing the `orderedTargets` that were
 * sent in the request — this is the authoritative ID source, not the name strings.
 * selectExercisesForDay uses only matchingTargetIds, never matchingTargets.
 */
export interface AutoFillRecExercise {
  id: number;
  name: string;
  mainMuscleGroup: string;
  /** Target names from the API response (used only for enrichment). */
  matchingTargets: string[];
  /**
   * Exact volume-target IDs this exercise covers for the current day.
   * Populated by runAutoFill from orderedTargets before selectExercisesForDay
   * is called. Empty until enriched.
   */
  matchingTargetIds: number[];
  equipment: string[];
  isAvoided: boolean;
}

/** One exercise the auto-fill engine proposes to add to the draft. */
export interface AutoFillExerciseToAdd {
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  equipment: string[];
  /** True when this is a Core / brzuch exercise placed at the bottom. */
  isCore: boolean;
}

/** Result of processing one workout day. */
export interface AutoFillDayResult {
  dayIndex: number;
  toAdd: AutoFillExerciseToAdd[];
  resolvedTargets: AutoFillDayTarget[];
  unresolvedTargets: AutoFillDayTarget[];
  coreAdded: boolean;
  /** True when safety limits (8 exercises / 24 sets) cut short the additions. */
  limitHit: boolean;
}

/** User-facing summary displayed after a successful auto-fill run. */
export interface AutoFillSummary {
  totalAdded: number;
  daysUpdated: number;
  /** Days that were already fully covered and needed no request. */
  daysCovered: number;
  resolvedTargets: AutoFillDayTarget[];
  unresolvedTargets: AutoFillDayTarget[];
  coreAddedCount: number;
  limitWarnings: string[];
}

// ─── runAutoFill orchestration types ─────────────────────────────────────────

/** Input for one day in runAutoFill. */
export interface RunAutoFillDayInput {
  dayIndex: number;
  broadCategories: string[];
  /** From computeEligibleTargetNeeds().normalNeeds — pre-sorted by priority. */
  orderedTargets: AutoFillDayTarget[];
  coreEligible: boolean;
  existingExerciseCount: number;
  existingSetCount: number;
  alreadyAddedExerciseIds: number[];
}

export interface RunAutoFillInput {
  clientId: number;
  /** Days that require at least one recommendation request. */
  daysToProcess: RunAutoFillDayInput[];
  /** Days that were already fully covered — counted in summary only. */
  skippedDayCount: number;
  avoidedExerciseIds: ReadonlySet<number>;
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
 * Builds the recommendation API URL for one workout day.
 *
 * Passes:
 * - uncoveredTargetIds (from orderedTargets)
 * - includeCore (coreEligible)
 * - alreadyAdded (exercise IDs already in this day)
 * - broadCategories (for the legacy fallback path — not used when
 *   uncoveredTargetIds or includeCore are set, but passed for safety)
 */
export function buildDayFetchUrl(
  clientId: number,
  broadCategories: string[],
  uncoveredTargetIds: number[],
  coreEligible: boolean,
  alreadyAddedIds: number[],
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
  return `/api/clients/${clientId}/plan-draft/day-recommendations?${params}`;
}

// ─── selectExercisesForDay ────────────────────────────────────────────────────

/**
 * Given a recommendation response for one day, select which exercises to add
 * to cover uncovered targets, respecting all safety limits.
 *
 * Algorithm (spec section 2):
 *   1. For each uncovered target (in orderedTargets priority order):
 *      - Skip if already resolved by a previously selected multi-target exercise.
 *      - Skip if limits reached.
 *      - Find the first recommendation where matchingTargetIds.includes(target.targetId)
 *        and the exercise is not already selected and not avoided.
 *      - When an exercise is selected, mark EVERY uncovered target whose
 *        targetId appears in rec.matchingTargetIds as resolved (multi-target
 *        deduplication: one exercise, many covered targets).
 *   2. If coreEligible and no Core exercise yet added and limits allow:
 *      - Find the first Brzuch exercise that is not already selected.
 *   3. Uses rec.matchingTargetIds (exact IDs) — never rec.matchingTargets (names).
 *
 * Does NOT modify the draft. Does NOT make any HTTP calls.
 * Pure function — same input always produces same output.
 */
export function selectExercisesForDay(
  dayIndex: number,
  orderedTargets: ReadonlyArray<AutoFillDayTarget>,
  coreEligible: boolean,
  recommendations: AutoFillRecExercise[],
  existingExerciseCount: number,
  existingSetCount: number,
  avoidedExerciseIds: ReadonlySet<number>,
): AutoFillDayResult {
  const addedIds = new Set<number>();
  const resolvedTargetIdSet = new Set<number>();
  const toAdd: AutoFillExerciseToAdd[] = [];
  const resolvedTargets: AutoFillDayTarget[] = [];
  const unresolvedTargets: AutoFillDayTarget[] = [];
  let coreAdded = false;
  let limitHit = false;

  let currentCount = existingExerciseCount;
  let currentSets = existingSetCount;

  // Phase 1 — normal targets (exact targetId matching)
  for (const target of orderedTargets) {
    // Already resolved by a multi-target exercise selected for an earlier target
    if (resolvedTargetIdSet.has(target.targetId)) continue;

    // Safety limit check
    if (
      currentCount >= MAX_DAY_EXERCISES ||
      currentSets + DRAFT_EXERCISE_DEFAULTS.sets > MAX_DAY_SETS
    ) {
      unresolvedTargets.push(target);
      limitHit = true;
      continue;
    }

    let found = false;
    for (const rec of recommendations) {
      if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
      if (addedIds.has(rec.id)) continue;
      // Exact targetId match — never depends on name strings
      if (!rec.matchingTargetIds.includes(target.targetId)) continue;

      toAdd.push({
        exerciseId: rec.id,
        exerciseName: rec.name,
        mainMuscleGroup: rec.mainMuscleGroup,
        equipment: rec.equipment,
        isCore: false,
      });
      addedIds.add(rec.id);
      currentCount++;
      currentSets += DRAFT_EXERCISE_DEFAULTS.sets;

      // Resolve all uncovered targets this exercise covers (multi-target handling)
      for (const t of orderedTargets) {
        if (rec.matchingTargetIds.includes(t.targetId) && !resolvedTargetIdSet.has(t.targetId)) {
          resolvedTargetIdSet.add(t.targetId);
          resolvedTargets.push(t);
        }
      }

      found = true;
      break;
    }

    if (!found) {
      unresolvedTargets.push(target);
    }
  }

  // Phase 2 — Core exercise at the bottom (spec section 2, point 8)
  if (coreEligible) {
    if (
      currentCount >= MAX_DAY_EXERCISES ||
      currentSets + DRAFT_EXERCISE_DEFAULTS.sets > MAX_DAY_SETS
    ) {
      limitHit = true;
    } else {
      for (const rec of recommendations) {
        if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
        if (addedIds.has(rec.id)) continue;
        if (rec.mainMuscleGroup !== CORE_MUSCLE_GROUP) continue;

        toAdd.push({
          exerciseId: rec.id,
          exerciseName: rec.name,
          mainMuscleGroup: rec.mainMuscleGroup,
          equipment: rec.equipment,
          isCore: true,
        });
        addedIds.add(rec.id);
        coreAdded = true;
        currentCount++;
        currentSets += DRAFT_EXERCISE_DEFAULTS.sets;
        break;
      }
    }
  }

  return {
    dayIndex,
    toAdd,
    resolvedTargets,
    unresolvedTargets,
    coreAdded,
    limitHit,
  };
}

// ─── computeAutoFillSummary ───────────────────────────────────────────────────

/**
 * Rolls up per-day auto-fill results into a user-facing summary.
 * Deduplicates resolved/unresolved target IDs across days.
 */
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
    if (result.toAdd.length > 0) {
      totalAdded += result.toAdd.length;
      daysUpdated++;
    }
    if (result.coreAdded) coreAddedCount++;
    if (result.limitHit) {
      limitWarnings.push(`Dzień ${result.dayIndex + 1}: osiągnięto limit ćwiczeń lub serii.`);
    }

    for (const t of result.resolvedTargets) {
      if (!resolvedIdsSeen.has(t.targetId)) {
        resolvedIdsSeen.add(t.targetId);
        resolvedTargets.push(t);
      }
    }
    for (const t of result.unresolvedTargets) {
      if (!unresolvedIdsSeen.has(t.targetId) && !resolvedIdsSeen.has(t.targetId)) {
        unresolvedIdsSeen.add(t.targetId);
        unresolvedTargets.push(t);
      }
    }
  }

  return {
    totalAdded,
    daysUpdated,
    daysCovered: skippedDayCount,
    resolvedTargets,
    unresolvedTargets,
    coreAddedCount,
    limitWarnings,
  };
}

// ─── runAutoFill ──────────────────────────────────────────────────────────────

/**
 * Orchestrates auto-fill for all days requiring recommendations.
 *
 * Fires one recommendation request per day in parallel, then applies
 * selectExercisesForDay for each response.
 *
 * Atomic guarantee: if any request fails, returns RunAutoFillFailure without
 * producing any AutoFillDayResult — the caller must NOT modify the draft.
 *
 * The `fetcher` parameter is injectable so the component passes native fetch
 * and tests pass a mock. It receives the full URL and must resolve to an array
 * of AutoFillRecExercise objects (i.e. the `exercises` array from the response).
 */
export async function runAutoFill(
  input: RunAutoFillInput,
  fetcher: (url: string) => Promise<AutoFillRecExercise[]>,
): Promise<RunAutoFillResult> {
  const { clientId, daysToProcess, skippedDayCount, avoidedExerciseIds } = input;

  // Build one URL per day (max one request per day)
  const dayUrls = daysToProcess.map((day) =>
    buildDayFetchUrl(
      clientId,
      day.broadCategories,
      day.orderedTargets.map((t) => t.targetId),
      day.coreEligible,
      day.alreadyAddedExerciseIds,
    ),
  );

  // Fire all in parallel (atomic: fail-fast on any error)
  let responsesExercises: AutoFillRecExercise[][];
  try {
    responsesExercises = await Promise.all(dayUrls.map((url) => fetcher(url)));
  } catch {
    return {
      ok: false,
      error:
        "Nie udało się przygotować pełnej propozycji. Dotychczasowy szkic nie został zmieniony.",
    };
  }

  // Enrich each exercise with exact targetIds derived from this day's orderedTargets.
  // The API returns only matchingTargets (names). matchingTargetIds is computed here
  // by cross-referencing the names against the orderedTargets that were sent in the
  // request — the same DB rows, so the mapping is 1-to-1. selectExercisesForDay
  // uses only matchingTargetIds; it never reads matchingTargets.
  const enriched = daysToProcess.map((day, i) => {
    const nameToId = new Map(day.orderedTargets.map((t) => [t.targetName, t.targetId]));
    return (responsesExercises[i] ?? []).map((ex) => ({
      ...ex,
      matchingTargetIds: ex.matchingTargets
        .map((name) => nameToId.get(name))
        .filter((id): id is number => id !== undefined),
    }));
  });

  // Pure selection — no side effects
  const dayResults = daysToProcess.map((day, i) =>
    selectExercisesForDay(
      day.dayIndex,
      day.orderedTargets,
      day.coreEligible,
      enriched[i]!,
      day.existingExerciseCount,
      day.existingSetCount,
      avoidedExerciseIds,
    ),
  );

  const summary = computeAutoFillSummary(dayResults, skippedDayCount);

  return { ok: true, dayResults, summary };
}
