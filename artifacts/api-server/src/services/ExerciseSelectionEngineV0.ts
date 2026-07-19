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
 * Slot predicate rules (tightened):
 *   PUSH  slot 3  Shoulder accessory: Barki only, NO overhead-press compounds
 *   PULL  slot 3  Rear delt / upper back: Barki only if rear-delt pattern
 *                 (lateral raises and front raises excluded by name)
 *   PULL  slot 5  Second biceps / rear delt: Biceps OR rear-delt Barki only
 *                 (shoulder press excluded)
 *   LEGS / LOWER  Near-duplicate protection: exercises sharing the knee-dominant
 *                 movement pattern are blocked from later accessory slots
 *   ALL   Core    always occupies the final slot — no slot runs after core
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

/**
 * Priority context derived from the client's survey and experience level.
 *
 * Controls tier-aware candidate sorting and movement-pattern variety tracking
 * inside the engine.  Always pass this from the route — set isPriorityEligible
 * to false for beginners / inactive clients so all logic collapses to the
 * original deterministic order with no priority influence.
 *
 * Tier model (intermediate / advanced only):
 *   Tier A — main priority muscle (survey priorityMuscle1)
 *   Tier B — supporting muscles  (survey priorityMuscle2, priorityMuscle3)
 *   Tier C — everything else (no preference — balanced general development)
 */
export interface V0PriorityContext {
  /** True only for "Średniozaawansowany" / "Zaawansowany". */
  isPriorityEligible: boolean;
  /** Tier A: the client's first-priority muscle group. */
  tierA: string[];
  /** Tier B: second and third priority muscle groups. */
  tierB: string[];
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

/**
 * Name fragments that identify lateral raises and front raises.
 * These are excluded from rear-delt / upper-back slots — they train the
 * lateral or anterior deltoid head, not the posterior/upper back.
 */
const LATERAL_OR_FRONT_RAISE_FRAGMENTS = [
  "bokiem",   // "unoszenie hantli bokiem" — lateral raise variants
  "w przód",  // "unoszenie hantli w przód" — front raise variants
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase();

/** Normalise a nullable movement-pattern string for comparison. */
function normP(p: string | null | undefined): string | null {
  return p != null ? p.trim().toLowerCase() : null;
}

function isBlocklisted(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return HARD_FILTER_FRAGMENTS.some((f) => lower.includes(f));
}

/**
 * True when the exercise name indicates a REAR-delt or upper-back movement.
 * Returns false for lateral raises ("bokiem") and front raises ("w przód")
 * so they are excluded from rear-delt / upper-back slots.
 */
function isRearDeltMovement(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return !LATERAL_OR_FRONT_RAISE_FRAGMENTS.some((f) => lower.includes(f));
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

/**
 * Rear-delt / upper-back Barki filter.
 *
 * Accepts Barki exercises that are:
 *   - "Przyciąganie poziome" (face pull, cable rear-delt pulls)
 *   - "Odwodzenie" AND the name is NOT a lateral or front raise
 *
 * Explicitly rejects:
 *   - Overhead-press compounds ("Pchanie pionowe") — those belong in push/shoulder slots
 *   - Lateral raises ("bokiem") — anterior/lateral, not posterior
 *   - Front raises ("w przód") — anterior, not posterior
 */
function isRearDeltBarki(ex: ScoredAndFilteredExercise): boolean {
  return (
    muscle(ex, "Barki") &&
    (pattern(ex, "Przyciąganie poziome") ||
      (pattern(ex, "Odwodzenie") && isRearDeltMovement(ex.name)))
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

// ─── Priority-aware candidate ordering ───────────────────────────────────────

/**
 * Map an exercise to its client priority tier (0 = Tier A, 1 = Tier B, 2 = Tier C).
 */
function clientTierRank(
  ex: ScoredAndFilteredExercise,
  ctx: V0PriorityContext,
): number {
  const m = norm(ex.mainMuscleGroup);
  if (ctx.tierA.some((t) => norm(t) === m)) return 0;
  if (ctx.tierB.some((t) => norm(t) === m)) return 1;
  return 2;
}

/**
 * Priority-aware candidate sort for intermediate / advanced clients.
 *
 * Sort key:
 *   1. Client muscle tier  (Tier A → Tier B → Tier C)
 *      • Tier A wins multi-muscle optional slots (e.g. "Chest or triceps accessory"
 *        goes to chest when chest is the priority muscle).
 *      • Tier C is the last to win any contested slot — protection from cuts.
 *   2. Movement-pattern freshness for Tier A muscles
 *      • Prefers an exercise with a pattern not yet used by the same muscle group
 *        in this session, enforcing flat+incline / vertical+horizontal variety.
 *      • Only applied between two Tier A candidates for the same muscle.
 *   3. Exercise library priority  (Bardzo wysoki → Niski)
 *   4. Learning difficulty ascending  (simpler first)
 *   5. ID ascending  (stable numeric tie-breaker)
 *
 * Falls back to sortDeterministic when isPriorityEligible = false or no tiers set.
 */
function sortWithPriority(
  candidates: ScoredAndFilteredExercise[],
  ctx: V0PriorityContext,
  usedPatternsByMuscle: Map<string, Set<string>>,
): ScoredAndFilteredExercise[] {
  if (!ctx.isPriorityEligible || (ctx.tierA.length === 0 && ctx.tierB.length === 0)) {
    return sortDeterministic(candidates);
  }
  return [...candidates].sort((a, b) => {
    // 1. Client muscle tier
    const ta = clientTierRank(a, ctx),
      tb = clientTierRank(b, ctx);
    if (ta !== tb) return ta - tb;

    // 2. Movement-pattern freshness — only between two Tier A candidates
    if (ta === 0 && tb === 0) {
      const muscleA = norm(a.mainMuscleGroup);
      const usedPats = usedPatternsByMuscle.get(muscleA) ?? new Set<string>();
      const patA = normP(a.movementPattern) ?? "";
      const patB = normP(b.movementPattern) ?? "";
      // 0 = fresh (preferred), 1 = already used
      const freshA = usedPats.has(patA) ? 1 : 0;
      const freshB = usedPats.has(patB) ? 1 : 0;
      if (freshA !== freshB) return freshA - freshB;
    }

    // 3. Exercise library priority
    const pa = priorityRank(a),
      pb = priorityRank(b);
    if (pa !== pb) return pa - pb;

    // 4. Learning difficulty
    const la = a.learningDifficulty ?? 99,
      lb = b.learningDifficulty ?? 99;
    if (la !== lb) return la - lb;

    // 5. ID
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
 * @param ctx             Optional priority context from the client's survey.
 *                        When present and isPriorityEligible = true, candidates are
 *                        sorted Tier A → Tier B → Tier C before the deterministic
 *                        tie-breaker, and Tier A variety tracking is active.
 *                        Omit or pass undefined to keep the original behaviour.
 */
export function runExerciseSelectionEngineV0(
  pool: ScoredAndFilteredExercise[],
  sessionType: V0SessionType,
  usedExerciseIds: Set<string>,
  ctx?: V0PriorityContext,
): V0Result {
  // ── Step 1: Global hard filter ────────────────────────────────────────────
  // Exclude avoided exercises and blocklisted names from the entire session.
  const eligible = pool.filter(
    (ex) => !ex.isAvoided && !isBlocklisted(ex.name),
  );

  // ── Step 2: Selection state ───────────────────────────────────────────────
  const results: Array<{ ex: ScoredAndFilteredExercise; slotName: string }> =
    [];

  // Movement-pattern variety tracker for Tier A muscles.
  // After each Tier A exercise is chosen, its movement pattern is recorded here.
  // Future picks within the same muscle group deprioritise already-used patterns,
  // enforcing flat+incline / vertical+horizontal variety automatically.
  const usedPatternsByMuscle = new Map<string, Set<string>>();

  if (ctx?.isPriorityEligible && (ctx.tierA.length > 0 || ctx.tierB.length > 0)) {
    console.log(
      `PRIORITY_CONTEXT: Tier A=[${ctx.tierA.join(", ")}] Tier B=[${ctx.tierB.join(", ")}]`,
    );
  }

  /**
   * Attempt to pick one exercise for a named slot.
   *
   * Applies:
   *   1. Deduplication (usedExerciseIds)
   *   2. Global eligibility (already applied to `eligible`)
   *   3. Slot-specific filter predicate
   *   4. Priority-aware sort when ctx.isPriorityEligible = true:
   *        Tier A → Tier B → Tier C → deterministic tie-breaker
   *      Falls back to plain deterministic sort for beginners / no ctx.
   *   5. Select candidates[0]
   *
   * After selection, records the movement pattern of Tier A exercises so
   * subsequent picks for the same muscle prefer a different pattern.
   *
   * Mutates usedExerciseIds on success.
   * Emits structured debug logs per spec.
   */
  function pick(
    slotName: string,
    required: boolean,
    filter: (ex: ScoredAndFilteredExercise) => boolean,
  ): ScoredAndFilteredExercise | null {
    const filtered = eligible.filter(
      (ex) => !usedExerciseIds.has(String(ex.id)) && filter(ex),
    );
    const candidates =
      ctx?.isPriorityEligible
        ? sortWithPriority(filtered, ctx, usedPatternsByMuscle)
        : sortDeterministic(filtered);

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

    // Record movement pattern for Tier A variety tracking.
    // Only applies when the selected exercise belongs to a Tier A muscle group.
    if (ctx?.isPriorityEligible && selected.movementPattern) {
      const m = norm(selected.mainMuscleGroup);
      if (ctx.tierA.some((t) => norm(t) === m)) {
        const existing = usedPatternsByMuscle.get(m) ?? new Set<string>();
        existing.add(normP(selected.movementPattern) ?? "");
        usedPatternsByMuscle.set(m, existing);
      }
    }

    return selected;
  }

  // ── Step 3: Slot execution by session type ────────────────────────────────

  switch (sessionType) {
    // ── PUSH ─────────────────────────────────────────────────────────────────
    //
    // Slot order:
    //   1. Chest push compound
    //   2. Second push compound (chest or shoulder — includes overhead press)
    //   3. Shoulder accessory   ← lateral raise / rear delt only; NO press compounds
    //   4. Triceps isolation
    //   5. (opt) Chest or triceps accessory
    //   6. (opt) Core           ← always last
    case "push": {
      pick(
        "Chest compound",
        true,
        (ex) =>
          muscle(ex, "Klatka piersiowa") &&
          compound(ex) &&
          pattern(ex, "Pchanie poziome"),
      );

      // Second push compound: chest horizontal OR shoulder vertical press
      pick(
        "Second push compound",
        true,
        (ex) =>
          muscle(ex, "Klatka piersiowa", "Barki") &&
          compound(ex) &&
          pattern(ex, "Pchanie poziome", "Pchanie pionowe"),
      );

      // Shoulder accessory: Barki but NOT another overhead-press compound.
      // Lateral raises, rear-delt isolation, and face-pull Barki all qualify.
      // Overhead press belongs to slot 2 only.
      pick(
        "Shoulder accessory",
        true,
        (ex) =>
          muscle(ex, "Barki") &&
          !(compound(ex) && pattern(ex, "Pchanie pionowe")),
      );

      pick("Triceps isolation", true, (ex) => muscle(ex, "Triceps"));

      pick(
        "Chest or triceps accessory",
        false,
        (ex) => muscle(ex, "Klatka piersiowa", "Triceps"),
      );

      // Core always last
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── PULL ─────────────────────────────────────────────────────────────────
    //
    // Slot order:
    //   1. Pull compound (vertical or horizontal)
    //   2. Complementary pull compound (prefer the opposite pattern)
    //   3. Rear delt / upper back   ← rear-delt Barki + back isolation only
    //   4. Biceps isolation
    //   5. (opt) Second biceps or rear delt  ← Biceps + rear-delt Barki only
    //   6. (opt) Core               ← always last
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
      // Vertical pull → prefer horizontal rows; horizontal row → prefer vertical pull.
      // Falls back to any pull compound if the complementary pattern is exhausted.
      const s1Pattern = normP(s1?.movementPattern);
      const complementary =
        s1Pattern === "przyciąganie pionowe"
          ? "Przyciąganie poziome"
          : "Przyciąganie pionowe";

      const s2 =
        pick(
          "Complementary pull compound",
          false, // non-required; fallback below carries the required flag
          (ex) =>
            muscle(ex, "Plecy") && compound(ex) && pattern(ex, complementary),
        ) ??
        pick(
          "Second pull compound",
          true,
          (ex) =>
            muscle(ex, "Plecy") &&
            compound(ex) &&
            pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
        );
      void s2;

      // Slot 3: rear delt / upper back accessory.
      //
      // Accepts:
      //   • Barki + "Przyciąganie poziome"          (face pull, cable rear-delt)
      //   • Barki + "Odwodzenie" + NOT lateral/front  (reverse flyes, band pull-apart)
      //   • Plecy + "Izolowane"                     (straight-arm pulldown, etc.)
      //
      // Rejects:
      //   • Lateral raises  ("bokiem" in name)
      //   • Front raises    ("w przód" in name)
      //   • Shoulder press  ("Pchanie pionowe")
      pick(
        "Rear delt or upper back",
        true,
        (ex) =>
          isRearDeltBarki(ex) ||
          (muscle(ex, "Plecy") &&
            ex.exerciseType != null &&
            norm(ex.exerciseType) === "izolowane"),
      );

      // Slot 4: biceps isolation only
      pick("Biceps isolation", true, (ex) => muscle(ex, "Biceps"));

      // Slot 5: second biceps OR rear-delt Barki only.
      // Shoulder press is explicitly excluded — it belongs to push days.
      pick(
        "Second biceps or rear delt",
        false,
        (ex) => muscle(ex, "Biceps") || isRearDeltBarki(ex),
      );

      // Core always last
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── LEGS ─────────────────────────────────────────────────────────────────
    //
    // Slot order:
    //   1. Knee-dominant compound (squat / lunge pattern)
    //   2. Hip-dominant (hinge pattern)
    //   3. Lower-body accessory   ← blocks near-duplicate of knee-dominant pattern
    //   4. Calves
    //   5. (opt) Second lower accessory  ← also blocks near-duplicate pattern
    //   6. (opt) Core             ← always last
    //
    // Near-duplicate protection: once a movement pattern is selected in the
    // knee-dominant slot, that exact pattern is excluded from all later
    // accessory slots to prevent the same squat or lunge variant appearing twice.
    case "legs": {
      const s1 = pick(
        "Knee-dominant compound",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Pośladki") &&
          compound(ex) &&
          pattern(ex, "Przysiad", "Wykrok"),
      );
      // Capture the knee-dominant pattern for near-duplicate exclusion below.
      const kneeDominantPattern = normP(s1?.movementPattern);

      pick(
        "Hip-dominant",
        true,
        (ex) =>
          muscle(ex, "Mięśnie dwugłowe uda", "Pośladki", "Plecy") &&
          pattern(ex, "Zawias biodrowy"),
      );

      // Lower-body accessory: exclude same movement pattern as knee-dominant.
      // Example: if slot 1 was a squat, no second squat-pattern exercise here.
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
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern),
      );

      pick("Calves", true, (ex) => muscle(ex, "Łydki"));

      // Second lower accessory: also blocks near-duplicate of knee pattern.
      // Placed BEFORE Core so that Core is always the final slot.
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
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern),
      );

      // Core always last
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── UPPER ─────────────────────────────────────────────────────────────────
    //
    // Slot order:
    //   1. Chest compound
    //   2. Back compound
    //   3. Shoulders (overhead press belongs here — all Barki compounds welcome)
    //   4. Arms
    //   5. (opt) Accessory or core  ← core may appear here if nothing else fills
    //
    // Note: UPPER has a single broad shoulder slot (overhead press is correct here).
    // There is no separate rear-delt slot in Upper — that granularity belongs in Pull.
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

      // All Barki exercises welcome in Upper — overhead press is the primary
      // shoulder stimulus in an Upper session (no separate push/pull split here).
      pick("Shoulders", true, (ex) => muscle(ex, "Barki"));

      pick("Arms", true, (ex) => muscle(ex, "Biceps", "Triceps"));

      // Slot 5 is an optional catch-all — core is acceptable here if nothing else fits.
      // Upper has only 5 slots (spec), so this is also the de-facto final slot.
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
    //
    // Slot order:
    //   1. Knee-dominant (squat / lunge pattern)
    //   2. Hip-dominant (hinge pattern)
    //   3. Lower-body accessory  ← blocks near-duplicate of knee-dominant pattern
    //   4. Calves (preferred) — falls back to Core if no calves available
    //   5. (opt) Extra lower-body accessory  ← also blocks near-duplicate pattern
    //   6. (opt) Core            ← always last; omitted if Core was the slot 4 fallback
    //
    // Calves-or-core logic:
    //   • First try Calves (preferred for a lower session)
    //   • If no calves exercises are available, fall back to Core as slot 4
    //   • A separate Core slot at position 6 is added ONLY when Calves filled slot 4,
    //     so Core is never duplicated and always remains the final slot.
    case "lower": {
      const s1 = pick(
        "Knee-dominant",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Pośladki") &&
          compound(ex) &&
          pattern(ex, "Przysiad", "Wykrok"),
      );
      // Capture the knee-dominant pattern for near-duplicate exclusion below.
      const kneeDominantPattern = normP(s1?.movementPattern);

      pick(
        "Hip-dominant",
        true,
        (ex) =>
          muscle(ex, "Mięśnie dwugłowe uda", "Pośladki", "Plecy") &&
          pattern(ex, "Zawias biodrowy"),
      );

      // Lower-body accessory: exclude near-duplicate of knee-dominant pattern.
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
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern),
      );

      // Slot 4: prefer calves; fall back to core if unavailable.
      const s4Calves = pick("Calves", false, (ex) => muscle(ex, "Łydki"));
      if (s4Calves === null) {
        // Required fallback — core fills the slot and is already the last exercise.
        pick("Calves slot (core fallback)", true, (ex) => muscle(ex, "Brzuch"));
      }

      // Extra lower accessory: also blocks near-duplicate of knee pattern.
      // Placed BEFORE the optional Core slot so Core remains last.
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
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern),
      );

      // Core always last — only added when Calves successfully filled slot 4.
      // When core was the slot 4 fallback it is already present; adding it again
      // would pick a DIFFERENT core exercise (usedExercises dedup prevents repeats),
      // which is acceptable but usually unwanted. Skip it for cleanliness.
      if (s4Calves !== null) {
        pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      }
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
