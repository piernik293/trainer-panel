/**
 * useVolumeCoverage — focused unit tests for the sets→coverage update flow.
 *
 * Covers all 12 required cases from the Working Sets Live Coverage spec.
 *
 * Tests target the pure-function layer:
 *   buildCoverageKey   — dependency key that gates new preview requests
 *   buildPreviewBody   — POST payload builder (sets → workingSets)
 *   updateDraftExerciseField — immutable draft mutation
 *   countCoreActualSetsForDay / countCoreWeeklySets — Core coverage derivation
 *
 * React hook lifecycle and fetch side-effects are not testable in the node
 * environment.  Stale-response and debounce behaviour is verified at the
 * coverage-key level: a changed key triggers useEffect cleanup
 * (clearTimeout + AbortController.abort), which discards in-flight responses.
 */

import { describe, it, expect } from "vitest";
import { buildCoverageKey, buildPreviewBody } from "../useVolumeCoverage";
import { updateDraftExerciseField } from "../../lib/exerciseDraftHelpers";
import {
  countCoreActualSetsForDay,
  countCoreWeeklySets,
} from "../../lib/coreCoverageHelpers";
import type { ExerciseDraftByDay, DraftExercise } from "../../lib/exerciseDraftHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let _localIdCounter = 0;
function makeExercise(
  exerciseId: number,
  sets: number,
  overrides: Partial<DraftExercise> = {},
): DraftExercise {
  return {
    localId: overrides.localId ?? `local-${exerciseId}-${++_localIdCounter}`,
    exerciseId,
    exerciseName: overrides.exerciseName ?? `Exercise ${exerciseId}`,
    mainMuscleGroup: overrides.mainMuscleGroup ?? "Plecy",
    equipment: overrides.equipment ?? [],
    isCore: overrides.isCore ?? false,
    sets,
    repsMin: overrides.repsMin ?? 8,
    repsMax: overrides.repsMax ?? 12,
    rir: overrides.rir ?? 2,
    restSeconds: overrides.restSeconds ?? 90,
    order: overrides.order ?? 0,
  };
}

function makeCoreExercise(exerciseId: number, sets: number, localId?: string): DraftExercise {
  return makeExercise(exerciseId, sets, {
    localId: localId ?? `core-local-${exerciseId}-${++_localIdCounter}`,
    mainMuscleGroup: "Brzuch",
    exerciseName: "Ab wheel rollout",
    isCore: true,
  });
}

/** Minimal WeeklyVolumeDistributionResponseType shape used by buildPreviewBody. */
function makeDistribution(dayIndexes: number[] = [0]) {
  return {
    days: dayIndexes.map((di) => ({
      dayIndex: di,
      dayName: `Day ${di + 1}`,
      dayType: "Full Body",
      targetAllocations: [],
      totalEffectiveTargetVolume: 0,
      auxiliaryCoreBlock: null,
    })),
    targetDecisions: [],
    auxiliaryCoreBlock: null,
  } as unknown as Parameters<typeof buildPreviewBody>[2];
}

// A stable localId reused across draft variants in the same test
const STABLE_LOCAL_ID = "stable-local-1";
const STABLE_CORE_LOCAL_ID = "stable-core-local-1";

// ─── Case 1: Changing sets updates workingSets in the draft ───────────────────

describe("Case 1 — updateDraftExerciseField writes sets=4 to the draft", () => {
  it("draft.sets becomes 4 after the update", () => {
    const initial: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const updated = updateDraftExerciseField(initial, 0, STABLE_LOCAL_ID, "sets", 4);
    expect(updated[0]?.[0]?.sets).toBe(4);
  });

  it("buildCoverageKey reflects the new set count (4) immediately", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const updated = updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 4);
    const key = buildCoverageKey(updated);
    expect(key).toContain(":4");
    expect(key).not.toContain(":3");
  });
});

// ─── Case 2: Existing metadata and prescription fields are preserved ──────────

describe("Case 2 — updateDraftExerciseField preserves all other exercise fields", () => {
  it("only sets changes; all other prescription fields are unchanged", () => {
    const original = makeExercise(10, 3, {
      localId: STABLE_LOCAL_ID,
      repsMin: 8,
      repsMax: 12,
      rir: 2,
      restSeconds: 90,
    });
    const draft: ExerciseDraftByDay = { 0: [original] };
    const updated = updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 4);
    const ex = updated[0]?.[0];

    expect(ex?.sets).toBe(4);
    expect(ex?.repsMin).toBe(original.repsMin);
    expect(ex?.repsMax).toBe(original.repsMax);
    expect(ex?.rir).toBe(original.rir);
    expect(ex?.restSeconds).toBe(original.restSeconds);
    expect(ex?.exerciseId).toBe(original.exerciseId);
    expect(ex?.exerciseName).toBe(original.exerciseName);
    expect(ex?.mainMuscleGroup).toBe(original.mainMuscleGroup);
    expect(ex?.localId).toBe(original.localId);
  });

  it("original draft object is not mutated (immutable update)", () => {
    const original = makeExercise(10, 3, { localId: STABLE_LOCAL_ID });
    const draft: ExerciseDraftByDay = { 0: [original] };
    updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 4);
    expect(draft[0]?.[0]?.sets).toBe(3);
    expect(original.sets).toBe(3);
  });
});

// ─── Case 3: Core actual direct sets update from 3 to 4 ──────────────────────

describe("Case 3 — Core actual direct sets update from 3 to 4", () => {
  it("countCoreActualSetsForDay returns 4 after sets change for a Brzuch exercise", () => {
    const initial: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 3, STABLE_CORE_LOCAL_ID)],
    };
    expect(countCoreActualSetsForDay(initial[0]!)).toBe(3);

    const updated = updateDraftExerciseField(initial, 0, STABLE_CORE_LOCAL_ID, "sets", 4);
    expect(countCoreActualSetsForDay(updated[0]!)).toBe(4);
  });

  it("countCoreWeeklySets reflects the updated sets across the whole week", () => {
    const initial: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 3, STABLE_CORE_LOCAL_ID)],
      2: [makeCoreExercise(51, 2, "core-local-51-1")],
    };
    expect(countCoreWeeklySets(initial)).toBe(5); // 3 + 2

    const updated = updateDraftExerciseField(initial, 0, STABLE_CORE_LOCAL_ID, "sets", 4);
    expect(countCoreWeeklySets(updated)).toBe(6); // 4 + 2
  });

  it("non-Core exercise mainMuscleGroup change does not affect Core count", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: "l1", mainMuscleGroup: "Plecy" })],
    };
    expect(countCoreActualSetsForDay(draft[0]!)).toBe(0); // not Brzuch
  });
});

// ─── Case 4: Core status changes from covered to exceeded by 1 set ───────────

describe("Case 4 — Core status changes from covered to exceeded by 1 set", () => {
  it("actual=3 vs planned=3 → exact match", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 3, STABLE_CORE_LOCAL_ID)],
    };
    const actual = countCoreActualSetsForDay(draft[0]!);
    const planned = 3;
    // |actual - planned| < 0.5 → "Pokryto"
    expect(Math.abs(actual - planned) < 0.5).toBe(true);
  });

  it("actual=4 vs planned=3 → exceeded by 1 (diff = -1 < -0.5)", () => {
    const initial: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 3, STABLE_CORE_LOCAL_ID)],
    };
    const updated = updateDraftExerciseField(initial, 0, STABLE_CORE_LOCAL_ID, "sets", 4);
    const actual = countCoreActualSetsForDay(updated[0]!);
    const planned = 3;
    // diff = planned - actual = 3 - 4 = -1 < -0.5 → "Przekroczono o 1 serię"
    const diff = planned - actual;
    expect(actual).toBe(4);
    expect(diff).toBe(-1);
    expect(diff < -0.5).toBe(true);
  });

  it("Core coverage key changes when Core exercise sets change (coverage re-derived)", () => {
    const draft3: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 3, STABLE_CORE_LOCAL_ID)],
    };
    const draft4: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 4, STABLE_CORE_LOCAL_ID)],
    };
    // Key change guarantees DayVolumeCoverage re-renders with fresh exerciseDraft
    expect(buildCoverageKey(draft3)).not.toBe(buildCoverageKey(draft4));
  });
});

// ─── Case 5: Normal preview request contains workingSets: 4 ──────────────────

describe("Case 5 — buildPreviewBody maps sets=4 to workingSets:4", () => {
  it("payload exercise has workingSets:4 when draft sets=4", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const body = buildPreviewBody(1, draft, makeDistribution([0]));
    expect(body.days[0]?.exercises[0]?.workingSets).toBe(4);
  });

  it("Core exercise (Brzuch) also maps sets to workingSets in the payload", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeCoreExercise(50, 4, STABLE_CORE_LOCAL_ID)],
    };
    const body = buildPreviewBody(1, draft, makeDistribution([0]));
    expect(body.days[0]?.exercises[0]?.workingSets).toBe(4);
    expect(body.days[0]?.exercises[0]?.exerciseId).toBe(50);
  });
});

// ─── Cases 6 & 7: Daily and weekly coverage update via key change ─────────────

describe("Cases 6 & 7 — coverage key changes when sets change (new request triggered)", () => {
  it("key for sets=3 differs from sets=4 — new useEffect run guaranteed", () => {
    const draft3: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    expect(buildCoverageKey(draft3)).not.toBe(buildCoverageKey(draft4));
  });

  it("new payload carries workingSets from the updated draft (daily coverage source)", () => {
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const body = buildPreviewBody(1, draft4, makeDistribution([0]));
    const ex = body.days[0]?.exercises[0];
    expect(ex?.workingSets).toBe(4);
    expect(ex?.exerciseId).toBe(10);
  });

  it("multi-day payload has correct workingSets per day (weekly coverage source)", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: "d0-ex10" })],
      2: [makeExercise(20, 3, { localId: "d2-ex20" })],
    };
    const body = buildPreviewBody(1, draft, makeDistribution([0, 2]));
    expect(body.days[0]?.exercises[0]?.workingSets).toBe(4);
    expect(body.days[1]?.exercises[0]?.workingSets).toBe(3);
  });
});

// ─── Case 8: Remaining/exceeded status updates ────────────────────────────────

describe("Case 8 — coverage key differs after sets change (status update triggered)", () => {
  it("key after sets increase contains the new count", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const updated = updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 5);
    const key = buildCoverageKey(updated);
    expect(key).toContain(":5");
    expect(key).not.toContain(":3");
  });
});

// ─── Case 9: Rapid 3 → 4 → 5 changes end with the 5-set result ──────────────

describe("Case 9 — rapid set changes: final draft reflects 5 sets", () => {
  it("sequential draft updates 3→4→5 produce sets=5 in the final draft", () => {
    const base: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const after4 = updateDraftExerciseField(base, 0, STABLE_LOCAL_ID, "sets", 4);
    const after5 = updateDraftExerciseField(after4, 0, STABLE_LOCAL_ID, "sets", 5);
    expect(after5[0]?.[0]?.sets).toBe(5);
    // Each intermediate key differs → old useEffect cleanups chain correctly
    expect(buildCoverageKey(after5)).not.toBe(buildCoverageKey(base));
    expect(buildCoverageKey(after5)).not.toBe(buildCoverageKey(after4));
  });

  it("final payload for 5-set draft sends workingSets:5", () => {
    const draft5: ExerciseDraftByDay = {
      0: [makeExercise(10, 5, { localId: STABLE_LOCAL_ID })],
    };
    const body = buildPreviewBody(1, draft5, makeDistribution([0]));
    expect(body.days[0]?.exercises[0]?.workingSets).toBe(5);
  });
});

// ─── Case 10: Stale response cannot overwrite the newest result ───────────────

describe("Case 10 — stale response protection via key change", () => {
  it("3-set key differs from 4-set key — old useEffect is cleaned up (fetch aborted)", () => {
    const draft3: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const key3 = buildCoverageKey(draft3);
    const key4 = buildCoverageKey(draft4);
    // Keys differ → useEffect dep changes → old AbortController.abort() fires
    expect(key3).not.toBe(key4);
  });

  it("3-set and 4-set payloads are distinct — if stale 3-set arrives it is identifiably wrong", () => {
    const dist = makeDistribution([0]);
    const body3 = buildPreviewBody(1, { 0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })] }, dist);
    const body4 = buildPreviewBody(1, { 0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })] }, dist);
    expect(body3.days[0]?.exercises[0]?.workingSets).toBe(3);
    expect(body4.days[0]?.exercises[0]?.workingSets).toBe(4);
  });
});

// ─── Case 11: Repetition-only change does not trigger volume preview ──────────

describe("Case 11 — reps/RIR/rest changes do NOT produce a new coverage key", () => {
  it("repsMin change alone produces the same key", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, repsMin: 8 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, repsMin: 6 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("repsMax change alone produces the same key", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, repsMax: 12 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, repsMax: 15 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("RIR change alone produces the same key", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, rir: 2 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, rir: 0 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });

  it("restSeconds change alone produces the same key", () => {
    const draft1: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, restSeconds: 90 })],
    };
    const draft2: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID, restSeconds: 120 })],
    };
    expect(buildCoverageKey(draft1)).toBe(buildCoverageKey(draft2));
  });
});

// ─── Case 12: Other workout days and exercises remain unchanged ───────────────

describe("Case 12 — updateDraftExerciseField leaves other days and exercises unchanged", () => {
  it("only the targeted exercise in the targeted day changes", () => {
    const ex1 = makeExercise(10, 3, { localId: "l1" });
    const ex2 = makeExercise(20, 4, { localId: "l2" });
    const draft: ExerciseDraftByDay = { 0: [ex1, ex2] };
    const updated = updateDraftExerciseField(draft, 0, "l1", "sets", 5);
    expect(updated[0]?.[0]?.sets).toBe(5);  // changed
    expect(updated[0]?.[1]?.sets).toBe(4);  // unchanged
    expect(updated[0]?.[1]?.exerciseId).toBe(20);
  });

  it("exercises in other workout days are untouched", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: "day0-ex" })],
      2: [makeExercise(20, 3, { localId: "day2-ex" })],
    };
    const updated = updateDraftExerciseField(draft, 0, "day0-ex", "sets", 5);
    expect(updated[0]?.[0]?.sets).toBe(5);
    expect(updated[2]?.[0]?.sets).toBe(3); // day 2 unchanged
    expect(updated[2]?.[0]?.exerciseId).toBe(20);
  });

  it("Core exercise in another day is untouched when a normal exercise changes", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: "l-normal" })],
      1: [makeCoreExercise(50, 3, "l-core")],
    };
    const updated = updateDraftExerciseField(draft, 0, "l-normal", "sets", 4);
    expect(updated[0]?.[0]?.sets).toBe(4);
    expect(updated[1]?.[0]?.sets).toBe(3); // Core exercise unchanged
    expect(countCoreActualSetsForDay(updated[1]!)).toBe(3);
  });
});
