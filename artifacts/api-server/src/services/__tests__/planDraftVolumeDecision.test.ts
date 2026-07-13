/**
 * Tests for planDraftVolumeDecisionService.ts — Phase 2 of the Workout Plan Draft Generator.
 *
 * 44 tests covering:
 *  - Recovery profile computation (10 tests)
 *  - Base range position by experience level (5 tests)
 *  - Muscle group → target matching (4 tests)
 *  - Priority order resolution (4 tests)
 *  - Availability classification (3 tests)
 *  - Single-target decision: all adjustment paths (12 tests)
 *  - Integration: full calculateVolumeDecisions() (6 tests)
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  computeRecoveryProfile,
  computeBaseRangePosition,
  round05,
  matchMuscleGroupToTargetIds,
  getPriorityOrder,
  isExcludedTarget,
  classifyAvailability,
  computeTargetDecision,
  calculateVolumeDecisions,
  type TargetRecord,
  type GuidelineRecord,
  type RecoveryProfileResult,
} from "../planDraftVolumeDecisionService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TARGETS: TargetRecord[] = [
  { id: 1, name: "Mięsień czworogłowy uda", broadCategory: "Mięśnie czworogłowe uda", isActive: true },
  { id: 2, name: "Mięśnie pośladkowe", broadCategory: "Pośladki", isActive: true },
  { id: 3, name: "Mięsień trójgłowy łydki", broadCategory: "Łydki", isActive: true },
  { id: 4, name: "Przywodziciele", broadCategory: "Przywodziciele", isActive: true },
  { id: 5, name: "Grupa kulszowo-goleniowa", broadCategory: "Mięśnie dwugłowe uda", isActive: true },
  { id: 6, name: "Mięśnie naramienne", broadCategory: "Barki", isActive: true },
  { id: 7, name: "Mięsień trójgłowy ramienia", broadCategory: "Triceps", isActive: true },
  { id: 8, name: "Mięsień piersiowy większy", broadCategory: "Klatka piersiowa", isActive: true },
  { id: 9, name: "Mięsień najszerszy grzbietu", broadCategory: "Plecy", isActive: true },
  { id: 10, name: "Mięsień czworoboczny grzbietu", broadCategory: "Plecy", isActive: true },
  { id: 11, name: "Mięsień dwugłowy ramienia", broadCategory: "Biceps", isActive: true },
];

const GUIDELINE_BEGINNER: GuidelineRecord = {
  targetId: 6, // Mięśnie naramienne
  guidelineMin: 8,
  guidelineMax: 12,
};

const GUIDELINE_ADVANCED_CHEST: GuidelineRecord = {
  targetId: 8, // Mięsień piersiowy większy
  guidelineMin: 15,
  guidelineMax: 20,
};

const GUIDELINE_BEGINNER_QUAD: GuidelineRecord = {
  targetId: 1, // Mięsień czworogłowy uda
  guidelineMin: 8,
  guidelineMax: 10,
};

const NEUTRAL_RECOVERY: RecoveryProfileResult = {
  profile: "neutral",
  hasData: true,
  factors: [],
};

// ─── Round05 ─────────────────────────────────────────────────────────────────

describe("round05", () => {
  it("rounds 9.3 to 9.5", () => expect(round05(9.3)).toBe(9.5));
  it("rounds 9.1 to 9.0", () => expect(round05(9.1)).toBe(9.0));
  it("rounds 9.75 to 10.0", () => expect(round05(9.75)).toBe(10.0));
  it("passes exact halves through", () => expect(round05(8.5)).toBe(8.5));
});

// ─── Recovery profile ─────────────────────────────────────────────────────────

describe("computeRecoveryProfile", () => {
  it("returns neutral when no data provided", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: null,
      sleepHours: null,
      stressLevel: null,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("neutral");
    expect(r.hasData).toBe(false);
  });

  it("returns good when recoveryQuality=excellent", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "excellent",
      sleepHours: null,
      stressLevel: null,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("good");
    expect(r.hasData).toBe(true);
  });

  it("returns good when recoveryQuality=good", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "good",
      sleepHours: 8,
      stressLevel: 2,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("good");
  });

  it("returns reduced when recoveryQuality=poor", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "poor",
      sleepHours: null,
      stressLevel: null,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when sleep < 6 and no positive signals", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: null,
      sleepHours: 5,
      stressLevel: null,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when stress >= 7 (weight=2)", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: null,
      sleepHours: null,
      stressLevel: 8,
      physicalWork: false,
      dailyActivity: null,
    });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when physicalWork=true and no positive signals", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: null,
      sleepHours: null,
      stressLevel: null,
      physicalWork: true,
      dailyActivity: null,
    });
    expect(r.profile).toBe("reduced");
  });

  it("returns neutral for standard recoveryQuality with no other signals", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "standard",
      sleepHours: null,
      stressLevel: null,
      physicalWork: false,
      dailyActivity: null,
    });
    // standard → neutral signal; no positives or negatives
    expect(r.profile).toBe("neutral");
  });

  it("positives outweigh single moderate negative → neutral", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "good",  // +2
      sleepHours: 9,             // +1
      stressLevel: 5,            // -1 (moderate)
      physicalWork: false,
      dailyActivity: null,
    });
    // positive=3, negative=1 → good
    expect(r.profile).toBe("good");
  });

  it("includes factors array with descriptions for known signals", () => {
    const r = computeRecoveryProfile({
      recoveryQuality: "poor",
      sleepHours: 5,
      stressLevel: 8,
      physicalWork: true,
      dailyActivity: null,
    });
    expect(r.factors.length).toBeGreaterThan(0);
    expect(r.profile).toBe("reduced");
  });
});

// ─── Base range position ──────────────────────────────────────────────────────

describe("computeBaseRangePosition", () => {
  it("Brak aktywności fizycznej → 0.00", () => {
    expect(computeBaseRangePosition("Brak aktywności fizycznej")).toBe(0.00);
  });

  it("Początkujący → 0.25", () => {
    expect(computeBaseRangePosition("Początkujący")).toBe(0.25);
  });

  it("Średniozaawansowany → 0.50", () => {
    expect(computeBaseRangePosition("Średniozaawansowany")).toBe(0.50);
  });

  it("Zaawansowany → 0.50", () => {
    expect(computeBaseRangePosition("Zaawansowany")).toBe(0.50);
  });

  it("unknown level → null", () => {
    expect(computeBaseRangePosition("Ekspert")).toBeNull();
  });
});

// ─── Muscle group matching ─────────────────────────────────────────────────────

describe("matchMuscleGroupToTargetIds", () => {
  it("matches exact broadCategory (Klatka piersiowa → id 8)", () => {
    const ids = matchMuscleGroupToTargetIds("Klatka piersiowa", TARGETS);
    expect(ids).toContain(8);
    expect(ids).not.toContain(9);
  });

  it("matches Plecy → both ids 9 and 10", () => {
    const ids = matchMuscleGroupToTargetIds("Plecy", TARGETS);
    expect(ids).toContain(9);
    expect(ids).toContain(10);
  });

  it("matches Barki → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("Barki", TARGETS);
    expect(ids).toContain(6);
  });

  it("returns empty array for unknown group", () => {
    const ids = matchMuscleGroupToTargetIds("Nieznana partia", TARGETS);
    expect(ids).toHaveLength(0);
  });
});

// ─── Priority order ───────────────────────────────────────────────────────────

describe("getPriorityOrder", () => {
  it("returns 1 when target is first priority", () => {
    const order = getPriorityOrder(8, ["Klatka piersiowa"], TARGETS);
    expect(order).toBe(1);
  });

  it("returns 2 when target is second priority", () => {
    const order = getPriorityOrder(9, ["Barki", "Plecy"], TARGETS);
    expect(order).toBe(2);
  });

  it("returns null when target is not in priority list", () => {
    const order = getPriorityOrder(3, ["Barki", "Plecy"], TARGETS);
    expect(order).toBeNull();
  });

  it("handles up to 3 priorities and ignores the rest", () => {
    const order = getPriorityOrder(11, ["Barki", "Plecy", "Biceps", "Triceps"], TARGETS);
    expect(order).toBe(3); // only first 3 count
  });
});

// ─── Availability classification ──────────────────────────────────────────────

describe("classifyAvailability", () => {
  it("short when days ≤ 2", () => {
    expect(classifyAvailability(2, 60)).toBe("short");
  });

  it("short when session < 45 min", () => {
    expect(classifyAvailability(4, 40)).toBe("short");
  });

  it("standard for typical 4-day, 60-min schedule", () => {
    expect(classifyAvailability(4, 60)).toBe("standard");
  });
});

// ─── Single-target decisions ──────────────────────────────────────────────────

describe("computeTargetDecision", () => {
  it("returns recommendedValue within [guidelineMin, guidelineMax]", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, // Mięśnie naramienne
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.recommendedValue).toBeGreaterThanOrEqual(8);
    expect(d.recommendedValue).toBeLessThanOrEqual(12);
  });

  it("Początkujący, no priority → base at 25% of range", () => {
    // Range 8–12, rangeWidth=4, 25% = 1.0 → base=9, rounded to 9.0
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.baseValue).toBe(9.0);
    expect(d.recommendedValue).toBe(9.0);
  });

  it("Początkujący, first priority → +20% of range width", () => {
    // base=9, +20%*4=0.8 → stored as round05(0.8)=1.0; total=10.0 → recommended=10.0
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: 1,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    // Adjustment is stored rounded to 0.5 precision
    expect(d.priorityAdjustment).toBe(1.0); // round05(0.8)=1.0
    expect(d.recommendedValue).toBe(10.0);
    expect(d.priorityOrder).toBe(1);
    expect(d.source).toBe("calculated");
  });

  it("second priority → +10% of range width", () => {
    // base=9, +10%*4=0.4 → stored as round05(0.4)=0.5; total=9.4 → rounded=9.5
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: 2,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.priorityAdjustment).toBe(0.5); // round05(0.4)=0.5
    expect(d.recommendedValue).toBe(9.5);
  });

  it("third priority → +5% of range width", () => {
    // base=9, +5%*4=0.2 → stored as round05(0.2)=0.0; total=9.2 → rounds to 9.0
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: 3,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.priorityAdjustment).toBe(0.0); // round05(0.2)=0.0
    expect(d.recommendedValue).toBe(9.0);
  });

  it("excluded target → set to guidelineMin regardless of priority", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Zaawansowany",
      priorityOrder: 1, // Even if priority, excluded wins
      isExcluded: true,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.recommendedValue).toBe(8); // guidelineMin
    expect(d.isExcluded).toBe(true);
    expect(d.priorityAdjustment).toBe(0);
    const deprioritizedWarning = d.warnings.find((w) => w.code === "TARGET_DEPRIORITIZED_BY_TRAINER");
    expect(deprioritizedWarning).toBeDefined();
  });

  it("reduced recovery → lowers value by 20% of range width", () => {
    const reducedRecovery: RecoveryProfileResult = {
      profile: "reduced",
      hasData: true,
      factors: ["słaba jakość regeneracji"],
    };
    // Range 8–12, width=4, no priority → base=9, recovery=-0.20*4=-0.8 → stored as round05(-0.8)=-1.0
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: reducedRecovery,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.recoveryAdjustment).toBe(-1.0); // round05(-0.8)=-1.0
    expect(d.recommendedValue).toBeGreaterThanOrEqual(8); // never below guidelineMin
    expect(d.recommendedValue).toBeLessThanOrEqual(12);
  });

  it("reduced recovery never drops below guidelineMin", () => {
    const reducedRecovery: RecoveryProfileResult = {
      profile: "reduced",
      hasData: true,
      factors: ["słaba jakość regeneracji"],
    };
    // Brak aktywności fizycznej: rangePosition=0.0 → base=guidelineMin
    // Even with recovery reduction, should not go below guidelineMin
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Brak aktywności fizycznej",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: reducedRecovery,
      availability: "standard",
      trainerOverride: null,
    });
    expect(d.recommendedValue).toBeGreaterThanOrEqual(8);
  });

  it("short availability reduces non-priority targets", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "short",
      trainerOverride: null,
    });
    // base=9, availability adj = -0.25*4 = -1.0 → 8.0
    expect(d.availabilityAdjustment).toBeCloseTo(-1.0, 1);
    expect(d.recommendedValue).toBe(8.0);
  });

  it("short availability does NOT reduce priority targets", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: 1,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "short",
      trainerOverride: null,
    });
    expect(d.availabilityAdjustment).toBe(0);
    expect(d.priorityAdjustment).toBeGreaterThan(0);
  });

  it("trainer override within range is applied and rounds to 0.5", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: 10.3,
    });
    expect(d.selectedValue).toBe(10.5);
    expect(d.trainerOverride).toBe(10.3);
    expect(d.source).toBe("trainer_override");
    expect(d.isOverridden).toBe(true);
  });

  it("trainer override below guidelineMin is rejected with warning", () => {
    // Beginner, Barki, no priority → recommendedValue = round05(8 + 0.25*4) = 9
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: 2,
    });
    // Rejected: selectedValue stays at recommendedValue, not clamped to guidelineMin
    expect(d.selectedValue).toBe(9); // recommendedValue, not clamped
    expect(d.isOverridden).toBe(false); // override was rejected, not applied
    expect(d.source).toBe("calculated");
    expect(d.trainerOverride).toBe(2); // raw input still recorded for display
    const warn = d.warnings.find((w) => w.code === "VOLUME_OVERRIDE_BELOW_MIN");
    expect(warn).toBeDefined();
  });

  it("trainer override above guidelineMax is rejected with warning", () => {
    // Beginner, Barki, no priority → recommendedValue = 9
    const d = computeTargetDecision({
      target: TARGETS[5]!,
      guideline: GUIDELINE_BEGINNER,
      experienceLevel: "Początkujący",
      priorityOrder: null,
      isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard",
      trainerOverride: 20,
    });
    // Rejected: selectedValue stays at recommendedValue, not clamped to guidelineMax
    expect(d.selectedValue).toBe(9); // recommendedValue, not clamped
    expect(d.isOverridden).toBe(false); // override was rejected, not applied
    expect(d.source).toBe("calculated");
    expect(d.trainerOverride).toBe(20); // raw input still recorded
    const warn = d.warnings.find((w) => w.code === "VOLUME_OVERRIDE_ABOVE_MAX");
    expect(warn).toBeDefined();
  });
});

// ─── Integration tests (require DB) ──────────────────────────────────────────

describe("calculateVolumeDecisions (integration)", () => {
  it("returns 11 decisions for a valid Początkujący input", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Początkujący",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 4,
      sessionDuration: 60,
      trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(11);
    expect(result.summary.totalTargets).toBe(11);
    expect(result.summary.blockingIssues).toBe(false);
    expect(result.metadata.guidelineVersionId).toBeGreaterThan(0);
  }, 10000);

  it("all decisions have selectedValue within [guidelineMin, guidelineMax]", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Zaawansowany",
      priorityMuscleGroups: ["Klatka piersiowa", "Plecy"],
      excludedMuscleGroups: [],
      sleep: 7,
      stress: 3,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: "good",
      trainingDays: 5,
      sessionDuration: 75,
      trainerOverrides: {},
    });
    for (const d of result.decisions) {
      expect(d.selectedValue).toBeGreaterThanOrEqual(d.guidelineMin);
      expect(d.selectedValue).toBeLessThanOrEqual(d.guidelineMax);
    }
  }, 10000);

  it("returns blocking error for null experienceLevel", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: null,
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 4,
      sessionDuration: 60,
      trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(0);
    expect(result.summary.blockingIssues).toBe(true);
    const err = result.warnings.find((w) => w.code === "MISSING_EXPERIENCE_LEVEL");
    expect(err).toBeDefined();
    expect(err?.blocking).toBe(true);
  }, 10000);

  it("returns blocking error for invalid experienceLevel", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Ekspert",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 4,
      sessionDuration: 60,
      trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(0);
    const err = result.warnings.find((w) => w.code === "INVALID_EXPERIENCE_LEVEL");
    expect(err).toBeDefined();
    expect(err?.blocking).toBe(true);
  }, 10000);

  it("applies valid in-range trainer overrides from input", async () => {
    // Barki (target 6) for Średniozaawansowany: range [16, 20]. Override 18 is in-range.
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 4,
      sessionDuration: 60,
      trainerOverrides: { "6": 18 }, // Barki override to 18 (in-range for [16, 20])
    });
    const barkiDecision = result.decisions.find((d) => d.targetId === 6);
    expect(barkiDecision).toBeDefined();
    expect(barkiDecision?.isOverridden).toBe(true);
    expect(barkiDecision?.source).toBe("trainer_override");
    expect(barkiDecision?.selectedValue).toBe(18);
    expect(result.summary.targetsOverridden).toBe(1);
  }, 10000);

  it("rejects out-of-range trainer override and keeps recommendedValue", async () => {
    // Barki (target 6) for Średniozaawansowany: range [16, 20]. Override 11 is below min.
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 4,
      sessionDuration: 60,
      trainerOverrides: { "6": 11 }, // below guidelineMin 16 → rejected
    });
    const barkiDecision = result.decisions.find((d) => d.targetId === 6);
    expect(barkiDecision).toBeDefined();
    // Override rejected: not applied
    expect(barkiDecision?.isOverridden).toBe(false);
    expect(barkiDecision?.source).toBe("calculated");
    // selectedValue == recommendedValue (not the rejected override value)
    expect(barkiDecision?.selectedValue).toBe(barkiDecision?.recommendedValue);
    // Raw input still recorded for display
    expect(barkiDecision?.trainerOverride).toBe(11);
    // Warning emitted
    const warn = barkiDecision?.warnings.find((w) => w.code === "VOLUME_OVERRIDE_BELOW_MIN");
    expect(warn).toBeDefined();
    // Does not count as overridden in summary
    expect(result.summary.targetsOverridden).toBe(0);
  }, 10000);

  it("decisions are returned in canonical TARGET_ORDER", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1,
      experienceLevel: "Początkujący",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleep: null,
      stress: null,
      physicalWork: false,
      dailyActivity: null,
      recoveryQuality: null,
      trainingDays: 3,
      sessionDuration: 60,
      trainerOverrides: {},
    });

    const canonicalOrder = [
      "Mięsień czworogłowy uda",
      "Mięśnie pośladkowe",
      "Mięsień trójgłowy łydki",
      "Przywodziciele",
      "Grupa kulszowo-goleniowa",
      "Mięśnie naramienne",
      "Mięsień trójgłowy ramienia",
      "Mięsień piersiowy większy",
      "Mięsień najszerszy grzbietu",
      "Mięsień czworoboczny grzbietu",
      "Mięsień dwugłowy ramienia",
    ];
    const resultNames = result.decisions.map((d) => d.targetName);
    expect(resultNames).toEqual(canonicalOrder);
  }, 10000);
});
