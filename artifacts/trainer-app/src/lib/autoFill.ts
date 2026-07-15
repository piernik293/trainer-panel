/**
 * Whole Plan Auto-Fill — Phase 4E (Volume-Aware Selection)
 *
 * Changes from Phase 4D:
 *   - One trial POST /api/plans/volume-preview call (per runAutoFill invocation)
 *     extracts exact per-exercise coefficients from the backend volume calculator.
 *     The backend remains the only source of volume truth; no coefficients are
 *     recreated in the frontend.
 *   - selectExercisesForDay evaluates whole-integer working sets 1–6 per candidate.
 *     The set count is chosen by the deterministic priority order from the spec:
 *       1. minimize total weekly overshoot
 *       2. minimize number of exceeded targets
 *       3. minimize session overshoot
 *       4. minimize total remaining volume
 *       5. use fewer sets (all equal → prefer 1)
 *       6. higher-ranked recommendation (first in sorted list wins ties)
 *   - Overshoot protection:
 *       - Never worsen an existing manual overshoot.
 *       - For non-overshot targets, reject set counts that exceed the planned
 *         ceiling by more than 0.5 effective-volume points.
 *   - Exercise variety: exercises auto-added to earlier days are sorted last
 *     when choosing for a subsequent day.
 *   - runAutoFill processes days sequentially during selection (for inter-day
 *     weekly tracking) but fetches recommendations in parallel.
 */

import { CORE_MUSCLE_GROUP } from "./coreCoverageHelpers";
import { DRAFT_EXERCISE_DEFAULTS } from "./exerciseDraftHelpers";
import type { ExerciseDraftByDay } from "./exerciseDraftHelpers";

// ─── Safety limits ────────────────────────────────────────────────────────────

export const MAX_DAY_EXERCISES = 8;
export const MAX_DAY_SETS = 24;
const MAX_WORKING_SETS = 6;
const OVERSHOOT_TOLERANCE = 0.5;

// ─── Unchanged types ──────────────────────────────────────────────────────────

export interface AutoFillDayTarget {
  targetId: number;
  targetName: string;
}

export interface AutoFillRecExercise {
  id: number;
  name: string;
  mainMuscleGroup: string;
  /** Target names from the API (used only for enrichment). */
  matchingTargets: string[];
  /** Exact target IDs — populated by runAutoFill before selection. */
  matchingTargetIds: number[];
  equipment: string[];
  isAvoided: boolean;
}

/** Result of processing one workout day. */
export interface AutoFillDayResult {
  dayIndex: number;
  toAdd: AutoFillExerciseToAdd[];
  resolvedTargets: AutoFillDayTarget[];
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
}

// ─── Modified types ───────────────────────────────────────────────────────────

/**
 * One exercise the auto-fill engine proposes to add to the draft.
 * `sets` is now dynamically chosen (1–6) instead of always being the
 * DRAFT_EXERCISE_DEFAULTS value.  The component applies this value directly.
 */
export interface AutoFillExerciseToAdd {
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  equipment: string[];
  isCore: boolean;
  sets: number;
}

// ─── New types ────────────────────────────────────────────────────────────────

/**
 * Minimal weekly volume context per volume-target.
 * Mirrors the relevant fields of WeeklyMusclePreview from useVolumeCoverage.
 */
export interface AutoFillWeeklyTarget {
  targetId: number;
  effectiveSets: number;
  weeklyPreferredCeiling: number;
  hasGuideline: boolean;
  /**
   * True when the current draft (before auto-fill) already exceeds the ceiling.
   * Auto-fill must not worsen this.
   */
  isManuallyOvershot: boolean;
}

/**
 * Per-day per-target snapshot.
 * Mirrors the relevant fields of DayMusclePreview from useVolumeCoverage.
 */
export interface AutoFillDailyMuscle {
  targetId: number;
  effectiveSets: number;
  sessionMax: number;
  /** True when the current draft already exceeds sessionMax for this day. */
  isDailyOvershot: boolean;
  contributions: ReadonlyArray<{ exerciseId: number; coefficient: number }>;
}

/**
 * Minimal volume snapshot.  Passed from the existing previewResult so the
 * volume calculator remains the only source of truth.
 */
export interface AutoFillVolumeSnapshot {
  weekly: AutoFillWeeklyTarget[];
  days: ReadonlyArray<{
    dayId: number;
    muscles: AutoFillDailyMuscle[];
  }>;
}

/** Request body for a trial POST /api/plans/volume-preview call. */
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
  /** All distribution days (including already-covered ones). */
  allDistributionDays: ReadonlyArray<{ dayIndex: number; dayName: string | null }>;
  /** Current draft before auto-fill — used to build the trial preview body. */
  currentDraft: ExerciseDraftByDay;
  /** Volume snapshot from the current draft — must not be null when auto-fill runs. */
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

// ─── buildDayFetchUrl (unchanged) ─────────────────────────────────────────────

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

// ─── buildTrialPreviewBody ────────────────────────────────────────────────────

/**
 * Builds a volume-preview request body that includes all existing draft
 * exercises PLUS all unique candidate exercises at workingSets=1.
 *
 * Candidate entries use synthetic exerciseEntryIds ≥ 100_000 (unique per
 * day × candidate index) so they can be identified in the response.
 *
 * One call per runAutoFill invocation extracts coefficients for all candidates
 * simultaneously — no per-candidate or per-set-count HTTP calls required.
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
      workingSets: 1, // 1 set → response coefficient = effectiveSets / 1 = effectiveSets
    }));
    return {
      dayId: day.dayIndex + 1,
      dayName: day.dayName,
      exercises: [...existing, ...candidates],
    };
  });
  return { clientId, days };
}

// ─── extractCandidateCoefficients ────────────────────────────────────────────

/**
 * Extracts Map<exerciseId, Map<targetId, coefficient>> from the trial response.
 *
 * Only entries for candidate exercise IDs are extracted (existing-draft
 * exercises are ignored).  The coefficient is the backend's max-coefficient
 * value per (exercise, target) pair — day-independent.
 *
 * If the same exercise appears in multiple days of the trial, the highest
 * coefficient seen across all days is kept (they should be identical; max
 * guards against floating-point noise).
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
        if (!result.has(contrib.exerciseId)) {
          result.set(contrib.exerciseId, new Map());
        }
        const targetMap = result.get(contrib.exerciseId)!;
        const current = targetMap.get(muscle.targetId) ?? 0;
        if (contrib.coefficient > current) {
          targetMap.set(muscle.targetId, contrib.coefficient);
        }
      }
    }
  }
  return result;
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * Score tuple for one (candidate, sets) combination.
 * All components: lower is better.
 * [totalWeeklyOvershoot, numExceededTargets, totalDailyOvershoot, totalRemaining, sets]
 */
type ScoreTuple = readonly [number, number, number, number, number];

function scoreBetter(a: ScoreTuple, b: ScoreTuple): boolean {
  for (let i = 0; i < 5; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false; // equal
}

/**
 * Returns the score tuple for adding `sets` working sets of a candidate to the
 * plan, or null if this combination violates an overshoot constraint.
 *
 * Evaluates EVERY target the candidate contributes to — not only the primary
 * target for which it was recommended.
 */
function computeSetScore(
  sets: number,
  coeffs: ReadonlyMap<number, number>,
  weeklyTargets: ReadonlyMap<number, AutoFillWeeklyTarget>,
  weeklyBaseFn: (targetId: number) => number,
  dailyContextMap: ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>,
  dailyBaseFn: (targetId: number) => number,
): ScoreTuple | null {
  let totalWeeklyOvershoot = 0;
  let numExceeded = 0;
  let totalDailyOvershoot = 0;
  let totalRemaining = 0;

  for (const [targetId, coeff] of coeffs) {
    if (coeff <= 0) continue;

    // ── Weekly ──
    const wt = weeklyTargets.get(targetId);
    if (wt?.hasGuideline) {
      if (wt.isManuallyOvershot) return null; // never worsen manual weekly overshoot
      const newWeekly = weeklyBaseFn(targetId) + coeff * sets;
      if (newWeekly > wt.weeklyPreferredCeiling + OVERSHOOT_TOLERANCE) return null;
      if (newWeekly > wt.weeklyPreferredCeiling) {
        totalWeeklyOvershoot += newWeekly - wt.weeklyPreferredCeiling;
        numExceeded++;
      }
      totalRemaining += Math.max(0, wt.weeklyPreferredCeiling - newWeekly);
    }

    // ── Daily ──
    const dc = dailyContextMap.get(targetId);
    if (dc) {
      if (dc.isDailyOvershot) return null; // never worsen manual daily overshoot
      const newDaily = dailyBaseFn(targetId) + coeff * sets;
      if (newDaily > dc.sessionMax + OVERSHOOT_TOLERANCE) return null;
      if (newDaily > dc.sessionMax) {
        totalDailyOvershoot += newDaily - dc.sessionMax;
      }
    }
  }

  return [totalWeeklyOvershoot, numExceeded, totalDailyOvershoot, totalRemaining, sets];
}

// ─── selectExercisesForDay ────────────────────────────────────────────────────

/**
 * Volume-aware exercise selection for one workout day.
 *
 * For each uncovered target (in orderedTargets priority order):
 *   - Considers all matching candidates (up to MAX_PER_TARGET from the API).
 *   - Evaluates set counts 1–6 per candidate using the backend-provided
 *     coefficients.  Rejects (candidate, sets) pairs that violate overshoot
 *     constraints.
 *   - Selects the globally best (candidate, sets) pair by the deterministic
 *     priority order.
 *   - Marks every target the selected exercise covers as resolved.
 *
 * Variety: `exercisesUsedInOtherDays` are sorted to the end of the candidate
 * list so fresh exercises are tried first within each target pass.
 *
 * Pure function — same inputs always produce the same output.
 *
 * Volume params default to empty maps for backward compatibility in tests that
 * do not need volume-aware selection.
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
  dailyContext: ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }> = new Map(),
  candidateCoefficients: ReadonlyMap<number, ReadonlyMap<number, number>> = new Map(),
  weeklyAddedByPreviousDays: ReadonlyMap<number, number> = new Map(),
  exercisesUsedInOtherDays: ReadonlySet<number> = new Set(),
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

  // Running weekly and daily additions from exercises already selected this pass
  const weeklyAddedThisDay = new Map<number, number>();
  const dailyAddedThisDay = new Map<number, number>();

  // Closure over running totals for score computation
  const weeklyBase = (id: number): number =>
    (weeklyTargets.get(id)?.effectiveSets ?? 0)
    + (weeklyAddedByPreviousDays.get(id) ?? 0)
    + (weeklyAddedThisDay.get(id) ?? 0);

  const dailyBase = (id: number): number =>
    (dailyContext.get(id)?.effectiveSets ?? 0)
    + (dailyAddedThisDay.get(id) ?? 0);

  // Commit a selected (candidate, sets) pair and update running totals
  function commitExercise(
    rec: AutoFillRecExercise,
    sets: number,
    isCore: boolean,
  ) {
    toAdd.push({
      exerciseId: rec.id,
      exerciseName: rec.name,
      mainMuscleGroup: rec.mainMuscleGroup,
      equipment: rec.equipment,
      isCore,
      sets,
    });
    addedIds.add(rec.id);
    currentCount++;
    currentSets += sets;

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

  // Find best (sets, score) for a given candidate
  function bestSetCount(
    rec: AutoFillRecExercise,
  ): { sets: number; score: ScoreTuple } | null {
    const coeffs: ReadonlyMap<number, number> = candidateCoefficients.get(rec.id) ?? new Map();
    let best: { sets: number; score: ScoreTuple } | null = null;

    for (let sets = 1; sets <= MAX_WORKING_SETS; sets++) {
      if (currentSets + sets > MAX_DAY_SETS) continue;

      const score = computeSetScore(sets, coeffs, weeklyTargets, weeklyBase, dailyContext, dailyBase);
      if (score === null) continue;

      if (best === null || scoreBetter(score, best.score)) {
        best = { sets, score };
      }
    }

    // Fallback for candidates with no coefficient data: use DRAFT_EXERCISE_DEFAULTS.sets
    // if it fits and no volume-aware option was found.
    if (best === null && (candidateCoefficients.get(rec.id)?.size ?? 0) === 0) {
      const fallbackSets = DRAFT_EXERCISE_DEFAULTS.sets;
      if (currentSets + fallbackSets <= MAX_DAY_SETS) {
        best = { sets: fallbackSets, score: [0, 0, 0, 0, fallbackSets] };
      }
    }

    return best;
  }

  // ── Phase 1: normal targets ───────────────────────────────────────────────

  for (const target of orderedTargets) {
    if (resolvedTargetIdSet.has(target.targetId)) continue;

    // At least 1 set must fit
    if (currentCount >= MAX_DAY_EXERCISES || currentSets + 1 > MAX_DAY_SETS) {
      unresolvedTargets.push(target);
      limitHit = true;
      continue;
    }

    // Sort: fresh exercises first (variety), then exercises used in other days.
    // Within each group, original recommendation order (score order) is preserved.
    const sortedRecs = [...recommendations].sort((a, b) => {
      const aUsed = exercisesUsedInOtherDays.has(a.id) ? 1 : 0;
      const bUsed = exercisesUsedInOtherDays.has(b.id) ? 1 : 0;
      return aUsed - bUsed;
    });

    let bestChoice: { candidate: AutoFillRecExercise; sets: number; score: ScoreTuple } | null = null;

    for (const rec of sortedRecs) {
      if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
      if (addedIds.has(rec.id)) continue;
      if (!rec.matchingTargetIds.includes(target.targetId)) continue;

      const result = bestSetCount(rec);
      if (result === null) continue; // no valid set count — skip this candidate

      if (bestChoice === null || scoreBetter(result.score, bestChoice.score)) {
        bestChoice = { candidate: rec, sets: result.sets, score: result.score };
      }
      // Equal score: first candidate (higher-ranked) already stored → no update
    }

    if (bestChoice !== null) {
      commitExercise(bestChoice.candidate, bestChoice.sets, false);

      // Resolve all targets this exercise covers (multi-target deduplication)
      for (const t of orderedTargets) {
        if (
          bestChoice.candidate.matchingTargetIds.includes(t.targetId) &&
          !resolvedTargetIdSet.has(t.targetId)
        ) {
          resolvedTargetIdSet.add(t.targetId);
          resolvedTargets.push(t);
        }
      }
    } else {
      unresolvedTargets.push(target);
    }
  }

  // ── Phase 2: Core ─────────────────────────────────────────────────────────

  if (coreEligible) {
    if (currentCount >= MAX_DAY_EXERCISES || currentSets + 1 > MAX_DAY_SETS) {
      limitHit = true;
    } else {
      // Prefer core exercises not used in other days (variety)
      const coreRecs = [...recommendations].filter(r => r.mainMuscleGroup === CORE_MUSCLE_GROUP);
      coreRecs.sort((a, b) => {
        const aUsed = exercisesUsedInOtherDays.has(a.id) ? 1 : 0;
        const bUsed = exercisesUsedInOtherDays.has(b.id) ? 1 : 0;
        return aUsed - bUsed;
      });

      let bestCore: { candidate: AutoFillRecExercise; sets: number; score: ScoreTuple } | null = null;

      for (const rec of coreRecs) {
        if (rec.isAvoided || avoidedExerciseIds.has(rec.id)) continue;
        if (addedIds.has(rec.id)) continue;

        const result = bestSetCount(rec);
        if (result === null) continue;

        if (bestCore === null || scoreBetter(result.score, bestCore.score)) {
          bestCore = { candidate: rec, sets: result.sets, score: result.score };
        }
      }

      if (bestCore !== null) {
        commitExercise(bestCore.candidate, bestCore.sets, true);
        coreAdded = true;
      }
    }
  }

  return { dayIndex, toAdd, resolvedTargets, unresolvedTargets, coreAdded, limitHit };
}

// ─── computeAutoFillSummary (unchanged) ──────────────────────────────────────

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
 * Orchestrates volume-aware auto-fill for all days.
 *
 * Network calls (all bounded):
 *   - 1 recommendation GET per day to process (parallel)
 *   - 1 trial POST /api/plans/volume-preview (single call, all candidates)
 *
 * Selection (pure, no I/O):
 *   - Days are processed sequentially so inter-day weekly additions and the
 *     exercisesUsedInOtherDays variety set accumulate correctly.
 *
 * Atomic guarantee: if any fetch fails the function returns RunAutoFillFailure
 * without emitting any AutoFillDayResult.  The caller must not modify the draft.
 *
 * `previewFetcher` is injectable so tests can mock the trial preview call.
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

  // 1. Parallel: fetch recommendations for all days requiring them
  const dayUrls = daysToProcess.map((day) =>
    buildDayFetchUrl(
      clientId,
      day.broadCategories,
      day.orderedTargets.map((t) => t.targetId),
      day.coreEligible,
      day.alreadyAddedExerciseIds,
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

  // 2. Enrich each exercise with exact matchingTargetIds (existing logic)
  const enriched = daysToProcess.map((day, i) => {
    const nameToId = new Map(day.orderedTargets.map((t) => [t.targetName, t.targetId]));
    return (responsesExercises[i] ?? []).map((ex) => ({
      ...ex,
      matchingTargetIds: ex.matchingTargets
        .map((name) => nameToId.get(name))
        .filter((id): id is number => id !== undefined),
    }));
  });

  // 3. One trial preview call to extract candidate coefficients
  const candidatesPerDayIndex = new Map<number, ReadonlyArray<{ id: number }>>(
    daysToProcess.map((day, i) => [day.dayIndex, enriched[i] ?? []]),
  );
  const allCandidateIds = new Set<number>(
    daysToProcess.flatMap((_, i) => (enriched[i] ?? []).map((e) => e.id)),
  );

  let candidateCoefficients: Map<number, Map<number, number>>;
  try {
    const trialBody = buildTrialPreviewBody(
      clientId,
      allDistributionDays,
      currentDraft,
      candidatesPerDayIndex,
    );
    const trialResponse = await previewFetcher(trialBody);
    candidateCoefficients = extractCandidateCoefficients(trialResponse, allCandidateIds);
  } catch {
    // If the trial call fails, fall back to no volume data (defaults kick in)
    candidateCoefficients = new Map();
  }

  // 4. Build weekly context from currentPreviewResult
  const weeklyTargets = new Map<number, AutoFillWeeklyTarget>(
    currentPreviewResult.weekly.map((w) => [w.targetId, w]),
  );

  // 5. Sequential selection (inter-day weekly accumulation + variety tracking)
  const weeklyAddedCumulative = new Map<number, number>();
  const exercisesUsedInOtherDays = new Set<number>();

  const dayResults: AutoFillDayResult[] = [];

  for (let i = 0; i < daysToProcess.length; i++) {
    const day = daysToProcess[i]!;
    const syntheticDayId = day.dayIndex + 1;

    // Build daily context from currentPreviewResult for this day
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
    );

    dayResults.push(result);

    // Update cumulative state for subsequent days
    for (const added of result.toAdd) {
      exercisesUsedInOtherDays.add(added.exerciseId);
      const coeffs = candidateCoefficients.get(added.exerciseId);
      if (coeffs) {
        for (const [tid, coeff] of coeffs) {
          if (coeff > 0) {
            weeklyAddedCumulative.set(
              tid,
              (weeklyAddedCumulative.get(tid) ?? 0) + coeff * added.sets,
            );
          }
        }
      }
    }
  }

  const summary = computeAutoFillSummary(dayResults, skippedDayCount);
  return { ok: true, dayResults, summary };
}
