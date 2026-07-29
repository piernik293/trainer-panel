/**
 * Focused tests for the unified initial weekly-volume proposal rule.
 *
 * Spec requirements:
 *  1. Brak aktywności initial proposal = weeklyAbsoluteCeiling
 *  2. Beginner initial proposal = weeklyAbsoluteCeiling
 *  3. Intermediate initial proposal = weeklyAbsoluteCeiling
 *  4. Advanced initial proposal = weeklyAbsoluteCeiling
 *  5. Intermediate chest ceiling 16 → 16
 *  6. Intermediate biceps ceiling 8 → 8
 *  7. Recovery does not numerically reduce the initial proposal
 *  8. Preferred range does not reduce the proposal
 *  9. Priority does not increase above weeklyAbsoluteCeiling
 * 10. (UI only) "Propozycja systemu" row removed — not tested here
 * 11. Manual values above absoluteMax are accepted by backend as override
 * 12. Restore value = weeklyAbsoluteCeiling
 * 13. Percentage statuses remain unchanged (tested in volumeStatusPercentage.test.ts)
 * 14. Generator, split, duration and plyometric logic untouched (no imports)
 */

import { describe, it, expect } from "vitest";
import {
  computeTargetDecision,
  type TargetRecord,
  type GuidelineRecord,
  type RecoveryProfileResult,
} from "../planDraftVolumeDecisionService";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TARGET: TargetRecord = {
  id: 1,
  name: "Mięsień piersiowy większy",
  broadCategory: "Klatka piersiowa",
  isActive: true,
};

const TARGET_BICEPS: TargetRecord = {
  id: 2,
  name: "Mięsień dwugłowy ramienia",
  broadCategory: "Biceps",
  isActive: true,
};

const TARGET_QUAD: TargetRecord = {
  id: 3,
  name: "Mięsień czworogłowy uda",
  broadCategory: "Mięśnie czworogłowe uda",
  isActive: true,
};

const TARGET_GLUTES: TargetRecord = {
  id: 4,
  name: "Mięsień pośladkowy wielki",
  broadCategory: "Pośladki",
  isActive: true,
};

const TARGET_CALVES: TargetRecord = {
  id: 5,
  name: "Mięsień trójgłowy łydki",
  broadCategory: "Łydki",
  isActive: true,
};

/** ceiling 16, preferred ceiling 12 */
const G_CHEST_16: GuidelineRecord = {
  targetId: 1,
  preferredMin: 6,
  preferredMax: 12,
  absoluteMax: 16,
};

/** ceiling 8, preferred ceiling 6 */
const G_BICEPS_8: GuidelineRecord = {
  targetId: 2,
  preferredMin: 3,
  preferredMax: 6,
  absoluteMax: 8,
};

/** ceiling 30 */
const G_QUAD_30: GuidelineRecord = {
  targetId: 3,
  preferredMin: 10,
  preferredMax: 20,
  absoluteMax: 30,
};

/** ceiling 20 — spec example: quadriceps / glutes for Intermediate */
const G_QUAD_20: GuidelineRecord = {
  targetId: 3,
  preferredMin: 8,
  preferredMax: 14,
  absoluteMax: 20,
};

const G_GLUTES_20: GuidelineRecord = {
  targetId: 4,
  preferredMin: 8,
  preferredMax: 14,
  absoluteMax: 20,
};

/** ceiling 12 */
const G_CHEST_12: GuidelineRecord = {
  targetId: 1,
  preferredMin: 5,
  preferredMax: 9,
  absoluteMax: 12,
};

/** ceiling 8 — spec example: calves for Intermediate */
const G_CALVES_8: GuidelineRecord = {
  targetId: 5,
  preferredMin: 3,
  preferredMax: 6,
  absoluteMax: 8,
};

/** ceiling 10 */
const G_CHEST_10: GuidelineRecord = {
  targetId: 1,
  preferredMin: 5,
  preferredMax: 8,
  absoluteMax: 10,
};

/** ceiling 8 */
const G_CHEST_8: GuidelineRecord = {
  targetId: 1,
  preferredMin: 4,
  preferredMax: 6,
  absoluteMax: 8,
};

const RECOVERY_NEUTRAL: RecoveryProfileResult = {
  profile: "neutral",
  factors: [],
  hasData: true,
};

const RECOVERY_REDUCED: RecoveryProfileResult = {
  profile: "reduced",
  factors: ["wysoki stres", "krótki sen"],
  hasData: true,
};

const RECOVERY_GOOD: RecoveryProfileResult = {
  profile: "good",
  factors: [],
  hasData: true,
};

function makeInput(
  experienceLevel: string | null,
  guideline: GuidelineRecord,
  target: TargetRecord,
  overrides: {
    recoveryResult?: RecoveryProfileResult;
    availability?: "short" | "standard" | "high";
    priorityOrder?: number | null;
    isExcluded?: boolean;
    trainerOverride?: number | null;
  } = {},
) {
  return {
    target,
    guideline,
    experienceLevel,
    recoveryResult: overrides.recoveryResult ?? RECOVERY_NEUTRAL,
    availability: overrides.availability ?? "standard",
    priorityOrder: overrides.priorityOrder ?? null,
    isExcluded: overrides.isExcluded ?? false,
    trainerOverride: overrides.trainerOverride ?? null,
    availabilityScore: 1,
  };
}

// ─── 1–4: All four levels produce absoluteMax ─────────────────────────────────

describe("1–4: All experience levels → recommendedValue = absoluteMax", () => {
  const cases: Array<[string, string | null, GuidelineRecord]> = [
    ["1. Brak aktywności fizycznej",   "Brak aktywności fizycznej", G_CHEST_8],
    ["2. Początkujący",                "Początkujący",              G_CHEST_10],
    ["3. Średniozaawansowany",         "Średniozaawansowany",       G_CHEST_16],
    ["4. Zaawansowany",                "Zaawansowany",              G_CHEST_16],
  ];

  for (const [label, level, guideline] of cases) {
    it(`${label} → ${guideline.absoluteMax}`, () => {
      const result = computeTargetDecision(makeInput(level, guideline, TARGET));
      expect(result.recommendedValue).toBe(guideline.absoluteMax);
    });
  }
});

// ─── 5–6: Named examples from spec §8 ─────────────────────────────────────────

describe("5–6: Named spec examples", () => {
  it("5. Intermediate chest ceiling 16 → recommendedValue 16", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("6. Intermediate biceps ceiling 8 → recommendedValue 8", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_BICEPS_8, TARGET_BICEPS),
    );
    expect(result.recommendedValue).toBe(8);
  });

  it("Advanced quadriceps ceiling 30 → recommendedValue 30", () => {
    const result = computeTargetDecision(
      makeInput("Zaawansowany", G_QUAD_30, TARGET_QUAD),
    );
    expect(result.recommendedValue).toBe(30);
  });
});

// ─── 7: Recovery does NOT reduce the initial proposal ────────────────────────

describe("7. Recovery does not numerically reduce the initial proposal", () => {
  for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
    it(`${level}: reduced recovery → recommendedValue still equals absoluteMax`, () => {
      const result = computeTargetDecision(
        makeInput(level, G_CHEST_16, TARGET, { recoveryResult: RECOVERY_REDUCED }),
      );
      expect(result.recommendedValue).toBe(G_CHEST_16.absoluteMax);
    });
  }

  it("recovery=good also leaves value at absoluteMax", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { recoveryResult: RECOVERY_GOOD }),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("reduced recovery reason does NOT contain 'obniżenie z powodu regeneracji'", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { recoveryResult: RECOVERY_REDUCED }),
    );
    const reasons = result.reasons.join(" ");
    expect(reasons).not.toContain("obniżenie z powodu regeneracji");
  });

  it("reduced recovery reason contains neutral monitoring message", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { recoveryResult: RECOVERY_REDUCED }),
    );
    const reasons = result.reasons.join(" ");
    expect(reasons).toContain("monitorowania");
  });
});

// ─── 8: Preferred range does NOT reduce the proposal ─────────────────────────

describe("8. Old preferred range does not reduce the proposal", () => {
  it("preferredMax < absoluteMax — proposal still equals absoluteMax, not preferredMax", () => {
    // G_CHEST_16: preferredMax=12, absoluteMax=16 — old code would clamp to 12 for some levels
    const result = computeTargetDecision(
      makeInput("Brak aktywności fizycznej", G_CHEST_16, TARGET),
    );
    expect(result.recommendedValue).toBe(16);
    expect(result.recommendedValue).not.toBe(G_CHEST_16.preferredMax);
  });

  it("short availability does NOT reduce the proposal", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { availability: "short" }),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("reasons include 'propozycja startuje od maksymalnej' for Brak aktywności", () => {
    const result = computeTargetDecision(
      makeInput("Brak aktywności fizycznej", G_CHEST_8, TARGET),
    );
    const reasons = result.reasons.join(" ");
    expect(reasons).toContain("propozycja startuje od maksymalnej");
    expect(reasons).not.toContain("wybrano dolną granicę");
  });
});

// ─── 9: Priority does NOT increase above absoluteMax ─────────────────────────

describe("9. Priority does not increase the initial value above weeklyAbsoluteCeiling", () => {
  it("priority 1 (Tier A) — recommendedValue stays at absoluteMax", () => {
    const result = computeTargetDecision(
      makeInput("Zaawansowany", G_CHEST_16, TARGET, { priorityOrder: 1 }),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("priority 2 (Tier B) — recommendedValue stays at absoluteMax", () => {
    const result = computeTargetDecision(
      makeInput("Zaawansowany", G_CHEST_16, TARGET, { priorityOrder: 2 }),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("priority for Brak aktywności — recommendedValue stays at absoluteMax", () => {
    const result = computeTargetDecision(
      makeInput("Brak aktywności fizycznej", G_CHEST_8, TARGET, { priorityOrder: 1 }),
    );
    expect(result.recommendedValue).toBe(8);
  });
});

// ─── 11: Manual override — values above absoluteMax accepted ─────────────────

describe("11. Manual override — trainer can set values above absoluteMax", () => {
  it("override above absoluteMax is accepted (Zone D now allowed)", () => {
    const overrideValue = 20; // ceiling = 16
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { trainerOverride: overrideValue }),
    );
    // Override accepted: selectedValue = 20
    expect(result.selectedValue).toBe(overrideValue);
    expect(result.isOverridden).toBe(true);
  });

  it("override below preferredMin is still rejected (Zone A)", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { trainerOverride: 1 }),
    );
    // Rejected: selectedValue falls back to recommendedValue
    expect(result.selectedValue).toBe(result.recommendedValue);
    expect(result.isOverridden).toBe(false);
  });

  it("override at absoluteMax+1 is accepted", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET, { trainerOverride: 17 }),
    );
    expect(result.selectedValue).toBe(17);
    expect(result.isOverridden).toBe(true);
  });
});

// ─── 12: Restore value = absoluteMax (selectedValue resets to recommendedValue) ─

describe("12. Restoring resets to weeklyAbsoluteCeiling", () => {
  it("recommendedValue equals absoluteMax — restoring returns to that value", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET),
    );
    // recommendedValue IS absoluteMax → frontend restore sets control back to this
    expect(result.recommendedValue).toBe(G_CHEST_16.absoluteMax);
  });

  it("all four levels: recommendedValue = absoluteMax = restore target", () => {
    for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
      const result = computeTargetDecision(makeInput(level, G_CHEST_16, TARGET));
      expect(result.recommendedValue).toBe(G_CHEST_16.absoluteMax);
    }
  });
});

// ─── Spec-required ceiling examples: 20 / 12 / 8 ─────────────────────────────

describe("Spec ceiling examples — control must display exact ceiling value", () => {
  it("ceiling 20 → recommendedValue 20 (not 18)", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_QUAD_20, TARGET_QUAD),
    );
    expect(result.recommendedValue).toBe(20);
    expect(result.recommendedValue).not.toBe(18);
  });

  it("ceiling 12 → recommendedValue 12", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_12, TARGET),
    );
    expect(result.recommendedValue).toBe(12);
  });

  it("ceiling 16 → recommendedValue 16", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_16, TARGET),
    );
    expect(result.recommendedValue).toBe(16);
  });

  it("ceiling 8 → recommendedValue 8", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CHEST_8, TARGET),
    );
    expect(result.recommendedValue).toBe(8);
  });
});

// ─── Intermediate profile specific targets (spec §FOCUSED TESTS) ──────────────

describe("Intermediate profile: specific target ceilings (not old reduced values)", () => {
  it("quadriceps ceiling 20 → 20, not old reduced 18", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_QUAD_20, TARGET_QUAD, {
        recoveryResult: RECOVERY_REDUCED,
      }),
    );
    expect(result.recommendedValue).toBe(20);
  });

  it("glutes ceiling 20 → 20, not old reduced 18", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_GLUTES_20, TARGET_GLUTES, {
        recoveryResult: RECOVERY_REDUCED,
      }),
    );
    expect(result.recommendedValue).toBe(20);
  });

  it("calves ceiling 8 → 8, not old reduced 7", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_CALVES_8, TARGET_CALVES, {
        recoveryResult: RECOVERY_REDUCED,
      }),
    );
    expect(result.recommendedValue).toBe(8);
  });

  it("recovery=reduced with ceiling 20 — reason does not claim reduction", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_QUAD_20, TARGET_QUAD, {
        recoveryResult: RECOVERY_REDUCED,
      }),
    );
    const joined = result.reasons.join(" ");
    expect(joined).not.toContain("obniżenie z powodu regeneracji");
    expect(joined).toContain("monitorowania");
    expect(joined).toContain(`propozycja: 20 pkt.`);
  });

  it("reason line confirms propozycja startuje od maksymalnej for ceiling 20", () => {
    const result = computeTargetDecision(
      makeInput("Średniozaawansowany", G_QUAD_20, TARGET_QUAD),
    );
    const joined = result.reasons.join(" ");
    expect(joined).toContain("propozycja startuje od maksymalnej rekomendowanej objętości tygodniowej (20 pkt.)");
    expect(joined).toContain("propozycja: 20 pkt.");
  });
});

// ─── Percentage status unchanged ─────────────────────────────────────────────

describe("Percentage statuses remain unchanged by unified proposal rule", () => {
  it("selectedValue = absoluteMax → ratio = 1.0 (100%) regardless of ceiling", () => {
    for (const [guideline, target, level] of [
      [G_QUAD_20, TARGET_QUAD, "Średniozaawansowany"],
      [G_CHEST_16, TARGET, "Zaawansowany"],
      [G_CALVES_8, TARGET_CALVES, "Początkujący"],
    ] as const) {
      const result = computeTargetDecision(makeInput(level, guideline, target));
      const ratio = result.selectedValue / result.absoluteMax;
      expect(ratio).toBe(1.0);
    }
  });
});
