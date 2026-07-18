/**
 * Pure unit tests for the session-duration estimator (sessionDurationEstimator.ts).
 *
 * All tests are independent of the auto-fill generator so they can be read
 * as a specification of the formula in isolation.
 *
 * Formula reminder:
 *
 *   duration = warmUpSeconds
 *            + totalSets × 60                         (execution)
 *            + (totalSets − N) × restSeconds          (rest, no rest after final set per exercise)
 *            + (N − 1) × 60                           (transitions)
 *
 * where N = total exercises.
 */

import { describe, expect, it } from "vitest";
import {
  SESSION_DURATION_SPEC,
  estimateSessionDurationSeconds,
  exceedsSessionCap,
} from "../sessionDurationEstimator";

const { WARMUP_FALLBACK_SECONDS, REST_SECONDS_FALLBACK, MAX_SESSION_SECONDS } = SESSION_DURATION_SPEC;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** duration excluding warm-up (warmUpSeconds=0) for a single exercise with S sets and R rest. */
function exerciseDuration(sets: number, restSeconds: number): number {
  return estimateSessionDurationSeconds(1, sets, restSeconds, 0);
}

// ── Core formula: spec example ────────────────────────────────────────────────

describe("spec example — 3 working sets, 90-second rest", () => {
  it("returns 360 seconds for the exercise portion alone (no warm-up)", () => {
    // 3 × 60 + (3 − 1) × 90 = 180 + 180 = 360 s
    expect(exerciseDuration(3, 90)).toBe(360);
  });

  it("returns 660 seconds for the full session (including warm-up fallback of 300 s)", () => {
    // 300 + 360 = 660 s
    expect(estimateSessionDurationSeconds(1, 3)).toBe(660);
  });
});

// ── 2 sets with 60-second rest ────────────────────────────────────────────────

describe("2 sets with 60-second rest", () => {
  it("exercise portion: 2 × 60 + 1 × 60 = 180 s (no warm-up)", () => {
    // execution: 2 × 60 = 120 s
    // rest:      (2 − 1) × 60 = 60 s  (one inter-set interval, none after final set)
    // total:     180 s
    expect(exerciseDuration(2, 60)).toBe(180);
  });

  it("full session: 300 + 120 + 60 + 0 = 480 s (warm-up + execution + rest, no transition)", () => {
    expect(estimateSessionDurationSeconds(1, 2, 60)).toBe(480);
  });
});

// ── 3 sets with 90-second rest ────────────────────────────────────────────────

describe("3 sets with 90-second rest", () => {
  it("exercise portion: 3 × 60 + 2 × 90 = 360 s (matches spec example)", () => {
    expect(exerciseDuration(3, 90)).toBe(360);
  });

  it("full session: 300 + 180 + 180 + 0 = 660 s", () => {
    expect(estimateSessionDurationSeconds(1, 3, 90)).toBe(660);
  });
});

// ── No rest after the final set ───────────────────────────────────────────────

describe("no rest after the final set of an exercise", () => {
  it("3 sets: exactly 2 rest intervals, not 3", () => {
    // (S − 1) × R, so 3 sets → 2 × 90 = 180 s rest
    // If the formula incorrectly used S × R it would be 3 × 90 = 270 s → wrong total of 750 s
    const withoutFinalRest = estimateSessionDurationSeconds(1, 3, 90, 0); // 360 s
    const wrongTotalIfFinalRestIncluded = 3 * 60 + 3 * 90; // 450 s (wrong)
    expect(withoutFinalRest).toBe(360);
    expect(withoutFinalRest).toBeLessThan(wrongTotalIfFinalRestIncluded);
  });

  it("1 set: zero rest intervals (no rest at all)", () => {
    // (1 − 1) × R = 0
    const duration = estimateSessionDurationSeconds(1, 1, 90, 0);
    expect(duration).toBe(1 * 60); // just execution
  });

  it("2 sets: exactly 1 rest interval", () => {
    // (2 − 1) × 90 = 90 s
    expect(exerciseDuration(2, 90)).toBe(2 * 60 + 1 * 90); // 210 s
  });
});

// ── Transition time between exercises ────────────────────────────────────────

describe("transition time between exercises (60 s per gap)", () => {
  it("1 exercise: no transition (0 s)", () => {
    const single = estimateSessionDurationSeconds(1, 3, 90, 0);
    expect(single).toBe(180 + 180); // 360 s — no transition
  });

  it("2 exercises: 1 transition (60 s)", () => {
    // Each exercise: 3 sets, 90-s rest → 360 s
    // Transition: 1 × 60 = 60 s
    // Total (no warm-up): 2 × 360 + 60 = 780 s
    // Via formula: 0 + 6 × 60 + (6 − 2) × 90 + 1 × 60
    //            = 0 + 360 + 360 + 60 = 780 s
    expect(estimateSessionDurationSeconds(2, 6, 90, 0)).toBe(780);
  });

  it("3 exercises: 2 transitions (120 s)", () => {
    // 3 exercises × 3 sets each = 9 total sets
    // Formula: 0 + 9 × 60 + (9 − 3) × 90 + 2 × 60
    //        = 0 + 540 + 540 + 120 = 1200 s
    expect(estimateSessionDurationSeconds(3, 9, 90, 0)).toBe(1200);
  });

  it("transition is added once per gap — N exercises have exactly (N − 1) transitions", () => {
    const twoEx = estimateSessionDurationSeconds(2, 4, 90, 0); // 1 transition
    const threeEx = estimateSessionDurationSeconds(3, 6, 90, 0); // 2 transitions
    const fourEx = estimateSessionDurationSeconds(4, 8, 90, 0); // 3 transitions
    // Each additional exercise adds 60 s transition + execution + rest for 2 sets:
    // 2-set exercise: 2×60 + 1×90 = 210 s work + 60 s transition = 270 s
    expect(threeEx - twoEx).toBe(270);
    expect(fourEx - threeEx).toBe(270);
  });
});

// ── Warm-up duration ──────────────────────────────────────────────────────────

describe("warm-up duration", () => {
  it("default warm-up fallback is 300 s (5 min)", () => {
    expect(WARMUP_FALLBACK_SECONDS).toBe(300);
  });

  it("includes warm-up in total when using the default (300 s)", () => {
    const withWarmup = estimateSessionDurationSeconds(1, 3, 90); // warmup = 300
    const withoutWarmup = estimateSessionDurationSeconds(1, 3, 90, 0); // warmup = 0
    expect(withWarmup - withoutWarmup).toBe(300);
  });

  it("uses an explicit warm-up when provided (replaces the fallback)", () => {
    const customWarmup = 600; // 10 min
    const duration = estimateSessionDurationSeconds(1, 3, 90, customWarmup);
    const withoutWarmup = estimateSessionDurationSeconds(1, 3, 90, 0);
    expect(duration - withoutWarmup).toBe(600);
  });

  it("zero warm-up is respected (passed warmUpSeconds=0 → no warmup added)", () => {
    const withZeroWarmup = estimateSessionDurationSeconds(1, 3, 90, 0);
    // 3 × 60 + 2 × 90 = 360 s, no warm-up
    expect(withZeroWarmup).toBe(360);
  });
});

// ── Boundary: exactly 2700 seconds ───────────────────────────────────────────

describe("exactly 2700 seconds — accepted (not exceeds cap)", () => {
  // Construction: N=3, totalSets=17, restSeconds=90, warmUpSeconds=300
  // 300 + 17×60 + (17−3)×90 + (3−1)×60
  // = 300 + 1020 + 1260 + 120 = 2700 s  ✓
  const exercises = 3;
  const sets = 17;

  it("estimateSessionDurationSeconds returns exactly 2700 s", () => {
    expect(estimateSessionDurationSeconds(exercises, sets, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS)).toBe(2700);
  });

  it("exceedsSessionCap returns false at exactly 2700 s (accepted — strict > comparison)", () => {
    expect(exceedsSessionCap(exercises, sets, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS)).toBe(false);
  });

  it("MAX_SESSION_SECONDS constant is 2700", () => {
    expect(MAX_SESSION_SECONDS).toBe(2700);
  });
});

// ── Boundary: more than 2700 seconds ─────────────────────────────────────────

describe("more than 2700 seconds — rejected", () => {
  it("2701 s is rejected: exceedsSessionCap returns true", () => {
    // Use N=3, S=17 but bump warm-up by 1 s to reach 2701 s
    expect(exceedsSessionCap(3, 17, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS + 1)).toBe(true);
  });

  it("estimateSessionDurationSeconds > 2700 for inputs that clearly overshoot", () => {
    // N=3, S=18: 300 + 18×60 + 15×90 + 2×60 = 300 + 1080 + 1350 + 120 = 2850 s
    const duration = estimateSessionDurationSeconds(3, 18, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS);
    expect(duration).toBe(2850);
    expect(duration).toBeGreaterThan(MAX_SESSION_SECONDS);
  });

  it("exceedsSessionCap returns true for clearly overshooting inputs", () => {
    expect(exceedsSessionCap(3, 18)).toBe(true);
  });
});

// ── Exercise addition rejected when it exceeds the cap ───────────────────────

describe("exercise addition rejected when it exceeds the cap", () => {
  it("adding an exercise that pushes the session above 2700 s is detected", () => {
    // Before: N=2, S=16 → 300 + 16×60 + (16−2)×90 + 1×60
    //       = 300 + 960 + 1260 + 60 = 2580 s  (within cap)
    // After adding exercise with 2 sets: N=3, S=18
    //       = 300 + 18×60 + 15×90 + 2×60 = 2850 s  (over cap)
    const before = estimateSessionDurationSeconds(2, 16);
    const after = estimateSessionDurationSeconds(3, 18);
    expect(before).toBe(2580);
    expect(before).toBeLessThanOrEqual(MAX_SESSION_SECONDS);  // within cap before
    expect(after).toBe(2850);
    expect(exceedsSessionCap(3, 18)).toBe(true); // rejected after adding exercise
  });

  it("adding an exercise that keeps the session at or below 2700 s is not rejected", () => {
    // N=2, S=15 → 300 + 15×60 + 13×90 + 60 = 300+900+1170+60 = 2430 s
    // Add exercise with 2 sets: N=3, S=17 → 2700 s exactly
    expect(estimateSessionDurationSeconds(2, 15)).toBe(2430);
    expect(exceedsSessionCap(3, 17)).toBe(false); // exactly 2700 — accepted
  });
});

// ── Set consolidation rejected when it exceeds the cap ───────────────────────

describe("set consolidation rejected when it exceeds the cap", () => {
  // Consolidation: same exercise count (N), sets increase by delta.
  // Unlike expansion (which adds N+1, totalSets+2), consolidation keeps N fixed.
  // This test verifies that the estimator correctly reflects the cap breach
  // when only set count increases (no new exercise, no new transition).

  it("consolidation that raises total sets above the 2700-s cap is detected", () => {
    // N=1, S=16: 300 + 16×60 + 15×90 + 0 = 300 + 960 + 1350 + 0 = 2610 s  (within cap)
    // delta=1 → N=1, S=17: 300 + 17×60 + 16×90 + 0 = 300+1020+1440 = 2760 s  (over cap)
    const beforeConsolidation = estimateSessionDurationSeconds(1, 16);
    const afterConsolidation = estimateSessionDurationSeconds(1, 17);
    expect(beforeConsolidation).toBe(2610);
    expect(beforeConsolidation).toBeLessThanOrEqual(MAX_SESSION_SECONDS);  // allowed before
    expect(afterConsolidation).toBe(2760);
    expect(exceedsSessionCap(1, 17)).toBe(true); // consolidation delta=1 rejected
  });

  it("consolidation that keeps the session at or below 2700 s is not rejected", () => {
    // N=1, S=16 → 2610 s; consolidation still within cap
    expect(exceedsSessionCap(1, 16)).toBe(false);
  });

  it("consolidation with delta=2 is 30 s more expensive than expansion (same total sets)", () => {
    // Scenario: current = N=1 exercise, S=10 sets.
    // canAddMore expansion projects: N+1=2 exercises, S+minSets=12 sets.
    // Consolidation delta=2 projects: N=1 exercise,   S+delta=12 sets.
    //
    // Expansion  (N=2, S=12): 300 + 12×60 + (12−2)×90 + 1×60 = 300+720+900+60 = 1980 s
    // Consolidation (N=1, S=12): 300 + 12×60 + (12−1)×90 + 0×60 = 300+720+990+0  = 2010 s
    //
    // Consolidation is 30 s MORE expensive because it has one extra rest interval
    // (N=1 → 11 rest periods vs N=2 → 10 rest periods) while avoiding 1 transition.
    // Net: +90 s rest − 60 s transition = +30 s.
    // This means delta=2 consolidation CAN exceed the cap even when canAddMore passes.
    const consolidation = estimateSessionDurationSeconds(1, 12); // 2010 s
    const expansion = estimateSessionDurationSeconds(2, 12);     // 1980 s
    expect(consolidation).toBe(2010);
    expect(expansion).toBe(1980);
    expect(consolidation - expansion).toBe(30); // consolidation is 30 s more expensive
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("0 exercises returns the warm-up duration only", () => {
    expect(estimateSessionDurationSeconds(0, 0)).toBe(WARMUP_FALLBACK_SECONDS);
  });

  it("0 sets (exercises > 0) returns the warm-up duration only", () => {
    expect(estimateSessionDurationSeconds(2, 0)).toBe(WARMUP_FALLBACK_SECONDS);
  });

  it("rest-seconds default is 90 (from DRAFT_EXERCISE_DEFAULTS)", () => {
    expect(REST_SECONDS_FALLBACK).toBe(90);
  });

  it("estimateSessionDurationSeconds(N, S) === estimateSessionDurationSeconds(N, S, 90, 300)", () => {
    for (const [n, s] of [[1, 3], [2, 6], [5, 15]] as const) {
      expect(estimateSessionDurationSeconds(n, s)).toBe(
        estimateSessionDurationSeconds(n, s, 90, 300),
      );
    }
  });
});
