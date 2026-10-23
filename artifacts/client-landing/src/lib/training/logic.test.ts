import { describe, it, expect } from "vitest";
import { stepWeight, stepReps, parseDecimal, parseIntStrict, startValues, formatTarget, formatSetResult, recordGain } from "./logic";
import type { ExerciseInfo } from "./types";

const ex = (over: Partial<ExerciseInfo> = {}): ExerciseInfo => ({
  planExerciseId: 1, exerciseId: 1, name: "Test", muscleGroup: "Klatka piersiowa", equipment: ["Sztanga"], sets: 3, reps: "8–10",
  repMin: 8, repMax: 10, rir: 2, restText: "2 min–3 min", weightStepKg: 2.5, showWeight: true, howTo: null, note: null,
  videoUrl: null, imageUrl: null, previous: [], record: null, history: [], ...over,
});

describe("stepping", () => {
  it("adds the step for the equipment, never below 0, no float artefacts", () => {
    expect(stepWeight(60, 1, 2.5)).toBe(62.5);
    expect(stepWeight(10, 1, 1)).toBe(11);
    expect(stepWeight(1, -1, 2.5)).toBe(0);
    expect(stepWeight(0.1, 1, 0.2)).toBe(0.3);
    expect(stepWeight(null, 1, 2.5)).toBe(2.5);
  });
  it("reps stay within 0–200", () => {
    expect(stepReps(8, 1)).toBe(9);
    expect(stepReps(0, -1)).toBe(0);
    expect(stepReps(200, 1)).toBe(200);
  });
});

describe("exact input", () => {
  it("accepts comma and dot, rejects junk and out-of-range", () => {
    expect(parseDecimal("62,5")).toBe(62.5);
    expect(parseDecimal(" 62.5 ")).toBe(62.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
    expect(parseDecimal("1001")).toBeNull();
    expect(parseIntStrict("12")).toBe(12);
    expect(parseIntStrict("1.5")).toBeNull();
    expect(parseIntStrict("201")).toBeNull();
  });
});

describe("start values: previous set today > previous session > plan", () => {
  it("uses the plan when there is no history (reps = lower end, weight empty)", () => {
    expect(startValues(ex(), 1, {})).toEqual({ weightKg: null, reps: 8, rir: null });
  });
  it("uses the same set of the previous session, or its last set", () => {
    const e = ex({ previous: [{ setNumber: 1, weightKg: 60, reps: 8, rir: 2 }, { setNumber: 2, weightKg: 62.5, reps: 7, rir: 1 }] });
    expect(startValues(e, 2, {})).toMatchObject({ weightKg: 62.5, reps: 7 });
    expect(startValues(e, 3, {})).toMatchObject({ weightKg: 62.5, reps: 7 });
  });
  it("prefers the set just saved today", () => {
    const e = ex({ previous: [{ setNumber: 2, weightKg: 50, reps: 10, rir: 2 }] });
    expect(startValues(e, 2, { 1: { weightKg: 65, reps: 8, rir: 2 } })).toMatchObject({ weightKg: 65, reps: 8 });
    expect(startValues(e, 2, { 1: { weightKg: null, reps: null, rir: null, skipped: true } })).toMatchObject({ weightKg: 50 });
  });
});

describe("display", () => {
  it("target line", () => {
    expect(formatTarget(ex())).toBe("3 × 8–10 · RIR 2 · przerwa ok. 2 min–3 min");
    expect(formatTarget(ex({ rir: null, restText: "ok. 45 s" }))).toBe("3 × 8–10 · przerwa ok. 45 s");
  });
  it("set result", () => {
    expect(formatSetResult({ weightKg: 62.5, reps: 8 })).toBe("62,5 kg × 8");
    expect(formatSetResult({ weightKg: null, reps: 12 })).toBe("12");
    expect(formatSetResult({ weightKg: 20, reps: 12 }, false)).toBe("12");
  });
});

describe("record rule (same cases as the server)", () => {
  const hist = [{ weightKg: 70, reps: 5 }, { weightKg: 60, reps: 8 }, { weightKg: 50, reps: 12 }];
  it("matches api-server recordGain", () => {
    expect(recordGain(hist, { weightKg: 62.5, reps: 8, rir: null })).toBe(2.5);
    expect(recordGain(hist, { weightKg: 60, reps: 8, rir: null })).toBeNull();
    expect(recordGain(hist, { weightKg: 65, reps: 6, rir: null })).toBe(5);
    expect(recordGain([], { weightKg: 40, reps: 10, rir: null })).toBeNull();
    expect(recordGain(hist, { weightKg: null, reps: 10, rir: null })).toBeNull();
  });
});
