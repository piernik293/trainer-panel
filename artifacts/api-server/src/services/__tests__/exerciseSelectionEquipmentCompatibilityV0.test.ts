import { describe, expect, it } from "vitest";
import {
  applyBeginnerBalancingPass,
  runExerciseSelectionEngineV0,
  type V0PriorityContext,
  type V0Result,
  type V0SessionType,
} from "../ExerciseSelectionEngineV0";
import {
  buildCompatibilityFilter,
  isEquipmentCompatible,
  isLocationCompatible,
  type ScoredAndFilteredExercise,
} from "../planDraftDayRecommendationsService";

const ADVANCED_CONTEXT: V0PriorityContext = {
  isPriorityEligible: true,
  isBeginnerClient: false,
  isNoActivityClient: false,
  tierA: [],
  tierB: [],
  allowPlyometrics: false,
};

const BEGINNER_CONTEXT: V0PriorityContext = {
  isPriorityEligible: false,
  isBeginnerClient: true,
  isNoActivityClient: false,
  tierA: [],
  tierB: [],
  allowPlyometrics: false,
};

function makeExercise(
  id: number,
  overrides: Partial<ScoredAndFilteredExercise>,
): ScoredAndFilteredExercise {
  return {
    id,
    name: `Ćwiczenie ${id}`,
    mainMuscleGroup: "Brzuch",
    secondaryMuscleGroups: [],
    equipment: ["Masa własnego ciała"],
    requiredEquipmentAll: [],
    trainingLocation: ["Dom", "Siłownia"],
    score: 50,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    exerciseType: "Izolowane",
    neurologicalFatigue: 1,
    learningDifficulty: 1,
    exercisePriority: "Niski",
    movementPattern: "Stabilizacja",
    suitableForNoActivity: true,
    ...overrides,
  };
}

const CATALOG: ScoredAndFilteredExercise[] = [
  makeExercise(1, {
    name: "Pompki",
    mainMuscleGroup: "Klatka piersiowa",
    exerciseType: "Złożone",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(2, {
    name: "Wiosłowanie pod stołem",
    mainMuscleGroup: "Plecy",
    exerciseType: "Złożone",
    movementPattern: "Przyciąganie poziome",
  }),
  makeExercise(3, {
    name: "Przysiad bez obciążenia",
    mainMuscleGroup: "Mięśnie czworogłowe uda",
    exerciseType: "Złożone",
    movementPattern: "Przysiad",
  }),
  makeExercise(4, {
    name: "Most biodrowy",
    mainMuscleGroup: "Pośladki",
    exerciseType: "Złożone",
    movementPattern: "Zawias biodrowy",
  }),
  makeExercise(5, {
    name: "Deska",
    mainMuscleGroup: "Brzuch",
  }),
  makeExercise(6, {
    name: "Reverse fly bez obciążenia",
    mainMuscleGroup: "Barki",
    movementPattern: "Odwodzenie",
  }),
  makeExercise(7, {
    name: "Izometryczne uginanie ramion",
    mainMuscleGroup: "Biceps",
    movementPattern: "Uginanie",
  }),
  makeExercise(8, {
    name: "Pompki wąskie",
    mainMuscleGroup: "Triceps",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(9, {
    name: "Wspięcia na palce",
    mainMuscleGroup: "Łydki",
    movementPattern: "Inne",
  }),
  makeExercise(10, {
    name: "Uginanie podudzia w leżeniu",
    mainMuscleGroup: "Mięśnie dwugłowe uda",
    movementPattern: "Inne",
  }),
  makeExercise(11, {
    name: "Pike push-up",
    mainMuscleGroup: "Barki",
    exerciseType: "Złożone",
    movementPattern: "Pchanie pionowe",
  }),
  makeExercise(12, {
    name: "Pompki z pauzą",
    mainMuscleGroup: "Klatka piersiowa",
    exerciseType: "Złożone",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(13, {
    name: "Wiosłowanie izometryczne",
    mainMuscleGroup: "Plecy",
    exerciseType: "Złożone",
    movementPattern: "Przyciąganie poziome",
  }),
  makeExercise(14, {
    name: "Wykrok w tył",
    mainMuscleGroup: "Pośladki",
    exerciseType: "Złożone",
    movementPattern: "Wykrok",
  }),
  makeExercise(15, {
    name: "Przywodzenie nogi w leżeniu",
    mainMuscleGroup: "Przywodziciele",
    movementPattern: "Inne",
  }),
  makeExercise(21, {
    name: "Floor press hantlami",
    mainMuscleGroup: "Klatka piersiowa",
    equipment: ["Hantle"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(22, {
    name: "Wiosłowanie hantlem lub kettlem",
    mainMuscleGroup: "Plecy",
    equipment: ["Hantle", "Kettlebell"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Przyciąganie poziome",
  }),
  makeExercise(23, {
    name: "Goblet squat",
    mainMuscleGroup: "Mięśnie czworogłowe uda",
    equipment: ["Hantle"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Przysiad",
  }),
  makeExercise(24, {
    name: "Rumuński martwy ciąg z hantlami",
    mainMuscleGroup: "Mięśnie dwugłowe uda",
    equipment: ["Hantle"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Zawias biodrowy",
  }),
  makeExercise(31, {
    name: "Landmine press ze sztangą",
    mainMuscleGroup: "Klatka piersiowa",
    equipment: ["Sztanga"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(32, {
    name: "Wiosłowanie sztangą",
    mainMuscleGroup: "Plecy",
    equipment: ["Sztanga"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Przyciąganie poziome",
  }),
  makeExercise(33, {
    name: "Przysiad Zerchera",
    mainMuscleGroup: "Mięśnie czworogłowe uda",
    equipment: ["Sztanga"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Przysiad",
  }),
  makeExercise(34, {
    name: "Rumuński martwy ciąg ze sztangą",
    mainMuscleGroup: "Mięśnie dwugłowe uda",
    equipment: ["Sztanga"],
    exerciseType: "Złożone",
    exercisePriority: "Wysoki",
    movementPattern: "Zawias biodrowy",
  }),
  makeExercise(40, {
    name: "Wyciskanie hantli na ławce",
    mainMuscleGroup: "Klatka piersiowa",
    equipment: ["Hantle"],
    requiredEquipmentAll: ["Ławka"],
    exerciseType: "Złożone",
    exercisePriority: "Bardzo wysoki",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(90, {
    name: "Wyciskanie na maszynie",
    mainMuscleGroup: "Klatka piersiowa",
    equipment: ["Maszyna"],
    trainingLocation: ["Siłownia"],
    exerciseType: "Złożone",
    exercisePriority: "Bardzo wysoki",
    movementPattern: "Pchanie poziome",
  }),
  makeExercise(91, {
    name: "Ściąganie drążka wyciągu",
    mainMuscleGroup: "Plecy",
    equipment: ["Wyciąg"],
    trainingLocation: ["Siłownia"],
    exerciseType: "Złożone",
    exercisePriority: "Bardzo wysoki",
    movementPattern: "Przyciąganie pionowe",
  }),
];

function compatiblePool(
  equipment: string | null | undefined,
  location = "Dom",
  source = CATALOG,
): ScoredAndFilteredExercise[] {
  const filter = buildCompatibilityFilter(location, equipment, new Set<number>());
  return source.filter(filter);
}

describe("shared compatibility contract for manual plan writes", () => {
  it.each([
    ["bodyweight-only profile", undefined, "Dom", 1, true],
    ["bodyweight-only profile", undefined, "Dom", 21, false],
    ["dumbbell profile", "Hantle", "Dom", 21, true],
    ["dumbbell profile", "Hantle", "Dom", 31, false],
    ["barbell profile", "Sztanga", "Dom", 31, true],
    ["barbell profile", "Sztanga", "Dom", 21, false],
    ["dumbbells without a bench", "Hantle", "Dom", 40, false],
    ["dumbbells with a bench", "Hantle,Ławka", "Dom", 40, true],
    ["home location", "Hantle", "Dom", 90, false],
    ["gym location", "Maszyna", "Siłownia", 90, true],
  ] as const)(
    "%s %s exercise %i",
    (_profile, equipment, location, exerciseId, expected) => {
      const exercise = CATALOG.find((candidate) => candidate.id === exerciseId);
      expect(exercise).toBeDefined();

      const allowManualWrite = buildCompatibilityFilter(
        location,
        equipment,
        new Set<number>(),
      );
      expect(allowManualWrite(exercise!)).toBe(expected);
    },
  );
});

function assertFinalPlanCompatible(
  result: V0Result,
  equipment: string | null | undefined,
  location = "Dom",
  source = CATALOG,
): void {
  expect(result.valid).toBe(true);
  expect(result.exercises.length).toBeGreaterThanOrEqual(4);

  const sourceById = new Map(source.map((exercise) => [exercise.id, exercise]));
  const compatibilityFilter = buildCompatibilityFilter(
    location,
    equipment,
    new Set<number>(),
  );

  for (const selected of result.exercises) {
    const original = sourceById.get(selected.id);
    expect(original, `missing source exercise ${selected.id}`).toBeDefined();
    expect(compatibilityFilter(original!)).toBe(true);
    expect(
      isEquipmentCompatible(
        original!.equipment,
        original!.requiredEquipmentAll ?? [],
        equipment,
      ),
    ).toBe(true);
    expect(isLocationCompatible(original!.trainingLocation, location)).toBe(true);
  }
}

function generateFullBody(
  equipment: string | null | undefined,
  location = "Dom",
): V0Result {
  return runExerciseSelectionEngineV0(
    compatiblePool(equipment, location),
    "full_body",
    new Set<string>(),
    ADVANCED_CONTEXT,
  );
}

describe("generate-day V0 final equipment compatibility", () => {
  it.each([
    ["missing equipment", undefined],
    ["dumbbells only", "Hantle"],
    ["barbell only", "Sztanga"],
    ["dumbbells and bench", "Hantle,Ławka"],
    [
      "full equipment",
      "Hantle,Sztanga,Kettlebell,Ławka,Maszyna,Wyciąg,Masa własnego ciała",
    ],
  ] as const)("%s profile keeps every final exercise compatible", (_label, equipment) => {
    const location = _label === "full equipment" ? "Siłownia" : "Dom";
    assertFinalPlanCompatible(
      generateFullBody(equipment, location),
      equipment,
      location,
    );
  });

  it("equipment AnyOf admits a dumbbell-or-kettlebell exercise to the final plan", () => {
    const result = generateFullBody("Hantle");

    assertFinalPlanCompatible(result, "Hantle");
    expect(result.exercises.map((exercise) => exercise.id)).toContain(22);
  });

  it("requiredEquipmentAll excludes bench work without a bench from the final plan", () => {
    const result = generateFullBody("Hantle");

    assertFinalPlanCompatible(result, "Hantle");
    expect(result.exercises.map((exercise) => exercise.id)).not.toContain(40);
  });

  it("requiredEquipmentAll admits bench work when dumbbells and bench are both available", () => {
    const result = generateFullBody("Hantle,Ławka");

    assertFinalPlanCompatible(result, "Hantle,Ławka");
    expect(result.exercises.map((exercise) => exercise.id)).toContain(40);
  });

  it("uses a compatible horizontal-pull fallback instead of an incompatible vertical pull", () => {
    const result = generateFullBody(undefined, "Dom");
    const selectedIds = result.exercises.map((exercise) => exercise.id);

    assertFinalPlanCompatible(result, undefined, "Dom");
    expect(selectedIds).toContain(2);
    expect(selectedIds).not.toContain(91);
  });

  it.each([
    "push",
    "pull",
    "legs",
    "upper",
    "lower",
    "full_body",
    "plyo",
  ] satisfies V0SessionType[])(
    "%s slots and fallbacks only consume the compatible pool",
    (sessionType) => {
      const result = runExerciseSelectionEngineV0(
        compatiblePool(undefined),
        sessionType,
        new Set<string>(),
        BEGINNER_CONTEXT,
      );

      assertFinalPlanCompatible(result, undefined);
    },
  );

  it("returns a controlled failure when the compatible pool is exhausted", () => {
    const pool = compatiblePool(undefined);
    const result = runExerciseSelectionEngineV0(
      pool,
      "full_body",
      new Set(pool.map((exercise) => String(exercise.id))),
      ADVANCED_CONTEXT,
    );

    expect(result.valid).toBe(false);
    expect(result.exercises).toEqual([]);
    expect(result.error).toMatch(/minimum 4 exercises required/);
  });

  it("thin-pool retry reuses the same compatible pool", () => {
    const pool = compatiblePool(undefined);
    const weekIds = pool.map((exercise) => String(exercise.id));
    const alternativeIndex = 1;
    const sameTypePreviousExercises: Array<{ id: number; equipment: string[] }> = [];

    let result = runExerciseSelectionEngineV0(
      pool,
      "upper",
      new Set(weekIds),
      ADVANCED_CONTEXT,
      { alternativeIndex, sameTypePreviousExercises },
    );
    expect(result.valid).toBe(false);

    if (
      !result.valid &&
      alternativeIndex > 0 &&
      weekIds.length > sameTypePreviousExercises.length
    ) {
      result = runExerciseSelectionEngineV0(
        pool,
        "upper",
        new Set<string>(),
        ADVANCED_CONTEXT,
        { alternativeIndex, sameTypePreviousExercises },
      );
    }

    assertFinalPlanCompatible(result, undefined);
  });

  it("safe reuse repeats a compatible exercise instead of leaking an incompatible one", () => {
    const pullSource = CATALOG.filter((exercise) =>
      [2, 5, 6, 7, 91].includes(exercise.id),
    );
    const pool = compatiblePool(undefined, "Dom", pullSource);
    const result = runExerciseSelectionEngineV0(
      pool,
      "pull",
      new Set<string>(),
      BEGINNER_CONTEXT,
    );

    assertFinalPlanCompatible(result, undefined, "Dom", pullSource);
    expect(new Set(result.exercises.map((exercise) => exercise.id)).size).toBeLessThan(
      result.exercises.length,
    );
    expect(result.exercises.map((exercise) => exercise.id)).not.toContain(91);
  });

  it("beginner balancing can only replace from the compatible pool", () => {
    const balanceSource = CATALOG.filter((exercise) =>
      [1, 2, 3, 4, 5, 7, 91].includes(exercise.id),
    );
    const eligible = compatiblePool(undefined, "Dom", balanceSource);
    const initialIds = new Set([1, 3, 4, 5, 7]);
    const results = eligible
      .filter((exercise) => initialIds.has(exercise.id))
      .map((exercise, index) => ({
        ex: exercise,
        slotName: `Initial ${index + 1}`,
      }));
    const usedIds = new Set(results.map(({ ex }) => String(ex.id)));

    applyBeginnerBalancingPass(
      results,
      eligible,
      usedIds,
      "full_body",
      BEGINNER_CONTEXT,
    );

    const filter = buildCompatibilityFilter("Dom", undefined, new Set<number>());
    expect(results.map(({ ex }) => ex.id)).toContain(2);
    expect(results.map(({ ex }) => ex.id)).not.toContain(91);
    for (const { ex } of results) {
      expect(filter(ex)).toBe(true);
    }
  });
});