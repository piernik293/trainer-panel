/**
 * computeEligibleTargetNeeds — pure unit tests (Phase 4B3)
 *
 * Tests cover spec section 14 cases 1–6 (eligibility rules), 14–18
 * (live-update behaviour via draft changes and buildCoverageKey contract),
 * 19–21 (Core eligibility + completed-day state).
 *
 * No React, no DB. Pure function assertions only.
 */

import { describe, it, expect } from "vitest";
import { computeEligibleTargetNeeds } from "../coreCoverageHelpers";
import { buildCoverageKey } from "../../hooks/useVolumeCoverage";
import type { ExerciseDraftByDay } from "../exerciseDraftHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDay(
  dayIndex: number,
  allocations: Array<{ targetId: number; targetName: string; allocatedVolume: number }>,
) {
  return { dayIndex, targetAllocations: allocations };
}

function makeDistribution(
  targetDecisions: Array<{ targetId: number; weeklySelectedVolume: number }>,
  coreWeeklySelectedSets = 0,
  coreDayAllocations: Array<{ dayIndex: number; sets: number }> = [],
) {
  return {
    targetDecisions,
    auxiliaryCoreBlock: {
      dayAllocations: coreDayAllocations,
      weeklySelectedSets: coreWeeklySelectedSets,
    },
  };
}

function makePreview(
  days: Array<{ dayId: number; muscles: Array<{ targetId: number; effectiveSets: number }> }>,
  weekly: Array<{ targetId: number; effectiveSets: number }>,
) {
  return { days, weekly };
}

function makeDraftExercise(
  exerciseId: number,
  mainMuscleGroup: string,
  sets: number,
  overrides: Partial<{
    localId: string;
    exerciseName: string;
    equipment: string[];
    isCore: boolean;
    repsMin: number;
    repsMax: number;
    rir: number;
    restSeconds: number;
  }> = {},
) {
  return {
    localId: overrides.localId ?? `local-${exerciseId}`,
    exerciseId,
    exerciseName: overrides.exerciseName ?? `Exercise ${exerciseId}`,
    mainMuscleGroup,
    equipment: overrides.equipment ?? [],
    isCore: overrides.isCore ?? false,
    sets,
    repsMin: overrides.repsMin ?? 8,
    repsMax: overrides.repsMax ?? 12,
    rir: overrides.rir ?? 2,
    restSeconds: overrides.restSeconds ?? 90,
  };
}

const TARGET_LAT = 1;
const TARGET_TRAP = 2;

// ─── Cases 1–6: Eligibility rules ─────────────────────────────────────────────

describe("computeEligibleTargetNeeds() — eligibility rules", () => {
  // Case 1: Target with dailyRemaining > 0.01 AND weeklyRemaining > 0.01 → eligible
  it("case 1: target with sufficient daily and weekly remaining is eligible", () => {
    const day = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 }]);
    const dist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);
    // Preview: 1.5 effective sets done (so 2.5 daily remaining, 10.5 weekly remaining)
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 1.5 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 1.5 }],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.normalNeeds).toHaveLength(1);
    expect(result.normalNeeds[0]?.targetId).toBe(TARGET_LAT);
    expect(result.normalNeeds[0]?.dailyRemaining).toBeCloseTo(2.5, 5);
    expect(result.normalNeeds[0]?.weeklyRemaining).toBeCloseTo(10.5, 5);
  });

  // Case 2: dailyRemaining ≤ 0.01 → not eligible (daily covered)
  it("case 2: target with daily fully covered is not eligible", () => {
    const day = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 }]);
    const dist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 4 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 4 }],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.normalNeeds).toHaveLength(0);
  });

  // Case 3: weeklyRemaining ≤ 0.01 → not eligible (weekly covered)
  it("case 3: target with weekly fully covered is not eligible (even if daily still has room)", () => {
    const day = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 }]);
    const dist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 1 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 12 }], // weekly done
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.normalNeeds).toHaveLength(0);
  });

  // Case 4: allocatedVolume === 0 → not eligible (no plan for this day)
  it("case 4: target with zero planned daily volume is not eligible", () => {
    const day = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 0 }]);
    const dist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [] }],
      [{ targetId: TARGET_LAT, effectiveSets: 0 }],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.normalNeeds).toHaveLength(0);
  });

  // Case 5: Multiple targets independently evaluated
  it("case 5: each target's eligibility is evaluated independently", () => {
    const day = makeDay(0, [
      { targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 },
      { targetId: TARGET_TRAP, targetName: "Trap", allocatedVolume: 3 },
    ]);
    const dist = makeDistribution([
      { targetId: TARGET_LAT, weeklySelectedVolume: 12 },
      { targetId: TARGET_TRAP, weeklySelectedVolume: 8 },
    ]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [
        { targetId: TARGET_LAT, effectiveSets: 4 },   // daily covered
        { targetId: TARGET_TRAP, effectiveSets: 1 },  // daily NOT covered
      ]}],
      [
        { targetId: TARGET_LAT, effectiveSets: 4 },
        { targetId: TARGET_TRAP, effectiveSets: 1 },
      ],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    // LAT is covered, TRAP is not
    expect(result.normalNeeds).toHaveLength(1);
    expect(result.normalNeeds[0]?.targetId).toBe(TARGET_TRAP);
  });

  // Case 6: Eligible targets sorted — zero-actual first → highest remaining% → allocationOrder
  it("case 6: eligible targets are sorted by priority (zero-actual first, then remaining%)", () => {
    const day = makeDay(0, [
      { targetId: 1, targetName: "T1", allocatedVolume: 10 }, // allocationOrder=0, actual=5, remaining=50%
      { targetId: 2, targetName: "T2", allocatedVolume: 8 },  // allocationOrder=1, actual=0, remaining=100% (ZERO → first)
      { targetId: 3, targetName: "T3", allocatedVolume: 6 },  // allocationOrder=2, actual=1, remaining=83%
    ]);
    const dist = makeDistribution([
      { targetId: 1, weeklySelectedVolume: 20 },
      { targetId: 2, weeklySelectedVolume: 16 },
      { targetId: 3, weeklySelectedVolume: 12 },
    ]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [
        { targetId: 1, effectiveSets: 5 },  // 50% remaining
        { targetId: 2, effectiveSets: 0 },  // 100% remaining (zero-actual → first)
        { targetId: 3, effectiveSets: 1 },  // 83% remaining
      ]}],
      [
        { targetId: 1, effectiveSets: 5 },
        { targetId: 2, effectiveSets: 0 },
        { targetId: 3, effectiveSets: 1 },
      ],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.normalNeeds).toHaveLength(3);
    expect(result.normalNeeds[0]?.targetId).toBe(2); // zero-actual → first
    expect(result.normalNeeds[1]?.targetId).toBe(3); // 83% remaining → second
    expect(result.normalNeeds[2]?.targetId).toBe(1); // 50% remaining → third
  });
});

// ─── Cases 14–17: Live-update behaviour via draft changes ────────────────────

describe("computeEligibleTargetNeeds() — live-update via draft changes", () => {
  const baseDay = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 }]);
  const baseDist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);

  // Case 14-15: Adding an exercise (recommended or manual) with sets covers more volume
  it("case 14-15: adding an exercise with sets reduces dailyRemaining", () => {
    // Before adding: actual=1, remaining=3
    const previewBefore = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 1 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 1 }],
    );
    const resultBefore = computeEligibleTargetNeeds(baseDay, baseDist, previewBefore, {});
    expect(resultBefore.normalNeeds[0]?.dailyRemaining).toBeCloseTo(3, 5);

    // After adding: actual=3.5, remaining=0.5
    const previewAfter = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 3.5 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 3.5 }],
    );
    const resultAfter = computeEligibleTargetNeeds(baseDay, baseDist, previewAfter, {});
    expect(resultAfter.normalNeeds[0]?.dailyRemaining).toBeCloseTo(0.5, 5);
  });

  // Case 16: Changing sets field updates eligible targets
  it("case 16: increasing sets reduces remaining (target may become ineligible)", () => {
    // Remaining goes from 0.5 to exactly 0 → ineligible
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 4 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 4 }],
    );
    const result = computeEligibleTargetNeeds(baseDay, baseDist, preview, {});
    expect(result.normalNeeds).toHaveLength(0); // fully covered
  });

  // Case 17: Removing exercise restores remaining volume → target becomes eligible again
  it("case 17: removing an exercise increases remaining (target becomes eligible again)", () => {
    // After removal: actual drops back to 0
    const previewAfterRemoval = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 0 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 0 }],
    );
    const result = computeEligibleTargetNeeds(baseDay, baseDist, previewAfterRemoval, {});
    expect(result.normalNeeds).toHaveLength(1); // target eligible again
    expect(result.normalNeeds[0]?.actualDaily).toBe(0);
  });
});

// ─── Case 18: Reps / RIR / rest / order changes do NOT trigger refresh ────────

describe("buildCoverageKey() — reps/RIR/rest/order non-trigger (case 18)", () => {
  it("buildCoverageKey does not change when only reps change (same exerciseId + sets)", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { repsMin: 8, repsMax: 12 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { repsMin: 6, repsMax: 10 })], // different reps
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("buildCoverageKey does not change when only RIR changes", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { rir: 2 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { rir: 0 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("buildCoverageKey does not change when only rest changes", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { restSeconds: 90 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3, { restSeconds: 120 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("buildCoverageKey DOES change when sets change (triggers coverage recalculation)", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3)],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 4)], // different sets
    };
    expect(buildCoverageKey(draft1)).not.toBe(buildCoverageKey(draft2));
  });

  it("buildCoverageKey DOES change when an exercise is added (triggers coverage recalculation)", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3)],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeDraftExercise(10, "Plecy", 3), makeDraftExercise(11, "Plecy", 3)],
    };
    expect(buildCoverageKey(draft1)).not.toBe(buildCoverageKey(draft2));
  });
});

// ─── Cases 19–20: Core eligibility ──────────────────────────────────────────

describe("computeEligibleTargetNeeds() — Core eligibility", () => {
  // Case 19: Core eligible when planned > 0, daily remaining > 0, weekly remaining > 0
  it("case 19: coreEligible=true when planned sets > 0 and remaining daily and weekly", () => {
    const day = makeDay(0, []);
    const dist = makeDistribution([], 6, [{ dayIndex: 0, sets: 3 }]);
    const preview = makePreview([{ dayId: 1, muscles: [] }], []);
    // Draft has no core exercises yet
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.coreEligible).toBe(true);
    expect(result.coreDailyPlanned).toBe(3);
    expect(result.coreDailyActual).toBe(0);
    expect(result.coreDailyRemaining).toBe(3);
  });

  // Case 20: Core ineligible when no Core allocation
  it("case 20: coreEligible=false when no Core allocation for this day", () => {
    const day = makeDay(0, []);
    const dist = makeDistribution([], 0, []); // no core planned
    const preview = makePreview([{ dayId: 1, muscles: [] }], []);
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.coreEligible).toBe(false);
  });

  it("core actual sets counted from Brzuch exercises in draft for this day", () => {
    const day = makeDay(0, []);
    const dist = makeDistribution([], 6, [{ dayIndex: 0, sets: 3 }]);
    const preview = makePreview([{ dayId: 1, muscles: [] }], []);
    const draftWithCoreExercise: ExerciseDraftByDay = {
      0: [makeDraftExercise(50, "Brzuch", 3, { isCore: true })],
    };
    const result = computeEligibleTargetNeeds(day, dist, preview, draftWithCoreExercise);
    expect(result.coreDailyActual).toBe(3);
    expect(result.coreDailyRemaining).toBe(0); // planned 3 - actual 3 = 0
    expect(result.coreEligible).toBe(false); // no remaining
  });
});

// ─── Case 21: Completed-day state ────────────────────────────────────────────

describe("computeEligibleTargetNeeds() — completed-day state (case 21)", () => {
  it("case 21: allDaysCovered=true when all normal targets covered and no Core remaining", () => {
    const day = makeDay(0, [
      { targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 },
    ]);
    const dist = makeDistribution(
      [{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }],
      6,
      [{ dayIndex: 0, sets: 3 }],
    );
    // Everything covered: normal daily, normal weekly, Core all done
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 4 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 12 }],
    );
    const draftWithCore: ExerciseDraftByDay = {
      0: [makeDraftExercise(50, "Brzuch", 3, { isCore: true })],
    };
    const result = computeEligibleTargetNeeds(day, dist, preview, draftWithCore);
    expect(result.normalNeeds).toHaveLength(0);
    expect(result.coreEligible).toBe(false);
    expect(result.allDaysCovered).toBe(true);
  });

  it("allDaysCovered=false when at least one target still has remaining volume", () => {
    const day = makeDay(0, [{ targetId: TARGET_LAT, targetName: "Lat", allocatedVolume: 4 }]);
    const dist = makeDistribution([{ targetId: TARGET_LAT, weeklySelectedVolume: 12 }]);
    const preview = makePreview(
      [{ dayId: 1, muscles: [{ targetId: TARGET_LAT, effectiveSets: 1 }] }],
      [{ targetId: TARGET_LAT, effectiveSets: 1 }],
    );
    const result = computeEligibleTargetNeeds(day, dist, preview, {});
    expect(result.allDaysCovered).toBe(false);
  });
});
