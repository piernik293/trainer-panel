/**
 * Exercise Classification Foundation — Stage 1 tests
 *
 * Pure unit tests: no database, no network, no component rendering.
 * All helpers must return safe defaults for missing or invalid inputs.
 */

import { describe, it, expect } from "vitest";
import {
  EXERCISE_TYPE,
  EXERCISE_PRIORITY,
  getFatigueBand,
  getPriorityRank,
  isHighDemandExercise,
  getSessionTier,
  classifyExercise,
  type ExerciseClassificationInput,
} from "../exerciseClassification";

// ─── getFatigueBand ───────────────────────────────────────────────────────────

describe("getFatigueBand()", () => {
  it("returns 'high' for neurological_fatigue 4", () => {
    expect(getFatigueBand(4)).toBe("high");
  });

  it("returns 'high' for neurological_fatigue 5", () => {
    expect(getFatigueBand(5)).toBe("high");
  });

  it("returns 'medium' for neurological_fatigue 3", () => {
    expect(getFatigueBand(3)).toBe("medium");
  });

  it("returns 'medium' for neurological_fatigue 2", () => {
    expect(getFatigueBand(2)).toBe("medium");
  });

  it("returns 'low' for neurological_fatigue 1", () => {
    expect(getFatigueBand(1)).toBe("low");
  });

  it("returns 'medium' for null", () => {
    expect(getFatigueBand(null)).toBe("medium");
  });

  it("returns 'medium' for undefined", () => {
    expect(getFatigueBand(undefined)).toBe("medium");
  });

  it("returns 'medium' for 0 (out of 1–5 range)", () => {
    expect(getFatigueBand(0)).toBe("medium");
  });

  it("returns 'medium' for 6 (out of 1–5 range)", () => {
    expect(getFatigueBand(6)).toBe("medium");
  });

  it("returns 'medium' for negative values", () => {
    expect(getFatigueBand(-1)).toBe("medium");
  });

  it("returns 'medium' for NaN", () => {
    expect(getFatigueBand(NaN)).toBe("medium");
  });

  it("returns 'medium' for Infinity", () => {
    expect(getFatigueBand(Infinity)).toBe("medium");
  });
});

// ─── getPriorityRank ──────────────────────────────────────────────────────────

describe("getPriorityRank()", () => {
  it("returns 0 for 'Bardzo wysoki'", () => {
    expect(getPriorityRank(EXERCISE_PRIORITY.VERY_HIGH)).toBe(0);
  });

  it("returns 1 for 'Wysoki'", () => {
    expect(getPriorityRank(EXERCISE_PRIORITY.HIGH)).toBe(1);
  });

  it("returns 2 for 'Średni'", () => {
    expect(getPriorityRank(EXERCISE_PRIORITY.MEDIUM)).toBe(2);
  });

  it("returns 3 for 'Niski'", () => {
    expect(getPriorityRank(EXERCISE_PRIORITY.LOW)).toBe(3);
  });

  it("returns 2 for null", () => {
    expect(getPriorityRank(null)).toBe(2);
  });

  it("returns 2 for undefined", () => {
    expect(getPriorityRank(undefined)).toBe(2);
  });

  it("returns 2 for an unknown string", () => {
    expect(getPriorityRank("Very high")).toBe(2); // English — not a DB value
    expect(getPriorityRank("BARDZO WYSOKI")).toBe(2); // wrong casing
    expect(getPriorityRank("")).toBe(2);
  });
});

// ─── isHighDemandExercise ─────────────────────────────────────────────────────

describe("isHighDemandExercise()", () => {
  it("returns true for compound + neurological_fatigue 4", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 4,
    })).toBe(true);
  });

  it("returns true for compound + neurological_fatigue 5", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
    })).toBe(true);
  });

  it("returns false for compound + neurological_fatigue 3 (below threshold)", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 3,
    })).toBe(false);
  });

  it("returns false for compound + neurological_fatigue 1", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 1,
    })).toBe(false);
  });

  it("returns false for isolation + high neurological_fatigue", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      neurologicalFatigue: 5,
    })).toBe(false);
  });

  it("returns false for compound with null neurological_fatigue", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: null,
    })).toBe(false);
  });

  it("returns false for compound with undefined neurological_fatigue", () => {
    expect(isHighDemandExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
    })).toBe(false);
  });

  it("returns false when exerciseType is null (even with high fatigue)", () => {
    expect(isHighDemandExercise({
      exerciseType: null,
      neurologicalFatigue: 5,
    })).toBe(false);
  });

  it("returns false for all-missing input", () => {
    expect(isHighDemandExercise({})).toBe(false);
  });
});

// ─── getSessionTier ───────────────────────────────────────────────────────────

describe("getSessionTier()", () => {
  // Rule 1 — core_finisher
  it("returns 'core_finisher' for Brzuch mainMuscleGroup", () => {
    expect(getSessionTier({ mainMuscleGroup: "Brzuch" })).toBe("core_finisher");
  });

  it("returns 'core_finisher' for Brzuch even when exerciseType is compound", () => {
    expect(getSessionTier({
      mainMuscleGroup: "Brzuch",
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
    })).toBe("core_finisher");
  });

  // Rule 2 — primary_compound
  it("returns 'primary_compound' for compound + neurological_fatigue 4", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 4,
    })).toBe("primary_compound");
  });

  it("returns 'primary_compound' for compound + neurological_fatigue 5", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
    })).toBe("primary_compound");
  });

  // Rule 3 — secondary_compound
  it("returns 'secondary_compound' for compound + neurological_fatigue 3", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 3,
    })).toBe("secondary_compound");
  });

  it("returns 'secondary_compound' for compound + neurological_fatigue 1", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 1,
    })).toBe("secondary_compound");
  });

  it("returns 'secondary_compound' for compound + null neurological_fatigue", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: null,
    })).toBe("secondary_compound");
  });

  it("returns 'secondary_compound' for compound with no fatigue field at all", () => {
    expect(getSessionTier({ exerciseType: EXERCISE_TYPE.COMPOUND })).toBe("secondary_compound");
  });

  // Rule 4 — isolation
  it("returns 'isolation' for isolation exerciseType", () => {
    expect(getSessionTier({ exerciseType: EXERCISE_TYPE.ISOLATION })).toBe("isolation");
  });

  it("returns 'isolation' for isolation + high neurological_fatigue (not compound → no primary)", () => {
    expect(getSessionTier({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      neurologicalFatigue: 5,
    })).toBe("isolation");
  });

  // Rule 5 — accessory (unknown/missing)
  it("returns 'accessory' for unknown exerciseType string", () => {
    expect(getSessionTier({ exerciseType: "Nieznane" })).toBe("accessory");
  });

  it("returns 'accessory' for null exerciseType", () => {
    expect(getSessionTier({ exerciseType: null })).toBe("accessory");
  });

  it("returns 'accessory' for all-null / all-missing input", () => {
    expect(getSessionTier({})).toBe("accessory");
    expect(getSessionTier({ exerciseType: null, neurologicalFatigue: null })).toBe("accessory");
  });

  it("movementPattern alone does not force a tier (returns accessory)", () => {
    expect(getSessionTier({ movementPattern: "Pchnięcie" })).toBe("accessory");
    expect(getSessionTier({ movementPattern: "Przysiad" })).toBe("accessory");
  });

  it("non-Brzuch mainMuscleGroup without exerciseType returns accessory", () => {
    expect(getSessionTier({ mainMuscleGroup: "Łydki" })).toBe("accessory");
    expect(getSessionTier({ mainMuscleGroup: "Biceps" })).toBe("accessory");
    expect(getSessionTier({ mainMuscleGroup: "Klatka piersiowa" })).toBe("accessory");
  });

  it("exercise names are not needed — classification works from metadata only", () => {
    // Confirm that getSessionTier does not use a 'name' property
    const input: ExerciseClassificationInput = {
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
    };
    expect(getSessionTier(input)).toBe("primary_compound");
  });
});

// ─── classifyExercise ─────────────────────────────────────────────────────────

describe("classifyExercise()", () => {
  it("returns all four derived values for a fully specified compound exercise", () => {
    const result = classifyExercise({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
      exercisePriority: EXERCISE_PRIORITY.VERY_HIGH,
      mainMuscleGroup: "Plecy",
    });
    expect(result.sessionTier).toBe("primary_compound");
    expect(result.fatigueBand).toBe("high");
    expect(result.priorityRank).toBe(0);
    expect(result.isHighDemand).toBe(true);
  });

  it("returns all four derived values for an isolation exercise with low priority", () => {
    const result = classifyExercise({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      neurologicalFatigue: 2,
      exercisePriority: EXERCISE_PRIORITY.LOW,
      mainMuscleGroup: "Biceps",
    });
    expect(result.sessionTier).toBe("isolation");
    expect(result.fatigueBand).toBe("medium");
    expect(result.priorityRank).toBe(3);
    expect(result.isHighDemand).toBe(false);
  });

  it("applies fallbacks correctly for all-missing input", () => {
    const result = classifyExercise({});
    expect(result.sessionTier).toBe("accessory");
    expect(result.fatigueBand).toBe("medium");
    expect(result.priorityRank).toBe(2);
    expect(result.isHighDemand).toBe(false);
  });

  it("returns a core_finisher for Brzuch regardless of other fields", () => {
    const result = classifyExercise({
      mainMuscleGroup: "Brzuch",
      exerciseType: EXERCISE_TYPE.ISOLATION,
      neurologicalFatigue: 1,
      exercisePriority: EXERCISE_PRIORITY.LOW,
    });
    expect(result.sessionTier).toBe("core_finisher");
    expect(result.isHighDemand).toBe(false);
  });
});

// ─── Canonical constants ──────────────────────────────────────────────────────

describe("EXERCISE_TYPE constants", () => {
  it("COMPOUND is the canonical Polish DB value", () => {
    expect(EXERCISE_TYPE.COMPOUND).toBe("Złożone");
  });
  it("ISOLATION is the canonical Polish DB value", () => {
    expect(EXERCISE_TYPE.ISOLATION).toBe("Izolowane");
  });
});

describe("EXERCISE_PRIORITY constants", () => {
  it("all four priority values match the DB strings", () => {
    expect(EXERCISE_PRIORITY.VERY_HIGH).toBe("Bardzo wysoki");
    expect(EXERCISE_PRIORITY.HIGH).toBe("Wysoki");
    expect(EXERCISE_PRIORITY.MEDIUM).toBe("Średni");
    expect(EXERCISE_PRIORITY.LOW).toBe("Niski");
  });
});
