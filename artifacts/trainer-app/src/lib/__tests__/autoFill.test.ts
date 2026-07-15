/**
 * Auto-Fill Phase 4E — focused unit tests
 *
 * Covers all 12 required cases from the MVP Blocker Fix spec plus the
 * unchanged-behaviour cases that still apply (deduplication, limits, etc.).
 *
 * All tests target pure functions only.  The trial preview fetcher is mocked
 * in runAutoFill tests so no real HTTP calls occur.
 */

import { describe, it, expect, vi } from "vitest";
import {
  selectExercisesForDay,
  buildDayFetchUrl,
  buildTrialPreviewBody,
  extractCandidateCoefficients,
  computeAutoFillSummary,
  runAutoFill,
  MAX_DAY_EXERCISES,
  MAX_DAY_SETS,
  type AutoFillRecExercise,
  type AutoFillDayTarget,
  type RunAutoFillDayInput,
  type AutoFillWeeklyTarget,
  type AutoFillVolumeSnapshot,
  type TrialPreviewBody,
} from "../autoFill";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRec(
  id: number,
  targets: Array<{ targetId: number; targetName: string }>,
  overrides: Partial<Omit<AutoFillRecExercise, "id" | "matchingTargets" | "matchingTargetIds">> = {},
): AutoFillRecExercise {
  return {
    id,
    name: `Exercise ${id}`,
    mainMuscleGroup: "Plecy",
    matchingTargets: targets.map((t) => t.targetName),
    matchingTargetIds: targets.map((t) => t.targetId),
    equipment: [],
    isAvoided: false,
    ...overrides,
  };
}

function makeCoreRec(id: number): AutoFillRecExercise {
  return {
    id,
    name: `Core ${id}`,
    mainMuscleGroup: "Brzuch",
    matchingTargets: [],
    matchingTargetIds: [],
    equipment: [],
    isAvoided: false,
  };
}

const latTarget: AutoFillDayTarget = { targetId: 1, targetName: "Latissimus dorsi" };
const bicTarget: AutoFillDayTarget = { targetId: 2, targetName: "Biceps" };
const gluteTarget: AutoFillDayTarget = { targetId: 3, targetName: "Glutes" };

const NO_AVOIDED = new Set<number>();
const EMPTY_WEEKLY = new Map<number, AutoFillWeeklyTarget>();
const EMPTY_DAILY = new Map<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>();
const EMPTY_COEFFS = new Map<number, ReadonlyMap<number, number>>();
const EMPTY_PREV_DAYS = new Map<number, number>();
const EMPTY_USED = new Set<number>();

/** Build a weekly target entry. */
function makeWeeklyTarget(
  targetId: number,
  effectiveSets: number,
  weeklyPreferredCeiling: number,
  isManuallyOvershot = false,
): AutoFillWeeklyTarget {
  return {
    targetId,
    effectiveSets,
    weeklyPreferredCeiling,
    hasGuideline: true,
    isManuallyOvershot,
  };
}

/** Build a minimal AutoFillVolumeSnapshot for runAutoFill tests. */
function makeSnapshot(
  weekly: AutoFillWeeklyTarget[] = [],
  days: AutoFillVolumeSnapshot["days"] = [],
): AutoFillVolumeSnapshot {
  return { weekly, days };
}

/** Build a minimal RunAutoFillDayInput. */
function makeDay(overrides: Partial<RunAutoFillDayInput> = {}): RunAutoFillDayInput {
  return {
    dayIndex: 0,
    broadCategories: ["Plecy"],
    orderedTargets: [latTarget],
    coreEligible: false,
    existingExerciseCount: 0,
    existingSetCount: 0,
    alreadyAddedExerciseIds: [],
    ...overrides,
  };
}

const MOCK_EMPTY_PREVIEW: AutoFillVolumeSnapshot = makeSnapshot();

async function noOpPreviewFetcher(_body: TrialPreviewBody): Promise<AutoFillVolumeSnapshot> {
  return MOCK_EMPTY_PREVIEW;
}

// ─── Case 1: A 7-point target is not increased to 24 points ──────────────────

describe("Case 1 — weekly overshoot protection: 7-point target stays ≤ 7.5", () => {
  it("rejects set counts that would push Lat from 0 to 24 (coeff=1, 8 sets each × 3 exercises)", () => {
    // Planned = 7, current = 0, coeff = 1.0
    // Sets 8 → 8 effective → overshoot = 1 > 0.5 → reject
    // Sets 7 → 7 effective → overshoot = 0 → accept
    // Algorithm should pick sets = 7 (within tolerance)
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 0, 7)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(1);
    const sets = result.toAdd[0]!.sets;
    // Weekly = 0 + 1.0 × sets ≤ 7.5 → sets ≤ 7; and maximizes coverage → sets = 7
    expect(sets).toBeLessThanOrEqual(7);
    // Must not result in 24-set overshoot
    const effective = sets * 1.0;
    expect(effective).toBeLessThanOrEqual(7 + 0.5);
  });

  it("leaves a small deficit when all valid set counts still overshoot beyond tolerance", () => {
    // Planned = 7, current = 6.6, coeff = 1.0
    // sets=1 → 7.6 → overshoot = 0.6 > 0.5 → reject
    // No valid set count → unresolved
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 6.6, 7)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    // 0.4 deficit is acceptable; large overshoot is not
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });
});

// ─── Case 2: A covered target is not used as a reason ─────────────────────────

describe("Case 2 — covered target is not added via orderedTargets", () => {
  it("already-resolved target is skipped without adding a second exercise", () => {
    // lat + bic both in orderedTargets; rec10 covers both; rec20 also covers bic
    // After rec10 is selected, bic must not generate rec20
    const rec10 = makeRec(10, [latTarget, bicTarget]);
    const rec20 = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, [rec10, rec20], 0, 0, NO_AVOIDED,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10);
    expect(result.unresolvedTargets).toHaveLength(0);
  });
});

// ─── Case 3: An exercise is evaluated against ALL targets it affects ──────────

describe("Case 3 — multi-target overshoot check", () => {
  it("rejects a candidate if it overshoots a secondary target (Biceps) beyond tolerance", () => {
    // Lat: planned=7, current=0 → needs coverage
    // Bic: planned=4, current=4.0 → at ceiling
    // rec10 covers Lat (coeff=1) AND Bic (coeff=0.8)
    // sets=1 → Bic new=4.8 > 4.5 → reject
    // No valid sets → unresolved
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 0, 7)],
      [bicTarget.targetId, makeWeeklyTarget(bicTarget.targetId, 4.0, 4)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 0.8]])],
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("accepts a candidate when secondary target has room and primary is covered", () => {
    // Lat: planned=7, current=0  Bic: planned=4, current=2
    // sets=1 → Lat=1, Bic=0.8 → both fine
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 0, 7)],
      [bicTarget.targetId, makeWeeklyTarget(bicTarget.targetId, 2, 4)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 0.8]])],
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(1);
  });
});

// ─── Case 4: Sets are selected dynamically from 1–6 ─────────────────────────

describe("Case 4 — dynamic set count selection", () => {
  it("chooses sets=4 when that is the highest count that fits within the 7-point ceiling", () => {
    // Planned=7, current=5, coeff=0.5
    // sets=4 → 5 + 2 = 7 → remaining=0, no overshoot → best
    // sets=5 → 7.5 → within tolerance (overshoot=0.5) → still valid but higher overshoot
    // By priority 1 (min overshoot): sets=4 wins (overshoot=0 vs 0.5)
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 5, 7)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 0.5]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd[0]?.sets).toBe(4);
  });

  it("does not always use 3 sets — uses 1 when planned ceiling is already nearly full", () => {
    // Planned=7, current=6.5, coeff=1.0
    // sets=1 → 7.5 → within tolerance
    // sets=2 → 8.5 → exceeds 7.5 → reject
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 6.5, 7)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd[0]?.sets).toBe(1);
  });

  it("picks higher set count to fill remaining volume when no overshoot occurs", () => {
    // Planned=6, current=0, coeff=2.0
    // sets=1 → 2 (rem=4), sets=2 → 4 (rem=2), sets=3 → 6 (rem=0), sets=4 → 8 > 6.5 → reject
    // Best: sets=3 (minimizes remaining=0)
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 0, 6)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 2.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd[0]?.sets).toBe(3);
  });
});

// ─── Case 5: Small deficit preferred over large overshoot ─────────────────────

describe("Case 5 — deficit preferred over overshoot beyond tolerance", () => {
  it("leaves the target unresolved when no set count stays within tolerance", () => {
    // Planned=4, current=3.7, coeff=1.5
    // sets=1 → 5.2 → overshoot=1.2 > 0.5 → reject
    const weeklyTargets = new Map([
      [bicTarget.targetId, makeWeeklyTarget(bicTarget.targetId, 3.7, 4)],
    ]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 1.5]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    // Deficit of 0.3 is acceptable — large overshoot of 1.2 is not
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("accepts a borderline 0.5-overshoot rather than leaving the target uncovered", () => {
    // Planned=4, current=3.5, coeff=1.0
    // sets=1 → 4.5 → overshoot=0.5 exactly (≤ tolerance) → accepted
    const weeklyTargets = new Map([
      [bicTarget.targetId, makeWeeklyTarget(bicTarget.targetId, 3.5, 4)],
    ]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 1.0]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.sets).toBe(1);
  });
});

// ─── Case 6: Existing manual overshoot is not worsened ───────────────────────

describe("Case 6 — manual overshoot is never increased", () => {
  it("rejects all set counts for a candidate that contributes to an already-overshot target", () => {
    // Lat is manually overshot (12 > 7): isManuallyOvershot = true
    // Any addition to Lat → rejected
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 12, 7, true)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],  // contributes only to overshot target
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("accepts a candidate that has zero coefficient for the overshot target", () => {
    // Glute is overshot; exercise only covers Lat (not Glute)
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 0, 7)],
      [gluteTarget.targetId, makeWeeklyTarget(gluteTarget.targetId, 20, 10, true)],
    ]);
    // Exercise 10 covers only Lat (coeff=1), does NOT touch Glute
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(1);
  });
});

// ─── Case 7: Manual exercises remain unchanged ────────────────────────────────

describe("Case 7 — manual exercises are not touched", () => {
  it("selectExercisesForDay only returns additions (toAdd), never removals", () => {
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 2, 6, NO_AVOIDED,
    );
    // Only new exercises appear in toAdd; existing manual entries are not referenced
    expect(result.toAdd.every((e) => e.exerciseId === 10)).toBe(true);
  });

  it("runAutoFill returns only toAdd — the component applies them on top of the existing draft", async () => {
    const fetcher = vi.fn(async () => [makeRec(10, [latTarget])]);
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {},
        currentPreviewResult: MOCK_EMPTY_PREVIEW,
      },
      fetcher,
      noOpPreviewFetcher,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The result only instructs what to ADD — existing exercises are unchanged
      expect(result.dayResults[0]?.toAdd[0]?.exerciseId).toBe(10);
    }
  });
});

// ─── Case 8: Same exercise not duplicated within one day ──────────────────────

describe("Case 8 — no duplicate exercise within one day", () => {
  it("an exercise selected for one target is not added again for another target", () => {
    // rec10 covers both lat and bic; should only appear once
    const rec = makeRec(10, [latTarget, bicTarget]);
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, [rec], 0, 0, NO_AVOIDED,
    );
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids.filter((id) => id === 10)).toHaveLength(1);
  });

  it("two separate exercises each covering a different uncovered target are both added", () => {
    const recs = [makeRec(10, [latTarget]), makeRec(20, [bicTarget])];
    const result = selectExercisesForDay(0, [latTarget, bicTarget], false, recs, 0, 0, NO_AVOIDED);
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(10);
    expect(ids).toContain(20);
    expect(ids.length).toBe(2);
  });
});

// ─── Case 9: Repeated split days use different exercises ──────────────────────

describe("Case 9 — variety across repeated split days", () => {
  it("exercise used in day 1 is sorted last for day 2 when an alternative exists", () => {
    // Exercise 10 used in day 1; exercise 20 not used.
    // Both cover Lat equally. Day 2 should prefer exercise 20.
    const usedInOtherDays = new Set([10]);
    const rec10 = makeRec(10, [latTarget]);
    const rec20 = makeRec(20, [latTarget]);

    const result = selectExercisesForDay(
      1, [latTarget], false, [rec10, rec20], 0, 0, NO_AVOIDED,
      EMPTY_WEEKLY, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS,
      usedInOtherDays,
    );

    expect(result.toAdd).toHaveLength(1);
    // With no volume data, both score equally; fresh exercise (20) goes first → selected
    expect(result.toAdd[0]?.exerciseId).toBe(20);
  });

  it("falls back to the used exercise when no alternative covers the target", () => {
    const usedInOtherDays = new Set([10]);
    const rec10 = makeRec(10, [latTarget]);

    const result = selectExercisesForDay(
      1, [latTarget], false, [rec10], 0, 0, NO_AVOIDED,
      EMPTY_WEEKLY, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS,
      usedInOtherDays,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10); // only option — still added
  });

  it("runAutoFill tracks exercisesUsedInOtherDays across sequentially processed days", async () => {
    // Day 0 will get rec10 for lat; Day 1 should prefer rec20 for lat
    const selectedUrls: string[] = [];
    let callCount = 0;
    const recFetcher = vi.fn(async (url: string) => {
      selectedUrls.push(url);
      callCount++;
      // Both days receive rec10 and rec20 as candidates
      return [makeRec(10, [latTarget]), makeRec(20, [latTarget])];
    });

    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [
          makeDay({ dayIndex: 0 }),
          makeDay({ dayIndex: 1 }),
        ],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [
          { dayIndex: 0, dayName: "Upper 1" },
          { dayIndex: 1, dayName: "Upper 2" },
        ],
        currentDraft: {},
        currentPreviewResult: MOCK_EMPTY_PREVIEW,
      },
      recFetcher,
      noOpPreviewFetcher,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Day 0 picks rec10 (first in list, no variety constraint yet)
      // Day 1 should pick rec20 (rec10 is in exercisesUsedInOtherDays → sorted last)
      const day0ExId = result.dayResults[0]?.toAdd[0]?.exerciseId;
      const day1ExId = result.dayResults[1]?.toAdd[0]?.exerciseId;
      expect(day0ExId).not.toBe(day1ExId); // different exercises
      expect(new Set([day0ExId, day1ExId])).toEqual(new Set([10, 20]));
    }
  });
});

// ─── Case 10: One compound exercise addresses multiple target IDs once ─────────

describe("Case 10 — compound exercise resolves multiple targets in one addition", () => {
  it("exercise covering two targets is added once and marks both as resolved", () => {
    const rec = makeRec(10, [latTarget, bicTarget]);
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, [rec], 0, 0, NO_AVOIDED,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10);
    const resolvedIds = result.resolvedTargets.map((t) => t.targetId);
    expect(resolvedIds).toContain(latTarget.targetId);
    expect(resolvedIds).toContain(bicTarget.targetId);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  it("a third exercise is not added for a target already resolved by the compound exercise", () => {
    const rec10 = makeRec(10, [latTarget, bicTarget]);
    const rec30 = makeRec(30, [bicTarget]); // also covers bic
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, [rec10, rec30], 0, 0, NO_AVOIDED,
    );
    expect(result.toAdd).toHaveLength(1);
  });
});

// ─── Case 11: No database writes occur ───────────────────────────────────────

describe("Case 11 — no database writes", () => {
  it("buildDayFetchUrl produces only GET recommendation endpoint URLs", () => {
    const url = buildDayFetchUrl(1, ["Plecy"], [1, 2], false, [5]);
    expect(url).toMatch(/\/plan-draft\/day-recommendations/);
    expect(url).not.toMatch(/\/save|\/activate|\/create|\/update|\/delete/);
  });

  it("runAutoFill only calls recommendation endpoints and the volume-preview POST (read-only)", async () => {
    const recUrls: string[] = [];
    const previewBodies: TrialPreviewBody[] = [];
    const recFetcher = vi.fn(async (url: string) => {
      recUrls.push(url);
      return [makeRec(10, [latTarget])];
    });
    const previewFetcher = vi.fn(async (body: TrialPreviewBody) => {
      previewBodies.push(body);
      return MOCK_EMPTY_PREVIEW;
    });

    await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {},
        currentPreviewResult: MOCK_EMPTY_PREVIEW,
      },
      recFetcher,
      previewFetcher,
    );

    // Exactly 1 recommendation call (read-only GET)
    expect(recFetcher).toHaveBeenCalledTimes(1);
    expect(recUrls[0]).toMatch(/plan-draft\/day-recommendations/);

    // Exactly 1 trial preview call (POST /api/plans/volume-preview — read-only, no DB writes)
    expect(previewFetcher).toHaveBeenCalledTimes(1);
    expect(previewBodies[0]?.days).toBeDefined();
  });
});

// ─── Case 12: Process terminates when no candidate improves the result ────────

describe("Case 12 — terminates when no valid candidate exists", () => {
  it("reports target as unresolved and does not loop when all candidates are rejected", () => {
    // All candidates cause overshoot beyond tolerance → none accepted → unresolved
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 7, 7)],  // at ceiling
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);

    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    // sets=1 → 8 > 7.5 → reject. No valid set count. Unresolved.
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.targetId).toBe(latTarget.targetId);
  });

  it("stops filling when no remaining unresolved target has any valid candidate", () => {
    // Two targets, both at ceiling — no valid adds
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeeklyTarget(latTarget.targetId, 7, 7)],
      [bicTarget.targetId, makeWeeklyTarget(bicTarget.targetId, 4, 4)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],
      [20, new Map([[bicTarget.targetId, 1.0]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [bicTarget])];
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(2);
  });
});

// ─── Unchanged behaviour tests ────────────────────────────────────────────────

describe("selectExercisesForDay() — unchanged behaviour", () => {
  it("avoided exercise is not added (isAvoided flag)", () => {
    const rec = makeRec(10, [latTarget], { isAvoided: true });
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("avoided exercise is not added (avoidedExerciseIds set)", () => {
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, new Set([10]));
    expect(result.toAdd).toHaveLength(0);
  });

  it("exact targetId matching rejects a rec with wrong ID", () => {
    const wrongIdRec: AutoFillRecExercise = {
      id: 10, name: "Ex", mainMuscleGroup: "Plecy",
      matchingTargets: ["Latissimus dorsi"],
      matchingTargetIds: [99], // wrong ID
      equipment: [], isAvoided: false,
    };
    const result = selectExercisesForDay(0, [latTarget], false, [wrongIdRec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("Core exercise is added once with isCore=true", () => {
    const normalRec = makeRec(10, [latTarget]);
    const coreRec = makeCoreRec(50);
    const result = selectExercisesForDay(0, [latTarget], true, [normalRec, coreRec], 0, 0, NO_AVOIDED);
    const coreAdded = result.toAdd.filter((e) => e.isCore);
    expect(coreAdded).toHaveLength(1);
    expect(result.coreAdded).toBe(true);
    expect(result.toAdd[result.toAdd.length - 1]?.isCore).toBe(true);
  });

  it("Core is not added when includeCore=false", () => {
    const result = selectExercisesForDay(0, [], false, [makeCoreRec(50)], 0, 0, NO_AVOIDED);
    expect(result.coreAdded).toBe(false);
    expect(result.toAdd).toHaveLength(0);
  });

  it("enforces MAX_DAY_EXERCISES limit", () => {
    const recs = [makeRec(1, [latTarget]), makeRec(2, [bicTarget])];
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, recs, MAX_DAY_EXERCISES, 0, NO_AVOIDED,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.limitHit).toBe(true);
  });

  it("enforces MAX_DAY_SETS limit", () => {
    // MAX_DAY_SETS = 24; even 1 set would exceed it
    const recs = [makeRec(1, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, MAX_DAY_SETS, NO_AVOIDED,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.limitHit).toBe(true);
  });
});

// ─── buildDayFetchUrl (unchanged) ────────────────────────────────────────────

describe("buildDayFetchUrl()", () => {
  it("includes uncovered targetIds", () => {
    const url = buildDayFetchUrl(42, [], [1, 2], false, []);
    expect(url).toContain("uncoveredTargetIds=1%2C2");
  });

  it("includes includeCore=true when coreEligible", () => {
    const url = buildDayFetchUrl(42, [], [], true, []);
    expect(url).toContain("includeCore=true");
  });

  it("omits includeCore when not eligible", () => {
    const url = buildDayFetchUrl(42, [], [1], false, []);
    expect(url).not.toContain("includeCore");
  });

  it("uses correct client ID in path", () => {
    const url = buildDayFetchUrl(99, [], [1], false, []);
    expect(url).toContain("/api/clients/99/plan-draft/day-recommendations");
  });
});

// ─── buildTrialPreviewBody ────────────────────────────────────────────────────

describe("buildTrialPreviewBody()", () => {
  it("adds existing draft exercises with normal synthetic IDs (< 100000)", () => {
    const draft = { 0: [{ exerciseId: 5, sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 90, localId: "l1", order: 0, exerciseName: "Ex", mainMuscleGroup: "Plecy", equipment: [], isCore: false }] };
    const body = buildTrialPreviewBody(1, [{ dayIndex: 0, dayName: null }], draft, new Map());
    const existingEntry = body.days[0]?.exercises.find((e) => e.exerciseId === 5);
    expect(existingEntry).toBeDefined();
    expect(existingEntry!.exerciseEntryId).toBeLessThan(100_000);
    expect(existingEntry!.workingSets).toBe(3);
  });

  it("adds candidate exercises with exerciseEntryId ≥ 100000 at workingSets=1", () => {
    const candidates = new Map([[0, [{ id: 42 }]]]);
    const body = buildTrialPreviewBody(1, [{ dayIndex: 0, dayName: null }], {}, candidates);
    const candidateEntry = body.days[0]?.exercises.find((e) => e.exerciseId === 42);
    expect(candidateEntry).toBeDefined();
    expect(candidateEntry!.exerciseEntryId).toBeGreaterThanOrEqual(100_000);
    expect(candidateEntry!.workingSets).toBe(1);
  });
});

// ─── extractCandidateCoefficients ────────────────────────────────────────────

describe("extractCandidateCoefficients()", () => {
  it("extracts coefficient for a candidate exercise from trial response", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [{
        dayId: 1,
        muscles: [{
          targetId: 1, effectiveSets: 1, sessionMax: 5, isDailyOvershot: false,
          contributions: [{ exerciseId: 42, coefficient: 0.8 }],
        }],
      }],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([42]));
    expect(coeffs.get(42)?.get(1)).toBeCloseTo(0.8);
  });

  it("ignores existing-draft exercises (not in allCandidateIds)", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [{
        dayId: 1,
        muscles: [{
          targetId: 1, effectiveSets: 3, sessionMax: 5, isDailyOvershot: false,
          contributions: [
            { exerciseId: 5, coefficient: 1.0 },  // existing draft exercise
            { exerciseId: 42, coefficient: 0.8 }, // candidate
          ],
        }],
      }],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([42])); // only 42 is a candidate
    expect(coeffs.has(5)).toBe(false);
    expect(coeffs.has(42)).toBe(true);
  });

  it("uses max coefficient when the same exercise appears in multiple days", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [
        {
          dayId: 1,
          muscles: [{ targetId: 1, effectiveSets: 1, sessionMax: 5, isDailyOvershot: false, contributions: [{ exerciseId: 42, coefficient: 0.7 }] }],
        },
        {
          dayId: 2,
          muscles: [{ targetId: 1, effectiveSets: 1, sessionMax: 5, isDailyOvershot: false, contributions: [{ exerciseId: 42, coefficient: 0.9 }] }],
        },
      ],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([42]));
    expect(coeffs.get(42)?.get(1)).toBeCloseTo(0.9); // max
  });
});

// ─── runAutoFill (orchestration) ──────────────────────────────────────────────

describe("runAutoFill()", () => {
  it("fires exactly one recommendation request per required day (parallel)", async () => {
    const fetcher = vi.fn(async () => [makeRec(10, [latTarget])]);
    const days = [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 2 })];
    await runAutoFill(
      { clientId: 1, daysToProcess: days, skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }, { dayIndex: 2, dayName: null }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      fetcher, noOpPreviewFetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fires exactly one trial preview call regardless of number of days", async () => {
    const previewFetcher = vi.fn(noOpPreviewFetcher);
    const days = [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 1 })];
    await runAutoFill(
      { clientId: 1, daysToProcess: days, skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }, { dayIndex: 1, dayName: null }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      vi.fn(async () => [makeRec(10, [latTarget])]),
      previewFetcher,
    );
    expect(previewFetcher).toHaveBeenCalledTimes(1);
  });

  it("enriches exercises with matchingTargetIds before selection", async () => {
    const rawRec: AutoFillRecExercise = {
      id: 10, name: "Pull-down", mainMuscleGroup: "Plecy",
      matchingTargets: ["Latissimus dorsi"],
      matchingTargetIds: [], // empty — as returned by the API
      equipment: [], isAvoided: false,
    };
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      async () => [rawRec],
      noOpPreviewFetcher,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dayResults[0]?.toAdd[0]?.exerciseId).toBe(10);
    }
  });

  it("returns failure when recommendation fetch fails (atomic, draft unchanged)", async () => {
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      async () => { throw new Error("Network error"); },
      noOpPreviewFetcher,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Nie udało się przygotować/);
  });

  it("continues with empty coefficients (fallback) when trial preview fails", async () => {
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      async () => [makeRec(10, [latTarget])],
      async () => { throw new Error("Preview failed"); },
    );
    // Falls back gracefully — still returns a result (uses DRAFT_EXERCISE_DEFAULTS.sets)
    expect(result.ok).toBe(true);
  });

  it("uses coefficient data from trial preview for dynamic set selection", async () => {
    // planned=7, current=0, coeff=1.0 from trial
    // Sets=7 → exactly fills ceiling → best choice
    const weeklyTargets: AutoFillWeeklyTarget[] = [
      { targetId: latTarget.targetId, effectiveSets: 0, weeklyPreferredCeiling: 7, hasGuideline: true, isManuallyOvershot: false },
    ];
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: weeklyTargets,
      days: [{
        dayId: 1,
        muscles: [{
          targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false,
          contributions: [{ exerciseId: 10, coefficient: 1.0 }],
        }],
      }],
    };

    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {},
        currentPreviewResult: { weekly: weeklyTargets, days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] }] },
      },
      async () => [makeRec(10, [latTarget])],
      async () => trialResponse,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sets = result.dayResults[0]?.toAdd[0]?.sets;
      // With coeff=1 and ceiling=7: sets should be 7 (fills exactly)
      // or 6 if sets > 6 is capped by MAX_WORKING_SETS=6 (ceiling 7 means sets=6→6, overshoot=0, remaining=1; sets=7 is capped)
      // MAX_WORKING_SETS = 6, so best valid = 6 (remaining=1, no overshoot)
      expect(sets).toBe(6);
    }
  });
});

// ─── computeAutoFillSummary (unchanged) ──────────────────────────────────────

describe("computeAutoFillSummary()", () => {
  it("sums totalAdded and daysUpdated across days", () => {
    const dayResults = [
      { dayIndex: 0, toAdd: [{ exerciseId: 1, exerciseName: "Ex1", mainMuscleGroup: "Plecy", equipment: [], isCore: false, sets: 3 }], resolvedTargets: [latTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
      { dayIndex: 1, toAdd: [{ exerciseId: 2, exerciseName: "Ex2", mainMuscleGroup: "Plecy", equipment: [], isCore: false, sets: 2 }], resolvedTargets: [bicTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
    ];
    const summary = computeAutoFillSummary(dayResults, 1);
    expect(summary.totalAdded).toBe(2);
    expect(summary.daysUpdated).toBe(2);
    expect(summary.daysCovered).toBe(1);
  });
});
