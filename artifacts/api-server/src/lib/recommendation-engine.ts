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
const APPROPRIATE_DIFFICULTY: Record<string, string[]> = {
  "brak aktywności fizycznej": ["Początkujący"],
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
  if (locations.some((l) => norm(l) === norm(clientLoc))) {
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

// ─── Main public function ─────────────────────────────────────────────────────

/**
 * Maximum achievable raw score when all positive dimensions fire.
 * Update when adding new positive-scoring dimensions.
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
export function scoreExercise(exercise: Exercise, survey: Survey): ExerciseScore {
  const dimensions: ScoreBreakdown[] = [
    scoreExperienceLevel(exercise, survey),
    scoreTrainingGoal(exercise, survey),
    scoreTrainingLocation(exercise, survey),
    scoreEquipment(exercise, survey),
    scorePriorityMuscles(exercise, survey),
    scoreExercisePriority(exercise),
    scoreDifficultyMatch(exercise, survey),
    penaliseAvoidedMuscles(exercise, survey),
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
