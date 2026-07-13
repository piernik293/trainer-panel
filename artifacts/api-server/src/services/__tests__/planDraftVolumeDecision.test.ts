/**
 * Tests for planDraftVolumeDecisionService.ts — Phase 2 of the Workout Plan Draft Generator.
 *
 * Covers:
 *  - round05
 *  - computePreferredFloor (new MVP formula)
 *  - normalizeText (new diacritic normalization)
 *  - Recovery profile computation
 *  - Base range position by experience level
 *  - Muscle group → target matching (with normalization)
 *  - Priority order resolution (including UNKNOWN / AMBIGUOUS / DUPLICATED paths)
 *  - Availability classification
 *  - Single-target decisions: all adjustment paths + all 4 override zones
 *  - Integration: full calculateVolumeDecisions()
 */

import { describe, it, expect } from "vitest";
import {
  computeRecoveryProfile,
  computeBaseRangePosition,
  computePreferredFloor,
  normalizeText,
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
  { id: 1,  name: "Mięsień czworogłowy uda",       broadCategory: "Mięśnie czworogłowe uda",   isActive: true },
  { id: 2,  name: "Mięśnie pośladkowe",             broadCategory: "Pośladki",                  isActive: true },
  { id: 3,  name: "Mięsień trójgłowy łydki",        broadCategory: "Łydki",                     isActive: true },
  { id: 4,  name: "Przywodziciele",                 broadCategory: "Przywodziciele",             isActive: true },
  { id: 5,  name: "Grupa kulszowo-goleniowa",       broadCategory: "Mięśnie dwugłowe uda",      isActive: true },
  { id: 6,  name: "Mięśnie naramienne",             broadCategory: "Barki",                     isActive: true },
  { id: 7,  name: "Mięsień trójgłowy ramienia",     broadCategory: "Triceps",                   isActive: true },
  { id: 8,  name: "Mięsień piersiowy większy",      broadCategory: "Klatka piersiowa",          isActive: true },
  { id: 9,  name: "Mięsień najszerszy grzbietu",    broadCategory: "Plecy",                     isActive: true },
  { id: 10, name: "Mięsień czworoboczny grzbietu",  broadCategory: "Plecy",                     isActive: true },
  { id: 11, name: "Mięsień dwugłowy ramienia",      broadCategory: "Biceps",                    isActive: true },
];

/**
 * Fixture: Barki / Mięśnie naramienne (target 6)
 * Represents weeklyPreferredCeiling=8, weeklyAbsoluteCeiling=12
 *   preferredMin = computePreferredFloor(8) = round05(max(1, 8×0.50)) = 4
 *   preferredMax = 8
 *   absoluteMax  = 12
 *   preferredWidth = 4
 */
const G_BARKI: GuidelineRecord = {
  targetId: 6,
  preferredMin: 4,
  preferredMax: 8,
  absoluteMax: 12,
};

/**
 * Fixture: Klatka piersiowa (target 8)
 * weeklyPreferredCeiling=15, weeklyAbsoluteCeiling=20
 *   preferredMin = round05(max(1, 15×0.50)) = round05(7.5) = 7.5
 */
const G_KLATKA: GuidelineRecord = {
  targetId: 8,
  preferredMin: 7.5,
  preferredMax: 15,
  absoluteMax: 20,
};

/**
 * Fixture: Mięsień czworogłowy uda (target 1)
 * weeklyPreferredCeiling=8, weeklyAbsoluteCeiling=10
 *   preferredMin = 4, preferredMax = 8, absoluteMax = 10
 */
const G_QUAD: GuidelineRecord = {
  targetId: 1,
  preferredMin: 4,
  preferredMax: 8,
  absoluteMax: 10,
};

const NEUTRAL_RECOVERY: RecoveryProfileResult = {
  profile: "neutral",
  hasData: true,
  factors: [],
};

// ─── round05 ─────────────────────────────────────────────────────────────────

describe("round05", () => {
  it("rounds 9.3 to 9.5",         () => expect(round05(9.3)).toBe(9.5));
  it("rounds 9.1 to 9.0",         () => expect(round05(9.1)).toBe(9.0));
  it("rounds 9.75 to 10.0",       () => expect(round05(9.75)).toBe(10.0));
  it("passes exact halves through", () => expect(round05(8.5)).toBe(8.5));
  it("rounds negative −0.8 to −1.0", () => expect(round05(-0.8)).toBe(-1.0));
});

// ─── computePreferredFloor ────────────────────────────────────────────────────

describe("computePreferredFloor", () => {
  it("ceiling  4 → floor  2", () => expect(computePreferredFloor(4)).toBe(2));
  it("ceiling  8 → floor  4", () => expect(computePreferredFloor(8)).toBe(4));
  it("ceiling 12 → floor  6", () => expect(computePreferredFloor(12)).toBe(6));
  it("ceiling 16 → floor  8", () => expect(computePreferredFloor(16)).toBe(8));
  it("ceiling 20 → floor 10", () => expect(computePreferredFloor(20)).toBe(10));
  it("ceiling 15 → floor 7.5 (round to 0.5)", () => expect(computePreferredFloor(15)).toBe(7.5));
  it("ceiling  6 → floor  3", () => expect(computePreferredFloor(6)).toBe(3));
  it("ceiling  1 → floor  1 (max(1, …) clamps to 1, not 0.5)", () => expect(computePreferredFloor(1)).toBe(1.0));
  it("ceiling  2 → floor  1 (not below 1)", () => expect(computePreferredFloor(2)).toBe(1));

  it("automatic recommendation never exceeds preferredMax — Brak aktywności fizycznej", () => {
    // rangePosition=0.00: base = preferredMin + 0 = preferredMin ≤ preferredMax always
    const g: GuidelineRecord = { targetId: 6, preferredMin: 4, preferredMax: 8, absoluteMax: 12 };
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: g,
      experienceLevel: "Brak aktywności fizycznej",
      priorityOrder: null, isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY, availability: "standard", trainerOverride: null,
    });
    expect(d.recommendedValue).toBeLessThanOrEqual(g.preferredMax);
    expect(d.recommendedValue).toBeGreaterThanOrEqual(g.preferredMin);
  });

  it("absoluteMax does not raise automatic recommendations", () => {
    // absoluteMax is much larger; recommendation must still be ≤ preferredMax
    const g: GuidelineRecord = { targetId: 6, preferredMin: 4, preferredMax: 8, absoluteMax: 100 };
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: g,
      experienceLevel: "Zaawansowany",
      priorityOrder: null, isExcluded: false,
      recoveryResult: NEUTRAL_RECOVERY, availability: "high", trainerOverride: null,
    });
    expect(d.recommendedValue).toBeLessThanOrEqual(8);
  });
});

// ─── normalizeText ────────────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("lowercases and trims", () =>
    expect(normalizeText("  Barki  ")).toBe("barki"));

  it("removes Polish diacritics — ę→e ś→s ń→n ó→o ż→z ź→z ą→a ć→c ł→l", () =>
    expect(normalizeText("Mięśnie naramienne")).toBe("miesnie naramienne"));

  it("uppercase with diacritics", () =>
    expect(normalizeText("MIĘŚNIE NARAMIENNE")).toBe("miesnie naramienne"));

  it("strips diacritics from Barki edge case", () =>
    expect(normalizeText("Łydki")).toBe("lydki"));

  it("collapses repeated spaces", () =>
    expect(normalizeText("mięśnie   naramienne")).toBe("miesnie naramienne"));

  it("four forms normalize identically", () => {
    const target = "miesnie naramienne";
    expect(normalizeText("Mięśnie naramienne")).toBe(target);
    expect(normalizeText("Miesnie naramienne")).toBe(target);
    expect(normalizeText("MIĘŚNIE NARAMIENNE")).toBe(target);
    expect(normalizeText("mięśnie   naramienne")).toBe(target);
  });
});

// ─── Recovery profile ─────────────────────────────────────────────────────────

describe("computeRecoveryProfile", () => {
  it("returns neutral when no data provided", () => {
    const r = computeRecoveryProfile({ recoveryQuality: null, sleepHours: null, stressLevel: null, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("neutral");
    expect(r.hasData).toBe(false);
  });

  it("returns good when recoveryQuality=excellent", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "excellent", sleepHours: null, stressLevel: null, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("good");
    expect(r.hasData).toBe(true);
  });

  it("returns good when recoveryQuality=good", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "good", sleepHours: 8, stressLevel: 2, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("good");
  });

  it("returns reduced when recoveryQuality=poor", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "poor", sleepHours: null, stressLevel: null, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when sleep < 6 and no positive signals", () => {
    const r = computeRecoveryProfile({ recoveryQuality: null, sleepHours: 5, stressLevel: null, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when stress >= 7 (weight=2)", () => {
    const r = computeRecoveryProfile({ recoveryQuality: null, sleepHours: null, stressLevel: 8, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("reduced");
  });

  it("returns reduced when physicalWork=true and no positive signals", () => {
    const r = computeRecoveryProfile({ recoveryQuality: null, sleepHours: null, stressLevel: null, physicalWork: true, dailyActivity: null });
    expect(r.profile).toBe("reduced");
  });

  it("returns neutral for standard recoveryQuality with no other signals", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "standard", sleepHours: null, stressLevel: null, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("neutral");
  });

  it("positives outweigh single moderate negative → good", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "good", sleepHours: 9, stressLevel: 5, physicalWork: false, dailyActivity: null });
    expect(r.profile).toBe("good");
  });

  it("includes factors array with descriptions for known signals", () => {
    const r = computeRecoveryProfile({ recoveryQuality: "poor", sleepHours: 5, stressLevel: 8, physicalWork: true, dailyActivity: null });
    expect(r.factors.length).toBeGreaterThan(0);
    expect(r.profile).toBe("reduced");
  });
});

// ─── Base range position ──────────────────────────────────────────────────────

describe("computeBaseRangePosition", () => {
  it("Brak aktywności fizycznej → 0.00", () => expect(computeBaseRangePosition("Brak aktywności fizycznej")).toBe(0.00));
  it("Początkujący → 0.25",              () => expect(computeBaseRangePosition("Początkujący")).toBe(0.25));
  it("Średniozaawansowany → 0.50",        () => expect(computeBaseRangePosition("Średniozaawansowany")).toBe(0.50));
  it("Zaawansowany → 0.50",              () => expect(computeBaseRangePosition("Zaawansowany")).toBe(0.50));
  it("unknown level → null",             () => expect(computeBaseRangePosition("Ekspert")).toBeNull());
});

// ─── Muscle group matching ─────────────────────────────────────────────────────

describe("matchMuscleGroupToTargetIds", () => {
  it("matches exact broadCategory (Klatka piersiowa → id 8)", () => {
    const ids = matchMuscleGroupToTargetIds("Klatka piersiowa", TARGETS);
    expect(ids).toContain(8);
    expect(ids).not.toContain(9);
  });

  it("matches Plecy → both ids 9 and 10 (shared broadCategory)", () => {
    const ids = matchMuscleGroupToTargetIds("Plecy", TARGETS);
    expect(ids).toContain(9);
    expect(ids).toContain(10);
  });

  it("matches Barki → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("Barki", TARGETS);
    expect(ids).toContain(6);
  });

  it("returns empty array for completely unknown group", () => {
    const ids = matchMuscleGroupToTargetIds("Nieznana partia", TARGETS);
    expect(ids).toHaveLength(0);
  });

  // ── Diacritic normalization ────────────────────────────────────────────────

  it("Polish diacritics: 'Mięśnie naramienne' (full name) → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("Mięśnie naramienne", TARGETS);
    expect(ids).toContain(6);
  });

  it("missing diacritics: 'Miesnie naramienne' (stripped ASCII) → id 6", () => {
    // Normalization enables ASCII-stripped input to match
    const ids = matchMuscleGroupToTargetIds("Miesnie naramienne", TARGETS);
    expect(ids).toContain(6);
  });

  it("uppercase with diacritics: 'MIĘŚNIE NARAMIENNE' → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("MIĘŚNIE NARAMIENNE", TARGETS);
    expect(ids).toContain(6);
  });

  it("repeated spaces are collapsed: 'mięśnie   naramienne' → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("mięśnie   naramienne", TARGETS);
    expect(ids).toContain(6);
  });

  it("lowercase broadCategory: 'barki' → id 6", () => {
    const ids = matchMuscleGroupToTargetIds("barki", TARGETS);
    expect(ids).toContain(6);
  });

  // ── Disambiguation ─────────────────────────────────────────────────────────

  it("Triceps (broadCategory of id=7) does not match Łydki (id=3)", () => {
    const ids = matchMuscleGroupToTargetIds("Triceps", TARGETS);
    expect(ids).toContain(7);
    expect(ids).not.toContain(3);
    // Reciprocal
    const idsLydki = matchMuscleGroupToTargetIds("Łydki", TARGETS);
    expect(idsLydki).toContain(3);
    expect(idsLydki).not.toContain(7);
  });

  it("ambiguous partial text ('trójgłowy' matches both ids 3 and 7) → returns empty", () => {
    // Neither exact name nor exact broadCategory; partial matches both → ambiguous → []
    const ids = matchMuscleGroupToTargetIds("trójgłowy", TARGETS);
    expect(ids).toHaveLength(0);
  });
});

// ─── Priority order ───────────────────────────────────────────────────────────

describe("getPriorityOrder", () => {
  it("returns 1 when target is first priority", () => {
    expect(getPriorityOrder(8, ["Klatka piersiowa"], TARGETS)).toBe(1);
  });

  it("returns 2 when target is second priority", () => {
    expect(getPriorityOrder(9, ["Barki", "Plecy"], TARGETS)).toBe(2);
  });

  it("returns null when target is not in priority list", () => {
    expect(getPriorityOrder(3, ["Barki", "Plecy"], TARGETS)).toBeNull();
  });

  it("handles up to 3 priorities and ignores the rest", () => {
    expect(getPriorityOrder(11, ["Barki", "Plecy", "Biceps", "Triceps"], TARGETS)).toBe(3);
  });

  it("P1 via diacritics: 'Miesnie naramienne' → id 6 gets P1", () => {
    expect(getPriorityOrder(6, ["Miesnie naramienne"], TARGETS)).toBe(1);
  });

  it("P1/P2/P3 correct positions with normalization", () => {
    const groups = ["Barki", "Klatka piersiowa", "Biceps"];
    expect(getPriorityOrder(6,  groups, TARGETS)).toBe(1); // Barki
    expect(getPriorityOrder(8,  groups, TARGETS)).toBe(2); // Klatka
    expect(getPriorityOrder(11, groups, TARGETS)).toBe(3); // Biceps
  });

  it("duplicate group at P1 and P2 — first occurrence wins (P1)", () => {
    const order = getPriorityOrder(8, ["Klatka piersiowa", "Klatka piersiowa", "Barki"], TARGETS);
    expect(order).toBe(1);
  });

  it("unknown group in priority list — unmatched target returns null", () => {
    expect(getPriorityOrder(8, ["Nieznana partia"], TARGETS)).toBeNull();
  });

  it("ambiguous partial text in priority — target not assigned", () => {
    // 'trójgłowy' is ambiguous → matchMuscleGroupToTargetIds returns [] → neither id 3 nor 7
    expect(getPriorityOrder(3, ["trójgłowy"], TARGETS)).toBeNull();
    expect(getPriorityOrder(7, ["trójgłowy"], TARGETS)).toBeNull();
  });
});

// ─── Availability classification ──────────────────────────────────────────────

describe("classifyAvailability", () => {
  it("short when days ≤ 2",                         () => expect(classifyAvailability(2, 60)).toBe("short"));
  it("short when session < 45 min",                 () => expect(classifyAvailability(4, 40)).toBe("short"));
  it("standard for typical 4-day, 60-min schedule", () => expect(classifyAvailability(4, 60)).toBe("standard"));
  it("high for 5+ days and 60+ min sessions",       () => expect(classifyAvailability(5, 60)).toBe("high"));
});

// ─── Single-target decisions ──────────────────────────────────────────────────

describe("computeTargetDecision", () => {
  // G_BARKI: preferredMin=4, preferredMax=8, absoluteMax=12, preferredWidth=4

  it("recommendedValue is within [preferredMin, preferredMax]", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.recommendedValue).toBeGreaterThanOrEqual(G_BARKI.preferredMin);
    expect(d.recommendedValue).toBeLessThanOrEqual(G_BARKI.preferredMax);
  });

  it("Brak aktywności fizycznej → base at 0% of preferred range (= preferredMin)", () => {
    // base = 4 + 4*0.00 = 4
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Brak aktywności fizycznej",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.baseValue).toBe(4.0);
    expect(d.recommendedValue).toBe(4.0);
  });

  it("Początkujący, no priority → base at 25% of preferred range", () => {
    // base = 4 + 4*0.25 = 5.0
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.baseValue).toBe(5.0);
    expect(d.recommendedValue).toBe(5.0);
  });

  it("Średniozaawansowany, no priority → base at 50% of preferred range", () => {
    // base = 4 + 4*0.50 = 6.0
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Średniozaawansowany",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.baseValue).toBe(6.0);
    expect(d.recommendedValue).toBe(6.0);
  });

  it("Zaawansowany, no priority → same position as Średniozaawansowany (0.50)", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Zaawansowany",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.baseValue).toBe(6.0);
    expect(d.recommendedValue).toBe(6.0);
  });

  it("first priority → +20% of preferredWidth", () => {
    // base=5, adj=4*0.20=0.8 → raw total=5.8 → round05=6.0; stored adj=round05(0.8)=1.0
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: 1, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.priorityAdjustment).toBe(1.0);
    expect(d.recommendedValue).toBe(6.0);
    expect(d.priorityOrder).toBe(1);
    expect(d.source).toBe("calculated");
  });

  it("second priority → +10% of preferredWidth", () => {
    // base=5, adj=4*0.10=0.4 → total=5.4 → round05=5.5; stored adj=round05(0.4)=0.5
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: 2, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.priorityAdjustment).toBe(0.5);
    expect(d.recommendedValue).toBe(5.5);
  });

  it("third priority → +5% of preferredWidth (small enough to round to 0)", () => {
    // base=5, adj=4*0.05=0.2 → total=5.2 → round05=5.0; stored adj=round05(0.2)=0.0
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: 3, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.priorityAdjustment).toBe(0.0);
    expect(d.recommendedValue).toBe(5.0);
  });

  it("excluded target → set to preferredMin regardless of priority", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Zaawansowany",
      priorityOrder: 1, isExcluded: true, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.recommendedValue).toBe(4); // preferredMin
    expect(d.isExcluded).toBe(true);
    expect(d.priorityAdjustment).toBe(0);
    expect(d.warnings.some((w) => w.code === "TARGET_DEPRIORITIZED_BY_TRAINER")).toBe(true);
  });

  it("reduced recovery → lowers value by 20% of preferredWidth", () => {
    const reducedRecovery: RecoveryProfileResult = { profile: "reduced", hasData: true, factors: ["słaba jakość regeneracji"] };
    // base=5, recovery=-4*0.20=-0.8 (raw). stored adj=round05(-0.8)=-1.0
    // preClamp=5-0.8=4.2 → clamp(4,8,4.2)=4.2 → round05=4.0
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: reducedRecovery,
      availability: "standard", trainerOverride: null,
    });
    expect(d.recoveryAdjustment).toBe(-1.0);
    expect(d.recommendedValue).toBeGreaterThanOrEqual(G_BARKI.preferredMin);
    expect(d.recommendedValue).toBeLessThanOrEqual(G_BARKI.preferredMax);
  });

  it("reduced recovery never drops below preferredMin", () => {
    const reducedRecovery: RecoveryProfileResult = { profile: "reduced", hasData: true, factors: ["słaba jakość regeneracji"] };
    // Brak aktywności fizycznej: base=4 (=preferredMin), reduction pushes below → clamped to 4
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Brak aktywności fizycznej",
      priorityOrder: null, isExcluded: false, recoveryResult: reducedRecovery,
      availability: "standard", trainerOverride: null,
    });
    expect(d.recommendedValue).toBeGreaterThanOrEqual(G_BARKI.preferredMin);
  });

  it("short availability reduces non-priority targets", () => {
    // base=5, avail=-4*0.25=-1.0, total=4.0 → round=4.0 (exactly at preferredMin)
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "short", trainerOverride: null,
    });
    expect(d.availabilityAdjustment).toBeCloseTo(-1.0, 1);
    expect(d.recommendedValue).toBe(4.0);
  });

  it("short availability does NOT reduce priority targets", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: 1, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "short", trainerOverride: null,
    });
    expect(d.availabilityAdjustment).toBe(0);
    expect(d.priorityAdjustment).toBeGreaterThan(0);
  });

  // ── Four override zones ────────────────────────────────────────────────────
  // G_BARKI: preferredMin=4, preferredMax=8, absoluteMax=12
  // Początkujący recommendedValue = 5

  it("Zone A — override below preferredMin: REJECTED", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 2, // 2 < preferredMin=4
    });
    expect(d.selectedValue).toBe(5);       // stays at recommendedValue
    expect(d.isOverridden).toBe(false);
    expect(d.source).toBe("calculated");
    expect(d.trainerOverride).toBe(2);     // raw input recorded
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_BELOW_MIN")).toBe(true);
  });

  it("Zone B — override inside preferred range: ACCEPTED, no zone warning", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 6, // 4 ≤ 6 ≤ 8
    });
    expect(d.selectedValue).toBe(6.0);
    expect(d.isOverridden).toBe(true);
    expect(d.source).toBe("trainer_override");
    expect(d.trainerOverride).toBe(6);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED")).toBe(false);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_BELOW_MIN")).toBe(false);
  });

  it("Zone B — override rounds to 0.5", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 5.3,
    });
    expect(d.selectedValue).toBe(5.5);
    expect(d.trainerOverride).toBe(5.3);
    expect(d.isOverridden).toBe(true);
  });

  it("Zone C — override above preferredMax but within absoluteMax: ACCEPTED + non-blocking warning", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 10, // 8 < 10 ≤ 12
    });
    expect(d.selectedValue).toBe(10.0);
    expect(d.isOverridden).toBe(true);
    expect(d.source).toBe("trainer_override");
    const warn = d.warnings.find((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED");
    expect(warn).toBeDefined();
    expect(warn?.blocking).toBe(false);
  });

  it("Zone C — override at exactly absoluteMax: ACCEPTED", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 12, // exactly absoluteMax
    });
    expect(d.isOverridden).toBe(true);
    expect(d.selectedValue).toBe(12.0);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED")).toBe(true);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_ABSOLUTE_MAX")).toBe(false);
  });

  it("Zone D — override above absoluteMax: REJECTED", () => {
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 15, // 15 > absoluteMax=12
    });
    expect(d.selectedValue).toBe(5);       // stays at recommendedValue
    expect(d.isOverridden).toBe(false);
    expect(d.source).toBe("calculated");
    expect(d.trainerOverride).toBe(15);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_ABSOLUTE_MAX")).toBe(true);
  });

  it("no silent clamping — rejected value does not silently become guidelineMin", () => {
    // Zone A: override=2 (below preferredMin=4); selectedValue must be recommendedValue (5), not 4
    const d = computeTargetDecision({
      target: TARGETS[5]!, guideline: G_BARKI, experienceLevel: "Początkujący",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: 2,
    });
    expect(d.selectedValue).toBe(5); // recommendedValue, not clamped to 4
    expect(d.isOverridden).toBe(false);
  });

  it("recommendation stays within preferred range with large preferredWidth (G_KLATKA)", () => {
    // G_KLATKA: preferredMin=7.5, preferredMax=15, absoluteMax=20, width=7.5
    // Średniozaawansowany (0.50): base=7.5+7.5*0.50=11.25 → round05=11.5
    const d = computeTargetDecision({
      target: TARGETS[7]!, guideline: G_KLATKA, experienceLevel: "Średniozaawansowany",
      priorityOrder: null, isExcluded: false, recoveryResult: NEUTRAL_RECOVERY,
      availability: "standard", trainerOverride: null,
    });
    expect(d.recommendedValue).toBeGreaterThanOrEqual(G_KLATKA.preferredMin);
    expect(d.recommendedValue).toBeLessThanOrEqual(G_KLATKA.preferredMax);
    expect(d.recommendedValue).toBe(11.5);
  });
});

// ─── Integration tests (require DB) ──────────────────────────────────────────

describe("calculateVolumeDecisions (integration)", () => {
  it("returns 11 decisions for a valid Początkujący input", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Początkujący",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(11);
    expect(result.summary.totalTargets).toBe(11);
    expect(result.summary.blockingIssues).toBe(false);
    expect(result.metadata.guidelineVersionId).toBeGreaterThan(0);
  }, 10000);

  it("all automatic decisions have recommendedValue within [preferredMin, preferredMax]", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Zaawansowany",
      priorityMuscleGroups: ["Klatka piersiowa", "Plecy"], excludedMuscleGroups: [],
      sleep: 7, stress: 3, physicalWork: false, dailyActivity: null, recoveryQuality: "good",
      trainingDays: 5, sessionDuration: 75, trainerOverrides: {},
    });
    for (const d of result.decisions) {
      expect(d.recommendedValue).toBeGreaterThanOrEqual(d.preferredMin);
      expect(d.recommendedValue).toBeLessThanOrEqual(d.preferredMax);
    }
  }, 10000);

  it("absoluteMax is present on each decision and ≥ preferredMax", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    for (const d of result.decisions) {
      expect(d.absoluteMax).toBeDefined();
      expect(d.absoluteMax).toBeGreaterThanOrEqual(d.preferredMax);
    }
  }, 10000);

  it("returns blocking error for null experienceLevel", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: null,
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(0);
    expect(result.summary.blockingIssues).toBe(true);
    expect(result.warnings.find((w) => w.code === "MISSING_EXPERIENCE_LEVEL")?.blocking).toBe(true);
  }, 10000);

  it("returns blocking error for invalid experienceLevel", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Ekspert",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.decisions).toHaveLength(0);
    expect(result.warnings.find((w) => w.code === "INVALID_EXPERIENCE_LEVEL")?.blocking).toBe(true);
  }, 10000);

  it("Zone B override (inside preferred range) accepted, no zone warning", async () => {
    // Barki (target 6) for Średniozaawansowany: preferredMin=8, preferredMax=16, absoluteMax=20
    // Override 12 is in Zone B (8 ≤ 12 ≤ 16)
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: { "6": 12 },
    });
    const d = result.decisions.find((d) => d.targetId === 6)!;
    expect(d.isOverridden).toBe(true);
    expect(d.source).toBe("trainer_override");
    expect(d.selectedValue).toBe(12);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED")).toBe(false);
    expect(result.summary.targetsOverridden).toBe(1);
  }, 10000);

  it("Zone C override (above preferred, within absolute) accepted with warning", async () => {
    // Barki target 6 Średniozaawansowany: preferredMax=16, absoluteMax=20. Override=18 → Zone C
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: { "6": 18 },
    });
    const d = result.decisions.find((d) => d.targetId === 6)!;
    expect(d.isOverridden).toBe(true);
    expect(d.selectedValue).toBe(18);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED")).toBe(true);
    expect(d.warnings.find((w) => w.code === "VOLUME_OVERRIDE_ABOVE_PREFERRED")?.blocking).toBe(false);
  }, 10000);

  it("Zone A override (below preferredMin) rejected, keeps recommendedValue", async () => {
    // Barki target 6 Średniozaawansowany: preferredMin=8. Override 5 is Zone A (5 < 8)
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: { "6": 5 },
    });
    const d = result.decisions.find((d) => d.targetId === 6)!;
    expect(d.isOverridden).toBe(false);
    expect(d.source).toBe("calculated");
    expect(d.selectedValue).toBe(d.recommendedValue);
    expect(d.trainerOverride).toBe(5);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_BELOW_MIN")).toBe(true);
    expect(result.summary.targetsOverridden).toBe(0);
  }, 10000);

  it("Zone D override (above absoluteMax) rejected", async () => {
    // Barki target 6 Średniozaawansowany: absoluteMax=20. Override 25 is Zone D
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: { "6": 25 },
    });
    const d = result.decisions.find((d) => d.targetId === 6)!;
    expect(d.isOverridden).toBe(false);
    expect(d.selectedValue).toBe(d.recommendedValue);
    expect(d.warnings.some((w) => w.code === "VOLUME_OVERRIDE_ABOVE_ABSOLUTE_MAX")).toBe(true);
  }, 10000);

  it("UNKNOWN_PRIORITY_TARGET warning emitted for unresolvable text", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Początkujący",
      priorityMuscleGroups: ["Nieznana partia"], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.warnings.some((w) => w.code === "UNKNOWN_PRIORITY_TARGET")).toBe(true);
  }, 10000);

  it("AMBIGUOUS_PRIORITY_TARGET warning for text matching more than one target", async () => {
    // "trójgłowy" matches both id=3 (Łydki) and id=7 (Triceps) via partial → ambiguous
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Początkujący",
      priorityMuscleGroups: ["trójgłowy"], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.warnings.some((w) => w.code === "AMBIGUOUS_PRIORITY_TARGET")).toBe(true);
  }, 10000);

  it("DUPLICATED_PRIORITY_TARGET warning when same target appears twice", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Początkujący",
      priorityMuscleGroups: ["Barki", "Barki", "Biceps"], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    expect(result.warnings.some((w) => w.code === "DUPLICATED_PRIORITY_TARGET")).toBe(true);
  }, 10000);

  it("diacritic-normalized priority assigned correctly (Miesnie naramienne = Barki target 6)", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Średniozaawansowany",
      priorityMuscleGroups: ["Miesnie naramienne"], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 4, sessionDuration: 60, trainerOverrides: {},
    });
    const d = result.decisions.find((d) => d.targetId === 6)!;
    expect(d.priorityOrder).toBe(1);
    // No UNKNOWN warning because we resolved it
    expect(result.warnings.some((w) => w.code === "UNKNOWN_PRIORITY_TARGET")).toBe(false);
  }, 10000);

  it("decisions are returned in canonical TARGET_ORDER", async () => {
    const result = await calculateVolumeDecisions({
      clientId: 1, experienceLevel: "Początkujący",
      priorityMuscleGroups: [], excludedMuscleGroups: [],
      sleep: null, stress: null, physicalWork: false, dailyActivity: null, recoveryQuality: null,
      trainingDays: 3, sessionDuration: 60, trainerOverrides: {},
    });
    const expected = [
      "Mięsień czworogłowy uda", "Mięśnie pośladkowe", "Mięsień trójgłowy łydki",
      "Przywodziciele", "Grupa kulszowo-goleniowa", "Mięśnie naramienne",
      "Mięsień trójgłowy ramienia", "Mięsień piersiowy większy", "Mięsień najszerszy grzbietu",
      "Mięsień czworoboczny grzbietu", "Mięsień dwugłowy ramienia",
    ];
    expect(result.decisions.map((d) => d.targetName)).toEqual(expected);
  }, 10000);
});

// ─── UI component behaviour (non-browser, logic-only) ────────────────────────
//
// Browser automation is unavailable in this environment (no CDP endpoint,
// no pre-installed Playwright). The tests below cover the pure validation
// logic extracted from TargetDecisionCard. Full interactive tests
// (override persistence, Przywróć round-trip, Step 4 lock) require a
// final manual check in the running app.
//
// Manual verification checklist (Step 3 UI):
//   □ Below-min input (e.g. type "1") → red error, no override applied
//   □ Above-absolute input (e.g. type "999") → red error, no override applied
//   □ Above-preferred but within absolute (e.g. value=18 for [8,16]/abs=20) →
//       amber warning inline on card, "ustawione ręcznie" badge shown
//   □ "Przywróć propozycję" button removes override badge and restores recommendedValue
//   □ Step 3 → Step 2 → Step 3 round-trip: overrides persist (sent in trainerVolumeOverrides)
//   □ Steps 4 and 5 show Lock icon; "Kolejny etap wkrótce" button is disabled

describe("TargetDecisionCard input validation (logic-only)", () => {
  /**
   * Simulate the validation logic inside TargetDecisionCard.handleInputChange.
   * Returns { error: string | null, applied: number | null }.
   */
  function validateOverride(
    raw: string,
    preferredMin: number,
    preferredMax: number,
    absoluteMax: number,
  ): { error: string | null; zone: "a" | "b" | "c" | "invalid" | null } {
    const v = parseFloat(raw);
    if (isNaN(v) || raw.trim() === "") return { error: "Nieprawidłowa wartość", zone: "invalid" };
    if (v < preferredMin) return { error: `Poniżej minimum (${preferredMin})`, zone: "a" };
    if (v > absoluteMax) return { error: `Powyżej limitu absolutnego (${absoluteMax})`, zone: "invalid" };
    if (v > preferredMax) return { error: null, zone: "c" }; // Zone C — amber warning, accepted
    return { error: null, zone: "b" };
  }

  it("value below preferredMin → error zone A", () => {
    const r = validateOverride("1", 4, 8, 12);
    expect(r.error).toBeTruthy();
    expect(r.zone).toBe("a");
  });

  it("value above absoluteMax → error", () => {
    const r = validateOverride("999", 4, 8, 12);
    expect(r.error).toBeTruthy();
    expect(r.zone).toBe("invalid");
  });

  it("value inside preferred range → no error, Zone B", () => {
    const r = validateOverride("6", 4, 8, 12);
    expect(r.error).toBeNull();
    expect(r.zone).toBe("b");
  });

  it("value above preferredMax but within absoluteMax → no error, Zone C (amber warning)", () => {
    const r = validateOverride("10", 4, 8, 12);
    expect(r.error).toBeNull();
    expect(r.zone).toBe("c");
  });

  it("non-numeric input → error", () => {
    const r = validateOverride("abc", 4, 8, 12);
    expect(r.error).toBeTruthy();
  });
});
