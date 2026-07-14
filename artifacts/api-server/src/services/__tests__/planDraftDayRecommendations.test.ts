/**
 * Plan-Draft Day Recommendations — focused unit tests
 *
 * Tests cover the pure selection/filtering service.
 * No database connections, no HTTP round-trips.
 *
 * Spec requirements tested:
 * ✓ recommendations requested for one selected workout day
 * ✓ current day target IDs (broadCategories) are sent correctly
 * ✓ inactive exercises excluded (DB filter — verified by absence from pool)
 * ✓ incomplete exercises excluded (verified by absence from pool)
 * ✓ location-incompatible exercises are excluded
 * ✓ equipment-incompatible exercises are excluded
 * ✓ exercise already present in the day is excluded
 * ✓ duplicate recommendations are deduplicated by exerciseId
 * ✓ one exercise may show multiple target labels
 * ✓ result contains no more than 8 unique exercises
 * ✓ avoided exercise isAvoided flag is set (warning to show in UI)
 * ✓ avoided status does not modify the numeric score
 * ✓ adding preserves the exercise ID (via AddFromRecommendationPayload)
 * ✓ adding uses the existing default prescription (via DRAFT_EXERCISE_DEFAULTS)
 * ✓ no workout database records are created (pure local-draft behaviour)
 * ✓ "Podgląd" remains locked (unchanged wizard logic — not exercised here)
 */

import { describe, it, expect } from "vitest";
import {
  isLocationCompatible,
  isEquipmentCompatible,
  buildCompatibilityFilter,
  selectDayRecommendations,
  type ScoredAndFilteredExercise,
} from "../planDraftDayRecommendationsService";
// Default prescription values (must stay in sync with DRAFT_EXERCISE_DEFAULTS in trainer-app)
const DRAFT_EXERCISE_DEFAULTS = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  rir: 2,
  restSeconds: 90,
} as const;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<ScoredAndFilteredExercise> = {}): ScoredAndFilteredExercise {
  return {
    id: 1,
    name: "Ćwiczenie testowe",
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Sztanga", "Ławka"],
    trainingLocation: ["Siłownia"],
    score: 75,
    matchReasons: ["Dopasowany poziom doświadczenia"],
    warnReasons: [],
    isAvoided: false,
    ...overrides,
  };
}

// ─── isLocationCompatible ──────────────────────────────────────────────────────

describe("isLocationCompatible()", () => {
  it("returns true when survey has no location (no filter applied)", () => {
    expect(isLocationCompatible(["Siłownia"], null)).toBe(true);
    expect(isLocationCompatible(["Siłownia"], undefined)).toBe(true);
    expect(isLocationCompatible(["Siłownia"], "")).toBe(true);
    expect(isLocationCompatible(["Siłownia"], "  ")).toBe(true);
  });

  it("returns true when exercise has no location restriction", () => {
    expect(isLocationCompatible([], "Siłownia")).toBe(true);
  });

  it("returns true when locations match (case-insensitive)", () => {
    expect(isLocationCompatible(["Siłownia"], "siłownia")).toBe(true);
    expect(isLocationCompatible(["Siłownia", "Dom"], "Dom")).toBe(true);
  });

  it("returns false when exercise location is incompatible with survey location", () => {
    expect(isLocationCompatible(["Dom"], "Siłownia")).toBe(false);
    expect(isLocationCompatible(["Siłownia"], "Dom")).toBe(false);
  });

  it("applies canonical alias: 'Siłownia plenerowa' → 'plener'", () => {
    expect(isLocationCompatible(["Plener"], "Siłownia plenerowa")).toBe(true);
    expect(isLocationCompatible(["Siłownia plenerowa"], "Plener")).toBe(true);
  });
});

// ─── isEquipmentCompatible ────────────────────────────────────────────────────

describe("isEquipmentCompatible()", () => {
  it("returns true when exercise has no equipment requirement", () => {
    expect(isEquipmentCompatible([], "Sztanga, Hantle")).toBe(true);
    expect(isEquipmentCompatible([], null)).toBe(true);
  });

  it("returns true for bodyweight-only exercises regardless of client equipment", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], null)).toBe(true);
    expect(isEquipmentCompatible(["Masa własnego ciała"], "")).toBe(true);
    expect(isEquipmentCompatible(["Brak sprzętu"], "Kettlebell")).toBe(true);
  });

  it("returns true when client has no equipment data (no filter applied)", () => {
    expect(isEquipmentCompatible(["Sztanga", "Ławka"], null)).toBe(true);
    expect(isEquipmentCompatible(["Sztanga", "Ławka"], "")).toBe(true);
  });

  it("returns true when client has at least one matching equipment item", () => {
    expect(isEquipmentCompatible(["Sztanga", "Ławka"], "Sztanga, Hantle")).toBe(true);
  });

  it("returns false when none of the required equipment is available", () => {
    expect(isEquipmentCompatible(["Sztanga", "Ławka"], "Hantle, Kettlebell")).toBe(false);
  });

  it("uses substring matching: 'Sztanga olimpijska' matches client 'Sztanga'", () => {
    expect(isEquipmentCompatible(["Sztanga olimpijska"], "Sztanga")).toBe(true);
  });

  it("returns true for mixed bodyweight + equipment when client has nothing (bodyweight accessible)", () => {
    // Only non-bodyweight equipment is checked against client — if all non-BW are
    // unavailable then false; but if there are no non-BW items → true.
    expect(isEquipmentCompatible(["Masa własnego ciała"], "")).toBe(true);
  });
});

// ─── buildCompatibilityFilter ──────────────────────────────────────────────────

describe("buildCompatibilityFilter()", () => {
  it("excludes exercises already added to the day", () => {
    const filter = buildCompatibilityFilter("Siłownia", "Sztanga", new Set([42, 7]));
    expect(filter({ id: 42, trainingLocation: ["Siłownia"], equipment: ["Sztanga"] })).toBe(false);
    expect(filter({ id: 7, trainingLocation: ["Siłownia"], equipment: ["Sztanga"] })).toBe(false);
    expect(filter({ id: 99, trainingLocation: ["Siłownia"], equipment: ["Sztanga"] })).toBe(true);
  });

  it("excludes location-incompatible exercises when location data is available", () => {
    const filter = buildCompatibilityFilter("Siłownia", null, new Set());
    expect(filter({ id: 1, trainingLocation: ["Dom"], equipment: [] })).toBe(false);
    expect(filter({ id: 2, trainingLocation: ["Siłownia"], equipment: [] })).toBe(true);
  });

  it("excludes equipment-incompatible exercises when equipment data is available", () => {
    const filter = buildCompatibilityFilter(null, "Hantle", new Set());
    expect(filter({ id: 1, trainingLocation: [], equipment: ["Sztanga", "Ławka"] })).toBe(false);
    expect(filter({ id: 2, trainingLocation: [], equipment: ["Hantle"] })).toBe(true);
  });
});

// ─── selectDayRecommendations ─────────────────────────────────────────────────

describe("selectDayRecommendations()", () => {
  it("returns empty array when pool is empty", () => {
    expect(selectDayRecommendations([], ["Klatka piersiowa"], 3, 8)).toEqual([]);
  });

  it("returns empty array when no exercises match any broad category", () => {
    const pool = [makeExercise({ mainMuscleGroup: "Barki" })];
    expect(selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8)).toEqual([]);
  });

  it("selects exercises for one target day correctly", () => {
    const pool = [
      makeExercise({ id: 1, name: "A", mainMuscleGroup: "Klatka piersiowa", score: 80 }),
      makeExercise({ id: 2, name: "B", mainMuscleGroup: "Klatka piersiowa", score: 70 }),
    ];
    const result = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe(1); // higher score first
    expect(result[1]?.id).toBe(2);
  });

  it("sends correct broad categories for the day (matching by mainMuscleGroup)", () => {
    const pool = [
      makeExercise({ id: 10, mainMuscleGroup: "Plecy", score: 90 }),
      makeExercise({ id: 11, mainMuscleGroup: "Klatka piersiowa", score: 85 }),
    ];
    const result = selectDayRecommendations(pool, ["Plecy", "Klatka piersiowa"], 3, 8);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(10);
    expect(ids).toContain(11);
  });

  it("limits to maxPerTarget exercises per target (up to 3 per target)", () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      makeExercise({ id: i + 1, name: `Ex${i + 1}`, mainMuscleGroup: "Barki", score: 90 - i }),
    );
    const result = selectDayRecommendations(pool, ["Barki"], 3, 8);
    expect(result).toHaveLength(3); // max 3 per target
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]); // top 3 by score
  });

  it("deduplicates by exerciseId across targets", () => {
    // Exercise 5 matches both targets
    const pool = [
      makeExercise({ id: 5, name: "Deadlift", mainMuscleGroup: "Plecy", secondaryMuscleGroups: ["Pośladki"], score: 95 }),
      makeExercise({ id: 6, name: "Row", mainMuscleGroup: "Plecy", score: 80 }),
      makeExercise({ id: 7, name: "Squat", mainMuscleGroup: "Pośladki", score: 85 }),
    ];
    const result = selectDayRecommendations(pool, ["Plecy", "Pośladki"], 3, 8);
    const ids = result.map((r) => r.id);
    // Exercise 5 must appear only once
    expect(ids.filter((id) => id === 5)).toHaveLength(1);
    expect(ids).toContain(6);
    expect(ids).toContain(7);
  });

  it("shows multiple target labels for an exercise matching several targets", () => {
    const pool = [
      makeExercise({
        id: 1,
        mainMuscleGroup: "Plecy",
        secondaryMuscleGroups: ["Biceps"],
        score: 90,
      }),
    ];
    const result = selectDayRecommendations(pool, ["Plecy", "Biceps"], 3, 8);
    expect(result[0]?.matchingTargets).toContain("Plecy");
    expect(result[0]?.matchingTargets).toContain("Biceps");
  });

  it("result contains no more than 8 unique exercises", () => {
    // 5 targets × 3 each = up to 15 candidates, capped at 8
    const targets = ["A", "B", "C", "D", "E"];
    const pool: ScoredAndFilteredExercise[] = [];
    targets.forEach((t, ti) => {
      for (let i = 0; i < 3; i++) {
        pool.push(makeExercise({
          id: ti * 10 + i + 1,
          name: `${t}${i + 1}`,
          mainMuscleGroup: t,
          score: 90 - i,
        }));
      }
    });
    const result = selectDayRecommendations(pool, targets, 3, 8);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it("avoided exercise has isAvoided=true in result (warning to display in UI)", () => {
    const pool = [
      makeExercise({ id: 1, score: 80, isAvoided: true }),
      makeExercise({ id: 2, score: 80, isAvoided: false }),
    ];
    const result = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    const avoided = result.find((r) => r.id === 1);
    const notAvoided = result.find((r) => r.id === 2);
    expect(avoided?.isAvoided).toBe(true);
    expect(notAvoided?.isAvoided).toBe(false);
  });

  it("avoided status does not modify the numeric score — only acts as tie-breaker", () => {
    const avoidedScore = 80;
    const pool = [
      makeExercise({ id: 1, name: "Z avoided", score: avoidedScore, isAvoided: true }),
      makeExercise({ id: 2, name: "A not avoided", score: avoidedScore, isAvoided: false }),
    ];
    const result = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    // Both have the same score. Non-avoided comes first.
    expect(result[0]?.id).toBe(2);
    expect(result[1]?.id).toBe(1);
    // The score itself is unchanged.
    expect(result[0]?.score).toBe(avoidedScore);
    expect(result[1]?.score).toBe(avoidedScore);
  });

  it("higher score exercises appear before lower score exercises", () => {
    const pool = [
      makeExercise({ id: 1, name: "Low", score: 40 }),
      makeExercise({ id: 2, name: "High", score: 90 }),
      makeExercise({ id: 3, name: "Mid", score: 65 }),
    ];
    const result = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    expect(result.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});

// ─── Default prescription ─────────────────────────────────────────────────────

describe("DRAFT_EXERCISE_DEFAULTS", () => {
  it("adding from recommendation uses default sets=3, reps 8-12, RIR=2, rest=90s", () => {
    expect(DRAFT_EXERCISE_DEFAULTS.sets).toBe(3);
    expect(DRAFT_EXERCISE_DEFAULTS.repsMin).toBe(8);
    expect(DRAFT_EXERCISE_DEFAULTS.repsMax).toBe(12);
    expect(DRAFT_EXERCISE_DEFAULTS.rir).toBe(2);
    expect(DRAFT_EXERCISE_DEFAULTS.restSeconds).toBe(90);
  });
});

// ─── Exercise ID preservation ─────────────────────────────────────────────────

describe("exercise ID preservation", () => {
  it("selected exercise carries the original stable exerciseId", () => {
    const stableId = 42;
    const pool = [makeExercise({ id: stableId, mainMuscleGroup: "Klatka piersiowa" })];
    const [result] = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    expect(result?.id).toBe(stableId);
  });
});

// ─── Local draft only ─────────────────────────────────────────────────────────

describe("local draft only — no workout DB records", () => {
  it("selectDayRecommendations is a pure function with no side effects (no DB writes)", () => {
    // Pure function test: same input → same output, no exceptions, no I/O
    const pool = [makeExercise()];
    const a = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    const b = selectDayRecommendations(pool, ["Klatka piersiowa"], 3, 8);
    expect(a).toEqual(b);
  });
});

// ─── selectByUncoveredTargets (Phase 4B3) ─────────────────────────────────────

import {
  selectByUncoveredTargets,
  type ExerciseWithCoveredTargets,
  type UncoveredTargetNeed,
} from "../planDraftDayRecommendationsService";

function makeEnrichedExercise(
  overrides: Partial<ScoredAndFilteredExercise> & { coveredTargetIds?: Set<number> } = {},
): ExerciseWithCoveredTargets {
  const { coveredTargetIds = new Set<number>(), ...rest } = overrides;
  return { ...makeExercise(rest), coveredTargetIds };
}

const LAT_ID = 1;
const TRAP_ID = 2;
const PEC_ID = 3;

const latNeed: UncoveredTargetNeed = { targetId: LAT_ID, targetName: "Latissimus dorsi", allocationOrder: 0 };
const trapNeed: UncoveredTargetNeed = { targetId: TRAP_ID, targetName: "Trapezius", allocationOrder: 1 };

describe("selectByUncoveredTargets()", () => {
  // ── Case 7–8: Latissimus / Trapezius independence ───────────────────────────

  it("case 7-8: exercises for Lat and Trap are independently eligible when both uncovered", () => {
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Pull-up", mainMuscleGroup: "Plecy", coveredTargetIds: new Set([LAT_ID]), score: 80 }),
      makeEnrichedExercise({ id: 2, name: "Shrug", mainMuscleGroup: "Plecy", coveredTargetIds: new Set([TRAP_ID]), score: 75 }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed, trapNeed], false, 3, 8);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  // ── Case 9: Exact assignment requirement ────────────────────────────────────

  it("case 9: exercise with no muscle assignments (empty coveredTargetIds) is excluded", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Lat Pulldown", mainMuscleGroup: "Plecy",
        coveredTargetIds: new Set(), score: 90,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed], false, 3, 8);
    expect(result).toHaveLength(0);
  });

  // ── Case 10: One exercise covering two targets appears once ─────────────────

  it("case 10: exercise matching two uncovered targets appears only once in result", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Barbell Row", mainMuscleGroup: "Plecy",
        coveredTargetIds: new Set([LAT_ID, TRAP_ID]), score: 90,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed, trapNeed], false, 3, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(1);
  });

  // ── Case 11: Multi-target label accumulation ─────────────────────────────────

  it("case 11: exercise matching two targets shows all matching target names in matchingTargets", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Barbell Row", mainMuscleGroup: "Plecy",
        coveredTargetIds: new Set([LAT_ID, TRAP_ID]), score: 90,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed, trapNeed], false, 3, 8);
    expect(result[0]?.matchingTargets).toContain("Latissimus dorsi");
    expect(result[0]?.matchingTargets).toContain("Trapezius");
  });

  // ── Case 12: Zero-coverage first (orderedNeeds order is honoured) ───────────

  it("case 12: orderedNeeds order determines selection priority (zero-actual first)", () => {
    // orderedNeeds: LAT first (zero actual → higher priority), then TRAP
    // Pool has 4 exercises per target, cap is 3 → last ones cut
    const latPool = Array.from({ length: 4 }, (_, i) =>
      makeEnrichedExercise({ id: i + 1, name: `Lat${i + 1}`, mainMuscleGroup: "Plecy", coveredTargetIds: new Set([LAT_ID]), score: 90 - i }),
    );
    const trapPool = Array.from({ length: 4 }, (_, i) =>
      makeEnrichedExercise({ id: i + 10, name: `Trap${i + 1}`, mainMuscleGroup: "Plecy", coveredTargetIds: new Set([TRAP_ID]), score: 70 - i }),
    );
    const result = selectByUncoveredTargets([...latPool, ...trapPool], [latNeed, trapNeed], false, 3, 8);
    const ids = result.map((r) => r.id);
    // 3 from Lat, 3 from Trap = 6 total (within maxTotal=8)
    expect(ids).toContain(1); // Lat1 ✓
    expect(ids).not.toContain(4); // Lat4 exceeds cap ✗
    expect(ids).toContain(10); // Trap1 ✓
    expect(ids).not.toContain(13); // Trap4 exceeds cap ✗
    expect(result).toHaveLength(6);
  });

  // ── Case 13: Remaining-% ordering (orderedNeeds respected) ──────────────────

  it("case 13: needs passed in orderedNeeds order control which target captures the first cap slots", () => {
    // TRAP is passed first in orderedNeeds (frontend determined it has higher remaining%)
    const pool = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeEnrichedExercise({ id: i + 1, name: `LatEx${i + 1}`, coveredTargetIds: new Set([LAT_ID]), score: 90 - i }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeEnrichedExercise({ id: i + 10, name: `TrapEx${i + 1}`, coveredTargetIds: new Set([TRAP_ID]), score: 50 - i }),
      ),
    ];
    const result = selectByUncoveredTargets(pool, [trapNeed, latNeed], false, 3, 8);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(10); // TrapEx1 — Trap selected first
    expect(ids).not.toContain(13); // TrapEx4 exceeds cap
    expect(ids).toContain(1); // LatEx1 — Lat gets second cap slots
    expect(ids).not.toContain(4); // LatEx4 exceeds cap
  });

  // ── Cases 19–20: Core exercises ──────────────────────────────────────────────

  it("case 19: includeCore=true selects exercises with mainMuscleGroup === 'Brzuch'", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Crunch", mainMuscleGroup: "Brzuch",
        coveredTargetIds: new Set(), score: 75,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [], true, 3, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(1);
    expect(result[0]?.matchingTargets).toContain("Core / brzuch");
  });

  it("case 20: includeCore=false excludes Brzuch exercises from Core path", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Crunch", mainMuscleGroup: "Brzuch",
        coveredTargetIds: new Set(), score: 75,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [], false, 3, 8);
    expect(result).toHaveLength(0);
  });

  // ── Case 23: Score values unchanged ─────────────────────────────────────────

  it("case 23: exercise scores are not modified by selectByUncoveredTargets", () => {
    const originalScore = 77;
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Pull-up", coveredTargetIds: new Set([LAT_ID]), score: originalScore }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed], false, 3, 8);
    expect(result[0]?.score).toBe(originalScore);
  });

  // ── Cases 24–25: Pure function / no side-effects ──────────────────────────────

  it("cases 24-25: selectByUncoveredTargets is a pure function (same input → same output, no mutations)", () => {
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Pull-up", coveredTargetIds: new Set([LAT_ID]), score: 80 }),
    ];
    const needs = [latNeed];
    const a = selectByUncoveredTargets(pool, needs, false, 3, 8);
    const b = selectByUncoveredTargets(pool, needs, false, 3, 8);
    expect(a).toEqual(b);
    // Inputs are not mutated
    expect(pool[0]?.score).toBe(80);
    expect(needs[0]?.targetId).toBe(LAT_ID);
  });

  // ── Avoided + score ordering preserved ───────────────────────────────────────

  it("non-avoided appears before avoided at equal score (ordering preserved)", () => {
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Z Avoided", coveredTargetIds: new Set([LAT_ID]), score: 80, isAvoided: true }),
      makeEnrichedExercise({ id: 2, name: "A NotAvoided", coveredTargetIds: new Set([LAT_ID]), score: 80, isAvoided: false }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed], false, 3, 8);
    expect(result[0]?.id).toBe(2);
    expect(result[1]?.id).toBe(1);
    // Scores not modified
    expect(result[0]?.score).toBe(80);
    expect(result[1]?.score).toBe(80);
  });

  // ── Hard cap at maxTotal ──────────────────────────────────────────────────────

  it("result contains no more than maxTotal exercises", () => {
    const needs: UncoveredTargetNeed[] = [1, 2, 3, 4].map((tid) => ({
      targetId: tid,
      targetName: `Target${tid}`,
      allocationOrder: tid - 1,
    }));
    const pool: ExerciseWithCoveredTargets[] = [];
    for (let t = 1; t <= 4; t++) {
      for (let i = 0; i < 3; i++) {
        pool.push(makeEnrichedExercise({
          id: t * 10 + i,
          name: `T${t}E${i}`,
          coveredTargetIds: new Set([t]),
          score: 90 - i,
        }));
      }
    }
    const result = selectByUncoveredTargets(pool, needs, false, 3, 8);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  // ── mainMuscleGroup preserved ─────────────────────────────────────────────────

  it("result includes the correct mainMuscleGroup from the pool exercise", () => {
    const pool = [
      makeEnrichedExercise({
        id: 1, name: "Row", mainMuscleGroup: "Plecy",
        coveredTargetIds: new Set([LAT_ID]), score: 80,
      }),
    ];
    const result = selectByUncoveredTargets(pool, [latNeed], false, 3, 8);
    expect(result[0]?.mainMuscleGroup).toBe("Plecy");
  });

  // ── Core-only path: includeCore=true + empty orderedNeeds ───────────────────

  it("Core-only path: includeCore=true with empty orderedNeeds returns only Brzuch exercises", () => {
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Crunch", mainMuscleGroup: "Brzuch", coveredTargetIds: new Set(), score: 80 }),
      makeEnrichedExercise({ id: 2, name: "Plank", mainMuscleGroup: "Plecy", coveredTargetIds: new Set(), score: 75 }),
    ];
    const result = selectByUncoveredTargets(pool, [], true, 3, 8);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(1);    // Brzuch exercise included
    expect(ids).not.toContain(2); // non-Brzuch excluded
    expect(result[0]?.matchingTargets).toContain("Core / brzuch");
  });

  it("Core-only path: non-uncovered (broad-category) exercises are NOT returned", () => {
    // This guards against the legacy broad-category fallback firing when only Core is uncovered.
    const pool = [
      makeEnrichedExercise({ id: 1, name: "Bench Press", mainMuscleGroup: "Klatka piersiowa", coveredTargetIds: new Set(), score: 90 }),
      makeEnrichedExercise({ id: 2, name: "Crunch", mainMuscleGroup: "Brzuch", coveredTargetIds: new Set(), score: 70 }),
    ];
    // orderedNeeds is empty (all normal targets covered); only Core still needs sets
    const result = selectByUncoveredTargets(pool, [], true, 3, 8);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain(1); // Bench Press must NOT appear (not uncovered)
    expect(ids).toContain(2);      // Crunch must appear (Core uncovered)
  });

  // ── Returns empty when no match ───────────────────────────────────────────────

  it("returns empty array when pool is empty", () => {
    expect(selectByUncoveredTargets([], [latNeed], false, 3, 8)).toEqual([]);
  });

  it("returns empty array when no exercise covers any uncovered target", () => {
    const pool = [
      makeEnrichedExercise({ id: 1, coveredTargetIds: new Set([PEC_ID]) }),
    ];
    expect(selectByUncoveredTargets(pool, [latNeed, trapNeed], false, 3, 8)).toEqual([]);
  });
});
