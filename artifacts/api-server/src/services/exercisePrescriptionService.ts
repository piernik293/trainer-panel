/**
 * Exercise Prescription Service
 *
 * Provides three things for the generate-day route:
 *
 *   1. ExerciseClass derivation from DayRecommendationExercise output fields
 *      (mirrors deriveExerciseClass() in the engine but works on the output shape)
 *
 *   2. Session ordering rank — drives coach-like exercise sequencing:
 *        0  plyometric_power    explosive primer before CNS fatigue accumulates
 *        1  main_compound       structural anchor of the session
 *        2  secondary_compound  supportive / complementary lifts
 *        3  isolation           direct / accessory work
 *        3  regression_beginner fills the same band as accessory in mixed sessions
 *        5  core                trunk-control finisher
 *
 *   3. Class × goal prescription table (sets / repsLabel / restSeconds / note)
 *      — ensures plyometric drills, main compounds, isolation, and core
 *        all receive clearly differentiated prescription logic, not a generic
 *        3×8-12 template applied to everything.
 *
 * No DB access, no HTTP, no side effects.
 */

import type { ExerciseClassBias } from "./goalProfileService.js";

// ─── Exercise class ────────────────────────────────────────────────────────────

export type ExerciseClass =
  | "plyometric_power"
  | "main_compound"
  | "secondary_compound"
  | "isolation"
  | "core"
  | "regression_beginner";

/**
 * Minimal subset of DayRecommendationExercise needed for class derivation.
 * Matches the fields already present in DayRecommendationExercise (including
 * the newly-added suitableForNoActivity pass-through).
 */
export interface ExerciseOutputFields {
  /** Exercise display name — used for plyometric name-fragment detection. */
  name: string;
  mainMuscleGroup?: string | null;
  exerciseType?: string | null;
  exercisePriority?: string | null;
  movementPattern?: string | null;
  movementCategoryKey?: string | null;
  suitableForNoActivity?: boolean | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Name fragments (lowercase Polish) that identify plyometric / explosive exercises.
 *
 * Mirrors PLYO_FRAGMENTS from ExerciseSelectionEngineV0 — many plyometric
 * exercises in the DB have generic movement_category values ("Przysiad",
 * "Wykrok") rather than a dedicated "plyometryczne" category, so name-based
 * detection is required to catch them reliably.
 */
const PLYO_NAME_FRAGMENTS = [
  "skok",    // Skoki pogo, Skok jednonóż, Skok boczny …
  "wyskok",
  "pogo",
  "rzut",    // medicine-ball throws
  "sprint",
  "biegani", // running drills
] as const;

function isPlyometricByName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return PLYO_NAME_FRAGMENTS.some((f) => lower.includes(f));
}

/**
 * Derive exercise class from DayRecommendationExercise output fields.
 *
 * Mirrors deriveExerciseClass() from ExerciseSelectionEngineV0 but operates
 * on the output shape (DayRecommendationExercise) rather than the internal
 * ScoredAndFilteredExercise type.  Priority order (first match wins):
 *
 *   1. regression_beginner  suitableForNoActivity === true
 *   2. core                 mainMuscleGroup "Brzuch"
 *   3. isolation            exerciseType "Izolowane"
 *   4. plyometric_power     movementCategoryKey "plyometryczne" | jump patterns
 *                           | name-fragment match (catches Skoki pogo, etc.)
 *   5. main_compound        Złożone + Bardzo wysoki / Wysoki priority
 *   6. secondary_compound   everything else
 */
export function deriveExerciseClassForOutput(ex: ExerciseOutputFields): ExerciseClass {
  if (ex.suitableForNoActivity === true) return "regression_beginner";
  if (norm(ex.mainMuscleGroup) === "brzuch") return "core";
  if (norm(ex.exerciseType) === "izolowane") return "isolation";

  const mc = norm(ex.movementCategoryKey);
  const mp = norm(ex.movementPattern);
  if (
    mc === "plyometryczne" || mc.includes("plyomet") ||
    mp === "skok" || mp === "wyskok" || mp.includes("wybici") ||
    isPlyometricByName(ex.name)
  ) return "plyometric_power";

  if (norm(ex.exerciseType) === "złożone") {
    const pri = ex.exercisePriority;
    if (pri === "Bardzo wysoki" || pri === "Wysoki") return "main_compound";
    return "secondary_compound";
  }

  return "secondary_compound";
}

// ─── Session ordering ──────────────────────────────────────────────────────────

const CLASS_ORDER_RANK: Record<ExerciseClass, number> = {
  plyometric_power:    0,
  main_compound:       1,
  secondary_compound:  2,
  isolation:           3,
  regression_beginner: 3,
  core:                5,
};

/**
 * Return the session position rank for an exercise class.
 * Lower = earlier in the session (stable sort — ties keep engine slot order).
 */
export function sessionOrderRank(cls: ExerciseClass): number {
  return CLASS_ORDER_RANK[cls] ?? 3;
}

// ─── Prescription ──────────────────────────────────────────────────────────────

export interface ExercisePrescription {
  sets: number;
  /** Human-readable rep / duration label, e.g. "4–6", "8–12", "30–45 sek". */
  repsLabel: string;
  restSeconds: number;
  /** Optional coach-facing note explaining why this prescription looks different. */
  prescriptionNote?: string;
}

type GoalKey = ExerciseClassBias | "_default";
type ClassTable = Partial<Record<GoalKey, ExercisePrescription>> & {
  _default: ExercisePrescription;
};

/**
 * Prescription table: [exerciseClass][goalBias] → ExercisePrescription.
 *
 * Design rules:
 *   plyometric_power  → quality-first, lower reps, full rest.  NEVER 3×8-12.
 *   main_compound     → goal-sensitive (strength → heavier/fewer reps + long rest;
 *                        hypertrophy → moderate; conditioning → lighter/more reps)
 *   secondary_compound→ supportive, one tier lighter than main
 *   isolation         → accessory logic: more reps, less rest than big compounds
 *   core              → trunk-control oriented; different from biceps-curl logic
 *   regression_beginner → conservative, safe, suitable for no-activity clients
 */
const TABLE: Record<ExerciseClass, ClassTable> = {
  plyometric_power: {
    _default: {
      sets: 4, repsLabel: "4–6", restSeconds: 120,
      prescriptionNote: "Praca eksplozywna — pełna jakość ruchu, pełny odpoczynek między seriami.",
    },
    strength: {
      sets: 4, repsLabel: "4–6", restSeconds: 120,
      prescriptionNote: "Praca eksplozywna — pełna jakość ruchu, pełny odpoczynek między seriami.",
    },
    athletic: {
      sets: 4, repsLabel: "4–6", restSeconds: 120,
      prescriptionNote: "Praca eksplozywna — pełna jakość ruchu, pełny odpoczynek między seriami.",
    },
    hypertrophy: {
      sets: 3, repsLabel: "6–8", restSeconds: 90,
      prescriptionNote: "Element dynamiczny — kontrolowana eksplosywność, krótszy moduł.",
    },
    conditioning: { sets: 3, repsLabel: "6–8", restSeconds: 75 },
    general:      { sets: 3, repsLabel: "6–8", restSeconds: 90 },
  },

  main_compound: {
    _default:     { sets: 4, repsLabel: "6–10",  restSeconds: 120 },
    strength:     { sets: 5, repsLabel: "3–6",   restSeconds: 210 },
    athletic:     { sets: 4, repsLabel: "4–6",   restSeconds: 180 },
    hypertrophy:  { sets: 4, repsLabel: "6–10",  restSeconds: 120 },
    conditioning: { sets: 3, repsLabel: "8–12",  restSeconds: 90  },
    general:      { sets: 3, repsLabel: "8–12",  restSeconds: 90  },
  },

  secondary_compound: {
    _default:     { sets: 3, repsLabel: "8–12",  restSeconds: 90  },
    strength:     { sets: 4, repsLabel: "5–8",   restSeconds: 120 },
    athletic:     { sets: 3, repsLabel: "5–8",   restSeconds: 90  },
    hypertrophy:  { sets: 3, repsLabel: "8–12",  restSeconds: 90  },
    conditioning: { sets: 3, repsLabel: "10–15", restSeconds: 75  },
    general:      { sets: 3, repsLabel: "10–12", restSeconds: 90  },
  },

  isolation: {
    _default:     { sets: 3, repsLabel: "10–15", restSeconds: 60 },
    strength:     { sets: 3, repsLabel: "8–12",  restSeconds: 75 },
    athletic:     { sets: 3, repsLabel: "10–15", restSeconds: 60 },
    hypertrophy:  { sets: 3, repsLabel: "10–15", restSeconds: 60 },
    conditioning: { sets: 3, repsLabel: "12–20", restSeconds: 45 },
    general:      { sets: 3, repsLabel: "10–15", restSeconds: 60 },
  },

  core: {
    _default: {
      sets: 3, repsLabel: "12–20 / 30–45 sek", restSeconds: 60,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
    strength: {
      sets: 3, repsLabel: "8–15 / 30–45 sek", restSeconds: 60,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
    athletic: {
      sets: 3, repsLabel: "10–20 / 30–45 sek", restSeconds: 60,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
    hypertrophy: {
      sets: 3, repsLabel: "12–20 / 30–45 sek", restSeconds: 60,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
    conditioning: {
      sets: 3, repsLabel: "15–25 / 40–60 sek", restSeconds: 45,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
    general: {
      sets: 3, repsLabel: "12–20 / 30–45 sek", restSeconds: 60,
      prescriptionNote: "Stabilizacja tułowia — skupienie na kontroli i napięciu mięśni core.",
    },
  },

  regression_beginner: {
    _default:     { sets: 2, repsLabel: "10–15", restSeconds: 90 },
    strength:     { sets: 3, repsLabel: "8–12",  restSeconds: 90 },
    athletic:     { sets: 2, repsLabel: "10–15", restSeconds: 90 },
    hypertrophy:  { sets: 3, repsLabel: "12–15", restSeconds: 90 },
    conditioning: { sets: 2, repsLabel: "12–20", restSeconds: 75 },
    general:      { sets: 2, repsLabel: "10–15", restSeconds: 90 },
  },
};

/**
 * Look up the prescription for an exercise given its class and the session's
 * goal bias.
 *
 * @param cls               Derived exercise class.
 * @param goalBias          GoalProfile.exerciseClassBias for the session.
 * @param isBodyweightInGym When true (e.g. Pompki in a full-gym strength plan),
 *                          the exercise is demoted from main_compound to
 *                          secondary_compound prescription.  The bodyweight move
 *                          is a supportive slot filler in this context, not the
 *                          session's structural anchor.
 */
export function prescribeExercise(
  cls: ExerciseClass,
  goalBias: ExerciseClassBias,
  isBodyweightInGym = false,
): ExercisePrescription {
  // Part 6: bodyweight push moves that land in a compound slot in a full-gym
  // plan receive secondary_compound prescription, not main_compound.
  const effectiveCls: ExerciseClass =
    isBodyweightInGym && cls === "main_compound" ? "secondary_compound" : cls;

  const classTable = TABLE[effectiveCls];
  return classTable[goalBias] ?? classTable["_default"];
}
