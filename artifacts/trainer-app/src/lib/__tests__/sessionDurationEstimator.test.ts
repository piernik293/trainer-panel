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
 *
 * Warm-up is now 10 min (600 s) — aligned with workoutDurationEstimator.ts.
 * Session cap is 3600 s (60 min = 10-min warm-up + 50-min max main workout).
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

  it("returns 960 seconds for the full session (including warm-up fallback of 600 s)", () => {
    // 600 + 360 = 960 s
    expect(estimateSessionDurationSeconds(1, 3)).toBe(960);
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

  it("full session: 600 + 120 + 60 + 0 = 780 s (warm-up + execution + rest, no transition)", () => {
    expect(estimateSessionDurationSeconds(1, 2, 60)).toBe(780);
  });
});

// ── 3 sets with 90-second rest ────────────────────────────────────────────────

describe("3 sets with 90-second rest", () => {
  it("exercise portion: 3 × 60 + 2 × 90 = 360 s (matches spec example)", () => {
    expect(exerciseDuration(3, 90)).toBe(360);
  });

  it("full session: 600 + 180 + 180 + 0 = 960 s", () => {
    expect(estimateSessionDurationSeconds(1, 3, 90)).toBe(960);
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
  it("default warm-up fallback is 600 s (10 min) — aligned with workoutDurationEstimator", () => {
    expect(WARMUP_FALLBACK_SECONDS).toBe(600);
  });

  it("includes warm-up in total when using the default (600 s)", () => {
    const withWarmup = estimateSessionDurationSeconds(1, 3, 90); // warmup = 600
    const withoutWarmup = estimateSessionDurationSeconds(1, 3, 90, 0); // warmup = 0
    expect(withWarmup - withoutWarmup).toBe(600);
  });

  it("uses an explicit warm-up when provided (replaces the fallback)", () => {
    const customWarmup = 300; // 5 min
    const duration = estimateSessionDurationSeconds(1, 3, 90, customWarmup);
    const withoutWarmup = estimateSessionDurationSeconds(1, 3, 90, 0);
    expect(duration - withoutWarmup).toBe(300);
  });

  it("zero warm-up is respected (passed warmUpSeconds=0 → no warmup added)", () => {
    const withZeroWarmup = estimateSessionDurationSeconds(1, 3, 90, 0);
    // 3 × 60 + 2 × 90 = 360 s, no warm-up
    expect(withZeroWarmup).toBe(360);
  });
});

// ── Boundary: exactly 3600 seconds ───────────────────────────────────────────

describe("exactly 3600 seconds — accepted (not exceeds cap)", () => {
  // Construction: N=3, totalSets=21, restSeconds=90, warmUpSeconds=600
  // 600 + 21×60 + (21−3)×90 + (3−1)×60
  // = 600 + 1260 + 1620 + 120 = 3600 s  ✓
  const exercises = 3;
  const sets = 21;

  it("estimateSessionDurationSeconds returns exactly 3600 s", () => {
    expect(estimateSessionDurationSeconds(exercises, sets, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS)).toBe(3600);
  });

  it("exceedsSessionCap returns false at exactly 3600 s (accepted — strict > comparison)", () => {
    expect(exceedsSessionCap(exercises, sets, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS)).toBe(false);
  });

  it("MAX_SESSION_SECONDS constant is 3600", () => {
    expect(MAX_SESSION_SECONDS).toBe(3600);
  });
});

// ── Boundary: more than 3600 seconds ─────────────────────────────────────────

describe("more than 3600 seconds — rejected", () => {
  it("3601 s is rejected: exceedsSessionCap returns true", () => {
    // Use N=3, S=21 but bump warm-up by 1 s to reach 3601 s
    expect(exceedsSessionCap(3, 21, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS + 1)).toBe(true);
  });

  it("estimateSessionDurationSeconds > 3600 for inputs that clearly overshoot", () => {
    // N=3, S=22: 600 + 22×60 + (22−3)×90 + 2×60 = 600 + 1320 + 1710 + 120 = 3750 s
    const duration = estimateSessionDurationSeconds(3, 22, REST_SECONDS_FALLBACK, WARMUP_FALLBACK_SECONDS);
    expect(duration).toBe(3750);
    expect(duration).toBeGreaterThan(MAX_SESSION_SECONDS);
  });

  it("exceedsSessionCap returns true for clearly overshooting inputs", () => {
    expect(exceedsSessionCap(3, 22)).toBe(true);
  });
});

// ── Exercise addition rejected when it exceeds the cap ───────────────────────

describe("exercise addition rejected when it exceeds the cap", () => {
  it("adding an exercise that pushes the session above 3600 s is detected", () => {
    // Before: N=2, S=20 → 600 + 20×60 + (20−2)×90 + 1×60
    //       = 600 + 1200 + 1620 + 60 = 3480 s  (within cap)
    // After adding exercise with 2 sets: N=3, S=22
    //       = 600 + 22×60 + 19×90 + 2×60 = 3750 s  (over cap)
    const before = estimateSessionDurationSeconds(2, 20);
    const after = estimateSessionDurationSeconds(3, 22);
    expect(before).toBe(3480);
    expect(before).toBeLessThanOrEqual(MAX_SESSION_SECONDS);  // within cap before
    expect(after).toBe(3750);
    expect(exceedsSessionCap(3, 22)).toBe(true); // rejected after adding exercise
  });

  it("adding an exercise that keeps the session at or below 3600 s is not rejected", () => {
    // N=2, S=19 → 600 + 19×60 + (19−2)×90 + 1×60 = 600+1140+1530+60 = 3330 s
    // Add exercise with 2 sets: N=3, S=21 → 3600 s exactly
    expect(estimateSessionDurationSeconds(2, 19)).toBe(3330);
    expect(exceedsSessionCap(3, 21)).toBe(false); // exactly 3600 — accepted
  });
});

// ── Set consolidation rejected when it exceeds the cap ───────────────────────

describe("set consolidation rejected when it exceeds the cap", () => {
  // Consolidation: same exercise count (N), sets increase by delta.
  // Unlike expansion (which adds N+1, totalSets+2), consolidation keeps N fixed.
  // This test verifies that the estimator correctly reflects the cap breach
  // when only set count increases (no new exercise, no new transition).

  it("consolidation that raises total sets above the 3600-s cap is detected", () => {
    // N=1, S=20: 600 + 20×60 + (20−1)×90 + 0 = 600 + 1200 + 1710 + 0 = 3510 s  (within cap)
    // delta=1 → N=1, S=21: 600 + 21×60 + (21−1)×90 + 0 = 600+1260+1800 = 3660 s  (over cap)
    const beforeConsolidation = estimateSessionDurationSeconds(1, 20);
    const afterConsolidation = estimateSessionDurationSeconds(1, 21);
    expect(beforeConsolidation).toBe(3510);
    expect(beforeConsolidation).toBeLessThanOrEqual(MAX_SESSION_SECONDS);  // allowed before
    expect(afterConsolidation).toBe(3660);
    expect(exceedsSessionCap(1, 21)).toBe(true); // consolidation delta=1 rejected
  });

  it("consolidation that keeps the session at or below 3600 s is not rejected", () => {
    // N=1, S=20 → 3510 s; consolidation still within cap
    expect(exceedsSessionCap(1, 20)).toBe(false);
  });

  it("consolidation with delta=2 is 30 s more expensive than expansion (same total sets)", () => {
    // Scenario: current = N=1 exercise, S=10 sets.
    // canAddMore expansion projects: N+1=2 exercises, S+minSets=12 sets.
    // Consolidation delta=2 projects: N=1 exercise,   S+delta=12 sets.
    //
    // Expansion  (N=2, S=12): 600 + 12×60 + (12−2)×90 + 1×60 = 600+720+900+60 = 2280 s
    // Consolidation (N=1, S=12): 600 + 12×60 + (12−1)×90 + 0×60 = 600+720+990+0  = 2310 s
    //
    // Consolidation is 30 s MORE expensive because it has one extra rest interval
    // (N=1 → 11 rest periods vs N=2 → 10 rest periods) while avoiding 1 transition.
    // Net: +90 s rest − 60 s transition = +30 s.
    // This means delta=2 consolidation CAN exceed the cap even when canAddMore passes.
    const consolidation = estimateSessionDurationSeconds(1, 12); // 2310 s
    const expansion = estimateSessionDurationSeconds(2, 12);     // 2280 s
    expect(consolidation).toBe(2310);
    expect(expansion).toBe(2280);
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

  it("estimateSessionDurationSeconds(N, S) === estimateSessionDurationSeconds(N, S, 90, 600)", () => {
    for (const [n, s] of [[1, 3], [2, 6], [5, 15]] as const) {
      expect(estimateSessionDurationSeconds(n, s)).toBe(
        estimateSessionDurationSeconds(n, s, 90, 600),
      );
    }
  });
});
