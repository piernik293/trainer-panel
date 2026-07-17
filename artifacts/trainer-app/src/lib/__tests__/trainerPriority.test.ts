/**
 * Trainer Selection Priority — Stage 3 tests
 *
 * Pure unit tests: no database, no network, no component rendering.
 * Tests cover only trainerPriorityRank().
 * Classification helper tests live in exerciseClassification.test.ts.
 */

import { describe, it, expect } from "vitest";
import { trainerPriorityRank } from "../trainerPriority";
import { EXERCISE_TYPE, EXERCISE_PRIORITY } from "../exerciseClassification";

// ─── Tier base ordinals ────────────────────────────────────────────────────────

describe("trainerPriorityRank() — tier ordinal spacing", () => {
  it("primary compound ranks below secondary compound", () => {
    const primary = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
    });
    const secondary = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 2,
    });
    expect(primary).toBeLessThan(secondary);
  });

  it("secondary compound ranks below accessory (unknown type)", () => {
    const secondary = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 2,
    });
    const accessory = trainerPriorityRank({ exerciseType: null });
    expect(secondary).toBeLessThan(accessory);
  });

  it("accessory ranks below isolation", () => {
    const accessory = trainerPriorityRank({ exerciseType: null });
    const isolation = trainerPriorityRank({ exerciseType: EXERCISE_TYPE.ISOLATION });
    expect(accessory).toBeLessThan(isolation);
  });

  it("isolation ranks below core finisher", () => {
    const isolation = trainerPriorityRank({ exerciseType: EXERCISE_TYPE.ISOLATION });
    const core = trainerPriorityRank({ mainMuscleGroup: "Brzuch" });
    expect(isolation).toBeLessThan(core);
  });

  it("primary compound + Bardzo wysoki = 0 (best possible rank)", () => {
    expect(trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
      exercisePriority: EXERCISE_PRIORITY.VERY_HIGH,
    })).toBe(0);
  });

  it("core finisher + Niski = 43 (worst possible rank)", () => {
    expect(trainerPriorityRank({
      mainMuscleGroup: "Brzuch",
      exercisePriority: EXERCISE_PRIORITY.LOW,
    })).toBe(43);
  });

  it("explicit tier bases are 0, 10, 20, 30, 40", () => {
    // Verify by computing with neutral priority (rank 2 = Średni)
    const neutralPriority = EXERCISE_PRIORITY.MEDIUM;
    expect(trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
      exercisePriority: neutralPriority,
    })).toBe(2);  // primary_compound base=0 + rank=2

    expect(trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 2,
      exercisePriority: neutralPriority,
    })).toBe(12); // secondary_compound base=10 + rank=2

    expect(trainerPriorityRank({
      exerciseType: null,
      exercisePriority: neutralPriority,
    })).toBe(22); // accessory base=20 + rank=2

    expect(trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: neutralPriority,
    })).toBe(32); // isolation base=30 + rank=2

    expect(trainerPriorityRank({
      mainMuscleGroup: "Brzuch",
      exercisePriority: neutralPriority,
    })).toBe(42); // core_finisher base=40 + rank=2
  });
});

// ─── Exercise priority sub-ranking ────────────────────────────────────────────

describe("trainerPriorityRank() — exercisePriority within the same tier", () => {
  it("Bardzo wysoki outranks Wysoki within isolation tier", () => {
    const veryHigh = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: EXERCISE_PRIORITY.VERY_HIGH,
    });
    const high = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: EXERCISE_PRIORITY.HIGH,
    });
    expect(veryHigh).toBeLessThan(high);
  });

  it("all four priority levels produce distinct ranks within the same tier", () => {
    const ranks = [
      EXERCISE_PRIORITY.VERY_HIGH,
      EXERCISE_PRIORITY.HIGH,
      EXERCISE_PRIORITY.MEDIUM,
      EXERCISE_PRIORITY.LOW,
    ].map((p) => trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: p,
    }));
    // Each should differ by 1 and be in ascending order
    expect(ranks[0]).toBe(30);
    expect(ranks[1]).toBe(31);
    expect(ranks[2]).toBe(32);
    expect(ranks[3]).toBe(33);
  });

  it("priority ranks within a tier do not bleed into the next tier", () => {
    const worstSecondary = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 2,
      exercisePriority: EXERCISE_PRIORITY.LOW,
    }); // secondary base=10 + rank=3 = 13
    const bestAccessory = trainerPriorityRank({
      exerciseType: null,
      exercisePriority: EXERCISE_PRIORITY.VERY_HIGH,
    }); // accessory base=20 + rank=0 = 20
    expect(worstSecondary).toBeLessThan(bestAccessory);
  });
});

// ─── Missing metadata fallback ────────────────────────────────────────────────

describe("trainerPriorityRank() — missing metadata", () => {
  it("all-null input returns 22 (accessory base + medium priority)", () => {
    expect(trainerPriorityRank({})).toBe(22);
  });

  it("null exercisePriority defaults to medium rank (2)", () => {
    const withNull = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: null,
    });
    const withMedium = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: EXERCISE_PRIORITY.MEDIUM,
    });
    expect(withNull).toBe(withMedium);
  });

  it("unknown exerciseType string falls back to accessory", () => {
    const result = trainerPriorityRank({ exerciseType: "Nieznany" });
    expect(result).toBe(22); // accessory=20 + medium=2
  });

  it("returns a finite number for any combination of missing fields", () => {
    const cases: TrainerPriorityInput[] = [
      {},
      { exerciseType: null },
      { neurologicalFatigue: null },
      { exercisePriority: null },
      { mainMuscleGroup: null },
      { exerciseType: null, exercisePriority: null, mainMuscleGroup: null },
    ];
    for (const input of cases) {
      expect(Number.isFinite(trainerPriorityRank(input))).toBe(true);
    }
  });
});

// ─── Primary compound beats isolation ─────────────────────────────────────────

describe("trainerPriorityRank() — compound preference", () => {
  it("primary compound + any priority always outranks isolation + any priority", () => {
    const worstCompound = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.COMPOUND,
      neurologicalFatigue: 5,
      exercisePriority: EXERCISE_PRIORITY.LOW,
    }); // 0+3 = 3
    const bestIsolation = trainerPriorityRank({
      exerciseType: EXERCISE_TYPE.ISOLATION,
      exercisePriority: EXERCISE_PRIORITY.VERY_HIGH,
    }); // 30+0 = 30
    expect(worstCompound).toBeLessThan(bestIsolation);
  });
});

// Required for type usage in the test
type TrainerPriorityInput = Parameters<typeof trainerPriorityRank>[0];
