/**
 * Safety Alerts and Cardio / Conditioning Planning Rules
 *
 * Centralizes all logic for:
 *   1. Pain-keyword detection in health-related text (Feature 1)
 *   2. Health-limitation alert state (Feature 2)
 *   3. Mandatory cardio / steps recommendation for sedentary or fat-loss cases (Feature 3)
 *   4. Conditioning-goal planning rule (Feature 4)
 *
 * IMPORTANT — scope rules:
 *   • Pain detection MUST only receive health-related text fields.
 *     Never pass trainingGoal, notes, or other non-medical fields to detectPainKeywords().
 *   • The cardio/steps rule fires on activity level and training goal, not on health text.
 */

// ─── Feature 1 — Pain keyword detection ──────────────────────────────────────

/**
 * Normalizes a string to ASCII-folded lower-case, removing Polish diacritics.
 * "ból" → "bol", "barku" → "barku".
 */
function normalizePL(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const PAIN_PATTERNS = [
  /\bbol\b/,       // "ból" / "bol" as whole word
  /\bbolac\b/,     // bólach, bólący
  /\bboli\b/,      // boli mnie
  /\bbola\b/,      // bolała
  /\bboly\b/,      // bóle
  /\bbolu\b/,      // bólu
  /\bbolenie\b/,   // bolenie
];

/**
 * Detects pain-related keywords in health-related text only.
 *
 * Must NOT be called with arbitrary survey fields.
 * Only call with: healthLimitations, injury description, or other medically-scoped text.
 *
 * @param healthText - text from a health / limitations field, or null/empty
 * @returns true when any pain keyword is found (accent-insensitive)
 */
export function detectPainKeywords(healthText: string | null | undefined): boolean {
  if (!healthText || healthText.trim() === "") return false;
  const normalized = normalizePL(healthText);
  return PAIN_PATTERNS.some((re) => re.test(normalized));
}

// ─── Feature 2 — Health alert state ──────────────────────────────────────────

export interface HealthAlertState {
  /** true when pain keywords ("ból", "bol", …) are found in health-related text */
  painDetected: boolean;
  /** true when any health limitation is present (injuryStatus = "Tak" or non-empty healthLimitations) */
  hasHealthLimitation: boolean;
  /** the health limitation description text, or null */
  healthText: string | null;
}

/**
 * Derives the health alert state from the survey health fields.
 *
 * @param healthLimitations - free-text description (healthLimitations DB column)
 * @param injuryStatus      - "Brak" | "Tak" | null (injuryStatus DB column)
 */
export function getHealthAlertState(
  healthLimitations: string | null | undefined,
  injuryStatus: string | null | undefined,
): HealthAlertState {
  const healthText = healthLimitations?.trim() || null;
  // A health limitation is present when the client explicitly answered "Tak"
  // OR when legacy healthLimitations free text is non-empty.
  const hasHealthLimitation = injuryStatus === "Tak" || !!healthText;
  const painDetected = detectPainKeywords(healthText);
  return { painDetected, hasHealthLimitation, healthText };
}

// ─── Feature 3 — Cardio / steps recommendation ───────────────────────────────

export type CardioRecommendationType = "cardio_day" | "steps";
export type CardioReasonType = "sedentary" | "fat_loss" | "sedentary_and_fat_loss";

export interface CardioRecommendation {
  type: CardioRecommendationType;
  text: string;
  reason: CardioReasonType;
}

const FAT_LOSS_GOAL_VALUES = ["Redukcja tkanki tłuszczowej"];
const FAT_LOSS_KEYWORDS_NORM = ["redukcja", "odchudzanie", "tluszcz", "fat loss", "schudnac", "schudnąć"];

export function isFatLossGoal(trainingGoal: string | null | undefined): boolean {
  if (!trainingGoal) return false;
  if (FAT_LOSS_GOAL_VALUES.includes(trainingGoal)) return true;
  const norm = normalizePL(trainingGoal);
  return FAT_LOSS_KEYWORDS_NORM.some((kw) => norm.includes(kw));
}

export function isSedentaryLifestyle(activityLevel: string | null | undefined): boolean {
  return activityLevel === "Siedzący";
}

const BEGINNER_LEVELS = new Set(["Brak aktywności fizycznej", "Początkujący"]);

/**
 * Returns a mandatory cardio / steps recommendation when the client has a
 * sedentary lifestyle or a fat-loss goal.
 *
 * Returns null when neither condition is met.
 *
 * Planning logic (Feature 3):
 *   - beginner/inactive + extra days above 3 strength cap → cardio day(s)
 *   - otherwise (no extra days available) → daily step target
 */
export function getCardioRecommendation(
  trainingGoal: string | null | undefined,
  activityLevel: string | null | undefined,
  availableDays: number | null | undefined,
  experienceLevel: string | null | undefined,
): CardioRecommendation | null {
  const fatLoss = isFatLossGoal(trainingGoal);
  const sedentary = isSedentaryLifestyle(activityLevel);

  if (!fatLoss && !sedentary) return null;

  const reason: CardioReasonType =
    fatLoss && sedentary ? "sedentary_and_fat_loss" : sedentary ? "sedentary" : "fat_loss";

  const isBeginner = experienceLevel != null && BEGINNER_LEVELS.has(experienceLevel);
  const days = availableDays ?? 3;
  // Beginners are capped at 3 strength days; extra days above that become cardio
  const extraDays = isBeginner ? Math.max(0, days - 3) : 0;

  if (extraDays > 0) {
    const dayWord = extraDays === 1 ? "dzień" : "dni";
    const reasonText =
      reason === "sedentary_and_fat_loss"
        ? "Ze względu na siedzący tryb życia i cel redukcyjny"
        : reason === "sedentary"
        ? "Ze względu na siedzący tryb życia"
        : "Cel redukcyjny wymaga dodatkowej aktywności tlenowej.";
    return {
      type: "cardio_day",
      text: `${reasonText} dodano obowiązkową aktywność tlenową. Dodatkowa aktywność: ${extraDays} ${dayWord} cardio tygodniowo.`,
      reason,
    };
  }

  // No extra days available — prescribe a daily step target instead
  const baseText =
    reason === "sedentary_and_fat_loss"
      ? "Ze względu na siedzący tryb życia i cel redukcyjny"
      : reason === "sedentary"
      ? "Ze względu na siedzący tryb życia"
      : "Cel aktywności";
  return {
    type: "steps",
    text: `${baseText} dodano obowiązkowy cel aktywności: 8000–10000 kroków dziennie.`,
    reason,
  };
}

// ─── Feature 4 — Conditioning-goal rule ──────────────────────────────────────

export interface ConditioningRecommendation {
  text: string;
}

/**
 * Returns a conditioning-specific planning note when the client's goal is
 * "Poprawa kondycji". The plan must include at least 1 FBW session and must
 * prioritize cardio / conditioning work.
 *
 * Returns null for all other goals.
 */
export function getConditioningRecommendation(
  trainingGoal: string | null | undefined,
  availableDays: number | null | undefined,
): ConditioningRecommendation | null {
  if (trainingGoal !== "Poprawa kondycji") return null;

  const days = availableDays ?? 3;

  let text: string;
  if (days <= 2) {
    text =
      "Cel poprawy kondycji → dodano obowiązkową jednostkę cardio oraz minimum jedną sesję FBW dla rozwoju ogólnego. Plan: 1 × FBW + 1 × cardio / kondycja.";
  } else if (days === 3) {
    text =
      "Cel poprawy kondycji → dodano obowiązkową jednostkę cardio oraz minimum jedną sesję FBW dla rozwoju ogólnego. Plan: 1–2 × FBW + co najmniej 1 × cardio / kondycja.";
  } else {
    text =
      "Cel poprawy kondycji → plan priorytetyzuje cardio / kondycję w dodatkowych dniach. Trening siłowy ograniczony do prostych sesji FBW dla ogólnego rozwoju fizycznego.";
  }

  return { text };
}
