/**
 * Validation Sprint 1 — Stages 1–6 Auto-Fill Generator
 * Runs 5 scenarios from the Stage 7 validation roadmap against the live API.
 *
 * Run: npx tsx validation-sprint1.ts
 */

import {
  selectExercisesForDay,
  extractCandidateCoefficients,
  type AutoFillDayTarget,
  type AutoFillRecExercise,
  type AutoFillWeeklyTarget,
} from "./artifacts/trainer-app/src/lib/autoFill.js";

const API = "http://localhost:8080";

// ── Target ID mapping (from DB) ───────────────────────────────────────────────
const T = {
  QUADS:      1,  // Mięsień czworogłowy uda
  GLUTES:     2,  // Mięśnie pośladkowe
  CALVES:     3,  // Mięsień trójgłowy łydki
  ADDUCTORS:  4,  // Przywodziciele
  HAMSTRINGS: 5,  // Grupa kulszowo-goleniowa
  SHOULDERS:  6,  // Mięśnie naramienne
  TRICEPS:    7,  // Mięsień trójgłowy ramienia
  CHEST:      8,  // Mięsień piersiowy większy
  LATS:       9,  // Mięsień najszerszy grzbietu
  UPPER_BACK: 10, // Mięsień czworoboczny grzbietu
  BICEPS:     11, // Mięsień dwugłowy ramienia
} as const;

/** Exact names as stored in volume_targets DB table. Used for matchingTargets → matchingTargetIds enrichment. */
const TARGET_NAMES: Record<number, string> = {
  1:  "Mięsień czworogłowy uda",
  2:  "Mięśnie pośladkowe",
  3:  "Mięsień trójgłowy łydki",
  4:  "Przywodziciele",
  5:  "Grupa kulszowo-goleniowa",
  6:  "Mięśnie naramienne",
  7:  "Mięsień trójgłowy ramienia",
  8:  "Mięsień piersiowy większy",
  9:  "Mięsień najszerszy grzbietu",
  10: "Mięsień czworoboczny grzbietu",
  11: "Mięsień dwugłowy ramienia",
};

type TargetId = typeof T[keyof typeof T];

// ── Guidelines (from DB, latest version) ─────────────────────────────────────
const GUIDELINES: Record<"beginner" | "intermediate", Record<TargetId, { ceiling: number; sessionMax: number }>> = {
  beginner: {
    1:  { ceiling: 8,  sessionMax: 4 },
    2:  { ceiling: 8,  sessionMax: 4 },
    3:  { ceiling: 4,  sessionMax: 2 },
    4:  { ceiling: 6,  sessionMax: 3 },
    5:  { ceiling: 6,  sessionMax: 3 },
    6:  { ceiling: 8,  sessionMax: 4 },
    7:  { ceiling: 4,  sessionMax: 2 },
    8:  { ceiling: 8,  sessionMax: 4 },
    9:  { ceiling: 8,  sessionMax: 4 },
    10: { ceiling: 8,  sessionMax: 4 },
    11: { ceiling: 4,  sessionMax: 2 },
  },
  intermediate: {
    1:  { ceiling: 16, sessionMax: 8 },
    2:  { ceiling: 16, sessionMax: 8 },
    3:  { ceiling: 8,  sessionMax: 4 },
    4:  { ceiling: 8,  sessionMax: 4 },
    5:  { ceiling: 12, sessionMax: 6 },
    6:  { ceiling: 16, sessionMax: 6 },
    7:  { ceiling: 6,  sessionMax: 3 },
    8:  { ceiling: 12, sessionMax: 6 },
    9:  { ceiling: 10, sessionMax: 4 },
    10: { ceiling: 12, sessionMax: 6 },
    11: { ceiling: 6,  sessionMax: 3 },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mirror of runAutoFill's step 2: convert matchingTargets (name strings from API)
 * → matchingTargetIds using the orderedTargets name→ID map.
 * The API never returns matchingTargetIds; the enrichment is client-side.
 */
function enrichWithTargetIds(
  recs: AutoFillRecExercise[],
  orderedTargetIds: TargetId[],
): AutoFillRecExercise[] {
  const nameToId = new Map(orderedTargetIds.map((tid) => [TARGET_NAMES[tid], tid]));
  return recs.map((ex) => ({
    ...ex,
    matchingTargetIds: (ex.matchingTargets ?? [])
      .map((name) => nameToId.get(name))
      .filter((id): id is number => id !== undefined),
  }));
}

async function getRecommendations(
  clientId: number,
  targetIds: TargetId[],
  includeCore = false,
  alreadyAdded: number[] = [],
): Promise<AutoFillRecExercise[]> {
  const params = new URLSearchParams();
  params.set("uncoveredTargetIds", targetIds.join(","));
  if (includeCore) params.set("includeCore", "true");
  if (alreadyAdded.length) params.set("alreadyAdded", alreadyAdded.join(","));
  const url = `${API}/api/clients/${clientId}/plan-draft/day-recommendations?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Recommendations failed ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { exercises: AutoFillRecExercise[] };
  return data.exercises ?? [];
}

async function getCoefficients(
  clientId: number,
  exercises: AutoFillRecExercise[],
  dayIndex = 0,
): Promise<Map<number, Map<number, number>>> {
  if (!exercises.length) return new Map();
  const body = {
    clientId,
    days: [{
      dayId: dayIndex + 1,
      dayName: `Trial Day ${dayIndex + 1}`,
      exercises: exercises.map((e, i) => ({
        exerciseEntryId: 100_000 + dayIndex * 1000 + i + 1,
        exerciseId: e.id,
        workingSets: 1,
      })),
    }],
  };
  const resp = await fetch(`${API}/api/plans/volume-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Preview failed ${resp.status}: ${await resp.text()}`);
  const snapshot = await resp.json();
  const allIds = new Set(exercises.map((e) => e.id));
  return extractCandidateCoefficients(snapshot, allIds);
}

function buildWeeklyTargets(
  targetIds: TargetId[],
  level: "beginner" | "intermediate",
  startingVolume: Partial<Record<TargetId, number>> = {},
  overrideCeilings: Partial<Record<TargetId, number>> = {},
): ReadonlyMap<number, AutoFillWeeklyTarget> {
  const gl = GUIDELINES[level];
  const map = new Map<number, AutoFillWeeklyTarget>();
  for (const tid of targetIds) {
    const g = gl[tid];
    const ceiling = overrideCeilings[tid] ?? g.ceiling;
    map.set(tid, {
      targetId: tid,
      effectiveSets: startingVolume[tid] ?? 0,
      weeklyPreferredCeiling: ceiling,
      hasGuideline: true,
      isManuallyOvershot: false,
    });
  }
  return map;
}

function buildDailyContext(
  targetIds: TargetId[],
  level: "beginner" | "intermediate",
  startingDaily: Partial<Record<TargetId, number>> = {},
): ReadonlyMap<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }> {
  const gl = GUIDELINES[level];
  const map = new Map<number, { effectiveSets: number; sessionMax: number; isDailyOvershot: boolean }>();
  for (const tid of targetIds) {
    const g = gl[tid];
    map.set(tid, {
      effectiveSets: startingDaily[tid] ?? 0,
      sessionMax: g.sessionMax,
      isDailyOvershot: false,
    });
  }
  return map;
}

function buildStep3(
  targetIds: TargetId[],
  level: "beginner" | "intermediate",
  daysPerWeek: number,
  overrideCeilings: Partial<Record<TargetId, number>> = {},
): ReadonlyMap<number, number> {
  const gl = GUIDELINES[level];
  const map = new Map<number, number>();
  for (const tid of targetIds) {
    const ceiling = overrideCeilings[tid] ?? gl[tid].ceiling;
    map.set(tid, ceiling / daysPerWeek);
  }
  return map;
}

/** Accumulate what selectExercisesForDay added to weekly totals using the coefficient map */
function accumulateWeekly(
  existing: Map<number, number>,
  toAdd: Array<{ exerciseId: number; sets: number }>,
  coefficients: Map<number, Map<number, number>>,
): Map<number, number> {
  const result = new Map(existing);
  for (const { exerciseId, sets } of toAdd) {
    const coeffMap = coefficients.get(exerciseId);
    if (!coeffMap) continue;
    for (const [tid, coeff] of coeffMap) {
      result.set(tid, (result.get(tid) ?? 0) + coeff * sets);
    }
  }
  return result;
}

const LINE = "─".repeat(72);

function printDayResult(
  dayLabel: string,
  result: ReturnType<typeof selectExercisesForDay>,
  coefficients: Map<number, Map<number, number>>,
  weeklyBefore: Map<number, number>,
  weeklyAfter: Map<number, number>,
  weeklyTargetMap: ReadonlyMap<number, AutoFillWeeklyTarget>,
) {
  console.log(`\n  ${dayLabel}`);
  console.log(`  ${"─".repeat(68)}`);

  if (!result.toAdd.length) {
    console.log("  (no exercises added)");
  } else {
    for (const ex of result.toAdd) {
      const coeffMap = coefficients.get(ex.exerciseId);
      const targets = coeffMap
        ? Array.from(coeffMap.entries())
            .filter(([, c]) => c > 0)
            .map(([tid, c]) => `t${tid}×${c.toFixed(2)}`)
            .join(", ")
        : "no coeffs";
      const typeTag = ex.exerciseType === "Złożone" ? "[C]" : ex.exerciseType === "Izolowane" ? "[I]" : "[?]";
      const nfTag = `NF${ex.neurologicalFatigue ?? "?"}`;
      const movTag = "";
      console.log(
        `  ${typeTag} ${nfTag} ${ex.sets}×set  ${ex.exerciseName.padEnd(44)} targets: ${targets}`,
      );
    }
  }

  // Volume progress
  console.log(`\n  Volume progress (ceiling − resolved):`);
  const resolved = new Set(result.resolvedTargets.map((r) => r.targetId));
  for (const [tid, wt] of weeklyTargetMap) {
    const before = weeklyBefore.get(tid) ?? 0;
    const after = weeklyAfter.get(tid) ?? 0;
    const added = after - before;
    const status = resolved.has(tid) ? "✓" : " ";
    const bar = `${before.toFixed(1)} → ${after.toFixed(1)} / ${wt.weeklyPreferredCeiling}`;
    console.log(`  ${status} t${tid}: ${bar.padEnd(22)} (+${added.toFixed(1)})`);
  }

  if (result.unresolvedTargets.length) {
    console.log(`\n  Unresolved targets this day:`);
    for (const u of result.unresolvedTargets) {
      console.log(`  ✗ t${u.targetId} ${u.targetName}: ${u.diagnosticReason}`);
    }
  }

  console.log(`\n  Exercises added: ${result.toAdd.length} | limitHit: ${result.limitHit} | coreAdded: ${result.coreAdded}`);
}

function printScenarioHeader(n: string, desc: string) {
  console.log(`\n\n${"═".repeat(72)}`);
  console.log(`  SCENARIO ${n}: ${desc}`);
  console.log(`${"═".repeat(72)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO B1: Gym beginner, 3×/week, full body
// Client 18: Początkujący, Siłownia
// ─────────────────────────────────────────────────────────────────────────────

async function runB1() {
  printScenarioHeader("B1", "Gym beginner — 3×/week full body (client 18, Siłownia)");

  const clientId = 18;
  const level = "beginner" as const;
  const allTargets = [T.QUADS, T.GLUTES, T.CALVES, T.ADDUCTORS, T.HAMSTRINGS,
                     T.SHOULDERS, T.TRICEPS, T.CHEST, T.LATS, T.UPPER_BACK, T.BICEPS];
  const daysPerWeek = 3;

  // Get recommendations (same pool for all days; gym location applies)
  const recs = await getRecommendations(clientId, allTargets, true);
  console.log(`\n  Recommendation pool: ${recs.length} exercises returned`);

  // Get coefficients once (coefficients are stable for empty plan)
  const coefficients = await getCoefficients(clientId, recs);
  console.log(`  Coefficient map entries: ${coefficients.size}`);

  const step3 = buildStep3(allTargets, level, daysPerWeek);
  const weeklyTargetMap = buildWeeklyTargets(allTargets, level);
  let weeklyAdded = new Map<number, number>();
  const usedInOtherDays = new Set<number>();

  // Build orderedTargets once — targetName MUST match DB volume_targets.name for enrichment
  const orderedTargets: AutoFillDayTarget[] = allTargets.map((tid) => ({
    targetId: tid,
    targetName: TARGET_NAMES[tid]!,
  }));

  // Enrich recs once: convert matchingTargets (name strings) → matchingTargetIds
  const enrichedRecs = enrichWithTargetIds(recs, allTargets);

  for (let day = 0; day < daysPerWeek; day++) {
    const weeklyBefore = new Map(weeklyAdded);
    const weeklyAddedByPreviousDays = new Map(weeklyAdded);

    const result = selectExercisesForDay(
      day,
      orderedTargets,
      /* coreEligible */ true,
      enrichedRecs,
      0, 0,
      new Set<number>(),
      buildWeeklyTargets(allTargets, level),
      buildDailyContext(allTargets, level),
      coefficients,
      weeklyAddedByPreviousDays,
      usedInOtherDays,
      step3,
    );

    weeklyAdded = accumulateWeekly(weeklyAdded, result.toAdd, coefficients);
    result.toAdd.forEach((ex) => usedInOtherDays.add(ex.exerciseId));

    printDayResult(`Day ${day + 1}`, result, coefficients, weeklyBefore, weeklyAdded, weeklyTargetMap);
  }

  // Final weekly resolution summary
  console.log(`\n  ── WEEKLY SUMMARY (B1) ──`);
  for (const [tid, wt] of weeklyTargetMap) {
    const final = weeklyAdded.get(tid) ?? 0;
    const pct = Math.round((final / wt.weeklyPreferredCeiling) * 100);
    const status = final >= wt.weeklyPreferredCeiling - 0.5 ? "RESOLVED" : "UNDER";
    console.log(`  t${String(tid).padEnd(2)} ${status.padEnd(8)} ${final.toFixed(1)}/${wt.weeklyPreferredCeiling} (${pct}%)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO I1: Upper/Lower 4×/week, gym
// Client 1: Średniozaawansowany (no location filter = all gym exercises available)
// ─────────────────────────────────────────────────────────────────────────────

async function runI1() {
  printScenarioHeader("I1", "Upper/Lower 4×/week gym — intermediate (client 1, Średniozaawansowany)");

  const clientId = 1;
  const level = "intermediate" as const;

  const upperTargets  = [T.CHEST, T.LATS, T.UPPER_BACK, T.SHOULDERS, T.TRICEPS, T.BICEPS];
  const lowerTargets  = [T.QUADS, T.GLUTES, T.CALVES, T.ADDUCTORS, T.HAMSTRINGS];
  // 2 upper + 2 lower days
  const dayPlan: Array<{ label: string; targets: TargetId[] }> = [
    { label: "Upper A", targets: upperTargets },
    { label: "Lower A", targets: lowerTargets },
    { label: "Upper B", targets: upperTargets },
    { label: "Lower B", targets: lowerTargets },
  ];
  const allTargets = [...new Set([...upperTargets, ...lowerTargets])] as TargetId[];
  const daysForTargets: Record<string, number> = {
    upper: 2, lower: 2,
  };

  // Get recommendations for upper and lower separately (different target pools)
  const recsUpper = await getRecommendations(clientId, upperTargets, false);
  const recsLower = await getRecommendations(clientId, lowerTargets, false);
  console.log(`\n  Recommendation pool: ${recsUpper.length} upper, ${recsLower.length} lower`);

  const coeffsUpper = await getCoefficients(clientId, recsUpper, 0);
  const coeffsLower = await getCoefficients(clientId, recsLower, 1);
  console.log(`  Coefficient maps: upper=${coeffsUpper.size}, lower=${coeffsLower.size}`);

  // Enrich with matchingTargetIds
  const enrichedUpper = enrichWithTargetIds(recsUpper, upperTargets);
  const enrichedLower = enrichWithTargetIds(recsLower, lowerTargets);

  const orderedUpper: AutoFillDayTarget[] = upperTargets.map((tid) => ({ targetId: tid, targetName: TARGET_NAMES[tid]! }));
  const orderedLower: AutoFillDayTarget[] = lowerTargets.map((tid) => ({ targetId: tid, targetName: TARGET_NAMES[tid]! }));

  // step3 is per-muscle-type (2 sessions for each group)
  const step3Upper = buildStep3(upperTargets, level, 2);
  const step3Lower = buildStep3(lowerTargets, level, 2);

  const weeklyTargetMap = buildWeeklyTargets(allTargets, level);
  let weeklyAdded = new Map<number, number>();
  const usedInOtherDays = new Set<number>();

  for (let dayIdx = 0; dayIdx < dayPlan.length; dayIdx++) {
    const { label, targets: dayTargets } = dayPlan[dayIdx]!;
    const isUpper = dayTargets === upperTargets;
    const enriched = isUpper ? enrichedUpper : enrichedLower;
    const ordered  = isUpper ? orderedUpper  : orderedLower;
    const coeffs   = isUpper ? coeffsUpper   : coeffsLower;
    const step3    = isUpper ? step3Upper     : step3Lower;

    const weeklyBefore = new Map(weeklyAdded);

    const result = selectExercisesForDay(
      dayIdx,
      ordered,
      false,
      enriched,
      0, 0,
      new Set<number>(),
      buildWeeklyTargets(allTargets, level),
      buildDailyContext(dayTargets, level),
      coeffs,
      new Map(weeklyAdded),
      usedInOtherDays,
      step3,
    );

    weeklyAdded = accumulateWeekly(weeklyAdded, result.toAdd, coeffs);
    result.toAdd.forEach((ex) => usedInOtherDays.add(ex.exerciseId));

    printDayResult(label, result, coeffs, weeklyBefore, weeklyAdded, weeklyTargetMap);
  }

  console.log(`\n  ── WEEKLY SUMMARY (I1) ──`);
  for (const [tid, wt] of weeklyTargetMap) {
    const final = weeklyAdded.get(tid) ?? 0;
    const pct = Math.round((final / wt.weeklyPreferredCeiling) * 100);
    const status = final >= wt.weeklyPreferredCeiling - 0.5 ? "RESOLVED" : "UNDER";
    console.log(`  t${String(tid).padEnd(2)} ${status.padEnd(8)} ${final.toFixed(1)}/${wt.weeklyPreferredCeiling} (${pct}%)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO LE1: Dumbbells only, full body
// Client 17: Początkujący, Dom, Hantle
// ─────────────────────────────────────────────────────────────────────────────

async function runLE1() {
  printScenarioHeader("LE1", "Dumbbells only — beginner full body (client 17, Dom, Hantle)");

  const clientId = 17;
  const level = "beginner" as const;
  const allTargets = [T.QUADS, T.GLUTES, T.CALVES, T.ADDUCTORS, T.HAMSTRINGS,
                     T.SHOULDERS, T.TRICEPS, T.CHEST, T.LATS, T.UPPER_BACK, T.BICEPS];
  const daysPerWeek = 3;

  const recs = await getRecommendations(clientId, allTargets, true);
  console.log(`\n  Recommendation pool: ${recs.length} exercises (location=Dom, equipment=Hantle filter applied)`);

  // Show equipment breakdown
  const equipSet = new Set<string>();
  recs.forEach((r) => (r.equipment ?? []).forEach((e) => equipSet.add(e)));
  console.log(`  Equipment in pool: ${[...equipSet].join(", ")}`);

  const coefficients = await getCoefficients(clientId, recs);
  console.log(`  Coefficient map entries: ${coefficients.size}`);

  const step3 = buildStep3(allTargets, level, daysPerWeek);
  const weeklyTargetMap = buildWeeklyTargets(allTargets, level);
  let weeklyAdded = new Map<number, number>();
  const usedInOtherDays = new Set<number>();

  const orderedTargets: AutoFillDayTarget[] = allTargets.map((tid) => ({
    targetId: tid,
    targetName: TARGET_NAMES[tid]!,
  }));
  const enrichedRecs = enrichWithTargetIds(recs, allTargets);

  for (let day = 0; day < daysPerWeek; day++) {
    const weeklyBefore = new Map(weeklyAdded);

    const result = selectExercisesForDay(
      day,
      orderedTargets,
      true,
      enrichedRecs,
      0, 0,
      new Set<number>(),
      buildWeeklyTargets(allTargets, level),
      buildDailyContext(allTargets, level),
      coefficients,
      new Map(weeklyAdded),
      usedInOtherDays,
      step3,
    );

    weeklyAdded = accumulateWeekly(weeklyAdded, result.toAdd, coefficients);
    result.toAdd.forEach((ex) => usedInOtherDays.add(ex.exerciseId));

    printDayResult(`Day ${day + 1}`, result, coefficients, weeklyBefore, weeklyAdded, weeklyTargetMap);
  }

  console.log(`\n  ── WEEKLY SUMMARY (LE1) ──`);
  for (const [tid, wt] of weeklyTargetMap) {
    const final = weeklyAdded.get(tid) ?? 0;
    const pct = Math.round((final / wt.weeklyPreferredCeiling) * 100);
    const status = final >= wt.weeklyPreferredCeiling - 0.5 ? "RESOLVED" : "UNDER";
    console.log(`  t${String(tid).padEnd(2)} ${status.padEnd(8)} ${final.toFixed(1)}/${wt.weeklyPreferredCeiling} (${pct}%)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO P1: Single priority muscle (Glutes / t2)
// Client 1: Intermediate, gym. Glutes ceiling elevated from 16 → 22.
// Justification: PRIORITY_ADJUSTMENTS (priority 1) lifts ceiling close to
// absolute max (~24). Using 22 represents a realistic priority-1 bump.
// ─────────────────────────────────────────────────────────────────────────────

async function runP1() {
  printScenarioHeader("P1", "Priority muscle: Glutes elevated ceiling 16→22 — intermediate 3×/week (client 1)");

  const clientId = 1;
  const level = "intermediate" as const;
  const allTargets = [T.QUADS, T.GLUTES, T.CALVES, T.ADDUCTORS, T.HAMSTRINGS,
                     T.SHOULDERS, T.TRICEPS, T.CHEST, T.LATS, T.UPPER_BACK, T.BICEPS];
  const daysPerWeek = 3;

  // Glutes ceiling elevated
  const overrides: Partial<Record<TargetId, number>> = { [T.GLUTES]: 22 };

  const recs = await getRecommendations(clientId, allTargets, true);
  console.log(`\n  Recommendation pool: ${recs.length} exercises`);
  console.log(`  Glutes ceiling: 16 → 22 (priority-1 elevation). Normal ceiling for all others.`);

  const coefficients = await getCoefficients(clientId, recs);

  const orderedTargets: AutoFillDayTarget[] = allTargets.map((tid) => ({
    targetId: tid,
    targetName: TARGET_NAMES[tid]!,
  }));
  const enrichedRecs = enrichWithTargetIds(recs, allTargets);

  const step3 = buildStep3(allTargets, level, daysPerWeek, overrides);
  const weeklyTargetMap = buildWeeklyTargets(allTargets, level, {}, overrides);
  let weeklyAdded = new Map<number, number>();
  const usedInOtherDays = new Set<number>();

  for (let day = 0; day < daysPerWeek; day++) {
    const weeklyBefore = new Map(weeklyAdded);

    const result = selectExercisesForDay(
      day,
      orderedTargets,
      true,
      enrichedRecs,
      0, 0,
      new Set<number>(),
      buildWeeklyTargets(allTargets, level, {}, overrides),
      buildDailyContext(allTargets, level),
      coefficients,
      new Map(weeklyAdded),
      usedInOtherDays,
      step3,
    );

    weeklyAdded = accumulateWeekly(weeklyAdded, result.toAdd, coefficients);
    result.toAdd.forEach((ex) => usedInOtherDays.add(ex.exerciseId));

    printDayResult(`Day ${day + 1}`, result, coefficients, weeklyBefore, weeklyAdded, weeklyTargetMap);
  }

  console.log(`\n  ── WEEKLY SUMMARY (P1) ──`);
  for (const [tid, wt] of weeklyTargetMap) {
    const final = weeklyAdded.get(tid) ?? 0;
    const pct = Math.round((final / wt.weeklyPreferredCeiling) * 100);
    const status = final >= wt.weeklyPreferredCeiling - 0.5 ? "RESOLVED" : "UNDER";
    const star = tid === T.GLUTES ? " ★ PRIORITY" : "";
    console.log(`  t${String(tid).padEnd(2)} ${status.padEnd(8)} ${final.toFixed(1)}/${wt.weeklyPreferredCeiling} (${pct}%)${star}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO E2: Weekly ceiling already at current volume
// Client 18: Beginner, Siłownia.
// Chest (t8) and Lats (t9) pre-filled to their full ceiling (8 effective sets).
// Quads (t1) pre-filled to ceiling − 1 (7 effective sets) to test near-full state.
// All other targets start at 0.
// ─────────────────────────────────────────────────────────────────────────────

async function runE2() {
  printScenarioHeader("E2", "Weekly ceiling already at current volume (client 18, Beginner, Siłownia)");

  const clientId = 18;
  const level = "beginner" as const;
  const allTargets = [T.QUADS, T.GLUTES, T.CALVES, T.ADDUCTORS, T.HAMSTRINGS,
                     T.SHOULDERS, T.TRICEPS, T.CHEST, T.LATS, T.UPPER_BACK, T.BICEPS];

  // Pre-filled volumes (from existing exercises in the draft)
  const preFilledWeekly: Partial<Record<TargetId, number>> = {
    [T.CHEST]: 8.0,  // = ceiling → fully resolved, no room
    [T.LATS]:  8.0,  // = ceiling → fully resolved, no room
    [T.QUADS]: 7.0,  // ceiling=8, only 1 set of headroom
  };

  const recs = await getRecommendations(clientId, allTargets, true);
  console.log(`\n  Recommendation pool: ${recs.length} exercises`);
  console.log(`  Pre-filled: Chest=8/8 (full), Lats=8/8 (full), Quads=7/8 (near-full)`);

  const coefficients = await getCoefficients(clientId, recs);

  const orderedTargets: AutoFillDayTarget[] = allTargets.map((tid) => ({
    targetId: tid,
    targetName: TARGET_NAMES[tid]!,
  }));
  const enrichedRecs = enrichWithTargetIds(recs, allTargets);

  // Single-day scenario: remaining volume after existing exercises
  const weeklyTargetMap = buildWeeklyTargets(allTargets, level, preFilledWeekly);

  // step3 with 1 remaining day (simulate: 2 prior days already ran, 1 day left)
  const weeklyAddedByPreviousDays = new Map<number, number>(
    Object.entries(preFilledWeekly).map(([k, v]) => [Number(k), v!])
  );

  // step3 per-day allocation: ceiling/3 (3-day plan assumed)
  const step3 = buildStep3(allTargets, level, 3);

  const weeklyBefore = new Map(weeklyAddedByPreviousDays);

  const result = selectExercisesForDay(
    0,
    orderedTargets,
    true,
    enrichedRecs,
    0, 0,
    new Set<number>(),
    weeklyTargetMap,
    buildDailyContext(allTargets, level),
    coefficients,
    weeklyAddedByPreviousDays,
    new Set<number>(),
    step3,
  );

  const weeklyAfter = accumulateWeekly(new Map(weeklyAddedByPreviousDays), result.toAdd, coefficients);

  printDayResult("Day (remaining after pre-fill)", result, coefficients, weeklyBefore, weeklyAfter, weeklyTargetMap);

  console.log(`\n  ── WEEKLY SUMMARY (E2) ──`);
  for (const [tid, wt] of weeklyTargetMap) {
    const final = weeklyAfter.get(tid) ?? (preFilledWeekly[tid as TargetId] ?? 0);
    const pct = Math.round((final / wt.weeklyPreferredCeiling) * 100);
    const status = final >= wt.weeklyPreferredCeiling - 0.5 ? "RESOLVED" : "UNDER";
    const pre = preFilledWeekly[tid as TargetId] !== undefined ? " (pre-filled)" : "";
    console.log(`  t${String(tid).padEnd(2)} ${status.padEnd(8)} ${final.toFixed(1)}/${wt.weeklyPreferredCeiling} (${pct}%)${pre}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(72));
  console.log("  VALIDATION SPRINT 1 — Auto-Fill Generator (Stages 1–6)");
  console.log("=".repeat(72));
  console.log(`\n  API: ${API}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  try { await runB1(); } catch (e) { console.error("B1 FAILED:", e); }
  try { await runI1(); } catch (e) { console.error("I1 FAILED:", e); }
  try { await runLE1(); } catch (e) { console.error("LE1 FAILED:", e); }
  try { await runP1(); } catch (e) { console.error("P1 FAILED:", e); }
  try { await runE2(); } catch (e) { console.error("E2 FAILED:", e); }

  console.log(`\n\n${"=".repeat(72)}`);
  console.log("  END OF VALIDATION SPRINT 1");
  console.log(`${"=".repeat(72)}\n`);
}

main().catch(console.error);
