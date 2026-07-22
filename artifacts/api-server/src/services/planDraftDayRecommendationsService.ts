/**
 * Plan-Draft Day Recommendations — pure selection service
 *
 * Framework-free pure functions so they can be unit-tested directly.
 * The HTTP route delegates to these functions; zero scoring logic lives here —
 * all scoring is delegated to the existing scoreExercise() function.
 *
 * Architecture:
 *   Route  →  score via existing engine  →  buildCompatibilityFilter
 *          →  selectDayRecommendations          (broad-category path, original)
 *          →  selectByUncoveredTargets           (exact-targetId path, Phase 4B3)
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScoredAndFilteredExercise {
  id: number;
  name: string;
  mainMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string[];
  trainingLocation: string[];
  score: number;
  matchReasons: string[];
  warnReasons: string[];
  isAvoided: boolean;
  // ── Stage 1: classification metadata pass-through ──────────────────────────
  /** Maps to DB `exercise_type`. "Złożone" | "Izolowane" or null. */
  exerciseType?: string | null;
  /** Maps to DB `neurological_fatigue`. Integer 1–5 or null. */
  neurologicalFatigue?: number | null;
  /** Maps to DB `learning_difficulty`. Integer 1–5 or null. */
  learningDifficulty?: number | null;
  /** Maps to DB `exercise_priority`. Polish priority string or null. */
  exercisePriority?: string | null;
  /** Maps to DB `movement_pattern`. Extension point for Stage 2+. */
  movementPattern?: string | null;
  /** Stage 4: canonical movement category key resolved from movement_pattern + movement_category. */
  movementCategoryKey?: string | null;
  /**
   * Sub-target bias weights (Phase 1: Chest / Back / Shoulders).
   * Used by selectExercise to prefer exercises that improve under-covered sub-targets.
   * null = no bias data; exercise competes on base score only (safe fallback).
   */
  subTargetBiases?: SubTargetBiases | null;
  /**
   * True when the DB marks this exercise as confirmed suitable for
   * "Brak aktywności fizycznej" clients (no-activity / start-adaptive segment).
   *
   * Used by the goal-profile regression penalty in ExerciseSelectionEngineV0:
   * for intermediate/advanced clients with hypertrophy or strength goals,
   * exercises flagged here are sorted after non-flagged candidates so
   * beginner-only regression movements don't default-win for experienced users.
   */
  suitableForNoActivity?: boolean | null;
}

export interface DayRecommendationExercise {
  id: number;
  name: string;
  /** The exercise's own mainMuscleGroup from the DB. */
  mainMuscleGroup: string;
  /** Target labels matched (broad categories or uncovered target names). */
  matchingTargets: string[];
  equipment: string[];
  trainingLocation: string[];
  score: number;
  matchReasons: string[];
  warnReasons: string[];
  isAvoided: boolean;
  // ── Stage 1: classification metadata pass-through ──────────────────────────
  /** Maps to DB `exercise_type`. "Złożone" | "Izolowane" or null. */
  exerciseType?: string | null;
  /** Maps to DB `neurological_fatigue`. Integer 1–5 or null. */
  neurologicalFatigue?: number | null;
  /** Maps to DB `learning_difficulty`. Integer 1–5 or null. */
  learningDifficulty?: number | null;
  /** Maps to DB `exercise_priority`. Polish priority string or null. */
  exercisePriority?: string | null;
  /** Maps to DB `movement_pattern`. Extension point for Stage 2+. */
  movementPattern?: string | null;
  /** Stage 4: canonical movement category key resolved from movement_pattern + movement_category. */
  movementCategoryKey?: string | null;
  /** Stage 6: secondary muscle groups for session fatigue tie-breaking. */
  secondaryMuscleGroups?: string[] | null;
}

// ─── Sub-target bias system (Phase 1: Chest / Back / Shoulders) ──────────────
//
// Weekly targets stay at the main muscle-group level (Klatka / Plecy / Barki).
// Sub-targets are a QUALITY layer for exercise selection only — not a new volume system.
//
// Usage:
//   1. Create coverage with zeroSubTargetCoverage().
//   2. Call accumulateSubTargetCoverage() after each committed exercise.
//   3. Pass coverage to selectExercise() so the pool is re-sorted to prefer
//      exercises that improve under-covered sub-targets.
//
// Fallback: exercises with no subTargetBiases get biasBonus = 0 and compete
// on base score alone — identical to the pre-bias behaviour.

export type SubTargetKey =
  | "upper_chest" | "mid_chest" | "lower_chest"
  | "lats" | "upper_back"
  | "front_delt" | "lateral_delt" | "rear_delt";

export type SubTargetBiases = Partial<Record<SubTargetKey, number>>;
export type SubTargetCoverage = Record<SubTargetKey, number>;

/** Create a fresh zeroed coverage accumulator. */
export function zeroSubTargetCoverage(): SubTargetCoverage {
  return {
    upper_chest: 0, mid_chest: 0, lower_chest: 0,
    lats: 0, upper_back: 0,
    front_delt: 0, lateral_delt: 0, rear_delt: 0,
  };
}

/**
 * Update the running sub-target coverage after an exercise is committed.
 * Mutates `coverage` in place.
 *
 * @param coverage - Accumulated coverage state for the current session.
 * @param biases   - The committed exercise's bias weights (may be null).
 * @param sets     - Number of working sets assigned to the exercise.
 */
export function accumulateSubTargetCoverage(
  coverage: SubTargetCoverage,
  biases: SubTargetBiases | null | undefined,
  sets: number,
): void {
  if (!biases) return;
  for (const rawKey of Object.keys(biases)) {
    const key = rawKey as SubTargetKey;
    const weight = biases[key];
    if (weight != null && weight > 0) {
      coverage[key] = (coverage[key] ?? 0) + sets * weight;
    }
  }
}

/**
 * Compute a bias bonus (0–10 range) for a candidate exercise.
 *
 * Higher bonus = more of the exercise's bias weight lands on the most
 * under-covered sub-targets relative to the current session coverage.
 *
 * Returns 0 when `biases` is absent — exercise competes on base score only
 * (safe fallback, identical to pre-bias behaviour).
 *
 * Formula:
 *   For each sub-target key k with bias[k] > 0:
 *     deficit = 1 − (coverage[k] / maxCoverage)   ∈ [0, 1]
 *     bonus  += bias[k] × deficit
 *   Scale to 0–10 (bias weights sum to ~1, deficit ≤ 1 → raw ≤ 1 → ×10).
 */
export function computeBiasBonus(
  biases: SubTargetBiases | null | undefined,
  coverage: SubTargetCoverage,
): number {
  if (!biases) return 0;
  const keys = (Object.keys(biases) as SubTargetKey[]).filter((k) => (biases[k] ?? 0) > 0);
  if (keys.length === 0) return 0;

  const allValues = Object.values(coverage) as number[];
  const maxCoverage = Math.max(...allValues, 1); // floor at 1 to avoid division by zero

  let bonus = 0;
  for (const key of keys) {
    const weight = biases[key] ?? 0;
    const deficit = 1 - coverage[key] / maxCoverage; // 0 = saturated → 1 = untouched
    bonus += weight * deficit;
  }
  return bonus * 10; // scale: max ~10 pts on a 0–100 base score
}

// ─── Phase 4B3: Uncovered-target types ───────────────────────────────────────

/**
 * One uncovered volume target for the current workout day.
 * Must be pre-sorted by the caller in priority order before being passed here:
 *   zero-actual first → highest remaining-% first → stable allocationOrder.
 */
export interface UncoveredTargetNeed {
  targetId: number;
  targetName: string;
  /** Original index from the day's targetAllocations (stable tie-breaker). */
  allocationOrder: number;
}

/**
 * A scored pool entry enriched with the set of volume targetIds that this
 * exercise contributes to (coefficient > 0, validated by the route before
 * it reaches this function).
 */
export interface ExerciseWithCoveredTargets extends ScoredAndFilteredExercise {
  coveredTargetIds: ReadonlySet<number>;
}

// ─── Session deduplication state ─────────────────────────────────────────────
//
// Usage pattern — create ONCE per session before calling selectExercise:
//
//   const usedExercises = new Set<string>();
//
// After each exercise is committed to the session:
//
//   usedExercises.add(String(chosen.id));
//   console.log("USED_EXERCISES:", [...usedExercises]);
//
// Never recreate this set inside a loop.  It must persist across all slot
// selections so that every slot sees the full history of committed exercises.

// ─── Day-type muscle group mapping ───────────────────────────────────────────

export type DayType = "upper" | "lower";

/**
 * Canonical (lower-case) Polish mainMuscleGroup values allowed per day type.
 * Used by selectExercise to enforce day-type hard boundaries server-side.
 *
 * Selection flow:
 *   UPPER DAY:  1. chest  2. back  3. shoulders  4. arms
 *   LOWER DAY:  1. squat pattern  2. hinge pattern  3. accessory legs  4. calves/core
 */
export const DAY_TYPE_MUSCLE_GROUPS: Record<DayType, readonly string[]> = {
  upper: [
    "klatka piersiowa",
    "plecy",
    "barki",
    "biceps",
    "triceps",
    "przedramiona",
  ],
  lower: [
    "mięśnie czworogłowe uda",
    "mięśnie dwugłowe uda",
    "pośladki",
    "łydki",
    "przywodziciele",
    "mięśnie prostowniki grzbietu",
  ],
};

// ─── Hard filter: exercises ineligible as main-slot selections ────────────────

/**
 * Partial lower-case name fragments that are never permitted as main selections.
 * Catches movement-skills and rehabilitation exercises that score well on other
 * dimensions but are inappropriate as primary training stimuli.
 */
const HARD_FILTER_NAME_FRAGMENTS = [
  "bear crawl",
  "człapak",   // Polish: bear crawl variant
  "superman",
  "żabka",     // frog jump / bodyweight drill
  "pająk",     // spider crawl
  "inchworm",
] as const;

function isHardFiltered(exerciseName: string): boolean {
  const lower = exerciseName.trim().toLowerCase();
  return HARD_FILTER_NAME_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

// ─── selectExercise ───────────────────────────────────────────────────────────

export interface SelectExerciseParams {
  /** Pre-scored exercise pool (already equipment- and location-filtered by route). */
  exercises: ScoredAndFilteredExercise[];
  /** "upper" | "lower" | null.  When null the day-type filter is skipped. */
  dayType: DayType | null;
  /**
   * Shared per-session deduplication state.  Create once before the first slot
   * selection and pass the same instance to every subsequent call.
   * The caller is responsible for adding committed IDs after selection.
   */
  usedExercises: Set<string>;
  /** Raw survey equipment string (comma-separated).  Re-applied as a safety net. */
  clientEquipment: string | null | undefined;
  /**
   * When true, exercises whose mainMuscleGroup is "Brzuch" (Core) are kept even
   * if they do not match the dayType allowlist.  Set to true when the caller
   * activated the includeCore / coreEligible flag for this session slot.
   * Default: false.
   */
  keepCoreGroup?: boolean;
  /**
   * Running sub-target coverage state for the current session.
   * When provided, the returned pool is re-sorted using biasBonus as a secondary
   * criterion (after base score). Exercises without subTargetBiases are unaffected.
   * When absent, falls back to pure base-score ordering (pre-bias behaviour).
   */
  subTargetCoverage?: SubTargetCoverage;
}

/**
 * Hard-filter the exercise pool for a single session slot selection.
 *
 * Removes:
 *   1. Exercises already used this session (usedExercises set — deduplication).
 *   2. Exercises whose mainMuscleGroup does not match the day type.
 *   3. Equipment-incompatible exercises (safety-net re-check).
 *   4. Blocklisted exercise names (bear crawl, superman, etc.).
 *
 * After the caller selects from the returned pool it MUST:
 *   usedExercises.add(String(chosen.id));
 *   console.log("USED_EXERCISES:", [...usedExercises]);
 *
 * Call multiple times — once per session slot — passing the same usedExercises
 * instance so deduplication accumulates across the whole session:
 *
 *   // Build an Upper session
 *   const usedExercises = new Set<string>();
 *   const chestPool     = selectExercise({ exercises: pool, dayType: "upper", usedExercises, clientEquipment });
 *   const chestPick     = chestPool.find(ex => ex.mainMuscleGroup === "Klatka piersiowa");
 *   if (chestPick) { usedExercises.add(String(chestPick.id)); console.log("USED_EXERCISES:", [...usedExercises]); }
 *
 *   const backPool      = selectExercise({ exercises: pool, dayType: "upper", usedExercises, clientEquipment });
 *   const backPick      = backPool.find(ex => ex.mainMuscleGroup === "Plecy");
 *   if (backPick)  { usedExercises.add(String(backPick.id));  console.log("USED_EXERCISES:", [...usedExercises]); }
 *   // ...shoulders, arms slots follow the same pattern
 */
export function selectExercise({
  exercises,
  dayType,
  usedExercises,
  clientEquipment,
  keepCoreGroup = false,
  subTargetCoverage,
}: SelectExerciseParams): ScoredAndFilteredExercise[] {
  const norm = (s: string) => s.trim().toLowerCase();

  // Build canonical allowlist once per call
  const allowed: Set<string> | null =
    dayType !== null
      ? new Set(DAY_TYPE_MUSCLE_GROUPS[dayType].map(norm))
      : null;

  const filtered = exercises.filter((ex) => {
    // 1. Deduplication — reject exercises already committed this session
    if (usedExercises.has(String(ex.id))) return false;

    // 2. Day-type muscle group boundary
    if (allowed !== null) {
      const muscleGroup = norm(ex.mainMuscleGroup);
      const isCoreKept  = keepCoreGroup && muscleGroup === "brzuch";
      if (!allowed.has(muscleGroup) && !isCoreKept) return false;
    }

    // 3. Equipment safety-net (route already filters, but selectExercise is also
    //    called standalone so the check must be self-contained)
    if (!isEquipmentCompatible(ex.equipment, clientEquipment)) return false;

    // 4. Hard name blocklist — never select these as main-slot exercises
    if (isHardFiltered(ex.name)) return false;

    return true;
  });

  // 5. Sub-target bias re-sort — secondary scoring layer.
  //    When coverage state is provided, promote exercises that improve the most
  //    under-covered sub-targets for the current session.
  //    Exercises with no subTargetBiases receive biasBonus = 0 and keep their
  //    relative order from the base-score sort (safe fallback).
  if (subTargetCoverage) {
    filtered.sort((a, b) => {
      const aTotal = a.score + computeBiasBonus(a.subTargetBiases, subTargetCoverage);
      const bTotal = b.score + computeBiasBonus(b.subTargetBiases, subTargetCoverage);
      if (Math.abs(bTotal - aTotal) > 0.001) return bTotal - aTotal;
      return a.name.localeCompare(b.name, "pl");
    });
  }

  return filtered;
}

// ─── Compatibility helpers ────────────────────────────────────────────────────

const LOCATION_CANONICAL_MAP: Record<string, string> = {
  "siłownia plenerowa": "plener",
};

function canonicalLocation(s: string): string {
  const n = s.trim().toLowerCase();
  return LOCATION_CANONICAL_MAP[n] ?? n;
}

const BODYWEIGHT_EQUIPMENT = new Set(["brak sprzętu", "masa własnego ciała"]);

function parseList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function equipmentMatchLocal(required: string, available: string): boolean {
  const r = required.trim().toLowerCase();
  const a = available.trim().toLowerCase();
  return r.includes(a) || a.includes(r);
}

/**
 * Returns true if the exercise is compatible with the client's training location.
 * When no location data is available, returns true (no filter applied — caller
 * should surface the "missing data" warning).
 */
export function isLocationCompatible(
  exerciseLocations: string[],
  surveyLocation: string | null | undefined,
): boolean {
  const clientLoc = surveyLocation?.trim();
  if (!clientLoc) return true; // no data → do not filter
  if (exerciseLocations.length === 0) return true; // no restriction on exercise
  return exerciseLocations.some(
    (l) => canonicalLocation(l) === canonicalLocation(clientLoc),
  );
}

/**
 * Returns true if the exercise is compatible with the client's available equipment.
 *
 * Rules:
 * - No required equipment → always compatible.
 * - Bodyweight-only exercise → always compatible.
 * - No client equipment data → compatible (cannot filter; caller should warn).
 * - Otherwise: compatible only when at least one required (non-bodyweight) item matches.
 */
export function isEquipmentCompatible(
  exerciseEquipment: string[],
  surveyEquipment: string | null | undefined,
): boolean {
  if (exerciseEquipment.length === 0) return true;

  if (exerciseEquipment.every((e) => BODYWEIGHT_EQUIPMENT.has(e.trim().toLowerCase()))) {
    return true; // bodyweight exercise
  }

  const clientEquipment = parseList(surveyEquipment);
  if (clientEquipment.length === 0) return true; // no client equipment data → do not filter

  const nonBodyweight = exerciseEquipment.filter(
    (e) => !BODYWEIGHT_EQUIPMENT.has(e.trim().toLowerCase()),
  );
  if (nonBodyweight.length === 0) return true;

  return nonBodyweight.some((req) =>
    clientEquipment.some((ce) => equipmentMatchLocal(req, ce)),
  );
}

/**
 * Returns a filter function that hard-excludes:
 *   - exercises already added to the day (by exerciseId),
 *   - location-incompatible exercises (when location data available),
 *   - equipment-incompatible exercises (when equipment data available).
 *
 * The filter function returns `true` to keep an exercise, `false` to exclude it.
 */
export function buildCompatibilityFilter(
  surveyLocation: string | null | undefined,
  surveyEquipment: string | null | undefined,
  alreadyAddedIds: ReadonlySet<number>,
): (ex: { id: number; trainingLocation: string[]; equipment: string[] }) => boolean {
  return (ex) => {
    if (alreadyAddedIds.has(ex.id)) return false;
    if (!isLocationCompatible(ex.trainingLocation, surveyLocation)) return false;
    if (!isEquipmentCompatible(ex.equipment, surveyEquipment)) return false;
    return true;
  };
}

// ─── Broad-category selection (original path) ─────────────────────────────────

/**
 * From a pre-scored, pre-filtered exercise pool (sorted by score DESC), select
 * day recommendations by matching exercises to broad muscle-group categories.
 *
 * Algorithm:
 *   1. Per broadCategory: collect up to maxPerTarget exercises whose
 *      mainMuscleGroup matches (case-insensitive, primary match).
 *   2. Deduplicate across targets by exerciseId (first occurrence wins).
 *   3. Accumulate ALL matching target labels per exercise (primary + secondary).
 *   4. Sort: score DESC, non-avoided first, name ASC.
 *   5. Return at most maxTotal unique exercises.
 */
export function selectDayRecommendations(
  pool: ScoredAndFilteredExercise[],
  broadCategories: string[],
  maxPerTarget: number,
  maxTotal: number,
): DayRecommendationExercise[] {
  const norm = (s: string) => s.trim().toLowerCase();

  const selectedIds = new Set<number>();
  for (const category of broadCategories) {
    const normCat = norm(category);
    let taken = 0;
    for (const ex of pool) {
      if (taken >= maxPerTarget) break;
      if (norm(ex.mainMuscleGroup) !== normCat) continue;
      if (!selectedIds.has(ex.id)) {
        selectedIds.add(ex.id);
        taken++;
      }
    }
  }

  if (selectedIds.size === 0) return [];

  const result: DayRecommendationExercise[] = [];
  for (const ex of pool) {
    if (!selectedIds.has(ex.id)) continue;

    const matchingTargets: string[] = [];
    for (const category of broadCategories) {
      const normCat = norm(category);
      if (norm(ex.mainMuscleGroup) === normCat) {
        matchingTargets.push(category);
      }
    }
    for (const category of broadCategories) {
      if (matchingTargets.includes(category)) continue;
      const normCat = norm(category);
      if (ex.secondaryMuscleGroups.some((sg) => norm(sg) === normCat)) {
        matchingTargets.push(category);
      }
    }

    result.push({
      id: ex.id,
      name: ex.name,
      mainMuscleGroup: ex.mainMuscleGroup,
      matchingTargets,
      equipment: ex.equipment,
      trainingLocation: ex.trainingLocation,
      score: ex.score,
      matchReasons: ex.matchReasons,
      warnReasons: ex.warnReasons,
      isAvoided: ex.isAvoided,
      // Stage 1: classification metadata pass-through
      exerciseType: ex.exerciseType ?? null,
      neurologicalFatigue: ex.neurologicalFatigue ?? null,
      learningDifficulty: ex.learningDifficulty ?? null,
      exercisePriority: ex.exercisePriority ?? null,
      movementPattern: ex.movementPattern ?? null,
      // Stage 4: canonical movement category key
      movementCategoryKey: ex.movementCategoryKey ?? null,
      // Stage 6: secondary muscle groups for session fatigue tie-breaking
      secondaryMuscleGroups: ex.secondaryMuscleGroups ?? null,
    });
  }

  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isAvoided !== b.isAvoided) return a.isAvoided ? 1 : -1;
    return a.name.localeCompare(b.name, "pl");
  });

  return result.slice(0, maxTotal);
}

// ─── Uncovered-target selection (Phase 4B3 path) ──────────────────────────────

/**
 * Select day recommendations for uncovered volume targets using exact targetId
 * matching instead of broad mainMuscleGroup category matching.
 *
 * Algorithm:
 *   1. For each uncovered need (pre-sorted: zero-actual first → highest
 *      remaining-% first → stable allocationOrder): pick up to maxPerTarget
 *      exercises whose coveredTargetIds.has(need.targetId).
 *   2. For Core (includeCore=true): pick up to maxPerTarget exercises whose
 *      mainMuscleGroup === "Brzuch".
 *   3. Deduplicate by exerciseId (first occurrence wins per target).
 *   4. For each selected exercise, accumulate ALL uncovered target names it
 *      covers — including from needs it was not the primary selection for.
 *   5. Sort: score DESC, non-avoided first, name ASC.
 *   6. Return at most maxTotal unique exercises.
 *
 * Does NOT modify exercise scores. Pool must be pre-sorted by score DESC.
 */
export function selectByUncoveredTargets(
  pool: ExerciseWithCoveredTargets[],
  orderedNeeds: UncoveredTargetNeed[],
  includeCore: boolean,
  maxPerTarget: number,
  maxTotal: number,
): DayRecommendationExercise[] {
  // Phase 1 — selection with per-target cap
  const selectedIds = new Set<number>();

  for (const need of orderedNeeds) {
    let taken = 0;
    for (const ex of pool) {
      if (taken >= maxPerTarget) break;
      if (selectedIds.has(ex.id)) continue;
      if (ex.coveredTargetIds.has(need.targetId)) {
        selectedIds.add(ex.id);
        taken++;
      }
    }
  }

  if (includeCore) {
    let taken = 0;
    for (const ex of pool) {
      if (taken >= maxPerTarget) break;
      if (selectedIds.has(ex.id)) continue;
      if (ex.mainMuscleGroup === "Brzuch") {
        selectedIds.add(ex.id);
        taken++;
      }
    }
  }

  if (selectedIds.size === 0) return [];

  // Phase 2 — label accumulation: every selected exercise gets all uncovered
  // target names it supports (not only the one it was first selected for).
  const labelMap = new Map<number, string[]>();

  for (const need of orderedNeeds) {
    for (const ex of pool) {
      if (!selectedIds.has(ex.id)) continue;
      if (!ex.coveredTargetIds.has(need.targetId)) continue;
      if (!labelMap.has(ex.id)) labelMap.set(ex.id, []);
      const labels = labelMap.get(ex.id)!;
      if (!labels.includes(need.targetName)) labels.push(need.targetName);
    }
  }

  if (includeCore) {
    for (const ex of pool) {
      if (!selectedIds.has(ex.id)) continue;
      if (ex.mainMuscleGroup !== "Brzuch") continue;
      if (!labelMap.has(ex.id)) labelMap.set(ex.id, []);
      const labels = labelMap.get(ex.id)!;
      if (!labels.includes("Core / brzuch")) labels.push("Core / brzuch");
    }
  }

  // Phase 3 — build result in pool order (score-desc preserved for stable iteration)
  const result: DayRecommendationExercise[] = [];
  for (const ex of pool) {
    if (!selectedIds.has(ex.id)) continue;
    result.push({
      id: ex.id,
      name: ex.name,
      mainMuscleGroup: ex.mainMuscleGroup,
      matchingTargets: labelMap.get(ex.id) ?? [],
      equipment: ex.equipment,
      trainingLocation: ex.trainingLocation,
      score: ex.score,
      matchReasons: ex.matchReasons,
      warnReasons: ex.warnReasons,
      isAvoided: ex.isAvoided,
      // Stage 1: classification metadata pass-through
      exerciseType: ex.exerciseType ?? null,
      neurologicalFatigue: ex.neurologicalFatigue ?? null,
      learningDifficulty: ex.learningDifficulty ?? null,
      exercisePriority: ex.exercisePriority ?? null,
      movementPattern: ex.movementPattern ?? null,
      // Stage 4: canonical movement category key
      movementCategoryKey: ex.movementCategoryKey ?? null,
      // Stage 6: secondary muscle groups for session fatigue tie-breaking
      secondaryMuscleGroups: ex.secondaryMuscleGroups ?? null,
    });
  }

  // Phase 4 — sort: score DESC, non-avoided first, name ASC
  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isAvoided !== b.isAvoided) return a.isAvoided ? 1 : -1;
    return a.name.localeCompare(b.name, "pl");
  });

  return result.slice(0, maxTotal);
}
