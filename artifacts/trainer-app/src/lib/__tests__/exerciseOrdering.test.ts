/**
 * Exercise Session Ordering — Stage 2 tests
 *
 * Pure unit tests: no database, no network, no component rendering.
 * Tests cover only orderExercisesForSession().
 * Classification helper tests (getSessionTier, getPriorityRank, etc.)
 * are in exerciseClassification.test.ts — not duplicated here.
 */

import { describe, it, expect } from "vitest";
import { orderExercisesForSession, type ExerciseOrderingInput } from "../exerciseOrdering";
import { EXERCISE_TYPE, EXERCISE_PRIORITY } from "../exerciseClassification";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function make(
  id: number,
  overrides: Partial<ExerciseOrderingInput> = {},
): ExerciseOrderingInput & { id: number } {
  return {
    id,
    exerciseType: null,
    neurologicalFatigue: null,
    learningDifficulty: null,
    exercisePriority: null,
    mainMuscleGroup: null,
    ...overrides,
  };
}

function compound(id: number, fatigue = 3): ExerciseOrderingInput & { id: number } {
  return make(id, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: fatigue });
}

function isolation(id: number): ExerciseOrderingInput & { id: number } {
  return make(id, { exerciseType: EXERCISE_TYPE.ISOLATION });
}

function core(id: number): ExerciseOrderingInput & { id: number } {
  return make(id, { mainMuscleGroup: "Brzuch" });
}

function ids(result: Array<{ id: number }>): number[] {
  return result.map((r) => r.id);
}

// ─── Tier ordering ────────────────────────────────────────────────────────────

describe("orderExercisesForSession() — tier ordering", () => {
  it("compound (primary) comes before isolation", () => {
    const input = [isolation(2), compound(1, 5)];
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2]);
  });

  it("secondary compound (low fatigue) comes before accessory (unknown type)", () => {
    const input = [make(2), compound(1, 1)]; // make(2) → accessory
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2]);
  });

  it("accessory (unknown type) comes before isolation", () => {
    const input = [isolation(2), make(1)];
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2]);
  });

  it("core exercise is always last regardless of input position", () => {
    const input = [core(1), compound(2, 5), isolation(3)];
    const result = ids(orderExercisesForSession(input));
    expect(result[result.length - 1]).toBe(1); // core last
    expect(result[0]).toBe(2);                 // primary compound first
  });

  it("core in the middle of input → moves to last position", () => {
    const input = [isolation(1), core(2), compound(3, 4)];
    const result = ids(orderExercisesForSession(input));
    expect(result[result.length - 1]).toBe(2);
  });

  it("primary_compound (fatigue ≥ 4) before secondary_compound (fatigue < 4)", () => {
    const input = [compound(2, 2), compound(1, 5)];
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2]);
  });

  it("full tier sequence: primary → secondary → accessory → isolation → core", () => {
    const input = [
      isolation(4),
      core(5),
      make(3),           // accessory
      compound(2, 2),    // secondary
      compound(1, 5),    // primary
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2, 3, 4, 5]);
  });
});

// ─── Fatigue ordering ─────────────────────────────────────────────────────────

describe("orderExercisesForSession() — neurological fatigue ordering", () => {
  it("within the same tier, higher fatigue comes first", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: 2 }),
      make(2, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: 5 }),
      make(3, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: 3 }),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 3, 1]);
  });

  it("null fatigue treated as 0 (lower priority, placed after non-null)", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: null }),
      make(2, { exerciseType: EXERCISE_TYPE.COMPOUND, neurologicalFatigue: 3 }),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe("orderExercisesForSession() — exercise priority ordering", () => {
  it("within same tier + same fatigue, higher priority comes first", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.ISOLATION, exercisePriority: EXERCISE_PRIORITY.LOW }),
      make(2, { exerciseType: EXERCISE_TYPE.ISOLATION, exercisePriority: EXERCISE_PRIORITY.VERY_HIGH }),
      make(3, { exerciseType: EXERCISE_TYPE.ISOLATION, exercisePriority: EXERCISE_PRIORITY.MEDIUM }),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 3, 1]);
  });

  it("null priority treated as medium (rank 2)", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.ISOLATION, exercisePriority: EXERCISE_PRIORITY.LOW }),
      make(2, { exerciseType: EXERCISE_TYPE.ISOLATION, exercisePriority: null }),
    ];
    // null → rank 2 (medium), LOW → rank 3; medium comes first
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });
});

// ─── Learning difficulty ordering ─────────────────────────────────────────────

describe("orderExercisesForSession() — learning difficulty ordering", () => {
  it("within same tier + same fatigue + same priority, higher difficulty comes first", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.ISOLATION, learningDifficulty: 1 }),
      make(2, { exerciseType: EXERCISE_TYPE.ISOLATION, learningDifficulty: 4 }),
      make(3, { exerciseType: EXERCISE_TYPE.ISOLATION, learningDifficulty: 2 }),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 3, 1]);
  });

  it("null difficulty treated as 0 (placed after exercises with explicit difficulty)", () => {
    const input = [
      make(1, { exerciseType: EXERCISE_TYPE.ISOLATION, learningDifficulty: null }),
      make(2, { exerciseType: EXERCISE_TYPE.ISOLATION, learningDifficulty: 2 }),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });
});

// ─── Stable tie-breaking ──────────────────────────────────────────────────────

describe("orderExercisesForSession() — stable tie-breaking", () => {
  it("original array order is preserved when all classification fields are equal", () => {
    const input = [make(3), make(1), make(2)];
    expect(ids(orderExercisesForSession(input))).toEqual([3, 1, 2]);
  });

  it("original index is the stable tie-breaker even across many items", () => {
    const input = Array.from({ length: 6 }, (_, i) =>
      make(i + 1, { exerciseType: EXERCISE_TYPE.ISOLATION }),
    );
    // All isolation with same metadata → original order preserved
    expect(ids(orderExercisesForSession(input))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ─── Missing metadata fallback ────────────────────────────────────────────────

describe("orderExercisesForSession() — missing metadata", () => {
  it("all-null input is treated as accessory (placed after known compounds)", () => {
    const input = [make(1), compound(2, 5)]; // make(1) → all null → accessory
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });

  it("unknown exerciseType string is treated as accessory", () => {
    const input = [
      make(1, { exerciseType: "Nieznane" }), // unknown → accessory
      compound(2, 5),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });

  it("movementPattern alone does not change the tier (still accessory)", () => {
    const input = [
      make(1, { exerciseType: null }),
      compound(2, 5),
    ];
    expect(ids(orderExercisesForSession(input))).toEqual([2, 1]);
  });
});

// ─── Immutability and identity ────────────────────────────────────────────────

describe("orderExercisesForSession() — immutability and identity", () => {
  it("does not mutate the input array", () => {
    const input = [isolation(2), compound(1, 5)];
    const inputCopy = [...input];
    orderExercisesForSession(input);
    expect(input).toEqual(inputCopy);
  });

  it("preserves exact exercise count", () => {
    const input = [core(3), isolation(2), compound(1, 5), make(4)];
    const result = orderExercisesForSession(input);
    expect(result).toHaveLength(input.length);
  });

  it("preserves exact exercise IDs (same set, only order changes)", () => {
    const input = [core(3), isolation(2), compound(1, 5), make(4)];
    const result = orderExercisesForSession(input);
    expect(ids(result).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("returns a new array reference (does not return the input)", () => {
    const input = [compound(1, 5)];
    const result = orderExercisesForSession(input);
    expect(result).not.toBe(input);
  });

  it("empty input returns empty array", () => {
    expect(orderExercisesForSession([])).toEqual([]);
  });

  it("single-item input returns array with that item", () => {
    const input = [compound(1, 5)];
    const result = orderExercisesForSession(input);
    expect(ids(result)).toEqual([1]);
  });
});
