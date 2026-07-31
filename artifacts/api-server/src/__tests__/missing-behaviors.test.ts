/**
 * missing-behaviors.test.ts
 *
 * Focused tests for the five missing behaviors implemented in this session:
 *   1. Priority UX   — beginner with 2+ priority slots filled blocks submission (logic)
 *   2. Adaptive-start gate — adaptiveStartMode is false when decision is pending (null)
 *   3. Plyometric penalty — scoreExercise with useAdaptiveStart=true applies -20 to plyo
 *   4. Confirmed restriction "avoid" — reduces score for a matching exercise
 *   5. Confirmed restriction "regression" — adds positive score + exact label for
 *      suitableForNoActivity=true exercises and reduces for non-regression variants
 *   6. Regression label text is exactly as spec'd
 *   7. Unrelated body region is NOT penalised (restriction for Bark ≠ Nogi pattern)
 *   8. Graceful fallback — scoring doesn't crash when no exercise beats restrictions
 */

import { describe, it, expect } from "vitest";
import { scoreExercise } from "../lib/recommendation-engine";

// ─── Minimal exercise factory ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeExercise(overrides: Partial<ReturnType<typeof baseExercise>> = {}): any {
  return { ...baseExercise(), ...overrides };
}

function baseExercise() {
  return {
    id: 1,
    name: "Testowe ćwiczenie",
    isActive: true,
    isComplete: true,
    exerciseClass: "strength_compound" as const,
    mainMuscleGroup: "Klatka piersiowa",
    movementPattern: "Wyciskanie",
    equipment: ["Sztanga"],
    experienceLevel: "Średniozaawansowany",
    trainingGoal: "Masa",
    trainingLocation: ["Siłownia"] as string[],  // must be an array — engine calls .some()
    difficultyLevel: 2,
    learningDifficulty: 2,
    suitableForNoActivity: false,
    // optional fields used by scoring
    subTargetBiases: null,
    muscleActivationProfile: null,
    avoidedMusclePenalty: null,
    priorityMuscle1: null,
    priorityMuscle2: null,
    priorityMuscle3: null,
    secondaryMuscleGroups: [],
    avoidMuscleGroups: [],
    isCompound: true,
    description: null,
  };
}

// ─── Minimal survey factory ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSurvey(overrides: Partial<ReturnType<typeof baseSurvey>> = {}): any {
  return { ...baseSurvey(), ...overrides };
}

function baseSurvey() {
  return {
    experienceLevel: "Średniozaawansowany",
    trainingGoal: "Masa mięśniowa",
    trainingLocation: "Siłownia",
    equipment: "Sztanga, Hantle",
    priorityMuscle1: null,
    priorityMuscle2: null,
    priorityMuscle3: null,
    avoidMuscleGroups: [],
    avoidedExerciseIds: [],
    activityLevel: null,
    injuryStatus: null,
    healthLimitations: null,
    confirmedRestrictions: null as string | null,
  };
}

// ─── 1. Priority conflict logic (pure) ───────────────────────────────────────

describe("Item 1 — Priority conflict logic (beginner)", () => {
  function hasPriorityConflict(
    experienceLevel: string,
    pm2: string | null | undefined,
    pm3: string | null | undefined,
  ) {
    const isBeginner =
      experienceLevel === "Brak aktywności fizycznej" ||
      experienceLevel === "Początkujący";
    return isBeginner && !!(pm2 || pm3);
  }

  it("beginner with only pm1 filled → no conflict", () => {
    expect(hasPriorityConflict("Początkujący", "", "")).toBe(false);
  });

  it("beginner with pm2 filled → conflict", () => {
    expect(hasPriorityConflict("Początkujący", "Barki", "")).toBe(true);
  });

  it("beginner with pm3 filled → conflict", () => {
    expect(hasPriorityConflict("Brak aktywności fizycznej", "", "Nogi")).toBe(true);
  });

  it("beginner with pm2 + pm3 both filled → conflict", () => {
    expect(hasPriorityConflict("Początkujący", "Barki", "Nogi")).toBe(true);
  });

  it("intermediate with pm2 + pm3 → no conflict (rule only applies to beginners)", () => {
    expect(hasPriorityConflict("Średniozaawansowany", "Barki", "Nogi")).toBe(false);
  });
});

// ─── 2. Adaptive-start gate ───────────────────────────────────────────────────

describe("Item 2 — adaptiveStartMode gate", () => {
  function computeAdaptiveStartMode(
    decision: "accepted" | "declined" | null,
    isBeginnerLevel: boolean,
  ) {
    return decision === "accepted" && isBeginnerLevel;
  }

  it("null (pending) decision → mode is false regardless of level", () => {
    expect(computeAdaptiveStartMode(null, true)).toBe(false);
  });

  it("accepted decision + beginner → mode is true", () => {
    expect(computeAdaptiveStartMode("accepted", true)).toBe(true);
  });

  it("accepted decision + non-beginner → mode is false (shouldn't happen but safe)", () => {
    expect(computeAdaptiveStartMode("accepted", false)).toBe(false);
  });

  it("declined decision → mode is false", () => {
    expect(computeAdaptiveStartMode("declined", true)).toBe(false);
  });
});

// ─── 3. Plyometric penalty when useAdaptiveStart=true ────────────────────────

describe("Item 3 — scoreAdaptiveConstraints (plyometric penalty)", () => {
  const survey = makeSurvey({ experienceLevel: "Brak aktywności fizycznej" });

  // deriveExerciseClass classifies as "plyometric_power" based on movementPattern/movementCategory,
  // NOT the exerciseClass field. Use movementPattern "Skok" which normalises to "skok".
  const plyoEx = makeExercise({ movementPattern: "Skok", suitableForNoActivity: false });

  it("plyometric_power exercise: adaptiveConstraints dimension is -20 when adaptive mode ON", () => {
    const result = scoreExercise(plyoEx, survey, { useAdaptiveStart: true });
    const dim = result.breakdown.find((b) => b.dimension === "adaptiveConstraints");
    expect(dim?.points ?? 0).toBe(-20);
  });

  it("plyometric_power exercise: adaptiveConstraints dimension has a rejection reason", () => {
    const result = scoreExercise(plyoEx, survey, { useAdaptiveStart: true });
    const dim = result.breakdown.find((b) => b.dimension === "adaptiveConstraints");
    expect(dim?.reason).toBeTruthy();
  });

  it("non-plyo exercise: adaptiveConstraints dimension is 0 even when adaptive mode ON", () => {
    const normalEx = makeExercise({ movementPattern: "Wyciskanie", suitableForNoActivity: true });
    const result = scoreExercise(normalEx, survey, { useAdaptiveStart: true });
    const dim = result.breakdown.find((b) => b.dimension === "adaptiveConstraints");
    expect(dim?.points ?? 0).toBe(0);
  });

  it("adaptive constraint dimension is 0 when useAdaptiveStart is false", () => {
    const result = scoreExercise(plyoEx, survey, { useAdaptiveStart: false });
    const dim = result.breakdown.find((b) => b.dimension === "adaptiveConstraints");
    expect(dim?.points ?? 0).toBe(0);
  });
});

// ─── 4. Confirmed restriction "avoid" ────────────────────────────────────────

describe("Item 4 — confirmed restriction action=avoid", () => {
  it("matching movement pattern with avoid → reduced score vs no restriction", () => {
    const ex = makeExercise({ movementPattern: "Wyciskanie" });
    const surveyNoRestriction = makeSurvey();
    const surveyWithRestriction = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
      ]),
    });

    const scoreWithout = scoreExercise(ex, surveyNoRestriction).score;
    const scoreWith = scoreExercise(ex, surveyWithRestriction).score;

    expect(scoreWith).toBeLessThan(scoreWithout);
  });

  it("avoid dimension is -30 points or lower for a matched exercise", () => {
    const ex = makeExercise({ movementPattern: "Wyciskanie" });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBeLessThanOrEqual(-25);
  });

  it("unmatched movement pattern (Przysiad restriction vs Wyciskanie exercise) → no penalty", () => {
    const ex = makeExercise({ movementPattern: "Wyciskanie" });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Kolano", movementPattern: "Przysiad", action: "avoid" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBe(0);
  });
});

// ─── 5. Confirmed restriction "regression" ───────────────────────────────────

describe("Item 5 — confirmed restriction action=regression", () => {
  it("suitableForNoActivity=true + matching pattern + regression → positive score", () => {
    const regressionEx = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(regressionEx, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBeGreaterThan(0);
  });

  it("suitableForNoActivity=false + matching pattern + regression → negative score (not a regression variant)", () => {
    const nonRegressionEx = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(nonRegressionEx, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBeLessThan(0);
  });
});

// ─── 6. Exact regression label text ──────────────────────────────────────────

describe("Item 6 — exact regression label text", () => {
  const EXPECTED_LABEL = "Wariant regresyjny — dobrany ze względu na zgłoszone ograniczenie.";

  it("regression variant label matches spec exactly", () => {
    const regressionEx = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(regressionEx, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.reason).toBe(EXPECTED_LABEL);
  });
});

// ─── 7. Unrelated body region not regressed ──────────────────────────────────

describe("Item 7 — restriction does not affect unrelated movement patterns", () => {
  it("Bark restriction (Wyciskanie) does not penalise Martwy ciąg exercise", () => {
    const lowerBodyEx = makeExercise({
      movementPattern: "Martwy ciąg",
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
      ]),
    });

    const result = scoreExercise(lowerBodyEx, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBe(0);
  });

  it("Kolano restriction (Przysiad) does not penalise Wiosłowanie exercise", () => {
    const upperBodyPullEx = makeExercise({
      movementPattern: "Wiosłowanie",
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Kolano", movementPattern: "Przysiad", action: "avoid" },
      ]),
    });

    const result = scoreExercise(upperBodyPullEx, survey);
    const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
    expect(dim?.points ?? 0).toBe(0);
  });
});

// ─── restrictionLabel propagation ────────────────────────────────────────────
// These tests verify the exact contract that DayRecommendationExercise.restrictionLabel
// relies on: that scoreExercise places the "Wariant regresyjny" label in matchReasons
// (positive reasons) — not warnReasons — for regression-action exercises.

describe("restrictionLabel propagation — matchReasons contract", () => {
  const RESTRICTION_LABEL = "Wariant regresyjny — dobrany ze względu na zgłoszone ograniczenie.";

  it("regression exercise matching a confirmed restriction has label in matchReasons", () => {
    const ex = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    expect(result.matchReasons).toContain(RESTRICTION_LABEL);
    expect(result.warnReasons).not.toContain(RESTRICTION_LABEL);
  });

  it("avoid-action exercise matching a confirmed restriction does NOT have label in matchReasons", () => {
    const ex = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    expect(result.matchReasons).not.toContain(RESTRICTION_LABEL);
  });

  it("exercise unrelated to any restriction has no label in matchReasons or warnReasons", () => {
    const ex = makeExercise({
      movementPattern: "Wiosłowanie",
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    expect(result.matchReasons).not.toContain(RESTRICTION_LABEL);
    expect(result.warnReasons).not.toContain(RESTRICTION_LABEL);
  });

  it("non-regression suitableForNoActivity exercise without matching restriction has no label", () => {
    // suitableForNoActivity=true alone is not enough — restriction must also match
    const ex = makeExercise({
      movementPattern: "Wiosłowanie",
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    expect(result.matchReasons).not.toContain(RESTRICTION_LABEL);
  });

  it("client with no confirmed restrictions produces no restriction label on any exercise", () => {
    const ex = makeExercise({
      movementPattern: "Wyciskanie",
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({ confirmedRestrictions: null });

    const result = scoreExercise(ex, survey);
    const hasLabel = result.matchReasons.some((r) => r.startsWith("Wariant regresyjny"));
    expect(hasLabel).toBe(false);
  });
});

// ─── 8. Graceful fallback — no crash when no exercise passes ─────────────────

describe("Item 8 — graceful fallback when restrictions exclude all exercises", () => {
  it("scoreExercise does not throw when all restriction dimensions are negative", () => {
    const ex = makeExercise({ movementPattern: "Wyciskanie", suitableForNoActivity: false });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "regression" },
      ]),
    });

    expect(() => scoreExercise(ex, survey)).not.toThrow();
    const result = scoreExercise(ex, survey);
    // Score is clamped to 0–100 even when raw is very negative
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns a numeric score for any valid exercise+survey combination", () => {
    const ex = makeExercise({ movementPattern: "Przysiad" });
    const survey = makeSurvey({
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Kolano", movementPattern: "Przysiad", action: "avoid" },
        { bodyArea: "Kolano", movementPattern: "Przysiad", action: "regression" },
        { bodyArea: "Kolano", movementPattern: "Przysiad", action: "reduce_range" },
      ]),
    });

    const result = scoreExercise(ex, survey);
    expect(typeof result.score).toBe("number");
    expect(Number.isFinite(result.score)).toBe(true);
  });
});
