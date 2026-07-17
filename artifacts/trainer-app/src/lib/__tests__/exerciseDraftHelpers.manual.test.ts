/**
 * Tests for manual parameter update functions in exerciseDraftHelpers.
 *
 * Covers: updateExerciseTempo, updateExerciseRir, updateExerciseWeight, replaceExercise.
 *
 * Each group verifies:
 *   - the target field is updated correctly,
 *   - manualOverrides flag is set to true for the changed field,
 *   - all other fields on the target exercise are unchanged,
 *   - other exercises in the same day are unchanged,
 *   - exercises in other days are unchanged,
 *   - the original draft object is not mutated.
 */

import { describe, it, expect } from "vitest";
import {
  updateExerciseTempo,
  updateExerciseRir,
  updateExerciseWeight,
  replaceExercise,
  type DraftExercise,
  type ExerciseDraftByDay,
  type ReplaceExerciseData,
} from "../exerciseDraftHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    localId: "local-1",
    exerciseId: 10,
    exerciseName: "Ściąganie drążka",
    mainMuscleGroup: "Plecy",
    equipment: ["Maszyna"],
    isCore: false,
    order: 0,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    rir: 2,
    restSeconds: 90,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<ExerciseDraftByDay> = {}): ExerciseDraftByDay {
  return {
    0: [
      makeExercise({ localId: "local-1", order: 0 }),
      makeExercise({ localId: "local-2", exerciseId: 20, exerciseName: "Wiosłowanie", order: 1 }),
    ],
    1: [
      makeExercise({ localId: "local-3", exerciseId: 30, exerciseName: "Przysiad", order: 0 }),
    ],
    ...overrides,
  };
}

// ─── updateExerciseTempo ───────────────────────────────────────────────────────

describe("updateExerciseTempo()", () => {
  it("sets the tempo on the target exercise", () => {
    const draft = makeDraft();
    const result = updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    expect(result[0]![0]!.tempo).toBe("3-0-1-0");
  });

  it("clears the tempo when passed undefined", () => {
    const draft = makeDraft({
      0: [makeExercise({ localId: "local-1", tempo: "2-0-2-0" })],
    });
    const result = updateExerciseTempo(draft, 0, "local-1", undefined);
    expect(result[0]![0]!.tempo).toBeUndefined();
  });

  it("sets manualOverrides.tempo to true", () => {
    const draft = makeDraft();
    const result = updateExerciseTempo(draft, 0, "local-1", "4-1-1-0");
    expect(result[0]![0]!.manualOverrides?.tempo).toBe(true);
  });

  it("preserves an existing manualOverrides.rir flag when adding tempo", () => {
    const draft = makeDraft({
      0: [makeExercise({ localId: "local-1", manualOverrides: { rir: true } })],
    });
    const result = updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    expect(result[0]![0]!.manualOverrides?.rir).toBe(true);
    expect(result[0]![0]!.manualOverrides?.tempo).toBe(true);
  });

  it("does not change other fields on the target exercise", () => {
    const draft = makeDraft();
    const before = draft[0]![0]!;
    const result = updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    const after = result[0]![0]!;
    expect(after.exerciseId).toBe(before.exerciseId);
    expect(after.sets).toBe(before.sets);
    expect(after.repsMin).toBe(before.repsMin);
    expect(after.repsMax).toBe(before.repsMax);
    expect(after.rir).toBe(before.rir);
    expect(after.restSeconds).toBe(before.restSeconds);
    expect(after.localId).toBe(before.localId);
    expect(after.order).toBe(before.order);
  });

  it("does not affect other exercises in the same day", () => {
    const draft = makeDraft();
    const result = updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    expect(result[0]![1]).toEqual(draft[0]![1]);
  });

  it("does not affect exercises in other days", () => {
    const draft = makeDraft();
    const result = updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    expect(result[1]).toEqual(draft[1]);
  });

  it("does not mutate the original draft", () => {
    const draft = makeDraft();
    const originalEx = { ...draft[0]![0]! };
    updateExerciseTempo(draft, 0, "local-1", "3-0-1-0");
    expect(draft[0]![0]!.tempo).toBeUndefined();
    expect(draft[0]![0]!.manualOverrides).toBeUndefined();
    expect(draft[0]![0]).toEqual(originalEx);
  });

  it("returns the same draft when localId is not found", () => {
    const draft = makeDraft();
    const result = updateExerciseTempo(draft, 0, "nonexistent", "3-0-1-0");
    expect(result[0]![0]!.tempo).toBeUndefined();
    expect(result[0]![1]!.tempo).toBeUndefined();
  });
});

// ─── updateExerciseRir ────────────────────────────────────────────────────────

describe("updateExerciseRir()", () => {
  it("updates the rir on the target exercise", () => {
    const draft = makeDraft();
    const result = updateExerciseRir(draft, 0, "local-1", 1);
    expect(result[0]![0]!.rir).toBe(1);
  });

  it("sets manualOverrides.rir to true", () => {
    const draft = makeDraft();
    const result = updateExerciseRir(draft, 0, "local-1", 0);
    expect(result[0]![0]!.manualOverrides?.rir).toBe(true);
  });

  it("preserves existing manualOverrides entries when setting rir", () => {
    const draft = makeDraft({
      0: [makeExercise({ localId: "local-1", manualOverrides: { tempo: true, weight: true } })],
    });
    const result = updateExerciseRir(draft, 0, "local-1", 3);
    expect(result[0]![0]!.manualOverrides?.tempo).toBe(true);
    expect(result[0]![0]!.manualOverrides?.weight).toBe(true);
    expect(result[0]![0]!.manualOverrides?.rir).toBe(true);
  });

  it("does not change other prescription fields on the target exercise", () => {
    const draft = makeDraft();
    const before = draft[0]![0]!;
    const result = updateExerciseRir(draft, 0, "local-1", 0);
    const after = result[0]![0]!;
    expect(after.sets).toBe(before.sets);
    expect(after.repsMin).toBe(before.repsMin);
    expect(after.repsMax).toBe(before.repsMax);
    expect(after.restSeconds).toBe(before.restSeconds);
    expect(after.exerciseId).toBe(before.exerciseId);
  });

  it("does not affect other exercises in the same day", () => {
    const draft = makeDraft();
    const result = updateExerciseRir(draft, 0, "local-1", 0);
    expect(result[0]![1]).toEqual(draft[0]![1]);
  });

  it("does not affect exercises in other days", () => {
    const draft = makeDraft();
    const result = updateExerciseRir(draft, 0, "local-1", 0);
    expect(result[1]).toEqual(draft[1]);
  });

  it("does not mutate the original draft", () => {
    const draft = makeDraft();
    const originalRir = draft[0]![0]!.rir;
    updateExerciseRir(draft, 0, "local-1", 0);
    expect(draft[0]![0]!.rir).toBe(originalRir);
    expect(draft[0]![0]!.manualOverrides).toBeUndefined();
  });

  it("updates rir to 0 correctly (falsy value is still a valid change)", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", rir: 3 })] });
    const result = updateExerciseRir(draft, 0, "local-1", 0);
    expect(result[0]![0]!.rir).toBe(0);
  });
});

// ─── updateExerciseWeight ─────────────────────────────────────────────────────

describe("updateExerciseWeight()", () => {
  it("sets the weight on the target exercise", () => {
    const draft = makeDraft();
    const result = updateExerciseWeight(draft, 0, "local-1", 80);
    expect(result[0]![0]!.weight).toBe(80);
  });

  it("clears the weight when passed undefined", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", weight: 60 })] });
    const result = updateExerciseWeight(draft, 0, "local-1", undefined);
    expect(result[0]![0]!.weight).toBeUndefined();
  });

  it("sets manualOverrides.weight to true", () => {
    const draft = makeDraft();
    const result = updateExerciseWeight(draft, 0, "local-1", 100);
    expect(result[0]![0]!.manualOverrides?.weight).toBe(true);
  });

  it("preserves existing manualOverrides entries when setting weight", () => {
    const draft = makeDraft({
      0: [makeExercise({ localId: "local-1", manualOverrides: { rir: true } })],
    });
    const result = updateExerciseWeight(draft, 0, "local-1", 50);
    expect(result[0]![0]!.manualOverrides?.rir).toBe(true);
    expect(result[0]![0]!.manualOverrides?.weight).toBe(true);
  });

  it("does not change other fields on the target exercise", () => {
    const draft = makeDraft();
    const before = draft[0]![0]!;
    const result = updateExerciseWeight(draft, 0, "local-1", 75);
    const after = result[0]![0]!;
    expect(after.sets).toBe(before.sets);
    expect(after.rir).toBe(before.rir);
    expect(after.exerciseId).toBe(before.exerciseId);
    expect(after.exerciseName).toBe(before.exerciseName);
  });

  it("does not affect other exercises in the same day", () => {
    const draft = makeDraft();
    const result = updateExerciseWeight(draft, 0, "local-1", 80);
    expect(result[0]![1]).toEqual(draft[0]![1]);
  });

  it("does not affect exercises in other days", () => {
    const draft = makeDraft();
    const result = updateExerciseWeight(draft, 0, "local-1", 80);
    expect(result[1]).toEqual(draft[1]);
  });

  it("does not mutate the original draft", () => {
    const draft = makeDraft();
    updateExerciseWeight(draft, 0, "local-1", 80);
    expect(draft[0]![0]!.weight).toBeUndefined();
    expect(draft[0]![0]!.manualOverrides).toBeUndefined();
  });

  it("accepts decimal weight values", () => {
    const draft = makeDraft();
    const result = updateExerciseWeight(draft, 0, "local-1", 22.5);
    expect(result[0]![0]!.weight).toBe(22.5);
  });
});

// ─── replaceExercise ──────────────────────────────────────────────────────────

describe("replaceExercise()", () => {
  const newEx: ReplaceExerciseData = {
    exerciseId: 99,
    exerciseName: "Martwy ciąg",
    mainMuscleGroup: "Tył uda",
    equipment: ["Sztanga"],
    isCore: false,
  };

  it("replaces the exerciseId on the target entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.exerciseId).toBe(99);
  });

  it("replaces the exerciseName on the target entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.exerciseName).toBe("Martwy ciąg");
  });

  it("replaces mainMuscleGroup on the target entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.mainMuscleGroup).toBe("Tył uda");
  });

  it("replaces equipment on the target entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.equipment).toEqual(["Sztanga"]);
  });

  it("preserves sets from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", sets: 4 })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.sets).toBe(4);
  });

  it("preserves repsMin and repsMax from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", repsMin: 6, repsMax: 10 })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.repsMin).toBe(6);
    expect(result[0]![0]!.repsMax).toBe(10);
  });

  it("preserves rir from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", rir: 1 })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.rir).toBe(1);
  });

  it("preserves restSeconds from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", restSeconds: 120 })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.restSeconds).toBe(120);
  });

  it("preserves tempo from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", tempo: "3-0-1-0" })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.tempo).toBe("3-0-1-0");
  });

  it("preserves weight from the original entry", () => {
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", weight: 60 })] });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.weight).toBe(60);
  });

  it("preserves the localId of the replaced entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.localId).toBe("local-1");
  });

  it("preserves the order of the replaced entry", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.order).toBe(0);
  });

  it("sets manualOverrides.exercise to true", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.manualOverrides?.exercise).toBe(true);
  });

  it("preserves existing manualOverrides entries when replacing the exercise", () => {
    const draft = makeDraft({
      0: [makeExercise({ localId: "local-1", manualOverrides: { rir: true, tempo: true } })],
    });
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![0]!.manualOverrides?.rir).toBe(true);
    expect(result[0]![0]!.manualOverrides?.tempo).toBe(true);
    expect(result[0]![0]!.manualOverrides?.exercise).toBe(true);
  });

  it("does not affect other exercises in the same day", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[0]![1]).toEqual(draft[0]![1]);
  });

  it("does not affect exercises in other days", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "local-1", newEx);
    expect(result[1]).toEqual(draft[1]);
  });

  it("does not mutate the original draft", () => {
    const draft = makeDraft();
    const originalId = draft[0]![0]!.exerciseId;
    replaceExercise(draft, 0, "local-1", newEx);
    expect(draft[0]![0]!.exerciseId).toBe(originalId);
    expect(draft[0]![0]!.manualOverrides).toBeUndefined();
  });

  it("replaces isCore correctly when the new exercise is a core exercise", () => {
    const coreEx: ReplaceExerciseData = { ...newEx, isCore: true };
    const draft = makeDraft({ 0: [makeExercise({ localId: "local-1", isCore: false })] });
    const result = replaceExercise(draft, 0, "local-1", coreEx);
    expect(result[0]![0]!.isCore).toBe(true);
  });

  it("returns unchanged draft when localId is not found", () => {
    const draft = makeDraft();
    const result = replaceExercise(draft, 0, "nonexistent", newEx);
    expect(result[0]![0]!.exerciseId).toBe(draft[0]![0]!.exerciseId);
    expect(result[0]![1]!.exerciseId).toBe(draft[0]![1]!.exerciseId);
  });
});
