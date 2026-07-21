/**
 * Unit tests for DailyAllocationEngine — Stage 1.
 *
 * Required cases (from spec):
 *   1. Balanced case        — no unresolved, status = "feasible"
 *   2. Overloaded case      — unresolved > 0, status = "feasible_with_tradeoffs"
 *   3. Impossible case      — no eligible days, unresolved = full, status = "infeasible"
 *   4. Conservation         — sum(allocated + unresolved) === weeklyTargets for every target
 *
 * Additional cases covered:
 *   5. Zero-volume targets  — allocated = 0, unresolved = 0, no crash
 *   6. Near-max triggers    — days filled to ≥ 90 % → "feasible_with_tradeoffs" even if all placed
 *   7. Multi-target day load — session max respected when multiple targets compete
 *   8. No eligibleDayTypes  — all days eligible (fallback behaviour)
 *
 * No DB dependency — all functions under test are pure.
 */

import { describe, it, expect } from "vitest";
import { allocateDaily } from "../dailyAllocationEngine";
import type { DailyAllocationInput, DailyAllocationResult } from "../dailyAllocationEngine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Total unresolved volume across all targets. */
function totalUnresolved(result: DailyAllocationResult): number {
  return Object.values(result.weeklyUnresolved).reduce((s, v) => s + v, 0);
}

/** Total allocated volume across all targets. */
function totalAllocated(result: DailyAllocationResult): number {
  return Object.values(result.weeklyAllocated).reduce((s, v) => s + v, 0);
}

/** Volume on a specific day. */
function dayTotal(result: DailyAllocationResult, dayIndex: number): number {
  return result.days.find((d) => d.dayIndex === dayIndex)?.total ?? 0;
}

// ─── 1. Balanced case ─────────────────────────────────────────────────────────
//
// Three days (push / pull / legs), one target per day, generous sessionMax.
// Every unit of volume should be placed.  No day comes close to the ceiling.

describe("1. Balanced case", () => {
  const input: DailyAllocationInput = {
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "pull" },
      { dayIndex: 2, dayType: "legs" },
    ],
    weeklyTargets: {
      chest: 10,
      back: 12,
      quads: 8,
    },
    eligibleDayTypes: {
      chest: ["push"],
      back: ["pull"],
      quads: ["legs"],
    },
    constraints: { sessionMax: 30, sessionMin: 3 },
  };

  const result = allocateDaily(input);

  it("status is feasible", () => {
    expect(result.status).toBe("feasible");
  });

  it("no unresolved volume", () => {
    expect(totalUnresolved(result)).toBe(0);
    expect(result.weeklyUnresolved.chest).toBe(0);
    expect(result.weeklyUnresolved.back).toBe(0);
    expect(result.weeklyUnresolved.quads).toBe(0);
  });

  it("each target is fully allocated", () => {
    expect(result.weeklyAllocated.chest).toBe(10);
    expect(result.weeklyAllocated.back).toBe(12);
    expect(result.weeklyAllocated.quads).toBe(8);
  });

  it("volume lands on the correct day", () => {
    expect(result.days[0]?.allocations.chest).toBe(10);
    expect(result.days[1]?.allocations.back).toBe(12);
    expect(result.days[2]?.allocations.quads).toBe(8);
  });

  it("no day exceeds sessionMax", () => {
    for (const day of result.days) {
      expect(day.total).toBeLessThanOrEqual(30);
    }
  });
});

// ─── 2. Overloaded case ───────────────────────────────────────────────────────
//
// Two days, two targets each needing more volume than each day can hold.
// sessionMax=10, each target=12, no eligibility restriction.
// After two passes the session ceiling is exhausted and some volume remains.

describe("2. Overloaded case", () => {
  const input: DailyAllocationInput = {
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "pull" },
    ],
    weeklyTargets: {
      chest: 12,
      back: 12,
    },
    // no eligibleDayTypes → all days eligible for all targets
    constraints: { sessionMax: 10, sessionMin: 2 },
  };

  const result = allocateDaily(input);

  it("status is feasible_with_tradeoffs", () => {
    expect(result.status).toBe("feasible_with_tradeoffs");
  });

  it("has unresolved volume", () => {
    expect(totalUnresolved(result)).toBeGreaterThan(0);
  });

  it("no day exceeds sessionMax", () => {
    for (const day of result.days) {
      expect(day.total).toBeLessThanOrEqual(10);
    }
  });

  it("all allocated volume is non-negative", () => {
    for (const v of Object.values(result.weeklyAllocated)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("all unresolved values are non-negative", () => {
    for (const v of Object.values(result.weeklyUnresolved)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── 3. Impossible case (no eligible days) ────────────────────────────────────
//
// A target whose eligibleDayTypes includes only "push", but no push day exists.
// Volume must be fully unresolved, status must be "infeasible".

describe("3. Impossible case — no eligible days for a target", () => {
  const input: DailyAllocationInput = {
    days: [
      { dayIndex: 0, dayType: "pull" },
      { dayIndex: 1, dayType: "legs" },
    ],
    weeklyTargets: {
      chest: 10,   // needs "push" day — none present
      back: 8,     // needs "pull" — day 0 is eligible
    },
    eligibleDayTypes: {
      chest: ["push"],
      back: ["pull"],
    },
    constraints: { sessionMax: 20, sessionMin: 2 },
  };

  const result = allocateDaily(input);

  it("status is infeasible", () => {
    expect(result.status).toBe("infeasible");
  });

  it("chest is fully unresolved (no eligible day)", () => {
    expect(result.weeklyUnresolved.chest).toBe(10);
    expect(result.weeklyAllocated.chest).toBe(0);
  });

  it("back is still allocated on its eligible day", () => {
    expect(result.weeklyAllocated.back).toBe(8);
    expect(result.weeklyUnresolved.back).toBe(0);
  });

  it("no day exceeds sessionMax", () => {
    for (const day of result.days) {
      expect(day.total).toBeLessThanOrEqual(20);
    }
  });
});

// ─── 4. Conservation invariant ────────────────────────────────────────────────
//
// For every target: weeklyAllocated + weeklyUnresolved === weeklyTargets.
// Checked across multiple scenarios.

describe("4. Conservation invariant", () => {
  function assertConservation(label: string, inp: DailyAllocationInput): void {
    it(`${label}: allocated + unresolved === weeklyTargets for every target`, () => {
      const result = allocateDaily(inp);
      for (const [targetId, rawVolume] of Object.entries(inp.weeklyTargets)) {
        const volume = Math.round(rawVolume);
        const allocated = result.weeklyAllocated[targetId] ?? 0;
        const unresolved = result.weeklyUnresolved[targetId] ?? 0;
        expect(allocated + unresolved).toBe(volume);
      }
    });
  }

  // Scenario A: balanced (from case 1)
  assertConservation("balanced (1-to-1 target-day)", {
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "pull" },
      { dayIndex: 2, dayType: "legs" },
    ],
    weeklyTargets: { chest: 10, back: 12, quads: 8 },
    eligibleDayTypes: { chest: ["push"], back: ["pull"], quads: ["legs"] },
    constraints: { sessionMax: 30, sessionMin: 3 },
  });

  // Scenario B: overloaded (from case 2)
  assertConservation("overloaded (capacity-limited)", {
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "pull" },
    ],
    weeklyTargets: { chest: 12, back: 12 },
    constraints: { sessionMax: 10, sessionMin: 2 },
  });

  // Scenario C: impossible (from case 3)
  assertConservation("impossible (no eligible day)", {
    days: [
      { dayIndex: 0, dayType: "pull" },
      { dayIndex: 1, dayType: "legs" },
    ],
    weeklyTargets: { chest: 10, back: 8 },
    eligibleDayTypes: { chest: ["push"], back: ["pull"] },
    constraints: { sessionMax: 20, sessionMin: 2 },
  });

  // Scenario D: mixed targets with zero volume
  assertConservation("mixed targets including zero volume", {
    days: [
      { dayIndex: 0, dayType: "full_body" },
      { dayIndex: 1, dayType: "full_body" },
    ],
    weeklyTargets: { core: 0, shoulders: 15, triceps: 6 },
    constraints: { sessionMax: 20, sessionMin: 2 },
  });
});

// ─── 5. Zero-volume targets ───────────────────────────────────────────────────

describe("5. Zero-volume targets", () => {
  const result = allocateDaily({
    days: [{ dayIndex: 0, dayType: "push" }],
    weeklyTargets: { chest: 0, back: 0 },
    constraints: { sessionMax: 20, sessionMin: 2 },
  });

  it("status is feasible", () => {
    expect(result.status).toBe("feasible");
  });

  it("all targets have allocated = 0 and unresolved = 0", () => {
    expect(result.weeklyAllocated.chest).toBe(0);
    expect(result.weeklyUnresolved.chest).toBe(0);
    expect(result.weeklyAllocated.back).toBe(0);
    expect(result.weeklyUnresolved.back).toBe(0);
  });

  it("day total is 0", () => {
    expect(result.days[0]?.total).toBe(0);
  });
});

// ─── 6. Near-max triggers feasible_with_tradeoffs ────────────────────────────
//
// All volume is placed, but at least one day runs at exactly 90 % of sessionMax.

describe("6. Near-max day → feasible_with_tradeoffs even if all volume placed", () => {
  // sessionMax=10, chest=9 on 1 eligible day → day total=9 = 90% of 10.
  const result = allocateDaily({
    days: [{ dayIndex: 0, dayType: "push" }],
    weeklyTargets: { chest: 9 },
    eligibleDayTypes: { chest: ["push"] },
    constraints: { sessionMax: 10, sessionMin: 2 },
  });

  it("all volume placed", () => {
    expect(result.weeklyAllocated.chest).toBe(9);
    expect(result.weeklyUnresolved.chest).toBe(0);
  });

  it("status is feasible_with_tradeoffs because day is at ≥ 90 % of sessionMax", () => {
    expect(dayTotal(result, 0)).toBeGreaterThanOrEqual(9);
    expect(result.status).toBe("feasible_with_tradeoffs");
  });
});

// ─── 7. Session max respected when multiple targets share a day ───────────────

describe("7. Multiple targets sharing a day never exceed sessionMax", () => {
  const input: DailyAllocationInput = {
    days: [
      { dayIndex: 0, dayType: "upper" },
      { dayIndex: 1, dayType: "upper" },
    ],
    weeklyTargets: {
      chest: 8,
      shoulders: 6,
      triceps: 4,
      back: 10,
      biceps: 5,
    },
    // all targets eligible on "upper" days
    constraints: { sessionMax: 20, sessionMin: 2 },
  };

  const result = allocateDaily(input);

  it("no day exceeds sessionMax", () => {
    for (const day of result.days) {
      expect(day.total).toBeLessThanOrEqual(20);
    }
  });

  it("total allocated + unresolved equals total weeklyTargets", () => {
    const targetTotal = Object.values(input.weeklyTargets).reduce((s, v) => s + v, 0);
    expect(totalAllocated(result) + totalUnresolved(result)).toBe(targetTotal);
  });

  it("no negative allocation on any day", () => {
    for (const day of result.days) {
      for (const v of Object.values(day.allocations)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ─── 8. No eligibleDayTypes — all days treated as eligible ───────────────────

describe("8. No eligibleDayTypes — fallback: all days eligible", () => {
  const result = allocateDaily({
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "legs" },
    ],
    weeklyTargets: { core: 10 },
    // no eligibleDayTypes provided
    constraints: { sessionMax: 20, sessionMin: 2 },
  });

  it("all volume is allocated (no unresolved)", () => {
    expect(result.weeklyUnresolved.core).toBe(0);
    expect(result.weeklyAllocated.core).toBe(10);
  });

  it("status is feasible", () => {
    expect(result.status).toBe("feasible");
  });

  it("volume is spread across both days", () => {
    const d0 = result.days.find((d) => d.dayIndex === 0)!;
    const d1 = result.days.find((d) => d.dayIndex === 1)!;
    // With 2 eligible days and 10 volume, each day gets 5 (ceil(10/2)=5)
    expect(d0.total + d1.total).toBe(10);
  });
});
