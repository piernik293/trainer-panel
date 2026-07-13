/**
 * Unit tests for the pure volume calculation core.
 *
 * No database dependency.  All functions under test are pure — they accept
 * plain in-memory data structures and return deterministic results.
 *
 * Coverage:
 *   computeVolumeCore   — coefficient 1.0 / 0.5 / 0.25, fractional summation
 *                         without early rounding, max-coefficient deduplication,
 *                         all status boundaries, remainingTo clamping.
 *   mapToGuidelineLevel — all four canonical levels, unknown fallback.
 *   isValidExperienceLevel — all four valid, case-sensitive rejection.
 *   validateAssignments — valid range, boundary values, coefficient 0 / negative /
 *                         NaN / >1 all rejected without silent substitution.
 */

import { describe, it, expect } from "vitest";
import {
  computeVolumeCore,
  mapToGuidelineLevel,
  isValidExperienceLevel,
  validateAssignments,
  type NormalizedEntry,
  type RawAssignmentRow,
} from "../volumeCalculator";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
//
// Synthetic targets, guidelines and assignments — independent of the database.
//
// Targets:
//   T1 (Chest):     member muscles {100, 101}   preferred=15  absolute=20
//   T2 (Biceps):    member muscles {200}          preferred=10  absolute=14
//   T3 (Trapezius): member muscles {300}          preferred=12  absolute=16
//
// Exercises:
//   E1 (Bench press): muscle 100 coeff 1.0,  muscle 101 coeff 0.5
//   E2 (Pull-up):     muscle 200 coeff 0.5,  muscle 300 coeff 0.25

type TargetEntry  = { name: string; type: string; memberMuscleIds: Set<number> };
type GuidEntry    = { sessionMin: number; sessionMax: number; weeklyPreferredCeiling: number; weeklyAbsoluteCeiling: number };

function makeTargetMap(): Map<number, TargetEntry> {
  return new Map([
    [1, { name: "Chest",     type: "compound", memberMuscleIds: new Set([100, 101]) }],
    [2, { name: "Biceps",    type: "compound", memberMuscleIds: new Set([200]) }],
    [3, { name: "Trapezius", type: "compound", memberMuscleIds: new Set([300]) }],
  ]);
}

function makeGuidelineMap(): Map<number, GuidEntry> {
  return new Map([
    [1, { sessionMin: 5, sessionMax: 8,  weeklyPreferredCeiling: 15, weeklyAbsoluteCeiling: 20 }],
    [2, { sessionMin: 4, sessionMax: 6,  weeklyPreferredCeiling: 10, weeklyAbsoluteCeiling: 14 }],
    [3, { sessionMin: 2, sessionMax: 5,  weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 }],
  ]);
}

function makeAssignments(): Map<number, Map<number, number>> {
  return new Map([
    [1, new Map([[100, 1.0], [101, 0.5]])],   // Bench press
    [2, new Map([[200, 0.5], [300, 0.25]])],  // Pull-up
  ]);
}

const ORDERED = [1, 2, 3];

function e(id: number, dayId: number, exerciseId: number, workingSets: number): NormalizedEntry {
  return {
    entryId: id,
    dayId,
    dayName: `Day${dayId}`,
    dayOrder: dayId - 1,
    exerciseId,
    exerciseName: `Exercise${exerciseId}`,
    workingSets,
  };
}

// ─── computeVolumeCore ────────────────────────────────────────────────────────

describe("computeVolumeCore", () => {
  const targetMap    = makeTargetMap();
  const guidelineMap = makeGuidelineMap();
  const assignments  = makeAssignments();

  it("coeff 1.00 — 5 working sets → 5.00 effective sets", () => {
    const results = computeVolumeCore([e(1, 1, 1, 5)], assignments, targetMap, guidelineMap, ORDERED);
    const chest = results.find(r => r.targetId === 1)!;
    expect(chest.weeklyEffectiveSets).toBe(5);
    expect(chest.contributions[0].coefficient).toBe(1.0);
    expect(chest.contributions[0].effectiveSets).toBe(5);
  });

  it("coeff 0.50 — 4 working sets → 2.00 effective sets", () => {
    const results = computeVolumeCore([e(1, 1, 2, 4)], assignments, targetMap, guidelineMap, ORDERED);
    const biceps = results.find(r => r.targetId === 2)!;
    expect(biceps.weeklyEffectiveSets).toBe(2);
    expect(biceps.contributions[0].coefficient).toBe(0.5);
    expect(biceps.contributions[0].effectiveSets).toBe(2);
  });

  it("coeff 0.25 — 3 working sets → 0.75 effective sets", () => {
    const results = computeVolumeCore([e(1, 1, 2, 3)], assignments, targetMap, guidelineMap, ORDERED);
    const trap = results.find(r => r.targetId === 3)!;
    expect(trap.weeklyEffectiveSets).toBe(0.75);
    expect(trap.contributions[0].coefficient).toBe(0.25);
    expect(trap.contributions[0].effectiveSets).toBe(0.75);
  });

  it("fractional summation — 0.75 + 0.75 = 1.50 without early rounding", () => {
    // Two separate days of pull-ups → trapezius gets 0.75 each → 1.5 total
    const results = computeVolumeCore(
      [e(1, 1, 2, 3), e(2, 2, 2, 3)],
      assignments, targetMap, guidelineMap, ORDERED,
    );
    const trap = results.find(r => r.targetId === 3)!;
    expect(trap.weeklyEffectiveSets).toBe(1.5);
    expect(trap.contributions).toHaveLength(2);
    expect(trap.contributions[0].effectiveSets).toBe(0.75);
    expect(trap.contributions[1].effectiveSets).toBe(0.75);
  });

  it("max-coefficient rule — muscles 100 (1.0) and 101 (0.5) both in Chest → 1.0 wins, no summing", () => {
    const results = computeVolumeCore([e(1, 1, 1, 4)], assignments, targetMap, guidelineMap, ORDERED);
    const chest = results.find(r => r.targetId === 1)!;
    expect(chest.weeklyEffectiveSets).toBe(4);          // 4 × 1.0, not 4 × (1.0 + 0.5)
    expect(chest.contributions[0].coefficient).toBe(1.0);
    expect(chest.contributions).toHaveLength(1);        // one contribution entry per exercise × target
  });

  it("status: below_preferred when 0 effective sets", () => {
    const results = computeVolumeCore([], assignments, targetMap, guidelineMap, ORDERED);
    expect(results.find(r => r.targetId === 1)!.status).toBe("below_preferred");
  });

  it("status: within_preferred for 6 sets (threshold > 0, ≤ preferred 15)", () => {
    const results = computeVolumeCore([e(1, 1, 1, 6)], assignments, targetMap, guidelineMap, ORDERED);
    expect(results.find(r => r.targetId === 1)!.status).toBe("within_preferred");
  });

  it("status: within_preferred at exactly preferred ceiling (15 sets, preferred=15)", () => {
    const results = computeVolumeCore([e(1, 1, 1, 15)], assignments, targetMap, guidelineMap, ORDERED);
    expect(results.find(r => r.targetId === 1)!.status).toBe("within_preferred");
  });

  it("status: above_preferred for 16 sets (preferred=15, absolute=20)", () => {
    const results = computeVolumeCore([e(1, 1, 1, 16)], assignments, targetMap, guidelineMap, ORDERED);
    expect(results.find(r => r.targetId === 1)!.status).toBe("above_preferred");
  });

  it("status: above_absolute for 21 sets (absolute=20)", () => {
    const results = computeVolumeCore([e(1, 1, 1, 21)], assignments, targetMap, guidelineMap, ORDERED);
    expect(results.find(r => r.targetId === 1)!.status).toBe("above_absolute");
  });

  it("remainingToPreferred and remainingToAbsolute are clamped at 0 when over ceiling", () => {
    const results = computeVolumeCore([e(1, 1, 1, 21)], assignments, targetMap, guidelineMap, ORDERED);
    const chest = results.find(r => r.targetId === 1)!;
    expect(chest.remainingToPreferred).toBe(0);
    expect(chest.remainingToAbsolute).toBe(0);
  });

  it("remainingToPreferred / remainingToAbsolute correct when under ceiling (6 sets)", () => {
    const results = computeVolumeCore([e(1, 1, 1, 6)], assignments, targetMap, guidelineMap, ORDERED);
    const chest = results.find(r => r.targetId === 1)!;
    expect(chest.remainingToPreferred).toBe(9);    // 15 − 6
    expect(chest.remainingToAbsolute).toBe(14);   // 20 − 6
  });

  it("exercises with no target membership are silently ignored (contribute nothing)", () => {
    const orphanAssignments = new Map(assignments);
    orphanAssignments.set(99, new Map([[999, 1.0]]));  // muscle 999 ∉ any target
    const results = computeVolumeCore([e(1, 1, 99, 5)], orphanAssignments, targetMap, guidelineMap, ORDERED);
    expect(results.every(r => r.weeklyEffectiveSets === 0)).toBe(true);
    expect(results.flatMap(r => r.contributions)).toHaveLength(0);
  });

  it("empty entry list → all targets return 0 effective sets", () => {
    const results = computeVolumeCore([], assignments, targetMap, guidelineMap, ORDERED);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.weeklyEffectiveSets).toBe(0);
      expect(r.contributions).toHaveLength(0);
    }
  });
});

// ─── mapToGuidelineLevel ──────────────────────────────────────────────────────

describe("mapToGuidelineLevel", () => {
  it.each([
    ["Zaawansowany",              "Zaawansowany"],
    ["Średniozaawansowany",       "Średniozaawansowany"],
    ["Początkujący",              "Początkujący"],
    ["Brak aktywności fizycznej", "Brak aktywności fizycznej"],
    // Unknown/invalid values must NOT be mapped to "Początkujący".
    // They fall back to the most conservative level to avoid over-prescribing volume.
    ["UNKNOWN",                   "Brak aktywności fizycznej"],
    ["",                          "Brak aktywności fizycznej"],
    ["advanced",                  "Brak aktywności fizycznej"],
    ["zaawansowany",              "Brak aktywności fizycznej"],   // case-sensitive
  ])('"%s" → "%s"', (input, expected) => {
    expect(mapToGuidelineLevel(input)).toBe(expected);
  });

  it("all four canonical Polish levels map to themselves", () => {
    const levels = [
      "Zaawansowany",
      "Średniozaawansowany",
      "Początkujący",
      "Brak aktywności fizycznej",
    ];
    for (const level of levels) {
      expect(mapToGuidelineLevel(level)).toBe(level);
    }
  });
});

// ─── isValidExperienceLevel ───────────────────────────────────────────────────

describe("isValidExperienceLevel", () => {
  it.each([
    ["Zaawansowany",              true],
    ["Średniozaawansowany",       true],
    ["Początkujący",              true],
    ["Brak aktywności fizycznej", true],
    ["UNKNOWN",                   false],
    ["",                          false],
    ["advanced",                  false],
    ["zaawansowany",              false],   // case-sensitive
  ])('"%s" → %s', (level, expected) => {
    expect(isValidExperienceLevel(level)).toBe(expected);
  });
});

// ─── validateAssignments ──────────────────────────────────────────────────────

describe("validateAssignments", () => {
  it("accepts valid rows and builds the assignment map correctly", () => {
    const rows: RawAssignmentRow[] = [
      { exerciseId: 1, specificMuscleId: 100, coefficient: 1.0 },
      { exerciseId: 1, specificMuscleId: 101, coefficient: 0.5 },
      { exerciseId: 2, specificMuscleId: 200, coefficient: 0.25 },
    ];
    const { assignments, invalidRows } = validateAssignments(rows);
    expect(invalidRows).toHaveLength(0);
    expect(assignments.get(1)?.get(100)).toBe(1.0);
    expect(assignments.get(1)?.get(101)).toBe(0.5);
    expect(assignments.get(2)?.get(200)).toBe(0.25);
  });

  it("rejects coefficient 0 — not silently converted to 0 or 1", () => {
    const { assignments, invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: 0 },
    ]);
    expect(invalidRows).toHaveLength(1);
    expect(assignments.has(1)).toBe(false);
  });

  it("rejects negative coefficient", () => {
    const { invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: -0.5 },
    ]);
    expect(invalidRows).toHaveLength(1);
  });

  it("rejects coefficient > 1", () => {
    const { invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: 1.5 },
    ]);
    expect(invalidRows).toHaveLength(1);
  });

  it("rejects NaN coefficient", () => {
    const { invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: NaN },
    ]);
    expect(invalidRows).toHaveLength(1);
  });

  it("accepts boundary: coefficient exactly 1.0", () => {
    const { invalidRows, assignments } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: 1.0 },
    ]);
    expect(invalidRows).toHaveLength(0);
    expect(assignments.get(1)?.get(100)).toBe(1.0);
  });

  it("accepts boundary: very small coefficient 0.01", () => {
    const { invalidRows } = validateAssignments([
      { exerciseId: 1, specificMuscleId: 100, coefficient: 0.01 },
    ]);
    expect(invalidRows).toHaveLength(0);
  });

  it("mixed rows — valid kept, invalid separated, exercises are independent", () => {
    const rows: RawAssignmentRow[] = [
      { exerciseId: 1, specificMuscleId: 100, coefficient: 1.0 },   // valid
      { exerciseId: 1, specificMuscleId: 101, coefficient: 0 },     // invalid
      { exerciseId: 2, specificMuscleId: 200, coefficient: 0.5 },   // valid
      { exerciseId: 2, specificMuscleId: 201, coefficient: 1.5 },   // invalid
    ];
    const { assignments, invalidRows } = validateAssignments(rows);
    expect(invalidRows).toHaveLength(2);
    expect(assignments.get(1)?.get(100)).toBe(1.0);
    expect(assignments.get(1)?.has(101)).toBe(false);
    expect(assignments.get(2)?.get(200)).toBe(0.5);
    expect(assignments.get(2)?.has(201)).toBe(false);
  });

  it("invalid coefficient for exercise 1 does NOT block exercise 2 from being included", () => {
    const rows: RawAssignmentRow[] = [
      { exerciseId: 1, specificMuscleId: 100, coefficient: 0 },    // invalid
      { exerciseId: 2, specificMuscleId: 200, coefficient: 0.5 },  // valid
    ];
    const { assignments } = validateAssignments(rows);
    expect(assignments.has(1)).toBe(false);
    expect(assignments.get(2)?.get(200)).toBe(0.5);
  });

  it("returns empty assignments and no invalids for an empty input", () => {
    const { assignments, invalidRows } = validateAssignments([]);
    expect(assignments.size).toBe(0);
    expect(invalidRows).toHaveLength(0);
  });
});
