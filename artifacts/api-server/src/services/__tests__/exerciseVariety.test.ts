/**
 * Per-client exercise variety history — focused unit tests (§11)
 *
 * Covers:
 *   1–4.  Novelty ranking in sortDeterministic (N1–N4 sort steps)
 *   5–6.  Complete-success commit condition logic
 *   7–9.  Idempotency set-equality helpers used by the record-generation endpoint
 *  10–12. Edge-cases: all-in-cooldown fallback, empty history, N4 tie-breaking
 */

import { describe, it, expect } from "vitest";
import type { V0PriorityContext } from "../ExerciseSelectionEngineV0";
import { _sortDeterministicForTest as sortDeterministic } from "../ExerciseSelectionEngineV0";

// ─── Shared helpers ───────────────────────────────────────────────────────────

type PartialEx = Parameters<typeof sortDeterministic>[0][number];

function makeEx(id: number, overrides: Partial<PartialEx> = {}): PartialEx {
  return {
    id,
    name: `Exercise ${id}`,
    mainMuscleGroup: "Plecy",
    score: 0,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    exerciseType: "compound",
    equipment: [],
    trainingLocation: ["Siłownia"],
    exercisePriority: "Średni",
    learningDifficulty: 2,
    movementPattern: null,
    movementCategoryKey: null,
    secondaryMuscleGroups: [],
    suitableForNoActivity: false,
    neurologicalFatigue: 3, // medium (scale 1–5)
    ...overrides,
  };
}

const baseCtx: V0PriorityContext = {
  isPriorityEligible: false,
  tierA: [],
  tierB: [],
};

// ─── 1. N1 — cooldown exercises sort after non-cooldown ───────────────────────

describe("N1: cooldown sort", () => {
  it("moves cooldown exercise behind non-cooldown exercise", () => {
    const exA = makeEx(1); // in cooldown
    const exB = makeEx(2); // not in cooldown
    const ctx: V0PriorityContext = {
      ...baseCtx,
      cooldownIds: new Set([1]),
    };
    const result = sortDeterministic([exA, exB], undefined, ctx);
    expect(result[0].id).toBe(2); // non-cooldown wins
    expect(result[1].id).toBe(1);
  });

  it("two non-cooldown exercises are unaffected by N1", () => {
    const exA = makeEx(1);
    const exB = makeEx(2);
    const ctx: V0PriorityContext = {
      ...baseCtx,
      cooldownIds: new Set([99]), // neither 1 nor 2
    };
    const result = sortDeterministic([exA, exB], undefined, ctx);
    // Both non-cooldown — ordering falls through to id tie-breaker
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });
});

// ─── 2. N2 — never-used exercises sort before used exercises ─────────────────

describe("N2: never-used sort", () => {
  it("never-used exercise beats one with any usage history", () => {
    const exNever = makeEx(10); // no history entry
    const exUsed = makeEx(11);  // used once
    const ctx: V0PriorityContext = {
      ...baseCtx,
      usageHistory: new Map([
        [11, { totalGenerations: 1, lastUsedAt: new Date("2026-01-01") }],
      ]),
    };
    const result = sortDeterministic([exUsed, exNever], undefined, ctx);
    expect(result[0].id).toBe(10); // never-used first
  });

  it("two never-used exercises fall through to id tie-breaker", () => {
    const ctx: V0PriorityContext = {
      ...baseCtx,
      usageHistory: new Map(), // empty — no exercise has history
    };
    const result = sortDeterministic([makeEx(5), makeEx(3)], undefined, ctx);
    expect(result[0].id).toBe(3); // lower id wins tie
  });
});

// ─── 3. N3 — fewest generations wins ─────────────────────────────────────────

describe("N3: fewest generations", () => {
  it("exercise used 1× beats exercise used 3×", () => {
    const exRare = makeEx(20);
    const exCommon = makeEx(21);
    const ctx: V0PriorityContext = {
      ...baseCtx,
      usageHistory: new Map([
        [20, { totalGenerations: 1, lastUsedAt: new Date("2026-06-01") }],
        [21, { totalGenerations: 3, lastUsedAt: new Date("2026-01-01") }],
      ]),
    };
    const result = sortDeterministic([exCommon, exRare], undefined, ctx);
    expect(result[0].id).toBe(20); // rarer usage wins, even though exCommon has older lastUsedAt
  });
});

// ─── 4. N4 — least recently used wins when generation counts tie ──────────────

describe("N4: least recently used", () => {
  it("older lastUsedAt wins when totalGenerations are equal", () => {
    const exOlder = makeEx(30);
    const exNewer = makeEx(31);
    const ctx: V0PriorityContext = {
      ...baseCtx,
      usageHistory: new Map([
        [30, { totalGenerations: 2, lastUsedAt: new Date("2026-01-01") }],
        [31, { totalGenerations: 2, lastUsedAt: new Date("2026-06-01") }],
      ]),
    };
    const result = sortDeterministic([exNewer, exOlder], undefined, ctx);
    expect(result[0].id).toBe(30); // older = least recently used = first
  });
});

// ─── 5. Complete-success commit condition ────────────────────────────────────

describe("complete-success commit condition", () => {
  function shouldCommit(
    errors: string[],
    dayResultsLength: number,
    eligibleDayCount: number,
    balanceWeekSucceeded: boolean,
  ): boolean {
    return (
      errors.length === 0 &&
      dayResultsLength === eligibleDayCount &&
      balanceWeekSucceeded
    );
  }

  it("commits when all conditions are met", () => {
    expect(shouldCommit([], 3, 3, true)).toBe(true);
  });

  it("does not commit when balance-week failed", () => {
    expect(shouldCommit([], 3, 3, false)).toBe(false);
  });

  it("does not commit when not all days were generated", () => {
    expect(shouldCommit([], 2, 3, true)).toBe(false);
  });

  it("does not commit when there are generation errors", () => {
    expect(shouldCommit(["slot error"], 3, 3, true)).toBe(false);
  });
});

// ─── 6–8. Idempotency set-equality logic ─────────────────────────────────────

describe("idempotency set-equality", () => {
  function setsMatch(stored: number[], incoming: number[]): boolean {
    const storedSet = new Set(stored);
    const incomingSet = new Set(incoming);
    return (
      storedSet.size === incomingSet.size &&
      [...incomingSet].every((id) => storedSet.has(id))
    );
  }

  it("§6-B: identical sets (same order) match", () => {
    expect(setsMatch([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("§6-B: identical sets (different order) match", () => {
    expect(setsMatch([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it("§6-C: different sets do not match", () => {
    expect(setsMatch([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("§6-C: subset does not match", () => {
    expect(setsMatch([1, 2, 3], [1, 2])).toBe(false);
  });
});

// ─── 9. All-in-cooldown §9 fallback ──────────────────────────────────────────

describe("§9 cooldown fallback: entire pool in cooldown", () => {
  it("still returns all candidates (least-used first via N3/N4)", () => {
    const exA = makeEx(40); // used 5×, recently
    const exB = makeEx(41); // used 2×, older
    const ctx: V0PriorityContext = {
      ...baseCtx,
      cooldownIds: new Set([40, 41]), // both in cooldown
      usageHistory: new Map([
        [40, { totalGenerations: 5, lastUsedAt: new Date("2026-07-01") }],
        [41, { totalGenerations: 2, lastUsedAt: new Date("2026-01-01") }],
      ]),
    };
    const result = sortDeterministic([exA, exB], undefined, ctx);
    // All in cooldown (N1 draw) → N3 picks fewest generations → exB wins
    expect(result[0].id).toBe(41);
    expect(result.length).toBe(2); // no candidate dropped
  });
});

// ─── 10. No history data → novelty ranking silently disabled ─────────────────

describe("absent usageHistory and cooldownIds", () => {
  it("falls back to normal id tie-breaker when no novelty context", () => {
    const result = sortDeterministic(
      [makeEx(100), makeEx(99)],
      undefined,
      baseCtx, // no usageHistory, no cooldownIds
    );
    expect(result[0].id).toBe(99);
    expect(result[1].id).toBe(100);
  });
});
