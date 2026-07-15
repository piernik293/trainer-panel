/**
 * useVolumeCoverage — focused unit tests for the sets→coverage update flow.
 *
 * Tests the pure-function layer of the hook:
 *   buildCoverageKey   — dependency key that gates new preview requests
 *   buildPreviewBody   — POST payload builder (sets → workingSets)
 *   updateDraftExerciseField — immutable draft mutation
 *
 * React hook lifecycle and fetch side-effects are not testable in the node
 * environment, so stale-response and debounce behaviour is verified at the
 * coverage-key level: a changed key triggers cleanup of the previous useEffect
 * (clearTimeout + AbortController.abort), which is the sole mechanism that
 * discards stale responses.
 */

import { describe, it, expect } from "vitest";
import { buildCoverageKey, buildPreviewBody } from "../useVolumeCoverage";
import { updateDraftExerciseField } from "../../lib/exerciseDraftHelpers";
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
    exerciseName: `Exercise ${exerciseId}`,
    mainMuscleGroup: "Plecy",
    equipment: [],
    isCore: false,
    sets,
    repsMin: 8,
    repsMax: 12,
    rir: 2,
    restSeconds: 90,
    order: 0,
    ...overrides,
  };
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

// A stable localId used across draft variants in the same test
const STABLE_LOCAL_ID = "stable-local-1";

// ─── Test cases ───────────────────────────────────────────────────────────────

// Case 1: Initial exercise has 3 sets
describe("Case 1 — initial draft with 3 sets", () => {
  it("buildCoverageKey includes sets=3 in the key string", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const key = buildCoverageKey(draft);
    expect(key).toContain("3");
  });
});

// Case 2: Changing the input to 4 updates the local draft to sets: 4
describe("Case 2 — updateDraftExerciseField writes sets=4 to the draft", () => {
  it("draft.sets becomes 4 after updateDraftExerciseField", () => {
    const initial: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const updated = updateDraftExerciseField(initial, 0, STABLE_LOCAL_ID, "sets", 4);
    expect(updated[0]?.[0]?.sets).toBe(4);
  });
});

// Case 3: A new preview request is sent with workingSets: 4
describe("Case 3 — buildPreviewBody maps sets=4 to workingSets:4", () => {
  it("payload exercise has workingSets:4 when draft sets=4", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const body = buildPreviewBody(1, draft, makeDistribution([0]));
    expect(body.days[0]?.exercises[0]?.workingSets).toBe(4);
  });
});

// Cases 4 & 5: Daily and weekly realized volume update
// Mechanism: buildCoverageKey changes → useEffect fires → new POST → new previewResult
describe("Cases 4 & 5 — coverage key changes when sets change (triggers new request)", () => {
  it("buildCoverageKey for sets=3 differs from sets=4 (new useEffect run guaranteed)", () => {
    const draft3: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    expect(buildCoverageKey(draft3)).not.toBe(buildCoverageKey(draft4));
  });

  it("new payload contains workingSets from the updated draft (daily coverage source)", () => {
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const body = buildPreviewBody(1, draft4, makeDistribution([0]));
    const ex = body.days[0]?.exercises[0];
    expect(ex?.workingSets).toBe(4);
    expect(ex?.exerciseId).toBe(10);
  });

  it("multi-day payload has correct workingSets per day", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: "d0-ex10" })],
      2: [makeExercise(20, 3, { localId: "d2-ex20" })],
    };
    const body = buildPreviewBody(1, draft, makeDistribution([0, 2]));
    const day0ex = body.days[0]?.exercises[0];
    const day2ex = body.days[1]?.exercises[0];
    expect(day0ex?.workingSets).toBe(4);
    expect(day2ex?.workingSets).toBe(3);
  });
});

// Case 6: Remaining/exceeded status updates
describe("Case 6 — coverage key differs after sets change (status update triggered)", () => {
  it("key after sets increase contains the new count", () => {
    const draft: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const updated = updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 5);
    const key = buildCoverageKey(updated);
    expect(key).toContain("5");
    expect(key).not.toContain(":3");
  });
});

// Case 7: Stale 3-set response cannot overwrite the 4-set result
describe("Case 7 — stale response protection via key change", () => {
  it("3-set key differs from 4-set key, guaranteeing the old useEffect is cleaned up", () => {
    // When coverageKey changes from K3 → K4, React calls the K3 useEffect cleanup
    // (clearTimeout + AbortController.abort). The in-flight 3-set fetch is aborted.
    // Only the 4-set fetch (new useEffect) can update the result.
    const draft3: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const draft4: ExerciseDraftByDay = {
      0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })],
    };
    const key3 = buildCoverageKey(draft3);
    const key4 = buildCoverageKey(draft4);
    // Keys differ → useEffect dependency changes → old effect cleaned up → old fetch aborted
    expect(key3).not.toBe(key4);
  });

  it("aborting older fetch is safe: the 3-set payload's workingSets is distinct from 4-set", () => {
    const dist = makeDistribution([0]);
    const body3 = buildPreviewBody(1, { 0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })] }, dist);
    const body4 = buildPreviewBody(1, { 0: [makeExercise(10, 4, { localId: STABLE_LOCAL_ID })] }, dist);
    expect(body3.days[0]?.exercises[0]?.workingSets).toBe(3);
    expect(body4.days[0]?.exercises[0]?.workingSets).toBe(4);
    // Only the 4-set response should update coverage; if the 3-set response
    // somehow arrived after the 4-set one, the abort mechanism prevents it.
  });
});

// Case 8: Rapid 3 → 4 → 5 changes end with the 5-set result
describe("Case 8 — rapid set changes: final draft reflects 5 sets", () => {
  it("sequential draft updates 3→4→5 produce sets=5 in the final draft", () => {
    const base: ExerciseDraftByDay = {
      0: [makeExercise(10, 3, { localId: STABLE_LOCAL_ID })],
    };
    const after4 = updateDraftExerciseField(base, 0, STABLE_LOCAL_ID, "sets", 4);
    const after5 = updateDraftExerciseField(after4, 0, STABLE_LOCAL_ID, "sets", 5);
    expect(after5[0]?.[0]?.sets).toBe(5);
    // The key for the 5-set draft differs from both earlier keys
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

// Case 9: Changing repetitions alone does not trigger a volume request
describe("Case 9 — reps/RIR/rest changes do NOT produce a new coverage key", () => {
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

// Case 10: Existing selected exercises and prescriptions remain present
describe("Case 10 — updateDraftExerciseField preserves all other exercise fields", () => {
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

  it("original draft is not mutated (immutable update)", () => {
    const original = makeExercise(10, 3, { localId: STABLE_LOCAL_ID });
    const draft: ExerciseDraftByDay = { 0: [original] };
    updateDraftExerciseField(draft, 0, STABLE_LOCAL_ID, "sets", 4);
    // The original draft and the original exercise object are unchanged
    expect(draft[0]?.[0]?.sets).toBe(3);
    expect(original.sets).toBe(3);
  });

  it("other exercises in the same day are untouched", () => {
    const ex1 = makeExercise(10, 3, { localId: "l1" });
    const ex2 = makeExercise(20, 4, { localId: "l2" });
    const draft: ExerciseDraftByDay = { 0: [ex1, ex2] };
    const updated = updateDraftExerciseField(draft, 0, "l1", "sets", 5);
    expect(updated[0]?.[0]?.sets).toBe(5);  // changed
    expect(updated[0]?.[1]?.sets).toBe(4);  // unchanged
    expect(updated[0]?.[1]?.exerciseId).toBe(20);
  });
});
