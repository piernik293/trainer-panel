/**
 * Goal Profile Service — maps a client's trainingGoal + sport context to a
 * structured decision profile that the exercise selection engine uses to bias
 * candidate ordering.
 *
 * STAGE C additions (on top of Stage B):
 *   • GoalProfile extended with four sport/power-specific fields
 *   • buildGoalProfile() now accepts sportPerformanceNeeds + athleteStatus
 *   • "Poprawa sprawności" and "Cel sportowy" are clearly differentiated:
 *       sprawność  = general athletic quality; unilateral bias; no power saturation
 *       sport      = performance bias; force-production preference; sport sub-priorities
 *   • Sport sub-priorities (Dynamika / Szybkość / Stabilizacja) mutate the
 *     base sport profile: neuro-load, unilateral, and competitive-athlete flags
 *
 * DESIGN RULES (unchanged from Stage B):
 *   • Profiles affect sort rank, NOT hard filters.
 *   • The profile travels through V0PriorityContext — no HTTP schema changes.
 */

// ─── Profile type ──────────────────────────────────────────────────────────────

export type ExerciseClassBias =
  | "hypertrophy"   // compound + isolation mix; more direct/accessory work
  | "strength"      // main compounds dominant; isolation is supportive only
  | "conditioning"  // simple, repeatable, lower-complexity; less isolation
  | "athletic"      // multi-joint; dynamic exposure for eligible levels
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
   * exercises.  Prevents intermediate gym users from defaulting to regression
   * bodyweight movements when better options exist in the pool.
   */
  penalizeRegressionForEligible: boolean;

  /**
   * When true (sprawność / sport goals) AND the client is priority-eligible,
   * the engine may include dynamic exercise options in non-plyo sessions.
   * Supplements the route-level allowPlyometrics flag.
   */
  allowDynamicInStrengthSessions: boolean;

  /**
   * When true, isolation work is explicitly valued in the weekly plan.
   * For intermediate/advanced clients this enables extra arm and shoulder
   * direct-work slots in upper-body sessions when the structure allows them.
   */
  isolationValued: boolean;

  /**
   * Foundation marker for the future cardio / conditioning layer.
   * Does NOT cause resistance-exercise selection to change.
   */
  hasConditioningComponent: boolean;

  // ── Stage C additions ────────────────────────────────────────────────────────

  /**
   * When true (sport + Dynamika or Szybkość sub-priority), exercises with
   * neurologicalFatigue >= 4 are sorted before lower-fatigue candidates
   * within the same tier and compound slots.
   *
   * Rationale: neurological fatigue is the closest proxy we have for
   * force-production demand.  Deadlifts, heavy squats, power-oriented
   * compounds all score 4–5.  This boosts the right exercises for sport
   * power / speed contexts without needing an explicit "isPower" DB flag.
   *
   * NOT activated for: sprawność, hypertrophy, conditioning, fat loss.
   * Strong activation: sport + Dynamika.
   * Moderate activation: sport + Szybkość (speed = force production too).
   */
  preferHighNeurologicalLoad: boolean;

  /**
   * When true (sprawność always; sport + Stabilizacja sub-priority),
   * exercises with movementPattern "Wykrok" (lunge / split squat) are sorted
   * before bilateral squat patterns within lower-body compound slots.
   *
   * Rationale: unilateral patterns demand more stabilisation, proprioception,
   * and body control than bilateral equivalents — exactly what sprawność and
   * stabilizacja contexts need.
   *
   * Applies only where both patterns exist in the same slot's candidate band;
   * never blocks bilateral squats from being selected.
   */
  preferUnilateralPatterns: boolean;

  /**
   * When true (Cel sportowy baseline), random bodybuilding isolation exercises
   * are deprioritised in the engine's compound-slot candidates relative to
   * force-production movements.  Analogous to deprioritizeIsolationInMixedSlots
   * but specifically for the athletic/sport context (where we want athletic
   * compounds, not hypertrophy isolation clutter).
   *
   * Distinguished from deprioritizeIsolationInMixedSlots (which serves
   * strength/conditioning) by being activated for sport goals only.
   */
  athleticCompoundBias: boolean;

  /**
   * True when the athlete has "Tak — zawodowo" status (competitive athlete).
   * Currently logged in context; available for future stronger-bias branching.
   * Hobby athletes (Tak — amatorsko) do NOT set this flag.
   */
  isCompetitiveAthlete: boolean;
}

// ─── Canonical base profiles ───────────────────────────────────────────────────

/** Budowa sylwetki — hypertrophy-quality stimulus; isolation is valued */
const PROFILE_HYPERTROPHY: GoalProfile = {
  exerciseClassBias: "hypertrophy",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: false,
  isolationValued: true,
  hasConditioningComponent: false,
  preferHighNeurologicalLoad: false,
  preferUnilateralPatterns: false,
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
};

/** Zwiększenie siły — compounds dominate; isolation is supportive */
const PROFILE_STRENGTH: GoalProfile = {
  exerciseClassBias: "strength",
  deprioritizeIsolationInMixedSlots: true,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: false,
  preferHighNeurologicalLoad: false,
  preferUnilateralPatterns: false,
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
};

/**
 * Redukcja tkanki tłuszczowej — resistance training = hypertrophy quality
 * (NOT "more exhausting"); cardio is a separate layer.
 */
const PROFILE_FAT_LOSS: GoalProfile = {
  exerciseClassBias: "hypertrophy",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: true,
  hasConditioningComponent: true,
  preferHighNeurologicalLoad: false,
  preferUnilateralPatterns: false,
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
};

/** Poprawa kondycji — simple, repeatable, manageable; cardio layer required */
const PROFILE_CONDITIONING: GoalProfile = {
  exerciseClassBias: "conditioning",
  deprioritizeIsolationInMixedSlots: true,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: true,
  preferHighNeurologicalLoad: false,
  preferUnilateralPatterns: false,
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
};

/**
 * Poprawa sprawności — general athletic quality; movement control; unilateral
 * bias for coordination; some dynamic exposure for eligible levels.
 *
 * Stage C: clearly differentiated from Cel sportowy —
 *   • preferUnilateralPatterns = true  (coordination, body control)
 *   • preferHighNeurologicalLoad = false  (not sport power intensity)
 *   • athleticCompoundBias = false  (general, not sport-performance specific)
 *   • No sport sub-priorities apply (this goal has no sport sub-inputs)
 */
const PROFILE_FITNESS: GoalProfile = {
  exerciseClassBias: "athletic",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: true,
  isolationValued: false,
  hasConditioningComponent: false,
  preferHighNeurologicalLoad: false,    // general athletic, not power-intensive
  preferUnilateralPatterns: true,       // coordination, stability, body control
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
};

/**
 * Cel sportowy — baseline profile before sport sub-priority mutation.
 *
 * Stage C: stronger differentiation from Poprawa sprawności —
 *   • preferHighNeurologicalLoad = true  (force production = sport baseline)
 *   • athleticCompoundBias = true  (sport = athletic compound choices)
 *   • preferUnilateralPatterns = false  (set via Stabilizacja sub-priority)
 *   • isCompetitiveAthlete = false  (set via athleteStatus "Tak — zawodowo")
 *
 * Sport sub-priorities (Dynamika / Szybkość / Stabilizacja) further mutate
 * this profile in buildGoalProfile() before it is returned.
 */
const PROFILE_SPORT_BASE: GoalProfile = {
  exerciseClassBias: "athletic",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: true,
  allowDynamicInStrengthSessions: true,
  isolationValued: false,
  hasConditioningComponent: false,
  preferHighNeurologicalLoad: true,     // sport baseline = force production
  preferUnilateralPatterns: false,      // activated via Stabilizacja
  athleticCompoundBias: true,
  isCompetitiveAthlete: false,          // activated via "Tak — zawodowo"
};

/** Default — no specific bias; used when goal is null / unrecognised */
const PROFILE_GENERAL: GoalProfile = {
  exerciseClassBias: "general",
  deprioritizeIsolationInMixedSlots: false,
  penalizeRegressionForEligible: false,
  allowDynamicInStrengthSessions: false,
  isolationValued: false,
  hasConditioningComponent: false,
  preferHighNeurologicalLoad: false,
  preferUnilateralPatterns: false,
  athleticCompoundBias: false,
  isCompetitiveAthlete: false,
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
  // "Cel sportowy" is handled separately below to allow sub-priority mutation
];

// ─── Sport sub-priority helpers ────────────────────────────────────────────────

/**
 * Build the sport profile from the base, mutated by sub-priorities and
 * athlete status.  Returns a fresh object (no mutation of the base constant).
 *
 * Sub-priority rules:
 *   Dynamika  → force-production + explosive bias (high neuro load stays true)
 *   Szybkość  → speed-supportive: force + unilateral drive (neuro load true)
 *   Stabilizacja → control + body position: prefers unilateral patterns
 *
 * Athlete status rules:
 *   "Tak — zawodowo" → isCompetitiveAthlete = true; already has strong sport bias
 *   "Tak — amatorsko" / hobby → conservative; base profile unchanged
 *
 * Important: NOT activating preferHighNeurologicalLoad for Stabilizacja alone —
 * stability work prioritises control over explosive output.
 */
function buildSportProfile(
  sportPerformanceNeeds: string[],
  athleteStatus: string | null | undefined,
): GoalProfile {
  const needs = sportPerformanceNeeds.map((s) => s.toLowerCase());

  const hasDynamika = needs.includes("dynamika");
  const hasSzybkosc = needs.includes("szybkość");
  const hasStabilizacja = needs.includes("stabilizacja");
  const isCompetitive =
    athleteStatus === "Tak — zawodowo" ||
    athleteStatus?.toLowerCase().includes("zawodowo") === true;

  return {
    ...PROFILE_SPORT_BASE,
    // Dynamika: keep high neuro load (already true in base); no change needed
    // Szybkość: speed = force production → also uses high neuro load
    // If ONLY Stabilizacja with no power sub-priorities: relax neuro-load bias
    preferHighNeurologicalLoad:
      hasDynamika || hasSzybkosc || PROFILE_SPORT_BASE.preferHighNeurologicalLoad,
    // Stabilizacja: prefer unilateral patterns for control and proprioception
    preferUnilateralPatterns: hasStabilizacja,
    isCompetitiveAthlete: isCompetitive,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a GoalProfile from survey fields.
 *
 * @param trainingGoal         Raw survey trainingGoal (canonical or free-text).
 * @param sportPerformanceNeeds  Values from survey.sportPerformanceNeeds
 *                               (only meaningful for "Cel sportowy").
 * @param athleteStatus        Raw DB value: "Tak — zawodowo" | "Tak — amatorsko"
 *                               | "Nie" | null.
 *
 * Matching priority:
 *   1. Exact canonical value match (e.g. "Budowa sylwetki")
 *   2. Keyword substring fallback for free-text responses
 *   3. PROFILE_GENERAL if no match
 *
 * "Cel sportowy" always returns a freshly-mutated profile (never the constant)
 * so sub-priority and athlete-status flags are always correct.
 */
export function buildGoalProfile(
  trainingGoal: string | null | undefined,
  sportPerformanceNeeds?: string[],
  athleteStatus?: string | null,
): GoalProfile {
  if (!trainingGoal?.trim()) return PROFILE_GENERAL;

  const trimmed = trainingGoal.trim();
  const lower = trimmed.toLowerCase();

  // "Cel sportowy" — always build a mutated sport profile
  if (trimmed === "Cel sportowy" || lower.includes("sportow") || lower.includes("cel sport")) {
    return buildSportProfile(sportPerformanceNeeds ?? [], athleteStatus);
  }

  // All other goals — match from keyword map
  for (const { exact, keywords, profile } of KEYWORD_MAP) {
    if (trimmed === exact) return profile;
    if (keywords.some((kw) => lower.includes(kw))) return profile;
  }

  return PROFILE_GENERAL;
}
