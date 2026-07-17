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
