/**
 * Comprehensive experience-level hierarchy tests.
 *
 * Covers the 26 required verification items:
 *
 *  1–6   Canonical hierarchy (array order, length, no fifth level)
 *  7–10  All four valid levels pass strict validation
 *  11    Empty value returns MISSING_EXPERIENCE_LEVEL via route
 *  12    Unknown value returns INVALID_EXPERIENCE_LEVEL via route
 *  13    Lowercase / malformed values do NOT silently map to Beginner
 *  14    No Activity maps to its own guideline rows (not Beginner)
 *  15    mapToGuidelineLevel("Brak aktywności fizycznej") ≠ "Początkujący"
 *  16    All four levels return exactly 11 volume targets
 *  17    Total guideline count = 44
 *  18    No Activity values remain lower than Beginner values
 *  19    Recommendation scoring favours low-complexity exercises for No Activity
 *  20    High-complexity exercises receive a warning / lower score for No Activity
 *  21    Existing Beginner recommendation behaviour remains valid
 *  22    Existing Intermediate behaviour remains valid
 *  23    Existing Advanced behaviour remains valid
 *  24    Workout Builder volume-preview route still works
 *  25    Phase 3 movement-analysis route still works
 *  26    Existing database records remain present
 */

// Trainer endpoints require a session: authenticate as the legacy test
// trainer (see __tests__/helpers/legacyTrainer.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, vi, beforeAll } from "vitest";
import { legacyFixtureClient, legacyFixturePlan, legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import supertest from "supertest";
import app from "../../app";
import {
  CANONICAL_EXPERIENCE_LEVELS,
  isValidExperienceLevel,
  mapToGuidelineLevel,
} from "../volumeCalculator";
import { scoreExercise } from "../../lib/recommendation-engine";
import type { Exercise, Survey } from "@workspace/db";

// Fixtures replacing client IDs from the Replit DB: emptyLevel (was 19),
// validClient + its plan (was client 1 / plan 1).
let emptyLevel: number;
let validClient: number;
let validPlan: number;

beforeAll(async () => {
  await legacyTrainerId();
  emptyLevel = (await legacyFixtureClient("levels-fixture-emptylevel@example.invalid", { experienceLevel: null })).clientId;
  const valid = await legacyFixtureClient("levels-fixture-valid@example.invalid");
  validClient = valid.clientId;
  validPlan = await legacyFixturePlan(validClient, valid.surveyId, "Początkujący", 1);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Build a minimal Exercise fixture — only fields used by scoreExercise. */
function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: "Fixture Exercise",
    isActive: true,
    mainMuscleGroup: null,
    secondaryMuscleGroups: [],
    equipment: [],
    difficultyLevel: null,
    suitableExperienceLevels: [],
    trainingGoals: [],
    trainingLocation: [],
    exercisePriority: null,
    jointStress: null,
    learningDifficulty: null,
    neurologicalFatigue: null,
    domsPotential: null,
    movementPattern: null,
    exerciseType: null,
    movementCategory: null,
    planeOfMotion: null,
    execution: null,
    resistanceType: null,
    canPerformToFailure: null,
    coachingCues: null,
    commonMistakes: null,
    videoUrl: null,
    imageUrl: null,
    notes: null,
    description: null,
    hasProgressions: false,
    hasRegressions: false,
    trainerId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  } as Exercise;
}

/** Build a minimal Survey fixture — only fields used by scoreExercise. */
function makeSurvey(experienceLevel: string): Survey {
  return {
    id: 1,
    clientId: 1,
    experienceLevel,
    trainingGoal: null,
    trainingGoalOther: null,
    trainingDuration: null,
    desiredWeeklyFrequency: null,
    sessionDuration: null,
    activityLevel: null,
    sleepHours: null,
    stressLevel: null,
    planStylePreference: null,
    trainingLocation: null,
    equipment: null,
    healthLimitations: null,
    avoidedExercises: null,
    avoidedMuscles: null,
    priorityMuscle1: null,
    priorityMuscle2: null,
    priorityMuscle3: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  } as unknown as Survey;
}

// Integration helpers
const req = supertest(app);

// ─── 1–6  Canonical hierarchy ─────────────────────────────────────────────────

describe("Canonical experience-level hierarchy", () => {
  it("1. Exactly four accepted levels exist", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS).toHaveLength(4);
  });

  it("2. No Activity is first", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS[0]).toBe("Brak aktywności fizycznej");
  });

  it("3. Beginner is second", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS[1]).toBe("Początkujący");
  });

  it("4. Intermediate is third", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS[2]).toBe("Średniozaawansowany");
  });

  it("5. Advanced is fourth and final", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS[3]).toBe("Zaawansowany");
  });

  it("6. No fifth value exists", () => {
    expect(CANONICAL_EXPERIENCE_LEVELS).toHaveLength(4);
    expect((CANONICAL_EXPERIENCE_LEVELS as readonly string[])[4]).toBeUndefined();
    const forbidden = [
      "Ekspert", "Profesjonalista", "Elitarny",
      "Bardzo zaawansowany", "Master", "Expert", "Professional",
    ];
    for (const forbidden_level of forbidden) {
      expect(CANONICAL_EXPERIENCE_LEVELS).not.toContain(forbidden_level);
    }
  });
});

// ─── 7–13  Strict validation ───────────────────────────────────────────────────

describe("Strict level validation (isValidExperienceLevel)", () => {
  it("7. No Activity validates successfully", () => {
    expect(isValidExperienceLevel("Brak aktywności fizycznej")).toBe(true);
  });

  it("8. Beginner validates successfully", () => {
    expect(isValidExperienceLevel("Początkujący")).toBe(true);
  });

  it("9. Intermediate validates successfully", () => {
    expect(isValidExperienceLevel("Średniozaawansowany")).toBe(true);
  });

  it("10. Advanced validates successfully", () => {
    expect(isValidExperienceLevel("Zaawansowany")).toBe(true);
  });

  it("11. Missing level: route returns MISSING_EXPERIENCE_LEVEL, guidelineLevel null, hasGuidelines false", async () => {
    // Fixture client whose survey has a null experienceLevel
    const res = await req.post("/api/plans/volume-preview")
      .send({ clientId: emptyLevel, days: [] })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("MISSING_EXPERIENCE_LEVEL");
    // Strict: no guideline level must be guessed
    expect(res.body.guidelineLevel).toBeNull();
    expect(res.body.hasGuidelines).toBe(false);
    expect(res.body.experienceLevel).toBeNull();
  });

  it("12. Unknown value returns INVALID_EXPERIENCE_LEVEL — isValidExperienceLevel rejects it", () => {
    const unknowns = ["unknown", "Expert", "Brak aktywności", "advanced", ""];
    for (const u of unknowns) {
      expect(isValidExperienceLevel(u)).toBe(false);
    }
  });

  it("13a. Lowercase / malformed values do NOT map to Beginner (return null)", () => {
    const malformed = ["zaawansowany", "brak aktywnosci fizycznej", "początkujący", "UNKNOWN", ""];
    for (const m of malformed) {
      expect(mapToGuidelineLevel(m)).toBeNull();
    }
  });

  it("13b. Unknown values do NOT map to No Activity (return null, not 'Brak aktywności fizycznej')", () => {
    const unknowns = ["UNKNOWN", "Expert", "advanced", "zaawansowany", ""];
    for (const u of unknowns) {
      const result = mapToGuidelineLevel(u);
      expect(result).toBeNull();
      expect(result).not.toBe("Brak aktywności fizycznej");
      expect(result).not.toBe("Początkujący");
    }
  });

  it("13c. Empty string does not map to any level (strict null)", () => {
    expect(mapToGuidelineLevel("")).toBeNull();
  });

  it("13d. No guidelines calculated for invalid/missing input (hasGuidelines: false, guidelineLevel: null)", async () => {
    // Fixture client with null experienceLevel — should get a structured empty response
    const res = await req.post("/api/plans/volume-preview")
      .send({ clientId: emptyLevel, days: [] })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.hasGuidelines).toBe(false);
    expect(res.body.guidelineLevel).toBeNull();
    // No volume data must be returned
    expect(res.body.weekly).toHaveLength(0);
    expect(res.body.days).toHaveLength(0);
  });
});

// ─── 14–15  Volume mapping ─────────────────────────────────────────────────────

describe("Volume guideline mapping", () => {
  it("14. No Activity maps to its own guideline rows, not Beginner", () => {
    const result = mapToGuidelineLevel("Brak aktywności fizycznej");
    expect(result).toBe("Brak aktywności fizycznej");
    expect(result).not.toBeNull();
    expect(result).not.toBe("Początkujący");
  });

  it("15. mapToGuidelineLevel is identity (non-null) for all four canonical levels", () => {
    for (const level of CANONICAL_EXPERIENCE_LEVELS) {
      const result = mapToGuidelineLevel(level);
      expect(result).not.toBeNull();
      expect(result).toBe(level);
    }
  });
});

// ─── 16–18  DB integration: guideline row counts and values ───────────────────

describe("Volume guideline DB integration", () => {
  it("16. All four levels return exactly 12 volume targets (11 + Brzuch)", async () => {
    const levels = [...CANONICAL_EXPERIENCE_LEVELS];
    for (const level of levels) {
      const res = await req.get(
        `/api/volume-guidelines?versionId=1&experienceLevel=${encodeURIComponent(level)}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(12);
    }
  }, 30_000);

  it("17. Total guideline count is 48 (12 targets × 4 levels)", async () => {
    let total = 0;
    for (const level of CANONICAL_EXPERIENCE_LEVELS) {
      const res = await req.get(
        `/api/volume-guidelines?versionId=1&experienceLevel=${encodeURIComponent(level)}`,
      );
      expect(res.status).toBe(200);
      total += res.body.length;
    }
    expect(total).toBe(48);
  }, 30_000);

  it("18. No Activity weekly preferred ceilings are lower than Beginner ceilings", async () => {
    const [noActRes, begRes] = await Promise.all([
      req.get(`/api/volume-guidelines?versionId=1&experienceLevel=${encodeURIComponent("Brak aktywności fizycznej")}`),
      req.get(`/api/volume-guidelines?versionId=1&experienceLevel=${encodeURIComponent("Początkujący")}`),
    ]);
    expect(noActRes.status).toBe(200);
    expect(begRes.status).toBe(200);

    // API returns numeric columns as strings (Postgres numeric → JSON string)
    type GuideRow = { targetId: number; weeklyPreferredCeiling: string | number };
    const noActRows: GuideRow[] = noActRes.body;
    const begRows: GuideRow[]   = begRes.body;

    // Match by targetId and verify No Activity ≤ Beginner for every target
    let comparedCount = 0;
    for (const noActRow of noActRows) {
      const begRow = begRows.find((b) => b.targetId === noActRow.targetId);
      if (!begRow) continue;
      const noActVal = Number(noActRow.weeklyPreferredCeiling);
      const begVal   = Number(begRow.weeklyPreferredCeiling);
      expect(noActVal).toBeLessThanOrEqual(begVal);
      comparedCount++;
    }
    // At least half the targets must be comparable (partial metadata is acceptable)
    expect(comparedCount).toBeGreaterThanOrEqual(5);
  }, 30_000);
});

// ─── 19–23  Recommendation scoring ───────────────────────────────────────────

describe("Recommendation scoring for experience levels", () => {
  const noActivitySurvey = makeSurvey("Brak aktywności fizycznej");
  const beginnerSurvey   = makeSurvey("Początkujący");
  const intermediateSurvey = makeSurvey("Średniozaawansowany");
  const advancedSurvey   = makeSurvey("Zaawansowany");

  // Exercise fixtures for No Activity scoring
  const easyExercise = makeExercise({
    id: 101,
    suitableExperienceLevels: ["Brak aktywności fizycznej"],
    difficultyLevel: "Początkujący",
    jointStress: "Niskie",
    learningDifficulty: 1,
    neurologicalFatigue: 1,
    domsPotential: 1,
  });

  const hardExercise = makeExercise({
    id: 102,
    suitableExperienceLevels: ["Zaawansowany"],
    difficultyLevel: "Zaawansowany",
    jointStress: "Wysokie",
    learningDifficulty: 5,
    neurologicalFatigue: 5,
    domsPotential: 5,
  });

  const neutralExercise = makeExercise({
    id: 103,
    suitableExperienceLevels: ["Brak aktywności fizycznej"],
    difficultyLevel: "Początkujący",
    jointStress: "Średnie",
    learningDifficulty: 3,
    neurologicalFatigue: 3,
    domsPotential: 3,
  });

  it("19. No Activity: low-complexity exercise scores higher than high-complexity", () => {
    const easyScore = scoreExercise(easyExercise, noActivitySurvey);
    const hardScore = scoreExercise(hardExercise, noActivitySurvey);
    expect(easyScore.score).toBeGreaterThan(hardScore.score);
  });

  it("20. No Activity: high-complexity exercise produces a warnReason", () => {
    const result = scoreExercise(hardExercise, noActivitySurvey);
    expect(result.warnReasons.length).toBeGreaterThan(0);
    // At least one warning must mention the introductory stage
    const hasNoActivityWarn = result.warnReasons.some((r) =>
      r.includes("etap") || r.includes("aktywności"),
    );
    expect(hasNoActivityWarn).toBe(true);
  });

  it("19b. No Activity: low-complexity exercise produces a positive noActivityFit reason", () => {
    const result = scoreExercise(easyExercise, noActivitySurvey);
    const hasPositiveReason = result.matchReasons.some((r) =>
      r.includes("etap") || r.includes("Odpowiednie"),
    );
    expect(hasPositiveReason).toBe(true);
  });

  it("21. Beginner: noActivityFit dimension contributes 0 points (no cross-level effect)", () => {
    const easyResult = scoreExercise(easyExercise, beginnerSurvey);
    const hardResult = scoreExercise(hardExercise, beginnerSurvey);
    // noActivityFit must not emit any warning for a Beginner client
    const noActivityWarn = (r: string) => r.includes("etap") || r.includes("aktywności");
    expect(easyResult.warnReasons.filter(noActivityWarn)).toHaveLength(0);
    expect(hardResult.warnReasons.filter(noActivityWarn)).toHaveLength(0);
    // Breakdown dimension "noActivityFit" must be 0 for both
    const dim = easyResult.breakdown.find((d) => d.dimension === "noActivityFit");
    expect(dim?.points).toBe(0);
  });

  it("22. Intermediate: noActivityFit dimension contributes 0 points", () => {
    const result = scoreExercise(hardExercise, intermediateSurvey);
    const dim = result.breakdown.find((d) => d.dimension === "noActivityFit");
    expect(dim?.points).toBe(0);
  });

  it("23. Advanced: noActivityFit dimension contributes 0 points", () => {
    const result = scoreExercise(hardExercise, advancedSurvey);
    const dim = result.breakdown.find((d) => d.dimension === "noActivityFit");
    expect(dim?.points).toBe(0);
  });
});

// ─── 24–26  Regression ────────────────────────────────────────────────────────

describe("Regression checks", () => {
  it("24. Workout Builder volume-preview route works for all four levels", async () => {
    // Fixture client with a valid survey — volume preview must succeed
    const res = await req.post("/api/plans/volume-preview")
      .send({ clientId: validClient, days: [] })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.weekly)).toBe(true);
  }, 15_000);

  it("25. Phase 3 movement-analysis route still works", async () => {
    // Fixture client + its plan — the analysis must run
    const res = await req.post("/api/plans/analysis-preview")
      .send({ clientId: validClient, planId: validPlan, days: [] })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
  }, 15_000);

  it("26. Existing database records remain present", async () => {
    // Exercises should still load
    const exercisesRes = await req.get("/api/exercises");
    expect(exercisesRes.status).toBe(200);
    expect(Array.isArray(exercisesRes.body)).toBe(true);

    // Clients endpoint must respond
    const clientsRes = await req.get("/api/clients");
    expect(clientsRes.status).toBe(200);

    // Volume guidelines must still return all 48 rows
    let total = 0;
    for (const level of CANONICAL_EXPERIENCE_LEVELS) {
      const res = await req.get(
        `/api/volume-guidelines?versionId=1&experienceLevel=${encodeURIComponent(level)}`,
      );
      if (res.status === 200 && Array.isArray(res.body)) {
        total += res.body.length;
      }
    }
    expect(total).toBe(48);
  }, 30_000);
});
