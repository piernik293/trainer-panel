/**
 * Unit tests for Stage E scoring functions in recommendation-engine.ts
 *
 * Coverage:
 *   deriveExerciseClass (internal)   — all six class paths, tested via scoreExercise breakdown
 *   scoreExerciseClassAlignment      — every GoalBias × ExerciseClass combination
 *   scoreSubTargetBias               — cap at +12, null/empty/non-object JSONB, substring
 *                                      matching in both directions, zero/negative weights
 *   deriveExerciseClass (exported)   — all six class paths in ExerciseSelectionEngineV0
 *
 * No database dependency.  All functions under test are pure.
 */

import { describe, it, expect } from "vitest";
import { scoreExercise } from "../recommendation-engine";
import { deriveExerciseClass } from "../../services/ExerciseSelectionEngineV0";
import type { Exercise, Survey } from "@workspace/db";
import type { ScoredAndFilteredExercise } from "../../services/planDraftDayRecommendationsService";

// ─── Fixture builders ─────────────────────────────────────────────────────────

/**
 * Build a minimal Exercise stub.  Only the fields read by the Stage E functions
 * (and the suitability functions) are set — everything else is null / empty.
 * Cast via `unknown` so TypeScript is happy with the partial object.
 */
function makeExercise(overrides: {
  suitableForNoActivity?: boolean | null;
  mainMuscleGroup?: string;
  exerciseType?: string | null;
  movementPattern?: string | null;
  movementCategory?: string | null;
  exercisePriority?: string | null;
  subTargetBiases?: Record<string, number> | null | unknown;
  id?: number;
} = {}): Exercise {
  return {
    id: overrides.id ?? 1,
    name: "Test Exercise",
    slug: "test",
    mainMuscleGroup: overrides.mainMuscleGroup ?? "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: [],
    equipmentOther: null,
    trainingLocation: [],
    difficultyLevel: null,
    movementPattern: overrides.movementPattern ?? null,
    description: null,
    executionInstructions: null,
    commonMistakes: null,
    coachingTips: null,
    videoUrl: null,
    imageUrl: null,
    breathingTips: null,
    safetyNotes: null,
    suitableExperienceLevels: [],
    trainingGoals: [],
    movementCategory: overrides.movementCategory ?? null,
    exerciseType: overrides.exerciseType ?? null,
    exercisePriority: overrides.exercisePriority ?? null,
    suitableForNoActivity: overrides.suitableForNoActivity ?? null,
    subTargetBiases: overrides.subTargetBiases ?? null,
    jointStress: null,
    learningDifficulty: null,
    neurologicalFatigue: null,
    domsPotential: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as Exercise;
}

/**
 * Build a minimal Survey stub.  The only fields needed by Stage E are
 * trainingGoal and the three priorityMuscle slots; everything else is null.
 */
function makeSurvey(overrides: {
  trainingGoal?: string | null;
  priorityMuscle1?: string | null;
  priorityMuscle2?: string | null;
  priorityMuscle3?: string | null;
  experienceLevel?: string | null;
  avoidedMuscles?: string | null;
} = {}): Survey {
  return {
    id: 1,
    clientId: 1,
    trainingGoal: overrides.trainingGoal ?? null,
    experienceLevel: overrides.experienceLevel ?? null,
    trainingLocation: null,
    equipment: null,
    priorityMuscle1: overrides.priorityMuscle1 ?? null,
    priorityMuscle2: overrides.priorityMuscle2 ?? null,
    priorityMuscle3: overrides.priorityMuscle3 ?? null,
    avoidedMuscles: overrides.avoidedMuscles ?? null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as Survey;
}

/**
 * Convenience: call scoreExercise and return only the named dimension entry.
 */
function score(
  ex: Exercise,
  sv: Survey,
  dim: "exerciseClassAlignment" | "subTargetBias",
): { points: number; reason: string | null } {
  const result = scoreExercise(ex, sv);
  const entry = result.breakdown.find((d) => d.dimension === dim);
  if (!entry) throw new Error(`Dimension "${dim}" not found in breakdown`);
  return { points: entry.points, reason: entry.reason };
}

// ─── Exercise stubs for each ExerciseClass ────────────────────────────────────

const REGRESSION = makeExercise({ suitableForNoActivity: true });

// core: mainMuscleGroup = "Brzuch", suitableForNoActivity must NOT be true
const CORE = makeExercise({
  mainMuscleGroup: "Brzuch",
  suitableForNoActivity: false,
});

// isolation: exerciseType = "Izolowane"
const ISOLATION = makeExercise({ exerciseType: "Izolowane" });

// plyometric_power: movementCategory = "plyometryczne"
const PLYO = makeExercise({ movementCategory: "plyometryczne" });

// main_compound: exerciseType = "Złożone", exercisePriority "Bardzo wysoki"
const MAIN_COMPOUND = makeExercise({
  exerciseType: "Złożone",
  exercisePriority: "Bardzo wysoki",
});

// secondary_compound: exerciseType = "Złożone", exercisePriority "Średni"
const SECONDARY_COMPOUND = makeExercise({
  exerciseType: "Złożone",
  exercisePriority: "Średni",
});

// ─── Survey stubs for each GoalBias ──────────────────────────────────────────

const HYPERTROPHY_SV = makeSurvey({ trainingGoal: "Budowa sylwetki" });
const STRENGTH_SV    = makeSurvey({ trainingGoal: "Zwiększenie siły" });
const CONDITIONING_SV = makeSurvey({ trainingGoal: "Poprawa kondycji" });
const ATHLETIC_SV    = makeSurvey({ trainingGoal: "Poprawa sprawności" });
const GENERAL_SV     = makeSurvey({ trainingGoal: null });

// ═════════════════════════════════════════════════════════════════════════════
// 1.  deriveExerciseClass (internal) — confirmed via alignment score pattern
//     We verify the correct class is derived by checking that the alignment
//     score matches the expected value for a known goal.
// ═════════════════════════════════════════════════════════════════════════════

describe("deriveExerciseClass (via scoreExerciseClassAlignment)", () => {
  it("regression_beginner: suitableForNoActivity=true → 0 pts for hypertrophy (no penalty/reward)", () => {
    // regression_beginner falls through all switch arms → points = 0
    const { points } = score(REGRESSION, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(0);
  });

  it("core: mainMuscleGroup='Brzuch' → 0 pts for hypertrophy (no reward)", () => {
    const { points } = score(CORE, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(0);
  });

  it("isolation: exerciseType='Izolowane' → +4 for hypertrophy", () => {
    const { points } = score(ISOLATION, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(4);
  });

  it("plyometric_power: movementCategory='plyometryczne' → -4 for hypertrophy", () => {
    const { points } = score(PLYO, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(-4);
  });

  it("main_compound: złożone + Bardzo wysoki → +8 for strength", () => {
    const { points } = score(MAIN_COMPOUND, STRENGTH_SV, "exerciseClassAlignment");
    expect(points).toBe(8);
  });

  it("secondary_compound: złożone + Średni → +4 for strength", () => {
    const { points } = score(SECONDARY_COMPOUND, STRENGTH_SV, "exerciseClassAlignment");
    expect(points).toBe(4);
  });

  it("plyometric_power via movementPattern 'skok' → +5 for athletic (confirming pattern branch)", () => {
    const plyoByPattern = makeExercise({ movementPattern: "skok" });
    const { points } = score(plyoByPattern, ATHLETIC_SV, "exerciseClassAlignment");
    expect(points).toBe(5);
  });

  it("plyometric_power via movementPattern containing 'wybici' → classified as plyo", () => {
    const plyoByPattern = makeExercise({ movementPattern: "odskoki z wybiciu" });
    const { points } = score(plyoByPattern, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(-4); // hypertrophy penalises plyo
  });

  it("unlabelled exercise (null type/category/pattern) → secondary_compound fallback", () => {
    const unlabelled = makeExercise({});
    // secondary_compound → hypertrophy gives +6
    const { points } = score(unlabelled, HYPERTROPHY_SV, "exerciseClassAlignment");
    expect(points).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2.  scoreExerciseClassAlignment — every GoalBias × ExerciseClass cell
// ═════════════════════════════════════════════════════════════════════════════

describe("scoreExerciseClassAlignment — all GoalBias × ExerciseClass combinations", () => {
  // ── general bias: always 0, never fires ──────────────────────────────────
  describe("general (no recognised goal)", () => {
    it.each([
      ["regression_beginner", REGRESSION],
      ["core", CORE],
      ["isolation", ISOLATION],
      ["plyometric_power", PLYO],
      ["main_compound", MAIN_COMPOUND],
      ["secondary_compound", SECONDARY_COMPOUND],
    ])("%s → 0 pts", (_cls, ex) => {
      expect(score(ex, GENERAL_SV, "exerciseClassAlignment").points).toBe(0);
    });
  });

  // ── hypertrophy ───────────────────────────────────────────────────────────
  describe("hypertrophy goal", () => {
    it("main_compound → +6", () =>
      expect(score(MAIN_COMPOUND, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(6));
    it("secondary_compound → +6", () =>
      expect(score(SECONDARY_COMPOUND, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(6));
    it("isolation → +4", () =>
      expect(score(ISOLATION, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(4));
    it("plyometric_power → -4", () =>
      expect(score(PLYO, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(-4));
    it("regression_beginner → 0", () =>
      expect(score(REGRESSION, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(0));
    it("core → 0", () =>
      expect(score(CORE, HYPERTROPHY_SV, "exerciseClassAlignment").points).toBe(0));

    it("alternate goal trigger: 'Redukcja tkanki tłuszczowej' → hypertrophy bias (+6 for compound)", () => {
      const sv = makeSurvey({ trainingGoal: "Redukcja tkanki tłuszczowej" });
      expect(score(MAIN_COMPOUND, sv, "exerciseClassAlignment").points).toBe(6);
    });
  });

  // ── strength ─────────────────────────────────────────────────────────────
  describe("strength goal", () => {
    it("main_compound → +8", () =>
      expect(score(MAIN_COMPOUND, STRENGTH_SV, "exerciseClassAlignment").points).toBe(8));
    it("secondary_compound → +4", () =>
      expect(score(SECONDARY_COMPOUND, STRENGTH_SV, "exerciseClassAlignment").points).toBe(4));
    it("isolation → -3", () =>
      expect(score(ISOLATION, STRENGTH_SV, "exerciseClassAlignment").points).toBe(-3));
    it("plyometric_power → 0", () =>
      expect(score(PLYO, STRENGTH_SV, "exerciseClassAlignment").points).toBe(0));
    it("regression_beginner → 0", () =>
      expect(score(REGRESSION, STRENGTH_SV, "exerciseClassAlignment").points).toBe(0));
    it("core → 0", () =>
      expect(score(CORE, STRENGTH_SV, "exerciseClassAlignment").points).toBe(0));

    it("strength goal via 'siłę' substring", () => {
      const sv = makeSurvey({ trainingGoal: "Chcę zwiększyć siłę ogólną" });
      expect(score(MAIN_COMPOUND, sv, "exerciseClassAlignment").points).toBe(8);
    });
  });

  // ── conditioning ─────────────────────────────────────────────────────────
  describe("conditioning goal", () => {
    it("main_compound → +5", () =>
      expect(score(MAIN_COMPOUND, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(5));
    it("secondary_compound → +5", () =>
      expect(score(SECONDARY_COMPOUND, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(5));
    it("isolation → -5", () =>
      expect(score(ISOLATION, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(-5));
    it("plyometric_power → 0", () =>
      expect(score(PLYO, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(0));
    it("regression_beginner → 0", () =>
      expect(score(REGRESSION, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(0));
    it("core → 0", () =>
      expect(score(CORE, CONDITIONING_SV, "exerciseClassAlignment").points).toBe(0));
  });

  // ── athletic ─────────────────────────────────────────────────────────────
  describe("athletic goal", () => {
    it("main_compound → +6", () =>
      expect(score(MAIN_COMPOUND, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(6));
    it("secondary_compound → +3", () =>
      expect(score(SECONDARY_COMPOUND, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(3));
    it("plyometric_power → +5", () =>
      expect(score(PLYO, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(5));
    it("isolation → -4", () =>
      expect(score(ISOLATION, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(-4));
    it("regression_beginner → 0", () =>
      expect(score(REGRESSION, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(0));
    it("core → 0", () =>
      expect(score(CORE, ATHLETIC_SV, "exerciseClassAlignment").points).toBe(0));

    it("athletic via 'sportow' substring", () => {
      const sv = makeSurvey({ trainingGoal: "Cel sportowy — piłka nożna" });
      expect(score(PLYO, sv, "exerciseClassAlignment").points).toBe(5);
    });
  });

  // ── reason field sanity ───────────────────────────────────────────────────
  it("positive score → reason string is non-null", () => {
    const { reason } = score(MAIN_COMPOUND, STRENGTH_SV, "exerciseClassAlignment");
    expect(reason).not.toBeNull();
    expect(typeof reason).toBe("string");
  });

  it("negative score → reason is null (penalty is silent)", () => {
    const { reason } = score(ISOLATION, CONDITIONING_SV, "exerciseClassAlignment");
    expect(reason).toBeNull();
  });

  it("zero score → reason is null", () => {
    const { reason } = score(REGRESSION, STRENGTH_SV, "exerciseClassAlignment");
    expect(reason).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3.  scoreSubTargetBias
// ═════════════════════════════════════════════════════════════════════════════

describe("scoreSubTargetBias", () => {
  // ── null / missing JSONB ──────────────────────────────────────────────────
  it("null subTargetBiases → 0 pts", () => {
    const ex = makeExercise({ subTargetBiases: null });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  it("missing (undefined) subTargetBiases → 0 pts", () => {
    const ex = makeExercise({});
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  it("empty object {} → 0 pts (no bias keys to match)", () => {
    const ex = makeExercise({ subTargetBiases: {} });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  it("array JSONB (malformed) → 0 pts", () => {
    const ex = makeExercise({ subTargetBiases: ["klatka wewnętrzna"] as unknown });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  // ── no priority muscles set ───────────────────────────────────────────────
  it("no priority muscles in survey → 0 pts even when biases exist", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({});
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  it("priority muscles all blank/whitespace → 0 pts", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "  ", priorityMuscle2: "" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  // ── key ignored when weight ≤ 0 ──────────────────────────────────────────
  it("bias weight = 0 → key not scored", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 0 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  it("bias weight negative → key not scored", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": -1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  // ── single match ─────────────────────────────────────────────────────────
  it("one matching key → +5", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  // ── substring matching — key contains muscle ─────────────────────────────
  it("key contains priority muscle as substring → match (+5)", () => {
    // key: "klatka wewnętrzna", muscle: "klatka"
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka" });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  // ── substring matching — muscle contains key ─────────────────────────────
  it("priority muscle contains key as substring → match (+5)", () => {
    // key: "klatka", muscle: "klatka piersiowa wewnętrzna"
    const ex = makeExercise({ subTargetBiases: { "klatka": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka piersiowa wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  // ── two matching keys ─────────────────────────────────────────────────────
  it("two matching keys → +10", () => {
    const ex = makeExercise({
      subTargetBiases: {
        "klatka wewnętrzna": 1,
        "klatka zewnętrzna": 1,
      },
    });
    const sv = makeSurvey({
      priorityMuscle1: "klatka wewnętrzna",
      priorityMuscle2: "klatka zewnętrzna",
    });
    expect(score(ex, sv, "subTargetBias").points).toBe(10);
  });

  // ── cap at +12 ────────────────────────────────────────────────────────────
  it("three or more matching keys → capped at +12", () => {
    // 3 keys × +5 = +15 → capped to +12
    const ex = makeExercise({
      subTargetBiases: {
        "klatka wewnętrzna": 1,
        "klatka zewnętrzna": 1,
        "barki przednie":    1,
      },
    });
    const sv = makeSurvey({
      priorityMuscle1: "klatka wewnętrzna",
      priorityMuscle2: "barki przednie",
      priorityMuscle3: "klatka zewnętrzna",
    });
    expect(score(ex, sv, "subTargetBias").points).toBe(12);
  });

  // ── case / whitespace insensitivity via norm() ────────────────────────────
  it("case-insensitive matching via norm()", () => {
    const ex = makeExercise({ subTargetBiases: { "Klatka Wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  it("leading/trailing whitespace in priority muscle handled by norm()", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "  klatka wewnętrzna  " });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  // ── no key match ─────────────────────────────────────────────────────────
  it("no key matches priority muscles → 0 pts", () => {
    const ex = makeExercise({ subTargetBiases: { "barki tylne": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(0);
  });

  // ── reason field ─────────────────────────────────────────────────────────
  it("positive score → reason is non-null string", () => {
    const ex = makeExercise({ subTargetBiases: { "klatka wewnętrzna": 1 } });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    const { reason } = score(ex, sv, "subTargetBias");
    expect(reason).not.toBeNull();
    expect(typeof reason).toBe("string");
  });

  it("zero score → reason is null", () => {
    const ex = makeExercise({ subTargetBiases: null });
    const sv = makeSurvey({ priorityMuscle1: "klatka" });
    const { reason } = score(ex, sv, "subTargetBias");
    expect(reason).toBeNull();
  });

  // ── non-matching key present alongside matching key ───────────────────────
  it("mixed keys: one matches, one does not → +5 (only matching key counts)", () => {
    const ex = makeExercise({
      subTargetBiases: {
        "klatka wewnętrzna": 1,
        "barki tylne": 1,
      },
    });
    const sv = makeSurvey({ priorityMuscle1: "klatka wewnętrzna" });
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });

  // ── same key matched by multiple priority muscles — no double-count ───────
  it("same key matched by two priority muscles → counts only once (+5, not +10)", () => {
    // The `for...of Object.entries` loop iterates over keys, not muscles.
    // One key that matches both muscles → points += 5 once.
    const ex = makeExercise({
      subTargetBiases: { "klatka": 1 },
    });
    const sv = makeSurvey({
      priorityMuscle1: "klatka wewnętrzna",
      priorityMuscle2: "klatka piersiowa",
    });
    // "klatka" matches both muscles (via substring), but there is only ONE key
    // in biases, so the loop fires once → +5
    expect(score(ex, sv, "subTargetBias").points).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4.  deriveExerciseClass (exported) from ExerciseSelectionEngineV0.ts
//     Tested directly with ScoredAndFilteredExercise stubs.
// ═════════════════════════════════════════════════════════════════════════════

function makeV0Exercise(
  overrides: Partial<ScoredAndFilteredExercise> = {},
): ScoredAndFilteredExercise {
  return {
    id: 1,
    name: "V0 Test",
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: [],
    trainingLocation: [],
    score: 50,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    exerciseType: null,
    exercisePriority: null,
    movementPattern: null,
    movementCategoryKey: null,
    suitableForNoActivity: null,
    ...overrides,
  };
}

describe("deriveExerciseClass (ExerciseSelectionEngineV0 — exported)", () => {
  it("regression_beginner: suitableForNoActivity=true (highest priority)", () => {
    const ex = makeV0Exercise({
      suitableForNoActivity: true,
      mainMuscleGroup: "Brzuch", // would be 'core' if not caught first
    });
    expect(deriveExerciseClass(ex)).toBe("regression_beginner");
  });

  it("core: mainMuscleGroup='Brzuch', suitableForNoActivity not true", () => {
    const ex = makeV0Exercise({
      mainMuscleGroup: "Brzuch",
      suitableForNoActivity: false,
    });
    expect(deriveExerciseClass(ex)).toBe("core");
  });

  it("isolation: exerciseType='Izolowane'", () => {
    const ex = makeV0Exercise({ exerciseType: "Izolowane" });
    expect(deriveExerciseClass(ex)).toBe("isolation");
  });

  it("plyometric_power: movementCategoryKey='plyometryczne'", () => {
    const ex = makeV0Exercise({ movementCategoryKey: "plyometryczne" });
    expect(deriveExerciseClass(ex)).toBe("plyometric_power");
  });

  it("plyometric_power: movementPattern='skok'", () => {
    const ex = makeV0Exercise({ movementPattern: "skok" });
    expect(deriveExerciseClass(ex)).toBe("plyometric_power");
  });

  it("plyometric_power: movementPattern='wyskok'", () => {
    const ex = makeV0Exercise({ movementPattern: "wyskok" });
    expect(deriveExerciseClass(ex)).toBe("plyometric_power");
  });

  it("plyometric_power: movementPattern contains 'wybici'", () => {
    const ex = makeV0Exercise({ movementPattern: "odbicie z wybiciu" });
    expect(deriveExerciseClass(ex)).toBe("plyometric_power");
  });

  it("plyometric_power: movementCategoryKey contains 'plyomet'", () => {
    const ex = makeV0Exercise({ movementCategoryKey: "plyometryczne_dolne" });
    expect(deriveExerciseClass(ex)).toBe("plyometric_power");
  });

  it("main_compound: exerciseType='Złożone', priority='Bardzo wysoki'", () => {
    const ex = makeV0Exercise({
      exerciseType: "Złożone",
      exercisePriority: "Bardzo wysoki",
    });
    expect(deriveExerciseClass(ex)).toBe("main_compound");
  });

  it("main_compound: exerciseType='Złożone', priority='Wysoki'", () => {
    const ex = makeV0Exercise({
      exerciseType: "Złożone",
      exercisePriority: "Wysoki",
    });
    expect(deriveExerciseClass(ex)).toBe("main_compound");
  });

  it("secondary_compound: exerciseType='Złożone', priority='Średni'", () => {
    const ex = makeV0Exercise({
      exerciseType: "Złożone",
      exercisePriority: "Średni",
    });
    expect(deriveExerciseClass(ex)).toBe("secondary_compound");
  });

  it("secondary_compound: exerciseType='Złożone', priority='Niski'", () => {
    const ex = makeV0Exercise({
      exerciseType: "Złożone",
      exercisePriority: "Niski",
    });
    expect(deriveExerciseClass(ex)).toBe("secondary_compound");
  });

  it("secondary_compound fallback: null exerciseType, no plyo signals", () => {
    const ex = makeV0Exercise({});
    expect(deriveExerciseClass(ex)).toBe("secondary_compound");
  });

  it("class priority: regression_beginner beats core (suitableForNoActivity wins)", () => {
    const ex = makeV0Exercise({
      suitableForNoActivity: true,
      mainMuscleGroup: "Brzuch",
      exerciseType: "Izolowane",
    });
    expect(deriveExerciseClass(ex)).toBe("regression_beginner");
  });

  it("class priority: core beats isolation (Brzuch checked before exerciseType)", () => {
    const ex = makeV0Exercise({
      mainMuscleGroup: "Brzuch",
      exerciseType: "Izolowane",
      suitableForNoActivity: false,
    });
    expect(deriveExerciseClass(ex)).toBe("core");
  });
});
