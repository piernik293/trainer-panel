import { describe, it, expect } from "vitest";
import { runReducer, newRun, activeSetNumber, countDoneSets, loadRun, saveRun, clearRun, type RunState } from "./run";
import type { TrainingDay } from "./types";

const day = { planDayId: 7, activeSession: null } as unknown as TrainingDay;
const fresh = (): RunState => newRun(day, "uuid-1", new Date("2026-10-23T10:00:00Z"));
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe("run state", () => {
  it("walks warm-up → exercises → cooldown → finish", () => {
    let s = fresh();
    expect(s.stage).toBe("warmup");
    s = runReducer(s, { type: "warmupNext", total: 2 });
    expect(s).toMatchObject({ stage: "warmup", warmupIndex: 1 });
    s = runReducer(s, { type: "warmupNext", total: 2 });
    expect(s.stage).toBe("exercises");
    s = runReducer(s, { type: "nextExercise", total: 2 });
    expect(s.exerciseIndex).toBe(1);
    s = runReducer(s, { type: "nextExercise", total: 2 });
    expect(s.stage).toBe("cooldown");
    s = runReducer(s, { type: "cooldownNext", total: 1 });
    expect(s.stage).toBe("finish");
    s = runReducer(s, { type: "end", at: "2026-10-23T11:00:00Z" });
    expect(s).toMatchObject({ stage: "done", endedAt: "2026-10-23T11:00:00Z" });
  });
  it("saves, corrects and counts sets; skipped sets are not counted", () => {
    let s = fresh();
    s = runReducer(s, { type: "saveSet", planExerciseId: 1, setNumber: 1, value: { weightKg: 60, reps: 8, rir: 2 } });
    s = runReducer(s, { type: "saveSet", planExerciseId: 1, setNumber: 1, value: { weightKg: 62.5, reps: 8, rir: 1 } });
    s = runReducer(s, { type: "saveSet", planExerciseId: 2, setNumber: 1, value: { weightKg: null, reps: null, rir: null, skipped: true } });
    expect(s.sets[1]![1]).toEqual({ weightKg: 62.5, reps: 8, rir: 1 });
    expect(countDoneSets(s)).toBe(1);
    expect(activeSetNumber(s.sets[1], 3)).toBe(2);
    expect(activeSetNumber({ 1: { weightKg: 1, reps: 1, rir: 1 }, 2: { weightKg: 1, reps: 1, rir: 1 } }, 2)).toBe(3);
  });
  it("can go back to a previous exercise and skip one (pain)", () => {
    let s = runReducer(fresh(), { type: "goToExercise", index: 2 });
    s = runReducer(s, { type: "prevExercise" });
    expect(s.exerciseIndex).toBe(1);
    s = runReducer(runReducer(s, { type: "skipExercise", planExerciseId: 5 }), { type: "skipExercise", planExerciseId: 5 });
    expect(s.skippedExercises).toEqual([5]);
  });
  it("restores sets from the server's active session", () => {
    const d = { planDayId: 7, activeSession: { id: 1, pain: [], sets: [{ planExerciseId: 3, setNumber: 2, weightKg: 40, reps: 10, rir: 2, skipped: false }] } } as unknown as TrainingDay;
    expect(newRun(d, "u").sets[3]![2]).toEqual({ weightKg: 40, reps: 10, rir: 2, skipped: false });
  });
  it("persists in storage and survives broken storage", () => {
    const st = mem();
    const s = runReducer(fresh(), { type: "saveSet", planExerciseId: 1, setNumber: 1, value: { weightKg: 1, reps: 2, rir: 3 } });
    saveRun(s, st);
    expect(loadRun(7, st)).toEqual(s);
    expect(loadRun(8, st)).toBeNull();
    clearRun(7, st);
    expect(loadRun(7, st)).toBeNull();
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(() => saveRun(s, broken)).not.toThrow();
    expect(loadRun(7, broken)).toBeNull();
  });
});
