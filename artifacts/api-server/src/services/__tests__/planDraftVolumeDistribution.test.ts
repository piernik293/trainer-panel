/**
 * Phase 3A — Volume Distribution Engine Tests
 *
 * Covers:
 *   - recommendSplitType: all day counts × all experience levels
 *   - getDayTemplate: correct count + deterministic sequence for all 8 split types
 *   - distributeTargetVolume: exact sums, 0.5 increments, sessionMax, sessionMin,
 *     equal/uneven distribution, deterministic tie-breaking, priority placement,
 *     zero volume, no-eligible-day fallback, unknown broadCategory
 *   - calculateVolumeDistribution (integration): all 11 real DB targets,
 *     round-trip invariants, push_pull_legs split, blocking on invalid level
 *
 * Does NOT write to the database.
 */

import { describe, it, expect } from "vitest";
import {
  recommendSplitType,
  getDayTemplate,
  getEligibleDayTypes,
  distributeTargetVolume,
  calculateVolumeDistribution,
  type VolumeDistributionInput,
} from "../planDraftVolumeDistributionService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumAllocations(map: Map<number, number>): number {
  let s = 0;
  for (const v of map.values()) s += v;
  return Math.round(s * 2) / 2;
}

function isHalfUnit(v: number): boolean {
  return Number.isInteger(Math.round(v * 2));
}

// All 11 real volume targets from the DB seed (ID order matches seed insertion order)
const ALL_TARGET_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function makeVolumes(value: number) {
  return ALL_TARGET_IDS.map((id) => ({ targetId: id, selectedVolume: value }));
}

function makeVolumesMap(map: Record<number, number>) {
  return ALL_TARGET_IDS.map((id) => ({ targetId: id, selectedVolume: map[id] ?? 0 }));
}

const INTERMEDIATE = "Średniozaawansowany";

// ─── recommendSplitType ───────────────────────────────────────────────────────

describe("recommendSplitType", () => {
  describe("1 training day", () => {
    it("all levels → full_body", () => {
      for (const level of [
        "Brak aktywności fizycznej",
        "Początkujący",
        "Średniozaawansowany",
        "Zaawansowany",
      ]) {
        const { recommended } = recommendSplitType(level, 1);
        expect(recommended).toBe("full_body");
      }
    });
  });

  describe("2 training days", () => {
    it("all levels → full_body_ab", () => {
      for (const level of [
        "Brak aktywności fizycznej",
        "Początkujący",
        "Średniozaawansowany",
        "Zaawansowany",
      ]) {
        const { recommended } = recommendSplitType(level, 2);
        expect(recommended).toBe("full_body_ab");
      }
    });
  });

  describe("3 training days", () => {
    it("Brak aktywności fizycznej → full_body_ab", () => {
      expect(recommendSplitType("Brak aktywności fizycznej", 3).recommended).toBe("full_body_ab");
    });
    it("Początkujący → full_body_ab", () => {
      expect(recommendSplitType("Początkujący", 3).recommended).toBe("full_body_ab");
    });
    it("Średniozaawansowany → upper_lower_full_body", () => {
      expect(recommendSplitType("Średniozaawansowany", 3).recommended).toBe("upper_lower_full_body");
    });
    it("Zaawansowany → upper_lower_full_body", () => {
      expect(recommendSplitType("Zaawansowany", 3).recommended).toBe("upper_lower_full_body");
    });
  });

  describe("4 training days", () => {
    it("Brak aktywności fizycznej → upper_lower", () => {
      expect(recommendSplitType("Brak aktywności fizycznej", 4).recommended).toBe("upper_lower");
    });
    it("Początkujący → upper_lower", () => {
      expect(recommendSplitType("Początkujący", 4).recommended).toBe("upper_lower");
    });
    it("Średniozaawansowany → push_pull_lower_full_body", () => {
      expect(recommendSplitType("Średniozaawansowany", 4).recommended).toBe("push_pull_lower_full_body");
    });
    it("Zaawansowany → push_pull_lower_full_body", () => {
      expect(recommendSplitType("Zaawansowany", 4).recommended).toBe("push_pull_lower_full_body");
    });
  });

  describe("5 training days", () => {
    it("all levels → upper_lower_full_body", () => {
      for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
        expect(recommendSplitType(level, 5).recommended).toBe("upper_lower_full_body");
      }
    });
  });

  describe("6 training days", () => {
    it("all levels → push_pull_legs", () => {
      for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
        expect(recommendSplitType(level, 6).recommended).toBe("push_pull_legs");
      }
    });
  });

  describe("high-frequency warnings", () => {
    it("Brak aktywności fizycznej + 4 days → HIGH_FREQUENCY_FOR_NO_ACTIVITY", () => {
      const { warnings } = recommendSplitType("Brak aktywności fizycznej", 4);
      expect(warnings.some((w) => w.code === "HIGH_FREQUENCY_FOR_NO_ACTIVITY")).toBe(true);
      expect(warnings.find((w) => w.code === "HIGH_FREQUENCY_FOR_NO_ACTIVITY")?.blocking).toBe(false);
    });
    it("Brak aktywności fizycznej + 3 days → no HIGH_FREQUENCY_FOR_NO_ACTIVITY", () => {
      const { warnings } = recommendSplitType("Brak aktywności fizycznej", 3);
      expect(warnings.some((w) => w.code === "HIGH_FREQUENCY_FOR_NO_ACTIVITY")).toBe(false);
    });
    it("Początkujący + 5 days → HIGH_FREQUENCY_FOR_BEGINNER", () => {
      const { warnings } = recommendSplitType("Początkujący", 5);
      expect(warnings.some((w) => w.code === "HIGH_FREQUENCY_FOR_BEGINNER")).toBe(true);
      expect(warnings.find((w) => w.code === "HIGH_FREQUENCY_FOR_BEGINNER")?.blocking).toBe(false);
    });
    it("Początkujący + 4 days → no HIGH_FREQUENCY_FOR_BEGINNER", () => {
      const { warnings } = recommendSplitType("Początkujący", 4);
      expect(warnings.some((w) => w.code === "HIGH_FREQUENCY_FOR_BEGINNER")).toBe(false);
    });
    it("Zaawansowany + 6 days → no high-frequency warning", () => {
      const { warnings } = recommendSplitType("Zaawansowany", 6);
      expect(warnings.some((w) =>
        w.code === "HIGH_FREQUENCY_FOR_NO_ACTIVITY" ||
        w.code === "HIGH_FREQUENCY_FOR_BEGINNER"
      )).toBe(false);
    });
  });

  describe("specialization / custom never auto-recommended", () => {
    it("no combination of level + days 1–6 produces specialization or custom", () => {
      for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
        for (let d = 1; d <= 6; d++) {
          const { recommended } = recommendSplitType(level, d);
          expect(recommended).not.toBe("specialization");
          expect(recommended).not.toBe("custom");
        }
      }
    });
  });

  describe("trainingDays validation — reject invalid values", () => {
    const VALID_LEVEL = "Zaawansowany";

    it("0 days → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, 0);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });

    it("7 days → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, 7);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });

    it("2.5 days (decimal) → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, 2.5);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });

    it("NaN → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, NaN);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });

    it("Infinity → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, Infinity);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });

    it("negative value → INVALID_TRAINING_DAYS blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(VALID_LEVEL, -1);
      expect(recommended).toBeNull();
      expect(warnings.some((w) => w.code === "INVALID_TRAINING_DAYS" && w.blocking)).toBe(true);
    });
  });

  describe("table-driven: full recommendation table (all levels × 1–6 days)", () => {
    const NO_ACTIVITY = "Brak aktywności fizycznej";
    const BEGINNER = "Początkujący";
    const INTERMEDIATE = "Średniozaawansowany";
    const ADVANCED = "Zaawansowany";

    const table: Array<[string, number, string]> = [
      // 1 day — all levels → full_body
      [NO_ACTIVITY,  1, "full_body"],
      [BEGINNER,     1, "full_body"],
      [INTERMEDIATE, 1, "full_body"],
      [ADVANCED,     1, "full_body"],
      // 2 days — all levels → full_body_ab
      [NO_ACTIVITY,  2, "full_body_ab"],
      [BEGINNER,     2, "full_body_ab"],
      [INTERMEDIATE, 2, "full_body_ab"],
      [ADVANCED,     2, "full_body_ab"],
      // 3 days
      [NO_ACTIVITY,  3, "full_body_ab"],
      [BEGINNER,     3, "full_body_ab"],
      [INTERMEDIATE, 3, "upper_lower_full_body"],
      [ADVANCED,     3, "upper_lower_full_body"],
      // 4 days
      [NO_ACTIVITY,  4, "upper_lower"],
      [BEGINNER,     4, "upper_lower"],
      [INTERMEDIATE, 4, "push_pull_lower_full_body"],
      [ADVANCED,     4, "push_pull_lower_full_body"],
      // 5 days — all levels → upper_lower_full_body
      [NO_ACTIVITY,  5, "upper_lower_full_body"],
      [BEGINNER,     5, "upper_lower_full_body"],
      [INTERMEDIATE, 5, "upper_lower_full_body"],
      [ADVANCED,     5, "upper_lower_full_body"],
      // 6 days — all levels → push_pull_legs
      [NO_ACTIVITY,  6, "push_pull_legs"],
      [BEGINNER,     6, "push_pull_legs"],
      [INTERMEDIATE, 6, "push_pull_legs"],
      [ADVANCED,     6, "push_pull_legs"],
    ];

    it.each(table)(
      "%s + %i days → %s",
      (level, days, expected) => {
        const { recommended } = recommendSplitType(level, days);
        expect(recommended).toBe(expected);
      },
    );
  });

  describe("blocking: missing and invalid experience level", () => {
    it("null → MISSING_EXPERIENCE_LEVEL, blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType(null, 3);
      expect(recommended).toBeNull();
      const w = warnings.find((w) => w.code === "MISSING_EXPERIENCE_LEVEL");
      expect(w).toBeDefined();
      expect(w?.blocking).toBe(true);
    });

    it("unknown string → INVALID_EXPERIENCE_LEVEL, blocking, recommended null", () => {
      const { recommended, warnings } = recommendSplitType("Elite", 3);
      expect(recommended).toBeNull();
      const w = warnings.find((w) => w.code === "INVALID_EXPERIENCE_LEVEL");
      expect(w).toBeDefined();
      expect(w?.blocking).toBe(true);
    });
  });
});

// ─── getDayTemplate ───────────────────────────────────────────────────────────

describe("getDayTemplate", () => {
  it("always returns exactly trainingDays entries", () => {
    for (const split of [
      "full_body", "full_body_ab", "upper_lower", "upper_lower_full_body",
      "push_pull_legs", "push_pull_lower_full_body", "specialization", "custom",
    ] as const) {
      for (let d = 1; d <= 6; d++) {
        expect(getDayTemplate(split, d)).toHaveLength(d);
      }
    }
  });

  it("full_body: dayName = Full Body 1..N, dayType = full_body", () => {
    const days = getDayTemplate("full_body", 3);
    expect(days.map((d) => d.dayName)).toEqual(["Full Body 1", "Full Body 2", "Full Body 3"]);
    expect(days.every((d) => d.dayType === "full_body")).toBe(true);
  });

  it("full_body_ab: A/B alternating", () => {
    const days = getDayTemplate("full_body_ab", 4);
    expect(days.map((d) => d.dayName)).toEqual(["Full Body A", "Full Body B", "Full Body A", "Full Body B"]);
    expect(days.map((d) => d.dayType)).toEqual(["full_body_a", "full_body_b", "full_body_a", "full_body_b"]);
  });

  it("upper_lower: Upper/Lower alternating", () => {
    const days = getDayTemplate("upper_lower", 4);
    expect(days.map((d) => d.dayName)).toEqual(["Upper", "Lower", "Upper", "Lower"]);
    expect(days.map((d) => d.dayType)).toEqual(["upper", "lower", "upper", "lower"]);
  });

  it("upper_lower_full_body: Upper/Lower/Full Body cycling", () => {
    const days = getDayTemplate("upper_lower_full_body", 5);
    expect(days.map((d) => d.dayType)).toEqual(["upper", "lower", "full_body", "upper", "lower"]);
  });

  it("push_pull_legs: Push/Pull/Legs cycling", () => {
    const days = getDayTemplate("push_pull_legs", 6);
    expect(days.map((d) => d.dayType)).toEqual(["push", "pull", "legs", "push", "pull", "legs"]);
  });

  it("push_pull_lower_full_body: Push/Pull/Lower/Full Body cycling", () => {
    const days = getDayTemplate("push_pull_lower_full_body", 4);
    expect(days.map((d) => d.dayType)).toEqual(["push", "pull", "lower", "full_body"]);
    expect(days.map((d) => d.dayName)).toEqual(["Push", "Pull", "Lower", "Full Body"]);
  });

  it("push_pull_lower_full_body wraps: 5 days", () => {
    const days = getDayTemplate("push_pull_lower_full_body", 5);
    expect(days.map((d) => d.dayType)).toEqual(["push", "pull", "lower", "full_body", "push"]);
  });

  it("specialization: 'Specialization Day N' names, dayType=full_body (Phase 3A eligibility)", () => {
    const days = getDayTemplate("specialization", 3);
    expect(days.every((d) => d.dayType === "full_body")).toBe(true);
    expect(days.map((d) => d.dayName)).toEqual([
      "Specialization Day 1",
      "Specialization Day 2",
      "Specialization Day 3",
    ]);
  });

  it("custom: Custom Day N, dayType custom", () => {
    const days = getDayTemplate("custom", 3);
    expect(days.map((d) => d.dayName)).toEqual(["Custom Day 1", "Custom Day 2", "Custom Day 3"]);
    expect(days.every((d) => d.dayType === "custom")).toBe(true);
  });

  it("dayIndex matches array position for all splits", () => {
    for (const split of ["push_pull_legs", "upper_lower", "full_body_ab"] as const) {
      const days = getDayTemplate(split, 4);
      days.forEach((d, i) => expect(d.dayIndex).toBe(i));
    }
  });
});

// ─── distributeTargetVolume ───────────────────────────────────────────────────

describe("distributeTargetVolume", () => {
  function dist(weeklyVolume: number, N: number, sessionMax = 99, sessionMin = 0) {
    const eligibleDayIndices = Array.from({ length: N }, (_, i) => i);
    return distributeTargetVolume({
      weeklyVolume,
      eligibleDayIndices,
      allDayIndices: eligibleDayIndices,
      sessionMax,
      sessionMin,
    });
  }

  it("exact weekly sum for even distribution", () => {
    const { allocations } = dist(9, 3);
    expect(sumAllocations(allocations)).toBe(9);
  });

  it("exact weekly sum for uneven distribution (5 / 3 days)", () => {
    const { allocations } = dist(5, 3);
    // halfTotal=10, N=3, base=3, extra=1 → [1.5, 1.5, 1.5, 0.5...?]
    // base=3, extra=1 → day0=2.0 day1=1.5 day2=1.5 → sum=5 ✓
    expect(sumAllocations(allocations)).toBe(5);
  });

  it("all allocations are multiples of 0.5", () => {
    for (const [w, n] of [[7, 3], [10, 3], [5, 4], [13, 6]] as const) {
      const { allocations } = dist(w, n);
      for (const v of allocations.values()) {
        expect(isHalfUnit(v)).toBe(true);
      }
    }
  });

  it("equal distribution when divisible (6 / 3 = 2 each)", () => {
    const { allocations } = dist(6, 3);
    const vals = [...allocations.values()];
    expect(vals.every((v) => v === 2)).toBe(true);
    expect(sumAllocations(allocations)).toBe(6);
  });

  it("uneven distribution: first extra days get +0.5 (7 / 3)", () => {
    const { allocations } = dist(7, 3);
    // halfTotal=14, N=3, base=4, extra=2 → days 0,1 get 2.5; day2 gets 2.0
    expect(allocations.get(0)).toBe(2.5);
    expect(allocations.get(1)).toBe(2.5);
    expect(allocations.get(2)).toBe(2.0);
    expect(sumAllocations(allocations)).toBe(7);
  });

  it("deterministic: same input always produces same output", () => {
    const r1 = dist(11, 4);
    const r2 = dist(11, 4);
    expect([...r1.allocations.entries()]).toEqual([...r2.allocations.entries()]);
  });

  it("priority target: earlier-day placement (first day gets extra)", () => {
    const { allocations } = dist(7, 3);
    // First `extra` days get the higher allocation — already validated above
    expect(allocations.get(0)! >= allocations.get(2)!).toBe(true);
  });

  it("sessionMax respected: N=4, weeklyVolume=8, sessionMax=3 → within limit", () => {
    const { allocations, warnings } = dist(8, 4, 3);
    // halfTotal=16, N=4, halfMax=6; N*halfMax=24≥16 → no sessionMax exceeded
    // base=4, extra=0 → all days get 2.0 ≤ 3 ✓
    expect(warnings.some((w) => w.code === "TARGET_SESSION_MAX_EXCEEDED")).toBe(false);
    expect(sumAllocations(allocations)).toBe(8);
    for (const v of allocations.values()) expect(v).toBeLessThanOrEqual(3);
  });

  it("sessionMax exceeded when weekly volume > N * sessionMax", () => {
    // 3 days, sessionMax=2, weeklyVolume=10: N*halfMax=12 < halfTotal=20
    const { warnings } = dist(10, 3, 2);
    expect(warnings.some((w) => w.code === "TARGET_SESSION_MAX_EXCEEDED")).toBe(true);
    expect(warnings.find((w) => w.code === "TARGET_SESSION_MAX_EXCEEDED")?.blocking).toBe(false);
  });

  it("sessionMax exceeded: still distributes evenly and sum is exact", () => {
    const { allocations } = dist(10, 3, 2);
    expect(sumAllocations(allocations)).toBe(10);
  });

  it("sessionMin warning when allocation < sessionMin", () => {
    // 6 / 5 days = 1.5 and 1.0 per day; sessionMin=2 → warning
    const { warnings } = dist(6, 5, 99, 2);
    expect(warnings.some((w) => w.code === "TARGET_SESSION_BELOW_MIN")).toBe(true);
    expect(warnings.find((w) => w.code === "TARGET_SESSION_BELOW_MIN")?.blocking).toBe(false);
  });

  it("sessionMin warning does not change the allocation", () => {
    const { allocations } = dist(6, 5, 99, 2);
    expect(sumAllocations(allocations)).toBe(6);
  });

  it("no sessionMin warning when all allocations ≥ sessionMin", () => {
    const { warnings } = dist(6, 3, 99, 2);
    expect(warnings.some((w) => w.code === "TARGET_SESSION_BELOW_MIN")).toBe(false);
  });

  it("weekly volume = 0 → all zeros, no warnings", () => {
    const { allocations, warnings } = dist(0, 3);
    for (const v of allocations.values()) expect(v).toBe(0);
    expect(warnings.filter((w) => w.code !== "TARGET_WITHOUT_ELIGIBLE_DAY")).toHaveLength(0);
  });

  it("no eligible day → falls back to allDayIndices + TARGET_WITHOUT_ELIGIBLE_DAY warning", () => {
    const { allocations, warnings } = distributeTargetVolume({
      weeklyVolume: 6,
      eligibleDayIndices: [],
      allDayIndices: [0, 1, 2],
      sessionMax: 99,
      sessionMin: 0,
    });
    expect(warnings.some((w) => w.code === "TARGET_WITHOUT_ELIGIBLE_DAY")).toBe(true);
    expect(sumAllocations(allocations)).toBe(6);
    expect(allocations.size).toBe(3);
  });
});

// ─── getEligibleDayTypes ──────────────────────────────────────────────────────

describe("getEligibleDayTypes", () => {
  it("Klatka piersiowa → push, upper, full_body, full_body_a, full_body_b, custom", () => {
    const eligible = getEligibleDayTypes("Klatka piersiowa");
    expect(eligible.has("push")).toBe(true);
    expect(eligible.has("upper")).toBe(true);
    expect(eligible.has("full_body")).toBe(true);
    expect(eligible.has("full_body_a")).toBe(true);
    expect(eligible.has("full_body_b")).toBe(true);
    expect(eligible.has("custom")).toBe(true);
    expect(eligible.has("pull")).toBe(false);
    expect(eligible.has("lower")).toBe(false);
    expect(eligible.has("legs")).toBe(false);
  });

  it("Barki → push eligible, pull not eligible", () => {
    const e = getEligibleDayTypes("Barki");
    expect(e.has("push")).toBe(true);
    expect(e.has("pull")).toBe(false);
    expect(e.has("legs")).toBe(false);
  });

  it("Triceps → push eligible", () => {
    expect(getEligibleDayTypes("Triceps").has("push")).toBe(true);
  });

  it("Plecy → pull, upper eligible; push not", () => {
    const e = getEligibleDayTypes("Plecy");
    expect(e.has("pull")).toBe(true);
    expect(e.has("upper")).toBe(true);
    expect(e.has("push")).toBe(false);
    expect(e.has("lower")).toBe(false);
  });

  it("Biceps → pull eligible, push not", () => {
    expect(getEligibleDayTypes("Biceps").has("pull")).toBe(true);
    expect(getEligibleDayTypes("Biceps").has("push")).toBe(false);
  });

  it("lower categories → lower, legs eligible; push/pull not", () => {
    for (const cat of [
      "Mięśnie czworogłowe uda",
      "Pośladki",
      "Łydki",
      "Przywodziciele",
      "Mięśnie dwugłowe uda",
    ]) {
      const e = getEligibleDayTypes(cat);
      expect(e.has("lower")).toBe(true);
      expect(e.has("legs")).toBe(true);
      expect(e.has("push")).toBe(false);
      expect(e.has("pull")).toBe(false);
    }
  });

  it("unknown broadCategory → all day types eligible (fallback)", () => {
    const e = getEligibleDayTypes("Coś nowego");
    for (const dayType of ["push", "pull", "upper", "lower", "legs", "full_body", "custom"]) {
      expect(e.has(dayType)).toBe(true);
    }
  });
});

// ─── calculateVolumeDistribution (integration, real DB) ──────────────────────

describe("calculateVolumeDistribution (integration)", () => {
  const baseInput = (overrides: Partial<VolumeDistributionInput> = {}): VolumeDistributionInput => ({
    clientId: 1,
    experienceLevel: INTERMEDIATE,
    trainingDays: 3,
    selectedSplitType: "upper_lower_full_body",
    selectedWeeklyVolumes: makeVolumes(6),
    priorityTargetIds: [],
    ...overrides,
  });

  it("returns exactly 11 target decisions", async () => {
    const result = await calculateVolumeDistribution(baseInput());
    expect(result.targetDecisions).toHaveLength(11);
  }, 10000);

  it("number of days equals trainingDays", async () => {
    for (const d of [1, 3, 4, 6]) {
      const result = await calculateVolumeDistribution(
        baseInput({ trainingDays: d, selectedSplitType: "push_pull_legs" }),
      );
      expect(result.days).toHaveLength(d);
    }
  }, 30000);

  it("allocatedWeeklyTotal equals weeklySelectedVolume for every target", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 4, selectedSplitType: "push_pull_lower_full_body" }),
    );
    for (const decision of result.targetDecisions) {
      expect(decision.allocatedWeeklyTotal).toBe(decision.weeklySelectedVolume);
    }
  }, 10000);

  it("all allocations are 0.5-unit multiples", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 4, selectedSplitType: "upper_lower" }),
    );
    for (const decision of result.targetDecisions) {
      for (const alloc of decision.allocations) {
        expect(isHalfUnit(alloc.allocatedVolume)).toBe(true);
      }
    }
  }, 10000);

  it("totalEffectiveTargetVolume per day = sum of non-zero allocations for that day", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 3, selectedSplitType: "upper_lower_full_body" }),
    );
    for (const day of result.days) {
      const manualSum = Math.round(
        day.targetAllocations.reduce((s, a) => s + a.allocatedVolume, 0) * 2,
      ) / 2;
      expect(day.totalEffectiveTargetVolume).toBe(manualSum);
    }
  }, 10000);

  it("chest (target 8, Klatka piersiowa) on push_pull_legs 6 days — allocated only to Push days", async () => {
    // Days 0=Push, 1=Pull, 2=Legs, 3=Push, 4=Pull, 5=Legs
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 6, selectedSplitType: "push_pull_legs" }),
    );
    const chest = result.targetDecisions.find((d) => d.targetId === 8)!;
    expect(chest).toBeDefined();
    const nonZeroAllocs = chest.allocations.filter((a) => a.allocatedVolume > 0);
    // Only Push days (indices 0 and 3) should have allocations
    for (const alloc of nonZeroAllocs) {
      expect([0, 3]).toContain(alloc.dayIndex);
    }
  }, 10000);

  it("quads (target 1, Mięśnie czworogłowe uda) on push_pull_legs 6 days — allocated only to Legs days", async () => {
    // Days 0=Push, 1=Pull, 2=Legs, 3=Push, 4=Pull, 5=Legs
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 6, selectedSplitType: "push_pull_legs" }),
    );
    const quads = result.targetDecisions.find((d) => d.targetId === 1)!;
    const nonZeroAllocs = quads.allocations.filter((a) => a.allocatedVolume > 0);
    for (const alloc of nonZeroAllocs) {
      expect([2, 5]).toContain(alloc.dayIndex);
    }
  }, 10000);

  it("back (target 9, Plecy) on push_pull_legs 6 days — allocated only to Pull days", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 6, selectedSplitType: "push_pull_legs" }),
    );
    const back = result.targetDecisions.find((d) => d.targetId === 9)!;
    const nonZeroAllocs = back.allocations.filter((a) => a.allocatedVolume > 0);
    for (const alloc of nonZeroAllocs) {
      expect([1, 4]).toContain(alloc.dayIndex);
    }
  }, 10000);

  it("full_body: all targets distributed across all days", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 3, selectedSplitType: "full_body" }),
    );
    for (const decision of result.targetDecisions) {
      if (decision.weeklySelectedVolume === 0) continue;
      const nonZero = decision.allocations.filter((a) => a.allocatedVolume > 0);
      expect(nonZero.length).toBeGreaterThan(0);
      // All eligible (all 3 full_body days)
      expect(nonZero.length).toBeLessThanOrEqual(3);
    }
  }, 10000);

  it("recommendedSplitType = push_pull_legs for 6 days + Zaawansowany", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ experienceLevel: "Zaawansowany", trainingDays: 6, selectedSplitType: "push_pull_legs" }),
    );
    expect(result.recommendedSplitType).toBe("push_pull_legs");
    expect(result.hasBlockingIssues).toBe(false);
  }, 10000);

  it("SPLIT_DIFFERS_FROM_RECOMMENDATION warning when selected != recommended", async () => {
    // 3 days + Zaawansowany → recommended upper_lower_full_body; select full_body instead
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 3, selectedSplitType: "full_body" }),
    );
    expect(result.warnings.some((w) => w.code === "SPLIT_DIFFERS_FROM_RECOMMENDATION")).toBe(true);
    expect(result.hasBlockingIssues).toBe(false);
  }, 10000);

  it("specialization: SPECIALIZATION_REQUIRES_EXERCISE_PHASE warning", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 3, selectedSplitType: "specialization" }),
    );
    expect(result.warnings.some((w) => w.code === "SPECIALIZATION_REQUIRES_EXERCISE_PHASE")).toBe(true);
    expect(result.hasBlockingIssues).toBe(false);
  }, 10000);

  it("custom: CUSTOM_SPLIT_REQUIRES_TRAINER_REVIEW warning", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 3, selectedSplitType: "custom" }),
    );
    expect(result.warnings.some((w) => w.code === "CUSTOM_SPLIT_REQUIRES_TRAINER_REVIEW")).toBe(true);
    expect(result.hasBlockingIssues).toBe(false);
  }, 10000);

  it("identical requests produce identical results (deterministic)", async () => {
    const input = baseInput({ trainingDays: 4, selectedSplitType: "push_pull_lower_full_body" });
    const r1 = await calculateVolumeDistribution(input);
    const r2 = await calculateVolumeDistribution(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  }, 20000);

  it("missing experience level → hasBlockingIssues, empty targetDecisions", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ experienceLevel: null }),
    );
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.targetDecisions).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "MISSING_EXPERIENCE_LEVEL")).toBe(true);
  }, 10000);

  it("invalid experience level → hasBlockingIssues, INVALID_EXPERIENCE_LEVEL", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ experienceLevel: "Elite" }),
    );
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.warnings.some((w) => w.code === "INVALID_EXPERIENCE_LEVEL")).toBe(true);
  }, 10000);

  it("priorityTargetIds: P1 target 6 (Barki) gets priority order 1", async () => {
    const result = await calculateVolumeDistribution(
      baseInput({ priorityTargetIds: [6, 8] }),
    );
    const barki = result.targetDecisions.find((d) => d.targetId === 6)!;
    const chest = result.targetDecisions.find((d) => d.targetId === 8)!;
    expect(barki.priorityOrder).toBe(1);
    expect(chest.priorityOrder).toBe(2);
  }, 10000);

  it("zero weekly volume → all allocations 0 for that target", async () => {
    const vols = makeVolumesMap({ 1: 0, 2: 6, 3: 4, 4: 4, 5: 6, 6: 6, 7: 4, 8: 6, 9: 6, 10: 6, 11: 4 });
    const result = await calculateVolumeDistribution(
      baseInput({ selectedWeeklyVolumes: vols }),
    );
    const quads = result.targetDecisions.find((d) => d.targetId === 1)!;
    expect(quads.allocatedWeeklyTotal).toBe(0);
    expect(quads.allocations.every((a) => a.allocatedVolume === 0)).toBe(true);
  }, 10000);

  it("upper_lower 4 days: push targets have no Lower-day allocations", async () => {
    // push categories: Barki(6), Triceps(7), Klatka(8)
    // upper_lower 4 days: Upper(0), Lower(1), Upper(2), Lower(3)
    const result = await calculateVolumeDistribution(
      baseInput({ trainingDays: 4, selectedSplitType: "upper_lower" }),
    );
    for (const targetId of [6, 7, 8]) {
      const dec = result.targetDecisions.find((d) => d.targetId === targetId)!;
      const lowerDayAllocs = dec.allocations.filter(
        (a) => [1, 3].includes(a.dayIndex) && a.allocatedVolume > 0,
      );
      expect(lowerDayAllocs).toHaveLength(0);
    }
  }, 10000);

  it("DATABASE WRITE CHECK: DB counts unchanged after distribution call", async () => {
    const { db: drizzle, volumeTargetsTable: vt, workoutPlansTable: wpt } = await import("@workspace/db");
    const { count } = await import("drizzle-orm");
    const [before] = await drizzle.select({ c: count() }).from(wpt);

    await calculateVolumeDistribution(
      baseInput({ trainingDays: 4, selectedSplitType: "push_pull_lower_full_body" }),
    );

    const [after] = await drizzle.select({ c: count() }).from(wpt);
    expect(before!.c).toBe(after!.c);
  }, 10000);
});
