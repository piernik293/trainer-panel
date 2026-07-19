/**
 * ExerciseSelectionEngineV0 — Deterministic slot-based exercise selector.
 *
 * Design philosophy:
 *   - One clear slot template per session type (Push / Pull / Legs / Upper / Lower)
 *   - Hard rules only — no scoring, no sub-target bias, no clever re-ranking
 *   - Deterministic: stable sort by exercisePriority → learningDifficulty → id
 *   - Fail-safe: missing required metadata → skip the exercise (never guess)
 *   - Minimum session guard: returns blocking failure if < 4 exercises selected
 *
 * Runs BESIDE the original selector behind the `useV0Selector=true` query flag.
 * The original selector path is completely unchanged.
 *
 * Enable via API query params:
 *   useV0Selector=true&v0SessionType=<push|pull|legs|upper|lower>
 */

import type {
  ScoredAndFilteredExercise,
  DayRecommendationExercise,
} from "./planDraftDayRecommendationsService";

// ─── Public types ─────────────────────────────────────────────────────────────

export type V0SessionType = "push" | "pull" | "legs" | "upper" | "lower";

export interface V0Result {
  exercises: DayRecommendationExercise[];
  /** true when the minimum structural requirements (≥ 4 exercises) are met. */
  valid: boolean;
  /** Blocking failure message when valid = false. */
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Session types with a minimum of 4 exercises required for a valid session. */
const MIN_EXERCISES = 4;

/** Name fragments that disqualify an exercise from any structural slot. */
const HARD_FILTER_FRAGMENTS = [
  "bear crawl",
  "człapak",
  "superman",
  "żabka",
  "pająk",
  "inchworm",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase();

function isBlocklisted(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return HARD_FILTER_FRAGMENTS.some((f) => lower.includes(f));
}

/** True if exercise mainMuscleGroup matches any of the provided groups (case-insensitive). */
function muscle(ex: ScoredAndFilteredExercise, ...groups: string[]): boolean {
  return groups.some((g) => norm(ex.mainMuscleGroup) === norm(g));
}

/** True if exerciseType is "Złożone". Fails safely when exerciseType is null. */
function compound(ex: ScoredAndFilteredExercise): boolean {
  return ex.exerciseType != null && norm(ex.exerciseType) === "złożone";
}

/** True if movementPattern matches any of the provided patterns. Fails safely when null. */
function pattern(ex: ScoredAndFilteredExercise, ...patterns: string[]): boolean {
  return (
    ex.movementPattern != null &&
    patterns.some((p) => norm(ex.movementPattern!) === norm(p))
  );
}

// ─── Deterministic candidate ordering ────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = {
  "Bardzo wysoki": 0,
  Wysoki: 1,
  Średni: 2,
  Niski: 3,
};

function priorityRank(ex: ScoredAndFilteredExercise): number {
  return ex.exercisePriority != null
    ? (PRIORITY_RANK[ex.exercisePriority] ?? 4)
    : 4;
}

/**
 * Sort candidates deterministically (no score, no bias):
 *   1. exercisePriority high → low  ("Bardzo wysoki" first)
 *   2. learningDifficulty ascending (simpler first)
 *   3. id ascending (stable numeric tie-breaker)
 */
function sortDeterministic(
  candidates: ScoredAndFilteredExercise[],
): ScoredAndFilteredExercise[] {
  return [...candidates].sort((a, b) => {
    const pa = priorityRank(a),
      pb = priorityRank(b);
    if (pa !== pb) return pa - pb;
    const la = a.learningDifficulty ?? 99,
      lb = b.learningDifficulty ?? 99;
    if (la !== lb) return la - lb;
    return a.id - b.id;
  });
}

// ─── Core engine ──────────────────────────────────────────────────────────────

/**
 * Run ExerciseSelectionEngineV0 for a single session.
 *
 * @param pool            Pre-scored pool already filtered for equipment + location
 *                        by the route. V0 does NOT re-apply equipment/location filters.
 * @param sessionType     "push" | "pull" | "legs" | "upper" | "lower"
 * @param usedExerciseIds Per-session deduplication state. Mutated in place.
 *                        Pre-populate with alreadyAdded exercise IDs before calling.
 */
export function runExerciseSelectionEngineV0(
  pool: ScoredAndFilteredExercise[],
  sessionType: V0SessionType,
  usedExerciseIds: Set<string>,
): V0Result {
  // ── Step 1: Global hard filter ────────────────────────────────────────────
  // Exclude avoided exercises and blocklisted names from the entire session.
  const eligible = pool.filter(
    (ex) => !ex.isAvoided && !isBlocklisted(ex.name),
  );

  // ── Step 2: Selection state ───────────────────────────────────────────────
  const results: Array<{ ex: ScoredAndFilteredExercise; slotName: string }> =
    [];

  /**
   * Attempt to pick one exercise for a named slot.
   *
   * Applies:
   *   1. Deduplication (usedExerciseIds)
   *   2. Global eligibility (already applied to `eligible`)
   *   3. Slot-specific filter predicate
   *   4. Deterministic sort (priority → difficulty → id)
   *   5. Select candidates[0]
   *
   * Mutates usedExerciseIds on success.
   * Emits structured debug logs per spec.
   */
  function pick(
    slotName: string,
    required: boolean,
    filter: (ex: ScoredAndFilteredExercise) => boolean,
  ): ScoredAndFilteredExercise | null {
    const candidates = sortDeterministic(
      eligible.filter((ex) => !usedExerciseIds.has(String(ex.id)) && filter(ex)),
    );

    console.log(
      `SESSION_TYPE: ${sessionType} | SLOT: ${slotName} | CANDIDATE_COUNT: ${candidates.length}`,
    );

    if (candidates.length === 0) {
      console.log(`NO_VALID_EXERCISE_FOR_SLOT: ${slotName}`);
      if (required) {
        console.log(`V0_REQUIRED_SLOT_FAILED: ${slotName}`);
      }
      return null;
    }

    const selected = candidates[0];
    usedExerciseIds.add(String(selected.id));
    results.push({ ex: selected, slotName });

    console.log(`SELECTED_EXERCISE: ${selected.id} ${selected.name}`);
    console.log(`USED_EXERCISE_IDS: [${[...usedExerciseIds].join(", ")}]`);

    return selected;
  }

  // ── Step 3: Slot execution by session type ────────────────────────────────

  switch (sessionType) {
    // ── PUSH ─────────────────────────────────────────────────────────────────
    // 1. Chest compound   2. Second push compound   3. Shoulder accessory
    // 4. Triceps          5. (opt) Chest/Triceps accessory  6. (opt) Core
    case "push": {
      pick(
        "Chest compound",
        true,
        (ex) =>
          muscle(ex, "Klatka piersiowa") &&
          compound(ex) &&
          pattern(ex, "Pchanie poziome"),
      );
      pick(
        "Second push compound",
        true,
        (ex) =>
          muscle(ex, "Klatka piersiowa", "Barki") &&
          compound(ex) &&
          pattern(ex, "Pchanie poziome", "Pchanie pionowe"),
      );
      pick("Shoulder accessory", true, (ex) => muscle(ex, "Barki"));
      pick("Triceps isolation", true, (ex) => muscle(ex, "Triceps"));
      pick(
        "Chest or triceps accessory",
        false,
        (ex) => muscle(ex, "Klatka piersiowa", "Triceps"),
      );
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── PULL ─────────────────────────────────────────────────────────────────
    // 1. Pull compound   2. Complementary pull compound (prefer opposite pattern)
    // 3. Rear delt / upper back   4. Biceps
    // 5. (opt) Second biceps / rear delt   6. (opt) Core
    case "pull": {
      // Slot 1: any pull compound
      const s1 = pick(
        "Pull compound",
        true,
        (ex) =>
          muscle(ex, "Plecy") &&
          compound(ex) &&
          pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
      );

      // Slot 2: prefer the complementary movement pattern to slot 1.
      // If slot 1 was vertical pull, prefer horizontal rows — and vice versa.
      // Falls back to any pull compound if the complementary pattern has no candidates.
      const s1Pattern = s1?.movementPattern ?? null;
      const complementary =
        s1Pattern != null && norm(s1Pattern) === "przyciąganie pionowe"
          ? "Przyciąganie poziome"
          : "Przyciąganie pionowe";

      const s2 =
        pick(
          "Complementary pull compound",
          false, // not required — fallback below handles the required logging
          (ex) =>
            muscle(ex, "Plecy") && compound(ex) && pattern(ex, complementary),
        ) ??
        pick(
          "Second pull compound",
          true, // required — logs failure if no candidates
          (ex) =>
            muscle(ex, "Plecy") &&
            compound(ex) &&
            pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
        );
      void s2; // result not needed beyond dedup

      // Slot 3: rear delt / upper back accessory
      pick(
        "Rear delt or upper back",
        true,
        (ex) =>
          // Barki exercises with rear-delt or horizontal-pull patterns
          (muscle(ex, "Barki") &&
            pattern(ex, "Odwodzenie", "Przyciąganie poziome")) ||
          // OR back isolation exercises (straight-arm pulldown, etc.)
          (muscle(ex, "Plecy") &&
            ex.exerciseType != null &&
            norm(ex.exerciseType) === "izolowane"),
      );

      pick("Biceps", true, (ex) => muscle(ex, "Biceps"));
      pick(
        "Second biceps or rear delt",
        false,
        (ex) => muscle(ex, "Biceps", "Barki"),
      );
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── LEGS ─────────────────────────────────────────────────────────────────
    // 1. Knee-dominant compound   2. Hip-dominant   3. Lower-body accessory
    // 4. Calves   5. (opt) Core   6. (opt) Second lower accessory
    case "legs": {
      pick(
        "Knee-dominant compound",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Pośladki") &&
          compound(ex) &&
          pattern(ex, "Przysiad", "Wykrok"),
      );
      pick(
        "Hip-dominant",
        true,
        (ex) =>
          muscle(
            ex,
            "Mięśnie dwugłowe uda",
            "Pośladki",
            "Plecy",
          ) && pattern(ex, "Zawias biodrowy"),
      );
      pick(
        "Lower-body accessory",
        true,
        (ex) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
          ),
      );
      pick("Calves", true, (ex) => muscle(ex, "Łydki"));
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      pick(
        "Second lower accessory",
        false,
        (ex) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
            "Łydki",
          ),
      );
      break;
    }

    // ── UPPER ─────────────────────────────────────────────────────────────────
    // 1. Chest compound   2. Back compound   3. Shoulders   4. Arms
    // 5. (opt) Accessory or core
    case "upper": {
      pick(
        "Chest compound",
        true,
        (ex) => muscle(ex, "Klatka piersiowa") && compound(ex),
      );
      pick(
        "Back compound",
        true,
        (ex) => muscle(ex, "Plecy") && compound(ex),
      );
      pick("Shoulders", true, (ex) => muscle(ex, "Barki"));
      pick("Arms", true, (ex) => muscle(ex, "Biceps", "Triceps"));
      pick(
        "Accessory or core",
        false,
        (ex) =>
          muscle(
            ex,
            "Klatka piersiowa",
            "Plecy",
            "Barki",
            "Biceps",
            "Triceps",
            "Brzuch",
          ),
      );
      break;
    }

    // ── LOWER ─────────────────────────────────────────────────────────────────
    // 1. Knee-dominant   2. Hip-dominant   3. Lower-body accessory
    // 4. Calves or core   5. (opt) Extra lower-body accessory
    case "lower": {
      pick(
        "Knee-dominant",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Pośladki") &&
          compound(ex) &&
          pattern(ex, "Przysiad", "Wykrok"),
      );
      pick(
        "Hip-dominant",
        true,
        (ex) =>
          muscle(
            ex,
            "Mięśnie dwugłowe uda",
            "Pośladki",
            "Plecy",
          ) && pattern(ex, "Zawias biodrowy"),
      );
      pick(
        "Lower-body accessory",
        true,
        (ex) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
          ),
      );
      pick(
        "Calves or core",
        true,
        (ex) => muscle(ex, "Łydki", "Brzuch"),
      );
      pick(
        "Extra lower-body accessory",
        false,
        (ex) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
            "Łydki",
          ),
      );
      break;
    }
  }

  // ── Step 4: Minimum session guard ─────────────────────────────────────────
  if (results.length < MIN_EXERCISES) {
    const error = `V0 ${sessionType.toUpperCase()}: minimum ${MIN_EXERCISES} exercises required, got ${results.length}`;
    console.log(`V0_BLOCKING_FAILURE: ${error}`);
    return { exercises: [], valid: false, error };
  }

  // ── Step 5: Convert to DayRecommendationExercise[] ────────────────────────
  const exercises: DayRecommendationExercise[] = results.map(
    ({ ex, slotName }) => ({
      id: ex.id,
      name: ex.name,
      mainMuscleGroup: ex.mainMuscleGroup,
      matchingTargets: [slotName],
      equipment: ex.equipment,
      trainingLocation: ex.trainingLocation,
      score: ex.score,
      matchReasons: ex.matchReasons,
      warnReasons: ex.warnReasons,
      isAvoided: ex.isAvoided,
      exerciseType: ex.exerciseType ?? null,
      neurologicalFatigue: ex.neurologicalFatigue ?? null,
      learningDifficulty: ex.learningDifficulty ?? null,
      exercisePriority: ex.exercisePriority ?? null,
      movementPattern: ex.movementPattern ?? null,
      movementCategoryKey: ex.movementCategoryKey ?? null,
      secondaryMuscleGroups: ex.secondaryMuscleGroups ?? null,
    }),
  );

  return { exercises, valid: true };
}
