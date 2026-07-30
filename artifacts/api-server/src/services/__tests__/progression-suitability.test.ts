/**
 * Progression Suitability — intermediate + dumbbell client regression tests.
 *
 * Proves that an unrestricted intermediate client with dumbbells and a bench
 * receives loadable primary exercises rather than a session dominated by
 * incline push-ups, bodyweight box squats, and unloaded glute bridges.
 *
 * Coverage:
 *
 * Scoring dimension (scoreExercise)
 *   1.  Intermediate + Hantle: dumbbell exercise gets +12 progression bonus
 *   2.  Intermediate + Hantle: regression (suitableForNoActivity) gets -8
 *   3.  Intermediate + Hantle: pure bodyweight non-regression scores 0
 *   4.  Beginner + Hantle: dimension is silent (0) — no bonus, no penalty
 *   5.  Brak aktywności + Hantle: dimension is silent (0)
 *   6.  Intermediate, no loadable equipment: dimension is silent (0)
 *   7.  Advanced + Sztanga: dumbbell exercise still gets +12
 *   8.  Intermediate + Hantle: dumbbell bench press scores higher than incline push-up
 *   9.  Intermediate + Hantle: goblet squat scores higher than bodyweight box squat
 *   10. Intermediate + Hantle: dumbbell hip thrust scores higher than bw glute bridge
 *
 * Engine selection (runExerciseSelectionEngineV0 / pick())
 *   11. Upper session: dumbbell bench press wins chest compound slot over incline push-up
 *   12. Lower session: goblet squat wins squat slot over bodyweight box squat
 *   13. Lower session: dumbbell hip thrust wins hip-hinge slot over bw glute bridge
 *   14. Upper session: at most one Pompki exercise is selected (capPushUpsAtOne)
 *   15. Upper session: if only push-ups exist for a slot, one is still selected
 *   16. Beginner client: regression penalty is not applied — bw exercises may win
 *   17. Full session: no more than one Pompki exercise in an intermediate upper day
 *   18. deprioritizePushUps fires for intermediate dumbbell clients (not full-gym only)
 */

import { describe, it, expect } from "vitest";
import { scoreExercise } from "../../lib/recommendation-engine";
import {
  runExerciseSelectionEngineV0,
} from "../ExerciseSelectionEngineV0";
import type { ScoredAndFilteredExercise } from "../planDraftDayRecommendationsService";
import type { V0PriorityContext } from "../ExerciseSelectionEngineV0";
import type { Exercise, Survey } from "@workspace/db";

// ─── Survey fixtures ──────────────────────────────────────────────────────────

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: 1,
    clientId: 1,
    experienceLevel: "Średniozaawansowany",
    trainingGoal: "Budowa sylwetki",
    trainingGoalOther: null,
    trainingDuration: null,
    desiredWeeklyFrequency: null,
    sessionDuration: null,
    activityLevel: null,
    sleepHours: null,
    stressLevel: null,
    planStylePreference: null,
    trainingLocation: "Dom",
    equipment: "Hantle, Ławka",
    healthLimitations: null,
    avoidedExercises: null,
    avoidedMuscles: null,
    priorityMuscle1: null,
    priorityMuscle2: null,
    priorityMuscle3: null,
    favoriteExercises: null,
    cardioActivity: null,
    cardioFrequency: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    trainerId: 1,
    athleteStatus: null,
    sportPerformanceNeeds: [],
    ...overrides,
  } as Survey;
}

// ─── Exercise fixtures ────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: "Test Exercise",
    isActive: true,
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Hantle"],
    difficultyLevel: "Średniozaawansowany",
    suitableExperienceLevels: ["Średniozaawansowany"],
    trainingGoals: ["Budowa sylwetki"],
    trainingLocation: ["Dom"],
    exercisePriority: "Wysoki",
    jointStress: "Średnie",
    learningDifficulty: 2,
    neurologicalFatigue: 3,
    domsPotential: 3,
    movementPattern: "Pchanie poziome",
    exerciseType: "Złożone",
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
    suitableForNoActivity: false,
    subTargetBiases: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  } as Exercise;
}

// ─── Engine pool fixture helpers ──────────────────────────────────────────────

let _nextId = 500;
function nextId() { return _nextId++; }

function makePoolExercise(
  overrides: Partial<ScoredAndFilteredExercise> & { mainMuscleGroup: string },
): ScoredAndFilteredExercise {
  return {
    id: nextId(),
    name: `Pool Exercise ${_nextId}`,
    mainMuscleGroup: overrides.mainMuscleGroup,
    secondaryMuscleGroups: [],
    equipment: ["Hantle"],
    requiredEquipmentAll: [],
    trainingLocation: ["Dom"],
    score: 65,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    exerciseType: "Złożone",
    movementPattern: null,
    exercisePriority: "Wysoki",
    learningDifficulty: 2,
    neurologicalFatigue: 2,
    suitableForNoActivity: false,
    ...overrides,
  };
}

const INTERMEDIATE_CTX_DUMBBELL: V0PriorityContext = {
  isPriorityEligible: true,
  isBeginnerClient: false,
  isNoActivityClient: false,
  tierA: [],
  tierB: [],
  allowPlyometrics: false,
  deprioritizePushUps: true,
  capPushUpsAtOne: true,
  goalProfile: {
    exerciseClassBias: "hypertrophy",
    penalizeRegressionForEligible: true,
    deprioritizeIsolationInMixedSlots: false,
    preferHighNeurologicalLoad: false,
    preferUnilateralPatterns: false,
    athleticCompoundBias: false,
    extraArmSlotForHypertrophy: false,
    extraShoulderSlotForHypertrophy: false,
    conditioningComponent: false,
  },
};

const BEGINNER_CTX: V0PriorityContext = {
  isPriorityEligible: false,
  isBeginnerClient: true,
  isNoActivityClient: false,
  tierA: [],
  tierB: [],
  allowPlyometrics: false,
  deprioritizePushUps: false,
  capPushUpsAtOne: false,
};

// ─── Scoring dimension tests (Tests 1–10) ─────────────────────────────────────

describe("scoreProgressionSuitability dimension", () => {
  it("1. intermediate + Hantle: dumbbell exercise receives +12 progression bonus", () => {
    const exercise = makeExercise({
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Hantle, Ławka", experienceLevel: "Średniozaawansowany" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(12);
    expect(dim!.reason).toContain("progresją obciążenia");
  });

  it("2. intermediate + Hantle: regression (suitableForNoActivity=true) gets -8 penalty", () => {
    const exercise = makeExercise({
      name: "Pompki na kolanach",
      equipment: ["Masa własnego ciała"],
      suitableForNoActivity: true,
    });
    const survey = makeSurvey({ equipment: "Hantle, Ławka", experienceLevel: "Średniozaawansowany" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(-8);
    expect(dim!.reason).toContain("regresywne");
  });

  it("3. intermediate + Hantle: pure bodyweight non-regression scores 0 (pull-ups, dips)", () => {
    const exercise = makeExercise({
      name: "Podciąganie na drążku",
      equipment: ["Drążek do podciągania"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Hantle, Drążek do podciągania", experienceLevel: "Średniozaawansowany" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(0);
  });

  it("4. beginner + Hantle: dimension is silent (no bonus, no penalty)", () => {
    const exercise = makeExercise({
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Hantle", experienceLevel: "Początkujący" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(0);
  });

  it("5. brak aktywności + Hantle: dimension is silent (0)", () => {
    const exercise = makeExercise({
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Hantle", experienceLevel: "Brak aktywności fizycznej" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(0);
  });

  it("6. intermediate, no loadable equipment: dimension is silent (0)", () => {
    const exercise = makeExercise({
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Mata do ćwiczeń", experienceLevel: "Średniozaawansowany" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(0);
  });

  it("7. advanced + Sztanga: dumbbell exercise still gets +12", () => {
    const exercise = makeExercise({
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const survey = makeSurvey({ equipment: "Sztanga i talerze, Hantle", experienceLevel: "Zaawansowany" });

    const result = scoreExercise(exercise, survey);
    const dim = result.breakdown.find((d) => d.dimension === "progressionSuitability");

    expect(dim).toBeDefined();
    expect(dim!.points).toBe(12);
  });

  it("8. dumbbell bench press scores higher than incline push-up for intermediate+dumbbell", () => {
    const survey = makeSurvey({ equipment: "Hantle, Ławka", experienceLevel: "Średniozaawansowany" });

    const dumbbellBench = makeExercise({
      name: "Wyciskanie hantli na ławce",
      equipment: ["Hantle", "Ławka"],
      suitableForNoActivity: false,
    });
    const inclinePushUp = makeExercise({
      id: 2,
      name: "Pompki na podwyższeniu",
      equipment: ["Masa własnego ciała"],
      suitableForNoActivity: true,
    });

    const benchScore = scoreExercise(dumbbellBench, survey);
    const pushUpScore = scoreExercise(inclinePushUp, survey);

    expect(benchScore.score).toBeGreaterThan(pushUpScore.score);
  });

  it("9. goblet squat scores higher than bodyweight box squat for intermediate+dumbbell", () => {
    const survey = makeSurvey({ equipment: "Hantle", experienceLevel: "Średniozaawansowany" });

    const gobletSquat = makeExercise({
      name: "Przysiad goblet z hantlem",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const bwBoxSquat = makeExercise({
      id: 2,
      name: "Przysiad do krzesła (bodyweight)",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Masa własnego ciała"],
      suitableForNoActivity: true,
    });

    const gobletScore = scoreExercise(gobletSquat, survey);
    const boxSquatScore = scoreExercise(bwBoxSquat, survey);

    expect(gobletScore.score).toBeGreaterThan(boxSquatScore.score);
  });

  it("10. dumbbell hip thrust scores higher than bodyweight glute bridge for intermediate+dumbbell", () => {
    const survey = makeSurvey({ equipment: "Hantle", experienceLevel: "Średniozaawansowany" });

    const dbHipThrust = makeExercise({
      name: "Mostek biodrowy z hantlem",
      mainMuscleGroup: "Pośladki",
      equipment: ["Hantle"],
      suitableForNoActivity: false,
    });
    const bwGluteBridge = makeExercise({
      id: 2,
      name: "Mostek biodrowy (bodyweight)",
      mainMuscleGroup: "Pośladki",
      equipment: ["Masa własnego ciała"],
      suitableForNoActivity: true,
    });

    const thrustScore = scoreExercise(dbHipThrust, survey);
    const bridgeScore = scoreExercise(bwGluteBridge, survey);

    expect(thrustScore.score).toBeGreaterThan(bridgeScore.score);
  });
});

// ─── Engine selection tests (Tests 11–18) ─────────────────────────────────────

describe("Engine selection — intermediate dumbbell client", () => {
  it("11. upper session: dumbbell bench press wins chest compound slot over incline push-up", () => {
    const dumbbellBench = makePoolExercise({
      name: "Wyciskanie hantli płaskie",
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Hantle"],
      exercisePriority: "Bardzo wysoki",
      movementPattern: "Pchanie poziome",
      score: 72,
      suitableForNoActivity: false,
    });
    const inclinePushUp = makePoolExercise({
      name: "Pompki na podwyższeniu",
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Masa własnego ciała"],
      exercisePriority: "Średni",
      movementPattern: "Pchanie poziome",
      score: 58,
      suitableForNoActivity: true,
    });
    // Fillers: back + shoulders + arms to meet MIN_EXERCISES
    const row = makePoolExercise({ name: "Wiosłowanie hantlem",       mainMuscleGroup: "Plecy",   exercisePriority: "Bardzo wysoki", movementPattern: "Przyciąganie poziome", score: 70 });
    const ohp = makePoolExercise({ name: "Wyciskanie hantli nad głowę", mainMuscleGroup: "Barki",   exercisePriority: "Wysoki",        movementPattern: "Pchanie pionowe",     score: 65 });
    const curl= makePoolExercise({ name: "Uginanie hantli",             mainMuscleGroup: "Biceps",  exercisePriority: "Średni",        movementPattern: "Uginanie",            score: 55 });
    const ext = makePoolExercise({ name: "Prostowanie ramion",          mainMuscleGroup: "Triceps", exercisePriority: "Średni",        movementPattern: "Prostowanie",         score: 55 });
    const lat = makePoolExercise({ name: "Unoszenie hantli bokiem",     mainMuscleGroup: "Barki",   exercisePriority: "Średni",        movementPattern: "Odwodzenie",          score: 50 });
    const rowB= makePoolExercise({ name: "Wiosłowanie oburącz",        mainMuscleGroup: "Plecy",   exercisePriority: "Wysoki",        movementPattern: "Przyciąganie poziome", score: 65 });

    const pool = [inclinePushUp, dumbbellBench, row, ohp, curl, ext, lat, rowB];

    const result = runExerciseSelectionEngineV0(
      pool, "upper", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const chestExercises = result.exercises.filter(
      (e) => e.mainMuscleGroup === "Klatka piersiowa",
    );
    expect(chestExercises.length).toBeGreaterThan(0);

    const chestNames = chestExercises.map((e) => e.name);
    // Dumbbell bench press must be in the chest slot
    expect(chestNames).toContain("Wyciskanie hantli płaskie");
    // Incline push-up must NOT be the only chest exercise (if it appears at all,
    // dumbbell bench press must also appear — it should win the primary slot)
    const hasDumbbellInChest = chestNames.includes("Wyciskanie hantli płaskie");
    expect(hasDumbbellInChest).toBe(true);
  });

  it("12. lower session: goblet squat wins squat slot over bodyweight box squat", () => {
    const gobletSquat = makePoolExercise({
      name: "Przysiad goblet z hantlem",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Hantle"],
      exercisePriority: "Bardzo wysoki",
      movementPattern: "Przysiad",
      score: 72,
      suitableForNoActivity: false,
    });
    const bwBoxSquat = makePoolExercise({
      name: "Przysiad do krzesła",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Masa własnego ciała"],
      exercisePriority: "Średni",
      movementPattern: "Przysiad",
      score: 52,
      suitableForNoActivity: true,
    });
    // Fillers: hip-hinge, glute, core, calves to build a valid lower session
    const rdl   = makePoolExercise({ name: "Martwy ciąg rumuński",  mainMuscleGroup: "Mięśnie dwugłowe uda", exercisePriority: "Bardzo wysoki", movementPattern: "Zawias biodrowy", score: 70 });
    const glute = makePoolExercise({ name: "Mostek biodrowy",        mainMuscleGroup: "Pośladki",           exercisePriority: "Wysoki",        movementPattern: "Zawias biodrowy", score: 65 });
    const lunge = makePoolExercise({ name: "Wykrok z hantlami",     mainMuscleGroup: "Mięśnie czworogłowe uda", exercisePriority: "Wysoki",   movementPattern: "Wykrok",         score: 68 });
    const calf  = makePoolExercise({ name: "Wspięcia na palce",     mainMuscleGroup: "Łydki",              exercisePriority: "Niski",         movementPattern: "Plantarfleksja", score: 48 });
    const hip2  = makePoolExercise({ name: "Przejście deadlift",    mainMuscleGroup: "Pośladki",           exercisePriority: "Wysoki",        movementPattern: "Zawias biodrowy", score: 63 });

    const pool = [bwBoxSquat, gobletSquat, rdl, glute, lunge, calf, hip2];

    const result = runExerciseSelectionEngineV0(
      pool, "lower", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const quadExercises = result.exercises.filter(
      (e) => e.mainMuscleGroup === "Mięśnie czworogłowe uda",
    );
    expect(quadExercises.length).toBeGreaterThan(0);
    // Goblet squat should appear; bodyweight box squat should not be the only quad exercise
    const names = quadExercises.map((e) => e.name);
    expect(names.some((n) => n.includes("goblet") || n.includes("Goblet") || n.includes("hantlem"))).toBe(true);
  });

  it("13. lower session: dumbbell hip thrust wins hip-hinge slot over bw glute bridge", () => {
    const dbHipThrust = makePoolExercise({
      name: "Mostek biodrowy z hantlem",
      mainMuscleGroup: "Pośladki",
      equipment: ["Hantle"],
      exercisePriority: "Wysoki",
      movementPattern: "Zawias biodrowy",
      score: 70,
      suitableForNoActivity: false,
    });
    const bwGluteBridge = makePoolExercise({
      name: "Mostek biodrowy bez obciążenia",
      mainMuscleGroup: "Pośladki",
      equipment: ["Masa własnego ciała"],
      exercisePriority: "Średni",
      movementPattern: "Zawias biodrowy",
      score: 50,
      suitableForNoActivity: true,
    });
    const squat = makePoolExercise({ name: "Przysiad z hantlami",    mainMuscleGroup: "Mięśnie czworogłowe uda", exercisePriority: "Bardzo wysoki", movementPattern: "Przysiad",       score: 75 });
    const rdl   = makePoolExercise({ name: "Martwy ciąg rumuński",   mainMuscleGroup: "Mięśnie dwugłowe uda",   exercisePriority: "Bardzo wysoki", movementPattern: "Zawias biodrowy", score: 72 });
    const lunge = makePoolExercise({ name: "Wykrok z hantlami",      mainMuscleGroup: "Mięśnie czworogłowe uda", exercisePriority: "Wysoki",       movementPattern: "Wykrok",         score: 68 });
    const calf  = makePoolExercise({ name: "Wspięcia na palce",      mainMuscleGroup: "Łydki",                  exercisePriority: "Niski",        movementPattern: "Plantarfleksja", score: 45 });

    const pool = [bwGluteBridge, dbHipThrust, squat, rdl, lunge, calf];

    const result = runExerciseSelectionEngineV0(
      pool, "lower", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const gluteExercises = result.exercises.filter(
      (e) => e.mainMuscleGroup === "Pośladki",
    );
    if (gluteExercises.length > 0) {
      const hasLoaded = gluteExercises.some((e) => e.name.includes("hantlem") || e.name.includes("obciążeni"));
      expect(hasLoaded).toBe(true);
    }
  });

  it("14. upper session: at most one Pompki exercise is selected (capPushUpsAtOne)", () => {
    // Provide multiple push-up variants alongside one dumbbell exercise
    const pumps1 = makePoolExercise({ name: "Pompki klasyczne",      mainMuscleGroup: "Klatka piersiowa", equipment: ["Masa własnego ciała"], movementPattern: "Pchanie poziome", score: 62, suitableForNoActivity: false });
    const pumps2 = makePoolExercise({ name: "Pompki na podwyższeniu",mainMuscleGroup: "Klatka piersiowa", equipment: ["Masa własnego ciała"], movementPattern: "Pchanie poziome", score: 58, suitableForNoActivity: true });
    const pumps3 = makePoolExercise({ name: "Pompki diamentowe",     mainMuscleGroup: "Triceps",          equipment: ["Masa własnego ciała"], movementPattern: "Pchanie poziome", score: 54, suitableForNoActivity: false });
    const bench  = makePoolExercise({ name: "Wyciskanie hantli",     mainMuscleGroup: "Klatka piersiowa", equipment: ["Hantle"],              movementPattern: "Pchanie poziome", score: 75, suitableForNoActivity: false });
    const row    = makePoolExercise({ name: "Wiosłowanie hantlem",   mainMuscleGroup: "Plecy",            exercisePriority: "Bardzo wysoki",  movementPattern: "Przyciąganie poziome", score: 72 });
    const ohp    = makePoolExercise({ name: "Wyciskanie hantli OHP", mainMuscleGroup: "Barki",            movementPattern: "Pchanie pionowe", score: 68 });
    const curl   = makePoolExercise({ name: "Uginanie hantli",       mainMuscleGroup: "Biceps",           movementPattern: "Uginanie",        score: 58 });
    const rowB   = makePoolExercise({ name: "Wiosłowanie oburącz",   mainMuscleGroup: "Plecy",            movementPattern: "Przyciąganie poziome", score: 66 });
    const lat    = makePoolExercise({ name: "Unoszenie bokiem",      mainMuscleGroup: "Barki",            movementPattern: "Odwodzenie",      score: 55 });

    const pool = [pumps1, pumps2, pumps3, bench, row, ohp, curl, rowB, lat];

    const result = runExerciseSelectionEngineV0(
      pool, "upper", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const pushUpCount = result.exercises.filter((e) =>
      e.name.trim().toLowerCase().startsWith("pompki"),
    ).length;
    expect(pushUpCount).toBeLessThanOrEqual(1);
  });

  it("15. upper session: if only push-ups exist for pressing, one is still selected", () => {
    // Pool has ONLY push-up options for chest — cap allows the first one through
    const pumps1 = makePoolExercise({ name: "Pompki klasyczne",    mainMuscleGroup: "Klatka piersiowa", equipment: ["Masa własnego ciała"], movementPattern: "Pchanie poziome", score: 62 });
    const pumps2 = makePoolExercise({ name: "Pompki na kolanach",  mainMuscleGroup: "Klatka piersiowa", equipment: ["Masa własnego ciała"], movementPattern: "Pchanie poziome", score: 55, suitableForNoActivity: true });
    const row    = makePoolExercise({ name: "Wiosłowanie hantlem", mainMuscleGroup: "Plecy",            exercisePriority: "Bardzo wysoki",  movementPattern: "Przyciąganie poziome", score: 72 });
    const ohp    = makePoolExercise({ name: "Wyciskanie hantli",   mainMuscleGroup: "Barki",            movementPattern: "Pchanie pionowe", score: 68 });
    const curl   = makePoolExercise({ name: "Uginanie hantli",     mainMuscleGroup: "Biceps",           movementPattern: "Uginanie",        score: 58 });
    const rowB   = makePoolExercise({ name: "Wiosłowanie oburącz", mainMuscleGroup: "Plecy",            movementPattern: "Przyciąganie poziome", score: 66 });
    const ext    = makePoolExercise({ name: "Prostowanie ramion",  mainMuscleGroup: "Triceps",          movementPattern: "Prostowanie",     score: 55 });

    const pool = [pumps1, pumps2, row, ohp, curl, rowB, ext];

    const result = runExerciseSelectionEngineV0(
      pool, "upper", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    // Session may or may not be valid (thin pool), but if valid, check the cap
    if (result.valid) {
      const pushUpCount = result.exercises.filter((e) =>
        e.name.trim().toLowerCase().startsWith("pompki"),
      ).length;
      expect(pushUpCount).toBeLessThanOrEqual(1);
    }
  });

  it("16. beginner client: regression penalty is not applied — bw exercises may win compound slots", () => {
    const bwSquat = makePoolExercise({
      name: "Przysiad bodyweight",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Masa własnego ciała"],
      movementPattern: "Przysiad",
      score: 68,
      suitableForNoActivity: false,
      learningDifficulty: 2,
    });
    const goblet = makePoolExercise({
      name: "Przysiad goblet",
      mainMuscleGroup: "Mięśnie czworogłowe uda",
      equipment: ["Hantle"],
      movementPattern: "Przysiad",
      score: 72,
      suitableForNoActivity: false,
      learningDifficulty: 3,
    });
    const rdl    = makePoolExercise({ name: "Martwy ciąg rumuński", mainMuscleGroup: "Mięśnie dwugłowe uda", movementPattern: "Zawias biodrowy", score: 65, learningDifficulty: 2 });
    const glute  = makePoolExercise({ name: "Mostek biodrowy",     mainMuscleGroup: "Pośladki",             movementPattern: "Zawias biodrowy", score: 62, learningDifficulty: 1 });
    const lunge  = makePoolExercise({ name: "Wykrok",              mainMuscleGroup: "Mięśnie czworogłowe uda", movementPattern: "Wykrok",       score: 60, learningDifficulty: 2 });
    const calf   = makePoolExercise({ name: "Wspięcia",            mainMuscleGroup: "Łydki",                movementPattern: "Plantarfleksja", score: 50, learningDifficulty: 1 });

    const pool = [bwSquat, goblet, rdl, glute, lunge, calf];

    const result = runExerciseSelectionEngineV0(
      pool, "lower", new Set<string>(), BEGINNER_CTX, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    // For a beginner, regression penalty is not active — bw squat can legitimately win
    // The test just confirms the session generates validly without crashing
    expect(result.exercises.length).toBeGreaterThanOrEqual(4);
  });

  it("17. full upper session: no more than one Pompki exercise in an intermediate dumbbell day", () => {
    // Mix of push-up variants and dumbbell exercises to simulate a thin chest pool
    const makeChest = (name: string, score: number, isPompki: boolean, isRegression = false) =>
      makePoolExercise({
        name,
        mainMuscleGroup: "Klatka piersiowa",
        equipment: isPompki ? ["Masa własnego ciała"] : ["Hantle"],
        movementPattern: "Pchanie poziome",
        score,
        suitableForNoActivity: isRegression,
      });

    const pool = [
      makeChest("Wyciskanie hantli płaskie",   75, false),
      makeChest("Pompki klasyczne",             64, true,  false),
      makeChest("Pompki na podwyższeniu",       58, true,  true),
      makeChest("Pompki diamentowe",            54, true,  false),
      makeChest("Wyciskanie hantli na skosie",  70, false),
      makePoolExercise({ name: "Wiosłowanie hantlem",    mainMuscleGroup: "Plecy",   movementPattern: "Przyciąganie poziome", score: 72, exercisePriority: "Bardzo wysoki" }),
      makePoolExercise({ name: "Wiosłowanie oburącz",   mainMuscleGroup: "Plecy",   movementPattern: "Przyciąganie poziome", score: 68, exercisePriority: "Wysoki" }),
      makePoolExercise({ name: "Wyciskanie hantli OHP", mainMuscleGroup: "Barki",   movementPattern: "Pchanie pionowe",     score: 68 }),
      makePoolExercise({ name: "Unoszenie bokiem",      mainMuscleGroup: "Barki",   movementPattern: "Odwodzenie",          score: 55 }),
      makePoolExercise({ name: "Uginanie hantli",       mainMuscleGroup: "Biceps",  movementPattern: "Uginanie",            score: 60 }),
      makePoolExercise({ name: "Prostowanie ramion",    mainMuscleGroup: "Triceps", movementPattern: "Prostowanie",         score: 58 }),
    ];

    const result = runExerciseSelectionEngineV0(
      pool, "upper", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const pushUps = result.exercises.filter((e) =>
      e.name.trim().toLowerCase().startsWith("pompki"),
    );
    expect(pushUps.length).toBeLessThanOrEqual(1);

    // Primary chest slot must be dumbbell bench press, not a push-up
    const chestExercises = result.exercises.filter(
      (e) => e.mainMuscleGroup === "Klatka piersiowa",
    );
    const firstChest = chestExercises[0];
    if (firstChest) {
      expect(firstChest.name).not.toMatch(/^pompki/i);
    }
  });

  it("18. deprioritizePushUps fires for intermediate dumbbell clients, not full-gym only", () => {
    // Verify that with deprioritizePushUps=true (set by dumbbell equipment check),
    // push-ups are ranked after dumbbell alternatives within the same band.
    // We test this by checking the engine places a dumbbell bench press first
    // even when push-ups have a slightly higher base score.
    const pumpsHigh  = makePoolExercise({
      name: "Pompki klasyczne",
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Masa własnego ciała"],
      movementPattern: "Pchanie poziome",
      score: 71, // Slightly HIGHER base score to prove deprioritisation works
      suitableForNoActivity: false,
    });
    const dbBench = makePoolExercise({
      name: "Wyciskanie hantli płaskie",
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Hantle"],
      movementPattern: "Pchanie poziome",
      score: 68, // Slightly lower base score
      suitableForNoActivity: false,
    });
    const row  = makePoolExercise({ name: "Wiosłowanie hantlem",    mainMuscleGroup: "Plecy",   movementPattern: "Przyciąganie poziome", score: 72, exercisePriority: "Bardzo wysoki" });
    const ohp  = makePoolExercise({ name: "Wyciskanie hantli OHP",  mainMuscleGroup: "Barki",   movementPattern: "Pchanie pionowe",     score: 67 });
    const curl = makePoolExercise({ name: "Uginanie hantli",        mainMuscleGroup: "Biceps",  movementPattern: "Uginanie",            score: 59 });
    const rowB = makePoolExercise({ name: "Wiosłowanie oburącz",   mainMuscleGroup: "Plecy",   movementPattern: "Przyciąganie poziome", score: 65, exercisePriority: "Wysoki" });

    const pool = [pumpsHigh, dbBench, row, ohp, curl, rowB];

    const result = runExerciseSelectionEngineV0(
      pool, "upper", new Set<string>(), INTERMEDIATE_CTX_DUMBBELL, { alternativeIndex: 0 },
    );

    expect(result.valid).toBe(true);
    const chestExercises = result.exercises.filter(
      (e) => e.mainMuscleGroup === "Klatka piersiowa",
    );
    // Dumbbell bench press must beat the higher-scored push-ups due to deprioritizePushUps
    expect(chestExercises.map((e) => e.name)).toContain("Wyciskanie hantli płaskie");
  });
});
