import { describe, it, expect } from "vitest";
import {
  weightStepFor, exerciseRoleFor, restFor, formatRest, recordGain, bestSet, compactHistory, nextDayIndex, startOfWeek,
} from "../training";

describe("weightStepFor", () => {
  it.each([
    [["Sztanga"], 2.5, true], [["Hantle"], 1, true], [["Kettlebell"], 1, true],
    [["Maszyna"], 2.5, true], [["Wyciąg"], 2.5, true],
    [["Sztanga", "Ławka"], 2.5, true], [["Hantle", "Ławka"], 1, true], [["Hantle", "Maszyna"], 2.5, true],
  ])("%j → %f kg", (eq, step, show) => expect(weightStepFor(eq)).toEqual({ stepKg: step, showWeight: show }));
  it.each([[["Masa własnego ciała"]], [["Drążek"]], [["Brak sprzętu"]], [[]], [["Gumy oporowe"]]])(
    "%j → weight field hidden", (eq) => expect(weightStepFor(eq)).toEqual({ stepKg: null, showWeight: false }));
});

describe("exerciseRoleFor", () => {
  it("compound = main, isolation = secondary, compound <= 5 reps = power", () => {
    expect(exerciseRoleFor("Złożone", 10)).toBe("main");
    expect(exerciseRoleFor("Izolowane", 12)).toBe("secondary");
    expect(exerciseRoleFor("Złożone", 5)).toBe("power");
    expect(exerciseRoleFor(null, null)).toBe("secondary");
  });
});

describe("restFor — table by effective level", () => {
  const r = (level: string, role: "secondary" | "main" | "power", mins: number | null = null, trainer: number | null = null) =>
    restFor({ level, role, sessionMinutes: mins, trainerRestSeconds: trainer });
  it("no activity and beginner", () => {
    expect(r("Brak aktywności fizycznej", "main")).toMatchObject({ minSeconds: 60, maxSeconds: 90 });
    expect(r("Początkujący", "secondary")).toMatchObject({ minSeconds: 60, maxSeconds: 90 });
    expect(r("Początkujący", "main")).toMatchObject({ minSeconds: 90, maxSeconds: 120 });
  });
  it("intermediate and advanced", () => {
    expect(r("Średniozaawansowany", "secondary")).toMatchObject({ minSeconds: 60, maxSeconds: 120 });
    expect(r("Średniozaawansowany", "main")).toMatchObject({ minSeconds: 120, maxSeconds: 180 });
    expect(r("Średniozaawansowany", "power")).toMatchObject({ minSeconds: 180, maxSeconds: null });
    expect(r("Zaawansowany", "secondary")).toMatchObject({ minSeconds: 90, maxSeconds: 120 });
    expect(r("Zaawansowany", "main")).toMatchObject({ minSeconds: 180, maxSeconds: 240 });
    expect(r("Zaawansowany", "power")).toMatchObject({ minSeconds: 180, maxSeconds: 300 });
  });
  it("power at beginner level falls back to main", () => {
    expect(r("Początkujący", "power")).toMatchObject({ minSeconds: 90, maxSeconds: 120 });
  });
  it("session up to 1 h caps rest: auxiliary 1.5 min, main 2 min, power 3 min", () => {
    expect(r("Zaawansowany", "secondary", 60)).toMatchObject({ minSeconds: 90, maxSeconds: null });
    expect(r("Zaawansowany", "main", 45)).toMatchObject({ minSeconds: 120, maxSeconds: null });
    expect(r("Zaawansowany", "power", 60)).toMatchObject({ minSeconds: 180, maxSeconds: null });
    expect(r("Średniozaawansowany", "main", 50)).toMatchObject({ minSeconds: 120, maxSeconds: null });
    expect(r("Zaawansowany", "main", 75)).toMatchObject({ minSeconds: 180, maxSeconds: 240 }); // longer: no cap
  });
  it("trainer's value overrides everything", () => {
    expect(r("Zaawansowany", "main", 45, 75)).toEqual({ minSeconds: 75, maxSeconds: null, source: "trainer" });
  });
  it("unknown level behaves like beginner", () => {
    expect(restFor({ level: null, role: "main", sessionMinutes: null, trainerRestSeconds: null })).toMatchObject({ minSeconds: 90 });
  });
  it("formats ranges for display", () => {
    expect(formatRest({ minSeconds: 120, maxSeconds: 180, source: "default" })).toBe("2 min–3 min");
    expect(formatRest({ minSeconds: 75, maxSeconds: null, source: "trainer" })).toBe("ok. 75 s");
    expect(formatRest({ minSeconds: 90, maxSeconds: null, source: "default" })).toBe("ok. 1,5 min");
  });
});

describe("record rule: highest weight at the same or higher reps", () => {
  const hist = [{ weightKg: 60, reps: 8 }, { weightKg: 70, reps: 5 }, { weightKg: 50, reps: 12 }];
  it("beats best at >= reps", () => {
    expect(recordGain(hist, { weightKg: 62.5, reps: 8 })).toBe(2.5); // best at >=8 is 60
    expect(recordGain(hist, { weightKg: 52.5, reps: 12 })).toBe(2.5);
  });
  it("equal or lower is not a record; heavier set with fewer reps does not count against higher reps", () => {
    expect(recordGain(hist, { weightKg: 60, reps: 8 })).toBeNull();
    expect(recordGain(hist, { weightKg: 55, reps: 8 })).toBeNull();
    expect(recordGain(hist, { weightKg: 72.5, reps: 5 })).toBe(2.5);
    expect(recordGain(hist, { weightKg: 65, reps: 6 })).toBe(5); // >=6 reps: best 60
  });
  it("first time ever is never a record; missing values are ignored", () => {
    expect(recordGain([], { weightKg: 40, reps: 10 })).toBeNull();
    expect(recordGain(hist, { weightKg: null, reps: 10 })).toBeNull();
    expect(recordGain(hist, { weightKg: 100, reps: 0 })).toBeNull();
  });
  it("bestSet picks heaviest then most reps", () => {
    expect(bestSet([{ weightKg: 50, reps: 10 }, { weightKg: 60, reps: 6 }, { weightKg: 60, reps: 8 }])).toEqual({ weightKg: 60, reps: 8 });
    expect(bestSet([])).toBeNull();
  });
});

describe("day picking and week", () => {
  it("next day is cyclic", () => {
    expect(nextDayIndex([10, 11, 12, 13], null)).toBe(0);
    expect(nextDayIndex([10, 11, 12, 13], 11)).toBe(2);
    expect(nextDayIndex([10, 11, 12, 13], 13)).toBe(0);
    expect(nextDayIndex([], null)).toBe(-1);
  });
  it("week starts on Monday", () => {
    expect(startOfWeek(new Date(2026, 9, 23)).getDate()).toBe(19); // Fri 23 Oct 2026 → Mon 19
    expect(startOfWeek(new Date(2026, 9, 25)).getDate()).toBe(19); // Sunday
  });
});

describe("compactHistory keeps recordGain unchanged", () => {
  it("heaviest weight per rep count", () => {
    const hist = [{ weightKg: 60, reps: 8 }, { weightKg: 55, reps: 8 }, { weightKg: 70, reps: 5 }, { weightKg: null, reps: 3 }];
    expect(compactHistory(hist)).toEqual([{ weightKg: 70, reps: 5 }, { weightKg: 60, reps: 8 }]);
    for (const set of [{ weightKg: 62.5, reps: 8 }, { weightKg: 65, reps: 6 }, { weightKg: 72.5, reps: 5 }, { weightKg: 60, reps: 8 }]) {
      expect(recordGain(compactHistory(hist), set)).toBe(recordGain(hist, set));
    }
  });
});
