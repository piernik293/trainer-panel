/**
 * Plan-Draft Day Recommendations — pure selection service
 *
 * Framework-free pure functions so they can be unit-tested directly.
 * The HTTP route delegates to these functions; zero scoring logic lives here —
 * all scoring is delegated to the existing scoreExercise() function.
 *
 * Architecture:
 *   Route  →  score via existing engine  →  buildCompatibilityFilter  →  selectDayRecommendations
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
}

export interface DayRecommendationExercise {
  id: number;
  name: string;
  /** Broad categories (from the day's targets) this exercise matched. */
  matchingTargets: string[];
  equipment: string[];
  trainingLocation: string[];
  score: number;
  matchReasons: string[];
  warnReasons: string[];
  isAvoided: boolean;
}

// ─── Compatibility helpers ─────────────────────────────────────────────────────

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

  // Exclude only when NONE of the non-bodyweight requirements can be satisfied.
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

// ─── Selection & deduplication ────────────────────────────────────────────────

/**
 * From a pre-scored, pre-filtered exercise pool (sorted by score DESC), select
 * day recommendations.
 *
 * Algorithm:
 *   1. Per broadCategory: collect up to maxPerTarget exercises whose
 *      mainMuscleGroup matches (case-insensitive, primary match).
 *   2. Deduplicate across targets by exerciseId (first occurrence wins).
 *   3. For each selected exercise, accumulate ALL matching target labels:
 *      primary (mainMuscleGroup) and secondary (secondaryMuscleGroups).
 *   4. Sort: higher score first; among equal scores, non-avoided before avoided;
 *      then alphabetically by name (deterministic tie-breaker).
 *   5. Return at most maxTotal unique exercises.
 */
export function selectDayRecommendations(
  pool: ScoredAndFilteredExercise[],
  broadCategories: string[],
  maxPerTarget: number,
  maxTotal: number,
): DayRecommendationExercise[] {
  const norm = (s: string) => s.trim().toLowerCase();

  // Step 1: per-category primary match → collect IDs (in pool-score-desc order)
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

  // Step 2-3: for each selected exercise, accumulate matching target labels
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
    // Secondary muscle group matches (extra context labels)
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
      matchingTargets,
      equipment: ex.equipment,
      trainingLocation: ex.trainingLocation,
      score: ex.score,
      matchReasons: ex.matchReasons,
      warnReasons: ex.warnReasons,
      isAvoided: ex.isAvoided,
    });
  }

  // Step 4: sort — score desc, non-avoided first on ties, then name asc
  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isAvoided !== b.isAvoided) return a.isAvoided ? 1 : -1;
    return a.name.localeCompare(b.name, "pl");
  });

  // Step 5: hard limit
  return result.slice(0, maxTotal);
}
