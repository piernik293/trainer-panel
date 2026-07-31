/**
 * Exercise Recommendation Engine
 *
 * Pure scoring functions: exercise × client survey → scored recommendation.
 *
 * Architecture note
 * -----------------
 * This module has ZERO dependency on the HTTP layer, ORM, or any route module.
 * Inputs are plain inferred DB types so the same logic is consumable by:
 *
 *   • REST endpoint  GET /clients/:id/exercise-recommendations  (current)
 *   • FUTURE: AI plan-generation engine — pass the scored list as the exercise
 *             pool, filtered to score >= threshold.
 *   • FUTURE: Automatic substitution engine — score candidate substitutes
 *             against the client profile and return the best match.
 *   • FUTURE: Progressive overload filter — weight scoring by recency of use.
 *
 * Adding a new dimension
 * ----------------------
 * 1. Write a pure `score<Dimension>()` function returning ScoreBreakdown.
 * 2. Add it to the dimensions array inside `scoreExercise`.
 * 3. Update MAX_RAW_SCORE if the new max positive points changes.
 * 4. Document the range in the JSDoc.
 */

import type { Exercise, Survey } from "@workspace/db";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  dimension: string;
  /** Points awarded (positive) or deducted (negative) by this dimension. */
  points: number;
  /** Human-readable reason shown in the UI. null = silent (no reason shown). */
  reason: string | null;
}

export interface ExerciseScore {
  exerciseId: number;
  /** Normalised 0-100 score. 100 = perfect match across all dimensions. */
  score: number;
  /** Positive reasons to surface in the trainer UI. */
  matchReasons: string[];
  /** Penalty signals to surface in the trainer UI. */
  warnReasons: string[];
  /** Full breakdown of every dimension for debugging / future AI use. */
  breakdown: ScoreBreakdown[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Parse a free-text comma/semicolon-separated list into trimmed tokens. */
function parseList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Map location alias values to the canonical stored form used in exercises.
 * Client surveys may store "Siłownia plenerowa" while exercises use the
 * canonical value "Plener".  Normalising both sides before comparison ensures
 * the recommendation engine scores the match correctly.
 */
const LOCATION_CANONICAL: Record<string, string> = {
  "siłownia plenerowa": "plener",
};
function canonicalLocation(s: string): string {
  const n = norm(s);
  return LOCATION_CANONICAL[n] ?? n;
}

/**
 * Loose equipment match: "Sztanga olimpijska" should match client equipment
 * entry "Sztanga". Checks for substring inclusion in both directions.
 */
function equipmentMatch(required: string, available: string): boolean {
  const r = norm(required);
  const a = norm(available);
  return r.includes(a) || a.includes(r);
}

// Equipment requiring no external hardware — always accessible.
const BODYWEIGHT_EQUIPMENT = new Set([
  "brak sprzętu",
  "masa własnego ciała",
]);

// Maps client experience level → difficulty levels that are appropriate.
//
// "Brak aktywności fizycznej" is intentionally NOT mapped to ["Początkujący"].
// Its suitability scoring is handled by the dedicated scoreNoActivityFit function
// (learningDifficulty ≤2 → +6, neurologicalFatigue ≤2 → +4, jointStress
// "Niskie" → +6, domsPotential ≤2 → +3, with corresponding penalties for
// high values).  Adding a difficultyLevel match here would give "Brak aktywności"
// clients the same +10 bonus as "Początkujący" clients on identically-tagged
// exercises, collapsing the two levels into the same scoring profile.
//
// Mapping it to [] means scoreDifficultyMatch contributes 0 for this level —
// the dedicated scoreNoActivityFit signal is the sole difficulty proxy, which is
// richer, more specific, and correctly distinguishes the two levels.
const APPROPRIATE_DIFFICULTY: Record<string, string[]> = {
  "brak aktywności fizycznej": [],
  "początkujący": ["Początkujący"],
  "średniozaawansowany": ["Średniozaawansowany", "Początkujący"],
  "zaawansowany": ["Zaawansowany", "Średniozaawansowany"],
};

// ─── Scoring dimensions ───────────────────────────────────────────────────────

/**
 * Experience level fit.
 * +25 — exercise is tagged for the client's level.
 * +10 — exercise has no level restriction (suitable for all).
 * +0  — exercise is tagged but does not include the client's level.
 */
function scoreExperienceLevel(ex: Exercise, sv: Survey): ScoreBreakdown {
  const levels = ex.suitableExperienceLevels ?? [];
  if (levels.length === 0) {
    // No restriction declared → treat as universal
    return { dimension: "experienceLevel", points: 10, reason: null };
  }
  const clientLevel = norm(sv.experienceLevel ?? "");
  if (!clientLevel) return { dimension: "experienceLevel", points: 0, reason: null };
  if (levels.some((l) => norm(l) === clientLevel)) {
    return {
      dimension: "experienceLevel",
      points: 25,
      reason: "Dopasowany poziom doświadczenia",
    };
  }
  return { dimension: "experienceLevel", points: 0, reason: null };
}

/**
 * Training goal alignment.
 * +20 — exercise trainingGoals array contains the client's primary goal.
 */
function scoreTrainingGoal(ex: Exercise, sv: Survey): ScoreBreakdown {
  const clientGoal = sv.trainingGoal?.trim();
  if (!clientGoal) return { dimension: "trainingGoal", points: 0, reason: null };
  const goals = ex.trainingGoals ?? [];
  if (goals.some((g) => norm(g) === norm(clientGoal))) {
    return {
      dimension: "trainingGoal",
      points: 20,
      reason: `Cel treningowy: ${clientGoal}`,
    };
  }
  return { dimension: "trainingGoal", points: 0, reason: null };
}

/**
 * Training location match.
 * +20 — exercise supports the client's training location.
 */
function scoreTrainingLocation(ex: Exercise, sv: Survey): ScoreBreakdown {
  const clientLoc = sv.trainingLocation?.trim();
  if (!clientLoc) return { dimension: "trainingLocation", points: 0, reason: null };
  const locations = ex.trainingLocation ?? [];
  if (locations.some((l) => canonicalLocation(l) === canonicalLocation(clientLoc))) {
    return {
      dimension: "trainingLocation",
      points: 20,
      reason: `Pasuje do miejsca: ${clientLoc}`,
    };
  }
  return { dimension: "trainingLocation", points: 0, reason: null };
}

/**
 * Equipment accessibility.
 * +15 — all required equipment available (or exercise is bodyweight).
 * +7  — at least half of required equipment is available.
 * +0  — insufficient equipment information.
 */
function scoreEquipment(ex: Exercise, sv: Survey): ScoreBreakdown {
  const required = ex.equipment ?? [];

  if (required.length === 0) {
    return { dimension: "equipment", points: 15, reason: "Brak wymagań sprzętowych" };
  }

  // All required items are bodyweight → always accessible
  if (required.every((e) => BODYWEIGHT_EQUIPMENT.has(norm(e)))) {
    return { dimension: "equipment", points: 15, reason: "Ćwiczenie bez sprzętu" };
  }

  const clientEquipment = parseList(sv.equipment);
  if (clientEquipment.length === 0) {
    return { dimension: "equipment", points: 0, reason: null };
  }

  const nonBodyweight = required.filter((e) => !BODYWEIGHT_EQUIPMENT.has(norm(e)));
  const matched = nonBodyweight.filter((req) =>
    clientEquipment.some((ce) => equipmentMatch(req, ce)),
  );
  const ratio = matched.length / nonBodyweight.length;

  if (ratio === 1) {
    return { dimension: "equipment", points: 15, reason: "Dostępny sprzęt" };
  }
  if (ratio >= 0.5) {
    return { dimension: "equipment", points: 7, reason: null };
  }
  return { dimension: "equipment", points: 0, reason: null };
}

/**
 * Priority muscle targeting.
 * +15 — mainMuscleGroup matches the client's top priority muscle.
 * +10 — matches priority #2.
 * +5  — matches priority #3.
 */
function scorePriorityMuscles(ex: Exercise, sv: Survey): ScoreBreakdown {
  const main = norm(ex.mainMuscleGroup ?? "");
  const checks: Array<[string | null | undefined, number, string]> = [
    [sv.priorityMuscle1, 15, "Priorytet #1"],
    [sv.priorityMuscle2, 10, "Priorytet #2"],
    [sv.priorityMuscle3, 5,  "Priorytet #3"],
  ];
  for (const [muscle, pts, label] of checks) {
    if (muscle && norm(muscle) === main) {
      return {
        dimension: "priorityMuscle",
        points: pts,
        reason: `${label}: ${muscle}`,
      };
    }
  }
  return { dimension: "priorityMuscle", points: 0, reason: null };
}

/**
 * Intrinsic exercise priority (programming importance).
 * +10 "Bardzo wysoki" / +7 "Wysoki" / +4 "Średni" / +1 "Niski".
 *
 * FUTURE: AI plan engine should weight priority-score exercises earlier in
 * each training day to front-load high-CNS compound movements.
 */
function scoreExercisePriority(ex: Exercise): ScoreBreakdown {
  const map: Record<string, number> = {
    "Bardzo wysoki": 10,
    "Wysoki": 7,
    "Średni": 4,
    "Niski": 1,
  };
  const pts = ex.exercisePriority ? (map[ex.exercisePriority] ?? 0) : 0;
  return { dimension: "exercisePriority", points: pts, reason: null };
}

/**
 * Difficulty level appropriateness.
 * +10 — difficulty matches the expected range for the client's experience level.
 */
function scoreDifficultyMatch(ex: Exercise, sv: Survey): ScoreBreakdown {
  const diff = ex.difficultyLevel;
  const exp = norm(sv.experienceLevel ?? "");
  if (!diff || !exp) return { dimension: "difficulty", points: 0, reason: null };

  const appropriate = APPROPRIATE_DIFFICULTY[exp] ?? [];
  if (appropriate.includes(diff)) {
    return {
      dimension: "difficulty",
      points: 10,
      reason: `Poziom trudności dopasowany: ${diff}`,
    };
  }
  return { dimension: "difficulty", points: 0, reason: null };
}

/**
 * Avoided muscle penalty.
 * -30 — primary muscle group is on the client's avoid list.
 * -15 — only secondary muscles overlap with the avoid list.
 *
 * FUTURE: Injury adaptation engine should replace this binary penalty with
 * a range-of-motion-aware filter using healthLimitations data.
 */
function penaliseAvoidedMuscles(ex: Exercise, sv: Survey): ScoreBreakdown {
  const avoided = parseList(sv.avoidedMuscles).map(norm);
  if (avoided.length === 0) {
    return { dimension: "avoidedMuscles", points: 0, reason: null };
  }

  const main = norm(ex.mainMuscleGroup ?? "");
  if (avoided.some((a) => main.includes(a) || a.includes(main))) {
    return {
      dimension: "avoidedMuscles",
      points: -30,
      reason: "Unikana główna partia mięśniowa",
    };
  }

  const secondaries = (ex.secondaryMuscleGroups ?? []).map(norm);
  const secondaryHit = secondaries.some((s) =>
    avoided.some((a) => s.includes(a) || a.includes(s)),
  );
  if (secondaryHit) {
    return {
      dimension: "avoidedMuscles",
      points: -15,
      reason: "Zawiera unikaną partię pomocniczą",
    };
  }

  return { dimension: "avoidedMuscles", points: 0, reason: null };
}

/**
 * No-Activity introductory stage fit.
 *
 * Only fires when the client level is "Brak aktywności fizycznej".
 * Scores positively for exercises with low technical complexity, low joint
 * stress, low neurological fatigue and low DOMS potential — all traits that
 * make an exercise safe and learnable for a previously inactive person.
 * Penalises and warns for exercises that are unsuitable at this stage.
 *
 * Points (only active for "Brak aktywności fizycznej" clients):
 *   jointStress    "Niskie" → +6  |  "Wysokie" → −8  + warn
 *   learningDiff   ≤ 2     → +6  |  ≥ 4       → −8  + warn
 *   neuroFatigue   ≤ 2     → +4  |  ≥ 4       → −6  + warn
 *   domsPotential  ≤ 2     → +3  |  ≥ 4       → −5  + warn
 *
 * MAX_RAW_SCORE is intentionally not increased by the +19 ceiling — the
 * score formula's Math.min(100, …) cap handles any over-shot naturally,
 * and non-No-Activity clients always return 0 from this dimension.
 */
function scoreNoActivityFit(ex: Exercise, sv: Survey): ScoreBreakdown {
  if (norm(sv.experienceLevel ?? "") !== "brak aktywności fizycznej") {
    return { dimension: "noActivityFit", points: 0, reason: null };
  }

  let points = 0;
  const warnings: string[] = [];

  // Joint stress
  if (ex.jointStress === "Niskie") {
    points += 6;
  } else if (ex.jointStress === "Wysokie") {
    points -= 8;
    warnings.push("wysokie obciążenie stawów");
  }

  // Learning difficulty (numeric 1–5; lower = easier to learn)
  const ld = ex.learningDifficulty;
  if (ld != null) {
    if (ld <= 2)       { points += 6; }
    else if (ld >= 4)  { points -= 8; warnings.push("wysoka trudność techniczna"); }
  }

  // Neurological fatigue (numeric 1–5)
  const nf = ex.neurologicalFatigue;
  if (nf != null) {
    if (nf <= 2)       { points += 4; }
    else if (nf >= 4)  { points -= 6; warnings.push("duże zmęczenie układu nerwowego"); }
  }

  // DOMS potential (numeric 1–5)
  const dp = ex.domsPotential;
  if (dp != null) {
    if (dp <= 2)       { points += 3; }
    else if (dp >= 4)  { points -= 5; warnings.push("wysokie ryzyko silnych zakwasów"); }
  }

  if (warnings.length > 0) {
    return {
      dimension: "noActivityFit",
      points,
      reason: `Ćwiczenie nie jest optymalne dla etapu wprowadzającego (${warnings.join(", ")}).`,
    };
  }
  if (points > 0) {
    return {
      dimension: "noActivityFit",
      points,
      reason: "Odpowiednie parametry dla etapu wprowadzającego",
    };
  }
  return { dimension: "noActivityFit", points, reason: null };
}

// ─── Stage E: exercise class alignment scoring ────────────────────────────────

/**
 * Derive the client's desired exercise class bias from their training goal.
 * Mirrors the logic in goalProfileService.ts without importing from it so
 * recommendation-engine.ts keeps its zero-HTTP-dependency contract.
 *
 * Bias values:
 *   hypertrophy  — Budowa sylwetki / Redukcja tkanki tłuszczowej
 *   strength     — Zwiększenie siły
 *   conditioning — Poprawa kondycji
 *   athletic     — Poprawa sprawności / Cel sportowy
 *   general      — no recognised goal; scoring disabled
 */
type GoalBias = "hypertrophy" | "strength" | "conditioning" | "athletic" | "general";

function inferGoalBias(sv: Survey): GoalBias {
  const g = norm(sv.trainingGoal ?? "");
  if (
    g.includes("budow") || g.includes("sylwet") || g.includes("hipert") ||
    g.includes("redukcj") || g.includes("tłuszcz") || g.includes("odchudzani") ||
    g === "budowa sylwetki" || g === "redukcja tkanki tłuszczowej"
  ) return "hypertrophy";
  if (g.includes("siłę") || g.includes("siły") || g.includes("powerlifting") ||
      g.includes("strength") || g === "zwiększenie siły") return "strength";
  if (g.includes("kondycj") || g.includes("wytrzymałoś") || g.includes("cardio") ||
      g.includes("aerob") || g === "poprawa kondycji") return "conditioning";
  if (g.includes("sprawnoś") || g.includes("atletyczn") || g.includes("motoryk") ||
      g.includes("koordynacj") || g.includes("zwinnoś") || g.includes("sportow") ||
      g === "poprawa sprawności" || g === "cel sportowy") return "athletic";
  return "general";
}

/**
 * Derive the exercise's structural class from existing DB fields.
 * No DB migration required — uses only columns already populated in the library.
 *
 * Class priority order (first match wins):
 *   regression_beginner — suitableForNoActivity === true
 *   core                — mainMuscleGroup "Brzuch"
 *   isolation           — exerciseType "Izolowane"
 *   plyometric_power    — movementCategory "plyometryczne" or jump/explosive pattern
 *   main_compound       — compound with exercisePriority "Bardzo wysoki" | "Wysoki"
 *   secondary_compound  — all remaining (compound with Średni/Niski priority, or unlabelled)
 */
type ExerciseClass =
  | "regression_beginner"
  | "core"
  | "isolation"
  | "plyometric_power"
  | "main_compound"
  | "secondary_compound";

function deriveExerciseClass(ex: Exercise): ExerciseClass {
  if (ex.suitableForNoActivity === true) return "regression_beginner";
  if (norm(ex.mainMuscleGroup ?? "") === "brzuch") return "core";
  if (ex.exerciseType != null && norm(ex.exerciseType) === "izolowane") return "isolation";

  const mp = norm(ex.movementPattern ?? "");
  const mc = norm(ex.movementCategory ?? "");
  if (
    mc === "plyometryczne" || mc.includes("plyomet") ||
    mp === "skok" || mp === "wyskok" || mp.includes("wybici")
  ) return "plyometric_power";

  if (ex.exerciseType != null && norm(ex.exerciseType) === "złożone") {
    const pri = ex.exercisePriority;
    if (pri === "Bardzo wysoki" || pri === "Wysoki") return "main_compound";
    return "secondary_compound";
  }

  return "secondary_compound"; // functional / unlabelled fallback
}

/**
 * Exercise class alignment with the client's training goal.
 *
 * Rewards exercises whose structural class fits the goal's selection philosophy;
 * mildly penalises mismatches (e.g. isolation in a strength context).
 *
 * Points ranges:
 *   hypertrophy  → compound +6, isolation +4, plyometric −4
 *   strength     → main_compound +8, secondary_compound +4, isolation −3
 *   conditioning → compound +5, isolation −5
 *   athletic     → main_compound +6, secondary_compound +3, plyometric_power +5, isolation −4
 *   general      → 0 (no bias)
 *
 * MAX positive: +8 (strength / main compound).  Not added to MAX_RAW_SCORE —
 * same pattern as scoreNoActivityFit: the Math.min(100, …) cap handles overshoot
 * and these points only fire when the goal is set.
 */
function scoreExerciseClassAlignment(ex: Exercise, sv: Survey): ScoreBreakdown {
  const bias = inferGoalBias(sv);
  if (bias === "general") return { dimension: "exerciseClassAlignment", points: 0, reason: null };

  const cls = deriveExerciseClass(ex);
  let points = 0;

  switch (bias) {
    case "hypertrophy":
      if (cls === "main_compound" || cls === "secondary_compound") points = 6;
      else if (cls === "isolation") points = 4;
      else if (cls === "plyometric_power") points = -4;
      break;
    case "strength":
      if (cls === "main_compound") points = 8;
      else if (cls === "secondary_compound") points = 4;
      else if (cls === "isolation") points = -3;
      break;
    case "conditioning":
      if (cls === "main_compound" || cls === "secondary_compound") points = 5;
      else if (cls === "isolation") points = -5;
      break;
    case "athletic":
      if (cls === "main_compound") points = 6;
      else if (cls === "secondary_compound") points = 3;
      else if (cls === "plyometric_power") points = 5;
      else if (cls === "isolation") points = -4;
      break;
  }

  return {
    dimension: "exerciseClassAlignment",
    points,
    reason: points > 0 ? `Klasa ćwiczenia dopasowana do celu (${cls})` : null,
  };
}

/**
 * Progression suitability for intermediate+ clients with loadable equipment.
 *
 * Fires only when the client is "Średniozaawansowany" or "Zaawansowany"
 * AND their survey lists loadable equipment (Hantle, Sztanga, or Kettlebell).
 *
 * Motivation
 * ----------
 * Two gaps in the base scoring stack let beginner regressions beat loadable
 * exercises for intermediate dumbbell clients:
 *
 *   1. scoreEquipment gives +15 to bodyweight exercises (always accessible)
 *      AND +15 to dumbbell exercises when the client has dumbbells — there is
 *      no "prefer the loaded variant over the unloaded one" signal.
 *
 *   2. scoreDifficultyMatch gives +10 to "Początkujący" difficulty exercises
 *      for intermediate clients (Początkujący ∈ appropriate range).  A beginner
 *      regression tagged "Początkujący" therefore scores identically on difficulty
 *      to a well-matched intermediate exercise.
 *
 * Result: incline push-ups and dumbbell bench presses score the same for an
 * intermediate client who owns a bench and dumbbells.  This dimension adds the
 * missing "prefer the option that can be progressively overloaded" signal.
 *
 * Rules (only active for intermediate+ with loadable equipment)
 * -------------------------------------------------------------
 *   +12 — exercise uses loadable equipment (Hantle / Sztanga / Kettlebell)
 *         AND is NOT a beginner regression (suitableForNoActivity ≠ true).
 *         Rationale: positive overload potential, appropriate challenge level.
 *   −8  — exercise is flagged suitableForNoActivity = true (a beginner
 *         regression / no-activity exercise).  The penalty is mild enough to
 *         keep the exercise selectable as a last resort when no loaded option
 *         passes the slot's hard filters (equipment constraints, pain limits).
 *   0   — pure bodyweight exercise that is NOT a regression (pull-ups, dips,
 *         standard push-ups used as accessories, core movements).  Neutral —
 *         appropriate for any level, no overload bonus needed.
 *
 * Safe fallback: always returns 0 for beginners, inactive clients, or clients
 * without loadable equipment in their survey (e.g. bodyweight-only training).
 */
function scoreProgressionSuitability(ex: Exercise, sv: Survey): ScoreBreakdown {
  const level = norm(sv.experienceLevel ?? "");
  const isIntermediatePlus =
    level === "średniozaawansowany" || level === "zaawansowany";
  if (!isIntermediatePlus) {
    return { dimension: "progressionSuitability", points: 0, reason: null };
  }

  const surveyEquip = sv.equipment ?? "";
  const surveyEquipLower = surveyEquip.toLowerCase();
  const hasLoadable =
    surveyEquipLower.includes("hantle") ||
    surveyEquipLower.includes("sztanga") ||
    surveyEquipLower.includes("kettlebell");
  if (!hasLoadable) {
    return { dimension: "progressionSuitability", points: 0, reason: null };
  }

  // Beginner regression penalty — mild enough to keep exercise as fallback.
  if (ex.suitableForNoActivity === true) {
    return {
      dimension: "progressionSuitability",
      points: -8,
      reason: "Ćwiczenie regresywne — dostępny sprzęt z progresją",
    };
  }

  // Loadable reward — exercise actively uses the client's available loaded equipment.
  const exEquip = ex.equipment ?? [];
  const usesLoadable = exEquip.some((e) => {
    const en = norm(e);
    return en.includes("hantle") || en.includes("sztanga") || en.includes("kettlebell");
  });
  if (usesLoadable) {
    return {
      dimension: "progressionSuitability",
      points: 12,
      reason: "Ćwiczenie z progresją obciążenia",
    };
  }

  // Pure bodyweight, non-regression — neutral (pull-ups, dips, core, etc.)
  return { dimension: "progressionSuitability", points: 0, reason: null };
}

/**
 * Sub-target muscle bias matching.
 *
 * Reads the exercise's sub_target_biases JSONB column (populated for ~62/156
 * exercises — chest inner/outer, back width/thickness, shoulder front/lateral, etc.)
 * and adds +5 per sub-target key that matches one of the client's priority muscles.
 *
 * This fills the gap where scorePriorityMuscles only checks mainMuscleGroup:
 * a rear-delt exercise whose mainMuscleGroup is "Barki" would score full priority
 * match, but a chest-emphasis cable fly whose mainMuscleGroup is "Klatka piersiowa"
 * can now get an extra +5 when the client prioritises the chest inner region.
 *
 * Matching: sub-target key vs priority muscle via substring (both directions).
 * Cap: +12 (prevents a single exercise from outranking everything via sub-biases alone).
 *
 * MAX positive: +12.  Not added to MAX_RAW_SCORE — same pattern as above.
 */
function scoreSubTargetBias(ex: Exercise, sv: Survey): ScoreBreakdown {
  const biases = ex.subTargetBiases as Record<string, number> | null | undefined;
  if (!biases || typeof biases !== "object" || Array.isArray(biases)) {
    return { dimension: "subTargetBias", points: 0, reason: null };
  }

  const priorityMuscles = [sv.priorityMuscle1, sv.priorityMuscle2, sv.priorityMuscle3]
    .filter((m): m is string => !!m?.trim())
    .map(norm);

  if (priorityMuscles.length === 0) {
    return { dimension: "subTargetBias", points: 0, reason: null };
  }

  let points = 0;
  for (const [key, weight] of Object.entries(biases)) {
    if (typeof weight !== "number" || weight <= 0) continue;
    const keyNorm = norm(key);
    const matches = priorityMuscles.some(
      (m) => keyNorm.includes(m) || m.includes(keyNorm),
    );
    if (matches) points += 5;
  }

  points = Math.min(points, 12);
  return {
    dimension: "subTargetBias",
    points,
    reason: points > 0 ? "Ćwiczenie angażuje priorytetowe partie cząstkowe" : null,
  };
}

// ─── Adaptive-start safety constraints ───────────────────────────────────────

/**
 * Hard penalty for plyometric/explosive exercises when adaptive-start mode is
 * active.  The score-no-activity-fit dimension already penalises high learning
 * difficulty and joint stress, but plyometric_power exercises can still score
 * well for clients with athletic goals.  This dimension ensures they are
 * effectively excluded as primary work in an adaptive-start plan — regardless
 * of the client's goal bias — matching the spec requirement:
 *
 *   "No advanced instability or plyometrics as primary work."
 *
 * Penalty: -20 for plyometric_power class.
 * Fires only when opts.useAdaptiveStart is true; otherwise returns 0.
 */
function scoreAdaptiveConstraints(
  ex: Exercise,
  opts?: { useAdaptiveStart?: boolean },
): ScoreBreakdown {
  if (!opts?.useAdaptiveStart) {
    return { dimension: "adaptiveConstraints", points: 0, reason: null };
  }

  const cls = deriveExerciseClass(ex);
  if (cls === "plyometric_power") {
    return {
      dimension: "adaptiveConstraints",
      points: -20,
      reason:
        "Ćwiczenia plyometryczne / wybuchowe są nieodpowiednie na etapie startu adaptacyjnego.",
    };
  }

  return { dimension: "adaptiveConstraints", points: 0, reason: null };
}

// ─── Confirmed restriction scoring ───────────────────────────────────────────

/**
 * A single trainer-confirmed restriction.  Stored as a JSON array in
 * surveys.confirmed_restrictions.
 */
export type ConfirmedRestriction = {
  bodyArea: string;
  movementPattern: string;
  action:
    | "avoid"
    | "regression"
    | "reduce_range"
    | "reduce_load"
    | "informational"
    | "medical_clearance";
};

function parseConfirmedRestrictions(json: string | null | undefined): ConfirmedRestriction[] {
  if (!json) return [];
  try {
    const val = JSON.parse(json);
    return Array.isArray(val) ? (val as ConfirmedRestriction[]) : [];
  } catch {
    return [];
  }
}

/**
 * Returns true when the exercise's movement pattern overlaps with the
 * restriction's declared pattern (bidirectional substring match after
 * normalisation).
 */
function restrictionMatchesExercise(restriction: ConfirmedRestriction, ex: Exercise): boolean {
  const exPat = norm(ex.movementPattern ?? "");
  const rPat = norm(restriction.movementPattern ?? "");
  if (!rPat || !exPat) return false;
  return exPat.includes(rPat) || rPat.includes(exPat);
}

/**
 * Apply trainer-confirmed restrictions to exercise scoring.
 *
 * Action effects:
 *   avoid             → -30  (effectively excludes)
 *   regression        → suitableForNoActivity: +5 + label "Wariant regresyjny"
 *                        otherwise: -15 (prefer the regression variant)
 *   reduce_range / reduce_load → -5  (mild preference for regression)
 *   informational / medical_clearance → 0  (trainer note only)
 *
 * Does NOT regress unrelated body regions — only exercises whose movement
 * pattern matches the restriction are affected.
 */
function scoreConfirmedRestrictions(ex: Exercise, sv: Survey): ScoreBreakdown {
  const restrictions = parseConfirmedRestrictions(sv.confirmedRestrictions);
  if (restrictions.length === 0) {
    return { dimension: "confirmedRestrictions", points: 0, reason: null };
  }

  let totalPoints = 0;
  const positiveReasons: string[] = [];
  const negativeReasons: string[] = [];

  for (const restriction of restrictions) {
    if (!restrictionMatchesExercise(restriction, ex)) continue;

    switch (restriction.action) {
      case "avoid":
        totalPoints -= 30;
        negativeReasons.push(`Unikane — ograniczenie: ${restriction.bodyArea}`);
        break;

      case "regression":
        if (ex.suitableForNoActivity === true) {
          totalPoints += 5;
          positiveReasons.push(
            "Wariant regresyjny — dobrany ze względu na zgłoszone ograniczenie.",
          );
        } else {
          totalPoints -= 15;
          negativeReasons.push(
            `Preferowany wariant regresyjny dla ${restriction.bodyArea}`,
          );
        }
        break;

      case "reduce_range":
      case "reduce_load":
        // Mild penalty — prefer a modification or regression over the full-load variant.
        totalPoints -= 5;
        break;

      case "informational":
      case "medical_clearance":
        // No scoring impact — purely informational for the trainer.
        break;
    }
  }

  const reason =
    positiveReasons.length > 0
      ? positiveReasons[0]
      : negativeReasons.length > 0
      ? negativeReasons[0]
      : null;

  return { dimension: "confirmedRestrictions", points: totalPoints, reason };
}

// ─── Main public function ─────────────────────────────────────────────────────

/**
 * Maximum achievable raw score when all positive dimensions fire.
 * Update when adding new positive-scoring dimensions.
 *
 * Note: scoreNoActivityFit can add up to +19 for "Brak aktywności fizycznej"
 * clients but contributes 0 for all other levels, so it is excluded from
 * MAX_RAW_SCORE — the Math.min(100, …) cap handles any overshoot naturally.
 */
const MAX_RAW_SCORE =
  25 + // experienceLevel
  20 + // trainingGoal
  20 + // trainingLocation
  15 + // equipment
  15 + // priorityMuscle
  10 + // exercisePriority
  10;  // difficultyMatch
// = 115

/**
 * Score a single exercise against a client survey.
 *
 * Returns a normalised 0-100 score plus breakdown.
 * Only complete + active exercises should be passed (filter before calling).
 */
export function scoreExercise(
  exercise: Exercise,
  survey: Survey,
  opts?: { useAdaptiveStart?: boolean },
): ExerciseScore {
  // When the trainer has accepted adaptive start, apply no-activity fit scoring
  // regardless of the client's declared experience level.  This boosts simple,
  // stable, low-complexity movements and penalises high-impact / technically
  // demanding ones — without overriding other scoring dimensions (goal, equipment,
  // location, priority muscles, etc.) which continue to use the real survey data.
  const noActivitySurvey: Survey = opts?.useAdaptiveStart
    ? { ...survey, experienceLevel: "Brak aktywności fizycznej" }
    : survey;
  const dimensions: ScoreBreakdown[] = [
    scoreExperienceLevel(exercise, survey),
    scoreTrainingGoal(exercise, survey),
    scoreTrainingLocation(exercise, survey),
    scoreEquipment(exercise, survey),
    scorePriorityMuscles(exercise, survey),
    scoreExercisePriority(exercise),
    scoreDifficultyMatch(exercise, survey),
    scoreNoActivityFit(exercise, noActivitySurvey),
    // Stage E: goal-class alignment and sub-target bias.
    // These add up to +8 and +12 respectively for well-matched exercises.
    // MAX_RAW_SCORE is intentionally not increased — following the same pattern
    // as scoreNoActivityFit: the Math.min(100, …) cap handles overshoot, and
    // these dimensions only fire meaningfully when the client has a specific goal
    // or priority muscles set.
    scoreExerciseClassAlignment(exercise, survey),
    scoreSubTargetBias(exercise, survey),
    // Progression suitability: rewards loadable exercises and penalises beginner
    // regressions for intermediate+ clients who have dumbbell / barbell equipment.
    // Only fires for "Średniozaawansowany" / "Zaawansowany" with Hantle / Sztanga /
    // Kettlebell in survey.equipment — safe no-op for beginners and inactive clients.
    scoreProgressionSuitability(exercise, survey),
    penaliseAvoidedMuscles(exercise, survey),
    // Adaptive-start: hard plyometric exclusion (fires only when useAdaptiveStart).
    scoreAdaptiveConstraints(exercise, opts),
    // Trainer-confirmed restrictions (body area + movement pattern + action).
    scoreConfirmedRestrictions(exercise, survey),
  ];

  const rawTotal = dimensions.reduce((sum, d) => sum + d.points, 0);
  const score = Math.max(0, Math.min(100, Math.round((rawTotal / MAX_RAW_SCORE) * 100)));

  const matchReasons = dimensions
    .filter((d) => d.points > 0 && d.reason !== null)
    .map((d) => d.reason!);

  const warnReasons = dimensions
    .filter((d) => d.points < 0 && d.reason !== null)
    .map((d) => d.reason!);

  return { exerciseId: exercise.id, score, matchReasons, warnReasons, breakdown: dimensions };
}
