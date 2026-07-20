/**
 * Athlete and Plyo Planning Rules
 *
 * Centralizes all logic for:
 *   1. Athlete-status detection (Feature 1 & 2)
 *   2. Plyo session eligibility (Features 3–7)
 *   3. Athlete / Plyo recommendation text for the trainer summary (Feature 6)
 *
 * SCOPE RULES (per spec):
 *   - Plyo is NOT activated for general-population non-athlete clients.
 *   - Plyo is NOT activated for "Brak aktywności fizycznej" (no movement base).
 *   - Plyo is an additional support session — it never replaces all strength work.
 *   - Do NOT mix this logic with pain alerts, injury alerts, or cardio rules.
 */

// ─── Athlete status ───────────────────────────────────────────────────────────

export const ATHLETE_STATUS_VALUES = [
  "Nie",
  "Tak — amatorsko",
  "Tak — półzawodowo",
  "Tak — zawodowo",
] as const;
export type AthleteStatusValue = typeof ATHLETE_STATUS_VALUES[number];

/**
 * Returns true when the client has declared any active-sport status.
 * "Nie" and null/undefined are treated as non-athlete.
 */
export function isAthleteActive(athleteStatus: string | null | undefined): boolean {
  return (
    athleteStatus === "Tak — amatorsko" ||
    athleteStatus === "Tak — półzawodowo" ||
    athleteStatus === "Tak — zawodowo"
  );
}

// ─── Plyo eligibility ─────────────────────────────────────────────────────────

/**
 * Performance needs that strongly justify adding a Plyo session.
 * These are the survey multiselect values that imply reactive / explosive demand.
 * Must match survey option strings exactly.
 */
const PLYO_JUSTIFYING_NEEDS = new Set([
  "skoczność",
  "szybkość",
  "zmiana kierunku",
  "dynamika",
  "koordynacja",
]);

/**
 * Returns true when at least one selected performance need
 * implies reactive / explosive athletic training.
 */
export function hasPlyoJustifyingNeeds(performanceNeeds: string[]): boolean {
  return performanceNeeds.some((n) => PLYO_JUSTIFYING_NEEDS.has(n));
}

/**
 * Returns true when the experience level allows Plyo sessions.
 *
 * "Brak aktywności fizycznej" lacks the movement foundation for plyometrics —
 * joint stiffness, landing mechanics, and reactive qualities need a base.
 */
export function experienceLevelAllowsPlyo(
  experienceLevel: string | null | undefined,
): boolean {
  return experienceLevel !== "Brak aktywności fizycznej";
}

/**
 * Returns true when the competition level alone justifies Plyo
 * even when no explicit performance needs are selected.
 *
 * Semi-professional and professional athletes typically train reactive
 * qualities regardless of which specific needs they highlight.
 */
export function competitionLevelJustifiesPlyo(
  athleteStatus: string | null | undefined,
): boolean {
  return (
    athleteStatus === "Tak — półzawodowo" ||
    athleteStatus === "Tak — zawodowo"
  );
}

export interface PlyoEligibilityResult {
  eligible: boolean;
  /** Human-readable reason shown to the trainer, or null when ineligible. */
  reason: string | null;
}

/**
 * Determines whether a Plyo session is appropriate for this client.
 *
 * Eligibility requires ALL of:
 *   1. isAthleteActive → any "Tak" athlete status
 *   2. experienceLevelAllowsPlyo → not "Brak aktywności fizycznej"
 *   3. At least one of:
 *      a. hasPlyoJustifyingNeeds → needs include skoczność / szybkość / zmiana
 *                                   kierunku / dynamika / koordynacja
 *      b. competitionLevelJustifiesPlyo → status is "półzawodowo" or "zawodowo"
 *
 * Returns { eligible: false, reason: null } for non-athletes (not an error state).
 */
export function getPlyoEligibility(
  athleteStatus: string | null | undefined,
  experienceLevel: string | null | undefined,
  performanceNeeds: string[],
): PlyoEligibilityResult {
  if (!isAthleteActive(athleteStatus)) {
    return { eligible: false, reason: null };
  }

  if (!experienceLevelAllowsPlyo(experienceLevel)) {
    return {
      eligible: false,
      reason:
        'Poziom "Brak aktywności fizycznej" nie zapewnia wystarczającej bazy ruchowej dla plyometrii.',
    };
  }

  const needsJustify = hasPlyoJustifyingNeeds(performanceNeeds);
  const levelJustifies = competitionLevelJustifiesPlyo(athleteStatus);

  if (!needsJustify && !levelJustifies) {
    return { eligible: false, reason: null };
  }

  // Build trainer-facing reason text
  const plyoNeeds = performanceNeeds.filter((n) => PLYO_JUSTIFYING_NEEDS.has(n));
  let reason: string;
  if (plyoNeeds.length > 0) {
    reason = `Dodano jednostkę Plyometria dla wsparcia: ${plyoNeeds.join(", ")}.`;
  } else {
    reason = `Dodano jednostkę Plyometria ze względu na poziom sportowy (${athleteStatus}).`;
  }

  return { eligible: true, reason };
}

// ─── Full athlete recommendation ──────────────────────────────────────────────

export interface AthleteRecommendationResult {
  isAthlete: true;
  athleteStatus: string;
  sportDiscipline: string | null;
  performanceNeeds: string[];
  plyoRecommended: boolean;
  plyoReason: string | null;
  /** "Plyometria" when plyoRecommended, else null */
  plyoSessionLabel: string | null;
}

/**
 * Returns the full athlete recommendation for the plan summary.
 *
 * Returns null when the client is not an athlete — callers can safely skip
 * all athlete-specific rendering in this case.
 *
 * When athlete logic is active the result always includes:
 *   - sport and status for the trainer summary display
 *   - the full performance needs list
 *   - Plyo eligibility with reason text
 */
export function getAthleteRecommendation(
  athleteStatus: string | null | undefined,
  sportDiscipline: string | null | undefined,
  performanceNeeds: string[],
  experienceLevel: string | null | undefined,
): AthleteRecommendationResult | null {
  if (!isAthleteActive(athleteStatus)) return null;

  const plyo = getPlyoEligibility(athleteStatus, experienceLevel, performanceNeeds);

  return {
    isAthlete: true,
    athleteStatus: athleteStatus!,
    sportDiscipline: sportDiscipline?.trim() || null,
    performanceNeeds,
    plyoRecommended: plyo.eligible,
    plyoReason: plyo.reason,
    plyoSessionLabel: plyo.eligible ? "Plyometria" : null,
  };
}
