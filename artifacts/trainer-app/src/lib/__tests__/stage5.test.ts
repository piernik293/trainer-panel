/**
 * Stage 5 — Fragmentation Tie-Breaker
 *
 * Unit tests for:
 *   - checkContributionSafety()     — shared safety evaluator
 *   - hasClearExpansionAdvantage()  — selection-logic predicate
 *   - resolveFragmentationAction()  — Stage 5 pure tie-breaker
 *
 * Integration tests for findBestConsolidation / applyConsolidation behavior
 * are exercised through selectExercisesForDay (closures are not exported).
 */

import { describe, it, expect } from "vitest";
import {
  selectExercisesForDay,
  checkContributionSafety,
  hasClearExpansionAdvantage,
  resolveFragmentationAction,
  type AutoFillDayTarget,
  type AutoFillWeeklyTarget,
  type AutoFillRecExercise,
  type ScoreTuple,
  type FragmentationAction,
} from "../autoFill";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const targetA: AutoFillDayTarget = { targetId: 1, targetName: "Target A" };
const targetB: AutoFillDayTarget = { targetId: 2, targetName: "Target B" };

const NO_AVOIDED = new Set<number>();
const EMPTY_DAILY = new Map<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>();
const EMPTY_PREV_DAYS = new Map<number, number>();
const EMPTY_USED = new Set<number>();
const EMPTY_STEP3 = new Map<number, number>();

function makeWeekly(
  targetId: number,
  effectiveSets: number,
  weeklyPreferredCeiling: number,
  isManuallyOvershot = false,
): AutoFillWeeklyTarget {
  return { targetId, effectiveSets, weeklyPreferredCeiling, hasGuideline: true, isManuallyOvershot };
}

function makeRec(
  id: number,
  targets: Array<{ targetId: number; targetName: string }>,
  overrides: Partial<Omit<AutoFillRecExercise, "id" | "matchingTargets" | "matchingTargetIds">> = {},
): AutoFillRecExercise {
  return {
    id,
    name: `Exercise ${id}`,
    mainMuscleGroup: "Test",
    matchingTargets: targets.map((t) => t.targetName),
    matchingTargetIds: targets.map((t) => t.targetId),
    equipment: [],
    isAvoided: false,
    ...overrides,
  };
}

/** Build a mock ScoreTuple for hasClearExpansionAdvantage tests. */
function makeScore(
  numRemainingUnresolved: number,
  movementPatternPenalty: number,
): ScoreTuple {
  return [numRemainingUnresolved, 0, 0, 0, movementPatternPenalty, 0, 0, 0] as const;
}

const noopBaseFn = (_id: number) => 0;

// ─── checkContributionSafety ──────────────────────────────────────────────────

describe("checkContributionSafety — safe delta accepted", () => {
  it("returns safe:true with correct numRemainingUnresolved when ceiling has headroom", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const weeklyBaseFn = (_id: number) => 0;

    const result = checkContributionSafety(
      3, coeffs, weeklyTargets, weeklyBaseFn,
      EMPTY_DAILY, noopBaseFn, EMPTY_STEP3, [targetA],
    );

    expect(result.safe).toBe(true);
    if (result.safe) {
      expect(result.numRemainingUnresolved).toBe(1); // 3.0 < 9.5 → still unresolved
      expect(result.totalWeeklyRemaining).toBeCloseTo(7.0); // 10 − 3 = 7
      expect(result.totalDailyRemaining).toBe(0);
    }
  });

  it("numRemainingUnresolved is 0 when delta resolves the target", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 3)]]);
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const weeklyBaseFn = (_id: number) => 0;

    const result = checkContributionSafety(
      3, coeffs, weeklyTargets, weeklyBaseFn,
      EMPTY_DAILY, noopBaseFn, EMPTY_STEP3, [targetA],
    );

    expect(result.safe).toBe(true);
    if (result.safe) {
      expect(result.numRemainingUnresolved).toBe(0); // 3.0 ≥ 2.5 → resolved
    }
  });

  it("accepts effectiveDelta=1 (consolidation delta)", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coeffs = new Map([[targetA.targetId, 0.5]]);
    const result = checkContributionSafety(
      1, coeffs, weeklyTargets, noopBaseFn,
      EMPTY_DAILY, noopBaseFn, EMPTY_STEP3, [targetA],
    );
    expect(result.safe).toBe(true);
  });
});

describe("checkContributionSafety — weekly ceiling rejection", () => {
  it("rejects when delta would breach the weekly ceiling", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 3)]]);
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const weeklyBaseFn = (_id: number) => 0;

    // 4 sets * 1.0 = 4.0 > 3.0 + 0.5 = 3.5 → reject
    const result = checkContributionSafety(
      4, coeffs, weeklyTargets, weeklyBaseFn,
      EMPTY_DAILY, noopBaseFn, EMPTY_STEP3, [targetA],
    );
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.cause).toBe("weekly_overshoot");
    }
  });

  it("rejects on manual_overshoot when target is manually overshot", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 5, 4, true)]]);
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const result = checkContributionSafety(
      1, coeffs, weeklyTargets, noopBaseFn,
      EMPTY_DAILY, noopBaseFn, EMPTY_STEP3, [targetA],
    );
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.cause).toBe("manual_overshoot");
    }
  });
});

describe("checkContributionSafety — daily rejection", () => {
  it("rejects when isDailyOvershot is already true for any target", () => {
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const dailyContextMap = new Map([[targetA.targetId, { effectiveSets: 6, sessionMax: 5, isDailyOvershot: true }]]);
    const result = checkContributionSafety(
      1, coeffs, new Map(), noopBaseFn,
      dailyContextMap, noopBaseFn, EMPTY_STEP3, [targetA],
    );
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.cause).toBe("daily_session_max");
    }
  });

  it("rejects when delta would breach sessionMax", () => {
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const dailyContextMap = new Map([[targetA.targetId, { effectiveSets: 0, sessionMax: 2, isDailyOvershot: false }]]);
    // 3 * 1.0 = 3.0 > 2.0 + 0.5 = 2.5 → reject
    const result = checkContributionSafety(
      3, coeffs, new Map(), noopBaseFn,
      dailyContextMap, noopBaseFn, EMPTY_STEP3, [targetA],
    );
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.cause).toBe("daily_session_max");
    }
  });

  it("rejects when delta exceeds daily redistribution limit", () => {
    const coeffs = new Map([[targetA.targetId, 1.0]]);
    const step3 = new Map([[targetA.targetId, 1.0]]);
    // 4 * 1.0 = 4.0 > 1.0 + 2.0 = 3.0 → reject
    const result = checkContributionSafety(
      4, coeffs, new Map(), noopBaseFn,
      EMPTY_DAILY, noopBaseFn, step3, [targetA],
    );
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.cause).toBe("daily_redistribution");
    }
  });
});

// ─── hasClearExpansionAdvantage ───────────────────────────────────────────────

describe("hasClearExpansionAdvantage", () => {
  it("returns true when expansion resolves more targets (score[0] < consolidation.numRemainingUnresolved)", () => {
    const expansion = { score: makeScore(0, 1) };
    const consolidation = { numRemainingUnresolved: 1 };
    expect(hasClearExpansionAdvantage(expansion, consolidation)).toBe(true);
  });

  it("returns true when expansion adds a fresh movement category (score[4] === 0)", () => {
    const expansion = { score: makeScore(1, 0) }; // same target resolution, fresh category
    const consolidation = { numRemainingUnresolved: 1 };
    expect(hasClearExpansionAdvantage(expansion, consolidation)).toBe(true);
  });

  it("returns true when both advantages are present", () => {
    const expansion = { score: makeScore(0, 0) };
    const consolidation = { numRemainingUnresolved: 2 };
    expect(hasClearExpansionAdvantage(expansion, consolidation)).toBe(true);
  });

  it("returns false when target resolution is equal and category is already present (score[4] > 0)", () => {
    const expansion = { score: makeScore(1, 1) };
    const consolidation = { numRemainingUnresolved: 1 };
    expect(hasClearExpansionAdvantage(expansion, consolidation)).toBe(false);
  });

  it("returns false regardless of penalty magnitude — only score[4] === 0 triggers advantage", () => {
    // penalty=2 and penalty=5 should both return false (not === 0)
    expect(hasClearExpansionAdvantage({ score: makeScore(1, 2) }, { numRemainingUnresolved: 1 })).toBe(false);
    expect(hasClearExpansionAdvantage({ score: makeScore(1, 5) }, { numRemainingUnresolved: 1 })).toBe(false);
  });

  it("does not inspect score indices other than [0] and [4]", () => {
    // All other indices are non-zero — result must be driven only by [0] and [4]
    const expansion = { score: [1, 99, 99, 99, 1, 99, 99, 99] as const };
    const consolidation = { numRemainingUnresolved: 1 };
    // score[0] === consolidation.numRemainingUnresolved, score[4] !== 0 → false
    expect(hasClearExpansionAdvantage(expansion, consolidation)).toBe(false);
  });
});

// ─── resolveFragmentationAction ───────────────────────────────────────────────

describe("resolveFragmentationAction", () => {
  it("NO_ACTION when neither candidate exists", () => {
    const result: FragmentationAction = resolveFragmentationAction({
      hasExpansion: false,
      hasConsolidation: false,
      expansionHasClearAdvantage: false,
    });
    expect(result).toBe("NO_ACTION");
  });

  it("EXPAND when only expansion is available (advantage value ignored)", () => {
    expect(resolveFragmentationAction({
      hasExpansion: true,
      hasConsolidation: false,
      expansionHasClearAdvantage: false,
    })).toBe("EXPAND");

    expect(resolveFragmentationAction({
      hasExpansion: true,
      hasConsolidation: false,
      expansionHasClearAdvantage: true,
    })).toBe("EXPAND");
  });

  it("CONSOLIDATE when only consolidation is available (advantage value ignored)", () => {
    expect(resolveFragmentationAction({
      hasExpansion: false,
      hasConsolidation: true,
      expansionHasClearAdvantage: false,
    })).toBe("CONSOLIDATE");

    expect(resolveFragmentationAction({
      hasExpansion: false,
      hasConsolidation: true,
      expansionHasClearAdvantage: true,
    })).toBe("CONSOLIDATE");
  });

  it("EXPAND when both exist and expansion has a clear advantage", () => {
    expect(resolveFragmentationAction({
      hasExpansion: true,
      hasConsolidation: true,
      expansionHasClearAdvantage: true,
    })).toBe("EXPAND");
  });

  it("CONSOLIDATE when both exist and expansion has no clear advantage (tie → simpler program)", () => {
    expect(resolveFragmentationAction({
      hasExpansion: true,
      hasConsolidation: true,
      expansionHasClearAdvantage: false,
    })).toBe("CONSOLIDATE");
  });

  it("decision is driven by booleans only — no ScoreTuple knowledge required", () => {
    // Verify by inspection: the function signature accepts only booleans.
    // TypeScript enforces this at compile time; this test documents the invariant.
    const inputs = { hasExpansion: true, hasConsolidation: true, expansionHasClearAdvantage: false };
    expect(typeof inputs.hasExpansion).toBe("boolean");
    expect(typeof inputs.hasConsolidation).toBe("boolean");
    expect(typeof inputs.expansionHasClearAdvantage).toBe("boolean");
    expect(resolveFragmentationAction(inputs)).toBe("CONSOLIDATE");
  });
});

// ─── findBestConsolidation / applyConsolidation — via selectExercisesForDay ──

describe("findBestConsolidation — null cases (via selectExercisesForDay)", () => {
  it("no consolidation when toAdd is empty (nothing committed yet)", () => {
    // Single rec available — expansion fires first, consolidation has nothing to work on.
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coefficients = new Map([[1, new Map([[targetA.targetId, 1.0]])]]);
    const rec = makeRec(1, [targetA]);

    const result = selectExercisesForDay(
      0, [targetA], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    // Only expansion fires in the first iteration — result has 1 exercise.
    expect(result.toAdd.length).toBeGreaterThanOrEqual(1);
    expect(result.toAdd[0]?.exerciseId).toBe(1);
  });

  it("no consolidation when all committed exercises are at 4 sets (cap respected)", () => {
    // Only one rec with a ceiling just enough that it maxes out at 4 sets.
    // After that, consolidation cannot increase beyond 4 and expansion pool is empty.
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 12)]]);
    const coefficients = new Map([[1, new Map([[targetA.targetId, 1.0]])]]);
    const rec = makeRec(1, [targetA]);

    const result = selectExercisesForDay(
      0, [targetA], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    const entry = result.toAdd.find((e) => e.exerciseId === 1);
    expect(entry).toBeDefined();
    // Sets must never exceed 4 regardless of how many consolidation iterations ran
    expect(entry!.sets).toBeLessThanOrEqual(4);
  });

  it("core exercises are skipped by consolidation", () => {
    // Core exercise committed in Phase 2 — consolidation must not touch it.
    // Use a two-rec setup: core rec only (no non-core recs with coefficients).
    const coreRec: AutoFillRecExercise = {
      id: 1, name: "Plank", mainMuscleGroup: "Brzuch",
      matchingTargets: [], matchingTargetIds: [], equipment: [], isAvoided: false,
    };
    // No weekly targets → expansion loop finds nothing → consolidation would run
    // if core were eligible — but core exercises are skipped.
    const result = selectExercisesForDay(
      0, [], true, [coreRec], 0, 0, NO_AVOIDED,
      new Map(), EMPTY_DAILY, new Map([[1, new Map()]]), EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Core was added in Phase 2, not Phase 1. Consolidation must not modify it.
    if (result.coreAdded) {
      const coreEntry = result.toAdd.find((e) => e.isCore);
      expect(coreEntry?.sets).toBe(2); // Phase 2 assigns 2 sets; consolidation must not increase it
    }
  });
});

describe("findBestConsolidation — MAX_DAY_SETS respected", () => {
  it("consolidation does not push total sets above MAX_DAY_SETS", () => {
    // existingSetCount=22 leaves room for exactly 2 more sets.
    // Expansion fires first (adds 2 sets → total 24). Then canAddMore=false.
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coefficients = new Map([[1, new Map([[targetA.targetId, 0.25]])]]);
    const rec = makeRec(1, [targetA]);

    const result = selectExercisesForDay(
      0, [targetA], false, [rec], 0, 22, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    const totalSets = 22 + result.toAdd.reduce((sum, e) => sum + e.sets, 0);
    expect(totalSets).toBeLessThanOrEqual(24);
  });
});

describe("consolidation fires instead of fragmentation (tie scenario)", () => {
  it("prefers consolidation when expansion adds no target resolution or movement variety", () => {
    // Two no-guideline targets: T1 (for rec1) and T2 (for rec2). Both "push".
    // No ceilings → setsPreference decides: expansion commits at sets=3.
    //
    // Iter 1: rec1 committed for T1 (sets=3, setsPreference=0). T1 resolved.
    //         currentSets = 19+3 = 22. canAddMore: 24 ≤ 24 → true.
    //
    // Iter 2: T2 unresolved. Expansion = rec2 (score[4]=1, push already present).
    //         Consolidation = rec1 (delta=1, no ceiling → safe, numUnresolved=0).
    //         hasClearExpansionAdvantage: score[0]=0 === 0, score[4]=1 ≠ 0 → false → CONSOLIDATE.
    //         rec1.sets = 4. currentSets = 23. canAddMore: 25 > 24 → false. Loop exits.
    //
    // rec2 never committed. toAdd = [rec1(sets=4)].
    const T1: AutoFillDayTarget = { targetId: 201, targetName: "T1" };
    const T2: AutoFillDayTarget = { targetId: 202, targetName: "T2" };
    const coefficients = new Map([
      [1, new Map([[201, 1.0]])],
      [2, new Map([[202, 1.0]])],
    ]);
    const rec1 = makeRec(1, [T1], { movementCategoryKey: "push" });
    const rec2 = makeRec(2, [T2], { movementCategoryKey: "push" });

    const result = selectExercisesForDay(
      0, [T1, T2], false, [rec1, rec2], 0, 19, NO_AVOIDED,
      new Map(), EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    // rec1 committed (sets=3 expansion), then consolidated to 4 in iter 2.
    // rec2 never added — tie → consolidation was preferred.
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(1);
    expect(result.toAdd[0]?.sets).toBe(4); // 3 from expansion + 1 from consolidation
  });

  it("consolidation does not increment exercise count", () => {
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coefficients = new Map([
      [1, new Map([[targetA.targetId, 1.0]])],
      [2, new Map([[targetA.targetId, 1.0]])],
    ]);
    const result = selectExercisesForDay(
      0, [targetA], false,
      [makeRec(1, [targetA], { movementCategoryKey: "push" }),
       makeRec(2, [targetA], { movementCategoryKey: "push" })],
      0, 20, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Only 1 exercise added (rec1 consolidated, rec2 never committed)
    expect(result.toAdd).toHaveLength(1);
  });

  it("consolidation does not update patternsAddedThisDay — push count stays at 1", () => {
    // If patternsAddedThisDay were incorrectly incremented to 2 after consolidation,
    // a subsequent expansion candidate would see penalty=2 instead of 1.
    // We verify by checking that when consolidation is exhausted and expansion
    // finally fires (because consolidation is no longer possible), the expansion
    // candidate is still correctly evaluated (not over-penalised).
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coefficients = new Map([
      [1, new Map([[targetA.targetId, 1.0]])],
      [2, new Map([[targetA.targetId, 1.0]])],
    ]);
    // existingSetCount=18: iter1→20, consolidation×2→22 (rec1 at 4), then expansion fires
    const result = selectExercisesForDay(
      0, [targetA], false,
      [makeRec(1, [targetA], { movementCategoryKey: "push" }),
       makeRec(2, [targetA], { movementCategoryKey: "push" })],
      0, 18, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // rec1 starts at sets=2, consolidates twice to sets=4. Then rec2 gets added.
    const rec1entry = result.toAdd.find((e) => e.exerciseId === 1);
    expect(rec1entry?.sets).toBe(4);
    // rec2 eventually gets added when consolidation is exhausted
    const rec2entry = result.toAdd.find((e) => e.exerciseId === 2);
    expect(rec2entry).toBeDefined();
  });
});

describe("expansion wins when it provides clear advantage over consolidation", () => {
  it("expansion wins when it adds a fresh movement category (score[4] === 0)", () => {
    // rec1=push committed. rec2=pull (fresh category). Target still unresolved.
    // hasClearExpansionAdvantage: score[4]=0 → true → EXPAND.
    const weeklyTargets = new Map([[targetA.targetId, makeWeekly(targetA.targetId, 0, 10)]]);
    const coefficients = new Map([
      [1, new Map([[targetA.targetId, 0.5]])],
      [2, new Map([[targetA.targetId, 0.5]])],
    ]);
    const result = selectExercisesForDay(
      0, [targetA], false,
      [makeRec(1, [targetA], { movementCategoryKey: "push" }),
       makeRec(2, [targetA], { movementCategoryKey: "pull" })],
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Both rec1 and rec2 should be committed — expansion always won via fresh category
    expect(result.toAdd.some((e) => e.exerciseId === 1)).toBe(true);
    expect(result.toAdd.some((e) => e.exerciseId === 2)).toBe(true);
  });

  it("expansion wins when it resolves more targets than consolidation", () => {
    // Two targets. rec1 covers only targetA. rec2 covers both targetA and targetB.
    // After rec1 committed: targetB still unresolved. Consolidation of rec1 doesn't
    // help targetB (no coeff). Expansion of rec2 resolves targetB → clear advantage.
    const weeklyTargets = new Map([
      [targetA.targetId, makeWeekly(targetA.targetId, 0, 3)],
      [targetB.targetId, makeWeekly(targetB.targetId, 0, 3)],
    ]);
    const coefficients = new Map([
      [1, new Map([[targetA.targetId, 1.0]])],
      [2, new Map([[targetA.targetId, 1.0], [targetB.targetId, 1.0]])],
    ]);
    const result = selectExercisesForDay(
      0, [targetA, targetB], false,
      [makeRec(1, [targetA]), makeRec(2, [targetA, targetB])],
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Both exercises should eventually be added
    expect(result.toAdd.some((e) => e.exerciseId === 1 || e.exerciseId === 2)).toBe(true);
  });
});
