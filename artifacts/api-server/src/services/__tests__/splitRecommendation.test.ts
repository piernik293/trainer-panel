/**
 * Unit tests for splitRecommendationService — 6-day and 7-day recommendation paths.
 *
 * Verified invariants for every branch at trainingDays ∈ {6, 7}:
 *   1. result.recommended ∈ getCompatibleSplits(trainingDays)
 *   2. Every element of result.alternatives ∈ getCompatibleSplits(trainingDays)
 *   3. result.recommended ∉ { "upper_lower", "upper_lower_full_body" }
 *   4. No element of result.alternatives ∈ { "upper_lower", "upper_lower_full_body" }
 *
 * The 6–7 day section of recommendSplit() has three branches:
 *   A. Advanced   + poor recovery
 *   B. Advanced   + non-poor recovery (good / standard / excellent)
 *   C. Intermediate + any recovery (falls through to final return)
 *
 * No DB dependency — all functions under test are pure.
 */

import { describe, it, expect } from "vitest";
import { recommendSplit, type SplitRecommendationInput } from "../splitRecommendationService";
import { getCompatibleSplits } from "@workspace/api-zod";
import type { SplitType } from "@workspace/api-zod";

// ─── Constants ────────────────────────────────────────────────────────────────

const ADVANCED     = "Zaawansowany";
const INTERMEDIATE = "Średniozaawansowany";

/** Splits that are absent from getCompatibleSplits(≥6) and must never appear. */
const INCOMPATIBLE_AT_6_7: SplitType[] = ["upper_lower", "upper_lower_full_body"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertCompatibleAndNotBanned(
  days: 6 | 7,
  result: ReturnType<typeof recommendSplit>,
): void {
  const compatible = getCompatibleSplits(days);

  // recommended must be in the allowed set
  expect(
    compatible,
    `days=${days}: expected compatible splits to contain recommended="${result.recommended}"`,
  ).toContain(result.recommended);

  // every alternative must be in the allowed set
  for (const alt of result.alternatives) {
    expect(
      compatible,
      `days=${days}: expected compatible splits to contain alternative="${alt}"`,
    ).toContain(alt);
  }

  // recommended must NOT be one of the incompatible splits
  expect(
    INCOMPATIBLE_AT_6_7,
    `days=${days}: recommended="${result.recommended}" must not be in the incompatible list`,
  ).not.toContain(result.recommended);

  // no alternative may be one of the incompatible splits
  for (const alt of result.alternatives) {
    expect(
      INCOMPATIBLE_AT_6_7,
      `days=${days}: alternative="${alt}" must not be in the incompatible list`,
    ).not.toContain(alt);
  }
}

function rec(input: SplitRecommendationInput) {
  return recommendSplit(input);
}

// ─── Shared: getCompatibleSplits(≥6) contract ─────────────────────────────────

describe("getCompatibleSplits() — ≥6 day contract", () => {
  it("6 days: does NOT include upper_lower", () => {
    expect(getCompatibleSplits(6)).not.toContain("upper_lower");
  });

  it("6 days: does NOT include upper_lower_full_body", () => {
    expect(getCompatibleSplits(6)).not.toContain("upper_lower_full_body");
  });

  it("7 days: does NOT include upper_lower", () => {
    expect(getCompatibleSplits(7)).not.toContain("upper_lower");
  });

  it("7 days: does NOT include upper_lower_full_body", () => {
    expect(getCompatibleSplits(7)).not.toContain("upper_lower_full_body");
  });

  it("6 days: includes push_pull_legs", () => {
    expect(getCompatibleSplits(6)).toContain("push_pull_legs");
  });

  it("7 days: includes push_pull_legs", () => {
    expect(getCompatibleSplits(7)).toContain("push_pull_legs");
  });
});

// ─── 6 days ───────────────────────────────────────────────────────────────────

describe("recommendSplit() — 6 days", () => {
  const DAYS = 6;

  // Branch A: Advanced + poor recovery
  describe("Branch A: Advanced + poor recovery", () => {
    const base: SplitRecommendationInput = {
      trainingDays: DAYS,
      experienceLevel: ADVANCED,
      recoveryQuality: "poor",
      trainingGoal: null,
    };

    it("recommended is push_pull_legs", () => {
      expect(rec(base).recommended).toBe("push_pull_legs");
    });

    it("recommended ∈ getCompatibleSplits(6)", () => {
      assertCompatibleAndNotBanned(DAYS, rec(base));
    });

    it("no alternative is upper_lower or upper_lower_full_body", () => {
      const result = rec(base);
      for (const alt of result.alternatives) {
        expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
      }
    });

    it("fallbackApplied is true", () => {
      expect(rec(base).fallbackApplied).toBe(true);
    });
  });

  // Branch B: Advanced + non-poor recovery
  for (const rq of ["good", "standard", "excellent"] as const) {
    describe(`Branch B: Advanced + recovery=${rq}`, () => {
      const base: SplitRecommendationInput = {
        trainingDays: DAYS,
        experienceLevel: ADVANCED,
        recoveryQuality: rq,
        trainingGoal: "Hipertrofia",
      };

      it(`recommended is push_pull_legs (recovery=${rq})`, () => {
        expect(rec(base).recommended).toBe("push_pull_legs");
      });

      it(`recommended ∈ getCompatibleSplits(6) (recovery=${rq})`, () => {
        assertCompatibleAndNotBanned(DAYS, rec(base));
      });

      it(`no alternative is upper_lower or upper_lower_full_body (recovery=${rq})`, () => {
        for (const alt of rec(base).alternatives) {
          expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
        }
      });

      it(`fallbackApplied is false (recovery=${rq})`, () => {
        expect(rec(base).fallbackApplied).toBe(false);
      });
    });
  }

  // Branch C: Intermediate, any recovery
  for (const rq of ["poor", "standard", "excellent"] as const) {
    describe(`Branch C: Intermediate + recovery=${rq}`, () => {
      const base: SplitRecommendationInput = {
        trainingDays: DAYS,
        experienceLevel: INTERMEDIATE,
        recoveryQuality: rq,
        trainingGoal: null,
      };

      it(`recommended is push_pull_legs (recovery=${rq})`, () => {
        expect(rec(base).recommended).toBe("push_pull_legs");
      });

      it(`recommended ∈ getCompatibleSplits(6) (recovery=${rq})`, () => {
        assertCompatibleAndNotBanned(DAYS, rec(base));
      });

      it(`no alternative is upper_lower or upper_lower_full_body (recovery=${rq})`, () => {
        for (const alt of rec(base).alternatives) {
          expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
        }
      });
    });
  }
});

// ─── 7 days ───────────────────────────────────────────────────────────────────

describe("recommendSplit() — 7 days", () => {
  const DAYS = 7;

  // Branch A: Advanced + poor recovery
  describe("Branch A: Advanced + poor recovery", () => {
    const base: SplitRecommendationInput = {
      trainingDays: DAYS,
      experienceLevel: ADVANCED,
      recoveryQuality: "poor",
      trainingGoal: null,
    };

    it("recommended is push_pull_legs", () => {
      expect(rec(base).recommended).toBe("push_pull_legs");
    });

    it("recommended ∈ getCompatibleSplits(7)", () => {
      assertCompatibleAndNotBanned(DAYS, rec(base));
    });

    it("no alternative is upper_lower or upper_lower_full_body", () => {
      for (const alt of rec(base).alternatives) {
        expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
      }
    });

    it("fallbackApplied is true", () => {
      expect(rec(base).fallbackApplied).toBe(true);
    });
  });

  // Branch B: Advanced + non-poor recovery
  for (const rq of ["good", "standard", "excellent"] as const) {
    describe(`Branch B: Advanced + recovery=${rq}`, () => {
      const base: SplitRecommendationInput = {
        trainingDays: DAYS,
        experienceLevel: ADVANCED,
        recoveryQuality: rq,
        trainingGoal: "Siła",
      };

      it(`recommended is push_pull_legs (recovery=${rq})`, () => {
        expect(rec(base).recommended).toBe("push_pull_legs");
      });

      it(`recommended ∈ getCompatibleSplits(7) (recovery=${rq})`, () => {
        assertCompatibleAndNotBanned(DAYS, rec(base));
      });

      it(`no alternative is upper_lower or upper_lower_full_body (recovery=${rq})`, () => {
        for (const alt of rec(base).alternatives) {
          expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
        }
      });

      it(`fallbackApplied is false (recovery=${rq})`, () => {
        expect(rec(base).fallbackApplied).toBe(false);
      });
    });
  }

  // Branch C: Intermediate, any recovery
  for (const rq of ["poor", "standard", "excellent"] as const) {
    describe(`Branch C: Intermediate + recovery=${rq}`, () => {
      const base: SplitRecommendationInput = {
        trainingDays: DAYS,
        experienceLevel: INTERMEDIATE,
        recoveryQuality: rq,
        trainingGoal: "Redukcja tkanki tłuszczowej",
      };

      it(`recommended is push_pull_legs (recovery=${rq})`, () => {
        expect(rec(base).recommended).toBe("push_pull_legs");
      });

      it(`recommended ∈ getCompatibleSplits(7) (recovery=${rq})`, () => {
        assertCompatibleAndNotBanned(DAYS, rec(base));
      });

      it(`no alternative is upper_lower or upper_lower_full_body (recovery=${rq})`, () => {
        for (const alt of rec(base).alternatives) {
          expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
        }
      });
    });
  }
});

// ─── Regression: prior bug — upper_lower was returned for ≥6 days ─────────────

describe("Regression: upper_lower / upper_lower_full_body never returned at ≥6 days", () => {
  const configs: SplitRecommendationInput[] = [
    { trainingDays: 6, experienceLevel: ADVANCED,     recoveryQuality: "poor",      trainingGoal: null },
    { trainingDays: 6, experienceLevel: ADVANCED,     recoveryQuality: "excellent",  trainingGoal: null },
    { trainingDays: 6, experienceLevel: INTERMEDIATE, recoveryQuality: "poor",      trainingGoal: null },
    { trainingDays: 6, experienceLevel: INTERMEDIATE, recoveryQuality: "good",      trainingGoal: null },
    { trainingDays: 7, experienceLevel: ADVANCED,     recoveryQuality: "poor",      trainingGoal: null },
    { trainingDays: 7, experienceLevel: ADVANCED,     recoveryQuality: "standard",  trainingGoal: null },
    { trainingDays: 7, experienceLevel: INTERMEDIATE, recoveryQuality: "poor",      trainingGoal: null },
    { trainingDays: 7, experienceLevel: INTERMEDIATE, recoveryQuality: "excellent", trainingGoal: null },
  ];

  for (const cfg of configs) {
    it(
      `days=${cfg.trainingDays} / ${cfg.experienceLevel} / recovery=${cfg.recoveryQuality}: ` +
        `no upper_lower or upper_lower_full_body in output`,
      () => {
        const result = recommendSplit(cfg);
        expect(INCOMPATIBLE_AT_6_7).not.toContain(result.recommended);
        for (const alt of result.alternatives) {
          expect(INCOMPATIBLE_AT_6_7).not.toContain(alt);
        }
      },
    );
  }
});
