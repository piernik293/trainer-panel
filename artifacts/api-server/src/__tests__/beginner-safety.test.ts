/**
 * Beginner hard difficulty filter tests
 *
 * Verifies that every automatic exercise-selection path in
 * ExerciseSelectionEngineV0 enforces learningDifficulty ≤ 2 for clients
 * with experience level "Początkujący".
 *
 * Key engine facts confirmed by source inspection:
 *   - compound(ex) checks ex.exerciseType === "Złożone" (case-insensitive)
 *   - pattern(ex, ...) checks ex.movementPattern
 *   - muscle(ex, ...) checks ex.mainMuscleGroup or ex.secondaryMuscleGroups
 *
 * Test groups:
 *  A — shared eligibility rule (isBeginnerEligible)
 *  B — beginner + inactive combined filter
 *  C — pool exhaustion: reuse and slot-skip paths
 *  D — regression: advanced clients and existing inactive-client tests
 */

import { describe, it, expect } from "vitest";
import {
  runExerciseSelectionEngineV0,
  isBeginnerEligible,
  findReplacementForPattern,
  type V0PriorityContext,
} from "../services/ExerciseSelectionEngineV0";
import type { ScoredAndFilteredExercise } from "../services/ExerciseSelectionEngineV0";

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** compound(ex) in the engine checks exerciseType === "Złożone" (norm'd) */
const COMPOUND = "Złożone";
/** isolation / core exercises — compound() returns false for these */
const ISOLATION = "Siłowe";

function makeEx(
  id: number,
  overrides: Partial<ScoredAndFilteredExercise> = {},
): ScoredAndFilteredExercise {
  return {
    id,
    name: `Exercise ${id}`,
    slug: `exercise-${id}`,
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Masa własnego ciała"],
    requiredEquipmentAll: [],
    trainingLocation: ["Dom", "Siłownia"],
    difficultyLevel: "Początkujący",
    movementPattern: "Pchanie poziome",
    exerciseType: COMPOUND,
    movementCategory: "Wielostawowe",
    suitableExperienceLevels: ["Początkujący"],
    learningDifficulty: 1,
    exercisePriority: "Wysoki",
    suitableForNoActivity: null,
    isActive: true,
    score: 100,
    completeness: 1,
    subTargetBiases: {},
    isAvoided: false,
    ...overrides,
  };
}

/** Minimal push compound exercise (Klatka piersiowa, Pchanie poziome) */
function push(id: number, ld: number, extra: Partial<ScoredAndFilteredExercise> = {}) {
  return makeEx(id, {
    learningDifficulty: ld,
    movementPattern: "Pchanie poziome",
    exerciseType: COMPOUND,
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    ...extra,
  });
}

/** Minimal pull compound exercise (Plecy, Przyciąganie pionowe) */
function pull(id: number, ld: number, extra: Partial<ScoredAndFilteredExercise> = {}) {
  return makeEx(id, {
    learningDifficulty: ld,
    movementPattern: "Przyciąganie pionowe",
    exerciseType: COMPOUND,
    mainMuscleGroup: "Plecy",
    secondaryMuscleGroups: ["Biceps"],
    ...extra,
  });
}

/** Minimal knee-dominant compound exercise */
function knee(id: number, ld: number, extra: Partial<ScoredAndFilteredExercise> = {}) {
  return makeEx(id, {
    learningDifficulty: ld,
    movementPattern: "Przysiad",
    exerciseType: COMPOUND,
    mainMuscleGroup: "Mięśnie czworogłowe uda",
    secondaryMuscleGroups: ["Pośladki"],
    ...extra,
  });
}

/** Minimal hip-dominant compound exercise */
function hip(id: number, ld: number, extra: Partial<ScoredAndFilteredExercise> = {}) {
  return makeEx(id, {
    learningDifficulty: ld,
    movementPattern: "Zawias biodrowy",
    exerciseType: COMPOUND,
    mainMuscleGroup: "Mięśnie dwugłowe uda",
    secondaryMuscleGroups: ["Pośladki", "Plecy"],
    ...extra,
  });
}

/** Minimal core exercise (compound() returns false for this — uses muscle check only) */
function core(id: number, ld: number, extra: Partial<ScoredAndFilteredExercise> = {}) {
  return makeEx(id, {
    learningDifficulty: ld,
    movementPattern: "Anti-ekstensja",
    exerciseType: ISOLATION,
    movementCategory: "Izolowane",
    mainMuscleGroup: "Brzuch",
    secondaryMuscleGroups: [],
    ...extra,
  });
}

const beginnerCtx: V0PriorityContext = {
  isBeginnerClient: true,
  isNoActivityClient: false,
  isPriorityEligible: false,
  preferredExerciseKeywords: [],
};

const advancedCtx: V0PriorityContext = {
  isBeginnerClient: false,
  isNoActivityClient: false,
  isPriorityEligible: false,
  preferredExerciseKeywords: [],
};

const inactiveCtx: V0PriorityContext = {
  isBeginnerClient: false,
  isNoActivityClient: true,
  isPriorityEligible: false,
  preferredExerciseKeywords: [],
};

// ─── Group A — isBeginnerEligible unit tests ──────────────────────────────────

describe("A. isBeginnerEligible — shared eligibility predicate", () => {
  it("ld=1 → eligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: 1 })).toBe(true);
  });

  it("ld=2 → eligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: 2 })).toBe(true);
  });

  it("ld=3 → ineligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: 3 })).toBe(false);
  });

  it("ld=4 → ineligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: 4 })).toBe(false);
  });

  it("ld=null → ineligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: null })).toBe(false);
  });

  it("ld=undefined → ineligible", () => {
    expect(isBeginnerEligible({})).toBe(false);
  });

  it("ld=NaN → ineligible", () => {
    expect(isBeginnerEligible({ learningDifficulty: NaN })).toBe(false);
  });

  // Hardening patch — integer bounds and non-integer rejection
  it("ld=-1 → ineligible (negative)", () => {
    expect(isBeginnerEligible({ learningDifficulty: -1 })).toBe(false);
  });

  it("ld=0 → ineligible (below valid range)", () => {
    expect(isBeginnerEligible({ learningDifficulty: 0 })).toBe(false);
  });

  it("ld=1.5 → ineligible (non-integer)", () => {
    expect(isBeginnerEligible({ learningDifficulty: 1.5 })).toBe(false);
  });
});

// ─── Group A (engine) — hard filter in pick() ────────────────────────────────

describe("A (engine). Beginner hard filter in selection", () => {
  /**
   * Full pool for a beginner full_body session.
   * Push slots: id=1 (ld=1 eligible), id=2 (ld=4 ineligible).
   * Pull slots: id=3 (ld=1 eligible).
   * Knee: id=4 (ld=2 eligible).
   * Hip: id=5 (ld=1 eligible).
   * Core: id=6 (ld=1 eligible), id=7 (ld=3 ineligible).
   */
  function makeBeginnerPool(): ScoredAndFilteredExercise[] {
    return [
      push(1, 1),                                  // ✅ eligible push
      push(2, 4),                                  // ❌ ld=4, must be excluded
      pull(3, 1),                                  // ✅ eligible pull
      knee(4, 2),                                  // ✅ eligible knee
      hip(5, 1),                                   // ✅ eligible hip
      core(6, 1),                                  // ✅ eligible core
      core(7, 3),                                  // ❌ ld=3, must be excluded
    ];
  }

  it("no exercise with ld > 2 appears in a beginner plan (altIdx=0)", () => {
    const result = runExerciseSelectionEngineV0(
      makeBeginnerPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.length).toBeGreaterThan(0);
    for (const ex of result.exercises) {
      expect(
        isBeginnerEligible(ex),
        `id=${ex.id} "${ex.name}" has learningDifficulty=${ex.learningDifficulty}`,
      ).toBe(true);
    }
  });

  it("id=2 (ld=4 push) is never selected", () => {
    const result = runExerciseSelectionEngineV0(
      makeBeginnerPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(2);
  });

  it("id=7 (ld=3 core) is never selected", () => {
    const result = runExerciseSelectionEngineV0(
      makeBeginnerPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(7);
  });

  it("exercise with null learningDifficulty is never selected for beginners", () => {
    const poolWithNull = [
      ...makeBeginnerPool(),
      push(10, undefined as unknown as number, { learningDifficulty: null }),
    ];
    const result = runExerciseSelectionEngineV0(
      poolWithNull, "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(10);
  });

  it("hard filter applies at every altIdx (0–4)", () => {
    for (let idx = 0; idx <= 4; idx++) {
      const result = runExerciseSelectionEngineV0(
        makeBeginnerPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: idx },
      );
      for (const ex of result.exercises) {
        expect(
          isBeginnerEligible(ex),
          `altIdx=${idx}: id=${ex.id} "${ex.name}" ld=${ex.learningDifficulty}`,
        ).toBe(true);
      }
    }
  });
});

// ─── Group B — beginner + inactive combined ───────────────────────────────────

describe("B. Beginner + inactive combined filter", () => {
  const combinedCtx: V0PriorityContext = {
    isBeginnerClient: true,
    isNoActivityClient: true,
    isPriorityEligible: false,
    preferredExerciseKeywords: [],
  };

  function makeCombinedPool(): ScoredAndFilteredExercise[] {
    return [
      push(1,  1, { suitableForNoActivity: true }),   // ✅ both pass
      push(2,  4, { suitableForNoActivity: true }),   // ❌ ld fails
      push(3,  1, { suitableForNoActivity: null }),   // ❌ sfa fails
      push(4,  4, { suitableForNoActivity: null }),   // ❌ both fail
      pull(5,  1, { suitableForNoActivity: true }),
      knee(6,  2),                                     // sfa=null but slot filtered by beginnerCtx only
      hip(7,   1, { suitableForNoActivity: true }),
      core(8,  1, { suitableForNoActivity: true }),
    ];
  }

  it("only exercises with ld ≤ 2 AND suitableForNoActivity=true are selected", () => {
    const result = runExerciseSelectionEngineV0(
      makeCombinedPool(), "full_body", new Set<string>(), combinedCtx, { alternativeIndex: 0 },
    );
    for (const ex of result.exercises) {
      expect(isBeginnerEligible(ex), `id=${ex.id} ld=${ex.learningDifficulty}`).toBe(true);
      expect(ex.suitableForNoActivity, `id=${ex.id} sfa=${ex.suitableForNoActivity}`).toBe(true);
    }
  });

  it("id=2 (ld=4, sfa=true) never selected — ld filter fires", () => {
    const result = runExerciseSelectionEngineV0(
      makeCombinedPool(), "full_body", new Set<string>(), combinedCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(2);
  });

  it("id=3 (ld=1, sfa=null) never selected — sfa filter fires", () => {
    const result = runExerciseSelectionEngineV0(
      makeCombinedPool(), "full_body", new Set<string>(), combinedCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(3);
  });
});

// ─── Group C — pool exhaustion ────────────────────────────────────────────────

describe("C. Pool exhaustion: reuse and skip", () => {
  /**
   * Pool with only ld=1 exercises for all slots except push (only ld=4).
   * For a beginner, the push slot has no eligible exercise → warning fires.
   * The other slots fill normally.
   */
  function makeExhaustedPushPool(): ScoredAndFilteredExercise[] {
    return [
      push(1, 4),   // ❌ only push — ld=4, ineligible for beginner
      pull(2, 1),   // ✅
      knee(3, 1),   // ✅
      hip(4,  1),   // ✅
      core(5, 1),   // ✅
    ];
  }

  it("when no beginner-eligible exercise exists for a slot, the slot is skipped with a warning", () => {
    const result = runExerciseSelectionEngineV0(
      makeExhaustedPushPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    const hasBeginnerWarning = result.warnings.some((w) => w.includes("Początkujący"));
    expect(hasBeginnerWarning).toBe(true);
  });

  it("slot-skip warning never contains an ineligible exercise", () => {
    const result = runExerciseSelectionEngineV0(
      makeExhaustedPushPool(), "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 },
    );
    for (const ex of result.exercises) {
      expect(isBeginnerEligible(ex)).toBe(true);
    }
  });

  it("day 2 (cross-day dedup) never selects an ineligible exercise even when pool is thin", () => {
    const p = [push(1, 1), push(2, 4), pull(3, 1), knee(4, 1), hip(5, 1), core(6, 1)];
    const day1 = runExerciseSelectionEngineV0(p, "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 });
    const usedIds = new Set(day1.exercises.map((e) => String(e.id)));
    const day2 = runExerciseSelectionEngineV0(p, "full_body", usedIds, beginnerCtx, { alternativeIndex: 1 });
    for (const ex of day2.exercises) {
      expect(isBeginnerEligible(ex), `Day2 id=${ex.id} ld=${ex.learningDifficulty}`).toBe(true);
    }
  });

  it("reused exercises still satisfy learningDifficulty ≤ 2", () => {
    // Two-day run: day 2 may reuse day 1 exercises; none must have ld > 2.
    const p = [push(1, 1), pull(2, 1), knee(3, 1), hip(4, 1), core(5, 1)];
    const day1 = runExerciseSelectionEngineV0(p, "full_body", new Set<string>(), beginnerCtx, { alternativeIndex: 0 });
    const usedIds = new Set(day1.exercises.map((e) => String(e.id)));
    const day2 = runExerciseSelectionEngineV0(p, "full_body", usedIds, beginnerCtx, { alternativeIndex: 2 });
    for (const ex of day2.exercises) {
      expect(isBeginnerEligible(ex)).toBe(true);
    }
  });
});

// ─── Group D — regression ─────────────────────────────────────────────────────

describe("D. Regression: non-beginner clients unaffected", () => {
  /**
   * Pool that ONLY has ld=4 exercises (all slots filled).
   * Advanced ctx → no beginner filter → all exercises eligible.
   */
  function makeAdvancedOnlyPool(): ScoredAndFilteredExercise[] {
    return [
      push(1, 4),
      pull(2, 4),
      knee(3, 4),
      hip(4,  4),
      core(5, 4),
    ];
  }

  it("an advanced client may receive exercises with learningDifficulty=4", () => {
    const result = runExerciseSelectionEngineV0(
      makeAdvancedOnlyPool(), "full_body", new Set<string>(), advancedCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.length).toBeGreaterThan(0);
    const hasAdvanced = result.exercises.some((e) => (e.learningDifficulty ?? 0) > 2);
    expect(hasAdvanced).toBe(true);
  });

  it("a no-context call (no ctx) is unaffected by the beginner filter", () => {
    const result = runExerciseSelectionEngineV0(
      makeAdvancedOnlyPool(), "full_body", new Set<string>(), undefined, { alternativeIndex: 0 },
    );
    // Pool only contains ld=4 exercises; with no ctx (no safety filter) they must pass through.
    expect(result.exercises.length).toBeGreaterThan(0);
  });

  it("inactive-client filter: only suitableForNoActivity=true exercises selected", () => {
    const p: ScoredAndFilteredExercise[] = [
      push(1, 1, { suitableForNoActivity: true }),
      push(2, 1, { suitableForNoActivity: null }),
      pull(3, 1, { suitableForNoActivity: true }),
      knee(4, 1, { suitableForNoActivity: true }),
      hip(5,  1, { suitableForNoActivity: true }),
      core(6, 1, { suitableForNoActivity: true }),
    ];
    const result = runExerciseSelectionEngineV0(
      p, "full_body", new Set<string>(), inactiveCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.length).toBeGreaterThan(0);
    for (const ex of result.exercises) {
      expect(
        ex.suitableForNoActivity === true,
        `id=${ex.id} sfa=${ex.suitableForNoActivity}`,
      ).toBe(true);
    }
  });

  // Hardening patch — inactive client also blocked from ld > 2
  it("inactive + sfa=true + ld=4 → excluded (ld gate now covers inactive too)", () => {
    const p: ScoredAndFilteredExercise[] = [
      push(1, 4, { suitableForNoActivity: true }),  // ❌ sfa=true but ld=4
      push(2, 1, { suitableForNoActivity: true }),  // ✅ eligible
      pull(3, 1, { suitableForNoActivity: true }),
      knee(4, 1, { suitableForNoActivity: true }),
      hip(5,  1, { suitableForNoActivity: true }),
      core(6, 1, { suitableForNoActivity: true }),
    ];
    const result = runExerciseSelectionEngineV0(
      p, "full_body", new Set<string>(), inactiveCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.map((e) => e.id)).not.toContain(1);
  });

  it("inactive + sfa=true + ld=2 → allowed", () => {
    const p: ScoredAndFilteredExercise[] = [
      push(1, 2, { suitableForNoActivity: true }),
      pull(2, 2, { suitableForNoActivity: true }),
      knee(3, 2, { suitableForNoActivity: true }),
      hip(4,  2, { suitableForNoActivity: true }),
      core(5, 2, { suitableForNoActivity: true }),
    ];
    const result = runExerciseSelectionEngineV0(
      p, "full_body", new Set<string>(), inactiveCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.length).toBeGreaterThan(0);
    for (const ex of result.exercises) {
      expect(isBeginnerEligible(ex), `id=${ex.id} ld=${ex.learningDifficulty}`).toBe(true);
    }
  });

  it("advanced active client can still receive difficulty=4", () => {
    const result = runExerciseSelectionEngineV0(
      makeAdvancedOnlyPool(), "full_body", new Set<string>(), advancedCtx, { alternativeIndex: 0 },
    );
    expect(result.exercises.length).toBeGreaterThan(0);
    expect(result.exercises.some((e) => e.learningDifficulty === 4)).toBe(true);
  });
});

// ─── Targeted: inactive client replacement / balancing path ──────────────────

describe("E. findReplacementForPattern — inactive client ld gate", () => {
  it("inactive + sfa=true + ld=4 replacement candidate is rejected", () => {
    // The pool has a ld=4 push exercise (sfa=true) as the ONLY push option.
    // For an inactive client, findReplacementForPattern must reject it.
    const candidate = push(99, 4, { suitableForNoActivity: true });
    const result = findReplacementForPattern(
      "push",
      [candidate],
      new Set<string>(),
      inactiveCtx,
    );
    expect(result).toBeNull();
  });

  it("inactive + sfa=true + ld=2 replacement candidate is accepted", () => {
    const candidate = push(99, 2, { suitableForNoActivity: true });
    const result = findReplacementForPattern(
      "push",
      [candidate],
      new Set<string>(),
      inactiveCtx,
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(99);
  });

  it("inactive + sfa=null + ld=1 replacement candidate is rejected (sfa gate)", () => {
    const candidate = push(99, 1, { suitableForNoActivity: null });
    const result = findReplacementForPattern(
      "push",
      [candidate],
      new Set<string>(),
      inactiveCtx,
    );
    expect(result).toBeNull();
  });
});
