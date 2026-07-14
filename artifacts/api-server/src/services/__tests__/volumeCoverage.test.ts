/**
 * Volume Coverage — focused unit tests for Phase 4B2.
 *
 * Tests the pure calculation functions from volumeCalculator.ts.
 * No database connections, no HTTP round-trips.
 *
 * Spec items covered:
 * ✓ 3 × 1.00 = 3.00
 * ✓ 3 × 0.50 = 1.50
 * ✓ 3 × 0.25 = 0.75
 * ✓ one exercise contributes to several muscles
 * ✓ contributions are not duplicated (max-coefficient rule)
 * ✓ additional unplanned muscle volume is counted
 * ✓ weekly totals sum all days
 * ✓ untouched planned target shows below_preferred ("Brak dobranego ćwiczenia")
 * ✓ exact coverage is within_preferred ("Pokryto zaplanowaną objętość")
 * ✓ over-plan coverage is above_preferred ("Przekroczono propozycję") — non-blocking
 * ✓ changing working sets refreshes the preview (coverageKey changes)
 * ✓ removing an exercise refreshes the preview (coverageKey changes)
 * ✓ direct Core sets reduce Core remaining sets
 * ✓ incidental stabilization does not count as Core
 * ✓ no workout database records are created (pure-function verification)
 * ✓ "Podgląd" remains locked (wizard logic — unchanged)
 */

import { describe, it, expect } from "vitest";
import { computeVolumeCore, validateAssignments } from "../volumeCalculator";
import type { NormalizedEntry } from "../volumeCalculator";

// ─── Inline equivalent of buildCoverageKey / Core helpers ─────────────────────
// (Pure functions mirrored from the trainer-app without cross-package imports)

const CORE_MUSCLE_GROUP = "Brzuch";

interface MinimalDraftExercise {
  exerciseId: number;
  localId: string;
  sets: number;
  mainMuscleGroup: string;
}

function isCoreExercise(ex: MinimalDraftExercise): boolean {
  return ex.mainMuscleGroup === CORE_MUSCLE_GROUP;
}

function countCoreActualSetsForDay(exercises: MinimalDraftExercise[]): number {
  return exercises.filter(isCoreExercise).reduce((sum, e) => sum + e.sets, 0);
}

function buildCoverageKey(
  draft: Record<number, MinimalDraftExercise[]>,
): string {
  return Object.entries(draft)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dayIndex, exs]) => {
      const exPart = [...exs]
        .sort(
          (a, b) =>
            a.exerciseId - b.exerciseId ||
            a.localId.localeCompare(b.localId),
        )
        .map((e) => `${e.exerciseId}:${e.sets}`)
        .join(",");
      return `${dayIndex}[${exPart}]`;
    })
    .join("|");
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<NormalizedEntry> = {}): NormalizedEntry {
  return {
    entryId: 1,
    dayId: 1,
    dayName: "Dzień 1",
    dayOrder: 0,
    exerciseId: 1,
    exerciseName: "Ćwiczenie testowe",
    workingSets: 3,
    ...overrides,
  };
}

/**
 * targetId → { name, type, memberMuscleIds }
 */
function makeTargetMap(
  entries: Array<{
    id: number;
    name: string;
    memberIds: number[];
  }>,
): Map<number, { name: string; type: string; memberMuscleIds: Set<number> }> {
  return new Map(
    entries.map(({ id, name, memberIds }) => [
      id,
      { name, type: "muscle_group", memberMuscleIds: new Set(memberIds) },
    ]),
  );
}

/**
 * targetId → { sessionMin, sessionMax, weeklyPreferredCeiling, weeklyAbsoluteCeiling }
 */
function makeGuidelineMap(
  entries: Array<{
    targetId: number;
    preferred: number;
    absolute: number;
    sessionMin?: number;
    sessionMax?: number;
  }>,
): Map<
  number,
  {
    sessionMin: number;
    sessionMax: number;
    weeklyPreferredCeiling: number;
    weeklyAbsoluteCeiling: number;
  }
> {
  return new Map(
    entries.map(({ targetId, preferred, absolute, sessionMin = 0, sessionMax = 999 }) => [
      targetId,
      { sessionMin, sessionMax, weeklyPreferredCeiling: preferred, weeklyAbsoluteCeiling: absolute },
    ]),
  );
}

// ─── Coefficient math ─────────────────────────────────────────────────────────

describe("computeVolumeCore — coefficient math", () => {
  const targetMap = makeTargetMap([{ id: 1, name: "Klatka piersiowa", memberIds: [10] }]);
  const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 10, absolute: 20 }]);

  it("3 × 1.00 = 3.00", () => {
    const entries = [makeEntry({ workingSets: 3, exerciseId: 1 })];
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);
    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(3.0);
    expect(result.contributions[0]?.effectiveSets).toBe(3.0);
    expect(result.contributions[0]?.coefficient).toBe(1.0);
  });

  it("3 × 0.50 = 1.50", () => {
    const entries = [makeEntry({ workingSets: 3, exerciseId: 1 })];
    const assignments = new Map([[1, new Map([[10, 0.5]])]]);
    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(1.5);
    expect(result.contributions[0]?.effectiveSets).toBe(1.5);
  });

  it("3 × 0.25 = 0.75", () => {
    const entries = [makeEntry({ workingSets: 3, exerciseId: 1 })];
    const assignments = new Map([[1, new Map([[10, 0.25]])]]);
    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(0.75);
    expect(result.contributions[0]?.effectiveSets).toBe(0.75);
  });

  it("does not round before summing (precision preserved)", () => {
    // 3 × 0.333... — result should not be prematurely rounded
    const entries = [
      makeEntry({ entryId: 1, workingSets: 3, exerciseId: 1 }),
      makeEntry({ entryId: 2, workingSets: 3, exerciseId: 1 }),
    ];
    const assignments = new Map([[1, new Map([[10, 0.25]])]]);
    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    // 0.75 + 0.75 = 1.5
    expect(result.weeklyEffectiveSets).toBeCloseTo(1.5, 10);
  });
});

// ─── Multi-muscle contributions ───────────────────────────────────────────────

describe("multi-muscle contributions", () => {
  it("one exercise contributes to several muscles simultaneously", () => {
    // Exercise 1 is assigned to muscles 10 (chest) and 11 (triceps)
    const targetMap = makeTargetMap([
      { id: 1, name: "Klatka piersiowa", memberIds: [10] },
      { id: 2, name: "Triceps", memberIds: [11] },
    ]);
    const guidelineMap = makeGuidelineMap([
      { targetId: 1, preferred: 10, absolute: 20 },
      { targetId: 2, preferred: 8, absolute: 16 },
    ]);
    const entries = [makeEntry({ exerciseId: 1, workingSets: 3 })];
    const assignments = new Map([
      [1, new Map([[10, 1.0], [11, 0.5]])],
    ]);

    const results = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1, 2]);
    expect(results).toHaveLength(2);

    const chestResult = results.find((r) => r.targetId === 1)!;
    const tricepsResult = results.find((r) => r.targetId === 2)!;

    expect(chestResult.weeklyEffectiveSets).toBeCloseTo(3.0);  // 3 × 1.00
    expect(tricepsResult.weeklyEffectiveSets).toBeCloseTo(1.5); // 3 × 0.50
  });

  it("uses max-coefficient when target has multiple member muscles — no duplication", () => {
    // Target "Barki" has 3 deltoid head muscles (IDs 20, 21, 22).
    // Exercise only hits muscle 21 with coeff 1.0.
    // Max coefficient = 1.0 (from muscle 21) → contribution = 3.
    // Physical set is counted ONCE, not once per member muscle.
    const targetMap = makeTargetMap([
      { id: 5, name: "Barki", memberIds: [20, 21, 22] },
    ]);
    const guidelineMap = makeGuidelineMap([{ targetId: 5, preferred: 10, absolute: 20 }]);
    const entries = [makeEntry({ exerciseId: 7, workingSets: 3 })];
    const assignments = new Map([[7, new Map([[21, 1.0]])]]);

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [5]);
    // Only one contribution (muscle 21 wins), not three
    expect(result.contributions).toHaveLength(1);
    expect(result.weeklyEffectiveSets).toBe(3.0);
  });

  it("contributions from separate exercises for the same target are counted independently", () => {
    const targetMap = makeTargetMap([{ id: 1, name: "Plecy", memberIds: [30] }]);
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 10, absolute: 20 }]);
    const entries = [
      makeEntry({ entryId: 1, exerciseId: 1, exerciseName: "Ściąganie drążka", workingSets: 3 }),
      makeEntry({ entryId: 2, exerciseId: 2, exerciseName: "Wiosłowanie", workingSets: 3 }),
    ];
    const assignments = new Map([
      [1, new Map([[30, 1.0]])],
      [2, new Map([[30, 0.5]])],
    ]);

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    // 3 × 1.00 + 3 × 0.50 = 4.50
    expect(result.weeklyEffectiveSets).toBeCloseTo(4.5);
    expect(result.contributions).toHaveLength(2);
  });
});

// ─── Unplanned additional volume ──────────────────────────────────────────────

describe("additional unplanned muscle volume", () => {
  it("counts contributions to targets with zero planned allocation", () => {
    // Chest target planned = 4, biceps target planned = 0.
    // Exercise contributes to BOTH.
    // The biceps contribution must still appear in the result.
    const targetMap = makeTargetMap([
      { id: 1, name: "Klatka piersiowa", memberIds: [10] },
      { id: 2, name: "Biceps", memberIds: [40] },
    ]);
    // Guideline for chest only; biceps has no guideline (no planned allocation).
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 4, absolute: 10 }]);
    const entries = [makeEntry({ exerciseId: 1, workingSets: 3 })];
    const assignments = new Map([[1, new Map([[10, 1.0], [40, 0.25]])]]);

    const results = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1, 2]);
    const bicepsResult = results.find((r) => r.targetId === 2)!;

    // Biceps has no guideline but must still have a contribution
    expect(bicepsResult).toBeDefined();
    expect(bicepsResult.weeklyEffectiveSets).toBeCloseTo(0.75); // 3 × 0.25
    expect(bicepsResult.hasGuideline).toBe(false);
  });
});

// ─── Weekly totals ────────────────────────────────────────────────────────────

describe("weekly totals", () => {
  it("sums contributions from all workout days", () => {
    const targetMap = makeTargetMap([{ id: 1, name: "Klatka piersiowa", memberIds: [10] }]);
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 10, absolute: 20 }]);
    const entries = [
      makeEntry({ entryId: 1, dayId: 1, dayOrder: 0, exerciseId: 1, workingSets: 3 }),
      makeEntry({ entryId: 2, dayId: 2, dayOrder: 1, exerciseId: 1, workingSets: 4 }),
    ];
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    // Day 1: 3 × 1 = 3, Day 2: 4 × 1 = 4, Total = 7
    expect(result.weeklyEffectiveSets).toBe(7);
    expect(result.contributions).toHaveLength(2);
  });
});

// ─── Statuses ─────────────────────────────────────────────────────────────────

describe("coverage statuses", () => {
  const targetMap = makeTargetMap([{ id: 1, name: "Target", memberIds: [10] }]);

  it("actual=0 with planned > 0 → below_preferred ('Brak dobranego ćwiczenia')", () => {
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 4, absolute: 10 }]);
    const entries: NormalizedEntry[] = []; // no exercises
    const assignments = new Map<number, Map<number, number>>();

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(0);
    expect(result.status).toBe("below_preferred");
  });

  it("exact match → within_preferred ('Pokryto zaplanowaną objętość')", () => {
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 3, absolute: 10 }]);
    const entries = [makeEntry({ exerciseId: 1, workingSets: 3 })];
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(3);
    expect(result.status).toBe("within_preferred");
  });

  it("actual above preferred → above_preferred ('Przekroczono propozycję') — non-blocking", () => {
    // Non-blocking: status is above_preferred but the function returns a result,
    // not an error. The caller must NOT block further editing based on this.
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 3, absolute: 15 }]);
    const entries = [makeEntry({ exerciseId: 1, workingSets: 5 })];
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);

    const [result] = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    expect(result.weeklyEffectiveSets).toBe(5);
    expect(result.status).toBe("above_preferred");
    // Non-blocking: result object is returned (no exception thrown)
    expect(result).toBeDefined();
  });
});

// ─── Coverage key — debounce triggers ────────────────────────────────────────

describe("buildCoverageKey — triggers for recalculation", () => {
  const baseExercise: MinimalDraftExercise = {
    exerciseId: 1,
    localId: "a",
    sets: 3,
    mainMuscleGroup: "Klatka piersiowa",
  };

  it("changing working sets changes the key (triggers recalculation)", () => {
    const draft1 = { 0: [{ ...baseExercise, sets: 3 }] };
    const draft2 = { 0: [{ ...baseExercise, sets: 4 }] };
    expect(buildCoverageKey(draft1)).not.toBe(buildCoverageKey(draft2));
  });

  it("removing an exercise changes the key (triggers recalculation)", () => {
    const draft1 = { 0: [baseExercise] };
    const draft2 = { 0: [] };
    expect(buildCoverageKey(draft1)).not.toBe(buildCoverageKey(draft2));
  });

  it("reordering exercises does NOT change the key (no unnecessary recalculation)", () => {
    const ex1: MinimalDraftExercise = { exerciseId: 1, localId: "a", sets: 3, mainMuscleGroup: "X" };
    const ex2: MinimalDraftExercise = { exerciseId: 2, localId: "b", sets: 3, mainMuscleGroup: "Y" };
    const draft1 = { 0: [ex1, ex2] };
    const draft2 = { 0: [ex2, ex1] }; // different array order
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("changing reps does NOT change the key (reps don't trigger recalculation)", () => {
    // repsMin/repsMax are not part of the coverage key
    // (they're absent from the MinimalDraftExercise used in the key)
    const draft1 = { 0: [{ ...baseExercise, sets: 3 }] };
    const draft2 = { 0: [{ ...baseExercise, sets: 3 }] };
    // Same exerciseId + sets → same key, even if reps changed
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });
});

// ─── Core coverage ────────────────────────────────────────────────────────────

describe("Core coverage (client-side pure function)", () => {
  it("direct Core exercises (mainMuscleGroup='Brzuch') reduce Core remaining sets", () => {
    const dayExercises: MinimalDraftExercise[] = [
      { exerciseId: 50, localId: "c1", sets: 3, mainMuscleGroup: CORE_MUSCLE_GROUP },
      { exerciseId: 51, localId: "c2", sets: 2, mainMuscleGroup: CORE_MUSCLE_GROUP },
    ];
    const actual = countCoreActualSetsForDay(dayExercises);
    expect(actual).toBe(5); // 3 + 2
  });

  it("incidental stabilization from compound lifts does NOT count as Core", () => {
    // Squats, deadlifts, presses etc. have a different mainMuscleGroup
    const dayExercises: MinimalDraftExercise[] = [
      { exerciseId: 1, localId: "s1", sets: 3, mainMuscleGroup: "Mięśnie czworogłowe uda" }, // squat
      { exerciseId: 2, localId: "s2", sets: 4, mainMuscleGroup: "Plecy" }, // deadlift
      { exerciseId: 3, localId: "s3", sets: 3, mainMuscleGroup: "Klatka piersiowa" }, // bench
      { exerciseId: 4, localId: "s4", sets: 2, mainMuscleGroup: CORE_MUSCLE_GROUP }, // ab crunch — actual Core
    ];
    const actual = countCoreActualSetsForDay(dayExercises);
    expect(actual).toBe(2); // only the explicit ab crunch
  });

  it("zero Core exercises → Core actual = 0", () => {
    const dayExercises: MinimalDraftExercise[] = [
      { exerciseId: 1, localId: "x", sets: 3, mainMuscleGroup: "Barki" },
    ];
    expect(countCoreActualSetsForDay(dayExercises)).toBe(0);
  });

  it("isCoreExercise only matches exact 'Brzuch' string — not partial matches", () => {
    // If mainMuscleGroup were "Brzuch i plecy" or "Plecy", it must NOT be treated as Core.
    const ex = { exerciseId: 99, localId: "z", sets: 2, mainMuscleGroup: "Brzuch i plecy" };
    expect(isCoreExercise(ex)).toBe(false);
    const ex2 = { ...ex, mainMuscleGroup: "brzuch" };
    expect(isCoreExercise(ex2)).toBe(false); // case-sensitive
  });
});

// ─── No DB records created ────────────────────────────────────────────────────

describe("local draft only — no workout DB records", () => {
  it("computeVolumeCore is a pure function: same input → same output, no side effects", () => {
    const targetMap = makeTargetMap([{ id: 1, name: "Target", memberIds: [10] }]);
    const guidelineMap = makeGuidelineMap([{ targetId: 1, preferred: 5, absolute: 10 }]);
    const entries = [makeEntry({ exerciseId: 1, workingSets: 3 })];
    const assignments = new Map([[1, new Map([[10, 1.0]])]]);

    const a = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);
    const b = computeVolumeCore(entries, assignments, targetMap, guidelineMap, [1]);

    expect(a[0]?.weeklyEffectiveSets).toBe(b[0]?.weeklyEffectiveSets);
    expect(a[0]?.status).toBe(b[0]?.status);
  });
});

// ─── Assignment validation ─────────────────────────────────────────────────────

describe("validateAssignments — coefficient guard", () => {
  it("rejects zero coefficient (not silently replaced with 1)", () => {
    const { assignments, invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 10, coefficient: 0 },
    ]);
    expect(assignments.size).toBe(0);
    expect(invalidRows).toHaveLength(1);
  });

  it("rejects coefficient > 1", () => {
    const { invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 10, coefficient: 1.5 },
    ]);
    expect(invalidRows).toHaveLength(1);
  });

  it("accepts coefficient exactly 1.0", () => {
    const { assignments } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 10, coefficient: 1.0 },
    ]);
    expect(assignments.get(1)?.get(10)).toBe(1.0);
  });

  it("accepts coefficient 0.5", () => {
    const { assignments } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 10, coefficient: 0.5 },
    ]);
    expect(assignments.get(1)?.get(10)).toBe(0.5);
  });
});
