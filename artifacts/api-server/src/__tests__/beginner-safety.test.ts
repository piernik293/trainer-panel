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
 *  F — inactive clients: suitableForNoActivity === true in every session
 *      type, slot and fallback path (reuse, skip, supplement, balancing)
 */

import { describe, it, expect } from "vitest";
import {
  runExerciseSelectionEngineV0,
  isBeginnerEligible,
  findReplacementForPattern,
  applyBeginnerBalancingPass,
  type MajorPattern,
  type V0PriorityContext,
  type V0SessionType,
} from "../services/ExerciseSelectionEngineV0";
import type { ScoredAndFilteredExercise } from "../services/planDraftDayRecommendationsService";

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
    mainMuscleGroup: "Klatka piersiowa",
    secondaryMuscleGroups: [],
    equipment: ["Masa własnego ciała"],
    requiredEquipmentAll: [],
    trainingLocation: ["Dom", "Siłownia"],
    movementPattern: "Pchanie poziome",
    exerciseType: COMPOUND,
    learningDifficulty: 1,
    exercisePriority: "Wysoki",
    suitableForNoActivity: null,
    score: 100,
    matchReasons: [],
    warnReasons: [],
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
  tierA: [],
  tierB: [],
};

const advancedCtx: V0PriorityContext = {
  isBeginnerClient: false,
  isNoActivityClient: false,
  isPriorityEligible: false,
  preferredExerciseKeywords: [],
  tierA: [],
  tierB: [],
};

const inactiveCtx: V0PriorityContext = {
  isBeginnerClient: false,
  isNoActivityClient: true,
  isPriorityEligible: false,
  preferredExerciseKeywords: [],
  tierA: [],
  tierB: [],
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
    tierA: [],
    tierB: [],
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
    const hasBeginnerWarning = (result.warnings ?? []).some((w) => w.includes("Początkujący"));
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

// ─── Group F — suitableForNoActivity: every slot, every fallback path ────────

describe("F. Inactive client — suitableForNoActivity === true on every path", () => {
  const ALL_SESSION_TYPES: V0SessionType[] = [
    "push", "pull", "legs", "upper", "lower", "full_body", "plyo",
  ];
  const MUSCLES = [
    "Klatka piersiowa", "Plecy", "Barki", "Biceps", "Triceps", "Brzuch",
    "Pośladki", "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda", "Łydki",
    "Przywodziciele",
  ];
  const PATTERNS: (string | null)[] = [
    "Pchanie poziome", "Pchanie pionowe", "Przyciąganie pionowe",
    "Przyciąganie poziome", "Przysiad", "Wykrok", "Zawias biodrowy",
    "Odwodzenie", "Inne", null,
  ];
  const TYPES = [COMPOUND, "Izolowane"];

  const combinedCtx: V0PriorityContext = { ...inactiveCtx, isBeginnerClient: true };

  /**
   * Every muscle × pattern × type combination exists as a safe exercise
   * (sfa=true, ld=1) plus two unsafe twins (sfa=null and sfa=false) with a
   * HIGHER score — without the hard filter the engine would prefer the twins.
   */
  function buildTwinPool() {
    const safe: ScoredAndFilteredExercise[] = [];
    const unsafe: ScoredAndFilteredExercise[] = [];
    let id = 1000;
    for (const mainMuscleGroup of MUSCLES) {
      for (const movementPattern of PATTERNS) {
        for (const exerciseType of TYPES) {
          const base = { mainMuscleGroup, movementPattern, exerciseType, learningDifficulty: 1 };
          safe.push(makeEx(id++, { ...base, suitableForNoActivity: true, score: 50 }));
          unsafe.push(makeEx(id++, { ...base, suitableForNoActivity: null, score: 90 }));
          unsafe.push(makeEx(id++, { ...base, suitableForNoActivity: false, score: 95 }));
        }
      }
    }
    return { safe, unsafe, mixed: [...unsafe, ...safe] };
  }

  function expectAllSafe(exercises: { id: number; suitableForNoActivity?: boolean | null }[], label: string) {
    for (const ex of exercises) {
      expect(ex.suitableForNoActivity, `${label}: id=${ex.id} sfa=${ex.suitableForNoActivity}`).toBe(true);
    }
  }

  for (const [ctxName, ctx] of [["inactive", inactiveCtx], ["inactive + beginner", combinedCtx]] as const) {
    for (const sessionType of ALL_SESSION_TYPES) {
      it(`${ctxName} / ${sessionType}: unsafe twins never selected (altIdx 0–4)`, () => {
        const { safe, mixed } = buildTwinPool();
        const safeIds = new Set(safe.map((e) => e.id));
        for (let alternativeIndex = 0; alternativeIndex <= 4; alternativeIndex++) {
          const label = `${sessionType} altIdx=${alternativeIndex}`;
          const baseline = runExerciseSelectionEngineV0(safe, sessionType, new Set(), ctx, { alternativeIndex });
          const result = runExerciseSelectionEngineV0(mixed, sessionType, new Set(), ctx, { alternativeIndex });
          // Non-vacuous: whenever the safe pool alone builds a session, the
          // mixed pool must too — the unsafe twins must not crowd it out.
          if (baseline.valid) {
            expect(result.valid, label).toBe(true);
            expect(result.exercises.length, label).toBeGreaterThan(0);
          }
          expectAllSafe(result.exercises, label);
          for (const ex of result.exercises) expect(safeIds.has(ex.id), label).toBe(true);
        }
      });
    }
  }

  it("the twin pool builds a valid session for most session types (guards against vacuous passes)", () => {
    const { mixed } = buildTwinPool();
    const validTypes = ALL_SESSION_TYPES.filter(
      (t) => runExerciseSelectionEngineV0(mixed, t, new Set(), inactiveCtx, { alternativeIndex: 0 }).valid,
    );
    expect(validTypes).toEqual(expect.arrayContaining(["push", "pull", "legs", "upper", "lower", "full_body"]));
  });

  it("multi-day plan with cross-day dedup: no unsafe exercise on any of 6 days", () => {
    const { mixed } = buildTwinPool();
    const used = new Set<string>();
    const days: V0SessionType[] = ["full_body", "upper", "lower", "push", "pull", "legs"];
    days.forEach((sessionType, day) => {
      const result = runExerciseSelectionEngineV0(mixed, sessionType, used, inactiveCtx, { alternativeIndex: day });
      expectAllSafe(result.exercises, `day ${day + 1} ${sessionType}`);
      for (const ex of result.exercises) used.add(String(ex.id));
    });
  });

  it("safe-reuse fallback: when every safe exercise is already used, a SAFE one is repeated, never an unsafe one", () => {
    const safe = [
      push(1, 1, { suitableForNoActivity: true }),
      pull(2, 1, { suitableForNoActivity: true }),
      knee(3, 1, { suitableForNoActivity: true }),
      hip(4, 1, { suitableForNoActivity: true }),
      core(5, 1, { suitableForNoActivity: true }),
    ];
    const unsafe = [
      push(11, 1, { suitableForNoActivity: null, score: 200 }),
      pull(12, 1, { suitableForNoActivity: false, score: 200 }),
      knee(13, 1, { suitableForNoActivity: null, score: 200 }),
      hip(14, 1, { suitableForNoActivity: false, score: 200 }),
      core(15, 1, { suitableForNoActivity: null, score: 200 }),
    ];
    const usedIds = new Set(safe.map((e) => String(e.id)));
    const result = runExerciseSelectionEngineV0([...unsafe, ...safe], "full_body", usedIds, inactiveCtx, { alternativeIndex: 0 });
    expect(result.exercises.length).toBeGreaterThan(0);
    expectAllSafe(result.exercises, "reuse");
    expect(result.exercises.map((e) => e.id).some((id) => id >= 11)).toBe(false);
  });

  it("slot-skip path: no safe push exists → push slot skipped with a warning, unsafe pushes (null/false) never used", () => {
    const p = [
      push(1, 1, { suitableForNoActivity: null, score: 200 }),
      push(2, 1, { suitableForNoActivity: false, score: 200 }),
      pull(3, 1, { suitableForNoActivity: true }),
      knee(4, 1, { suitableForNoActivity: true }),
      hip(5, 1, { suitableForNoActivity: true }),
      core(6, 1, { suitableForNoActivity: true }),
    ];
    const result = runExerciseSelectionEngineV0(p, "full_body", new Set(), inactiveCtx, { alternativeIndex: 0 });
    const ids = result.exercises.map((e) => e.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expectAllSafe(result.exercises, "skip");
    if (result.valid) {
      expect((result.warnings ?? []).some((w) => w.includes("Brak aktywności fizycznej"))).toBe(true);
    }
  });

  it("lower-body supplement path: no safe hinge → unsafe hinge / lower-body exercises are not used as a fallback", () => {
    const p = [
      push(1, 1, { suitableForNoActivity: true }),
      pull(2, 1, { suitableForNoActivity: true }),
      knee(3, 1, { suitableForNoActivity: true }),
      core(4, 1, { suitableForNoActivity: true }),
      hip(10, 1, { suitableForNoActivity: null, score: 200 }),
      hip(11, 1, { suitableForNoActivity: false, score: 200 }),
      knee(12, 2, { suitableForNoActivity: null, score: 200 }),
      makeEx(13, { mainMuscleGroup: "Pośladki", movementPattern: "Odwodzenie", exerciseType: "Izolowane", suitableForNoActivity: null, score: 200 }),
    ];
    for (let alternativeIndex = 0; alternativeIndex <= 2; alternativeIndex++) {
      const result = runExerciseSelectionEngineV0(p, "full_body", new Set(), inactiveCtx, { alternativeIndex });
      expectAllSafe(result.exercises, `supplement altIdx=${alternativeIndex}`);
    }
  });

  const PATTERN_FIXTURES: Record<Exclude<MajorPattern, "core">, (id: number, ld: number, extra?: Partial<ScoredAndFilteredExercise>) => ScoredAndFilteredExercise> = {
    push, pull, knee_dominant: knee, hip_dominant: hip,
  };

  for (const [mp, make] of Object.entries(PATTERN_FIXTURES) as [Exclude<MajorPattern, "core">, typeof push][]) {
    it(`findReplacementForPattern("${mp}"): sfa=null and sfa=false rejected, sfa=true accepted`, () => {
      expect(findReplacementForPattern(mp, [make(1, 1, { suitableForNoActivity: null })], new Set(), inactiveCtx)).toBeNull();
      expect(findReplacementForPattern(mp, [make(2, 1, { suitableForNoActivity: false })], new Set(), inactiveCtx)).toBeNull();
      expect(findReplacementForPattern(mp, [make(3, 1, { suitableForNoActivity: true })], new Set(), inactiveCtx)?.id).toBe(3);
    });
  }

  it("balancing pass: missing pull is NOT patched with an unsafe pull; it IS patched with a safe one", () => {
    const accessory = makeEx(50, {
      mainMuscleGroup: "Biceps", movementPattern: "Inne", exerciseType: "Izolowane",
      suitableForNoActivity: true, exercisePriority: "Niski",
    });
    const unsafePull = pull(60, 1, { suitableForNoActivity: false, score: 200 });
    const safePull = pull(61, 1, { suitableForNoActivity: true });

    const resultsUnsafe = [{ ex: accessory, slotName: "Accessory" }];
    applyBeginnerBalancingPass(resultsUnsafe, [unsafePull], new Set(["50"]), "pull", inactiveCtx);
    expect(resultsUnsafe.map((r) => r.ex.id)).toEqual([50]);

    const resultsSafe = [{ ex: accessory, slotName: "Accessory" }];
    applyBeginnerBalancingPass(resultsSafe, [unsafePull, safePull], new Set(["50"]), "pull", inactiveCtx);
    expect(resultsSafe.map((r) => r.ex.id)).toEqual([61]);
  });
});
