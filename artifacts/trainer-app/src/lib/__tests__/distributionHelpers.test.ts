/**
 * Phase 3B — focused tests for pure distribution request/display helpers.
 *
 * No DOM, no React, no fetch. All functions are pure.
 *
 * Covers (per spec):
 *  1. request contains exactly 11 target values
 *  2. valid override becomes selectedVolume
 *  3. reset (no override) uses Phase 2 selectedValue
 *  4. selected split is included in the request
 *  5. recommended split is NOT sent
 *  6. priority order is included (derived from Phase 2 priorityOrder)
 *  7. incomplete input prevents request (various null/invalid guards)
 *  8. wrong decisions/day count is detected by consistency check
 *  9. weekly sum mismatch is detected by consistency check
 * 10. zero allocations are excluded by filterNonZeroAllocations
 */

import { describe, it, expect } from "vitest";
import {
  buildDistributionRequest,
  checkDistributionConsistency,
  filterNonZeroAllocations,
} from "../distributionHelpers";
import type { WeeklyVolumeDecisionResponseType } from "@workspace/api-zod";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TARGET_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function makeDecision(targetId: number, selectedValue = 10, priorityOrder: number | null = null) {
  return {
    targetId,
    targetName: `Target ${targetId}`,
    broadCategory: "Test",
    experienceLevel: "Zaawansowany",
    weeklyAbsoluteCeiling: 20,
    weeklyPreferredCeiling: 16,
    recommendedValue: 10,
    selectedValue,
    preferredMin: 5,
    preferredMax: 16,
    absoluteMax: 20,
    isExcluded: false,
    priorityOrder,
    reasons: [],
    warnings: [],
  };
}

function makeVolumeDecisions(
  overrides: Partial<Record<number, ReturnType<typeof makeDecision>>> = {},
): WeeklyVolumeDecisionResponseType {
  return {
    decisions: TARGET_IDS.map((id) => overrides[id] ?? makeDecision(id, 10)),
    warnings: [],
    summary: {
      totalTargets: 11,
      targetsWithWarnings: 0,
      hasBlockingWarnings: false,
    },
    metadata: {
      clientId: 1,
      experienceLevel: "Zaawansowany",
      trainingDays: 6,
      splitType: "push_pull_legs",
      recoveryProfile: "good",
    },
  } as unknown as WeeklyVolumeDecisionResponseType;
}

const BASE_PARAMS = {
  clientId: 1,
  experienceLevel: "Zaawansowany",
  trainingDays: 6,
  selectedSplitType: "push_pull_legs",
  volumeDecisions: makeVolumeDecisions(),
  volumeOverrides: {},
};

// ─── buildDistributionRequest ─────────────────────────────────────────────────

describe("buildDistributionRequest", () => {
  // 1. request contains exactly 11 target values
  it("request contains exactly 11 target values", () => {
    const req = buildDistributionRequest(BASE_PARAMS);
    expect(req).not.toBeNull();
    expect(req!.selectedWeeklyVolumes).toHaveLength(11);
    expect(req!.selectedWeeklyVolumes.map((v) => v.targetId)).toEqual(TARGET_IDS);
  });

  // 2. valid override becomes selectedVolume
  it("valid override replaces Phase 2 selectedValue", () => {
    const req = buildDistributionRequest({
      ...BASE_PARAMS,
      volumeOverrides: { 6: 14 },
    });
    expect(req).not.toBeNull();
    const entry = req!.selectedWeeklyVolumes.find((v) => v.targetId === 6);
    expect(entry!.selectedVolume).toBe(14);
  });

  // 3. reset (no override) uses Phase 2 selectedValue
  it("no override uses Phase 2 selectedValue", () => {
    const decisions = makeVolumeDecisions({ 6: makeDecision(6, 12) });
    const req = buildDistributionRequest({
      ...BASE_PARAMS,
      volumeDecisions: decisions,
      volumeOverrides: {}, // no override for target 6
    });
    expect(req).not.toBeNull();
    const entry = req!.selectedWeeklyVolumes.find((v) => v.targetId === 6);
    expect(entry!.selectedVolume).toBe(12); // Phase 2 selectedValue
  });

  // 4. selected split is included
  it("selectedSplitType is included in the request", () => {
    const req = buildDistributionRequest({
      ...BASE_PARAMS,
      selectedSplitType: "upper_lower",
      trainingDays: 4,
    });
    expect(req).not.toBeNull();
    expect(req!.selectedSplitType).toBe("upper_lower");
  });

  // 5. recommended split is NOT sent
  it("request body does NOT contain recommendedSplitType", () => {
    const req = buildDistributionRequest(BASE_PARAMS);
    expect(req).not.toBeNull();
    expect(req).not.toHaveProperty("recommendedSplitType");
  });

  // 6. priority order is included (derived from Phase 2 priorityOrder)
  it("priorityTargetIds derived from Phase 2 decisions, sorted by priorityOrder", () => {
    const decisions = makeVolumeDecisions({
      8: makeDecision(8, 10, 2), // chest — priority 2
      6: makeDecision(6, 10, 1), // shoulders — priority 1
    });
    const req = buildDistributionRequest({
      ...BASE_PARAMS,
      volumeDecisions: decisions,
    });
    expect(req).not.toBeNull();
    // P1 = 6 (Barki), P2 = 8 (Klatka) — must be in that order
    expect(req!.priorityTargetIds[0]).toBe(6);
    expect(req!.priorityTargetIds[1]).toBe(8);
    expect(req!.priorityTargetIds).toHaveLength(2);
  });

  // 7. incomplete input prevents request — various guards
  it("returns null when experienceLevel is null", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, experienceLevel: null })).toBeNull();
  });

  it("returns null when experienceLevel is invalid", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, experienceLevel: "Elite" })).toBeNull();
  });

  it("returns null when trainingDays is 0", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, trainingDays: 0 })).toBeNull();
  });

  it("returns null when trainingDays is 7", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, trainingDays: 7 })).toBeNull();
  });

  it("returns null when trainingDays is 2.5 (decimal)", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, trainingDays: 2.5 })).toBeNull();
  });

  it("returns null when trainingDays is NaN", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, trainingDays: NaN })).toBeNull();
  });

  it("returns null when trainingDays is Infinity", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, trainingDays: Infinity })).toBeNull();
  });

  it("returns null when selectedSplitType is empty", () => {
    expect(buildDistributionRequest({ ...BASE_PARAMS, selectedSplitType: "" })).toBeNull();
  });

  it("returns null when Phase 2 decisions has fewer than 11 entries", () => {
    const thinDecisions = {
      ...makeVolumeDecisions(),
      decisions: TARGET_IDS.slice(0, 10).map((id) => makeDecision(id)),
    } as unknown as WeeklyVolumeDecisionResponseType;
    expect(
      buildDistributionRequest({ ...BASE_PARAMS, volumeDecisions: thinDecisions }),
    ).toBeNull();
  });
});

// ─── checkDistributionConsistency ─────────────────────────────────────────────

function makeDistributionResponse(overrides: {
  decisionsCount?: number;
  daysCount?: number;
  sumMismatch?: boolean;
} = {}) {
  const { decisionsCount = 11, daysCount = 6, sumMismatch = false } = overrides;

  const targetDecisions = Array.from({ length: decisionsCount }, (_, i) => ({
    targetId: i + 1,
    targetName: `Target ${i + 1}`,
    broadCategory: "Test",
    weeklySelectedVolume: 10,
    allocatedWeeklyTotal: sumMismatch && i === 0 ? 9 : 10, // mismatch only on first when flagged
    allocations: [],
    sessionMin: 2,
    sessionMax: 5,
    priorityOrder: null,
    warnings: [],
  }));

  const days = Array.from({ length: daysCount }, (_, i) => ({
    dayIndex: i,
    dayName: `Day ${i + 1}`,
    dayType: "full_body",
    targetAllocations: [],
    totalEffectiveTargetVolume: 0,
  }));

  return { targetDecisions, days, warnings: [], hasBlockingIssues: false } as any;
}

describe("checkDistributionConsistency", () => {
  // 8a. wrong decisions count detected
  it("detects decisions count ≠ 11", () => {
    const result = checkDistributionConsistency(makeDistributionResponse({ decisionsCount: 10 }), 6);
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toMatch(/11/);
  });

  // 8b. wrong day count detected
  it("detects days count ≠ trainingDays", () => {
    const result = checkDistributionConsistency(makeDistributionResponse({ daysCount: 5 }), 6);
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toMatch(/5/);
  });

  // 9. weekly sum mismatch detected
  it("detects allocatedWeeklyTotal ≠ weeklySelectedVolume", () => {
    const result = checkDistributionConsistency(makeDistributionResponse({ sumMismatch: true }), 6);
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toMatch(/targetId|allocatedWeeklyTotal|weeklySelectedVolume/i);
  });

  it("returns isConsistent:true when all checks pass", () => {
    const result = checkDistributionConsistency(makeDistributionResponse(), 6);
    expect(result.isConsistent).toBe(true);
    expect(result.reason).toBeNull();
  });
});

// ─── filterNonZeroAllocations ─────────────────────────────────────────────────

describe("filterNonZeroAllocations", () => {
  // 10. zero allocations are hidden
  it("excludes entries with allocatedVolume = 0", () => {
    const allocs = [
      { targetId: 1, targetName: "A", dayIndex: 0, allocatedVolume: 5 },
      { targetId: 2, targetName: "B", dayIndex: 0, allocatedVolume: 0 },
      { targetId: 3, targetName: "C", dayIndex: 0, allocatedVolume: 2.5 },
    ];
    const filtered = filterNonZeroAllocations(allocs);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.targetId)).toEqual([1, 3]);
  });

  it("returns empty array when all allocations are zero", () => {
    const allocs = [{ targetId: 1, targetName: "A", dayIndex: 0, allocatedVolume: 0 }];
    expect(filterNonZeroAllocations(allocs)).toHaveLength(0);
  });

  it("returns all entries when none are zero", () => {
    const allocs = [
      { targetId: 1, targetName: "A", dayIndex: 0, allocatedVolume: 3 },
      { targetId: 2, targetName: "B", dayIndex: 0, allocatedVolume: 1.5 },
    ];
    expect(filterNonZeroAllocations(allocs)).toHaveLength(2);
  });
});
