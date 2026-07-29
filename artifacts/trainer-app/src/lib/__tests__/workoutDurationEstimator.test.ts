/**
 * Unit tests for workoutDurationEstimator.ts
 *
 * All tests operate on pure functions — no React, no DOM.
 *
 * Formula reminder:
 *   estimatedTotal =
 *     600 s (10 min warm-up)
 *     + Σ sets × midpointReps × secondsPerRep   (working time)
 *     + Σ (sets − 1) × restSeconds              (inter-set rest)
 *     + Σ setupSeconds                           (per-exercise setup)
 */

import { describe, it, expect } from "vitest";
import type { DraftExercise } from "../exerciseDraftHelpers";
import {
  WORKOUT_DURATION_SPEC,
  getDefaultTempo,
  parseTempoSeconds,
  getSetupSeconds,
  estimateWorkoutDayDuration,
} from "../workoutDurationEstimator";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEx(
  overrides: Partial<DraftExercise> & { sets: number; repsMin: number; repsMax: number; restSeconds: number },
): DraftExercise {
  return {
    localId: "test-local-id",
    exerciseId: 1,
    exerciseName: "Test Exercise",
    mainMuscleGroup: "Plecy",
    equipment: [],
    isCore: false,
    order: 0,
    rir: 2,
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("warmup is 600 s (10 min)", () => {
    expect(WORKOUT_DURATION_SPEC.WARMUP_SECONDS).toBe(600);
  });
  it("fallback is 4 s/rep", () => {
    expect(WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP).toBe(4);
  });
});

// ── getDefaultTempo ───────────────────────────────────────────────────────────

describe("getDefaultTempo", () => {
  it("plyometric_power → 2-0-X-0 (explosive concentric)", () => {
    expect(getDefaultTempo("plyometric_power", null)).toBe("2-0-X-0");
    expect(getDefaultTempo("plyometric_power", "Zaawansowany")).toBe("2-0-X-0");
  });

  it("Brak aktywności fizycznej → 3-1-2-0 regardless of class", () => {
    expect(getDefaultTempo(undefined, "Brak aktywności fizycznej")).toBe("3-1-2-0");
    expect(getDefaultTempo("isolation", "Brak aktywności fizycznej")).toBe("3-1-2-0");
    expect(getDefaultTempo("secondary_compound", "Brak aktywności fizycznej")).toBe("3-1-2-0");
  });

  it("regression_beginner class → 3-1-2-0", () => {
    expect(getDefaultTempo("regression_beginner", null)).toBe("3-1-2-0");
    expect(getDefaultTempo("regression_beginner", "Początkujący")).toBe("3-1-2-0");
  });

  it("plyometric_power beats Brak aktywności (plyometric check comes first)", () => {
    expect(getDefaultTempo("plyometric_power", "Brak aktywności fizycznej")).toBe("2-0-X-0");
  });

  it("main_compound → 2-0-1-0 (strength pattern)", () => {
    expect(getDefaultTempo("main_compound", null)).toBe("2-0-1-0");
    expect(getDefaultTempo("main_compound", "Zaawansowany")).toBe("2-0-1-0");
  });

  it("isolation → 3-1-1-0 (general hypertrophy default)", () => {
    expect(getDefaultTempo("isolation", null)).toBe("3-1-1-0");
  });

  it("secondary_compound → 3-1-1-0", () => {
    expect(getDefaultTempo("secondary_compound", null)).toBe("3-1-1-0");
  });

  it("undefined class, null level → 3-1-1-0", () => {
    expect(getDefaultTempo(undefined, null)).toBe("3-1-1-0");
  });

  it("core → 3-1-1-0 (not slow-technique, not main)", () => {
    expect(getDefaultTempo("core", "Średniozaawansowany")).toBe("3-1-1-0");
  });
});

// ── parseTempoSeconds ─────────────────────────────────────────────────────────

describe("parseTempoSeconds", () => {
  it("3-1-1-0 → 5 s/rep", () => {
    expect(parseTempoSeconds("3-1-1-0")).toEqual({ secondsPerRep: 5, isFallback: false });
  });

  it("2-0-1-0 → 3 s/rep", () => {
    expect(parseTempoSeconds("2-0-1-0")).toEqual({ secondsPerRep: 3, isFallback: false });
  });

  it("3-1-2-0 → 6 s/rep", () => {
    expect(parseTempoSeconds("3-1-2-0")).toEqual({ secondsPerRep: 6, isFallback: false });
  });

  it("2-0-X-0 → 3 s/rep (X treated as 1 for estimation)", () => {
    expect(parseTempoSeconds("2-0-X-0")).toEqual({ secondsPerRep: 3, isFallback: false });
  });

  it("undefined → 4 s/rep fallback", () => {
    expect(parseTempoSeconds(undefined)).toEqual({
      secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP,
      isFallback: true,
    });
  });

  it("partial / invalid string → fallback", () => {
    expect(parseTempoSeconds("3-1-1")).toEqual({
      secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP,
      isFallback: true,
    });
    expect(parseTempoSeconds("abc")).toEqual({
      secondsPerRep: WORKOUT_DURATION_SPEC.FALLBACK_SECONDS_PER_REP,
      isFallback: true,
    });
  });

  it("accepts format without dashes (4220 → 4+2+2+0 = 8)", () => {
    expect(parseTempoSeconds("4220")).toEqual({ secondsPerRep: 8, isFallback: false });
  });
});

// ── getSetupSeconds ───────────────────────────────────────────────────────────

describe("getSetupSeconds", () => {
  it("isolation → 30 s", () => expect(getSetupSeconds("isolation")).toBe(30));
  it("core → 30 s", () => expect(getSetupSeconds("core")).toBe(30));
  it("regression_beginner → 30 s", () => expect(getSetupSeconds("regression_beginner")).toBe(30));
  it("secondary_compound → 45 s", () => expect(getSetupSeconds("secondary_compound")).toBe(45));
  it("main_compound → 60 s", () => expect(getSetupSeconds("main_compound")).toBe(60));
  it("plyometric_power → 60 s", () => expect(getSetupSeconds("plyometric_power")).toBe(60));
  it("undefined → 45 s", () => expect(getSetupSeconds(undefined)).toBe(45));
});

// ── Test A: 3×12, tempo 3-1-1-0, rest 90 s ───────────────────────────────────

describe("Test A — 3×12, tempo 3-1-1-0, rest 90 s", () => {
  // midpoint = 12, secondsPerRep = 5
  // working  = 3 × 12 × 5 = 180 s  →  3 min
  // resting  = (3−1) × 90 = 180 s  →  3 min
  // setup    = 45 s (undefined class) → Math.round(45/60) = 1 min
  // total    = 600 + 180 + 180 + 45 = 1005 s → Math.round(16.75) = 17 min

  const ex = makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" });
  const result = estimateWorkoutDayDuration([ex], null, null);

  it("warmup is 10 min", () => expect(result.warmupMinutes).toBe(10));
  it("working time is 3 min", () => expect(result.workingMinutes).toBe(3));
  it("rest time is 3 min", () => expect(result.restingMinutes).toBe(3));
  it("setup is 1 min (45 s rounded)", () => expect(result.setupTransitionMinutes).toBe(1));
  it("estimated total is 17 min", () => expect(result.estimatedTotalMinutes).toBe(17));
  it("hasFallbackTempo is false", () => expect(result.hasFallbackTempo).toBe(false));
});

// ── Test B: 4×5, tempo 2-0-1-0, rest 180 s ───────────────────────────────────

describe("Test B — 4×5, tempo 2-0-1-0, rest 180 s, main_compound", () => {
  // midpoint = 5, secondsPerRep = 3
  // working  = 4 × 5 × 3 = 60 s  →  1 min
  // resting  = (4−1) × 180 = 540 s  → 9 min
  // setup    = 60 s (main_compound) → 1 min
  // total    = 600 + 60 + 540 + 60 = 1260 s → 21 min

  const ex = makeEx({
    sets: 4, repsMin: 5, repsMax: 5, restSeconds: 180,
    tempo: "2-0-1-0", exerciseClass: "main_compound",
  });
  const result = estimateWorkoutDayDuration([ex], null, null);

  it("working time is 1 min", () => expect(result.workingMinutes).toBe(1));
  it("rest time is 9 min", () => expect(result.restingMinutes).toBe(9));
  it("setup is 1 min", () => expect(result.setupTransitionMinutes).toBe(1));
  it("estimated total is 21 min", () => expect(result.estimatedTotalMinutes).toBe(21));
});

// ── Test C: Power exercise, tempo 2-0-X-0, X = 1 for estimation ──────────────

describe("Test C — power exercise, tempo 2-0-X-0, 3×6–10, rest 120 s", () => {
  // midpoint = (6+10)/2 = 8
  // secondsPerRep = 2+0+1+0 = 3  (X treated as 1)
  // working  = 3 × 8 × 3 = 72 s  → Math.round(1.2) = 1 min
  // resting  = (3−1) × 120 = 240 s → 4 min
  // setup    = 60 s (plyometric_power) → 1 min
  // total    = 600 + 72 + 240 + 60 = 972 s → Math.round(16.2) = 16 min

  const ex = makeEx({
    sets: 3, repsMin: 6, repsMax: 10, restSeconds: 120,
    tempo: "2-0-X-0", exerciseClass: "plyometric_power",
  });
  const result = estimateWorkoutDayDuration([ex], null, null);

  it("X is treated as 1 second: 2+0+1+0 = 3 s/rep", () => {
    expect(parseTempoSeconds("2-0-X-0").secondsPerRep).toBe(3);
  });
  it("working time is 1 min (72 s rounded)", () => expect(result.workingMinutes).toBe(1));
  it("rest time is 4 min", () => expect(result.restingMinutes).toBe(4));
  it("setup is 1 min", () => expect(result.setupTransitionMinutes).toBe(1));
  it("estimated total is 16 min", () => expect(result.estimatedTotalMinutes).toBe(16));
  it("hasFallbackTempo is false — X is a valid tempo character", () => {
    expect(result.hasFallbackTempo).toBe(false);
  });
});

// ── Test D: full workout 4×12 + 3×12 × 4, tempo 3-1-1-0, rest 90 s ──────────

describe("Test D — 4×12 + 3×12 + 3×12 + 3×12 + 3×12, all 3-1-1-0, rest 90 s", () => {
  // midpoint = 12 for all, secondsPerRep = 5, setup = 45 s each (undefined class)
  // Exercise 1: working = 4×12×5 = 240, resting = (4−1)×90 = 270, setup = 45
  // Exercises 2–5: working = 3×12×5 = 180 each, resting = (3−1)×90 = 180 each, setup = 45 each
  // Total working  = 240 + 4×180 = 960 s → 16 min
  // Total resting  = 270 + 4×180 = 990 s → Math.round(16.5) = 17 min
  // Total setup    = 5×45 = 225 s → Math.round(3.75) = 4 min
  // total          = 600 + 960 + 990 + 225 = 2775 s → Math.round(46.25) = 46 min

  const exercises: DraftExercise[] = [
    makeEx({ sets: 4, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
  ];
  const result = estimateWorkoutDayDuration(exercises, null, null);

  it("working time is 16 min", () => expect(result.workingMinutes).toBe(16));
  it("rest time is 17 min (990 s rounded)", () => expect(result.restingMinutes).toBe(17));
  it("setup is 4 min (225 s rounded)", () => expect(result.setupTransitionMinutes).toBe(4));
  it("estimated total is 46 min", () => expect(result.estimatedTotalMinutes).toBe(46));
});

// ── Test E: colour states ─────────────────────────────────────────────────────

describe("Test E — colour states (using 46-min workout from Test D)", () => {
  const exercises: DraftExercise[] = [
    makeEx({ sets: 4, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
    makeEx({ sets: 3, repsMin: 12, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" }),
  ]; // estimated: 46 min

  it("green — within available duration (60 min available)", () => {
    const r = estimateWorkoutDayDuration(exercises, 60, null);
    expect(r.status).toBe("green");
    expect(r.exceededByMinutes).toBeNull();
  });

  it("green — exactly at available duration (46 min available)", () => {
    const r = estimateWorkoutDayDuration(exercises, 46, null);
    expect(r.status).toBe("green");
    expect(r.exceededByMinutes).toBeNull();
  });

  it("orange — 1–10 minutes over (40 min available → +6 min over)", () => {
    const r = estimateWorkoutDayDuration(exercises, 40, null);
    expect(r.status).toBe("orange");
    expect(r.exceededByMinutes).toBe(6);
  });

  it("orange — boundary: exactly 10 min over (36 min available → +10 min over)", () => {
    const r = estimateWorkoutDayDuration(exercises, 36, null);
    expect(r.status).toBe("orange");
    expect(r.exceededByMinutes).toBe(10);
  });

  it("red — more than 10 minutes over (30 min available → +16 min over)", () => {
    const r = estimateWorkoutDayDuration(exercises, 30, null);
    expect(r.status).toBe("red");
    expect(r.exceededByMinutes).toBe(16);
  });

  it("no_target — when available duration is null", () => {
    const r = estimateWorkoutDayDuration(exercises, null, null);
    expect(r.status).toBe("no_target");
    expect(r.availableMinutes).toBeNull();
    expect(r.exceededByMinutes).toBeNull();
  });
});

// ── Test F: changing tempo or rest recalculates the day estimate ──────────────

describe("Test F — changing tempo or rest updates the estimate", () => {
  const base = { sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 };

  it("changing tempo from 3-1-1-0 (5 s/rep) to 2-0-1-0 (3 s/rep) reduces working time", () => {
    const slow = estimateWorkoutDayDuration(
      [makeEx({ ...base, tempo: "3-1-1-0" })], null, null,
    );
    const fast = estimateWorkoutDayDuration(
      [makeEx({ ...base, tempo: "2-0-1-0" })], null, null,
    );
    // slow: 3×10×5 = 150 s working; fast: 3×10×3 = 90 s working
    expect(slow.workingMinutes).toBeGreaterThan(fast.workingMinutes);
    expect(slow.estimatedTotalMinutes).toBeGreaterThan(fast.estimatedTotalMinutes);
  });

  it("doubling rest from 90 s to 180 s increases resting time", () => {
    const short = estimateWorkoutDayDuration(
      [makeEx({ ...base, restSeconds: 90, tempo: "3-1-1-0" })], null, null,
    );
    const long = estimateWorkoutDayDuration(
      [makeEx({ ...base, restSeconds: 180, tempo: "3-1-1-0" })], null, null,
    );
    // short: (3−1)×90 = 180 s; long: (3−1)×180 = 360 s
    expect(long.restingMinutes).toBeGreaterThan(short.restingMinutes);
    expect(long.estimatedTotalMinutes).toBeGreaterThan(short.estimatedTotalMinutes);
  });

  it("adding an exercise increases the estimate", () => {
    const ex = makeEx({ ...base, tempo: "3-1-1-0" });
    const one = estimateWorkoutDayDuration([ex], null, null);
    const two = estimateWorkoutDayDuration([ex, { ...ex, localId: "b" }], null, null);
    expect(two.estimatedTotalMinutes).toBeGreaterThan(one.estimatedTotalMinutes);
  });

  it("removing an exercise decreases the estimate", () => {
    const ex1 = makeEx({ ...base, tempo: "3-1-1-0" });
    const ex2 = { ...ex1, localId: "b" };
    const two = estimateWorkoutDayDuration([ex1, ex2], null, null);
    const one = estimateWorkoutDayDuration([ex1], null, null);
    expect(two.estimatedTotalMinutes).toBeGreaterThan(one.estimatedTotalMinutes);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("empty exercise list → 10 min (warmup only)", () => {
    const r = estimateWorkoutDayDuration([], null, null);
    expect(r.estimatedTotalMinutes).toBe(10);
    expect(r.workingMinutes).toBe(0);
    expect(r.restingMinutes).toBe(0);
    expect(r.setupTransitionMinutes).toBe(0);
  });

  it("1 set → zero inter-set rest intervals", () => {
    const ex = makeEx({ sets: 1, repsMin: 10, repsMax: 10, restSeconds: 90, tempo: "3-1-1-0" });
    const r = estimateWorkoutDayDuration([ex], null, null);
    // resting = (1−1)×90 = 0
    expect(r.restingMinutes).toBe(0);
  });

  it("fallback tempo reported when tempo is undefined and no default can be assigned (never actually happens — getDefaultTempo always returns a value)", () => {
    // parseTempoSeconds always returns isFallback=true for invalid tempo
    const ex = makeEx({ sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, tempo: "invalid" });
    const r = estimateWorkoutDayDuration([ex], null, null);
    expect(r.hasFallbackTempo).toBe(true);
  });

  it("midpoint of range (8–12) is 10", () => {
    const ex = makeEx({ sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, tempo: "3-1-1-0" });
    const r = estimateWorkoutDayDuration([ex], null, null);
    // working = 3 × 10 × 5 = 150 s
    // resting = 2 × 90 = 180 s
    // setup = 45 s
    // total = 600 + 150 + 180 + 45 = 975 s → Math.round(16.25) = 16 min
    expect(r.estimatedTotalMinutes).toBe(16);
  });
});
