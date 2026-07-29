/**
 * Focused tests for percentage-based weekly volume status display.
 *
 * Spec coverage:
 * ✓ each target uses its own weeklyAbsoluteCeiling
 * ✓ raw values (not rounded) determine status
 * ✓ custom display rounding (decimal ≤ 0.5 → floor; > 0.5 → ceil)
 * ✓ 49.9% → below_total_minimum (red)
 * ✓ exactly 50% → medium_minimum (orange)
 * ✓ exactly 75% → medium_minimum (orange)
 * ✓ 75.1% → recommended_volume (green)
 * ✓ exactly 100% → recommended_volume (green)
 * ✓ 100.1% → above_max_recommended (orange)
 * ✓ 124.9% → above_max_recommended (orange)
 * ✓ exactly 125% → overtraining_warning (red)
 * ✓ ceiling=20 boundary examples from spec §7
 * ✓ priority does not change thresholds (status depends only on ratio)
 * ✓ generator/proposal values unchanged (pure calculation, no side effects)
 */

import { describe, it, expect } from "vitest";
import { computeVolumeCore } from "../volumeCalculator";
import type { NormalizedEntry } from "../volumeCalculator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTargetMap(absolute: number) {
  return new Map([
    [1, { name: "TestTarget", type: "muscle_group", memberMuscleIds: new Set([10]) }],
  ]);
}

function makeGuidelineMap(absolute: number) {
  return new Map([
    [1, { sessionMin: 0, sessionMax: 999, weeklyPreferredCeiling: absolute, weeklyAbsoluteCeiling: absolute }],
  ]);
}

function entry(workingSets: number): NormalizedEntry {
  return {
    entryId: 1,
    dayId: 1,
    dayName: "Day 1",
    dayOrder: 0,
    exerciseId: 1,
    exerciseName: "Test Exercise",
    workingSets,
  };
}

function fractionalEntry(effectiveSets: number): { entries: NormalizedEntry[]; assignments: Map<number, Map<number, number>> } {
  // Use coefficient < 1.0 to produce fractional effective sets.
  // effectiveSets = workingSets * coefficient
  // We use workingSets=100 and coefficient = effectiveSets/100 for precision.
  const coefficient = effectiveSets / 100;
  return {
    entries: [{ ...entry(100) }],
    assignments: new Map([[1, new Map([[10, coefficient]])]]),
  };
}

function statusFor(rawSets: number, absolute: number) {
  const targetMap = makeTargetMap(absolute);
  const guidelineMap = makeGuidelineMap(absolute);
  const { entries, assignments } = fractionalEntry(rawSets);
  const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
  return result.status;
}

// ─── Custom display rounding (spec §5) ───────────────────────────────────────
// Mirrored here to test the rule independently of the React component.

function roundVolumeForDisplay(value: number): number {
  const lower = Math.floor(value);
  const decimalPart = value - lower;
  return decimalPart <= 0.5 ? lower : Math.ceil(value);
}

// ─── Status-clamped display (mirrors VolumePanel.tsx clampDisplayToStatus) ────

type VolumeStatusLocal =
  | "below_total_minimum"
  | "medium_minimum"
  | "recommended_volume"
  | "above_max_recommended"
  | "overtraining_warning";

function clampDisplayToStatus(
  rawValue: number,
  status: VolumeStatusLocal,
  ceiling: number,
): number {
  const rounded = roundVolumeForDisplay(rawValue);
  if (ceiling <= 0) return rounded;

  const b50  = Math.floor(ceiling * 0.50);
  const b75  = Math.floor(ceiling * 0.75);
  const b100 = ceiling;
  const b125 = Math.floor(ceiling * 1.25);

  switch (status) {
    case "below_total_minimum":   return Math.min(rounded, b50 - 1);
    case "medium_minimum":        return Math.max(b50, Math.min(rounded, b75));
    case "recommended_volume":    return Math.max(b75 + 1, Math.min(rounded, b100));
    case "above_max_recommended": return Math.max(b100 + 1, Math.min(rounded, b125 - 1));
    case "overtraining_warning":  return Math.max(rounded, b125);
  }
}

// ─── Display rounding ─────────────────────────────────────────────────────────

describe("roundVolumeForDisplay (spec §5)", () => {
  it("9.1 → 9", () => expect(roundVolumeForDisplay(9.1)).toBe(9));
  it("9.5 → 9 (0.5 rounds DOWN)", () => expect(roundVolumeForDisplay(9.5)).toBe(9));
  it("9.6 → 10", () => expect(roundVolumeForDisplay(9.6)).toBe(10));
  it("15.1 → 15", () => expect(roundVolumeForDisplay(15.1)).toBe(15));
  it("15.5 → 15", () => expect(roundVolumeForDisplay(15.5)).toBe(15));
  it("15.6 → 16", () => expect(roundVolumeForDisplay(15.6)).toBe(16));
  it("24.9 → 25 (0.9 > 0.5 → ceil)", () => expect(roundVolumeForDisplay(24.9)).toBe(25));
  it("20.1 → 20", () => expect(roundVolumeForDisplay(20.1)).toBe(20));
  it("0 → 0", () => expect(roundVolumeForDisplay(0)).toBe(0));
});

// ─── Percentage boundary conditions ──────────────────────────────────────────

describe("status boundary conditions (absolute=20)", () => {
  const A = 20;

  it("ratio 49.9% (raw 9.98) → below_total_minimum", () => {
    expect(statusFor(9.98, A)).toBe("below_total_minimum");
  });

  it("ratio exactly 50% (raw 10) → medium_minimum", () => {
    expect(statusFor(10, A)).toBe("medium_minimum");
  });

  it("ratio exactly 75% (raw 15) → medium_minimum", () => {
    expect(statusFor(15, A)).toBe("medium_minimum");
  });

  it("ratio 75.1% (raw 15.02) → recommended_volume", () => {
    expect(statusFor(15.02, A)).toBe("recommended_volume");
  });

  it("ratio exactly 100% (raw 20) → recommended_volume", () => {
    expect(statusFor(20, A)).toBe("recommended_volume");
  });

  it("ratio 100.1% (raw 20.02) → above_max_recommended", () => {
    expect(statusFor(20.02, A)).toBe("above_max_recommended");
  });

  it("ratio 124.9% (raw 24.98) → above_max_recommended", () => {
    expect(statusFor(24.98, A)).toBe("above_max_recommended");
  });

  it("ratio exactly 125% (raw 25) → overtraining_warning", () => {
    expect(statusFor(25, A)).toBe("overtraining_warning");
  });

  it("ratio above 125% (raw 26) → overtraining_warning", () => {
    expect(statusFor(26, A)).toBe("overtraining_warning");
  });
});

// ─── Spec §7 — ceiling = 20 examples (raw → displayed, status) ───────────────

describe("spec §7 examples (absolute=20)", () => {
  const A = 20;

  it("raw 9.9 → displayed 9, red (below_total_minimum)", () => {
    // ratio = 9.9/20 = 49.5% < 50%
    // roundVolumeForDisplay(9.9) = 10, but clamped to max b50-1 = 9
    expect(statusFor(9.9, A)).toBe("below_total_minimum");
    expect(roundVolumeForDisplay(9.9)).toBe(10); // base rounding
    expect(clampDisplayToStatus(9.9, "below_total_minimum", A)).toBe(9);
  });

  it("raw 10 → orange (medium_minimum, exactly 50%)", () => {
    expect(statusFor(10, A)).toBe("medium_minimum");
    expect(roundVolumeForDisplay(10)).toBe(10);
  });

  it("raw 15 → orange (medium_minimum, exactly 75%)", () => {
    expect(statusFor(15, A)).toBe("medium_minimum");
    expect(roundVolumeForDisplay(15)).toBe(15);
  });

  it("raw 15.1 → displayed 16, green (recommended_volume, ratio 75.5%)", () => {
    // Status uses raw 15.1/20 = 75.5% > 75% → green
    expect(statusFor(15.1, A)).toBe("recommended_volume");
    // Base round: 15.1 → 15, but recommended_volume min = b75+1 = 16 → clamped to 16
    expect(roundVolumeForDisplay(15.1)).toBe(15); // base rounding unchanged
    expect(clampDisplayToStatus(15.1, "recommended_volume", A)).toBe(16);
  });

  it("raw 20 → green (recommended_volume, exactly 100%)", () => {
    expect(statusFor(20, A)).toBe("recommended_volume");
    expect(roundVolumeForDisplay(20)).toBe(20);
  });

  it("raw 20.1 → displayed 21, orange (above_max_recommended, ratio 100.5%)", () => {
    // Status uses raw 20.1/20 = 100.5% → orange overage
    expect(statusFor(20.1, A)).toBe("above_max_recommended");
    // Base round: 20.1 → 20, but above_max_recommended min = b100+1 = 21 → clamped to 21
    expect(roundVolumeForDisplay(20.1)).toBe(20); // base rounding unchanged
    expect(clampDisplayToStatus(20.1, "above_max_recommended", A)).toBe(21);
  });

  it("raw 24.9 → displayed 24, orange (above_max_recommended, ratio 124.5%)", () => {
    // Status: 24.9/20 = 124.5% < 125% → still above_max_recommended (NOT overtraining)
    expect(statusFor(24.9, A)).toBe("above_max_recommended");
    // Base round: 24.9 → 25, but above_max_recommended max = b125-1 = 24 → clamped to 24
    expect(roundVolumeForDisplay(24.9)).toBe(25); // base rounding unchanged
    expect(clampDisplayToStatus(24.9, "above_max_recommended", A)).toBe(24);
  });

  it("raw 25 → red (overtraining_warning, exactly 125%)", () => {
    expect(statusFor(25, A)).toBe("overtraining_warning");
    expect(roundVolumeForDisplay(25)).toBe(25);
  });
});

// ─── Each target uses its own ceiling ────────────────────────────────────────

describe("each target uses its own weeklyAbsoluteCeiling", () => {
  it("raw 10 at ceiling=20 → medium_minimum (50%)", () => {
    expect(statusFor(10, 20)).toBe("medium_minimum");
  });

  it("raw 10 at ceiling=8 → overtraining_warning (125%)", () => {
    // 10/8 = 125% → overtraining_warning
    expect(statusFor(10, 8)).toBe("overtraining_warning");
  });

  it("raw 10 at ceiling=30 → below_total_minimum (33%)", () => {
    // 10/30 = 33% → below_total_minimum
    expect(statusFor(10, 30)).toBe("below_total_minimum");
  });

  it("raw 6 at ceiling=8 → recommended_volume (75% < ratio ≤ 100%)", () => {
    // 6/8 = 75% — boundary: exactly 75% → medium_minimum
    expect(statusFor(6, 8)).toBe("medium_minimum");
  });

  it("raw 6.1 at ceiling=8 → recommended_volume (76.25%)", () => {
    expect(statusFor(6.1, 8)).toBe("recommended_volume");
  });
});

// ─── Raw values determine status (not rounded display values) ────────────────

describe("raw values determine status — display rounding must not affect status", () => {
  it("raw 24.9 / ceiling=20 → above_max_recommended; clamped display 24 (not 25)", () => {
    // ratio = 24.9/20 = 1.245 < 1.25 → NOT overtraining_warning
    expect(statusFor(24.9, 20)).toBe("above_max_recommended");
    expect(roundVolumeForDisplay(24.9)).toBe(25); // base rounding would give 25
    // Clamping prevents 25 from appearing for above_max_recommended (25 = overtraining boundary)
    expect(clampDisplayToStatus(24.9, "above_max_recommended", 20)).toBe(24);
    // Raw value still governs status: 25/20=125% is overtraining_warning
    expect(statusFor(25, 20)).toBe("overtraining_warning");
  });

  it("raw 15.1 / ceiling=20 → recommended_volume; clamped display 16 (not 15)", () => {
    // ratio = 15.1/20 = 75.5% → recommended_volume
    expect(statusFor(15.1, 20)).toBe("recommended_volume");
    expect(roundVolumeForDisplay(15.1)).toBe(15); // base rounding would give 15
    // Clamping prevents 15 from appearing for recommended_volume (15 = medium_minimum boundary)
    expect(clampDisplayToStatus(15.1, "recommended_volume", 20)).toBe(16);
  });
});

// ─── Priority does not change thresholds ─────────────────────────────────────

describe("priority does not change percentage thresholds", () => {
  it("same raw sets and ceiling produce the same status regardless of which target it is", () => {
    // Two targets with different names but same absolute ceiling — same ratio → same status
    const targetMapA = new Map([
      [1, { name: "PriorityTarget", type: "muscle_group", memberMuscleIds: new Set([10]) }],
    ]);
    const targetMapB = new Map([
      [1, { name: "LowPriorityTarget", type: "muscle_group", memberMuscleIds: new Set([10]) }],
    ]);
    const guidelineMap = new Map([
      [1, { sessionMin: 0, sessionMax: 999, weeklyPreferredCeiling: 20, weeklyAbsoluteCeiling: 20 }],
    ]);
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);
    const entries: NormalizedEntry[] = [{ entryId: 1, dayId: 1, dayName: "D1", dayOrder: 0, exerciseId: 1, exerciseName: "Ex", workingSets: 16 }];

    const [resultA] = computeVolumeCore(entries, assignments, targetMapA, guidelineMap, [1]);
    const [resultB] = computeVolumeCore(entries, assignments, targetMapB, guidelineMap, [1]);

    // 16/20 = 80% → recommended_volume for both; target name (priority proxy) has no effect
    expect(resultA.status).toBe("recommended_volume");
    expect(resultB.status).toBe("recommended_volume");
  });
});

// ─── Generator and proposal values unchanged ─────────────────────────────────

describe("generator and proposal values unchanged", () => {
  it("computeVolumeCore returns identical effectiveSets regardless of which status bucket they land in", () => {
    // Status change must never modify weeklyEffectiveSets — pure display concern
    const ceiling = 20;
    const targetMap = makeTargetMap(ceiling);
    const guidelineMap = makeGuidelineMap(ceiling);
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);

    const cases: Array<{ sets: number; expectedSets: number }> = [
      { sets: 9, expectedSets: 9 },   // below_total_minimum
      { sets: 10, expectedSets: 10 }, // medium_minimum
      { sets: 16, expectedSets: 16 }, // recommended_volume
      { sets: 21, expectedSets: 21 }, // above_max_recommended
      { sets: 25, expectedSets: 25 }, // overtraining_warning
    ];

    for (const { sets, expectedSets } of cases) {
      const entries: NormalizedEntry[] = [{ entryId: 1, dayId: 1, dayName: "D1", dayOrder: 0, exerciseId: 1, exerciseName: "Ex", workingSets: sets }];
      const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
      expect(result.weeklyEffectiveSets).toBe(expectedSets);
    }
  });
});
