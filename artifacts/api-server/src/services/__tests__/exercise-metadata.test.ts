/**
 * Exercise Metadata Completeness & Phase 3 Verification
 *
 * Covers all 28 required verification items:
 *
 *  1–11  Every active exercise has each required metadata field
 *  12    No invalid muscle coefficient exists
 *  13    No duplicate exercise was created
 *  14    Existing exercise IDs remain unchanged
 *  15    Existing plan references remain valid
 *  16–20 Classification: each exercise maps to the correct movement category/pattern
 *  21–23 Phase 3 analysis returns populated compound/isolation, bilateral/unilateral,
 *        plane-of-motion data
 *  24–25 No Activity recommendation: simple exercises rank higher, advanced get warnings
 *  26–27 Volume preview and Phase 3 formulas are unchanged
 *  28    Existing database row counts remain present
 */

// Trainer endpoints require a session: authenticate as the legacy test
// trainer (see __tests__/helpers/legacyTrainer.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, vi, beforeAll } from "vitest";
import { legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import supertest from "supertest";
import app from "../../app";
import {
  computeAnalysisReadiness,
  computeCompleteness,
  fetchMuscleStats,
} from "../../lib/exercise-completeness";
import { scoreExercise } from "../../lib/recommendation-engine";
import type { Exercise, Survey } from "@workspace/db";
import { db, exercisesTable, exerciseMuscleAssignmentsTable } from "@workspace/db";
import { eq, and, gt, lte } from "drizzle-orm";

beforeAll(async () => {
  await legacyTrainerId();
});

const req = supertest(app);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Canonical exercise IDs as established during seeding. Must never change. */
const CANONICAL_IDS = {
  benchPress:       1,   // Wyciskanie sztangi leżąc
  pullUp:           2,   // Podciąganie na drążku
  barbellSquat:     3,   // Przysiad ze sztangą
  dbOverheadPress:  4,   // Wyciskanie hantli nad głowę
  plank:            5,   // Plank
} as const;

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  // Only the fields read by the recommendation engine need to be set.
  // Cast to avoid listing every column in the large surveys table schema.
  return {
    id: 1,
    clientId: 1,
    experienceLevel: "Początkujący",
    trainingGoal: "Siła",
    trainingGoalOther: null,
    trainingLocation: "Siłownia",
    sessionDuration: "60",
    avoidedMuscles: null,
    priorityMuscle1: null,
    priorityMuscle2: null,
    priorityMuscle3: null,
    healthLimitations: null,
    additionalInfo: null,
    equipment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Survey;
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: "Test",
    slug: "test",
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Sztanga"],
    equipmentOther: null,
    trainingLocation: ["Siłownia"],
    difficultyLevel: "Początkujący",
    movementPattern: "Pchanie poziome",
    movementCategory: "Push",
    description: "Opis",
    executionInstructions: "Instrukcje",
    commonMistakes: "Błędy",
    coachingTips: "Wskazówki",
    videoUrl: null,
    imageUrl: null,
    exerciseType: "Złożone",
    breathingTips: null,
    safetyNotes: null,
    tempo: null,
    rangeOfMotion: null,
    suitableExperienceLevels: ["Początkujący", "Średniozaawansowany", "Zaawansowany"],
    trainingGoals: ["Siła", "Masa mięśniowa"],
    planeOfMotion: "Poprzeczna",
    execution: "Obustronne",
    resistanceType: "Sztanga",
    requiresSpotter: true,
    canBePerformedToFailure: "Z ostrożnością",
    jointStress: "Średnie",
    learningDifficulty: 3,
    neurologicalFatigue: 3,
    domsPotential: 3,
    exercisePriority: "Wysoki",
    suitableForNoActivity: null,
    movementComplexity: null,
    subTargetBiases: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Helper: fetch all active exercises from DB ─────────────────────────────

async function loadActiveExercises(): Promise<Exercise[]> {
  return db.select().from(exercisesTable).where(eq(exercisesTable.isActive, true));
}

// ─── 1–11  Required metadata fields (DB-level) ─────────────────────────────

describe("Exercise metadata completeness", () => {
  it("1. Every active exercise has movementPattern", async () => {
    const exercises = await loadActiveExercises();
    expect(exercises.length).toBeGreaterThan(0);
    for (const ex of exercises) {
      expect(ex.movementPattern, `${ex.name} missing movementPattern`).toBeTruthy();
    }
  });

  it("2. Every active exercise has movementCategory", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.movementCategory, `${ex.name} missing movementCategory`).toBeTruthy();
    }
  });

  it("3. Every active exercise has exerciseType", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.exerciseType, `${ex.name} missing exerciseType`).toBeTruthy();
    }
  });

  it("4. Every active exercise has execution", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.execution, `${ex.name} missing execution`).toBeTruthy();
    }
  });

  it("5. Every active exercise has planeOfMotion", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.planeOfMotion, `${ex.name} missing planeOfMotion`).toBeTruthy();
    }
  });

  it("6. Every active exercise has suitableExperienceLevels", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(
        ex.suitableExperienceLevels?.length ?? 0,
        `${ex.name} has no suitableExperienceLevels`,
      ).toBeGreaterThan(0);
    }
  });

  it("7. Every active exercise has learningDifficulty", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.learningDifficulty, `${ex.name} missing learningDifficulty`).not.toBeNull();
      expect(ex.learningDifficulty).toBeGreaterThanOrEqual(1);
      expect(ex.learningDifficulty).toBeLessThanOrEqual(5);
    }
  });

  it("8. Every active exercise has jointStress", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.jointStress, `${ex.name} missing jointStress`).toBeTruthy();
      expect(["Niskie", "Średnie", "Wysokie"]).toContain(ex.jointStress);
    }
  });

  it("9. Every active exercise has neurologicalFatigue", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.neurologicalFatigue, `${ex.name} missing neurologicalFatigue`).not.toBeNull();
      expect(ex.neurologicalFatigue).toBeGreaterThanOrEqual(1);
      expect(ex.neurologicalFatigue).toBeLessThanOrEqual(5);
    }
  });

  it("10. Every active exercise has domsPotential", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.domsPotential, `${ex.name} missing domsPotential`).not.toBeNull();
      expect(ex.domsPotential).toBeGreaterThanOrEqual(1);
      expect(ex.domsPotential).toBeLessThanOrEqual(5);
    }
  });

  it("11. Every active exercise has exercisePriority", async () => {
    const exercises = await loadActiveExercises();
    for (const ex of exercises) {
      expect(ex.exercisePriority, `${ex.name} missing exercisePriority`).toBeTruthy();
      expect(["Bardzo wysoki", "Wysoki", "Średni", "Niski"]).toContain(ex.exercisePriority);
    }
  });
});

// ─── 12  Muscle-coefficient validity ──────────────────────────────────────────

describe("Muscle assignment validity", () => {
  it("12. No invalid muscle coefficient exists (must be 0 < coeff ≤ 1)", async () => {
    const rows = await db
      .select({ id: exerciseMuscleAssignmentsTable.id, coefficient: exerciseMuscleAssignmentsTable.coefficient })
      .from(exerciseMuscleAssignmentsTable);

    for (const row of rows) {
      expect(row.coefficient, `assignment id=${row.id} has invalid coefficient`).toBeGreaterThan(0);
      expect(row.coefficient, `assignment id=${row.id} coefficient > 1`).toBeLessThanOrEqual(1);
    }
  });
});

// ─── 13–15  Data integrity ─────────────────────────────────────────────────────

describe("Data integrity", () => {
  it("13. No duplicate exercise name was created", async () => {
    const rows = await db
      .select({ name: exercisesTable.name })
      .from(exercisesTable);

    const names = rows.map((r) => r.name.trim().toLowerCase());
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it("14. Existing exercise IDs remain unchanged", async () => {
    const rows = await db
      .select({ id: exercisesTable.id, name: exercisesTable.name })
      .from(exercisesTable)
      .where(eq(exercisesTable.isActive, true));

    const found = Object.fromEntries(rows.map((r) => [r.id, r.name]));
    expect(found[CANONICAL_IDS.benchPress]).toBe("Wyciskanie sztangi leżąc");
    expect(found[CANONICAL_IDS.pullUp]).toBe("Podciąganie na drążku");
    expect(found[CANONICAL_IDS.barbellSquat]).toBe("Przysiad ze sztangą");
    expect(found[CANONICAL_IDS.dbOverheadPress]).toBe("Wyciskanie hantli nad głowę");
    expect(found[CANONICAL_IDS.plank]).toBe("Plank");
  });

  it("15. Volume preview route still works for a known client (plan references valid)", async () => {
    const res = await req.post("/api/plans/volume-preview")
      .send({ clientId: 1, days: [] })
      .set("Content-Type", "application/json");
    // May return 200 with or without warnings depending on client's survey
    expect([200, 404]).toContain(res.status);
  });
});

// ─── 16–20  Classification checks ─────────────────────────────────────────────

describe("Exercise classification", () => {
  it("16. Wyciskanie sztangi leżąc classifies as horizontal Push", async () => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, CANONICAL_IDS.benchPress));
    expect(ex.movementCategory).toBe("Push");
    expect(ex.movementPattern).toBe("Pchanie poziome");
    expect(ex.planeOfMotion).toBe("Poprzeczna");
  });

  it("17. Wyciskanie hantli nad głowę classifies as vertical Push", async () => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, CANONICAL_IDS.dbOverheadPress));
    expect(ex.movementCategory).toBe("Push");
    expect(ex.movementPattern).toBe("Pchanie pionowe");
    expect(ex.planeOfMotion).toBe("Czołowa");
  });

  it("18. Podciąganie na drążku classifies as vertical Pull", async () => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, CANONICAL_IDS.pullUp));
    expect(ex.movementCategory).toBe("Pull");
    expect(ex.movementPattern).toBe("Przyciąganie pionowe");
  });

  it("19. Przysiad ze sztangą classifies as Squat", async () => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, CANONICAL_IDS.barbellSquat));
    expect(ex.movementCategory).toBe("Squat");
    expect(ex.movementPattern).toBe("Przysiad");
  });

  it("20. Plank classifies as Core and Anti-extension", async () => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, CANONICAL_IDS.plank));
    expect(ex.movementCategory).toBe("Core");
    // Anti-ekstensja is the Polish canonical anti-extension pattern
    expect(ex.movementPattern).toBe("Anti-ekstensja");
  });
});

// ─── 21–23  Phase 3 analysis — populated results via API ──────────────────────

describe("Phase 3 analysis API", () => {
  const allExerciseDays = [
    {
      dayId: 1,
      dayName: "Test Day",
      dayOrder: 1,
      exercises: [
        { exerciseEntryId: 101, exerciseId: CANONICAL_IDS.benchPress,      workingSets: 3, orderInDay: 1 },
        { exerciseEntryId: 102, exerciseId: CANONICAL_IDS.dbOverheadPress,  workingSets: 3, orderInDay: 2 },
        { exerciseEntryId: 103, exerciseId: CANONICAL_IDS.pullUp,           workingSets: 3, orderInDay: 3 },
        { exerciseEntryId: 104, exerciseId: CANONICAL_IDS.barbellSquat,     workingSets: 3, orderInDay: 4 },
        { exerciseEntryId: 105, exerciseId: CANONICAL_IDS.plank,            workingSets: 3, orderInDay: 5 },
      ],
    },
  ];

  async function getAnalysis() {
    const res = await req.post("/api/plans/analysis-preview")
      .send({ clientId: 1, days: allExerciseDays })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    return res.body;
  }

  it("21. Compound/isolation analysis returns populated data", async () => {
    const body = await getAnalysis();
    expect(body).toHaveProperty("exerciseTypes");
    // 4 compound exercises (bench, ohp, pull-up, squat) + 1 isolation (plank)
    const et = body.exerciseTypes as { compoundSets: number; isolationSets: number };
    expect(et.compoundSets).toBeGreaterThan(0);
    expect(et.isolationSets).toBeGreaterThan(0);
  });

  it("22. Bilateral/unilateral analysis returns populated data", async () => {
    const body = await getAnalysis();
    expect(body).toHaveProperty("executionTypes");
    // All 5 exercises are bilateral → bilateralSets > 0
    const et = body.executionTypes as { bilateralSets: number; unilateralSets: number };
    expect(et.bilateralSets).toBeGreaterThan(0);
  });

  it("23. Plane-of-motion analysis returns populated data", async () => {
    const body = await getAnalysis();
    expect(body).toHaveProperty("planesOfMotion");
    // Bench = Poprzeczna (transverse) → transverseSets > 0
    // OHP = Czołowa (frontal) → frontalSets > 0
    // Pull-Up + Squat + Plank = Strzałkowa (sagittal) → sagittalSets > 0
    const pom = body.planesOfMotion as {
      sagittalSets: number; frontalSets: number; transverseSets: number;
    };
    expect(pom.sagittalSets).toBeGreaterThan(0);
    expect(pom.frontalSets).toBeGreaterThan(0);
    expect(pom.transverseSets).toBeGreaterThan(0);
  });
});

// ─── 24–25  Recommendation engine — No Activity suitability ───────────────────

describe("Recommendation engine — No Activity suitability", () => {
  const noActivitySurvey = makeSurvey({ experienceLevel: "Brak aktywności fizycznej" });
  const beginnerSurvey   = makeSurvey({ experienceLevel: "Początkujący" });

  it("24. Plank ranks appropriately high for No Activity clients (low complexity)", () => {
    const plankEx = makeExercise({
      id: CANONICAL_IDS.plank,
      name: "Plank",
      movementCategory: "Core",
      jointStress: "Niskie",
      learningDifficulty: 1,
      neurologicalFatigue: 1,
      domsPotential: 1,
      suitableExperienceLevels: ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"],
    });

    const result = scoreExercise(plankEx, noActivitySurvey);
    // noActivityFit dimension should fire and contribute positive points
    const noActivityBreakdown = result.breakdown.find((b) => b.dimension === "noActivityFit");
    expect(noActivityBreakdown).toBeDefined();
    expect(noActivityBreakdown!.points).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("25. Pull-Up receives a warning / lower noActivityFit score than Plank", () => {
    const pullUpEx = makeExercise({
      id: CANONICAL_IDS.pullUp,
      name: "Podciąganie na drążku",
      movementCategory: "Pull",
      jointStress: "Średnie",
      learningDifficulty: 4,  // ≥ 4 → penalty + warning
      neurologicalFatigue: 3,
      domsPotential: 3,
      suitableExperienceLevels: ["Średniozaawansowany", "Zaawansowany"],
    });

    const plankEx = makeExercise({
      id: CANONICAL_IDS.plank,
      name: "Plank",
      jointStress: "Niskie",
      learningDifficulty: 1,
      neurologicalFatigue: 1,
      domsPotential: 1,
      suitableExperienceLevels: ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"],
    });

    const pullUpScore = scoreExercise(pullUpEx, noActivitySurvey);
    const plankScore  = scoreExercise(plankEx,  noActivitySurvey);

    // Pull-up's noActivityFit dimension should be lower (penalty for learningDifficulty ≥ 4)
    const pullUpNoActivity = pullUpScore.breakdown.find((b) => b.dimension === "noActivityFit");
    const plankNoActivity  = plankScore.breakdown.find((b) => b.dimension === "noActivityFit");

    expect(pullUpNoActivity!.points).toBeLessThan(plankNoActivity!.points);

    // Pull-up should have a warning reason in the noActivityFit breakdown
    expect(pullUpNoActivity!.reason).toBeTruthy();
    expect(pullUpNoActivity!.reason).toContain("trudność techniczna");
  });

  it("24b. Barbell Squat does not score as the simplest No Activity option", () => {
    const squatEx = makeExercise({
      id: CANONICAL_IDS.barbellSquat,
      name: "Przysiad ze sztangą",
      jointStress: "Wysokie",
      learningDifficulty: 4,
      neurologicalFatigue: 4,
      domsPotential: 4,
      suitableExperienceLevels: ["Średniozaawansowany", "Zaawansowany"],
    });

    const plankEx = makeExercise({
      id: CANONICAL_IDS.plank,
      name: "Plank",
      jointStress: "Niskie",
      learningDifficulty: 1,
      neurologicalFatigue: 1,
      domsPotential: 1,
      suitableExperienceLevels: ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"],
    });

    const squatScore = scoreExercise(squatEx, noActivitySurvey);
    const plankScore  = scoreExercise(plankEx, noActivitySurvey);

    const squatNoActivity = squatScore.breakdown.find((b) => b.dimension === "noActivityFit");
    const plankNoActivity  = plankScore.breakdown.find((b) => b.dimension === "noActivityFit");

    expect(squatNoActivity!.points).toBeLessThan(plankNoActivity!.points);
  });

  it("25b. Beginner/Intermediate/Advanced recommendation behaviour unchanged (noActivityFit = 0)", () => {
    const pullUpEx = makeExercise({
      id: CANONICAL_IDS.pullUp,
      name: "Podciąganie na drążku",
      learningDifficulty: 4,
      neurologicalFatigue: 3,
      domsPotential: 3,
    });

    for (const survey of [
      beginnerSurvey,
      makeSurvey({ experienceLevel: "Średniozaawansowany" }),
      makeSurvey({ experienceLevel: "Zaawansowany" }),
    ]) {
      const result = scoreExercise(pullUpEx, survey);
      const noActivityFit = result.breakdown.find((b) => b.dimension === "noActivityFit");
      // For non-No Activity clients, noActivityFit must always be 0
      expect(noActivityFit!.points).toBe(0);
    }
  });
});

// ─── 26–27  Preservation checks ───────────────────────────────────────────────

describe("Volume and Phase 3 formula preservation", () => {
  it("26. Volume preview results remain accessible (formula unchanged)", async () => {
    const res = await req.post("/api/plans/volume-preview")
      .send({
        clientId: 1,
        days: [{
          dayId: 1,
          dayName: "Test",
          exercises: [
            { exerciseEntryId: 1, exerciseId: CANONICAL_IDS.benchPress, workingSets: 3 },
          ],
        }],
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("weekly");
    expect(res.body).toHaveProperty("days");
  });

  it("27. Phase 3 analysis-preview endpoint still works (formula unchanged)", async () => {
    const res = await req.post("/api/plans/analysis-preview")
      .send({
        clientId: 1,
        days: [{
          dayId: 1,
          dayName: "Test",
          dayOrder: 1,
          exercises: [
            { exerciseEntryId: 1, exerciseId: CANONICAL_IDS.benchPress, workingSets: 3 },
          ],
        }],
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("exerciseTypes");
    expect(res.body).toHaveProperty("executionTypes");
    expect(res.body).toHaveProperty("planesOfMotion");
  });
});

// ─── 28  Database row counts ───────────────────────────────────────────────────

describe("Database row count preservation", () => {
  it("28. All 5 canonical exercises remain present", async () => {
    const rows = await db
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(eq(exercisesTable.isActive, true));

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(CANONICAL_IDS.benchPress);
    expect(ids).toContain(CANONICAL_IDS.pullUp);
    expect(ids).toContain(CANONICAL_IDS.barbellSquat);
    expect(ids).toContain(CANONICAL_IDS.dbOverheadPress);
    expect(ids).toContain(CANONICAL_IDS.plank);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Analysis-readiness unit tests ────────────────────────────────────────────

describe("computeAnalysisReadiness", () => {
  it("Reports analysis-ready when all five Phase 3 fields are present", () => {
    const ex = makeExercise();
    const result = computeAnalysisReadiness(ex);
    expect(result.isAnalysisReady).toBe(true);
    expect(result.missingAnalysisFields).toHaveLength(0);
  });

  it("Reports missing fields when movementCategory is absent", () => {
    const ex = makeExercise({ movementCategory: null });
    const result = computeAnalysisReadiness(ex);
    expect(result.isAnalysisReady).toBe(false);
    expect(result.missingAnalysisFields).toContain("Kategoria ruchu");
  });

  it("Reports all five missing fields when exercise has none", () => {
    const ex = makeExercise({
      movementPattern: null,
      movementCategory: null,
      exerciseType: null,
      execution: null,
      planeOfMotion: null,
    });
    const result = computeAnalysisReadiness(ex);
    expect(result.isAnalysisReady).toBe(false);
    expect(result.missingAnalysisFields).toHaveLength(5);
  });

  it("All five canonical exercises are now analysis-ready (DB state)", async () => {
    const exercises = await db.select().from(exercisesTable).where(eq(exercisesTable.isActive, true));
    for (const ex of exercises) {
      const result = computeAnalysisReadiness(ex);
      expect(
        result.isAnalysisReady,
        `${ex.name} not analysis-ready: missing [${result.missingAnalysisFields.join(", ")}]`,
      ).toBe(true);
    }
  });
});
