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
import type { GoalProfile } from "./goalProfileService";

// ─── Public types ─────────────────────────────────────────────────────────────

export type V0SessionType = "push" | "pull" | "legs" | "upper" | "lower" | "plyo";

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
  /**
   * True when the client's experience level is exactly "Brak aktywności fizycznej".
   *
   * This is explicitly separate from "Początkujący" — "Brak aktywności" is the
   * most conservative level: only regression-style, very low complexity, very
   * stable movements are preferred.  "Początkujący" may allow basic compound
   * lifting that is still too complex or too unstable for this level.
   *
   * When true, sortDeterministic / sortWithPriority promote exercises with
   * suitableForNoActivity === true before non-flagged ones in every slot's band.
   * This is the mirror of the regression penalty applied to intermediate+ clients
   * (which pushes those same exercises DOWN in the opposite direction).
   *
   * Note: isPriorityEligible is always false when isNoActivityClient is true.
   */
  isNoActivityClient?: boolean;
  /**
   * True when the client's experience level is exactly "Początkujący".
   *
   * Distinct from both "Brak aktywności fizycznej" (more conservative) and
   * intermediate+ (where priority-muscle tier ranking applies).
   *
   * When true, sortDeterministic adds a mild preference for exercises with
   * learningDifficulty ≤ 2 over those with learningDifficulty ≥ 4 within each
   * slot's band.  The mid-range (3 or null) is neutral.
   *
   * This is NOT a hard filter — it only re-orders within the existing band so
   * the slot structure (compound vs isolation, muscle group) is always respected.
   * isPriorityEligible is always false when isBeginnerClient is true.
   */
  isBeginnerClient?: boolean;
  /** Tier A: the client's first-priority muscle group. */
  tierA: string[];
  /** Tier B: second and third priority muscle groups. */
  tierB: string[];
  /**
   * When true, barbell chest exercises are preferred over dumbbell / bodyweight
   * alternatives within the same Tier A sort band.
   *
   * Activated only when ALL of:
   *   1. The client's trainingGoal explicitly names barbell bench (e.g. "100 kg na klatę")
   *   2. The client has barbell equipment available (survey.equipment includes "Sztanga")
   *   3. isPriorityEligible is true (intermediate / advanced)
   *
   * Has no effect outside Klatka piersiowa (chest) Tier A candidates.
   */
  benchGoalActive?: boolean;
  /**
   * When false, plyometric / explosive exercises (identified by PLYO_FRAGMENTS)
   * are excluded from all non-plyo session types.
   *
   * Default: true (allow plyometrics) — set to false for goals unrelated to
   * power / sport performance (hypertrophy, fat loss, general health, beginner).
   */
  allowPlyometrics?: boolean;
  /**
   * Lowercase keyword fragments parsed from survey.favoriteExercises.
   * An exercise whose name contains any of these keywords is sorted to the
   * front of every slot's candidate band (rank 0 vs rank 1 for all others).
   * The preference is overridden only by the slot's hard filter predicate —
   * a preferred exercise that fails the slot filter is never admitted.
   */
  preferredExerciseKeywords?: string[];
  /**
   * Goal-driven decision profile built from survey.trainingGoal.
   * Controls regression penalty, isolation deprioritisation, dynamic-work
   * exposure, and extra arm/shoulder slots for intermediate+ users.
   * When absent, all goal-driven effects are disabled (safe default).
   */
  goalProfile?: GoalProfile;
}

/**
 * Engine-level call options.
 *
 * alternativeIndex controls which candidate from the ranked band wins each slot:
 *   0 (default) — rank-1 always wins; fully deterministic / stable
 *   1           — first pattern-diverse candidate in the band wins
 *   2           — second pattern-diverse candidate in the band wins
 *   …
 *
 * Protected main-lift slots draw from a band of BAND_MAIN (3) candidates.
 * Accessory and isolation slots draw from a band of BAND_ACCESSORY (5).
 * When the band is smaller than requested the last available candidate is used.
 */
export interface V0EngineOptions {
  alternativeIndex?: number;
  /**
   * Exercises selected in the previous occurrence of this same session type
   * (e.g., Upper A's exercises when generating Upper B).
   *
   * These exercises are already hard-excluded from the pool via weekUsedExerciseIds.
   * This list provides equipment-class context so the band selection can also
   * deprioritize exercises that use the SAME IMPLEMENT as the previous same-type
   * selection — steering each slot toward genuine angle, grip, or tool variation.
   *
   * When omitted (first occurrence or single-session call), the engine falls back
   * to pattern + equipment diversity within the local band.
   */
  sameTypePreviousExercises?: Array<{ id: number; equipment: string[] }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Session types with a minimum of 4 exercises required for a valid session. */
const MIN_EXERCISES = 4;

/** Band size for protected main-lift slots — variety stays within the same stimulus family. */
const BAND_MAIN = 3;

/**
 * Band size for protected main-lift slots when generating an alternative session
 * (alternativeIndex > 0).  Wider than BAND_MAIN so there are more candidates to
 * search for implement / angle diversity — e.g. barbell vs dumbbell vs machine
 * within the same movement pattern.
 */
const BAND_MAIN_ALT = 5;

/** Band size for accessory / isolation / optional slots — more variety permitted. */
const BAND_ACCESSORY = 5;

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
 * Name fragments (lowercase Polish) that identify plyometric / explosive exercises.
 *
 * These exercises are excluded from non-plyo session slots when
 * ctx.allowPlyometrics is false — they only appear in plyo sessions or when
 * the client's goal is explicitly power / sport performance.
 */
const PLYO_FRAGMENTS = [
  "skok",     // catches: Skoki pogo, Skoki na skrzynkę, Wyskok …
  "wyskoki",
  "pogo",
  "rzut",     // medicine-ball throws
  "sprint",
  "biegani",  // running drills
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

/** True when the exercise name matches a plyometric / explosive movement. */
function isPlyometric(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return PLYO_FRAGMENTS.some((f) => lower.includes(f));
}

/**
 * Returns a coarse equipment-class label for A/B band diversity comparisons.
 *
 * Used to detect "same implement" repetition across A/B session occurrences:
 * barbell flat bench and barbell incline bench share both "Pchanie poziome"
 * AND "barbell" — so when Upper A used barbell, Upper B should prefer dumbbell
 * or machine over another barbell variant.
 *
 * Returns "machine" for any gym-machine / cable / undefined equipment so that
 * unknown equipment doesn't incorrectly trigger the diversity bonus.
 */
function primaryEquipmentClass(equipment: string[]): string {
  if (equipment.includes("Sztanga i talerze")) return "barbell";
  if (equipment.includes("Hantle")) return "dumbbell";
  if (equipment.includes("Kettlebell")) return "kettlebell";
  if (equipment.includes("TRX / pasy treningowe")) return "trx";
  if (equipment.includes("Gumy oporowe")) return "bands";
  if (equipment.includes("Drążek do podciągania")) return "pullup_bar";
  if (equipment.length === 0 || equipment.includes("Brak sprzętu")) return "bodyweight";
  return "machine"; // gym machine / cable / unspecified
}

/**
 * True when any preferred keyword appears in the exercise name.
 * Used as a sort tie-breaker (rank 0 = preferred, rank 1 = not preferred).
 */
function isPreferredExercise(
  ex: ScoredAndFilteredExercise,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return false;
  const lower = ex.name.trim().toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * True when the exercise is flagged as suitable for no-activity clients.
 *
 * Used by the goal-profile regression penalty: for intermediate / advanced
 * clients whose goal is hypertrophy or strength, these regression-style
 * exercises are sorted AFTER non-flagged candidates so they don't win compound
 * slots when more appropriate options exist in the pool.
 *
 * Safe fallback: when the field is absent or null, returns false — the penalty
 * is never applied to exercises without explicit data.
 */
function isRegressionCandidate(ex: ScoredAndFilteredExercise): boolean {
  return ex.suitableForNoActivity === true;
}

/**
 * True when the exercise has explicit isolation (Izolowane) typing.
 *
 * Used by the isolation-deprioritisation branch in goal-profile sorting:
 * for strength and conditioning goals, isolation exercises are ranked after
 * compound exercises within mixed-type slots, without blocking them entirely.
 *
 * Safe fallback: null / missing exerciseType returns false (no penalty applied).
 */
function isIsolation(ex: ScoredAndFilteredExercise): boolean {
  return ex.exerciseType != null && norm(ex.exerciseType) === "izolowane";
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

/**
 * True when the exercise uses free-weight equipment (barbell or dumbbells).
 *
 * Used to prefer barbell / dumbbell presses over machine presses in
 * chest-priority slot 1 — machines are accepted as a fallback only.
 */
function hasFreeWeight(ex: ScoredAndFilteredExercise): boolean {
  return ex.equipment.some((e) => {
    const n = norm(e);
    return n === "sztanga" || n === "hantle";
  });
}

/**
 * True when the exercise is a shrug variant (trap isolation).
 *
 * Covers all Polish shrug names: "Szrugowanie …" and "Szrugsy …".
 * Shrugs are excluded from back-priority contested slots unless the
 * client explicitly prioritises upper traps.
 */
function isShrug(ex: ScoredAndFilteredExercise): boolean {
  return ex.name.toLowerCase().includes("szrug");
}

/**
 * True when the exercise is a back-extension / hyperextension variant.
 *
 * Identified by: mainMuscleGroup = Plecy AND movementPattern = Zawias biodrowy
 * AND exerciseType = Izolowane.
 *
 * This excludes Wznosy tułowia from back-priority support slots where pull-
 * family exercises (rows, pulldowns) are better choices.
 * Note: compound hip-hinge exercises like Martwy ciąg are NOT excluded here
 * (they are Złożone, not Izolowane).
 */
function isBackExtension(ex: ScoredAndFilteredExercise): boolean {
  return (
    muscle(ex, "Plecy") &&
    pattern(ex, "Zawias biodrowy") &&
    ex.exerciseType != null &&
    norm(ex.exerciseType) === "izolowane"
  );
}

/**
 * True when the exercise is lower-body dominant or a heavy systemic compound
 * that does not belong in an Upper session accessory slot.
 *
 * Two families are rejected:
 *
 * 1. Lower-body primary movers — any exercise whose mainMuscleGroup is
 *    Nogi, Pośladki, Uda, or Łydki (squats, lunges, leg press, hip thrust,
 *    calf raises, etc.).
 *
 * 2. Hip-hinge compounds catalogued under Plecy — conventional / Romanian /
 *    sumo deadlift and trap-bar deadlift.  These are Złożone + Zawias biodrowy;
 *    isBackExtension (Izolowane + Zawias biodrowy) is already handled
 *    separately and is NOT caught here.
 *
 * Safe upper-body exercises that are NOT rejected:
 *   - Pull-pattern back compounds (rows, pulldowns)      — Przyciąganie …
 *   - Plecy isolation in pull patterns (straight-arm)   — Przyciąganie pionowe
 *   - Core / Brzuch                                      — any pattern
 *   - Arms, shoulders, chest                             — any pattern
 */
function isLowerBodyDominant(ex: ScoredAndFilteredExercise): boolean {
  // Family 1: lower-body primary muscle group
  if (muscle(ex, "Nogi", "Pośladki", "Uda", "Łydki")) return true;
  // Family 2: compound hip-hinge (deadlift family) — includes Martwy ciąg
  // konwencjonalny / rumuński / sumo even though they list Plecy as primary.
  if (compound(ex) && pattern(ex, "Zawias biodrowy")) return true;
  return false;
}

/**
 * Positive whitelist for Upper session "Accessory or core" slots.
 *
 * An exercise must belong to one of these families to be admitted:
 *
 *   • Klatka piersiowa  — any type (isolation, compound accessory)
 *   • Barki             — any type (lateral raise, rear-delt fly, press accessory)
 *   • Biceps            — any type
 *   • Triceps           — any type
 *   • Brzuch            — any type (plank, crunch, cable crunch, etc.)
 *   • Plecy             — pull-pattern ONLY (Przyciąganie pionowe / poziome)
 *                         Rejects: Zawias biodrowy (deadlifts, back extensions),
 *                                  Zgięcie tułowia (Jefferson Curl, good-morning),
 *                                  Inne (shrugs), and any other non-pull pattern.
 *
 * This is the primary gate. isLowerBodyDominant is kept alongside it as a
 * belt-and-suspenders guard for any lower-body exercise that might otherwise
 * slip through (e.g. Nogi / Pośladki primary mover not yet in the DB).
 */
function isUpperAccessorySafe(ex: ScoredAndFilteredExercise): boolean {
  if (muscle(ex, "Biceps", "Triceps", "Brzuch")) return true;
  if (muscle(ex, "Klatka piersiowa", "Barki")) return true;
  if (
    muscle(ex, "Plecy") &&
    pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome")
  )
    return true;
  return false;
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

/**
 * True when the exercise's exercisePriority is "Niski" (lowest library tier).
 *
 * Used to hard-block low-priority filler exercises from intermediate+ lower
 * accessory slots when higher-quality alternatives remain in the pool.
 * Applied as a "try-hard-first" pattern with a full-pool fallback so
 * low-priority exercises can still be selected when no other option exists.
 */
function isLowPriority(ex: ScoredAndFilteredExercise): boolean {
  return ex.exercisePriority === "Niski";
}

/**
 * True when the exercise is a carry or loaded-walk movement.
 * Identified by common Polish carry name fragments: "spacer farmera", "spacer z",
 * "chód z", "marsz z".
 *
 * Used to open the preferred-exercise gateway for functional carries in
 * sprawność / sport upper accessory slots, where isUpperAccessorySafe would
 * normally reject them (they may be catalogued as back/full-body movements).
 */
function isCarryMovement(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return ["spacer farmera", "spacer z", "chód z", "marsz z"].some((f) =>
    lower.includes(f),
  );
}

/**
 * True when the exercise name explicitly identifies a beginner teaching drill.
 *
 * Polish instructional exercises start with "nauka " (meaning "learning of …"),
 * e.g. "Nauka lądowania" (landing mechanics drill), "Nauka techniki przysiadu",
 * etc.  These are appropriate for beginners learning movement patterns but should
 * not fill accessory slots in plans for intermediate / advanced clients when
 * real exercise alternatives are available.
 *
 * The check is conservative — it only flags exercises that explicitly name
 * themselves as "nauka …", so regular compound exercises are never affected.
 * Used alongside the isLowPriority / isRegressionCandidate hard-block in lower
 * support slots for isPriorityEligible clients.
 */
function isBeginnerDrillByName(name: string): boolean {
  return name.trim().toLowerCase().startsWith("nauka ");
}

/**
 * BLOCKER 2 FIX — Pull slot 3 semantic guard.
 *
 * True when an exercise is appropriate for the "Rear delt / upper back" slot
 * in a PULL session.
 *
 * Accepts:
 *   • isRearDeltBarki — face pull, cable rear-delt, reverse fly
 *   • Plecy + Izolowane + Przyciąganie pionowe  — straight-arm pulldown, etc.
 *   • Plecy + Izolowane + Przyciąganie poziome  — horizontal pull isolations
 *
 * Explicitly rejects (even though they satisfy muscle(ex, "Plecy") + Izolowane):
 *   • Zawias biodrowy pattern — back extensions, hyperextensions (Wznosy tułowia)
 *   • "Inne" pattern          — shrugs (Szrugowanie, Szrugsy) and similar trap fillers
 *     that do not involve meaningful shoulder-joint pulling
 *
 * Design: whitelist correct movement families rather than rely solely on
 * blacklist exclusions, so future exercises are accepted or rejected correctly.
 */
function isPullRearDeltUpperBackSafe(ex: ScoredAndFilteredExercise): boolean {
  // Shoulder-side path: face pull, reverse fly, cable rear-delt rows
  if (isRearDeltBarki(ex)) return true;

  // Back-isolation path: only pulling patterns qualify.
  // Zawias biodrowy (back extension) and Inne (shrugs) are explicitly excluded.
  if (
    muscle(ex, "Plecy") &&
    ex.exerciseType != null &&
    norm(ex.exerciseType) === "izolowane" &&
    (pattern(ex, "Przyciąganie pionowe") || pattern(ex, "Przyciąganie poziome"))
  ) {
    return true;
  }

  return false;
}

// ─── Exercise class derivation ────────────────────────────────────────────────

/**
 * Six-way structural classification of exercises using only existing DB fields.
 * No DB migration required.
 *
 * Used by:
 *   • sortDeterministic / sortWithPriority — for athleticCompoundBias step
 *   • Future slot-level decision logic that needs finer class resolution than
 *     the current compound / isolation binary
 *
 * Priority order (first match wins):
 *   regression_beginner  suitableForNoActivity === true
 *   core                 mainMuscleGroup "Brzuch"
 *   isolation            exerciseType "Izolowane"
 *   plyometric_power     movementCategory "plyometryczne" OR jump/explosive pattern
 *   main_compound        compound with exercisePriority "Bardzo wysoki" | "Wysoki"
 *   secondary_compound   all other compounds + unlabelled functional exercises
 */
export type ExerciseClass =
  | "regression_beginner"
  | "core"
  | "isolation"
  | "plyometric_power"
  | "main_compound"
  | "secondary_compound";

export function deriveExerciseClass(ex: ScoredAndFilteredExercise): ExerciseClass {
  if (ex.suitableForNoActivity === true) return "regression_beginner";
  if (norm(ex.mainMuscleGroup) === "brzuch") return "core";
  if (isIsolation(ex)) return "isolation";

  const mc = norm(ex.movementCategoryKey ?? "");
  const mp = normP(ex.movementPattern ?? "") ?? "";
  if (
    mc === "plyometryczne" || mc.includes("plyomet") ||
    mp === "skok" || mp === "wyskok" || mp.includes("wybici")
  ) return "plyometric_power";

  if (compound(ex)) {
    const pri = ex.exercisePriority;
    if (pri === "Bardzo wysoki" || pri === "Wysoki") return "main_compound";
    return "secondary_compound";
  }

  return "secondary_compound";
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
 * Sort candidates deterministically:
 *   0. Preferred exercise boost (keyword match → front of band)
 *   1. Regression penalty — for eligible clients with penalising goal profile,
 *      suitableForNoActivity exercises rank after non-flagged ones
 *   2. Isolation deprioritisation — for strength/conditioning goal profiles,
 *      isolation exercises rank after compounds within mixed-type slots
 *   3. exercisePriority high → low  ("Bardzo wysoki" first)
 *   4. learningDifficulty ascending (simpler first)
 *   5. id ascending (stable numeric tie-breaker)
 */
function sortDeterministic(
  candidates: ScoredAndFilteredExercise[],
  preferredKeywords?: string[],
  ctx?: V0PriorityContext,
): ScoredAndFilteredExercise[] {
  const gp = ctx?.goalProfile;
  const penalizeRegression = gp?.penalizeRegressionForEligible === true && ctx?.isPriorityEligible === true;
  const deIsolation = gp?.deprioritizeIsolationInMixedSlots === true;
  // Stage E: athleticCompoundBias — deprioritise isolation in sport/athletic
  // contexts.  Kept separate from deIsolation (which serves strength/conditioning)
  // because the rationale differs: sport goals need athletic multi-joint compounds,
  // not bodybuilding-style isolation; strength/conditioning goals need dominant
  // compound movements to be the primary session structure.
  const athleticBias = gp?.athleticCompoundBias === true;

  return [...candidates].sort((a, b) => {
    // 0. Preferred exercise boost
    if (preferredKeywords && preferredKeywords.length > 0) {
      const prefA = isPreferredExercise(a, preferredKeywords) ? 0 : 1;
      const prefB = isPreferredExercise(b, preferredKeywords) ? 0 : 1;
      if (prefA !== prefB) return prefA - prefB;
    }

    // 1. No-activity preference — mirror of the regression penalty, runs first
    //    so that "Brak aktywności fizycznej" clients see the safest exercises at
    //    the front of every slot's band regardless of exercise_priority tier.
    //
    //    "Brak aktywności" is treated as a DISTINCT level from "Początkujący":
    //    some exercises valid for beginners are still too complex / unstable for
    //    a fully inactive client.  Only exercises explicitly flagged
    //    suitableForNoActivity === true are promoted here.
    if (ctx?.isNoActivityClient) {
      const naA = isRegressionCandidate(a) ? 0 : 1; // 0 = preferred (front)
      const naB = isRegressionCandidate(b) ? 0 : 1;
      if (naA !== naB) return naA - naB;
    }

    // 1c. Beginner preference (Stage E) — for "Początkujący" clients, rank
    //     exercises with learningDifficulty ≤ 2 before complex ones (≥ 4).
    //     Exercises in the middle (3 or null) are neutral.
    //     "Początkujący" is explicitly distinct from "Brak aktywności":
    //     beginners can handle basic compound lifting; inactive clients cannot.
    if (ctx?.isBeginnerClient) {
      const ldBucket = (v: number | null | undefined): number => {
        if (v == null) return 1;
        if (v <= 2) return 0;
        if (v >= 4) return 2;
        return 1;
      };
      const ldA = ldBucket(a.learningDifficulty);
      const ldB = ldBucket(b.learningDifficulty);
      if (ldA !== ldB) return ldA - ldB;
    }

    // 1b. Regression penalty (for eligible clients with hypertrophy/strength goal)
    if (penalizeRegression) {
      const regA = isRegressionCandidate(a) ? 1 : 0;
      const regB = isRegressionCandidate(b) ? 1 : 0;
      if (regA !== regB) return regA - regB;
    }

    // 2. High neurological load boost (sport + Dynamika / Szybkość contexts)
    //
    // Exercises with neurologicalFatigue >= 4 rank before lower-fatigue ones.
    // This promotes force-production compounds (heavy squats, deadlifts,
    // Olympic-style movements) for sport/power goals without changing slot filters.
    // null neurological fatigue = treated as 0 (no boost, safe fallback).
    if (gp?.preferHighNeurologicalLoad) {
      const hiA = (a.neurologicalFatigue ?? 0) >= 4 ? 0 : 1;
      const hiB = (b.neurologicalFatigue ?? 0) >= 4 ? 0 : 1;
      if (hiA !== hiB) return hiA - hiB;
    }

    // 3. Unilateral pattern preference (sport + Stabilizacja / Poprawa sprawności)
    //
    // "Wykrok" (lunge / split squat) patterns rank before "Przysiad" (bilateral
    // squat) patterns in lower-body compound slots — unilateral movements demand
    // more stabilisation, proprioception, and body control.
    // Only meaningful in lower-body slots where both patterns compete; no effect
    // in upper-body slots (no Wykrok exercises there).
    if (gp?.preferUnilateralPatterns) {
      const uniA = normP(a.movementPattern) === "wykrok" ? 0 : 1;
      const uniB = normP(b.movementPattern) === "wykrok" ? 0 : 1;
      if (uniA !== uniB) return uniA - uniB;
    }

    // 4. Isolation deprioritisation (for strength/conditioning goal profiles)
    if (deIsolation) {
      const isoA = isIsolation(a) ? 1 : 0;
      const isoB = isIsolation(b) ? 1 : 0;
      if (isoA !== isoB) return isoA - isoB;
    }

    // 4b. Athletic compound bias (Stage E) — for sport / athletic goals, isolation
    //     exercises are deprioritised within the same slot band.  Kept separate
    //     from deIsolation (which serves strength / conditioning) because the
    //     rationale differs: sport goals need athletic multi-joint compounds,
    //     not bodybuilding isolation clutter.
    if (athleticBias) {
      const isoA = isIsolation(a) ? 1 : 0;
      const isoB = isIsolation(b) ? 1 : 0;
      if (isoA !== isoB) return isoA - isoB;
    }

    // 5. exercisePriority
    const pa = priorityRank(a),
      pb = priorityRank(b);
    if (pa !== pb) return pa - pb;

    // 4. learningDifficulty
    const la = a.learningDifficulty ?? 99,
      lb = b.learningDifficulty ?? 99;
    if (la !== lb) return la - lb;

    // 5. id
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
    return sortDeterministic(candidates, ctx.preferredExerciseKeywords, ctx);
  }

  const gp = ctx.goalProfile;
  const penalizeRegression = gp?.penalizeRegressionForEligible === true && ctx.isPriorityEligible;
  const deIsolation = gp?.deprioritizeIsolationInMixedSlots === true;
  // Stage E: mirror of the athleticBias const in sortDeterministic (see there for rationale).
  const athleticBias = gp?.athleticCompoundBias === true;

  return [...candidates].sort((a, b) => {
    // 0. Preferred exercise boost (before tier rank)
    const preferred = ctx.preferredExerciseKeywords ?? [];
    if (preferred.length > 0) {
      const prefA = isPreferredExercise(a, preferred) ? 0 : 1;
      const prefB = isPreferredExercise(b, preferred) ? 0 : 1;
      if (prefA !== prefB) return prefA - prefB;
    }

    // 0.5. No-activity preference — same logic as in sortDeterministic.
    //      Applied before tier rank for consistency: a "Brak aktywności" client
    //      will never reach isPriorityEligible = true so this path only fires
    //      if the flag is set programmatically (test / edge-case safety).
    if (ctx.isNoActivityClient) {
      const naA = isRegressionCandidate(a) ? 0 : 1;
      const naB = isRegressionCandidate(b) ? 0 : 1;
      if (naA !== naB) return naA - naB;
    }

    // 0.55. Beginner preference (Stage E) — same logic as in sortDeterministic.
    //       isPriorityEligible is always false for "Początkujący" clients, so
    //       sortWithPriority falls through to sortDeterministic in practice.
    //       Included here for completeness / edge-case safety.
    if (ctx.isBeginnerClient) {
      const ldBucket = (v: number | null | undefined): number => {
        if (v == null) return 1;
        if (v <= 2) return 0;
        if (v >= 4) return 2;
        return 1;
      };
      const ldA = ldBucket(a.learningDifficulty);
      const ldB = ldBucket(b.learningDifficulty);
      if (ldA !== ldB) return ldA - ldB;
    }

    // 0.6. Regression penalty — regression exercises sink below non-regression
    //      even before tier rank, because a regression exercise should not win
    //      a compound slot just by being Tier A.
    if (penalizeRegression) {
      const regA = isRegressionCandidate(a) ? 1 : 0;
      const regB = isRegressionCandidate(b) ? 1 : 0;
      if (regA !== regB) return regA - regB;
    }

    // 1. Client muscle tier
    const ta = clientTierRank(a, ctx),
      tb = clientTierRank(b, ctx);
    if (ta !== tb) return ta - tb;

    // 1.5. High neurological load boost (same tier; sport + Dynamika / Szybkość)
    //
    // Applied within-tier so Tier A muscle priority is preserved.
    // A Tier A exercise with neuro-load 3 still beats a Tier C exercise with 5;
    // but between two Tier A candidates the higher-neuro one is preferred for
    // sport/power goals — pushing deadlifts / heavy squats over machine variants.
    if (gp?.preferHighNeurologicalLoad) {
      const hiA = (a.neurologicalFatigue ?? 0) >= 4 ? 0 : 1;
      const hiB = (b.neurologicalFatigue ?? 0) >= 4 ? 0 : 1;
      if (hiA !== hiB) return hiA - hiB;
    }

    // 1.6. Unilateral pattern preference (same tier; sport + Stabilizacja / sprawność)
    //
    // Within a tier, Wykrok (lunge / split squat) patterns rank before Przysiad
    // for stabilisation / sprawność contexts.  Has no effect on upper-body slots
    // (no Wykrok patterns there) and never blocks bilateral squats from being
    // selected — only re-orders within the same tier band.
    if (gp?.preferUnilateralPatterns) {
      const uniA = normP(a.movementPattern) === "wykrok" ? 0 : 1;
      const uniB = normP(b.movementPattern) === "wykrok" ? 0 : 1;
      if (uniA !== uniB) return uniA - uniB;
    }

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

    // 2.5. Bench-goal barbell preference (bench-goal clients only).
    //
    // When benchGoalActive is set, prefer barbell chest exercises over
    // dumbbell / bodyweight ones within the same Tier A chest candidate band.
    // Only applies between two Tier A Klatka piersiowa candidates so it has
    // no effect on shoulder, triceps or any other slot.
    //
    // Barbell detection: exercise.equipment includes "Sztanga" (case-insensitive).
    // A barbell exercise gets rank 0; everything else gets rank 1.
    if (ctx.benchGoalActive && ta === 0 && tb === 0) {
      const isChestA = norm(a.mainMuscleGroup) === norm("Klatka piersiowa");
      const isChestB = norm(b.mainMuscleGroup) === norm("Klatka piersiowa");
      if (isChestA && isChestB) {
        const barbellA = a.equipment.some(
          (e) => e.trim().toLowerCase() === "sztanga",
        )
          ? 0
          : 1;
        const barbellB = b.equipment.some(
          (e) => e.trim().toLowerCase() === "sztanga",
        )
          ? 0
          : 1;
        if (barbellA !== barbellB) return barbellA - barbellB;
      }
    }

    // 2.6. Isolation deprioritisation within the same tier (strength/conditioning)
    //
    // Applied after tier rank so Tier A isolation still beats Tier C compound —
    // this only re-orders exercises that would otherwise tie on tier.
    if (deIsolation) {
      const isoA = isIsolation(a) ? 1 : 0;
      const isoB = isIsolation(b) ? 1 : 0;
      if (isoA !== isoB) return isoA - isoB;
    }

    // 2.7. Athletic compound bias (Stage E) — sport / athletic goals deprioritise
    //      isolation within the same tier band.  Applied after tier rank so Tier A
    //      isolation still beats Tier C compound; analogous to step 2.6 for
    //      strength/conditioning but driven by a separate flag.
    if (athleticBias) {
      const isoA = isIsolation(a) ? 1 : 0;
      const isoB = isIsolation(b) ? 1 : 0;
      if (isoA !== isoB) return isoA - isoB;
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
  options?: V0EngineOptions,
): V0Result {
  // ── Step 1: Global hard filter ────────────────────────────────────────────
  // Exclude avoided exercises and blocklisted names from the entire session.
  // Also exclude plyometric exercises when ctx.allowPlyometrics is false —
  // plyometrics are only appropriate for power goals / athlete clients / plyo sessions.
  const allowPlyo = ctx?.allowPlyometrics !== false || sessionType === "plyo";
  const eligible = pool.filter(
    (ex) =>
      !ex.isAvoided &&
      !isBlocklisted(ex.name) &&
      (allowPlyo || !isPlyometric(ex.name)),
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
    pickOpts?: { protected?: boolean },
  ): ScoredAndFilteredExercise | null {
    const filtered = eligible.filter(
      (ex) => !usedExerciseIds.has(String(ex.id)) && filter(ex),
    );
    const candidates =
      ctx?.isPriorityEligible
        ? sortWithPriority(filtered, ctx, usedPatternsByMuscle)
        : sortDeterministic(filtered, ctx?.preferredExerciseKeywords, ctx);

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

    // ── Band selection ────────────────────────────────────────────────────────
    //
    // altIdx=0 (default): rank-1 always wins — behaviour is identical to before.
    // altIdx>0 (alternative): prefer a candidate whose movementPattern differs
    //   from the default pick (band[0]).  This drives family-level variety
    //   (e.g. flat press → incline press → fly) rather than same-pattern variants
    //   (e.g. flat barbell → flat smith → flat machine).
    //
    // Band sizes:
    //   BAND_MAIN      (3) for protected main-lift slots — stays within stimulus family
    //   BAND_ACCESSORY (5) for accessory / isolation / optional slots
    //
    // Diversity fallback: if the band does not contain enough pattern-diverse
    // candidates, falls back to band[min(altIdx, band.length-1)].
    const altIdx = options?.alternativeIndex ?? 0;
    // Protected main-lift slots: use a wider band for alt sessions so there are
    // more candidates to search for implement / angle diversity.  Default sessions
    // (altIdx=0) keep the tighter BAND_MAIN to stay within the quality tier.
    const bandSize = pickOpts?.protected
      ? (altIdx > 0 ? BAND_MAIN_ALT : BAND_MAIN)
      : BAND_ACCESSORY;
    const band = candidates.slice(0, bandSize);

    let selected: ScoredAndFilteredExercise;
    if (altIdx === 0 || band.length <= 1) {
      // Stable default path — unchanged from original behaviour.
      selected = band[0];
    } else {
      const defaultPattern = normP(band[0].movementPattern);
      const defaultEquip = primaryEquipmentClass(band[0].equipment);

      // Diverse candidates: different movementPattern OR different equipment class.
      //
      // The previous logic compared only movementPattern, which is too coarse —
      // flat/incline/decline/machine press all share "Pchanie poziome", so diverse
      // was almost always empty and the fallback to band[1] gave only a minor rank
      // variant rather than a genuinely different implement or angle.
      //
      // Adding equipment class as a second axis means barbell vs dumbbell vs machine
      // are now recognised as distinct even within the same pattern family.
      const diverse = band
        .slice(1)
        .filter(
          (ex) =>
            normP(ex.movementPattern) !== defaultPattern ||
            primaryEquipmentClass(ex.equipment) !== defaultEquip,
        );

      // Same-type session refinement:
      // When the previous occurrence of this session type is known (e.g. Upper A
      // when generating Upper B), sub-prefer exercises whose equipment class was
      // NOT used in that session.  This prevents "barbell flat bench → barbell
      // incline bench" when dumbbell or machine variants are available.
      //
      // Selection order:
      //   1. diverse candidates with equipment class NOT in previous same-type session
      //   2. any diverse candidate (pattern or equip differs from local band[0])
      //   3. fallback: band[min(altIdx, band.length-1)]
      const prevExercises = options?.sameTypePreviousExercises ?? [];
      if (prevExercises.length > 0 && diverse.length > 0) {
        const prevEquipClasses = new Set(
          prevExercises.map((p) => primaryEquipmentClass(p.equipment)),
        );
        const freshEquip = diverse.filter(
          (ex) => !prevEquipClasses.has(primaryEquipmentClass(ex.equipment)),
        );
        const source = freshEquip.length > 0 ? freshEquip : diverse;
        selected = source[altIdx - 1] ?? source[source.length - 1];
      } else {
        // No same-type context: use pattern/equip diverse candidates directly.
        selected =
          diverse[altIdx - 1] ?? band[Math.min(altIdx, band.length - 1)];
      }
    }

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
    // DEFAULT slot order:
    //   1. Chest push compound
    //   2. Second push compound (chest or shoulder — includes overhead press)
    //   3. Shoulder accessory   ← lateral raise / rear delt only; NO press compounds
    //   4. Triceps isolation
    //   5. (opt) Chest or triceps accessory
    //   6. (opt) Core           ← always last
    //
    // CHEST-PRIORITY variant (Tier A = Klatka piersiowa, eligible experience level):
    //   Slot 2 is restricted to chest only — guarantees a second chest compound
    //   (e.g. incline press or DB press) instead of allowing OHP to take the slot.
    //   sortWithPriority + usedPatternsByMuscle then tries to vary the stimulus angle.
    //   Slots 3–6 are unchanged; triceps remains in slot 4 (bench-press synergist).
    case "push": {
      const chestPushPriority =
        ctx?.isPriorityEligible &&
        ctx.tierA.some((t) => norm(t) === norm("Klatka piersiowa"));

      pick(
        "Chest compound",
        true,
        (ex) =>
          muscle(ex, "Klatka piersiowa") &&
          compound(ex) &&
          pattern(ex, "Pchanie poziome"),
        { protected: true },
      );

      if (chestPushPriority) {
        // Chest-priority: slot 2 locked to chest — no OHP alternative.
        // Any chest compound qualifies (all patterns accepted) so variety tracking
        // in sortWithPriority can surface incline / decline / machine variants.
        pick(
          "Second chest compound",
          true,
          (ex) => muscle(ex, "Klatka piersiowa") && compound(ex),
          { protected: true },
        );
      } else {
        // Default: chest OR shoulder vertical press
        pick(
          "Second push compound",
          true,
          (ex) =>
            muscle(ex, "Klatka piersiowa", "Barki") &&
            compound(ex) &&
            pattern(ex, "Pchanie poziome", "Pchanie pionowe"),
          { protected: true },
        );
      }

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
        { protected: true },
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
          { protected: true },
        ) ??
        pick(
          "Second pull compound",
          true,
          (ex) =>
            muscle(ex, "Plecy") &&
            compound(ex) &&
            pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
          { protected: true },
        );
      void s2;

      // Slot 3: rear delt / upper back accessory.
      //
      // Uses isPullRearDeltUpperBackSafe — see its JSDoc for the exact
      // accept / reject rules.  Key improvement over the old filter:
      //   OLD: Plecy + Izolowane (any pattern)
      //   NEW: Plecy + Izolowane + pulling pattern only
      //        → excludes hyperextensions (Zawias biodrowy) and shrugs (Inne)
      pick(
        "Rear delt or upper back",
        true,
        (ex) => isPullRearDeltUpperBackSafe(ex),
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
        { protected: true },
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
      // For intermediate+ clients, hard-block low-priority and regression filler
      // exercises first; full pool is only used when no better option exists.
      {
        const legsAccBase = (ex: ScoredAndFilteredExercise) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern);

        if (ctx?.isPriorityEligible) {
          pick(
            "Lower-body accessory",
            false,
            (ex) => legsAccBase(ex) && !isLowPriority(ex) && !isRegressionCandidate(ex) && !isBeginnerDrillByName(ex.name),
          ) ?? pick("Lower-body accessory", true, legsAccBase);
        } else {
          pick("Lower-body accessory", true, legsAccBase);
        }
      }

      pick("Calves", true, (ex) => muscle(ex, "Łydki"));

      // Second lower accessory: also blocks near-duplicate of knee pattern.
      // Placed BEFORE Core so that Core is always the final slot.
      // For intermediate+ clients, hard-block low-priority and regression filler.
      {
        const legsAcc2Base = (ex: ScoredAndFilteredExercise) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
            "Łydki",
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern);

        if (ctx?.isPriorityEligible) {
          pick(
            "Second lower accessory",
            false,
            (ex) => legsAcc2Base(ex) && !isLowPriority(ex) && !isRegressionCandidate(ex) && !isBeginnerDrillByName(ex.name),
          ) ?? pick("Second lower accessory", false, legsAcc2Base);
        } else {
          pick("Second lower accessory", false, legsAcc2Base);
        }
      }

      // Core always last
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      break;
    }

    // ── UPPER ─────────────────────────────────────────────────────────────────
    //
    // Three template variants, selected at runtime:
    //
    // DEFAULT (non-eligible or no matching Tier A muscle):
    //   1. Chest compound
    //   2. Back compound
    //   3. Shoulders
    //   4. Arms
    //   5. (opt) Accessory or core
    //
    // CHEST-PRIORITY (Tier A = Klatka piersiowa, eligible experience level):
    //   1. Chest main lift      — compound, leading slot
    //   2. Second chest lift    — compound preferred; isolation fallback
    //                            sortWithPriority + usedPatternsByMuscle vary the angle
    //   3. Back compound        — balance; always present
    //   4. Shoulders or triceps — triceps supports pressing; Barki broadens shoulder work
    //   5. (opt) Accessory or core
    //
    // BACK-PRIORITY (Tier A = Plecy, eligible experience level):
    //   1. Back main lift       — compound, vertical or horizontal pull
    //   2. Complementary pull   — prefer the opposite pattern (vertical↔horizontal)
    //                            fallback: any back compound
    //   3. Chest compound       — balance; always present
    //   4. Rear delt / biceps / back isolation — supports back development
    //   5. (opt) Accessory or core
    //
    // Priority eligibility is guarded by PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS in the route.
    // Beginners and inactive clients always receive the DEFAULT template.
    case "upper": {
      const chestUpperPriority =
        ctx?.isPriorityEligible &&
        ctx.tierA.some((t) => norm(t) === norm("Klatka piersiowa"));
      const backUpperPriority =
        ctx?.isPriorityEligible &&
        ctx.tierA.some((t) => norm(t) === norm("Plecy"));

      if (chestUpperPriority) {
        // ── UPPER — CHEST PRIORITY ─────────────────────────────────────────────
        //
        // Slot 1 family preference:
        //   1st try: barbell or dumbbell compound (hasFreeWeight) — sortWithPriority
        //            picks the highest-priority free-weight press (e.g. dumbbell incline
        //            or barbell flat bench) over an easier machine alternative.
        //   Fallback: any chest compound (machine included) when no free-weight
        //             exercise passes the equipment filter for this client.
        pick(
          "Chest main lift",
          false,
          (ex) => muscle(ex, "Klatka piersiowa") && compound(ex) && hasFreeWeight(ex),
          { protected: true },
        ) ??
          pick(
            "Chest main lift",
            true,
            (ex) => muscle(ex, "Klatka piersiowa") && compound(ex),
            { protected: true },
          );

        // Second chest lift: any chest exercise — compound preferred by sortWithPriority
        // (exercisePriority rank), isolation accepted as fallback.
        // usedPatternsByMuscle fires here: if slot 1 used "Pchanie poziome",
        // the sort promotes a fresh-pattern candidate (fly / Przywodzenie) first.
        pick(
          "Second chest lift",
          true,
          (ex) => muscle(ex, "Klatka piersiowa"),
        );

        // Back compound — always present for structural balance.
        pick(
          "Back compound",
          true,
          (ex) => muscle(ex, "Plecy") && compound(ex),
        );

        // Triceps listed alongside Barki — triceps is the primary bench-press synergist
        // and benefits most from appearing on a chest-heavy day.
        // sortWithPriority (both Tier C) falls through to exercisePriority → difficulty → id.
        pick(
          "Shoulders or triceps",
          true,
          (ex) => muscle(ex, "Triceps", "Barki"),
        );

        // Slot 5 (optional): for intermediate/advanced clients with an isolation-valued
        // goal profile (hypertrophy / fat-loss), add a second arm or shoulder slot so
        // biceps work doesn't disappear from chest-heavy days.
        if (ctx?.isPriorityEligible && ctx.goalProfile?.isolationValued) {
          pick(
            "Second arm or shoulder",
            false,
            (ex) => muscle(ex, "Biceps", "Triceps", "Barki"),
          );
        }

        // Slot 6 (optional): whitelist-gated accessory or core — always last.
        pick(
          "Accessory or core",
          false,
          (ex) => isUpperAccessorySafe(ex) && !isLowerBodyDominant(ex),
        );
      } else if (backUpperPriority) {
        // ── UPPER — BACK PRIORITY ──────────────────────────────────────────────
        const backS1 = pick(
          "Back main lift",
          true,
          (ex) =>
            muscle(ex, "Plecy") &&
            compound(ex) &&
            pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
          { protected: true },
        );

        // Prefer the complementary pull pattern for slot 2 — ensures vertical+horizontal
        // coverage within a single Upper session (mirrors Pull session logic).
        const backS1Pattern = normP(backS1?.movementPattern);
        const complementaryPull =
          backS1Pattern === "przyciąganie pionowe"
            ? "Przyciąganie poziome"
            : "Przyciąganie pionowe";

        pick(
          "Complementary back lift",
          false, // non-required; fallback below carries the required flag
          (ex) =>
            muscle(ex, "Plecy") && compound(ex) && pattern(ex, complementaryPull),
          { protected: true },
        ) ??
          pick(
            "Second back compound",
            true,
            (ex) =>
              muscle(ex, "Plecy") &&
              compound(ex) &&
              pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome"),
            { protected: true },
          );

        // Chest compound — always present for structural balance.
        pick(
          "Chest compound",
          true,
          (ex) => muscle(ex, "Klatka piersiowa") && compound(ex),
          { protected: true },
        );

        // Rear delt / biceps / back isolation — supports back development.
        //
        // Accepted families:
        //   • isRearDeltBarki       — rear-delt fly, face pull (Barki + pull/abduction)
        //   • Biceps                — biceps isolation (arm synergist for pulling)
        //   • Plecy + Izolowane + pull pattern only
        //                           — straight-arm pulldown (Przyciąganie pionowe)
        //                             and similar pull-family back isolation
        //
        // Rejected by the Plecy + Izolowane clause:
        //   • isBackExtension       — Wznosy tułowia (Zawias biodrowy + Izolowane)
        //   • isShrug               — Szrugowanie / Szrugsy (pattern "Inne")
        //   These are filtered by requiring pattern ∈ {Przyciąganie pionowe, poziome}.
        pick(
          "Rear delt or biceps",
          true,
          (ex) =>
            isRearDeltBarki(ex) ||
            muscle(ex, "Biceps") ||
            (muscle(ex, "Plecy") &&
              ex.exerciseType != null &&
              norm(ex.exerciseType) === "izolowane" &&
              pattern(ex, "Przyciąganie pionowe", "Przyciąganie poziome")),
        );

        // Slot 4.5 (optional): for intermediate/advanced clients with an isolation-valued
        // goal profile (hypertrophy / fat-loss), guarantee a triceps slot so arm work
        // doesn't disappear entirely from back-priority upper sessions.
        // Back-priority already covers back well via slots 1–2; triceps rounds out the
        // pressing synergist chain that overhead press and push days normally handle.
        if (ctx?.isPriorityEligible && ctx.goalProfile?.isolationValued) {
          pick(
            "Triceps direct work",
            false,
            (ex) => muscle(ex, "Triceps"),
          );
        }

        // Slot 5: whitelist-gated — only sensible upper-body accessory / isolation / core.
        // isUpperAccessorySafe is the primary gate (rejects shrugs, back extensions,
        // deadlifts, Jefferson Curl, and all lower-body primary movers by admission
        // logic rather than by exclusion).  isLowerBodyDominant is kept as an extra guard.
        pick(
          "Accessory or core",
          false,
          (ex) => isUpperAccessorySafe(ex) && !isLowerBodyDominant(ex),
        );
      } else {
        // ── UPPER — DEFAULT ────────────────────────────────────────────────────
        // All Barki exercises welcome in Upper — overhead press is the primary
        // shoulder stimulus in an Upper session (no separate push/pull split here).
        // There is no separate rear-delt slot in Upper — that granularity belongs in Pull.
        pick(
          "Chest compound",
          true,
          (ex) => muscle(ex, "Klatka piersiowa") && compound(ex),
          { protected: true },
        );
        pick(
          "Back compound",
          true,
          (ex) => muscle(ex, "Plecy") && compound(ex),
          { protected: true },
        );
        pick("Shoulders", true, (ex) => muscle(ex, "Barki"));

        // ── Slot 4: Goal-aware arm slot ────────────────────────────────────────
        //
        // The generic "pick Biceps or Triceps" default produces identical output
        // across all goals because every candidate in that filter is isolation —
        // deIsolation / athleticBias sort steps have no effect within a slot that
        // only admits isolation exercises in the first place.
        //
        // Goal-specific behaviour:
        //   strength   → try Triceps first (bench-press synergist for pressing strength);
        //                 fall back to Biceps/Triceps if no Triceps candidate remains.
        //   athletic   → try Triceps OR rear-delt pull first (functional support over
        //                 bodybuilding curl); fall back to Biceps/Triceps.
        //   physique / fat-loss / conditioning / general
        //              → unchanged: both Biceps and Triceps are valid, isolation valued.
        {
          const goalBiasArm = ctx?.goalProfile?.exerciseClassBias;
          if (goalBiasArm === "strength") {
            pick("Triceps support", false, (ex) => muscle(ex, "Triceps")) ??
              pick("Arms", true, (ex) => muscle(ex, "Biceps", "Triceps"));
          } else if (goalBiasArm === "athletic") {
            // Prefer triceps compounds/isolation OR rear-delt pulls (face pull,
            // reverse fly) over a plain biceps curl as the "default" arm slot.
            pick(
              "Athletic arm support",
              false,
              (ex) =>
                muscle(ex, "Triceps") ||
                (muscle(ex, "Barki") &&
                  !compound(ex) &&
                  (pattern(ex, "Przyciąganie poziome") ||
                    (pattern(ex, "Odwodzenie") &&
                      isRearDeltMovement(ex.name)))),
            ) ?? pick("Arms", true, (ex) => muscle(ex, "Biceps", "Triceps"));
          } else {
            pick("Arms", true, (ex) => muscle(ex, "Biceps", "Triceps"));
          }
        }

        // ── Slot 5: Preferred-exercise gateway + standard accessory ────────────
        //
        // For athletic/sprawność goals: preferred functional exercises (carries,
        // landmine variants, shoulder-support compounds) that would be blocked by
        // isUpperAccessorySafe are tried first via a broader gate.  The gateway
        // only opens when the client has preferred keywords set AND the goal bias
        // is "athletic" — it does not fire for physique, strength, or general goals.
        //
        // For all other goals: standard whitelist-gated accessory or core.
        {
          const gwKeywords = ctx?.preferredExerciseKeywords ?? [];
          const isAthleticSlot5 = ctx?.goalProfile?.exerciseClassBias === "athletic";

          if (gwKeywords.length > 0 && isAthleticSlot5) {
            pick(
              "Preferred functional support",
              false,
              (ex) =>
                !isLowerBodyDominant(ex) &&
                isPreferredExercise(ex, gwKeywords) &&
                (isUpperAccessorySafe(ex) ||
                  isCarryMovement(ex.name) ||
                  (muscle(ex, "Barki", "Plecy") &&
                    compound(ex) &&
                    !pattern(ex, "Zawias biodrowy"))),
            ) ??
              pick(
                "Accessory or core",
                false,
                (ex) => isUpperAccessorySafe(ex) && !isLowerBodyDominant(ex),
              );
          } else {
            pick(
              "Accessory or core",
              false,
              (ex) => isUpperAccessorySafe(ex) && !isLowerBodyDominant(ex),
            );
          }
        }
      }
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
        { protected: true },
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
      // For intermediate+ clients, hard-block low-priority and regression filler
      // exercises first; full pool is the fallback when no better option exists.
      {
        const lowerAccBase = (ex: ScoredAndFilteredExercise) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern);

        if (ctx?.isPriorityEligible) {
          pick(
            "Lower-body accessory",
            false,
            (ex) => lowerAccBase(ex) && !isLowPriority(ex) && !isRegressionCandidate(ex) && !isBeginnerDrillByName(ex.name),
          ) ?? pick("Lower-body accessory", true, lowerAccBase);
        } else {
          pick("Lower-body accessory", true, lowerAccBase);
        }
      }

      // Slot 4: prefer calves; fall back to core if unavailable.
      const s4Calves = pick("Calves", false, (ex) => muscle(ex, "Łydki"));
      if (s4Calves === null) {
        // Required fallback — core fills the slot and is already the last exercise.
        pick("Calves slot (core fallback)", true, (ex) => muscle(ex, "Brzuch"));
      }

      // Extra lower accessory: also blocks near-duplicate of knee pattern.
      // Placed BEFORE the optional Core slot so Core remains last.
      // For intermediate+ clients, hard-block low-priority and regression filler.
      {
        const extraLowerBase = (ex: ScoredAndFilteredExercise) =>
          muscle(
            ex,
            "Pośladki",
            "Przywodziciele",
            "Mięśnie czworogłowe uda",
            "Mięśnie dwugłowe uda",
            "Łydki",
          ) &&
          (kneeDominantPattern === null ||
            normP(ex.movementPattern) !== kneeDominantPattern);

        if (ctx?.isPriorityEligible) {
          pick(
            "Extra lower-body accessory",
            false,
            (ex) => extraLowerBase(ex) && !isLowPriority(ex) && !isRegressionCandidate(ex) && !isBeginnerDrillByName(ex.name),
          ) ?? pick("Extra lower-body accessory", false, extraLowerBase);
        } else {
          pick("Extra lower-body accessory", false, extraLowerBase);
        }
      }

      // Core always last — only added when Calves successfully filled slot 4.
      // When core was the slot 4 fallback it is already present; adding it again
      // would pick a DIFFERENT core exercise (usedExercises dedup prevents repeats),
      // which is acceptable but usually unwanted. Skip it for cleanliness.
      if (s4Calves !== null) {
        pick("Core", false, (ex) => muscle(ex, "Brzuch"));
      }
      break;
    }

    // ── PLYO (Plyometria) ─────────────────────────────────────────────────────
    //
    // Athletic-support session for sport-performing clients.
    // IMPORTANT — scope rules:
    //   • Plyo is NOT a bodybuilding split and is NOT a legs replacement.
    //   • It is an additional session that coexists with full_body / upper_lower /
    //     push_pull_legs (e.g. FBW + Plyo, Upper/Lower + Plyo support day).
    //   • Only offered when athlete-support logic is active (see athleteAndPlyoRules.ts).
    //
    // Session structure (logical order — mirrors the spec):
    //   1. Lower-body explosive compound  → reactive / jumping qualities
    //   2. Hip-hinge compound             → deceleration / eccentric / landing mechanics
    //   3. Calves / reactive lower chain  → tendon stiffness, ankle reactivity
    //   4. (opt) Second lower accessory   → supplementary athletic quality work
    //   5. (opt) Core / trunk             → always last; stabilisation for reactive movements
    //
    // The exact exercise inventory depends on what is in the DB.
    // Exercises tagged with higher exercisePriority / lower learningDifficulty
    // naturally rank ahead via the existing sort — no special scoring is needed.
    case "plyo": {
      // Slot 1: Explosive knee-dominant compound (squat / lunge / jump pattern).
      // Uses the canonical mainMuscleGroup values that exist in the DB.
      // Accepts "Inne" movement pattern so purpose-built plyometric exercises
      // (e.g. Skoki pogo) can fill this slot when the pool contains them.
      pick(
        "Explosive lower compound",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Pośladki") &&
          compound(ex) &&
          pattern(ex, "Przysiad", "Wykrok", "Inne"),
        { protected: true },
      );

      // Slot 2: Hip-hinge compound — deceleration, landing mechanics, posterior chain.
      pick(
        "Hip-hinge deceleration compound",
        true,
        (ex) =>
          muscle(ex, "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda", "Pośladki", "Plecy") &&
          compound(ex) &&
          pattern(ex, "Zawias biodrowy"),
        { protected: true },
      );

      // Slot 3: Calves / reactive lower chain.
      // Falls back to any non-compound lower-body accessory if calves pool is empty.
      const plyoS3 = pick(
        "Calves / reactive lower chain",
        false,
        (ex) => muscle(ex, "Łydki"),
      );
      if (!plyoS3) {
        pick(
          "Lower accessory fallback",
          true,
          (ex) =>
            muscle(ex, "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda", "Pośladki") &&
            !compound(ex),
        );
      }

      // Slot 4 (optional): Second lower-body accessory for supplementary
      // athletic quality work (additional hip / quad / calf variety).
      pick(
        "Lower body accessory",
        false,
        (ex) => muscle(ex, "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda", "Pośladki", "Łydki"),
      );

      // Slot 5 (optional): Core / trunk — always last.
      // Trunk control is essential for all reactive movements; even a single
      // core exercise meaningfully supports athletic performance.
      pick("Core", false, (ex) => muscle(ex, "Brzuch"));
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
