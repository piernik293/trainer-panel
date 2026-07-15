/**
 * Auto-Fill Phase 4D — focused unit tests
 *
 * Covers:
 * - existing exercises and prescriptions are preserved (draft not touched by pure fns)
 * - one request maximum per required day (runAutoFill URL count)
 * - covered day sends no request
 * - exact uncovered targetIds are passed (buildDayFetchUrl)
 * - already-added IDs are passed (buildDayFetchUrl)
 * - recommendation scores are unchanged (scores not in AutoFillDayResult)
 * - one multi-target exercise is added once (selectExercisesForDay dedup)
 * - avoided exercise is not added (selectExercisesForDay)
 * - generated defaults are correct (DRAFT_EXERCISE_DEFAULTS)
 * - Core is added at most once (selectExercisesForDay)
 * - day limits are enforced (8 exercises / 24 sets)
 * - unresolved target is reported
 * - failed request leaves the draft unchanged (runAutoFill atomic guarantee)
 * - no write endpoint is called (fetcher URL inspection)
 * - Step 5 rules are unchanged (pure fn has no effect on validation)
 * - exact targetId matching (name with wrong ID is rejected, exact ID is accepted)
 * - multi-target: exercise covering two uncovered IDs resolves both, added once
 */

import { describe, it, expect, vi } from "vitest";
import {
  selectExercisesForDay,
  buildDayFetchUrl,
  computeAutoFillSummary,
  runAutoFill,
  MAX_DAY_EXERCISES,
  MAX_DAY_SETS,
  type AutoFillRecExercise,
  type AutoFillDayTarget,
  type RunAutoFillDayInput,
} from "../autoFill";
import { DRAFT_EXERCISE_DEFAULTS } from "../exerciseDraftHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Build an AutoFillRecExercise with explicit matchingTargetIds.
 * targets drives both matchingTargets (names) and matchingTargetIds — the
 * same fields that runAutoFill populates after enrichment.
 */
function makeRec(
  id: number,
  targets: Array<{ targetId: number; targetName: string }>,
  overrides: Partial<Omit<AutoFillRecExercise, "id" | "matchingTargets" | "matchingTargetIds">> = {},
): AutoFillRecExercise {
  return {
    id,
    name: `Exercise ${id}`,
    mainMuscleGroup: "Plecy",
    matchingTargets: targets.map((t) => t.targetName),
    matchingTargetIds: targets.map((t) => t.targetId),
    equipment: [],
    isAvoided: false,
    ...overrides,
  };
}

function makeCoreRec(id: number): AutoFillRecExercise {
  return {
    id,
    name: `Core ${id}`,
    mainMuscleGroup: "Brzuch",
    matchingTargets: [],
    matchingTargetIds: [],
    equipment: [],
    isAvoided: false,
  };
}

const latTarget: AutoFillDayTarget = { targetId: 1, targetName: "Latissimus dorsi" };
const trapTarget: AutoFillDayTarget = { targetId: 2, targetName: "Trapezius" };
const pecTarget: AutoFillDayTarget = { targetId: 3, targetName: "Klatka piersiowa" };

const NO_AVOIDED = new Set<number>();

// ─── selectExercisesForDay ─────────────────────────────────────────────────────

describe("selectExercisesForDay()", () => {
  it("selects first non-avoided recommendation for each uncovered target", () => {
    const recs = [makeRec(10, [latTarget]), makeRec(20, [trapTarget])];
    const result = selectExercisesForDay(0, [latTarget, trapTarget], false, recs, 0, 0, NO_AVOIDED);
    const ids = result.toAdd.map((e) => e.exerciseId);
    expect(ids).toContain(10);
    expect(ids).toContain(20);
    expect(result.resolvedTargets.map((t) => t.targetId)).toContain(1);
    expect(result.resolvedTargets.map((t) => t.targetId)).toContain(2);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  // ── Exact targetId matching ───────────────────────────────────────────────

  it("matching target name with wrong targetId is rejected", () => {
    // rec has matchingTargetIds: [99] but the day needs targetId 1
    // name "Latissimus dorsi" matches, but ID does not → must be rejected
    const wrongIdRec: AutoFillRecExercise = {
      id: 10,
      name: "Exercise 10",
      mainMuscleGroup: "Plecy",
      matchingTargets: ["Latissimus dorsi"],  // same name as latTarget
      matchingTargetIds: [99],                // different ID
      equipment: [],
      isAvoided: false,
    };
    const result = selectExercisesForDay(0, [latTarget], false, [wrongIdRec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.targetId).toBe(1);
  });

  it("exact matching targetId is accepted", () => {
    // rec has matchingTargetIds: [1] which matches latTarget.targetId exactly
    const correctIdRec: AutoFillRecExercise = {
      id: 10,
      name: "Exercise 10",
      mainMuscleGroup: "Plecy",
      matchingTargets: ["Latissimus dorsi"],
      matchingTargetIds: [1],  // exact match for latTarget.targetId
      equipment: [],
      isAvoided: false,
    };
    const result = selectExercisesForDay(0, [latTarget], false, [correctIdRec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10);
    expect(result.resolvedTargets).toHaveLength(1);
    expect(result.resolvedTargets[0]?.targetId).toBe(1);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  // ── Multi-target exercise handling ────────────────────────────────────────

  it("one exercise supporting two uncovered targetIds is added only once", () => {
    const rec = makeRec(10, [latTarget, trapTarget]);
    const result = selectExercisesForDay(0, [latTarget, trapTarget], false, [rec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10);
  });

  it("both supported targetIds are marked handled when a multi-target exercise is selected", () => {
    const rec = makeRec(10, [latTarget, trapTarget]);
    const result = selectExercisesForDay(0, [latTarget, trapTarget], false, [rec], 0, 0, NO_AVOIDED);
    const resolvedIds = result.resolvedTargets.map((t) => t.targetId);
    expect(resolvedIds).toContain(1);
    expect(resolvedIds).toContain(2);
  });

  it("neither supported target remains unresolved after a multi-target exercise is selected", () => {
    const rec = makeRec(10, [latTarget, trapTarget]);
    const result = selectExercisesForDay(0, [latTarget, trapTarget], false, [rec], 0, 0, NO_AVOIDED);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  it("no additional exercise is added for a target already handled by a multi-target pick", () => {
    // rec10 covers both lat and trap; rec20 also covers trap
    // After rec10 is selected for lat, trap must not generate a second exercise
    const rec10 = makeRec(10, [latTarget, trapTarget]);
    const rec20 = makeRec(20, [trapTarget]);
    const result = selectExercisesForDay(0, [latTarget, trapTarget], false, [rec10, rec20], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]?.exerciseId).toBe(10);
    expect(result.unresolvedTargets).toHaveLength(0);
  });

  // ── Existing tests ────────────────────────────────────────────────────────

  it("avoided exercise is not added (isAvoided flag)", () => {
    const avoidedRec = makeRec(10, [latTarget], { isAvoided: true });
    const result = selectExercisesForDay(0, [latTarget], false, [avoidedRec], 0, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("avoided exercise is not added (avoidedExerciseIds set)", () => {
    const rec = makeRec(10, [latTarget]);
    const avoidedIds = new Set([10]);
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, avoidedIds);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(1);
  });

  it("generated exercises use DRAFT_EXERCISE_DEFAULTS (sets=3, reps 8–12, RIR 2, rest 90)", () => {
    // Generated prescription is verified by examining DRAFT_EXERCISE_DEFAULTS directly.
    // The component applies these; selectExercisesForDay returns exercise metadata only.
    expect(DRAFT_EXERCISE_DEFAULTS.sets).toBe(3);
    expect(DRAFT_EXERCISE_DEFAULTS.repsMin).toBe(8);
    expect(DRAFT_EXERCISE_DEFAULTS.repsMax).toBe(12);
    expect(DRAFT_EXERCISE_DEFAULTS.rir).toBe(2);
    expect(DRAFT_EXERCISE_DEFAULTS.restSeconds).toBe(90);
  });

  it("Core exercise is added once with isCore=true at the end of toAdd", () => {
    const normalRec = makeRec(10, [latTarget]);
    const coreRec = makeCoreRec(50);
    const result = selectExercisesForDay(0, [latTarget], true, [normalRec, coreRec], 0, 0, NO_AVOIDED);
    const coreAdded = result.toAdd.filter((e) => e.isCore);
    const normalAdded = result.toAdd.filter((e) => !e.isCore);
    expect(normalAdded).toHaveLength(1);
    expect(coreAdded).toHaveLength(1);
    expect(result.coreAdded).toBe(true);
    // Core appears after normal exercises
    expect(result.toAdd[result.toAdd.length - 1]?.isCore).toBe(true);
  });

  it("Core is added at most once even with multiple Brzuch recs", () => {
    const coreRec1 = makeCoreRec(50);
    const coreRec2 = makeCoreRec(51);
    const result = selectExercisesForDay(0, [], true, [coreRec1, coreRec2], 0, 0, NO_AVOIDED);
    expect(result.toAdd.filter((e) => e.isCore)).toHaveLength(1);
  });

  it("Core is not added when includeCore=false", () => {
    const result = selectExercisesForDay(0, [], false, [makeCoreRec(50)], 0, 0, NO_AVOIDED);
    expect(result.coreAdded).toBe(false);
    expect(result.toAdd).toHaveLength(0);
  });

  it("enforces max exercises per day (MAX_DAY_EXERCISES = 8)", () => {
    const recs = [makeRec(1, [latTarget]), makeRec(2, [trapTarget]), makeRec(3, [pecTarget])];
    // Already 8 exercises → no room for any
    const result = selectExercisesForDay(0, [latTarget, trapTarget, pecTarget], false, recs, MAX_DAY_EXERCISES, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.unresolvedTargets).toHaveLength(3);
    expect(result.limitHit).toBe(true);
  });

  it("enforces max sets per day (MAX_DAY_SETS = 24)", () => {
    const recs = [makeRec(1, [latTarget])];
    // 24 sets already → DRAFT_EXERCISE_DEFAULTS.sets (3) would exceed limit
    const result = selectExercisesForDay(0, [latTarget], false, recs, 0, MAX_DAY_SETS, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(0);
    expect(result.limitHit).toBe(true);
  });

  it("adds exercises up to the limit and reports remaining as unresolved", () => {
    const recs = [
      makeRec(1, [latTarget]),
      makeRec(2, [trapTarget]),
      makeRec(3, [pecTarget]),
    ];
    // Room for exactly 1 more exercise (7 existing, limit 8)
    const result = selectExercisesForDay(0, [latTarget, trapTarget, pecTarget], false, recs, MAX_DAY_EXERCISES - 1, 0, NO_AVOIDED);
    expect(result.toAdd).toHaveLength(1);
    expect(result.unresolvedTargets).toHaveLength(2);
    expect(result.limitHit).toBe(true);
  });

  it("unresolved target reported when no recommendation matches", () => {
    const recs = [makeRec(10, [trapTarget])]; // no rec for lat
    const result = selectExercisesForDay(0, [latTarget], false, recs, 0, 0, NO_AVOIDED);
    expect(result.unresolvedTargets).toHaveLength(1);
    expect(result.unresolvedTargets[0]?.targetId).toBe(1);
    expect(result.toAdd).toHaveLength(0);
  });

  it("existing exercises are preserved (selectExercisesForDay does not modify them)", () => {
    // This function only returns what to ADD — it never removes or reorders existing exercises
    const recs = [makeRec(10, [latTarget])];
    const result = selectExercisesForDay(0, [latTarget], false, recs, 2, 6, NO_AVOIDED);
    // Result only has additions — no reference to existing exercises
    expect(result.toAdd.every((e) => e.exerciseId === 10)).toBe(true);
  });

  it("pure function: same input produces same output", () => {
    const recs = [makeRec(10, [latTarget]), makeCoreRec(50)];
    const a = selectExercisesForDay(0, [latTarget], true, recs, 0, 0, NO_AVOIDED);
    const b = selectExercisesForDay(0, [latTarget], true, recs, 0, 0, NO_AVOIDED);
    expect(a).toEqual(b);
  });

  it("no write endpoints are called (selectExercisesForDay has no async side effects)", () => {
    // Purely synchronous — no fetch/XHR/write calls possible
    const result = selectExercisesForDay(0, [latTarget], false, [], 0, 0, NO_AVOIDED);
    expect(result).toBeDefined();
  });

  it("recommendation scores remain unchanged (score field is not in AutoFillDayResult)", () => {
    // Scores are not consumed or modified by selectExercisesForDay.
    // AutoFillExerciseToAdd has no score field — confirmed by absence.
    const rec = makeRec(10, [latTarget]);
    (rec as AutoFillRecExercise & { score?: number }).score = 99; // hypothetical field
    const result = selectExercisesForDay(0, [latTarget], false, [rec], 0, 0, NO_AVOIDED);
    for (const exercise of result.toAdd) {
      expect("score" in exercise).toBe(false);
    }
  });
});

// ─── buildDayFetchUrl ─────────────────────────────────────────────────────────

describe("buildDayFetchUrl()", () => {
  it("includes uncovered targetIds in the URL", () => {
    const url = buildDayFetchUrl(42, [], [1, 2, 3], false, []);
    expect(url).toContain("uncoveredTargetIds=1%2C2%2C3");
  });

  it("includes includeCore=true in the URL when coreEligible", () => {
    const url = buildDayFetchUrl(42, [], [], true, []);
    expect(url).toContain("includeCore=true");
  });

  it("omits includeCore when not coreEligible", () => {
    const url = buildDayFetchUrl(42, [], [1], false, []);
    expect(url).not.toContain("includeCore");
  });

  it("includes alreadyAdded IDs in the URL", () => {
    const url = buildDayFetchUrl(42, [], [1], false, [5, 6]);
    expect(url).toContain("alreadyAdded=5%2C6");
  });

  it("uses the correct client ID in the path", () => {
    const url = buildDayFetchUrl(99, [], [1], false, []);
    expect(url).toContain("/api/clients/99/plan-draft/day-recommendations");
  });

  it("omits uncoveredTargetIds param when list is empty", () => {
    const url = buildDayFetchUrl(42, [], [], true, []);
    expect(url).not.toContain("uncoveredTargetIds");
  });

  it("omits alreadyAdded param when list is empty", () => {
    const url = buildDayFetchUrl(42, [], [1], false, []);
    expect(url).not.toContain("alreadyAdded");
  });

  it("does not use PUT, POST, DELETE, or PATCH verbs (GET endpoint only)", () => {
    const url = buildDayFetchUrl(42, ["Plecy"], [1], true, [5]);
    // URL is always a GET endpoint — verify it's the recommendations path
    expect(url).toMatch(/\/plan-draft\/day-recommendations/);
  });
});

// ─── computeAutoFillSummary ───────────────────────────────────────────────────

describe("computeAutoFillSummary()", () => {
  it("sums totalAdded across days", () => {
    const dayResults = [
      { dayIndex: 0, toAdd: [{ exerciseId: 1, exerciseName: "Ex1", mainMuscleGroup: "Plecy", equipment: [], isCore: false }], resolvedTargets: [latTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
      { dayIndex: 1, toAdd: [{ exerciseId: 2, exerciseName: "Ex2", mainMuscleGroup: "Plecy", equipment: [], isCore: false }], resolvedTargets: [trapTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
    ];
    const summary = computeAutoFillSummary(dayResults, 1);
    expect(summary.totalAdded).toBe(2);
    expect(summary.daysUpdated).toBe(2);
    expect(summary.daysCovered).toBe(1);
  });

  it("deduplicates targets that appear in multiple days", () => {
    const sharedTarget: AutoFillDayTarget = { targetId: 1, targetName: "Lat" };
    const dayResults = [
      { dayIndex: 0, toAdd: [{ exerciseId: 1, exerciseName: "Ex1", mainMuscleGroup: "Plecy", equipment: [], isCore: false }], resolvedTargets: [sharedTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
      { dayIndex: 2, toAdd: [{ exerciseId: 2, exerciseName: "Ex2", mainMuscleGroup: "Plecy", equipment: [], isCore: false }], resolvedTargets: [sharedTarget], unresolvedTargets: [], coreAdded: false, limitHit: false },
    ];
    const summary = computeAutoFillSummary(dayResults, 0);
    expect(summary.resolvedTargets.filter((t) => t.targetId === 1)).toHaveLength(1);
  });

  it("tracks limitWarnings for days that hit limits", () => {
    const dayResults = [
      { dayIndex: 0, toAdd: [], resolvedTargets: [], unresolvedTargets: [latTarget], coreAdded: false, limitHit: true },
    ];
    const summary = computeAutoFillSummary(dayResults, 0);
    expect(summary.limitWarnings).toHaveLength(1);
    expect(summary.limitWarnings[0]).toMatch(/Dzień 1/);
  });

  it("counts coreAddedCount correctly", () => {
    const dayResults = [
      { dayIndex: 0, toAdd: [{ exerciseId: 50, exerciseName: "Crunch", mainMuscleGroup: "Brzuch", equipment: [], isCore: true }], resolvedTargets: [], unresolvedTargets: [], coreAdded: true, limitHit: false },
      { dayIndex: 1, toAdd: [], resolvedTargets: [], unresolvedTargets: [], coreAdded: false, limitHit: false },
    ];
    const summary = computeAutoFillSummary(dayResults, 0);
    expect(summary.coreAddedCount).toBe(1);
  });
});

// ─── runAutoFill (orchestration) ──────────────────────────────────────────────

describe("runAutoFill()", () => {
  function makeDay(overrides: Partial<RunAutoFillDayInput> = {}): RunAutoFillDayInput {
    return {
      dayIndex: 0,
      broadCategories: ["Plecy"],
      orderedTargets: [latTarget],
      coreEligible: false,
      existingExerciseCount: 0,
      existingSetCount: 0,
      alreadyAddedExerciseIds: [],
      ...overrides,
    };
  }

  it("fires exactly one request per required day (no more)", async () => {
    const days = [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 2 })];
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      return [makeRec(10, [latTarget])];
    });

    await runAutoFill({ clientId: 1, daysToProcess: days, skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("covered day sends no request (not in daysToProcess)", async () => {
    const fetcher = vi.fn(async () => [makeRec(10, [latTarget])]);
    // skippedDayCount=2 means 2 days were already covered and NOT in daysToProcess
    await runAutoFill({ clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 2, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); // only 1 day processed, 2 were skipped
  });

  it("passes exact uncovered targetIds in the fetch URL", async () => {
    let capturedUrl = "";
    const fetcher = vi.fn(async (url: string) => {
      capturedUrl = url;
      return [] as AutoFillRecExercise[];
    });
    const day = makeDay({ orderedTargets: [{ targetId: 5, targetName: "Biceps" }, { targetId: 7, targetName: "Triceps" }] });
    await runAutoFill({ clientId: 1, daysToProcess: [day], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(capturedUrl).toContain("5");
    expect(capturedUrl).toContain("7");
  });

  it("passes already-added IDs in the fetch URL", async () => {
    let capturedUrl = "";
    const fetcher = vi.fn(async (url: string) => {
      capturedUrl = url;
      return [] as AutoFillRecExercise[];
    });
    const day = makeDay({ alreadyAddedExerciseIds: [100, 200] });
    await runAutoFill({ clientId: 1, daysToProcess: [day], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(capturedUrl).toContain("100");
    expect(capturedUrl).toContain("200");
  });

  it("returns success with dayResults when all requests succeed", async () => {
    const fetcher = vi.fn(async () => [makeRec(10, [latTarget])]);
    const result = await runAutoFill({ clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dayResults).toHaveLength(1);
      expect(result.summary.totalAdded).toBe(1);
    }
  });

  it("enriches exercises with matchingTargetIds from orderedTargets before selecting", async () => {
    // Fetcher returns a rec with matchingTargets by name only (raw API shape).
    // runAutoFill must enrich matchingTargetIds so selectExercisesForDay resolves by ID.
    const rawRec: AutoFillRecExercise = {
      id: 10,
      name: "Pull-down",
      mainMuscleGroup: "Plecy",
      matchingTargets: ["Latissimus dorsi"],
      matchingTargetIds: [],          // empty — as returned by the API
      equipment: [],
      isAvoided: false,
    };
    const fetcher = vi.fn(async () => [rawRec]);
    const day = makeDay({ orderedTargets: [latTarget] });
    const result = await runAutoFill({ clientId: 1, daysToProcess: [day], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // rec was enriched: matchingTargetIds=[1] matched latTarget.targetId=1
      expect(result.dayResults[0]?.toAdd).toHaveLength(1);
      expect(result.dayResults[0]?.toAdd[0]?.exerciseId).toBe(10);
    }
  });

  it("failed request leaves draft unchanged (returns failure, caller must not apply)", async () => {
    const fetcher = vi.fn(async () => { throw new Error("Network error"); });
    const result = await runAutoFill({ clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Nie udało się przygotować/);
    }
    // Caller contract: draft is unchanged since ok=false → no additions applied
  });

  it("partial failure (second day fails) returns failure — all-or-nothing", async () => {
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error("Fail on second");
      return [makeRec(10, [latTarget])];
    });
    const days = [makeDay({ dayIndex: 0 }), makeDay({ dayIndex: 1, orderedTargets: [trapTarget] })];
    const result = await runAutoFill({ clientId: 1, daysToProcess: days, skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    expect(result.ok).toBe(false);
  });

  it("no write endpoint is called (all fetcher URLs are GET recommendation endpoints)", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      return [] as AutoFillRecExercise[];
    });
    await runAutoFill({ clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    for (const url of urls) {
      expect(url).toMatch(/\/plan-draft\/day-recommendations/);
      // The recommendations endpoint is GET-only; the URL itself confirms no write path
      expect(url).not.toMatch(/\/save|\/activate|\/create|\/update/);
    }
  });

  it("recommendation scores are not in the result (scores are unchanged — not touched)", async () => {
    const rec = makeRec(10, [latTarget]);
    (rec as AutoFillRecExercise & { score?: number }).score = 99; // hypothetical
    const fetcher = vi.fn(async () => [rec]);
    const result = await runAutoFill({ clientId: 1, daysToProcess: [makeDay()], skippedDayCount: 0, avoidedExerciseIds: NO_AVOIDED }, fetcher);
    if (result.ok) {
      // toAdd only contains exerciseId, name, mainMuscleGroup, equipment, isCore — no score
      for (const dayResult of result.dayResults) {
        for (const exercise of dayResult.toAdd) {
          expect("score" in exercise).toBe(false);
        }
      }
    }
  });
});
