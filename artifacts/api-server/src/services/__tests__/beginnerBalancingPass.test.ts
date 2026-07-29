/**
 * Focused tests for the beginner/no-activity movement-pattern balancing pass.
 *
 * Tests spec §PART8:
 *   7.  Full Body cannot contain push without pull when a legal pull is available.
 *   8.  Upper session contains both push and pull when legal exercises exist.
 *   9.  High quad/glute + low hamstring → hip-dominant prioritised over redundant accessory.
 *  10.  Missing back coverage is repaired before adding direct biceps isolation.
 *  11.  Manual / locked exercises are not replaced (no-op — V0 has none).
 *  12.  Equipment, contraindication and session-duration rules remain respected
 *       (replacement must exist in the pre-filtered `eligible` pool).
 *  13.  Effective volume is recalculated after an accepted swap
 *       (verified by checking results array mutation).
 *
 * Also tests the exported helper functions:
 *   hasMajorPattern, requiredPatternsForSession, isSwappableAccessory,
 *   findReplacementForPattern, applyBeginnerBalancingPass.
 */

import { describe, it, expect } from "vitest";
import type { ScoredAndFilteredExercise } from "../planDraftDayRecommendationsService";
import {
  hasMajorPattern,
  requiredPatternsForSession,
  isSwappableAccessory,
  findReplacementForPattern,
  applyBeginnerBalancingPass,
  runExerciseSelectionEngineV0,
  type MajorPattern,
  type V0PriorityContext,
} from "../ExerciseSelectionEngineV0";

// ─── Mock exercise factory ────────────────────────────────────────────────────

let nextId = 1000;

function makeEx(overrides: Partial<ScoredAndFilteredExercise>): ScoredAndFilteredExercise {
  return {
    id: nextId++,
    name: overrides.name ?? "Test Exercise",
    mainMuscleGroup: overrides.mainMuscleGroup ?? "Brzuch",
    exerciseType: overrides.exerciseType ?? null,
    movementPattern: overrides.movementPattern ?? null,
    exercisePriority: overrides.exercisePriority ?? "Średni",
    learningDifficulty: overrides.learningDifficulty ?? 2,
    equipment: overrides.equipment ?? [],
    trainingLocation: overrides.trainingLocation ?? null,
    secondaryMuscleGroups: overrides.secondaryMuscleGroups ?? null,
    suitableForNoActivity: overrides.suitableForNoActivity ?? null,
    movementCategoryKey: overrides.movementCategoryKey ?? null,
    score: 0,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    neurologicalFatigue: null,
    ...overrides,
  } as unknown as ScoredAndFilteredExercise;
}

// ─── Canonical exercise builders ─────────────────────────────────────────────

const chestCompound = () => makeEx({
  name: "Pompki",
  mainMuscleGroup: "Klatka piersiowa",
  exerciseType: "Złożone",
  movementPattern: "Pchanie poziome",
  suitableForNoActivity: true,
});

const ohpCompound = () => makeEx({
  name: "OHP maszyną",
  mainMuscleGroup: "Barki",
  exerciseType: "Złożone",
  movementPattern: "Pchanie pionowe",
});

const backPullVertical = () => makeEx({
  name: "Wiosłowanie na maszynie",
  mainMuscleGroup: "Plecy",
  exerciseType: "Złożone",
  movementPattern: "Przyciąganie poziome",
  suitableForNoActivity: true,
});

const backPullHorizontal = () => makeEx({
  name: "Ściąganie drążka",
  mainMuscleGroup: "Plecy",
  exerciseType: "Złożone",
  movementPattern: "Przyciąganie pionowe",
});

const deadlift = () => makeEx({
  name: "Martwy ciąg",
  mainMuscleGroup: "Plecy",
  exerciseType: "Złożone",
  movementPattern: "Zawias biodrowy",
});

const squat = () => makeEx({
  name: "Przysiad do skrzyni",
  mainMuscleGroup: "Mięśnie czworogłowe uda",
  exerciseType: "Złożone",
  movementPattern: "Przysiad",
  suitableForNoActivity: true,
});

const lunge = () => makeEx({
  name: "Wykrok w tył",
  mainMuscleGroup: "Pośladki",
  exerciseType: "Złożone",
  movementPattern: "Wykrok",
  suitableForNoActivity: true,
});

const hipThrust = () => makeEx({
  name: "Hip thrust",
  mainMuscleGroup: "Pośladki",
  exerciseType: "Złożone",
  movementPattern: "Zawias biodrowy",
  suitableForNoActivity: true,
});

const romanianDeadlift = () => makeEx({
  name: "Martwy ciąg rumuński",
  mainMuscleGroup: "Mięśnie dwugłowe uda",
  exerciseType: "Złożone",
  movementPattern: "Zawias biodrowy",
});

const bicepsIso = () => makeEx({
  name: "Uginanie ramion ze sztangielkami",
  mainMuscleGroup: "Biceps",
  exerciseType: "Izolowane",
  movementPattern: "Uginanie",
  exercisePriority: "Niski",
});

const tricepsIso = () => makeEx({
  name: "Prostowanie ramion na wyciągu",
  mainMuscleGroup: "Triceps",
  exerciseType: "Izolowane",
  movementPattern: "Pchanie poziome",
  exercisePriority: "Niski",
});

const calvesIso = () => makeEx({
  name: "Wspięcia na palce",
  mainMuscleGroup: "Łydki",
  exerciseType: "Izolowane",
  movementPattern: "Inne",
  exercisePriority: "Niski",
});

const adductorIso = () => makeEx({
  name: "Przywodzenie nóg",
  mainMuscleGroup: "Przywodziciele",
  exerciseType: "Izolowane",
  movementPattern: "Inne",
  exercisePriority: "Niski",
});

const coreEx = () => makeEx({
  name: "Deska",
  mainMuscleGroup: "Brzuch",
  exerciseType: "Izolowane",
  movementPattern: "Stabilizacja",
  suitableForNoActivity: true,
});

// ─── Beginner context ─────────────────────────────────────────────────────────

const CTX_INACTIVE: V0PriorityContext = {
  isPriorityEligible: false,
  isNoActivityClient: true,
  tierA: [],
  tierB: [],
};

const CTX_BEGINNER: V0PriorityContext = {
  isPriorityEligible: false,
  isBeginnerClient: true,
  tierA: [],
  tierB: [],
};

function makeResults(exercises: ScoredAndFilteredExercise[], slotBase = "Slot") {
  return exercises.map((ex, i) => ({ ex, slotName: `${slotBase} ${i + 1}` }));
}

// ─── hasMajorPattern ──────────────────────────────────────────────────────────

describe("hasMajorPattern", () => {
  it("detects push from Pchanie poziome compound", () => {
    const results = makeResults([chestCompound()]);
    expect(hasMajorPattern(results, "push")).toBe(true);
  });

  it("detects pull from Przyciąganie poziome back compound", () => {
    const results = makeResults([backPullVertical()]);
    expect(hasMajorPattern(results, "pull")).toBe(true);
  });

  it("does NOT count deadlift (Zawias biodrowy) as a pull", () => {
    const results = makeResults([deadlift()]);
    expect(hasMajorPattern(results, "pull")).toBe(false);
  });

  it("detects knee_dominant from Przysiad", () => {
    const results = makeResults([squat()]);
    expect(hasMajorPattern(results, "knee_dominant")).toBe(true);
  });

  it("detects knee_dominant from Wykrok", () => {
    const results = makeResults([lunge()]);
    expect(hasMajorPattern(results, "knee_dominant")).toBe(true);
  });

  it("detects hip_dominant from Zawias biodrowy", () => {
    const results = makeResults([hipThrust()]);
    expect(hasMajorPattern(results, "hip_dominant")).toBe(true);
  });

  it("detects core from Brzuch mainMuscleGroup", () => {
    const results = makeResults([coreEx()]);
    expect(hasMajorPattern(results, "core")).toBe(true);
  });

  it("returns false for empty results", () => {
    for (const mp of ["push", "pull", "knee_dominant", "hip_dominant", "core"] as MajorPattern[]) {
      expect(hasMajorPattern([], mp)).toBe(false);
    }
  });
});

// ─── requiredPatternsForSession ───────────────────────────────────────────────

describe("requiredPatternsForSession", () => {
  it("full_body requires push, pull, knee, hip", () => {
    const r = requiredPatternsForSession("full_body");
    expect(r).toContain("push");
    expect(r).toContain("pull");
    expect(r).toContain("knee_dominant");
    expect(r).toContain("hip_dominant");
    expect(r).not.toContain("core");
  });

  it("upper requires push and pull only", () => {
    const r = requiredPatternsForSession("upper");
    expect(r).toContain("push");
    expect(r).toContain("pull");
    expect(r).not.toContain("knee_dominant");
  });

  it("lower requires knee and hip only", () => {
    const r = requiredPatternsForSession("lower");
    expect(r).toContain("knee_dominant");
    expect(r).toContain("hip_dominant");
    expect(r).not.toContain("push");
  });

  it("push requires push only", () => {
    expect(requiredPatternsForSession("push")).toEqual(["push"]);
  });

  it("pull requires pull only", () => {
    expect(requiredPatternsForSession("pull")).toEqual(["pull"]);
  });
});

// ─── isSwappableAccessory ─────────────────────────────────────────────────────

describe("isSwappableAccessory", () => {
  it("biceps isolation is swappable", () => {
    expect(isSwappableAccessory(bicepsIso())).toBe(true);
  });

  it("triceps isolation is swappable", () => {
    expect(isSwappableAccessory(tricepsIso())).toBe(true);
  });

  it("calves isolation is swappable", () => {
    expect(isSwappableAccessory(calvesIso())).toBe(true);
  });

  it("adductor isolation is swappable", () => {
    expect(isSwappableAccessory(adductorIso())).toBe(true);
  });

  it("chest compound is NOT swappable", () => {
    expect(isSwappableAccessory(chestCompound())).toBe(false);
  });

  it("back compound is NOT swappable", () => {
    expect(isSwappableAccessory(backPullVertical())).toBe(false);
  });

  it("squat compound is NOT swappable", () => {
    expect(isSwappableAccessory(squat())).toBe(false);
  });

  it("core is NOT swappable", () => {
    expect(isSwappableAccessory(coreEx())).toBe(false);
  });
});

// ─── findReplacementForPattern ────────────────────────────────────────────────

describe("findReplacementForPattern", () => {
  it("finds a back pull for missing pull pattern", () => {
    const pool = [chestCompound(), backPullVertical(), squat()];
    const result = findReplacementForPattern("pull", pool, new Set(), CTX_INACTIVE);
    expect(result).not.toBeNull();
    expect(result!.mainMuscleGroup).toBe("Plecy");
  });

  it("finds a chest/shoulder compound for missing push pattern", () => {
    const pool = [chestCompound(), backPullVertical(), squat()];
    const result = findReplacementForPattern("push", pool, new Set(), CTX_INACTIVE);
    expect(result).not.toBeNull();
    const validPush = ["Klatka piersiowa", "Barki"];
    expect(validPush).toContain(result!.mainMuscleGroup);
  });

  it("finds a squat/lunge for missing knee_dominant pattern", () => {
    const pool = [squat(), lunge(), coreEx()];
    const result = findReplacementForPattern("knee_dominant", pool, new Set(), CTX_BEGINNER);
    expect(result).not.toBeNull();
  });

  it("finds a hinge for missing hip_dominant pattern", () => {
    const pool = [hipThrust(), romanianDeadlift(), squat()];
    const result = findReplacementForPattern("hip_dominant", pool, new Set(), CTX_BEGINNER);
    expect(result).not.toBeNull();
    const knownHingePatterns = ["Zawias biodrowy"];
    expect(knownHingePatterns).toContain(result!.movementPattern);
  });

  it("returns null when no candidate in pool", () => {
    const pool = [squat(), calvesIso()]; // no pull exercise
    const result = findReplacementForPattern("pull", pool, new Set(), CTX_INACTIVE);
    expect(result).toBeNull();
  });

  it("skips already-used exercises (12: equipment/dedup respected)", () => {
    const bp = backPullVertical();
    const pool = [bp, squat()];
    const usedIds = new Set([String(bp.id)]);
    const result = findReplacementForPattern("pull", pool, usedIds, CTX_INACTIVE);
    expect(result).toBeNull();
  });

  it("does NOT return deadlift as a pull exercise", () => {
    const pool = [deadlift()]; // hip-hinge back, not a pull
    const result = findReplacementForPattern("pull", pool, new Set(), CTX_INACTIVE);
    expect(result).toBeNull();
  });
});

// ─── applyBeginnerBalancingPass ───────────────────────────────────────────────

describe("applyBeginnerBalancingPass", () => {
  // Test 10: missing back coverage is repaired before direct biceps isolation stays
  it("10. swaps biceps isolation for back pull when pull is missing", () => {
    const bp = backPullVertical();
    const biceps = bicepsIso();
    const results = makeResults([chestCompound(), squat(), hipThrust(), biceps, coreEx()]);
    const eligible = [chestCompound(), squat(), hipThrust(), bp, biceps, coreEx()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);

    const names = results.map((r) => r.ex.name);
    expect(names).toContain(bp.name);
    expect(names).not.toContain(biceps.name);
  });

  // Test 7: full_body with push but no pull — pull added when available
  it("7. full_body: push without pull → pull added when available", () => {
    const pull = backPullVertical();
    const tri = tricepsIso();
    const results = makeResults([chestCompound(), squat(), hipThrust(), tri, coreEx()]);
    const eligible = [chestCompound(), pull, squat(), hipThrust(), tri, coreEx()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);

    expect(hasMajorPattern(results, "pull")).toBe(true);
    expect(hasMajorPattern(results, "push")).toBe(true);
  });

  // Test 8: Upper session with push but no pull — pull added
  it("8. upper: push without pull → pull added when available", () => {
    const pull = backPullHorizontal();
    const biceps = bicepsIso();
    const results = makeResults([chestCompound(), ohpCompound(), biceps, coreEx()]);
    const eligible = [chestCompound(), ohpCompound(), pull, biceps, coreEx()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "upper", CTX_BEGINNER);

    expect(hasMajorPattern(results, "push")).toBe(true);
    expect(hasMajorPattern(results, "pull")).toBe(true);
  });

  // Test 9: high quad/glute, low hamstring → hip-dominant prioritised
  it("9. full_body: missing hip_dominant → hinge added over redundant arm isolation", () => {
    const hinge = romanianDeadlift();
    const calves = calvesIso();
    const results = makeResults([chestCompound(), backPullVertical(), squat(), calves, coreEx()]);
    const eligible = [chestCompound(), backPullVertical(), squat(), hinge, calves, coreEx()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_BEGINNER);

    expect(hasMajorPattern(results, "hip_dominant")).toBe(true);
    const names = results.map((r) => r.ex.name);
    expect(names).toContain(hinge.name);
    expect(names).not.toContain(calves.name);
  });

  // Test 11: no swap when no swappable accessory exists
  it("11. no swap when all results are structural (nothing to remove)", () => {
    const resultsBefore = makeResults([chestCompound(), squat(), hipThrust(), coreEx()]);
    const resultsCopy = [...resultsBefore];
    const pull = backPullVertical();
    const eligible = [chestCompound(), pull, squat(), hipThrust(), coreEx()];
    const usedIds = new Set(resultsBefore.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(resultsBefore, eligible, usedIds, "full_body", CTX_INACTIVE);

    // No swappable accessory — results unchanged (pull still missing)
    expect(resultsBefore.map((r) => r.ex.id)).toEqual(resultsCopy.map((r) => r.ex.id));
  });

  // Test 12: no swap when replacement not available (equipment gap)
  it("12. no swap when no legal replacement exists in pool", () => {
    const biceps = bicepsIso();
    const results = makeResults([chestCompound(), squat(), hipThrust(), biceps, coreEx()]);
    const eligible = [chestCompound(), squat(), hipThrust(), biceps, coreEx()]; // NO back pull
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);

    // Pull still missing — no replacement available
    expect(hasMajorPattern(results, "pull")).toBe(false);
    expect(results.map((r) => r.ex.name)).toContain(biceps.name);
  });

  // Test 13: results are mutated after accepted swap
  it("13. results array is mutated in place after an accepted swap", () => {
    const pull = backPullVertical();
    const biceps = bicepsIso();
    const results = makeResults([chestCompound(), squat(), hipThrust(), biceps, coreEx()]);
    const eligible = [pull, chestCompound(), squat(), hipThrust(), biceps, coreEx()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    const before = results.map((r) => r.ex.id);
    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);
    const after = results.map((r) => r.ex.id);

    // Array changed
    expect(after).not.toEqual(before);
    // Pull is now present
    expect(after).toContain(pull.id);
    // Biceps is gone
    expect(after).not.toContain(biceps.id);
  });

  // Pattern check: when all patterns are present, no swap occurs
  it("no swap when all required patterns already present", () => {
    const results = makeResults([
      chestCompound(),
      backPullVertical(),
      squat(),
      hipThrust(),
      coreEx(),
    ]);
    const eligible = [...results.map((r) => r.ex), bicepsIso()];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));
    const before = results.map((r) => r.ex.id);

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);

    expect(results.map((r) => r.ex.id)).toEqual(before); // unchanged
  });

  // Swaps lowest-priority accessory first (not highest)
  it("swaps the LOWEST-priority swappable accessory, not an arbitrary one", () => {
    const pull = backPullVertical();
    const bicepsHigh = { ...bicepsIso(), exercisePriority: "Wysoki" as const };
    const tricepsLow = { ...tricepsIso(), exercisePriority: "Niski" as const };
    const results = makeResults([chestCompound(), squat(), hipThrust(), bicepsHigh, tricepsLow]);
    const eligible = [pull, chestCompound(), squat(), hipThrust(), bicepsHigh, tricepsLow];
    const usedIds = new Set(results.map((r) => String(r.ex.id)));

    applyBeginnerBalancingPass(results, eligible, usedIds, "full_body", CTX_INACTIVE);

    const names = results.map((r) => r.ex.name);
    // Triceps (Niski = lower priority) should be the one removed
    expect(names).not.toContain(tricepsLow.name);
    expect(names).toContain(pull.name);
    // Biceps (Wysoki = higher priority) remains
    expect(names).toContain(bicepsHigh.name);
  });
});

// ─── Beginner hard difficulty filter ─────────────────────────────────────────
//
// Exercises with learningDifficulty > 2 must NEVER appear in a beginner plan.
// Exercises with learningDifficulty ≤ 2 (or null) must be admitted.
// Non-beginner (advanced) plans must still receive ld=4 exercises normally.

/** Full pool helper — runs the engine with an explicit candidate list. */
function runEngineWith(
  exercises: ScoredAndFilteredExercise[],
  ctx: V0PriorityContext,
  altIdx = 0,
): ScoredAndFilteredExercise[] {
  const result = runExerciseSelectionEngineV0(
    exercises,
    "full_body",
    new Set<string>(),
    ctx,
    { alternativeIndex: altIdx },
  );
  return result.exercises;
}

/** Build a minimal full-body pool that satisfies all required patterns.
 *  Each exercise is given the specified learningDifficulty. */
function makeMinimalFullBodyPool(ld: number | null): ScoredAndFilteredExercise[] {
  return [
    makeEx({ name: "Push exercise", mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", learningDifficulty: ld }),
    makeEx({ name: "Pull exercise", mainMuscleGroup: "Plecy", exerciseType: "Złożone", movementPattern: "Przyciąganie poziome", learningDifficulty: ld }),
    makeEx({ name: "Squat exercise", mainMuscleGroup: "Mięśnie czworogłowe uda", exerciseType: "Złożone", movementPattern: "Przysiad", learningDifficulty: ld }),
    makeEx({ name: "Hinge exercise", mainMuscleGroup: "Pośladki", exerciseType: "Złożone", movementPattern: "Zawias biodrowy", learningDifficulty: ld }),
    makeEx({ name: "Core exercise", mainMuscleGroup: "Brzuch", exerciseType: "Izolowane", movementPattern: "Stabilizacja", learningDifficulty: ld }),
  ];
}

const CTX_ADVANCED: V0PriorityContext = {
  isPriorityEligible: true,
  isBeginnerClient: false,
  tierA: [],
  tierB: [],
};

describe("Beginner hard difficulty filter — pick()", () => {
  it("ld=4 exercise is excluded from beginner plan (never appears in results)", () => {
    // Pool: one ld=4 exercise per slot + one ld=2 alternative for each
    const advancedPush = makeEx({ name: "Advanced Push ld4", mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", learningDifficulty: 4 });
    const easyPush    = makeEx({ name: "Easy Push ld2",     mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", learningDifficulty: 2 });
    const rest = makeMinimalFullBodyPool(1).filter((e) => e.name !== "Push exercise");

    const selected = runEngineWith([advancedPush, easyPush, ...rest], CTX_BEGINNER);
    const ids = selected.map((e) => e.id);

    expect(ids).not.toContain(advancedPush.id);
    expect(ids).toContain(easyPush.id);
  });

  it("ld=2 exercise IS admitted for beginner plan", () => {
    const pool = makeMinimalFullBodyPool(2);
    const selected = runEngineWith(pool, CTX_BEGINNER);
    // All exercises in pool are ld=2 — all should be selectable
    expect(selected.length).toBeGreaterThan(0);
    for (const ex of selected) {
      const orig = pool.find((p) => p.id === ex.id);
      expect(orig?.learningDifficulty).toBeLessThanOrEqual(2);
    }
  });

  it("ld=null exercise IS admitted for beginner plan (null treated as easy)", () => {
    const pool = makeMinimalFullBodyPool(null);
    const selected = runEngineWith(pool, CTX_BEGINNER);
    expect(selected.length).toBeGreaterThan(0);
    for (const ex of selected) {
      const orig = pool.find((p) => p.id === ex.id);
      expect(orig?.learningDifficulty).toBeNull();
    }
  });

  it("ld=4 exercise IS admitted for advanced (non-beginner) plan", () => {
    const advancedPool = makeMinimalFullBodyPool(4);
    const selected = runEngineWith(advancedPool, CTX_ADVANCED);
    // Advanced clients have no difficulty cap — ld=4 exercises should be selected
    expect(selected.length).toBeGreaterThan(0);
    for (const ex of selected) {
      const orig = advancedPool.find((p) => p.id === ex.id);
      expect(orig?.learningDifficulty).toBe(4);
    }
  });

  it("ld=3 exercise is excluded from beginner plan (boundary: only ≤ 2 allowed)", () => {
    const ld3Push = makeEx({ name: "ld3 Push", mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", learningDifficulty: 3 });
    const ld2Push = makeEx({ name: "ld2 Push", mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", learningDifficulty: 2 });
    const rest = makeMinimalFullBodyPool(1).filter((e) => e.name !== "Push exercise");

    const selected = runEngineWith([ld3Push, ld2Push, ...rest], CTX_BEGINNER);
    const ids = selected.map((e) => e.id);

    expect(ids).not.toContain(ld3Push.id);
    expect(ids).toContain(ld2Push.id);
  });
});

describe("Beginner hard difficulty filter — findReplacementForPattern()", () => {
  it("ld=4 exercise is excluded from beginner balancing replacements", () => {
    const advancedPull = makeEx({
      name: "Advanced Pull ld4",
      mainMuscleGroup: "Plecy",
      exerciseType: "Złożone",
      movementPattern: "Przyciąganie poziome",
      learningDifficulty: 4,
    });
    const result = findReplacementForPattern("pull", [advancedPull], new Set(), CTX_BEGINNER);
    expect(result).toBeNull();
  });

  it("ld=2 exercise IS returned as a beginner balancing replacement", () => {
    const easyPull = makeEx({
      name: "Easy Pull ld2",
      mainMuscleGroup: "Plecy",
      exerciseType: "Złożone",
      movementPattern: "Przyciąganie poziome",
      learningDifficulty: 2,
    });
    const result = findReplacementForPattern("pull", [easyPull], new Set(), CTX_BEGINNER);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(easyPull.id);
  });

  it("non-beginner context returns ld=4 exercise as a replacement", () => {
    const advancedPull = makeEx({
      name: "Advanced Pull ld4",
      mainMuscleGroup: "Plecy",
      exerciseType: "Złożone",
      movementPattern: "Przyciąganie poziome",
      learningDifficulty: 4,
    });
    // Use an intermediate/advanced context — no noActivity and no beginner cap
    const ctxIntermediate: V0PriorityContext = {
      isPriorityEligible: true,
      isBeginnerClient: false,
      isNoActivityClient: false,
      tierA: [],
      tierB: [],
    };
    const result = findReplacementForPattern("pull", [advancedPull], new Set(), ctxIntermediate);
    // Intermediate/advanced: no difficulty cap, ld=4 is fully valid
    expect(result).not.toBeNull();
    expect(result!.id).toBe(advancedPull.id);
  });
});
