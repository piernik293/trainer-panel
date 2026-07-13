/**
 * Unit tests for exerciseDraftHelpers — Phase 4A exercise step pure functions.
 *
 * No database, no network, no component rendering.
 */

import { describe, it, expect } from "vitest";
import {
  EXERCISE_STEP_INCOMPLETE,
  EXERCISE_DAY_EMPTY,
  EXERCISE_SELECTION_VALID,
  getExerciseStepValidation,
  addExerciseToDay,
  removeExerciseFromDay,
  updateDraftExerciseField,
  reorderExercisesInDay,
  validateSets,
  validateReps,
  validateRir,
  DRAFT_EXERCISE_DEFAULTS,
  type DraftExercise,
  type ExerciseDraftByDay,
} from "../exerciseDraftHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DAYS = [
  { dayIndex: 0 },
  { dayIndex: 1 },
  { dayIndex: 2 },
  { dayIndex: 3 },
];

function makeExercise(overrides: Partial<DraftExercise> = {}): Omit<DraftExercise, "localId" | "order"> {
  return {
    exerciseId: 1,
    exerciseName: "Wyciskanie sztangi",
    mainMuscleGroup: "Klatka piersiowa",
    equipment: ["Sztanga", "Ławka"],
    isCore: false,
    sets: DRAFT_EXERCISE_DEFAULTS.sets,
    repsMin: DRAFT_EXERCISE_DEFAULTS.repsMin,
    repsMax: DRAFT_EXERCISE_DEFAULTS.repsMax,
    rir: DRAFT_EXERCISE_DEFAULTS.rir,
    restSeconds: DRAFT_EXERCISE_DEFAULTS.restSeconds,
    ...overrides,
  };
}

function buildDraft(...dayExerciseCounts: number[]): ExerciseDraftByDay {
  const draft: ExerciseDraftByDay = {};
  dayExerciseCounts.forEach((count, i) => {
    draft[i] = Array.from({ length: count }, (_, j) => ({
      localId: `local-${i}-${j}`,
      exerciseId: j + 1,
      exerciseName: `Exercise ${j + 1}`,
      mainMuscleGroup: "Klatka piersiowa",
      equipment: [],
      isCore: false,
      order: j,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      rir: 2,
      restSeconds: 90,
    }));
  });
  return draft;
}

// ─── getExerciseStepValidation ────────────────────────────────────────────────

describe("getExerciseStepValidation", () => {
  it("empty draft → EXERCISE_STEP_INCOMPLETE", () => {
    expect(getExerciseStepValidation(DAYS, {}).code).toBe(EXERCISE_STEP_INCOMPLETE);
  });

  it("all days have exercises → EXERCISE_SELECTION_VALID", () => {
    const draft = buildDraft(1, 2, 1, 1);
    expect(getExerciseStepValidation(DAYS, draft).code).toBe(EXERCISE_SELECTION_VALID);
  });

  it("one day empty → EXERCISE_DAY_EMPTY with emptyDayIndex", () => {
    // Day 0 has exercises, day 1 is empty
    const draft = buildDraft(2, 0, 1, 1);
    const result = getExerciseStepValidation(DAYS, draft);
    expect(result.code).toBe(EXERCISE_DAY_EMPTY);
    expect(result.emptyDayIndex).toBe(1);
  });

  it("identifies the first empty day when multiple are empty", () => {
    const draft = buildDraft(1, 0, 0, 1);
    const result = getExerciseStepValidation(DAYS, draft);
    expect(result.code).toBe(EXERCISE_DAY_EMPTY);
    expect(result.emptyDayIndex).toBe(1); // first empty
  });

  it("zero-day plan with exercises in draft[0] → EXERCISE_SELECTION_VALID", () => {
    const draft = buildDraft(2);
    const result = getExerciseStepValidation([{ dayIndex: 0 }], draft);
    expect(result.code).toBe(EXERCISE_SELECTION_VALID);
  });

  it("draft has extra keys for non-existent days — only checks requested days", () => {
    // Only 1 day requested; draft has exercise for day 0 only
    const draft = buildDraft(2);
    const result = getExerciseStepValidation([{ dayIndex: 0 }], draft);
    expect(result.code).toBe(EXERCISE_SELECTION_VALID);
  });
});

// ─── addExerciseToDay ─────────────────────────────────────────────────────────

describe("addExerciseToDay", () => {
  it("adds first exercise to empty day", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    expect(draft[0]).toHaveLength(1);
    expect(draft[0]![0]!.exerciseName).toBe("Wyciskanie sztangi");
  });

  it("assigns localId and order 0 to first exercise", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    expect(draft[0]![0]!.localId).toBeTruthy();
    expect(draft[0]![0]!.order).toBe(0);
  });

  it("appends normal exercise before core exercises", () => {
    let draft = addExerciseToDay({}, 0, makeExercise({ isCore: true }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "Normalne" }));
    const names = draft[0]!.map((e) => e.exerciseName);
    // Normal exercise first, core last
    expect(names[0]).toBe("Normalne");
    expect(names[1]).toBe("Wyciskanie sztangi"); // core
  });

  it("core exercises are always appended after normal exercises", () => {
    let draft = addExerciseToDay({}, 0, makeExercise({ exerciseName: "A" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "B" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "Core", isCore: true }));
    const names = draft[0]!.map((e) => e.exerciseName);
    expect(names).toEqual(["A", "B", "Core"]);
  });

  it("order values are sequential starting from 0", () => {
    let draft = addExerciseToDay({}, 0, makeExercise());
    draft = addExerciseToDay(draft, 0, makeExercise());
    const orders = draft[0]!.map((e) => e.order);
    expect(orders).toEqual([0, 1]);
  });

  it("does not mutate the original draft", () => {
    const original: ExerciseDraftByDay = {};
    addExerciseToDay(original, 0, makeExercise());
    expect(original[0]).toBeUndefined();
  });

  it("exercises have default sets/repsMin/repsMax/rir/restSeconds", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    const ex = draft[0]![0]!;
    expect(ex.sets).toBe(DRAFT_EXERCISE_DEFAULTS.sets);
    expect(ex.repsMin).toBe(DRAFT_EXERCISE_DEFAULTS.repsMin);
    expect(ex.repsMax).toBe(DRAFT_EXERCISE_DEFAULTS.repsMax);
    expect(ex.rir).toBe(DRAFT_EXERCISE_DEFAULTS.rir);
    expect(ex.restSeconds).toBe(DRAFT_EXERCISE_DEFAULTS.restSeconds);
  });
});

// ─── removeExerciseFromDay ────────────────────────────────────────────────────

describe("removeExerciseFromDay", () => {
  it("removes the target exercise", () => {
    let draft = addExerciseToDay({}, 0, makeExercise({ exerciseName: "A" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "B" }));
    const localIdA = draft[0]![0]!.localId;
    const after = removeExerciseFromDay(draft, 0, localIdA);
    expect(after[0]).toHaveLength(1);
    expect(after[0]![0]!.exerciseName).toBe("B");
  });

  it("re-assigns sequential order after removal", () => {
    let draft = addExerciseToDay({}, 0, makeExercise());
    draft = addExerciseToDay(draft, 0, makeExercise());
    draft = addExerciseToDay(draft, 0, makeExercise());
    const idToRemove = draft[0]![1]!.localId;
    const after = removeExerciseFromDay(draft, 0, idToRemove);
    const orders = after[0]!.map((e) => e.order);
    expect(orders).toEqual([0, 1]);
  });

  it("ignores non-existent localId", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    const after = removeExerciseFromDay(draft, 0, "nonexistent");
    expect(after[0]).toHaveLength(1);
  });

  it("does not mutate the original draft", () => {
    let draft = addExerciseToDay({}, 0, makeExercise());
    const id = draft[0]![0]!.localId;
    removeExerciseFromDay(draft, 0, id);
    expect(draft[0]).toHaveLength(1);
  });
});

// ─── updateDraftExerciseField ─────────────────────────────────────────────────

describe("updateDraftExerciseField", () => {
  it("updates the sets field", () => {
    let draft = addExerciseToDay({}, 0, makeExercise());
    const id = draft[0]![0]!.localId;
    draft = updateDraftExerciseField(draft, 0, id, "sets", 5);
    expect(draft[0]![0]!.sets).toBe(5);
  });

  it("updates repsMin without affecting repsMax", () => {
    let draft = addExerciseToDay({}, 0, makeExercise());
    const id = draft[0]![0]!.localId;
    draft = updateDraftExerciseField(draft, 0, id, "repsMin", 6);
    expect(draft[0]![0]!.repsMin).toBe(6);
    expect(draft[0]![0]!.repsMax).toBe(DRAFT_EXERCISE_DEFAULTS.repsMax);
  });

  it("does not mutate the original draft", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    const id = draft[0]![0]!.localId;
    const before = draft[0]![0]!.sets;
    updateDraftExerciseField(draft, 0, id, "sets", 6);
    expect(draft[0]![0]!.sets).toBe(before);
  });

  it("ignores unknown localId", () => {
    const draft = addExerciseToDay({}, 0, makeExercise());
    const after = updateDraftExerciseField(draft, 0, "unknown", "sets", 6);
    expect(after[0]![0]!.sets).toBe(DRAFT_EXERCISE_DEFAULTS.sets);
  });
});

// ─── reorderExercisesInDay ────────────────────────────────────────────────────

describe("reorderExercisesInDay", () => {
  function buildThreeExerciseDraft(): ExerciseDraftByDay {
    let draft = addExerciseToDay({}, 0, makeExercise({ exerciseName: "A" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "B" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "C" }));
    return draft;
  }

  it("moves A from index 0 to index 2", () => {
    const draft = buildThreeExerciseDraft();
    const after = reorderExercisesInDay(draft, 0, 0, 2);
    const names = after[0]!.map((e) => e.exerciseName);
    expect(names).toEqual(["B", "C", "A"]);
  });

  it("moves C from index 2 to index 0", () => {
    const draft = buildThreeExerciseDraft();
    const after = reorderExercisesInDay(draft, 0, 2, 0);
    const names = after[0]!.map((e) => e.exerciseName);
    expect(names).toEqual(["C", "A", "B"]);
  });

  it("no-op when oldIndex === newIndex", () => {
    const draft = buildThreeExerciseDraft();
    const after = reorderExercisesInDay(draft, 0, 1, 1);
    const names = after[0]!.map((e) => e.exerciseName);
    expect(names).toEqual(["A", "B", "C"]);
  });

  it("re-assigns sequential order after reorder", () => {
    const draft = buildThreeExerciseDraft();
    const after = reorderExercisesInDay(draft, 0, 0, 2);
    const orders = after[0]!.map((e) => e.order);
    expect(orders).toEqual([0, 1, 2]);
  });

  it("does not affect other days", () => {
    let draft = addExerciseToDay({}, 0, makeExercise({ exerciseName: "A" }));
    draft = addExerciseToDay(draft, 0, makeExercise({ exerciseName: "B" }));
    draft = addExerciseToDay(draft, 1, makeExercise({ exerciseName: "X" }));
    const after = reorderExercisesInDay(draft, 0, 0, 1);
    expect(after[1]).toHaveLength(1);
    expect(after[1]![0]!.exerciseName).toBe("X");
  });

  it("does not mutate the original draft", () => {
    const draft = buildThreeExerciseDraft();
    const namesBefore = draft[0]!.map((e) => e.exerciseName);
    reorderExercisesInDay(draft, 0, 0, 2);
    expect(draft[0]!.map((e) => e.exerciseName)).toEqual(namesBefore);
  });
});

// ─── validateSets ─────────────────────────────────────────────────────────────

describe("validateSets", () => {
  it("accepts 1 to 6", () => {
    for (let n = 1; n <= 6; n++) expect(validateSets(n)).toBeNull();
  });

  it("rejects 0", () => {
    expect(validateSets(0)).not.toBeNull();
  });

  it("rejects 7", () => {
    expect(validateSets(7)).not.toBeNull();
  });

  it("rejects decimal", () => {
    expect(validateSets(2.5)).not.toBeNull();
  });

  it("rejects negative", () => {
    expect(validateSets(-1)).not.toBeNull();
  });
});

// ─── validateReps ─────────────────────────────────────────────────────────────

describe("validateReps", () => {
  it("accepts valid range", () => {
    expect(validateReps(8, 12)).toBeNull();
    expect(validateReps(5, 5)).toBeNull();
  });

  it("rejects when min exceeds max", () => {
    expect(validateReps(12, 8)).not.toBeNull();
  });

  it("rejects decimal values", () => {
    expect(validateReps(8.5, 12)).not.toBeNull();
    expect(validateReps(8, 12.5)).not.toBeNull();
  });

  it("rejects zero min", () => {
    expect(validateReps(0, 12)).not.toBeNull();
  });
});

// ─── validateRir ──────────────────────────────────────────────────────────────

describe("validateRir", () => {
  it("accepts 0 to 5", () => {
    for (let n = 0; n <= 5; n++) expect(validateRir(n)).toBeNull();
  });

  it("rejects negative", () => {
    expect(validateRir(-1)).not.toBeNull();
  });

  it("rejects 6", () => {
    expect(validateRir(6)).not.toBeNull();
  });

  it("rejects decimal", () => {
    expect(validateRir(2.5)).not.toBeNull();
  });
});

// ─── Validation code constants are stable strings ─────────────────────────────

describe("validation code constants", () => {
  it("EXERCISE_STEP_INCOMPLETE is correct string", () => {
    expect(EXERCISE_STEP_INCOMPLETE).toBe("EXERCISE_STEP_INCOMPLETE");
  });
  it("EXERCISE_DAY_EMPTY is correct string", () => {
    expect(EXERCISE_DAY_EMPTY).toBe("EXERCISE_DAY_EMPTY");
  });
  it("EXERCISE_SELECTION_VALID is correct string", () => {
    expect(EXERCISE_SELECTION_VALID).toBe("EXERCISE_SELECTION_VALID");
  });
});

// ─── DRAFT_EXERCISE_DEFAULTS ──────────────────────────────────────────────────

describe("DRAFT_EXERCISE_DEFAULTS", () => {
  it("sets = 3", () => expect(DRAFT_EXERCISE_DEFAULTS.sets).toBe(3));
  it("repsMin = 8", () => expect(DRAFT_EXERCISE_DEFAULTS.repsMin).toBe(8));
  it("repsMax = 12", () => expect(DRAFT_EXERCISE_DEFAULTS.repsMax).toBe(12));
  it("rir = 2", () => expect(DRAFT_EXERCISE_DEFAULTS.rir).toBe(2));
  it("restSeconds = 90", () => expect(DRAFT_EXERCISE_DEFAULTS.restSeconds).toBe(90));
});
