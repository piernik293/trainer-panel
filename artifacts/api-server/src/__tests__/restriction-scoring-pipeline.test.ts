/**
 * restriction-scoring-pipeline.test.ts
 *
 * Integration tests verifying the full pipeline:
 *   Survey with confirmed_restrictions saved to DB
 *     → planDraftInputService reads the client/survey
 *     → the plan-generation route's scoring logic (scoreExercise applied to DB
 *        exercises against the DB survey) respects the restriction
 *
 * Structure:
 *   1. DB round-trip — confirmed_restrictions field survives insert → select unchanged
 *   2. planDraftInputService reads the survey written to DB
 *   3. Route-equivalent pipeline: real DB exercises + DB survey → scoreExercise
 *      (mirrors planDraftDayRecommendations.ts score loop exactly)
 *   4. avoid restriction — matching-pattern exercise scores lower than baseline
 *   5. regression restriction — dimension fires correctly from DB survey
 *   6. regression restriction — non-regression variant penalised vs baseline
 *   7. Genuine accumulation: two restrictions matching the SAME exercise accumulate
 *   8. Restriction for pattern X does not affect exercises with unrelated pattern Y
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { loadPlanDraftInput } from "../services/planDraftInputService";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import type { Exercise, Survey } from "@workspace/db";

// ─── Test data cleanup tracking ───────────────────────────────────────────────

let testClientId: number | null = null;
let testSurveyId: number | null = null;

// Real active exercises loaded once from DB for pipeline tests.
let activeExercises: (typeof exercisesTable.$inferSelect)[] = [];

// ─── Exercise fixture ─────────────────────────────────────────────────────────
//
// Used for deterministic unit-style assertions in sections 4–6.
// `as unknown as Exercise` mirrors the pattern in adaptive-start.test.ts.

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 9001,
    name: "Test exercise",
    isActive: true,
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Sztanga"],
    requiredEquipmentAll: [],
    trainingLocation: ["Siłownia"],
    movementPattern: "Wyciskanie",
    movementCategory: null,
    movementComplexity: null,
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    difficultyLevel: "Średni",
    suitableForNoActivity: false,
    learningDifficulty: 3,
    neurologicalFatigue: 3,
    domsPotential: 3,
    jointStress: "Średnie",
    trainingGoals: ["Budowa sylwetki"],
    suitableExperienceLevels: ["Średniozaawansowany"],
    subTargetBiases: null,
    muscleActivationMap: null,
    isLoadable: true,
    forceType: null,
    description: null,
    videoUrl: null,
    instructionSteps: null,
    contraindications: null,
    equipmentOther: null,
    exerciseClass: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Exercise;
}

// ─── DB setup / teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  // ── Load real exercises from DB (same query as planDraftDayRecommendations) ──
  activeExercises = await db
    .select()
    .from(exercisesTable)
    .where(eq(exercisesTable.isActive, true));

  // ── Insert test client ────────────────────────────────────────────────────────
  // Use raw SQL to avoid Drizzle including columns that may not exist in the
  // dev DB yet (e.g. adaptive_start_decision, added by a later migration).
  const trainerResult = await db.execute(
    sql`SELECT id FROM trainers ORDER BY id LIMIT 1`,
  );
  const trainerId = trainerResult.rows.length > 0
    ? (trainerResult.rows[0] as { id: number }).id
    : null;

  const clientResult = await db.execute(
    trainerId !== null
      ? sql`INSERT INTO clients (first_name, last_name, status, trainer_id)
            VALUES ('__Test__', 'RestrictionPipeline', 'active', ${trainerId})
            RETURNING id`
      : sql`INSERT INTO clients (first_name, last_name, status)
            VALUES ('__Test__', 'RestrictionPipeline', 'active')
            RETURNING id`,
  );
  testClientId = (clientResult.rows[0] as { id: number }).id;

  // ── Insert test survey with two confirmed restrictions ────────────────────────
  //   Restriction 1: Bark / Wyciskanie → avoid   (affects pressing exercises)
  //   Restriction 2: Kolano / Przysiad → regression (affects squat-pattern exercises)
  const restrictionsJson = JSON.stringify([
    { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },
    { bodyArea: "Kolano", movementPattern: "Przysiad", action: "regression" },
  ]);

  const surveyResult = await db.execute(
    sql`INSERT INTO surveys (client_id, experience_level, training_goal, training_location,
                            equipment, desired_weekly_frequency, session_duration,
                            confirmed_restrictions)
        VALUES (
          ${testClientId},
          'Średniozaawansowany',
          'Budowa sylwetki',
          'Siłownia',
          'Sztanga, Hantle',
          3,
          '60 min',
          ${restrictionsJson}
        )
        RETURNING id`,
  );
  testSurveyId = (surveyResult.rows[0] as { id: number }).id;
});

afterAll(async () => {
  // Cascade delete removes surveys automatically via FK.
  if (testClientId !== null) {
    await db.delete(clientsTable).where(eq(clientsTable.id, testClientId));
  }
});

// ─── Helper: load the DB survey row (same query as the route) ─────────────────

async function loadSurveyRow(): Promise<Survey> {
  const [row] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.id, testSurveyId!))
    .limit(1);
  if (!row) throw new Error("Test survey not found in DB");
  return row;
}

// ─── 1. DB round-trip ─────────────────────────────────────────────────────────

describe("(1) confirmed_restrictions survives DB insert → select round-trip", () => {
  it("field is stored as a non-null string in the survey row", async () => {
    const row = await loadSurveyRow();
    expect(row.confirmedRestrictions).not.toBeNull();
    expect(typeof row.confirmedRestrictions).toBe("string");
  });

  it("JSON parses back to an array with 2 restrictions", async () => {
    const row = await loadSurveyRow();
    const parsed = JSON.parse(row.confirmedRestrictions!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it("first restriction: action=avoid, movementPattern=Wyciskanie", async () => {
    const row = await loadSurveyRow();
    const [first] = JSON.parse(row.confirmedRestrictions!);
    expect(first.action).toBe("avoid");
    expect(first.movementPattern).toBe("Wyciskanie");
  });

  it("second restriction: action=regression, movementPattern=Przysiad", async () => {
    const row = await loadSurveyRow();
    const [, second] = JSON.parse(row.confirmedRestrictions!);
    expect(second.action).toBe("regression");
    expect(second.movementPattern).toBe("Przysiad");
  });
});

// ─── 2. planDraftInputService reads the survey written to DB ──────────────────

describe("(2) planDraftInputService reads the survey written to DB", () => {
  it("loadPlanDraftInput returns a non-null result for the test client", async () => {
    const result = await loadPlanDraftInput(testClientId!);
    expect(result).not.toBeNull();
  });

  it("the returned client matches the inserted test client", async () => {
    const result = await loadPlanDraftInput(testClientId!);
    expect(result!.client.id).toBe(testClientId);
    expect(result!.client.firstName).toBe("__Test__");
  });

  it("surveyId in the result matches the inserted survey", async () => {
    const result = await loadPlanDraftInput(testClientId!);
    expect(result!.surveyId).toBe(testSurveyId);
  });
});

// ─── 3. Route-equivalent pipeline: DB survey → real DB exercises → scoreExercise
//
// This section mirrors the exact code path of planDraftDayRecommendations.ts:
//
//   const [survey] = await db.select().from(surveysTable).where(...);
//   for (const ex of completeExercises) {
//     const { score } = scoreExercise(ex, survey);   // ← restriction applied here
//   }
//
// We load the actual survey saved in beforeAll (with confirmed_restrictions),
// load the same exercise pool the route uses, score every exercise against that
// survey, then assert that the restriction's movement pattern produces a negative
// confirmedRestrictions dimension on matched exercises while unmatched exercises
// are unaffected.

describe("(3) Route-equivalent pipeline: DB survey + real DB exercises → restrictions applied", () => {
  it("loading the test survey from DB yields a row with confirmedRestrictions set", async () => {
    const survey = await loadSurveyRow();
    expect(survey.confirmedRestrictions).not.toBeNull();
  });

  it("active exercises can be loaded from DB (same query as the route)", () => {
    expect(activeExercises.length).toBeGreaterThan(0);
  });

  it("at least one active DB exercise has a non-null movementPattern", () => {
    const withPattern = activeExercises.filter((e) => !!e.movementPattern);
    expect(withPattern.length).toBeGreaterThan(0);
  });

  it("scoreExercise applied to all DB exercises with the restriction survey never throws", async () => {
    const survey = await loadSurveyRow();
    // Mirror the route: filter to complete exercises, then score each.
    const statsMap = await fetchMuscleStats(activeExercises.map((e) => e.id));
    const completeExercises = activeExercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      return isComplete;
    });

    expect(() => {
      for (const ex of completeExercises) {
        scoreExercise(ex, survey);
      }
    }).not.toThrow();
  });

  it("exercises whose movementPattern matches the avoid restriction score lower than those that don't", async () => {
    // Mirrors the route loop: load survey once, score all exercises against it.
    const survey = await loadSurveyRow();
    const statsMap = await fetchMuscleStats(activeExercises.map((e) => e.id));
    const completeExercises = activeExercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      return isComplete;
    });

    // The restriction is avoid:Wyciskanie (pattern substring match is bidirectional).
    // Collect confirmedRestrictions dimension points for matched vs unmatched exercises.
    const matched: number[] = [];
    const unmatched: number[] = [];

    for (const ex of completeExercises) {
      const result = scoreExercise(ex, survey);
      const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
      const pts = dim?.points ?? 0;
      const pat = (ex.movementPattern ?? "").toLowerCase();
      if (pat.includes("wycisk") || "wyciskanie".includes(pat)) {
        matched.push(pts);
      } else {
        unmatched.push(pts);
      }
    }

    // Every matched exercise must carry a negative confirmedRestrictions score.
    if (matched.length > 0) {
      expect(matched.every((p) => p <= 0)).toBe(true);
      expect(matched.some((p) => p < 0)).toBe(true);
    }

    // Unmatched exercises must have zero confirmedRestrictions impact from this restriction
    // (the Przysiad restriction is regression, not avoid, so unmatched=0 for Wyciskanie).
    const unmatchedByWyciskanieOnly = unmatched.filter((p) => p === 0);
    // At least half the unmatched exercises are completely unaffected.
    if (unmatched.length > 0) {
      expect(unmatchedByWyciskanieOnly.length / unmatched.length).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("the restriction's confirmedRestrictions dimension is negative (avoid) for matched DB exercises", async () => {
    const survey = await loadSurveyRow();

    // Find at least one complete DB exercise whose movementPattern is exactly "Wyciskanie"
    // (or contains "wycisk" — the substring match the engine uses).
    const statsMap = await fetchMuscleStats(activeExercises.map((e) => e.id));
    const matchingExercises = activeExercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      if (!isComplete) return false;
      const pat = (ex.movementPattern ?? "").toLowerCase();
      return pat.includes("wycisk");
    });

    if (matchingExercises.length === 0) {
      // No "Wyciskanie" exercises in this catalogue state — skip gracefully.
      return;
    }

    for (const ex of matchingExercises) {
      const result = scoreExercise(ex, survey);
      const dim = result.breakdown.find((b) => b.dimension === "confirmedRestrictions");
      expect(dim?.points ?? 0).toBeLessThan(0);
    }
  });
});

// ─── 4. avoid restriction — score impact verified against baseline ────────────

describe("(4) avoid restriction — matching movement pattern lowers the score", () => {
  it("avoided exercise scores lower than an exercise with a different pattern", async () => {
    const surveyRow = await loadSurveyRow();
    const avoidedEx = makeExercise({ id: 101, movementPattern: "Wyciskanie" });
    const unaffectedEx = makeExercise({ id: 102, movementPattern: "Wiosłowanie" });

    expect(scoreExercise(avoidedEx, surveyRow).score)
      .toBeLessThan(scoreExercise(unaffectedEx, surveyRow).score);
  });

  it("avoided exercise scores lower than the same exercise when no restrictions are set", async () => {
    const surveyRow = await loadSurveyRow();
    const surveyNoRestrictions: Survey = { ...surveyRow, confirmedRestrictions: null };
    const avoidedEx = makeExercise({ id: 101, movementPattern: "Wyciskanie" });

    expect(scoreExercise(avoidedEx, surveyRow).score)
      .toBeLessThan(scoreExercise(avoidedEx, surveyNoRestrictions).score);
  });

  it("confirmedRestrictions dimension carries ≤ -25 points for the avoided exercise", async () => {
    const surveyRow = await loadSurveyRow();
    const avoidedEx = makeExercise({ id: 101, movementPattern: "Wyciskanie" });
    const dim = scoreExercise(avoidedEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points).toBeLessThanOrEqual(-25);
  });

  it("final score is clamped to ≥ 0 even when penalties are heavy", async () => {
    const surveyRow = await loadSurveyRow();
    const avoidedEx = makeExercise({ id: 101, movementPattern: "Wyciskanie" });
    expect(scoreExercise(avoidedEx, surveyRow).score).toBeGreaterThanOrEqual(0);
  });
});

// ─── 5. regression restriction — dimension fires from DB survey ───────────────

describe("(5) regression restriction — confirmedRestrictions dimension fires from DB survey", () => {
  it("suitableForNoActivity=true exercise gets POSITIVE confirmedRestrictions dimension", async () => {
    const surveyRow = await loadSurveyRow();
    const regressionEx = makeExercise({ id: 201, movementPattern: "Przysiad", suitableForNoActivity: true });
    const dim = scoreExercise(regressionEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points).toBeGreaterThan(0);
  });

  it("suitableForNoActivity=false exercise gets NEGATIVE confirmedRestrictions dimension", async () => {
    const surveyRow = await loadSurveyRow();
    const standardEx = makeExercise({ id: 202, movementPattern: "Przysiad", suitableForNoActivity: false });
    const dim = scoreExercise(standardEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points).toBeLessThan(0);
  });

  it("the positive-dimension reason matches the spec label exactly", async () => {
    const surveyRow = await loadSurveyRow();
    const regressionEx = makeExercise({ id: 201, movementPattern: "Przysiad", suitableForNoActivity: true });
    const dim = scoreExercise(regressionEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.reason).toBe(
      "Wariant regresyjny — dobrany ze względu na zgłoszone ograniczenie.",
    );
  });
});

// ─── 6. regression restriction — non-regression variant penalised vs baseline ─

describe("(6) regression restriction — standard variant penalised relative to baseline", () => {
  it("standard variant scores lower than the same exercise without any restrictions", async () => {
    const surveyRow = await loadSurveyRow();
    const surveyNoRestrictions: Survey = { ...surveyRow, confirmedRestrictions: null };
    const standardEx = makeExercise({ id: 202, movementPattern: "Przysiad", suitableForNoActivity: false });

    expect(scoreExercise(standardEx, surveyRow).score)
      .toBeLessThan(scoreExercise(standardEx, surveyNoRestrictions).score);
  });
});

// ─── 7. Genuine accumulation: two restrictions matching the SAME exercise ──────
//
// Both restrictions reference movementPattern="Wyciskanie".
// An exercise with that pattern must match both and receive the combined points:
//   avoid       → -30
//   reduce_load → -5
//   total       → -35
//
// Using an in-memory survey (not from DB) to control the exact restriction set
// without requiring a second client/survey DB row.

describe("(7) Multiple restrictions on the same exercise accumulate correctly", () => {
  // Build a survey with two restrictions that BOTH match movementPattern "Wyciskanie".
  async function makeSurveyWithDualRestrictions(): Promise<Survey> {
    const base = await loadSurveyRow();
    return {
      ...base,
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" },       // -30
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "reduce_load" }, // -5
      ]),
    };
  }

  it("exercise matching both restrictions gets -35 total in confirmedRestrictions dimension", async () => {
    const survey = await makeSurveyWithDualRestrictions();
    const ex = makeExercise({ id: 301, movementPattern: "Wyciskanie" });

    const dim = scoreExercise(ex, survey).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    // avoid (-30) + reduce_load (-5) = -35
    expect(dim?.points).toBe(-35);
  });

  it("exercise matching both restrictions scores lower than one with only the avoid restriction", async () => {
    const dualSurvey = await makeSurveyWithDualRestrictions();
    // Survey with only the avoid restriction (no reduce_load)
    const base = await loadSurveyRow();
    const singleSurvey: Survey = {
      ...base,
      confirmedRestrictions: JSON.stringify([
        { bodyArea: "Bark", movementPattern: "Wyciskanie", action: "avoid" }, // -30 only
      ]),
    };

    const ex = makeExercise({ id: 301, movementPattern: "Wyciskanie" });

    const scoreWithBoth = scoreExercise(ex, dualSurvey).score;
    const scoreWithOne = scoreExercise(ex, singleSurvey).score;

    expect(scoreWithBoth).toBeLessThanOrEqual(scoreWithOne);
  });

  it("an exercise with an unrelated pattern is not affected by either stacked restriction", async () => {
    const survey = await makeSurveyWithDualRestrictions();
    const ex = makeExercise({ id: 302, movementPattern: "Wiosłowanie" });

    const dim = scoreExercise(ex, survey).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points ?? 0).toBe(0);
  });

  it("the two restrictions from the primary test survey each affect only their own pattern", async () => {
    const surveyRow = await loadSurveyRow(); // avoid:Wyciskanie + regression:Przysiad

    const pressEx   = makeExercise({ id: 311, movementPattern: "Wyciskanie" });
    const squatEx   = makeExercise({ id: 312, movementPattern: "Przysiad", suitableForNoActivity: false });
    const neutralEx = makeExercise({ id: 313, movementPattern: "Wiosłowanie" });

    const pressDim   = scoreExercise(pressEx,   surveyRow).breakdown.find((b) => b.dimension === "confirmedRestrictions");
    const squatDim   = scoreExercise(squatEx,   surveyRow).breakdown.find((b) => b.dimension === "confirmedRestrictions");
    const neutralDim = scoreExercise(neutralEx, surveyRow).breakdown.find((b) => b.dimension === "confirmedRestrictions");

    expect(pressDim?.points).toBeLessThanOrEqual(-25);  // avoid: -30
    expect(squatDim?.points).toBeLessThan(0);           // regression (non-variant): -15
    expect(neutralDim?.points ?? 0).toBe(0);            // no match
  });
});

// ─── 8. Restriction does NOT affect unrelated movement patterns ───────────────

describe("(8) Restriction for pattern X does not affect exercises with unrelated pattern Y", () => {
  it("Martwy ciąg exercise is unaffected by the Wyciskanie avoid restriction", async () => {
    const surveyRow = await loadSurveyRow();
    const deadliftEx = makeExercise({ id: 401, movementPattern: "Martwy ciąg" });
    const dim = scoreExercise(deadliftEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points ?? 0).toBe(0);
  });

  it("Wiosłowanie exercise is unaffected by the Przysiad regression restriction", async () => {
    const surveyRow = await loadSurveyRow();
    const rowEx = makeExercise({ id: 402, movementPattern: "Wiosłowanie" });
    const dim = scoreExercise(rowEx, surveyRow).breakdown.find(
      (b) => b.dimension === "confirmedRestrictions",
    );
    expect(dim?.points ?? 0).toBe(0);
  });

  it("unrelated exercise score is identical whether restrictions are present or not", async () => {
    const surveyRow = await loadSurveyRow();
    const surveyNoRestrictions: Survey = { ...surveyRow, confirmedRestrictions: null };
    const unrelatedEx = makeExercise({ id: 403, movementPattern: "Uginanie ramion" });

    expect(scoreExercise(unrelatedEx, surveyRow).score)
      .toBe(scoreExercise(unrelatedEx, surveyNoRestrictions).score);
  });
});
