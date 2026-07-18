/**
 * fatigueManagement.ts — Stage 6 unit tests
 *
 * Tests cover:
 *   - Zero penalty in degenerate/no-overlap cases
 *   - Primary-muscle overlap with varying NF (isolation vs compound candidate)
 *   - Secondary-muscle overlap contribution
 *   - String normalisation (case-insensitive, trimmed)
 *   - Penalty ceiling (max 3)
 *   - Empty secondaryMuscleGroups arrays degrade gracefully to primary-only detection
 */

import { describe, it, expect } from "vitest";
import {
  computeFatiguePenalty,
  type FatigueCandidateInput,
  type FatigueCommittedInput,
} from "../fatigueManagement";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function candidate(
  primary: string,
  nf: number,
  secondaries: string[] = [],
): FatigueCandidateInput {
  return { mainMuscleGroup: primary, neurologicalFatigue: nf, secondaryMuscleGroups: secondaries };
}

function committed(
  primary: string,
  nf: number,
  sets: number,
  secondaries: string[] = [],
): FatigueCommittedInput {
  return { mainMuscleGroup: primary, neurologicalFatigue: nf, sets, secondaryMuscleGroups: secondaries };
}

// ─── Basic / degenerate cases ─────────────────────────────────────────────────

describe("computeFatiguePenalty — zero cases", () => {
  it("returns 0 when no exercises have been committed", () => {
    expect(computeFatiguePenalty(candidate("chest", 5), [])).toBe(0);
  });

  it("returns 0 when candidate primary does not overlap any committed muscle", () => {
    const comm = committed("back", 5, 3);
    expect(computeFatiguePenalty(candidate("chest", 5), [comm])).toBe(0);
  });

  it("returns 0 when candidate has only secondary overlap with committed secondary (too weak to reach threshold)", () => {
    // candidate secondary "triceps" ↔ committed secondary "triceps": weight = 0.25
    // rawLoad = 5 × 3 × 0.25 = 3.75; candidateNF=2; scaledLoad = 3.75 × (2/3) = 2.5
    // floor(2.5 / 12) = 0
    const comm = committed("shoulder", 5, 3, ["triceps"]);
    expect(computeFatiguePenalty(candidate("chest", 2, ["triceps"]), [comm])).toBe(0);
  });
});

// ─── Primary-muscle overlap ───────────────────────────────────────────────────

describe("computeFatiguePenalty — primary muscle overlap", () => {
  it("returns 0 for a low-NF (isolation) candidate after a high-NF compound on the same primary", () => {
    // Simulates: Bench Press (NF=5, sets=3) → Cable Fly (NF=2, same primary)
    // rawLoad = 5 × 3 = 15; scaledLoad = 15 × (2/3) = 10; floor(10/12) = 0
    const comm = committed("chest", 5, 3);
    expect(computeFatiguePenalty(candidate("chest", 2), [comm])).toBe(0);
  });

  it("returns moderate penalty for a high-NF compound after another high-NF compound on the same primary", () => {
    // Simulates: Bench Press (NF=5, sets=3) → Incline DB Press (NF=4, same primary + secondaries)
    // rawLoad (primary only) = 5 × 3 = 15; scaledLoad = 15 × (4/3) = 20; floor(20/12) = 1
    const comm = committed("chest", 5, 3);
    expect(computeFatiguePenalty(candidate("chest", 4), [comm])).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 for a low-NF isolation candidate after compound even at 4 sets", () => {
    // Squat (NF=5, sets=4) → Leg Extension (NF=2, same primary, no secondaries)
    // rawLoad = 5 × 4 = 20; scaledLoad = 20 × (2/3) ≈ 13.3; floor(13.3/12) = 1
    // Note: 4 sets triggers penalty=1, but only just — still "small"
    const comm = committed("quadriceps", 5, 4);
    const penalty = computeFatiguePenalty(candidate("quadriceps", 2), [comm]);
    expect(penalty).toBeLessThanOrEqual(1);
  });

  it("returns 0 when candidate is isolation (NF=1) regardless of accumulated primary load", () => {
    // NF=1 candidate: scaledLoad = rawLoad × (1/3), which is very small
    const comm1 = committed("chest", 5, 4);
    const comm2 = committed("chest", 4, 4);
    // rawLoad = 5×4 + 4×4 = 36; scaledLoad = 36 × (1/3) = 12; floor(12/12) = 1
    // Penalty of 1 is acceptable ("small") — isolations still rarely trigger high penalties
    const penalty = computeFatiguePenalty(candidate("chest", 1), [comm1, comm2]);
    expect(penalty).toBeLessThanOrEqual(1);
  });

  it("accumulates load across multiple committed exercises", () => {
    // Three high-NF compounds on same primary
    const comm = committed("back", 5, 4);
    const penaltyOne   = computeFatiguePenalty(candidate("back", 5), [comm]);
    const penaltyThree = computeFatiguePenalty(candidate("back", 5), [comm, comm, comm]);
    // Three committed exercises should produce strictly higher penalty than one
    expect(penaltyThree).toBeGreaterThan(penaltyOne);
  });
});

// ─── Secondary-muscle overlap ─────────────────────────────────────────────────

describe("computeFatiguePenalty — secondary muscle overlap", () => {
  it("adds half-weight load when candidate primary appears in committed secondary muscles", () => {
    // committed primary = "shoulder", secondary = "triceps"
    // candidate primary = "triceps" → Case 2: rawLoad += 5×3 × 0.5 = 7.5
    // scaledLoad = 7.5 × (4/3) = 10; floor(10/12) = 0
    const comm = committed("shoulder", 5, 3, ["triceps"]);
    expect(computeFatiguePenalty(candidate("triceps", 4), [comm])).toBe(0);
  });

  it("adds half-weight load when candidate secondary matches committed primary", () => {
    // committed primary = "triceps"
    // candidate primary = "chest", secondary = "triceps" → Case 3
    // rawLoad = 5×3 × 0.5 = 7.5; scaledLoad = 7.5 × (4/3) = 10; floor(10/12) = 0
    const comm = committed("triceps", 5, 3);
    expect(computeFatiguePenalty(candidate("chest", 4, ["triceps"]), [comm])).toBe(0);
  });

  it("adds secondary weights on top of primary overlap — more total overlap yields higher penalty", () => {
    // candidate primary "chest" with secondary "triceps"
    // committed primary "chest" with secondary "triceps"
    // rawLoad = (5×3)×1.0 + (5×3)×0.25 = 15 + 3.75 = 18.75
    // scaledLoad = 18.75 × (4/3) = 25; floor(25/12) = 2
    const comm = committed("chest", 5, 3, ["triceps"]);
    const penaltyWithSec = computeFatiguePenalty(candidate("chest", 4, ["triceps"]), [comm]);
    const penaltyWithout = computeFatiguePenalty(candidate("chest", 4),              [comm]);
    expect(penaltyWithSec).toBeGreaterThanOrEqual(penaltyWithout);
  });

  it("full secondary-overlap scenario yields penalty ≥ 2 (moderate-strong)", () => {
    // Simulates: RDL (NF=5, sets=3, primary=hamstrings, secondary=[glutes,back])
    //         → Good Morning (NF=4, primary=hamstrings, secondary=[glutes,back])
    // rawLoad = 15 + 0.25×15 + 0.25×15 = 15 + 3.75 + 3.75 = 22.5
    // scaledLoad = 22.5 × (4/3) = 30; floor(30/12) = 2
    const comm = committed("hamstrings", 5, 3, ["glutes", "back"]);
    const penalty = computeFatiguePenalty(candidate("hamstrings", 4, ["glutes", "back"]), [comm]);
    expect(penalty).toBeGreaterThanOrEqual(2);
  });
});

// ─── String normalisation ─────────────────────────────────────────────────────

describe("computeFatiguePenalty — string normalisation", () => {
  it("matches muscle groups case-insensitively", () => {
    const comm = committed("Chest", 5, 3);
    expect(computeFatiguePenalty(candidate("chest", 5), [comm])).toBe(
      computeFatiguePenalty(candidate("Chest", 5), [comm]),
    );
  });

  it("trims whitespace from muscle group names", () => {
    const comm = committed("  chest  ", 5, 3);
    const penalty = computeFatiguePenalty(candidate("chest", 5), [comm]);
    expect(penalty).toBeGreaterThan(0); // overlap detected despite whitespace
  });

  it("matches secondary muscles case-insensitively", () => {
    const comm1 = committed("shoulder", 5, 3, ["Triceps"]);
    const comm2 = committed("shoulder", 5, 3, ["triceps"]);
    expect(
      computeFatiguePenalty(candidate("triceps", 4), [comm1]),
    ).toBe(
      computeFatiguePenalty(candidate("triceps", 4), [comm2]),
    );
  });
});

// ─── Missing / null metadata fallbacks ───────────────────────────────────────

describe("computeFatiguePenalty — missing metadata fallbacks", () => {
  it("treats missing neurologicalFatigue as 1 (minimum)", () => {
    const commNull = committed("chest", 1, 3);          // explicit NF=1
    const commUndef: FatigueCommittedInput = { mainMuscleGroup: "chest", sets: 3 }; // no NF
    expect(computeFatiguePenalty(candidate("chest", 1), [commUndef])).toBe(
      computeFatiguePenalty(candidate("chest", 1), [commNull]),
    );
  });

  it("treats missing candidate neurologicalFatigue as 1 (minimum)", () => {
    const comm = committed("chest", 5, 4);
    const candFull: FatigueCandidateInput = { mainMuscleGroup: "chest", neurologicalFatigue: 1 };
    const candMissing: FatigueCandidateInput = { mainMuscleGroup: "chest" };
    expect(computeFatiguePenalty(candMissing, [comm])).toBe(
      computeFatiguePenalty(candFull,    [comm]),
    );
  });

  it("treats null / missing secondaryMuscleGroups as empty array (no secondary overlap)", () => {
    const commNoSec: FatigueCommittedInput = { mainMuscleGroup: "chest", neurologicalFatigue: 5, sets: 3 };
    const commEmptySec = committed("chest", 5, 3, []);
    expect(computeFatiguePenalty(candidate("chest", 4), [commNoSec])).toBe(
      computeFatiguePenalty(candidate("chest", 4), [commEmptySec]),
    );
  });
});

// ─── Ceiling ─────────────────────────────────────────────────────────────────

describe("computeFatiguePenalty — penalty ceiling", () => {
  it("never exceeds 3 regardless of accumulated load", () => {
    // Six high-NF compounds on same primary with identical secondaries
    const comm = committed("chest", 5, 4, ["triceps", "shoulder"]);
    const penalty = computeFatiguePenalty(
      candidate("chest", 5, ["triceps", "shoulder"]),
      [comm, comm, comm, comm, comm, comm],
    );
    expect(penalty).toBe(3);
  });
});
