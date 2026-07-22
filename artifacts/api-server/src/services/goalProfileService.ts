/**
 * Goal Profile Service — maps a client's trainingGoal to a structured
 * decision profile that the exercise selection engine uses to bias candidate
 * ordering.
 *
 * DESIGN RULES:
 *   • Profiles affect sort rank, NOT hard filters.  Every profile still
 *     respects slot structure, minimum exercise counts, and the slot predicates.
 *   • Profiles are matched first by exact canonical survey value, then by
 *     keyword substring (handles free-text responses and older data).
 *   • The profile travels through V0PriorityContext — no changes to the HTTP
 *     schema or response shape.
 *
 * Canonical goal values (from TRAINING_GOAL_OPTIONS in lib/survey-config):
 *   "Budowa sylwetki"
 *   "Zwiększenie siły"
 *   "Redukcja tkanki tłuszczowej"
 *   "Poprawa kondycji"
 *   "Poprawa sprawności"
 *   "Cel sportowy"
 */

// ─── Profile type ──────────────────────────────────────────────────────────────

export type ExerciseClassBias =
  | "hypertrophy"   // compound + isolation mix; more direct/accessory work
  | "strength"      // main compounds dominant; isolation is supportive only
  | "conditioning"  // simple, repeatable, lower-complexity; less isolation
  | "athletic"      // multi-joint; dynamic work for eligible experience levels
  | "general";      // no specific bias — balanced defaults

export interface GoalProfile {
  /** Primary exercise selection bias. */
  exerciseClassBias: ExerciseClassBias;

  /**
   * When true (strength / conditioning), compound exercises are sorted before
   * isolation exercises within mixed-type accessory slots.
   * Has NO effect on slots already filtered to a single exerciseType.
   */
  deprioritizeIsolationInMixedSlots: boolean;

  /**
   * When true AND the client is priority-eligible (intermediate / advanced),
   * exercises flagged as suitableForNoActivity are sorted AFTER non-flagged
   * exercises.  This prevents intermediate gym users from defaulting to
   * regression/bodyweight movements when better options exist.
   */
  penalizeRegressionForEligible: boolean;

  /**
   * When true (sprawność / sport goals) AND the client is priority-eligible,
   * the engine may include power/dynamic exercise options in non-plyo sessions
   * as an optional slot pick (e.g. a plyometric warm-up compound).
   * This supplements the route-level allowPlyometrics flag, which gates
   * standalone plyo sessions entirely.
   */
  allowDynamicInStrengthSessions: boolean;

  /**
   * When true, isolation work is explicitly valued in the weekly plan.
   * For intermediate/advanced clients this enables extra arm and shoulder
   * direct-work slots in upper-body sessions when the structure allows them,
   * ensuring biceps, triceps, and deltoid work is present.
   */
  isolationValued: boolean;

  /**
   * Foundation marker for the future cardio / conditioning layer.
   * Does NOT cause resistance-exercise selection to change — cardio is treated
   * as a separate layer, not compensated by making lifts "more exhausting".
   */
  hasConditioningComponent: boolean;
}

// ─── Canonical profiles ────────────────────────────────────────────────────────

/** Budowa sylwetki — hypertrophy-quality stimulus; isolation is valued */
const PROFILE_HYPERTROPHY: GoalProfile = {
  exerciseClassBias: "hypertrophy",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: false,
  isolationValued: true,
  hasConditioningComponent: false,
};

/** Zwiększenie siły — compounds dominate; isolation is supportive */
const PROFILE_STRENGTH: GoalProfile = {
  exerciseClassBias: "strength",
  deprioritizeIsolationInMixedSlots: true,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: false,
};

/**
 * Redukcja tkanki tłuszczowej — resistance training is hypertrophy-quality
 * (not "more exhausting"); a separate cardio layer is required.
 */
const PROFILE_FAT_LOSS: GoalProfile = {
  exerciseClassBias: "hypertrophy",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: true,
  hasConditioningComponent: true,
};

/** Poprawa kondycji — simple, repeatable, manageable; cardio layer required */
const PROFILE_CONDITIONING: GoalProfile = {
  exerciseClassBias: "conditioning",
  deprioritizeIsolationInMixedSlots: true,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: true,
};

/**
 * Poprawa sprawności — movement quality + general athleticism;
 * dynamic exposure allowed for eligible experience levels.
 */
const PROFILE_FITNESS: GoalProfile = {
  exerciseClassBias: "athletic",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: true,
  isolationValued: false,
  hasConditioningComponent: false,
};

/**
 * Cel sportowy — performance bias; regression penalised for eligible clients;
 * dynamic/power work integrated in strength sessions.
 */
const PROFILE_SPORT: GoalProfile = {
  exerciseClassBias: "athletic",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: true,
  isolationValued: false,
  hasConditioningComponent: false,
};

/** Default — no specific bias; used when goal is null / unrecognised */
const PROFILE_GENERAL: GoalProfile = {
  exerciseClassBias: "general",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: false,
};

// ─── Keyword map ───────────────────────────────────────────────────────────────
// Exact-value match is checked first (canonical survey values).
// Keyword substring fallback handles free-text and typos.
// Order matters: most-specific first.

const KEYWORD_MAP: Array<{
  exact: string;
  keywords: string[];
  profile: GoalProfile;
}> = [
  {
    exact: "Budowa sylwetki",
    keywords: ["budow", "sylwet", "hipert", "masa mięśni"],
    profile: PROFILE_HYPERTROPHY,
  },
  {
    exact: "Zwiększenie siły",
    keywords: ["zwiększen", "siłę", "siły", "powerlifting", "strength"],
    profile: PROFILE_STRENGTH,
  },
  {
    exact: "Redukcja tkanki tłuszczowej",
    keywords: ["redukcj", "tłuszcz", "odchudzani", "schudnięci", "fat loss"],
    profile: PROFILE_FAT_LOSS,
  },
  {
    exact: "Poprawa kondycji",
    keywords: ["kondycj", "wytrzymałoś", "cardio", "aerob"],
    profile: PROFILE_CONDITIONING,
  },
  {
    exact: "Poprawa sprawności",
    keywords: ["sprawnoś", "atletyczn", "motoryk", "koordynacj", "zwinnoś"],
    profile: PROFILE_FITNESS,
  },
  {
    exact: "Cel sportowy",
    keywords: ["sportow", "cel sport", "zawodnik", "dyscyplina", "sport"],
    profile: PROFILE_SPORT,
  },
];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a GoalProfile from survey.trainingGoal.
 *
 * Canonical survey values (e.g. "Budowa sylwetki") are matched exactly first.
 * Free-text values fall back to keyword substring matching.
 * Unrecognised / null goals return PROFILE_GENERAL (balanced defaults).
 */
export function buildGoalProfile(
  trainingGoal: string | null | undefined,
): GoalProfile {
  if (!trainingGoal?.trim()) return PROFILE_GENERAL;
  const trimmed = trainingGoal.trim();
  const lower = trimmed.toLowerCase();

  for (const { exact, keywords, profile } of KEYWORD_MAP) {
    if (trimmed === exact) return profile;              // exact canonical match
    if (keywords.some((kw) => lower.includes(kw))) return profile;  // keyword fallback
  }
  return PROFILE_GENERAL;
}
