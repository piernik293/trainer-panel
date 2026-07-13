/**
 * Unit tests for the pure plan analysis core.
 *
 * No database dependency — all helpers under test accept in-memory data.
 *
 * Test items (corresponds to spec §AUTOMATED TESTS):
 *  1.  Push and Pull with equal sets → balanced
 *  2.  Push dominance
 *  3.  Pull dominance
 *  4.  Zero Pull sets → no division error
 *  5.  Squat and Hinge with equal sets → balanced
 *  6.  Squat dominance
 *  7.  Hinge dominance
 *  8.  Minimum combined-set threshold
 *  9.  Movement-category working-set totals
 * 10.  Exercise-entry totals
 * 11.  Compound vs isolation totals
 * 12.  Bilateral vs unilateral totals
 * 13.  Plane-of-motion totals
 * 14.  One exercise counted only once in its primary category
 * 15.  Repeated movement-pattern detection
 * 16.  Weekly distribution between multiple days
 * 17.  Missing movement-pattern warning
 * 18.  Missing exercise-type warning
 * 19.  Missing execution-type warning
 * 20.  Missing plane-of-motion warning
 * 21.  Inactive exercise warning with preserved contribution
 * 22.  Missing exercise record warning (via normalizePlanAnalysisInput)
 * 23.  Invalid working-sets warning
 * 24.  Saved-plan and draft-preview equality (integration — skipped without DB)
 * 25.  Stale frontend responses — handled via monotonic reqId in useAnalysisPreview
 *       (see planApi.ts; structural test not practical here)
 * 26.  Existing volume-preview result unchanged (run alongside existing suite)
 * 27.  Existing Volume Calculator tests still pass (same vitest run)
 *
 * Normalization helpers also tested separately.
 */

import { describe, it, expect } from "vitest";
import {
  calculatePlanAnalysisCore,
  computePushPullBalance,
  computeSquatHingeBalance,
  normalizeMovementCategory,
  normalizeSubPattern,
  normalizeExerciseType,
  normalizeExecution,
  normalizePlane,
  normalizePlanAnalysisInput,
  BALANCE_CONFIG,
  ALL_CATEGORIES,
  type NormalizedAnalysisEntry,
  type AnalysisWarning,
} from "../planAnalyzer";

// ─── Test helper ─────────────────────────────────────────────────────────────

let _entryId = 1;

function makeEntry(
  overrides: Partial<NormalizedAnalysisEntry> & {
    exerciseId: number;
    workingSets: number;
    dayId: number;
  },
): NormalizedAnalysisEntry {
  return {
    entryId: _entryId++,
    dayId: overrides.dayId,
    dayName: overrides.dayName ?? `Day${overrides.dayId}`,
    dayOrder: overrides.dayOrder ?? overrides.dayId - 1,
    exerciseId: overrides.exerciseId,
    exerciseName: overrides.exerciseName ?? `Exercise${overrides.exerciseId}`,
    workingSets: overrides.workingSets,
    movementPattern: overrides.movementPattern ?? null,
    movementCategory: overrides.movementCategory ?? null,
    resolvedCategory: overrides.resolvedCategory ?? null,
    resolvedSubPattern: overrides.resolvedSubPattern ?? null,
    resolvedExerciseType: overrides.resolvedExerciseType ?? null,
    resolvedExecution: overrides.resolvedExecution ?? null,
    resolvedPlane: overrides.resolvedPlane ?? null,
    exerciseFound: overrides.exerciseFound ?? true,
    isActive: overrides.isActive ?? true,
  };
}

function pushEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 10, workingSets: sets, dayId, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" });
}
function pullEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 20, workingSets: sets, dayId, resolvedCategory: "pull", resolvedSubPattern: "vertical_pull", movementPattern: "Przyciąganie pionowe" });
}
function squatEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 30, workingSets: sets, dayId, resolvedCategory: "squat", movementPattern: "Przysiad" });
}
function hingeEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 40, workingSets: sets, dayId, resolvedCategory: "hinge", movementPattern: "Zawiasowe" });
}
function compoundEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 50, workingSets: sets, dayId, resolvedCategory: "push", resolvedExerciseType: "compound", resolvedExecution: "bilateral", resolvedPlane: "sagittal" });
}
function isolationEntry(sets: number, dayId = 1): NormalizedAnalysisEntry {
  return makeEntry({ exerciseId: 60, workingSets: sets, dayId, resolvedCategory: "pull", resolvedExerciseType: "isolation", resolvedExecution: "unilateral", resolvedPlane: "frontal" });
}

// ─── 1. Push / Pull balance ──────────────────────────────────────────────────

describe("computePushPullBalance", () => {
  // item 1
  it("equal sets → balanced", () => {
    const r = computePushPullBalance(10, 10);
    expect(r.status).toBe("balanced");
    expect(r.severity).toBe("success");
  });

  // item 2
  it("push dominant (ratio 1.6 > 1.5 threshold)", () => {
    const r = computePushPullBalance(16, 10);
    expect(r.status).toBe("push_dominant");
    expect(r.severity).toBe("warning");
    expect(r.ratio).toBeCloseTo(1.6, 5);
  });

  it("strongly push dominant (ratio > 2.0 threshold)", () => {
    const r = computePushPullBalance(21, 10);
    expect(r.status).toBe("strongly_push_dominant");
    expect(r.severity).toBe("error");
  });

  // item 3
  it("pull dominant (inverse ratio > threshold)", () => {
    const r = computePushPullBalance(10, 16);
    expect(r.status).toBe("pull_dominant");
    expect(r.severity).toBe("warning");
  });

  it("strongly pull dominant", () => {
    const r = computePushPullBalance(5, 11);
    expect(r.status).toBe("strongly_pull_dominant");
    expect(r.severity).toBe("error");
  });

  // item 4 — zero division safety
  it("zero pull sets → strongly push dominant, no division error", () => {
    expect(() => computePushPullBalance(10, 0)).not.toThrow();
    const r = computePushPullBalance(10, 0);
    expect(r.status).toBe("strongly_push_dominant");
    expect(r.ratio).toBe(Infinity);
    expect(r.message).not.toContain("NaN");
  });

  it("zero push sets → strongly pull dominant", () => {
    const r = computePushPullBalance(0, 10);
    expect(r.status).toBe("strongly_pull_dominant");
  });

  // item 8 — minimum combined threshold
  it("below minimum combined sets → insufficient_data", () => {
    const r = computePushPullBalance(3, 2); // combined 5 < 6
    expect(r.status).toBe("insufficient_data");
    expect(r.severity).toBe("info");
    expect(r.ratio).toBeNull();
  });

  it("at exactly minimum combined sets → not insufficient_data", () => {
    const min = BALANCE_CONFIG.pushPull.minimumCombinedSets;
    const r = computePushPullBalance(Math.ceil(min / 2), Math.floor(min / 2));
    expect(r.status).not.toBe("insufficient_data");
  });

  it("returns exact set counts in result", () => {
    const r = computePushPullBalance(14, 8);
    expect(r.pushSets).toBe(14);
    expect(r.pullSets).toBe(8);
  });
});

// ─── 5–7. Squat / Hinge balance ──────────────────────────────────────────────

describe("computeSquatHingeBalance", () => {
  // item 5
  it("equal sets → balanced", () => {
    const r = computeSquatHingeBalance(8, 8);
    expect(r.status).toBe("balanced");
    expect(r.severity).toBe("success");
  });

  // item 6
  it("squat dominant (ratio > 1.75 threshold)", () => {
    const r = computeSquatHingeBalance(18, 10);
    expect(r.status).toBe("squat_dominant");
    expect(r.severity).toBe("warning");
  });

  it("strongly squat dominant (ratio > 2.5 threshold)", () => {
    const r = computeSquatHingeBalance(26, 10);
    expect(r.status).toBe("strongly_squat_dominant");
    expect(r.severity).toBe("error");
  });

  // item 7
  it("hinge dominant", () => {
    const r = computeSquatHingeBalance(10, 18);
    expect(r.status).toBe("hinge_dominant");
    expect(r.severity).toBe("warning");
  });

  it("strongly hinge dominant", () => {
    const r = computeSquatHingeBalance(4, 11);
    expect(r.status).toBe("strongly_hinge_dominant");
    expect(r.severity).toBe("error");
  });

  it("zero hinge sets → no division error", () => {
    expect(() => computeSquatHingeBalance(10, 0)).not.toThrow();
    const r = computeSquatHingeBalance(10, 0);
    expect(r.status).toBe("strongly_squat_dominant");
  });

  // item 8 — squat/hinge minimum threshold
  it("below minimum combined sets → insufficient_data", () => {
    const r = computeSquatHingeBalance(2, 1); // combined 3 < 4
    expect(r.status).toBe("insufficient_data");
  });
});

// ─── 9. Movement-category working-set totals ──────────────────────────────────

describe("calculatePlanAnalysisCore — category totals (item 9)", () => {
  it("correctly accumulates working sets per category", () => {
    const entries = [
      pushEntry(4), pushEntry(3),
      pullEntry(5),
      squatEntry(4), squatEntry(4),
      hingeEntry(3),
    ];
    const result = calculatePlanAnalysisCore(entries);
    const pushCat  = result.movementCategories.find((c) => c.category === "push")!;
    const pullCat  = result.movementCategories.find((c) => c.category === "pull")!;
    const squatCat = result.movementCategories.find((c) => c.category === "squat")!;
    const hingeCat = result.movementCategories.find((c) => c.category === "hinge")!;
    expect(pushCat.workingSets).toBe(7);
    expect(pullCat.workingSets).toBe(5);
    expect(squatCat.workingSets).toBe(8);
    expect(hingeCat.workingSets).toBe(3);
  });

  it("empty plan → all categories have 0 sets", () => {
    const result = calculatePlanAnalysisCore([]);
    for (const cat of result.movementCategories) {
      expect(cat.workingSets).toBe(0);
    }
  });

  it("returns one CategoryAnalysis per category (all 8 always present)", () => {
    const result = calculatePlanAnalysisCore([pushEntry(4)]);
    expect(result.movementCategories).toHaveLength(ALL_CATEGORIES.length);
  });
});

// ─── 10. Exercise-entry totals ────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — entry totals (item 10)", () => {
  it("counts total exercise entries correctly", () => {
    const entries = [pushEntry(4), pushEntry(3), pullEntry(5)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.summary.totalExerciseEntries).toBe(3);
    expect(result.summary.totalWorkingSets).toBe(12);
  });

  it("counts per-category exercise entries", () => {
    const entries = [pushEntry(4), pushEntry(3), pullEntry(5)];
    const result = calculatePlanAnalysisCore(entries);
    const pushCat = result.movementCategories.find((c) => c.category === "push")!;
    const pullCat = result.movementCategories.find((c) => c.category === "pull")!;
    expect(pushCat.exerciseEntries).toBe(2);
    expect(pullCat.exerciseEntries).toBe(1);
  });
});

// ─── 11. Compound vs isolation ────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — compound/isolation (item 11)", () => {
  it("correctly accumulates compound and isolation sets", () => {
    const entries = [
      compoundEntry(4), compoundEntry(3),  // 7 compound sets
      isolationEntry(3), isolationEntry(2), // 5 isolation sets
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.exerciseTypes.compoundSets).toBe(7);
    expect(result.exerciseTypes.isolationSets).toBe(5);
    expect(result.exerciseTypes.compoundEntries).toBe(2);
    expect(result.exerciseTypes.isolationEntries).toBe(2);
  });

  it("percentages sum to 100 when all exercises have type metadata", () => {
    const entries = [compoundEntry(6), isolationEntry(4)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.exerciseTypes.compoundPercentage + result.exerciseTypes.isolationPercentage)
      .toBeCloseTo(100, 5);
  });

  it("unknown type exercises tracked separately, do not inflate known totals", () => {
    const unknown = makeEntry({ exerciseId: 99, workingSets: 5, dayId: 1, resolvedCategory: "core" });
    const entries = [compoundEntry(4), unknown];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.exerciseTypes.unknownEntries).toBe(1);
    expect(result.exerciseTypes.unknownSets).toBe(5);
    expect(result.exerciseTypes.compoundSets).toBe(4);
  });

  it("all isolation → ALL_ISOLATION warning emitted", () => {
    const entries = [isolationEntry(4), isolationEntry(3)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "ALL_ISOLATION")).toBe(true);
  });

  it("no ALL_ISOLATION when no exercises have exercise-type metadata", () => {
    const entries = [pushEntry(4)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "ALL_ISOLATION")).toBe(false);
  });
});

// ─── 12. Bilateral vs unilateral ─────────────────────────────────────────────

describe("calculatePlanAnalysisCore — bilateral/unilateral (item 12)", () => {
  it("correctly accumulates bilateral and unilateral sets", () => {
    const entries = [compoundEntry(6), isolationEntry(4)]; // compound=bilateral, isolation=unilateral
    const result = calculatePlanAnalysisCore(entries);
    expect(result.executionTypes.bilateralSets).toBe(6);
    expect(result.executionTypes.unilateralSets).toBe(4);
  });

  it("tracks days with unilateral work", () => {
    const e1 = isolationEntry(3, 1);
    const e2 = isolationEntry(3, 2);
    const result = calculatePlanAnalysisCore([e1, e2]);
    expect(result.executionTypes.daysWithUnilateral).toBe(2);
  });

  it("UNILATERAL_ABSENT info emitted for plan with ≥3 days and no unilateral", () => {
    const entries = [
      compoundEntry(4, 1),
      compoundEntry(4, 2),
      compoundEntry(4, 3),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "UNILATERAL_ABSENT")).toBe(true);
  });

  it("no UNILATERAL_ABSENT for plan with 2 days", () => {
    const entries = [compoundEntry(4, 1), compoundEntry(4, 2)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "UNILATERAL_ABSENT")).toBe(false);
  });
});

// ─── 13. Plane of motion ──────────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — planes of motion (item 13)", () => {
  it("accumulates sagittal sets and entries", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedPlane: "sagittal" }),
      makeEntry({ exerciseId: 2, workingSets: 3, dayId: 1, resolvedCategory: "pull", resolvedPlane: "sagittal" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.planesOfMotion.sagittalSets).toBe(7);
    expect(result.planesOfMotion.sagittalEntries).toBe(2);
  });

  it("accumulates frontal and transverse separately", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "lunge", resolvedPlane: "frontal" }),
      makeEntry({ exerciseId: 2, workingSets: 3, dayId: 1, resolvedCategory: "rotation", resolvedPlane: "transverse" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.planesOfMotion.frontalSets).toBe(4);
    expect(result.planesOfMotion.transverseSets).toBe(3);
    expect(result.planesOfMotion.sagittalSets).toBe(0);
  });

  it("unknown plane tracked separately", () => {
    const e = makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "push" });
    const result = calculatePlanAnalysisCore([e]);
    expect(result.planesOfMotion.unknownSets).toBe(4);
  });
});

// ─── 14. One exercise counted once (primary category) ────────────────────────

describe("calculatePlanAnalysisCore — single-counting (item 14)", () => {
  it("an exercise with resolvedCategory=push adds to push only", () => {
    const e = makeEntry({
      exerciseId: 1, workingSets: 5, dayId: 1,
      resolvedCategory: "push",
      resolvedSubPattern: "horizontal_push",
    });
    const result = calculatePlanAnalysisCore([e]);
    const pushSets  = result.movementCategories.find((c) => c.category === "push")!.workingSets;
    const pullSets  = result.movementCategories.find((c) => c.category === "pull")!.workingSets;
    const totalCatSets = result.movementCategories.reduce((s, c) => s + c.workingSets, 0);

    expect(pushSets).toBe(5);
    expect(pullSets).toBe(0);
    expect(totalCatSets).toBe(5); // no double-counting
  });
});

// ─── 15. Repeated movement patterns ──────────────────────────────────────────

describe("calculatePlanAnalysisCore — repeated patterns (item 15)", () => {
  it("detects ≥3 exercises with the same pattern in one day", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 3, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
      makeEntry({ exerciseId: 2, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
      makeEntry({ exerciseId: 3, workingSets: 3, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    const day = result.days.find((d) => d.dayId === 1)!;
    expect(day.repeatedPatterns).toHaveLength(1);
    expect(day.repeatedPatterns[0].exerciseCount).toBe(3);
    expect(day.repeatedPatterns[0].workingSets).toBe(10);

    const warn = result.warnings.find((w) => w.code === "REPEATED_MOVEMENT_PATTERN");
    expect(warn).toBeDefined();
    expect(warn!.dayId).toBe(1);
  });

  it("2 exercises with same pattern → NOT flagged (threshold is 3)", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
      makeEntry({ exerciseId: 2, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "REPEATED_MOVEMENT_PATTERN")).toBe(false);
  });

  it("patterns from different days are NOT grouped together", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
      makeEntry({ exerciseId: 2, workingSets: 4, dayId: 1, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
      makeEntry({ exerciseId: 3, workingSets: 4, dayId: 2, resolvedCategory: "push", resolvedSubPattern: "horizontal_push", movementPattern: "Pchanie poziome" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "REPEATED_MOVEMENT_PATTERN")).toBe(false);
  });
});

// ─── 16. Weekly distribution ─────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — weekly distribution (item 16)", () => {
  it("shows push distributed across 2 days", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 8, dayId: 1, dayName: "Day A", resolvedCategory: "push" }),
      makeEntry({ exerciseId: 2, workingSets: 4, dayId: 2, dayName: "Day B", resolvedCategory: "push" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    const wd = result.weeklyDistribution.find((w) => w.category === "push")!;
    expect(wd.totalSets).toBe(12);
    expect(wd.daysCount).toBe(2);
    expect(wd.maxSetsInOneDay).toBe(8);
    expect(wd.maxSetsDayName).toBe("Day A");
    expect(wd.concentrationPercentage).toBeCloseTo((8 / 12) * 100, 4);
  });

  it("MOVEMENT_CONCENTRATED warning when all sets in one day (major category, ≥6 sets)", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 6, dayId: 1, resolvedCategory: "push" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "MOVEMENT_CONCENTRATED")).toBe(true);
  });

  it("no MOVEMENT_CONCENTRATED when < 6 total sets", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 4, dayId: 1, resolvedCategory: "push" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "MOVEMENT_CONCENTRATED")).toBe(false);
  });

  it("no MOVEMENT_CONCENTRATED when sets spread across 2 days", () => {
    const entries = [
      makeEntry({ exerciseId: 1, workingSets: 8, dayId: 1, resolvedCategory: "push" }),
      makeEntry({ exerciseId: 2, workingSets: 4, dayId: 2, resolvedCategory: "push" }),
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.warnings.some((w) => w.code === "MOVEMENT_CONCENTRATED")).toBe(false);
  });
});

// ─── 17–20. Missing metadata warnings ────────────────────────────────────────

describe("normalizePlanAnalysisInput — missing metadata warnings (items 17-23)", () => {
  function makeMeta(overrides: Partial<{
    id: number; name: string; movementPattern: string | null; movementCategory: string | null;
    exerciseType: string | null; execution: string | null; planeOfMotion: string | null; isActive: boolean;
  }> = {}) {
    return new Map([[overrides.id ?? 1, {
      id: overrides.id ?? 1,
      name: overrides.name ?? "Test Exercise",
      movementPattern: overrides.movementPattern ?? null,
      movementCategory: overrides.movementCategory ?? null,
      exerciseType: overrides.exerciseType ?? null,
      execution: overrides.execution ?? null,
      planeOfMotion: overrides.planeOfMotion ?? null,
      isActive: overrides.isActive ?? true,
    }]]);
  }

  const baseDays = [{ dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: 3 }] }];

  // item 17
  it("MISSING_MOVEMENT_PATTERN when both pattern and category are null", () => {
    const { warnings } = normalizePlanAnalysisInput(baseDays, makeMeta());
    expect(warnings.some((w) => w.code === "MISSING_MOVEMENT_PATTERN")).toBe(true);
  });

  it("no MISSING_MOVEMENT_PATTERN when movementPattern is present and resolves", () => {
    const { warnings } = normalizePlanAnalysisInput(baseDays, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "MISSING_MOVEMENT_PATTERN")).toBe(false);
  });

  // item 18
  it("MISSING_EXERCISE_TYPE when exerciseType is null", () => {
    const { warnings } = normalizePlanAnalysisInput(baseDays, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "MISSING_EXERCISE_TYPE")).toBe(true);
  });

  it("no MISSING_EXERCISE_TYPE when exerciseType is present", () => {
    const { warnings } = normalizePlanAnalysisInput(
      baseDays,
      makeMeta({ movementPattern: "Pchanie poziome", exerciseType: "Złożone" }),
    );
    expect(warnings.some((w) => w.code === "MISSING_EXERCISE_TYPE")).toBe(false);
  });

  // item 19
  it("MISSING_EXECUTION_TYPE when execution is null", () => {
    const { warnings } = normalizePlanAnalysisInput(baseDays, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "MISSING_EXECUTION_TYPE")).toBe(true);
  });

  it("no MISSING_EXECUTION_TYPE when execution is present", () => {
    const { warnings } = normalizePlanAnalysisInput(
      baseDays,
      makeMeta({ movementPattern: "Pchanie poziome", execution: "Obustronne" }),
    );
    expect(warnings.some((w) => w.code === "MISSING_EXECUTION_TYPE")).toBe(false);
  });

  // item 20
  it("MISSING_PLANE_OF_MOTION when planeOfMotion is null", () => {
    const { warnings } = normalizePlanAnalysisInput(baseDays, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "MISSING_PLANE_OF_MOTION")).toBe(true);
  });

  it("no MISSING_PLANE_OF_MOTION when planeOfMotion is present", () => {
    const { warnings } = normalizePlanAnalysisInput(
      baseDays,
      makeMeta({ movementPattern: "Pchanie poziome", planeOfMotion: "Strzałkowa" }),
    );
    expect(warnings.some((w) => w.code === "MISSING_PLANE_OF_MOTION")).toBe(false);
  });

  // item 21
  it("INACTIVE_EXERCISE warning but exercise still contributes to analysis", () => {
    const days = [{ dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: 4 }] }];
    const meta = makeMeta({ movementPattern: "Pchanie poziome", isActive: false });
    const { entries, warnings } = normalizePlanAnalysisInput(days, meta);
    expect(warnings.some((w) => w.code === "INACTIVE_EXERCISE")).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].workingSets).toBe(4);
    expect(entries[0].isActive).toBe(false);
  });

  // item 22
  it("EXERCISE_NOT_FOUND warning and entry excluded when exercise not in metadata", () => {
    const days = [{ dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 999, workingSets: 3 }] }];
    const emptyMeta = new Map();
    const { entries, warnings } = normalizePlanAnalysisInput(days, emptyMeta);
    expect(warnings.some((w) => w.code === "EXERCISE_NOT_FOUND")).toBe(true);
    expect(entries).toHaveLength(0);
  });

  // item 23
  it("INVALID_WORKING_SETS warning and entry excluded when workingSets = 0", () => {
    const days = [{ dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: 0 }] }];
    const { entries, warnings } = normalizePlanAnalysisInput(days, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "INVALID_WORKING_SETS")).toBe(true);
    expect(entries).toHaveLength(0);
  });

  it("INVALID_WORKING_SETS warning for negative sets", () => {
    const days = [{ dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: -1 }] }];
    const { entries, warnings } = normalizePlanAnalysisInput(days, makeMeta({ movementPattern: "Pchanie poziome" }));
    expect(warnings.some((w) => w.code === "INVALID_WORKING_SETS")).toBe(true);
    expect(entries).toHaveLength(0);
  });

  it("per-exercise warnings deduplicated across days (emitted once per exerciseId)", () => {
    const days = [
      { dayId: 1, dayName: "A", exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: 3 }] },
      { dayId: 2, dayName: "B", exercises: [{ exerciseEntryId: 2, exerciseId: 1, workingSets: 3 }] },
    ];
    const { warnings } = normalizePlanAnalysisInput(days, makeMeta());
    const missing = warnings.filter((w) => w.code === "MISSING_MOVEMENT_PATTERN");
    expect(missing).toHaveLength(1); // only once, not twice
  });
});

// ─── Day-level analysis ───────────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — day-level analysis", () => {
  it("day has correct total sets and exercise count", () => {
    const entries = [pushEntry(4, 1), pullEntry(3, 1), squatEntry(3, 1)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.days).toHaveLength(1);
    const day = result.days[0];
    expect(day.totalWorkingSets).toBe(10);
    expect(day.exerciseCount).toBe(3);
  });

  it("category breakdown for a single day is sorted by workingSets desc", () => {
    const entries = [pushEntry(8, 1), pullEntry(5, 1), squatEntry(3, 1)];
    const result = calculatePlanAnalysisCore(entries);
    const breakdown = result.days[0].categoryBreakdown;
    expect(breakdown[0].category).toBe("push");
    expect(breakdown[1].category).toBe("pull");
    expect(breakdown[2].category).toBe("squat");
  });

  it("multiple days are all present in result.days", () => {
    const entries = [pushEntry(4, 1), pullEntry(4, 2), squatEntry(4, 3)];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.days).toHaveLength(3);
  });
});

// ─── Normalization helpers ────────────────────────────────────────────────────

describe("normalizeMovementCategory", () => {
  it.each([
    ["Pchanie poziome",      null,  "push"],
    ["Pchanie pionowe",      null,  "push"],
    ["Przyciąganie pionowe", null,  "pull"],
    ["Przyciąganie poziome", null,  "pull"],
    ["Przysiad",             null,  "squat"],
    ["Zawiasowe",            null,  "hinge"],
    ["Wykrok",               null,  "lunge"],
    ["Stabilizacja tułowia", null,  "core"],
    ["Niosące",              null,  "carry"],
    ["Rotacja",              null,  "rotation"],
    [null,                   "push","push"],
    [null,                   null,  null],
    ["Unknown pattern",      null,  null],
  ] as const)('pattern="%s" category="%s" → "%s"', (pattern, category, expected) => {
    expect(normalizeMovementCategory(pattern, category)).toBe(expected);
  });

  it("movementCategory field takes priority over movementPattern", () => {
    // Pattern says push, category field says pull — category wins
    expect(normalizeMovementCategory("Pchanie poziome", "pull")).toBe("pull");
  });
});

describe("normalizeSubPattern", () => {
  it.each([
    ["Pchanie pionowe",      "vertical_push"],
    ["Pchanie poziome",      "horizontal_push"],
    ["Przyciąganie pionowe", "vertical_pull"],
    ["Przyciąganie poziome", "horizontal_pull"],
    ["Przysiad",             null],
    [null,                   null],
  ] as const)('"%s" → "%s"', (pattern, expected) => {
    expect(normalizeSubPattern(pattern)).toBe(expected);
  });
});

describe("normalizeExerciseType", () => {
  it.each([
    ["Złożone",   "compound"],
    ["złożone",   "compound"],
    ["compound",  "compound"],
    ["Izolowane", "isolation"],
    ["izolowane", "isolation"],
    ["isolation", "isolation"],
    ["unknown",   null],
    [null,        null],
    ["",          null],
  ] as const)('"%s" → "%s"', (raw, expected) => {
    expect(normalizeExerciseType(raw)).toBe(expected);
  });
});

describe("normalizeExecution", () => {
  it.each([
    ["Obustronne",  "bilateral"],
    ["obustronne",  "bilateral"],
    ["bilateral",   "bilateral"],
    ["Jednostronne","unilateral"],
    ["jednostronne","unilateral"],
    ["unilateral",  "unilateral"],
    ["unknown",     null],
    [null,          null],
  ] as const)('"%s" → "%s"', (raw, expected) => {
    expect(normalizeExecution(raw)).toBe(expected);
  });
});

describe("normalizePlane", () => {
  it.each([
    ["Strzałkowa",  "sagittal"],
    ["strzałkowa",  "sagittal"],
    ["sagittal",    "sagittal"],
    ["Czołowa",     "frontal"],
    ["frontal",     "frontal"],
    ["Poprzeczna",  "transverse"],
    ["transverse",  "transverse"],
    ["unknown",     null],
    [null,          null],
  ] as const)('"%s" → "%s"', (raw, expected) => {
    expect(normalizePlane(raw)).toBe(expected);
  });
});

// ─── Summary integrity ────────────────────────────────────────────────────────

describe("calculatePlanAnalysisCore — summary integrity", () => {
  it("analysedExerciseEntries + incompleteExerciseEntries = totalExerciseEntries", () => {
    const entries = [
      pushEntry(4),  // has resolvedCategory
      makeEntry({ exerciseId: 99, workingSets: 3, dayId: 1 }), // no resolvedCategory
    ];
    const result = calculatePlanAnalysisCore(entries);
    expect(result.summary.analysedExerciseEntries + result.summary.incompleteExerciseEntries)
      .toBe(result.summary.totalExerciseEntries);
  });

  it("inputWarnings are included in the final warnings array", () => {
    const inputWarn: AnalysisWarning = {
      code: "MISSING_MOVEMENT_PATTERN",
      severity: "info",
      scope: "exercise",
      message: "Test warning",
    };
    const result = calculatePlanAnalysisCore([], [inputWarn]);
    expect(result.warnings.some((w) => w.code === "MISSING_MOVEMENT_PATTERN")).toBe(true);
  });
});

// ─── Percentage of plan sets ──────────────────────────────────────────────────

describe("CategoryAnalysis.percentageOfPlanSets", () => {
  it("push = 50% when half of all sets", () => {
    const entries = [pushEntry(10), pullEntry(10)];
    const result = calculatePlanAnalysisCore(entries);
    const push = result.movementCategories.find((c) => c.category === "push")!;
    expect(push.percentageOfPlanSets).toBeCloseTo(50, 5);
  });

  it("0% when plan is empty (no division error)", () => {
    const result = calculatePlanAnalysisCore([]);
    for (const c of result.movementCategories) {
      expect(c.percentageOfPlanSets).toBe(0);
    }
  });
});
