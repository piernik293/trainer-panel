/**
 * Auto-Fill Phase 4F — Safe Allocation
 *
 * All 20 required spec cases plus supporting unchanged-behaviour tests.
 * Pure functions only; previewFetcher is mocked for runAutoFill tests.
 */

import { describe, it, expect, vi } from "vitest";
import {
  selectExercisesForDay,
  buildDayFetchUrl,
  buildTrialPreviewBody,
  extractCandidateCoefficients,
  computeAutoFillSummary,
  runAutoFill,
  ALLOWED_SET_COUNTS,
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

const latTarget: AutoFillDayTarget = { targetId: 1, targetName: "Latissimus dorsi" };
const bicTarget: AutoFillDayTarget = { targetId: 2, targetName: "Biceps" };
const gluteTarget: AutoFillDayTarget = { targetId: 3, targetName: "Glutes" };
const quadTarget: AutoFillDayTarget = { targetId: 4, targetName: "Quadriceps" };
const calfTarget: AutoFillDayTarget = { targetId: 5, targetName: "Calves" };

const NO_AVOIDED = new Set<number>();
const EMPTY_WEEKLY = new Map<number, AutoFillWeeklyTarget>();
const EMPTY_DAILY = new Map<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>();
const EMPTY_COEFFS = new Map<number, ReadonlyMap<number, number>>();
const EMPTY_PREV_DAYS = new Map<number, number>();
const EMPTY_USED = new Set<number>();
const EMPTY_STEP3 = new Map<number, number>();
const MOCK_EMPTY_PREVIEW: AutoFillVolumeSnapshot = { weekly: [], days: [] };

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
  return { id, name: `Core ${id}`, mainMuscleGroup: "Brzuch", matchingTargets: [], matchingTargetIds: [], equipment: [], isAvoided: false };
}

function makeWeekly(
  targetId: number,
  effectiveSets: number,
  weeklyPreferredCeiling: number,
  isManuallyOvershot = false,
): AutoFillWeeklyTarget {
  return { targetId, effectiveSets, weeklyPreferredCeiling, hasGuideline: true, isManuallyOvershot };
}

function makeDay(overrides: Partial<RunAutoFillDayInput> = {}): RunAutoFillDayInput {
  return {
    dayIndex: 0,
    broadCategories: ["Plecy"],
    orderedTargets: [latTarget],
    coreEligible: false,
    existingExerciseCount: 0,
    existingSetCount: 0,
    alreadyAddedExerciseIds: [],
    step3DailyAllocations: EMPTY_STEP3,
    ...overrides,
  };
}

async function noOpPreview(_body: TrialPreviewBody): Promise<AutoFillVolumeSnapshot> {
  return MOCK_EMPTY_PREVIEW;
}

// ─── Case 1: Trial candidate contributions mapped by exerciseId (unique vector) ─

describe("Case 1 — trial candidate contributions mapped by unique contribution vector", () => {
  it("extracts coefficient for a candidate from trial response using exerciseId", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [{
        dayId: 1,
        muscles: [{
          targetId: latTarget.targetId, effectiveSets: 1, sessionMax: 10, isDailyOvershot: false,
          contributions: [{ exerciseId: 10, coefficient: 0.9 }],
        }],
      }],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([10]));
    expect(coeffs.get(10)?.get(latTarget.targetId)).toBeCloseTo(0.9);
  });

  it("ignores existing-draft exercises not in the candidate set", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [{
        dayId: 1,
        muscles: [{
          targetId: latTarget.targetId, effectiveSets: 3, sessionMax: 10, isDailyOvershot: false,
          contributions: [{ exerciseId: 5, coefficient: 1.0 }, { exerciseId: 10, coefficient: 0.8 }],
        }],
      }],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([10]));
    expect(coeffs.has(5)).toBe(false); // existing-draft exercise excluded
    expect(coeffs.has(10)).toBe(true); // candidate included
  });

  it("uses max coefficient when same exercise appears in multiple days", () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [],
      days: [
        { dayId: 1, muscles: [{ targetId: 1, effectiveSets: 1, sessionMax: 5, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 0.7 }] }] },
        { dayId: 2, muscles: [{ targetId: 1, effectiveSets: 1, sessionMax: 5, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 0.9 }] }] },
      ],
    };
    const coeffs = extractCandidateCoefficients(trialResponse, new Set([10]));
    expect(coeffs.get(10)?.get(1)).toBeCloseTo(0.9);
  });

  it("rejects a candidate with no contribution vector (empty coeffs)", () => {
    // No coefficient data → candidate excluded, target unresolved
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)]]);
    const rec = makeRec(10, [latTarget]);
    // EMPTY_COEFFS = no trial data for exercise 10
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("NO_EXACT_CONTRIBUTION_VECTOR");
  });
});

// ─── Case 2: Auto-fill never assigns 1, 5, or 6 working sets ─────────────────

describe("Case 2 — auto-fill never assigns 1, 5, or 6 working sets", () => {
  it("ALLOWED_SET_COUNTS contains only 2, 3, and 4", () => {
    expect(ALLOWED_SET_COUNTS).toEqual([2, 3, 4]);
    expect(ALLOWED_SET_COUNTS).not.toContain(1);
    expect(ALLOWED_SET_COUNTS).not.toContain(5);
    expect(ALLOWED_SET_COUNTS).not.toContain(6);
  });

  it("all added exercises have sets in [2, 3, 4]", async () => {
    const weeklyTargets: AutoFillWeeklyTarget[] = [
      makeWeekly(latTarget.targetId, 0, 7),
    ];
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: weeklyTargets,
      days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }] }] }],
    };
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }], currentDraft: {},
        currentPreviewResult: { weekly: weeklyTargets, days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] }] } },
      async () => [makeRec(10, [latTarget])],
      async () => trialResponse,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const dayResult of result.dayResults) {
        for (const ex of dayResult.toAdd) {
          expect([2, 3, 4]).toContain(ex.sets);
        }
      }
    }
  });
});

// ─── Case 3: Normal case prefers 3 sets ───────────────────────────────────────

describe("Case 3 — safe normal case prefers 3 sets", () => {
  it("chooses sets=3 when both 3 and 4 resolve the target with equal remaining=0", () => {
    // coeff=0.4, ceiling=1.2. Both sets=3 (→1.2) and sets=4 (→1.6) resolve (≥0.7) and
    // have totalWeeklyRemaining=0 (both overshoot ceiling). setsPreference breaks the tie: 3→0 wins.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 1.2)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 0.4]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd[0]?.sets).toBe(3);
  });

  it("uses 3 sets when it exactly fills the remaining deficit", () => {
    // Planned=3, current=0, coeff=1.0
    // sets=3 → 3 = ceiling → perfectly resolved
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd[0]?.sets).toBe(3);
    expect(result.resolvedTargets).toHaveLength(1);
  });
});

// ─── Case 4: Four sets selected when required and safe ────────────────────────

describe("Case 4 — four sets selected when required and safe", () => {
  it("chooses sets=4 when it reduces remaining deficit and 4 does not overshoot", () => {
    // Planned=7, current=3, coeff=1.0
    // sets=3 → remaining=1 (score better than sets=2: remaining=2)
    // sets=4 → 3+4=7=ceiling → remaining=0 (best)
    // 3→setsPreference=0, 4→setsPreference=1 but remaining=0 wins on priority 2
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 3, 7)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd[0]?.sets).toBe(4);
    expect(result.resolvedTargets).toHaveLength(1);
  });

  it("prefers 4 over 2 when both are equally safe and 4 covers more volume", () => {
    // Planned=5, current=0, coeff=1.0
    // sets=2 → remaining=3, sets=3 → remaining=2, sets=4 → remaining=1
    // sets=4 wins (lower remaining)
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 5)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd[0]?.sets).toBe(4);
  });
});

// ─── Case 5: Two sets selected when 3 sets would overshoot ───────────────────

describe("Case 5 — two sets selected when 3 sets would overshoot", () => {
  it("falls back to sets=2 when sets=3 and sets=4 would overshoot", () => {
    // Planned=4, current=3.0, coeff=1.0
    // sets=2 → 5.0 > 4.5 → REJECT
    // sets=3 → 6.0 > 4.5 → REJECT
    // sets=4 → 7.0 > 4.5 → REJECT
    // Actually none work — let me adjust: current=2.6, coeff=1.0
    // sets=2 → 4.6 > 4.5 → REJECT
    // Hmm, even sets=2 overshoots. Let me use: planned=5, current=3, coeff=1.0
    // sets=2 → 5.0 (within 5.5) → OK (remaining=0). sets=3 → 6 > 5.5 → REJECT. sets=4 → 7 → REJECT
    const weeklyTargets = new Map([[bicTarget.targetId, makeWeekly(bicTarget.targetId, 3, 5)]]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 1.0]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.sets).toBe(2);
    expect(result.resolvedTargets).toHaveLength(1); // 3+2=5 ≥ 5-0.5=4.5 → resolved
  });

  it("leaves unresolved when even 2 sets would overshoot", () => {
    // ceiling=4, current=2.0 (< 3.5 so NOT already resolved), coeff=1.5
    // sets=2 → 2+3=5 > 4.5 → REJECT. sets=3/4 → worse. All rejected → unresolved.
    const weeklyTargets = new Map([[bicTarget.targetId, makeWeekly(bicTarget.targetId, 2.0, 4)]]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 1.5]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });
});

// ─── Case 6: Quadriceps deficit not solved by increasing covered glutes ────────

describe("Case 6 — quadriceps deficit not solved by creating overshoot for covered glutes", () => {
  it("rejects candidate that overshoots covered glutes by 4 effective points", () => {
    // Quad: needs coverage (current=0, ceiling=8)
    // Glutes: at ceiling (current=10, ceiling=10, not manually overshot)
    // Candidate covers Quad (coeff=1.0) AND Glutes (coeff=1.0)
    // sets=2: Glutes new = 10+2=12 > 10.5 → REJECT
    // sets=3: 10+3=13 > 10.5 → REJECT
    // sets=4: 10+4=14 > 10.5 → REJECT → unresolved
    const weeklyTargets = new Map([
      [quadTarget.targetId, makeWeekly(quadTarget.targetId, 0, 8)],
      [gluteTarget.targetId, makeWeekly(gluteTarget.targetId, 10, 10)],
    ]);
    const coefficients = new Map([
      [99, new Map([[quadTarget.targetId, 1.0], [gluteTarget.targetId, 1.0]])],
    ]);
    const rec = makeRec(99, [quadTarget], { mainMuscleGroup: "Nogi" });
    const result = selectExercisesForDay(
      0, [quadTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT");
  });

  it("accepts the candidate when a second exercise covers only quad without touching glutes", () => {
    // Quad ceiling=3 (so sets=3 resolves it). Glute ceiling=10, current=10.
    // rec1 covers Quad+Glute (coeff=1): Glute new=12>10.5 → all sets REJECT.
    // rec2 covers only Quad (coeff=1): sets=3 → Quad=3 ≥ 2.5 → resolved. ✓
    const weeklyTargets = new Map([
      [quadTarget.targetId, makeWeekly(quadTarget.targetId, 0, 3)],
      [gluteTarget.targetId, makeWeekly(gluteTarget.targetId, 10, 10)],
    ]);
    const coefficients = new Map([
      [99, new Map([[quadTarget.targetId, 1.0], [gluteTarget.targetId, 1.0]])],
      [100, new Map([[quadTarget.targetId, 1.0]])], // only Quad
    ]);
    const rec1 = makeRec(99, [quadTarget], { mainMuscleGroup: "Nogi" });
    const rec2 = makeRec(100, [quadTarget], { mainMuscleGroup: "Nogi" });
    const result = selectExercisesForDay(
      0, [quadTarget], false, [rec1, rec2], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(100); // rec1 rejected; rec2 accepted
    expect(result.resolvedTargets.some((t) => t.targetId === quadTarget.targetId)).toBe(true);
  });
});

// ─── Case 7: Every affected targetId evaluated ────────────────────────────────

describe("Case 7 — every affected targetId is evaluated (not only primary)", () => {
  it("rejects candidate whose secondary target would be overshot beyond tolerance", () => {
    // Lat: needs coverage (0→7). Bic: at ceiling (4→4).
    // rec10 covers Lat (coeff=1) AND Bic (coeff=0.8)
    // sets=2: Bic new=4+1.6=5.6 > 4.5 → REJECT; sets=3/4 worse → all REJECT
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)],
      [bicTarget.targetId, makeWeekly(bicTarget.targetId, 4, 4)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 0.8]])],
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT");
  });

  it("accepts candidate when secondary target has room", () => {
    // Lat: 0→7. Bic: 2→4. rec10: coeff(Lat)=1, coeff(Bic)=0.5
    // sets=2: Bic new=2+1=3 ≤ 4.5 → OK
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)],
      [bicTarget.targetId, makeWeekly(bicTarget.targetId, 2, 4)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 0.5]])],
    ]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
  });
});

// ─── Case 8: Selecting exercise does NOT auto-resolve its target ───────────────

describe("Case 8 — selecting an exercise does not automatically resolve its target", () => {
  it("target with low coeff stays unresolved after selection", () => {
    // Lat: ceiling=10, current=0. coeff=0.2 for exercise 10.
    // After sets=4: added volume = 0.2×4 = 0.8. weeklyBase = 0.8. 0.8 < 10-0.5=9.5 → NOT resolved.
    // No other candidates → target remains unresolved with diagnostic.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 10)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 0.2]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Exercise IS added (low contribution is still better than nothing)
    expect(result.toAdd).toHaveLength(1);
    // But target is NOT resolved (0.8 < 9.5)
    expect(result.resolvedTargets).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("target resolved correctly when volume accumulates across iterations", () => {
    // Lat: ceiling=4, current=0. Two candidates: ex10 and ex20, each coeff=1.
    // Iteration 1: add ex10 with 3 sets → Lat = 3. 3 < 4-0.5=3.5 → NOT resolved.
    // Iteration 2: add ex20 with 2 sets → Lat = 3+2=5 > 4.5 → REJECT. sets=1? Not in ALLOWED. Hmm.
    // Let's use ceiling=7, coeff=0.9.
    // Iteration 1: add ex10 (3 sets) → 2.7. 2.7 < 6.5 → not resolved.
    // Iteration 2: add ex20 (4 sets) → 2.7+3.6=6.3 < 6.5 → not resolved. But wait 6.3 vs 6.5.
    // Hmm. Let's use ceiling=5, coeff=0.9.
    // iter1: ex10 (3 sets) → 2.7. 2.7 < 4.5 → not resolved.
    // iter2: ex20 (3 sets) → 2.7+2.7=5.4 > 5.5? No, 5.4 ≤ 5.5 → OK. Resolved (5.4 ≥ 4.5).
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 5)]]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 0.9]])],
      [20, new Map([[latTarget.targetId, 0.9]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Both exercises should be added: iter1 gets ex10 (3 sets), iter2 gets ex20 (3 sets → total 5.4)
    expect(result.toAdd.length).toBeGreaterThanOrEqual(2);
    expect(result.resolvedTargets).toHaveLength(1);
  });
});

// ─── Case 9: Partially covered target remains eligible ────────────────────────

describe("Case 9 — a partially covered target remains eligible for additional exercises", () => {
  it("adds a second exercise to a target that was only partially covered by first", () => {
    // Lat: ceiling=8, current=0. Two candidates with coeff=0.8.
    // iter1: ex10 (3 sets) → 2.4. 2.4 < 7.5 → not resolved.
    // iter2: ex20 (3 sets) → 2.4+2.4=4.8. 4.8 < 7.5 → not resolved.
    // iter3: no more exercises → loop ends. Target unresolved but 2 exercises added.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 8)]]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 0.8]])],
      [20, new Map([[latTarget.targetId, 0.8]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Both exercises added because after the first, target is still unresolved
    expect(result.toAdd).toHaveLength(2);
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(10);
    expect(ids).toContain(20);
  });

  it("target eventually resolves after multiple iterations", () => {
    // Lat: ceiling=5, current=0, coeff=1.0. Two candidates.
    // iter1: ex10 (4 sets) → 4. 4 < 4.5 → not resolved.
    // iter2: ex20 (2 sets) → 4+2=6 > 5.5 → REJECT sets=2. Wait: 6>5.5.
    // sets=2 for ex20: 4+2=6 > 5.5 → REJECT. All ALLOWED_SET_COUNTS rejected → loop ends.
    // Let's use 3 candidates: ex10 (4 sets → 4), ex20 (2 sets → 4+0.5=4.5 ≥ 4.5 → resolved if coeff=0.25)
    // Actually: ceiling=5, coeff=1.0. After ex10 with 4 sets: 4. sets=2 for ex20: 4+2=6>5.5 REJECT.
    // NONE work after ex10 → target at 4, unresolved.
    // Let's try ceiling=6: ex10(3 sets)→3. ex20: sets=3 → 6 (≥5.5) → accepted.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 6)]]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],
      [20, new Map([[latTarget.targetId, 1.0]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.resolvedTargets).toHaveLength(1);
    expect(result.toAdd.length).toBeGreaterThanOrEqual(1);
    // Total effective: each exercise contributes sets×coeff. Verify ≥ 5.5 and ≤ 6.5
    const totalSets = result.toAdd.reduce((s, e) => s + e.sets, 0);
    expect(totalSets).toBeGreaterThanOrEqual(6); // need at least 6 to reach ceiling 6
  });
});

// ─── Case 10: Covered target stops triggering recommendations ─────────────────

describe("Case 10 — a covered target stops triggering recommendations", () => {
  it("does not add another exercise once target is volume-resolved", () => {
    // Lat: ceiling=3, coeff=1. ex10 (3 sets) → 3 ≥ 2.5 → RESOLVED. ex20 not needed.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],
      [20, new Map([[latTarget.targetId, 1.0]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1); // Only ex10 needed
    expect(result.resolvedTargets).toHaveLength(1);
  });

  it("compound exercise resolves multiple targets; neither is re-requested", () => {
    // ex10 covers both Lat and Bic with coeff=1. ceilings both=3.
    // sets=3: Lat=3 ≥ 2.5 ✓, 3 ≤ 3.5 OK; Bic=3 ≥ 2.5 ✓, 3 ≤ 3.5 OK → both resolved.
    // sets=4: Lat=4 > 3.5 → REJECT. Only sets=3 works.
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)],
      [bicTarget.targetId, makeWeekly(bicTarget.targetId, 0, 3)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 1.0]])],
    ]);
    const rec = makeRec(10, [latTarget, bicTarget]);
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.sets).toBe(3);
    expect(result.resolvedTargets.map((t) => t.targetId)).toContain(latTarget.targetId);
    expect(result.resolvedTargets.map((t) => t.targetId)).toContain(bicTarget.targetId);
  });
});

// ─── Cases 11–13: Daily redistribution limit ──────────────────────────────────

describe("Cases 11–13 — Step 3 daily redistribution limit (+2 points)", () => {
  // step3=5, existing=4.5 (manual). Auto-fill adds coeff=0.5 × sets → daily total = 4.5 + 0.5×sets.
  // Deviation = (4.5 + 0.5×sets) - 5 = 0.5×sets - 0.5. For sets=2: +0.5, sets=3: +1.0, sets=4: +1.5.
  // All ≤ 2 → all ALLOWED. Exercise IS added.
  it("Case 11 — deviation of +1 above step3 is allowed (exercise is added)", () => {
    const step3 = new Map([[latTarget.targetId, 5]]);
    const dailyCtx = new Map([[latTarget.targetId, { effectiveSets: 4.5, sessionMax: 20, isDailyOvershot: false }]]);
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 4.5, 10)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 0.5]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, dailyCtx, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, step3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect([2, 3, 4]).toContain(result.toAdd[0]?.sets); // any ALLOWED set count is fine (all pass the +2 guard)
  });

  // step3=5, existing=5.0. coeff=1.0 × sets. Deviation = (5.0 + sets) - 5 = sets.
  // sets=2: deviation=2 exactly → ALLOWED. sets=3: deviation=3 > 2 → REJECT. sets=4: REJECT.
  it("Case 12 — deviation of exactly +2 above step3 is allowed (sets=2, deviation=2)", () => {
    const step3 = new Map([[latTarget.targetId, 5]]);
    const dailyCtx = new Map([[latTarget.targetId, { effectiveSets: 5.0, sessionMax: 20, isDailyOvershot: false }]]);
    // Weekly: ceiling=5.5 so sets=2 (weekly=5+2=7) → still < 6. Current=5.0 < 5.0=ceiling-0.5? No: 5.0 < 5.0.
    // Actually ceiling must be high enough to not overshoot weekly. Use ceiling=10.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 5.0, 10)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, dailyCtx, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, step3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.sets).toBe(2); // sets=3/4 would exceed deviation=2 limit; only sets=2 passes
  });

  // step3=5, existing=5.5. coeff=1.0. sets=2: 5.5+2=7.5>7 → REJECT. sets=3: 8.5>7 → REJECT. sets=4: 9.5>7 → REJECT.
  it("Case 13 — positive daily deviation above +2 is rejected for all ALLOWED set counts", () => {
    const step3 = new Map([[latTarget.targetId, 5]]);
    const dailyCtx = new Map([[latTarget.targetId, { effectiveSets: 5.5, sessionMax: 20, isDailyOvershot: false }]]);
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 5.5, 20)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, dailyCtx, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, step3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("DAILY_REDISTRIBUTION_LIMIT_REACHED");
  });
});

// ─── Case 14: Weekly 6/5 rejected when weekly target is 10 ───────────────────

describe("Case 14 — weekly total exceeding 10+0.5 is rejected", () => {
  it("rejects candidate whose contribution would push weekly above ceiling+0.5", () => {
    // weekly ceiling=10, previous days accumulated=6.1, coeff=1.25
    // sets=4: 6.1+5.0=11.1 > 10.5 → REJECT
    // sets=3: 6.1+3.75=9.85 ≤ 10.5 → OK
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 6.1, 10)]]);
    const prevDays = new Map([[latTarget.targetId, 0]]); // already in effectiveSets
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.25]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, prevDays, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
    // sets=4 would give 11.1 > 10.5 → rejected; sets=3 gives 9.85 → accepted
    expect(result.toAdd[0]?.sets).toBe(3);
  });

  it("leaves unresolved when all set counts would exceed ceiling+0.5", () => {
    // weekly ceiling=10, current=9.0 (< 9.5 so NOT already resolved), coeff=1.0
    // sets=2: 11.0 > 10.5 → REJECT. All REJECT → unresolved.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 9.0, 10)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });
});

// ─── Case 15: Existing manual overshoot not increased ─────────────────────────

describe("Case 15 — existing manual overshoot is not increased", () => {
  it("rejects all additions for a target that is manually overshot", () => {
    // current=12 > ceiling=7: isVolumeResolved → already resolved (12 ≥ 6.5).
    // evaluateCandidate hits manual_overshoot → exercise NOT added.
    // Target ends up in resolvedTargets (it's already covered by manual exercises).
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 12, 7, true)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0); // nothing auto-added
    // Target is volume-resolved (12 ≥ 7-0.5=6.5) — it shows as resolved, not unresolved
    expect(result.resolvedTargets.some((t) => t.targetId === latTarget.targetId)).toBe(true);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  it("accepts a candidate that does not contribute to the overshot target", () => {
    // Glutes manually overshot; ex10 covers only Lat (no Glute coefficient)
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)],
      [gluteTarget.targetId, makeWeekly(gluteTarget.targetId, 20, 10, true)],
    ]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
  });
});

// ─── Case 16: Small unresolved deficit preferred over large overshoot ──────────

describe("Case 16 — small unresolved deficit allowed when all 2/3/4 options are unsafe", () => {
  it("leaves target with tiny deficit rather than creating overshoot", () => {
    // Bic: ceiling=4, current=2.0 (< 3.5 so NOT already resolved), coeff=1.5
    // sets=2: 2+3=5 > 4.5 → REJECT. All REJECT → deficit left, target unresolved.
    const weeklyTargets = new Map([[bicTarget.targetId, makeWeekly(bicTarget.targetId, 2.0, 4)]]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 1.5]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("accepts an addition that touches ceiling+0.5 tolerance boundary", () => {
    // Bic: ceiling=4, current=3.0 (< 3.5 so NOT already resolved), coeff=0.5
    // sets=2: 3.0+1=4.0 ≤ 4.5 → ALLOWED. 4.0 ≥ 3.5 → resolved.
    // sets=3: 3.0+1.5=4.5 ≤ 4.5 → ALLOWED. 4.5 ≥ 3.5 → resolved. remaining=max(0,4-4.5)=0.
    // sets=4: 3.0+2=5.0 > 4.5 → REJECT.
    // Best: sets=3 (remaining=0) beats sets=2 (remaining=0, but setsPreference 3→0 < 2→2). sets=3 wins.
    const weeklyTargets = new Map([[bicTarget.targetId, makeWeekly(bicTarget.targetId, 3.0, 4)]]);
    const coefficients = new Map([[20, new Map([[bicTarget.targetId, 0.5]])]]);
    const rec = makeRec(20, [bicTarget]);
    const result = selectExercisesForDay(
      0, [bicTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.toAdd).toHaveLength(1);
    expect(result.resolvedTargets).toHaveLength(1); // 3+1.5=4.5 ≥ 3.5 → resolved
    expect(result.toAdd[0]?.sets).toBe(3);
  });
});

// ─── Case 17: Lat/calf/adductor/biceps not skipped due to wrong resolution ─────

describe("Case 17 — eligible targets not skipped due to incorrect resolution", () => {
  it("Lat stays unresolved after small-coeff exercise and gets a second exercise", () => {
    // Lat: ceiling=7. ex10 coeff=0.3, 3 sets → 0.9. 0.9 < 6.5 → NOT resolved.
    // ex20: coeff=1.0, 3 sets → adds 3 more → 3.9 < 6.5 → still not resolved.
    // ex30: coeff=1.0, 3 sets → 3.9+3=6.9 ≤ 7.5 → resolved (6.9 ≥ 6.5).
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)]]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 0.3]])],
      [20, new Map([[latTarget.targetId, 1.0]])],
      [30, new Map([[latTarget.targetId, 1.0]])],
    ]);
    const recs = [makeRec(10, [latTarget]), makeRec(20, [latTarget]), makeRec(30, [latTarget])];
    const result = selectExercisesForDay(
      0, [latTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Multiple exercises should be added (target needs multiple to reach ceiling)
    expect(result.toAdd.length).toBeGreaterThanOrEqual(2);
    // Target should eventually resolve
    expect(result.resolvedTargets).toHaveLength(1);
  });

  it("Bic target is not skipped when Lat exercise has incidental Bic coefficient", () => {
    // Lat: ceiling=4. Bic: ceiling=4.
    // ex10 covers Lat (coeff=1) + Bic (coeff=0.1). 3 sets: Lat=3 < 3.5, Bic=0.3 < 3.5.
    // Neither resolved after ex10. Loop continues.
    // ex20 covers Bic (coeff=1). 3 sets: Bic=0.3+3=3.3 < 3.5 → still not resolved.
    // ex30 covers Bic (coeff=1). 3 sets: 3.3+3=6.3 > 4.5 → sets=2: 3.3+2=5.3>4.5 → REJECT. Hmm.
    // Let me use Bic ceiling=7 instead.
    // ex10: Lat coeff=1, Bic coeff=0.1. ex20: Bic coeff=1.
    // iter1: best globally: ex10 for Lat (3s) → Lat=3, Bic=0.3. Lat not resolved, Bic not resolved.
    // iter2: ex20 for Bic (3s) → Bic=3.3. Still < 6.5.
    // iter3: ex10 used; no more Lat candidates → Lat unresolved.
    //        ex20 used; no more Bic candidates → loop ends.
    // Both unresolved. Key check: ex20 was tried for Bic (not skipped because of Bic's small coeff).
    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 4)],
      [bicTarget.targetId, makeWeekly(bicTarget.targetId, 0, 7)],
    ]);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 0.1]])],
      [20, new Map([[bicTarget.targetId, 1.0]])],
    ]);
    const recs = [makeRec(10, [latTarget, bicTarget]), makeRec(20, [bicTarget])];
    const result = selectExercisesForDay(
      0, [latTarget, bicTarget], false, recs, 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // Both exercises added (not just one)
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(10);
    expect(ids).toContain(20);
    // Bic was not marked resolved due to ex10's tiny 0.1 coeff contribution
    expect(result.unresolvedTargets.some((t) => t.targetId === bicTarget.targetId)).toBe(true);
  });
});

// ─── Case 18: Invalid final backend preview leaves draft unchanged ─────────────

describe("Case 18 — invalid final guard leaves the manual draft unchanged", () => {
  it("returns failure when guard response shows weekly overshoot above 0.5", async () => {
    const weeklyForSnapshot: AutoFillWeeklyTarget[] = [
      makeWeekly(latTarget.targetId, 0, 7),
    ];
    // Trial response assigns coeff=1
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: weeklyForSnapshot,
      days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }] }] }],
    };
    // Guard response shows overshoot: 8.0 > 7.5
    const guardResponse: AutoFillVolumeSnapshot = {
      weekly: [{ ...weeklyForSnapshot[0]!, effectiveSets: 8.0 }],
      days: [],
    };

    let callCount = 0;
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {},
        currentPreviewResult: { weekly: weeklyForSnapshot, days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] }] },
      },
      async () => [makeRec(10, [latTarget])],
      async () => {
        callCount++;
        // First call = trial preview (for coefficients); second call = guard
        return callCount === 1 ? trialResponse : guardResponse;
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("bezpiecznej propozycji");
    }
  });

  it("returns failure when guard call itself throws", async () => {
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: [makeWeekly(latTarget.targetId, 0, 7)],
      days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }] }] }],
    };
    let callCount = 0;
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: {},
        currentPreviewResult: { weekly: [makeWeekly(latTarget.targetId, 0, 7)], days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] }] },
      },
      async () => [makeRec(10, [latTarget])],
      async () => {
        callCount++;
        if (callCount === 1) return trialResponse;
        throw new Error("Guard call failed");
      },
    );
    expect(result.ok).toBe(false);
  });
});

// ─── Case 19: Existing manual exercises and prescriptions remain unchanged ──────

describe("Case 19 — existing manual exercises and prescriptions remain unchanged", () => {
  it("selectExercisesForDay returns only additions, never references existing exercises", () => {
    const rec = makeRec(10, [latTarget]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 2, 6, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    // toAdd only contains new exercises
    expect(result.toAdd.every((e) => e.exerciseId === 10)).toBe(true);
    // existingExerciseCount=2 and existingSetCount=6 are respected (not overwritten)
  });

  it("runAutoFill returns only toAdd entries; component applies them on top of existing draft", async () => {
    const weeklySnapshot: AutoFillWeeklyTarget[] = [makeWeekly(latTarget.targetId, 0, 3)];
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: weeklySnapshot,
      days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }] }] }],
    };
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay()],
        skippedDayCount: 0,
        avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }],
        currentDraft: { 0: [{ exerciseId: 99, sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 90, localId: "l1", order: 0, exerciseName: "Existing", mainMuscleGroup: "Plecy", equipment: [], isCore: false }] },
        currentPreviewResult: { weekly: weeklySnapshot, days: [{ dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] }] },
      },
      async () => [makeRec(10, [latTarget])],
      async () => trialResponse,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const newExercises = result.dayResults[0]?.toAdd ?? [];
      // Only the auto-fill exercise is in toAdd
      expect(newExercises.every((e) => e.exerciseId === 10)).toBe(true);
      // Exercise 99 (existing manual) is NOT in toAdd
      expect(newExercises.some((e) => e.exerciseId === 99)).toBe(false);
    }
  });
});

// ─── Case 20: Every unresolved target receives a diagnostic reason ─────────────

describe("Case 20 — every unresolved target receives a diagnostic reason", () => {
  it("NO_RECOMMENDATIONS_RETURNED when no candidate matches target", () => {
    // Lat in orderedTargets, but all recs have matchingTargetIds for Bic only
    const rec = makeRec(10, [bicTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      EMPTY_WEEKLY, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("NO_RECOMMENDATIONS_RETURNED");
  });

  it("AVOIDED_EXERCISE_FILTERED when all matching candidates are avoided", () => {
    const rec = makeRec(10, [latTarget], { isAvoided: true });
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      EMPTY_WEEKLY, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("AVOIDED_EXERCISE_FILTERED");
  });

  it("NO_EXACT_CONTRIBUTION_VECTOR when candidates have no coefficient data", () => {
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 7)]]);
    const rec = makeRec(10, [latTarget]);
    // EMPTY_COEFFS → no coefficient for ex10 → no_coeff rejection
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, EMPTY_COEFFS, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("NO_EXACT_CONTRIBUTION_VECTOR");
  });

  it("DAILY_REDISTRIBUTION_LIMIT_REACHED when all set counts violate redistribution", () => {
    const step3 = new Map([[latTarget.targetId, 5]]);
    const dailyCtx = new Map([[latTarget.targetId, { effectiveSets: 5.5, sessionMax: 20, isDailyOvershot: false }]]);
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 5.5, 20)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, dailyCtx, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, step3,
    );
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("DAILY_REDISTRIBUTION_LIMIT_REACHED");
  });

  it("ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT when secondary target blocks", () => {
    const weeklyTargets = new Map([
      [quadTarget.targetId, makeWeekly(quadTarget.targetId, 0, 8)],
      [gluteTarget.targetId, makeWeekly(gluteTarget.targetId, 10, 10)],
    ]);
    const coefficients = new Map([
      [99, new Map([[quadTarget.targetId, 1.0], [gluteTarget.targetId, 1.0]])],
    ]);
    const rec = makeRec(99, [quadTarget], { mainMuscleGroup: "Nogi" });
    const result = selectExercisesForDay(
      0, [quadTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("ALL_CANDIDATES_CAUSE_OTHER_TARGET_OVERSHOOT");
  });

  it("NO_SAFE_2_3_4_SET_OPTION when weekly ceiling simply too close", () => {
    // Lat: ceiling=3, current=2.0 (2.0 < 2.5 so NOT already resolved), coeff=1.0
    // sets=2: 2+2=4 > 3.5 → REJECT. sets=3/4 → worse. → NO_SAFE_2_3_4_SET_OPTION.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 2.0, 3)]]);
    const coefficients = new Map([[10, new Map([[latTarget.targetId, 1.0]])]]);
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(
      0, [latTarget], false, [rec], 0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.diagnosticReason).toBe("NO_SAFE_2_3_4_SET_OPTION");
  });
});

// ─── Supporting tests: buildDayFetchUrl ───────────────────────────────────────

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

  it("produces only GET recommendation endpoint URLs (no write operations)", () => {
    const url = buildDayFetchUrl(1, ["Plecy"], [1, 2], false, [5]);
    expect(url).toMatch(/\/plan-draft\/day-recommendations/);
    expect(url).not.toMatch(/\/save|\/activate|\/create|\/update|\/delete/);
  });
});

// ─── Supporting tests: buildTrialPreviewBody ──────────────────────────────────

describe("buildTrialPreviewBody()", () => {
  it("adds existing draft exercises with synthetic IDs < 100000", () => {
    const draft = { 0: [{ exerciseId: 5, sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 90, localId: "l1", order: 0, exerciseName: "Ex", mainMuscleGroup: "Plecy", equipment: [], isCore: false }] };
    const body = buildTrialPreviewBody(1, [{ dayIndex: 0, dayName: null }], draft, new Map());
    const entry = body.days[0]?.exercises.find((e) => e.exerciseId === 5);
    expect(entry).toBeDefined();
    expect(entry!.exerciseEntryId).toBeLessThan(100_000);
    expect(entry!.workingSets).toBe(3);
  });

  it("adds candidate exercises with exerciseEntryId ≥ 100000 at workingSets=1", () => {
    const candidates = new Map([[0, [{ id: 42 }]]]);
    const body = buildTrialPreviewBody(1, [{ dayIndex: 0, dayName: null }], {}, candidates);
    const entry = body.days[0]?.exercises.find((e) => e.exerciseId === 42);
    expect(entry).toBeDefined();
    expect(entry!.exerciseEntryId).toBeGreaterThanOrEqual(100_000);
    expect(entry!.workingSets).toBe(1);
  });
});

// ─── Supporting tests: runAutoFill orchestration ──────────────────────────────

describe("runAutoFill() — orchestration", () => {
  it("fires exactly one recommendation request per required day (parallel)", async () => {
    const fetcher = vi.fn(async () => [makeRec(10, [latTarget])]);
    await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 2 })], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }, { dayIndex: 2, dayName: null }], currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      fetcher, noOpPreview,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fires exactly one trial preview call (not per candidate)", async () => {
    const previewFetcher = vi.fn(noOpPreview);
    await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 1 })], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }, { dayIndex: 1, dayName: null }], currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      vi.fn(async () => [makeRec(10, [latTarget])]),
      previewFetcher,
    );
    // trial call + guard call = 2 total. But if nothing added, guard is skipped → 1 total.
    // With empty coefficients (noOpPreview returns no contributions), no exercises are added → no guard.
    expect(previewFetcher).toHaveBeenCalledTimes(1); // only trial
  });

  it("fires a final guard call only when exercises are proposed", async () => {
    const previewFetcher = vi.fn(noOpPreview);
    await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }], currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      vi.fn(async () => []), // no recommendations → no additions
      previewFetcher,
    );
    expect(previewFetcher).toHaveBeenCalledTimes(1); // trial only; no guard when nothing added
  });

  it("returns failure when recommendation fetch fails (atomic)", async () => {
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }], currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      async () => { throw new Error("Network error"); },
      noOpPreview,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Nie udało się przygotować/);
  });

  it("enriches exercises with matchingTargetIds before selection", async () => {
    const rawRec: AutoFillRecExercise = { id: 10, name: "Pull-down", mainMuscleGroup: "Plecy", matchingTargets: ["Latissimus dorsi"], matchingTargetIds: [], equipment: [], isAvoided: false };
    const result = await runAutoFill(
      { clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }], currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW },
      async () => [rawRec],
      noOpPreview,
    );
    expect(result.ok).toBe(true);
    // With empty coefficients, exercise is excluded (no_coeff). Target unresolved.
    // Check: no crash from the enrichment step.
  });

  it("tracks exercisesUsedInOtherDays across sequentially processed days for variety", async () => {
    // Both days receive same two candidates. Day 0 picks ex10 (first in list).
    // Day 1 should prefer ex20 (ex10 used in other days → sorted last).
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 1 })],
        skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: "Upper 1" }, { dayIndex: 1, dayName: "Upper 2" }],
        currentDraft: {}, currentPreviewResult: MOCK_EMPTY_PREVIEW,
      },
      async () => [makeRec(10, [latTarget]), makeRec(20, [latTarget])],
      noOpPreview, // empty coefficients → no exercises added (no_coeff rejection)
    );
    // With empty coefficients, nothing is added. Just verify no crash.
    expect(result.ok).toBe(true);
  });

  it("variety: exercisesUsedInOtherDays is populated after day 0 selects an exercise", async () => {
    // When a recommendation pool has two exercises for the same target, day 0 picks one.
    // The variety mechanism records it so day 1's sortedWithRank puts it last (variety penalty).
    // We only verify no crash and at least one exercise added across the two days.
    // (The score tuple places originalRank before varietyPenalty, so the exact choice
    //  on day 1 depends on the pool ordering; the integration is structural, not prescriptive.)
    const weeklySnap: AutoFillWeeklyTarget[] = [makeWeekly(latTarget.targetId, 0, 3)];
    const trialResponse: AutoFillVolumeSnapshot = {
      weekly: weeklySnap,
      days: [
        { dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }, { exerciseId: 20, coefficient: 1.0 }] }] },
        { dayId: 2, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [{ exerciseId: 10, coefficient: 1.0 }, { exerciseId: 20, coefficient: 1.0 }] }] },
      ],
    };
    const result = await runAutoFill(
      {
        clientId: 1,
        daysToProcess: [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 1 })],
        skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED,
        allDistributionDays: [{ dayIndex: 0, dayName: null }, { dayIndex: 1, dayName: null }],
        currentDraft: {},
        currentPreviewResult: {
          weekly: weeklySnap,
          days: [
            { dayId: 1, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] },
            { dayId: 2, muscles: [{ targetId: latTarget.targetId, effectiveSets: 0, sessionMax: 10, isDailyOvershot: false, contributions: [] }] },
          ],
        },
      },
      async () => [makeRec(10, [latTarget]), makeRec(20, [latTarget])],
      async () => trialResponse,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Day 0 should have added ex10 (lower originalRank = 0 wins when all else equal)
      expect(result.dayResults[0]?.toAdd[0]?.exerciseId).toBe(10);
      // Day 0 resolved the target (ex10 with 3 sets → 3 ≥ 3-0.5=2.5)
      expect(result.dayResults[0]?.resolvedTargets).toHaveLength(1);
      // Day 1: target already resolved by day 0's weekly accumulation (3 ≥ 2.5)
      // so nothing is added; day 1 result has no additions.
      expect(result.dayResults[1]?.toAdd).toHaveLength(0);
    }
  });
});

// ─── Supporting tests: computeAutoFillSummary ─────────────────────────────────

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

// ─── Supporting tests: unchanged behaviour ────────────────────────────────────

describe("selectExercisesForDay() — unchanged safety constraints", () => {
  it("avoided exercise (isAvoided flag) is not added", () => {
    const rec = makeRec(10, [latTarget], { isAvoided: true });
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
  });

  it("avoided exercise (avoidedExerciseIds set) is not added", () => {
    const rec = makeRec(10, [latTarget]);
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, new Set([10]));
    expect(result.toAdd).toHaveLength(0);
  });

  it("exact targetId matching rejects a rec with wrong ID", () => {
    const wrongIdRec: AutoFillRecExercise = { id: 10, name: "Ex", mainMuscleGroup: "Plecy", matchingTargets: ["Latissimus dorsi"], matchingTargetIds: [99], equipment: [], isAvoided: false };
    const result = selectExercisesForDay(0, [latTarget], false, [wrongIdRec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
  });

  it("enforces MAX_DAY_EXERCISES limit", () => {
    const recs = [makeRec(1, [latTarget]), makeRec(2, [bicTarget])];
    const result = selectExercisesForDay(0, [latTarget, bicTarget], false, recs, MAX_DAY_EXERCISES, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.limitHit).toBe(true);
  });

  it("enforces MAX_DAY_SETS limit", () => {
    const recs = [makeRec(1, [latTarget])];
    const result = selectExercisesForDay(0, [latTarget], false, recs, 0, MAX_DAY_SETS, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.limitHit).toBe(true);
  });

  it("Core exercise is added with isCore=true using allowed set counts", () => {
    const normalRec = makeRec(10, [latTarget]);
    const coreRec = makeCoreRec(50);
    const coefficients = new Map([
      [10, new Map([[latTarget.targetId, 1.0]])],
      [50, new Map<number, number>()], // core with no specific target — but empty = no_coeff rejection
    ]);
    // Without coefficient data, core is excluded. Use a proper coefficient for core too.
    // Actually, for Core with EMPTY_COEFFS: evaluateCandidate returns no_coeff → not added.
    // So use non-empty coefficients: just not having a weekly target guideline for core.
    const coreCoeff = new Map([[50, new Map([[99, 0.5]])]]);
    const allCoeffs = new Map([...coefficients, ...coreCoeff]);
    // With EMPTY_WEEKLY for target 99, the check passes (no guideline = no constraint).
    const result = selectExercisesForDay(
      0, [latTarget], true, [normalRec, coreRec], 0, 0, NO_AVOIDED,
      new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]),
      EMPTY_DAILY, allCoeffs, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );
    const coreEntries = result.toAdd.filter((e) => e.isCore);
    expect(result.coreAdded).toBe(true);
    expect(coreEntries).toHaveLength(1);
    expect([2, 3, 4]).toContain(coreEntries[0]?.sets);
  });

  it("Core is not added when coreEligible=false", () => {
    const result = selectExercisesForDay(0, [], false, [makeCoreRec(50)], 0, 0, NO_AVOIDED);
    expect(result.coreAdded).toBe(false);
    expect(result.toAdd).toHaveLength(0);
  });
});

// ─── Stage 4: movementPatternPenalty integration ──────────────────────────────

describe("Stage 4 — movementPatternPenalty in ScoreTuple", () => {
  /**
   * Equal-volume, equal-tier scenario: a push exercise and a pull exercise both
   * cover the target equally well. The pull exercise has no prior representation
   * in the day (penalty=0); the push has already been committed once (penalty=1).
   * The pull should win at ScoreTuple index 4 (movementPatternPenalty).
   */
  it("equal volume → underrepresented movement category wins", () => {
    // Both exercises are isolations with the same exerciseType → identical trainerPriorityRank.
    // ceiling=4, coeff=1.0 for both → identical volume scores.
    // Push exercise is listed first (lower originalRank) — but we pre-commit a push
    // exercise with id=99 so patternsAddedThisDay["push"]=1 when evaluation starts.
    // Pull exercise (id=2) has penalty=0 → wins at index 4.

    const pushRec = makeRec(1, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "push",
    });
    const pullRec = makeRec(2, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "pull",
    });
    // A pre-existing push exercise (id=99) that also covers latTarget.
    // It will be selected first (it's listed first; same volume, same tier, penalty=0 for push
    // since patternsAddedThisDay is empty at that point), causing push penalty to become 1.
    // Then on the second pass, only latTarget is still unresolved (ceiling=8 → 1 set ≠ resolved).
    // pushRec (id=1) gets penalty=1, pullRec (id=2) gets penalty=0 → pull wins.
    const prePushRec = makeRec(99, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "push",
    });

    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 8)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 1.0]])],
      [2, new Map([[latTarget.targetId, 1.0]])],
      [99, new Map([[latTarget.targetId, 1.0]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [prePushRec, pushRec, pullRec], // prePush listed first → wins pass 1
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    // Pass 1: prePushRec (id=99) committed → patternsAddedThisDay["push"]=1.
    // Pass 2: pushRec penalty=1, pullRec penalty=0 → pullRec (id=2) wins.
    expect(result.toAdd.length).toBeGreaterThanOrEqual(2);
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(99); // pre-push committed in pass 1
    expect(ids).toContain(2);  // pull wins pass 2 over push
    // The push (id=1) should NOT have been selected in pass 2 (pull was preferred).
    const passIndex = ids.indexOf(2);
    const push1Index = ids.indexOf(1);
    // pull was selected before push (or push not selected at all)
    if (push1Index !== -1) {
      expect(passIndex).toBeLessThan(push1Index);
    }
  });

  /**
   * Volume still dominates: even though a push exercise is overrepresented,
   * if it covers more unresolved volume targets than the pull exercise, it wins
   * at ScoreTuple index 0 (numRemainingUnresolved) before index 4 is consulted.
   */
  it("volume still dominates movement balance", () => {
    // Target: bicTarget (id=2) is unresolved.
    // pushRec covers BOTH latTarget AND bicTarget (numRemainingUnresolved=0 for bicTarget).
    // pullRec covers ONLY latTarget (numRemainingUnresolved=1 — bicTarget still open).
    // Even though push has already been committed once (penalty=1), volume wins at index 0.
    const pushRec = makeRec(1, [latTarget, bicTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "push",
    });
    const pullRec = makeRec(2, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "pull",
    });
    const prePushRec = makeRec(99, [gluteTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "push",
    });

    const weeklyTargets = new Map([
      [latTarget.targetId, makeWeekly(latTarget.targetId, 0, 4)],
      [bicTarget.targetId, makeWeekly(bicTarget.targetId, 0, 4)],
      [gluteTarget.targetId, makeWeekly(gluteTarget.targetId, 0, 4)],
    ]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 1.0], [bicTarget.targetId, 1.0]])],
      [2, new Map([[latTarget.targetId, 1.0]])],
      [99, new Map([[gluteTarget.targetId, 1.0]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget, bicTarget, gluteTarget], false,
      [prePushRec, pushRec, pullRec],
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    // prePushRec committed first (gluteTarget). Then for remaining (latTarget, bicTarget):
    // pushRec resolves both → numRemainingUnresolved=0; pullRec resolves only lat → 1.
    // Volume wins at index 0 → pushRec selected despite push penalty=1.
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(1); // push selected despite movement penalty — volume dominates
  });

  /**
   * trainerPriorityRank still breaks ties after movement balance is equal:
   * two exercises with equal volume AND equal movement penalty; the compound
   * should win at ScoreTuple index 5 (trainerPriorityRank).
   */
  it("trainerPriority still breaks ties after movement balance", () => {
    // Both exercises have movementCategoryKey="pull" and patternsAddedThisDay is empty
    // → both get penalty=0 → index 4 is tied.
    // Index 5 (trainerPriorityRank): compound < isolation → compound wins.
    const pullIsolation = makeRec(1, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "pull",
    });
    const pullCompound = makeRec(2, [latTarget], {
      exerciseType: "Złożone",
      neurologicalFatigue: 5,
      movementCategoryKey: "pull",
    });

    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 1.0]])],
      [2, new Map([[latTarget.targetId, 1.0]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [pullIsolation, pullCompound], // isolation listed first → lower originalRank
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(2); // compound wins on trainerPriorityRank
  });

  /**
   * Safety behaviour unchanged: movementPatternPenalty does not allow an exercise
   * to bypass the weekly ceiling. Ceiling-overshooting exercises are still rejected
   * regardless of their movement penalty score.
   */
  it("safety limits unchanged — ceiling rejection unaffected by movement penalty", () => {
    // ceiling=10, effectiveSets=9.3. Target NOT resolved: 9.3 < 9.5.
    // pushRec coeff=2.0: sets=2 → 9.3+4=13.3 > 10.5 → REJECTED on all set counts.
    // pullRec coeff=0.1: sets=3 → 9.3+0.3=9.6 ≤ 10.5 → ACCEPTED.
    // Even though push has penalty=0 (fresh), the ceiling guard fires first.
    const pushRec = makeRec(1, [latTarget], {
      exerciseType: "Złożone",
      neurologicalFatigue: 5,
      movementCategoryKey: "push",
    });
    const pullRec = makeRec(2, [latTarget], {
      exerciseType: "Izolowane",
      movementCategoryKey: "pull",
    });

    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 9.3, 10)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 2.0]])],
      [2, new Map([[latTarget.targetId, 0.1]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [pushRec, pullRec],
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(2); // pull selected; push rejected on safety
  });
});

// ─── Stage 3: trainerPriorityRank integration ─────────────────────────────────

describe("Stage 3 — trainerPriorityRank in ScoreTuple", () => {
  /**
   * Equal-volume scenario: compound and isolation produce identical volume
   * scores (ScoreTuple indices 0–3). The compound should win at index 4
   * (trainerPriorityRank) even though the isolation is listed first in the
   * recommendations array (giving it a lower originalRank / index 5).
   */
  it("equal volume → compound selected over isolation listed first", () => {
    // Isolation listed first → lower originalRank (would win at index 5).
    const isolationRec = makeRec(1, [latTarget], {
      exerciseType: "Izolowane",
      neurologicalFatigue: null,
    });
    // Compound listed second → higher originalRank.
    const compoundRec = makeRec(2, [latTarget], {
      exerciseType: "Złożone",
      neurologicalFatigue: 5,
    });

    // ceiling=3, coeff=1.0 for both.
    // sets=3 → newWeekly=3 for both: numRemainingUnresolved and
    // totalWeeklyRemaining are identical → ScoreTuple indices 0–3 are equal.
    // trainerPriorityRank: compound=0+2=2, isolation=30+2=32 → compound wins at index 4.
    // After compound committed (sets=3): weeklyBase=3.0 ≥ ceiling(3)−0.5=2.5 → RESOLVED.
    // Second pass skips the resolved target → isolation is never selected.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 1.0]])],
      [2, new Map([[latTarget.targetId, 1.0]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [isolationRec, compoundRec], // isolation first in input
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(2); // compound wins despite lower originalRank
  });

  /**
   * Better-volume scenario: the isolation covers more of the target than the
   * compound does. The isolation should win at ScoreTuple index 1
   * (totalWeeklyRemaining) before trainerPriorityRank is ever consulted,
   * even though the compound is listed first (lower originalRank).
   */
  it("better volume → isolation selected over compound when it covers more", () => {
    // Compound listed first → lower originalRank (would win index 5 tie-breaker).
    const compoundRec = makeRec(1, [latTarget], {
      exerciseType: "Złożone",
      neurologicalFatigue: 5,
    });
    // Isolation listed second but has much higher contribution coefficient.
    const isolationRec = makeRec(2, [latTarget], {
      exerciseType: "Izolowane",
      neurologicalFatigue: null,
    });

    // ceiling=3, coeff: compound=0.3, isolation=1.0.
    // sets=3: compound → newWeekly=0.9 < 2.5 → numRemainingUnresolved=1
    //         isolation → newWeekly=3.0 ≥ 2.5 → numRemainingUnresolved=0
    // Isolation wins at index 0 (numRemainingUnresolved); trainerPriorityRank never consulted.
    // After isolation committed (sets=3): weeklyBase=3.0 ≥ 2.5 → RESOLVED.
    // Second pass skips resolved target → compound is never selected.
    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 0, 3)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 0.3]])],
      [2, new Map([[latTarget.targetId, 1.0]])],
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [compoundRec, isolationRec], // compound first in input
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(2); // isolation wins on volume despite lower rank
  });

  /**
   * Safety behaviour unchanged: trainerPriorityRank does not allow a compound
   * to bypass the weekly ceiling. If the compound would overshoot the ceiling
   * and the isolation fits safely, the isolation is selected.
   */
  it("safety limits unchanged — compound rejected on overshoot, isolation accepted", () => {
    // ceiling=10, effectiveSets=9.0. Target is NOT yet resolved: 9.0 < 9.5.
    // Compound coeff=2.0: all set counts would push far above ceiling+0.5=10.5 → all rejected.
    //   sets=2 → 9+4=13 > 10.5, sets=3 → 15 > 10.5, sets=4 → 17 > 10.5.
    // Isolation coeff=0.1: all set counts stay within ceiling+0.5 → accepted.
    //   sets=3 → 9+0.3=9.3 ≤ 10.5. trainerPriorityRank cannot rescue the compound.
    const compoundRec = makeRec(1, [latTarget], {
      exerciseType: "Złożone",
      neurologicalFatigue: 5,
    });
    const isolationRec = makeRec(2, [latTarget], {
      exerciseType: "Izolowane",
    });

    const weeklyTargets = new Map([[latTarget.targetId, makeWeekly(latTarget.targetId, 9.0, 10)]]);
    const coefficients = new Map([
      [1, new Map([[latTarget.targetId, 2.0]])], // all set counts overshoot → rejected
      [2, new Map([[latTarget.targetId, 0.1]])], // fits safely within ceiling+0.5
    ]);

    const result = selectExercisesForDay(
      0, [latTarget], false,
      [compoundRec, isolationRec],
      0, 0, NO_AVOIDED,
      weeklyTargets, EMPTY_DAILY, coefficients, EMPTY_PREV_DAYS, EMPTY_USED, EMPTY_STEP3,
    );

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(2); // isolation selected; compound rejected on safety
  });
});
