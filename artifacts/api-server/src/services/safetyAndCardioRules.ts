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
    .replace(/[\u0300-\u036f]/g, "")  // strips: ą→a, ę→e, ó→o, ś→s, ź/ż→z, ć→c, ń→n
    .replace(/\u0142/g, "l")          // ł (U+0142) does not decompose in NFD — replace explicitly
    .replace(/\u0141/g, "L")
    .toLowerCase();
}

/**
 * Single-word pain/limitation patterns — applied to accent-normalised, ł-replaced text.
 *
 * Covers all inflected forms from the spec:
 *   ból / boli / bolą / bolesny / problem / problemy / strzela / strzelanie /
 *   strzyka / strzykanie / kłuje / kłucie / drętwieje / drętwienie / mrowienie /
 *   uraz / kontuzja / zwichnięcie / obrzęk / puchnie / niestabilność /
 *   przeskakuje / chrupie  (+  multi-word: ograniczenie ruchu — see below)
 *
 * Each pattern is tested against a single whitespace-tokenised word so \b anchors
 * behave correctly and there are no substring false-positives.
 */
const PAIN_PATTERNS: RegExp[] = [
  // ból and inflections
  /^bol$/,          // ból (base)
  /^bolu$/,         // bólu
  /^bole$/,         // bóle
  /^boly$/,         // bóle (gen. pl.)
  /^boli$/,         // boli
  /^bola(m|s|l|la|lo)?$/,  // bolą / bolała / bolał (bolą→bola after NFD)
  /^bolac$/,        // bólach / bólący
  /^bolenie$/,      // bolenie
  /^bolesn/,        // bolesny / bolesna / bolesne / bolesność
  // problem
  /^problem(y|ow|ami|em|ie|u|ach)?$/,
  // strzela / strzyka
  /^strzela(nie|m|sz|l|la|lo)?$/,
  /^strzyka(nie|m|sz|l|la|lo)?$/,
  // kłuje / kłucie  (ł→l after normalization)
  /^kluje?$/,
  /^klucie$/,
  // drętwieje / drętwienie  (ę→e, ę→e)
  /^dretwiej(e|a)?$/,
  /^dretwienie$/,
  // mrowienie / mrowi
  /^mrowienie$/,
  /^mrowi$/,
  // uraz and inflections
  /^uraz(em|u|y|owi|ami|ach)?$/,
  // kontuzja
  /^kontuzj(a|i|e|ami|ach)?$/,
  // zwichnięcie  (ę→e)
  /^zwichni(ecie|ec|en)/,
  // obrzęk  (ę→e)
  /^obrzek(u|owi|iem)?$/,
  // puchnie
  /^puchni(e|ecie)?$/,
  // niestabilność  (ó→o, ść→sc)
  /^niestabiln(osc|y|a|e|ie|ymi)?$/,
  // przeskakuje
  /^przeskakuje?$/,
  // chrupie
  /^chrupie$/,
];

/**
 * Multi-word patterns checked against the full normalised string.
 * Negation is still verified for these.
 */
const MULTI_WORD_PAIN_PATTERNS: RegExp[] = [
  /ograniczenie\s+ruchu/,
];

/**
 * Negation words that — when found within the 4 words immediately preceding a
 * pain keyword — indicate the phrase is negated and should not count as a warning.
 *
 * Examples suppressed:
 *   "nic mnie nie boli"      ("nic", "nie" before "boli")
 *   "nie boli mnie"          ("nie" before "boli")
 *   "nie mam problemów"      ("nie" before "problemow")
 *   "brak bólu"              ("brak" before "bolu")
 *   "bez bólu"               ("bez" before "bolu")
 *   "nie mam żadnej kontuzji" ("nie", "zadnej" before "kontuzji")
 */
const NEGATION_WORDS = new Set([
  "nie", "nic", "brak", "bez", "zadnej", "zadnego", "zadna", "zadnych",
]);

/**
 * Detects pain-related keywords in health-related text only.
 *
 * Must NOT be called with arbitrary survey fields.
 * Only call with: healthLimitations, injury description, or other medically-scoped text.
 *
 * @param healthText - text from a health / limitations field, or null/empty
 * @returns true when any pain keyword is found (accent-insensitive)
 */
/**
 * Detects unambiguous pain or limitation keywords in health-related free text.
 *
 * Uses a 4-word sliding window to suppress clearly negated occurrences such as
 * "nie boli", "nic mnie nie boli", "brak bólu", or "bez kontuzji".
 * Ambiguous phrases ("nie zawsze boli") are still flagged — the intent is to
 * surface potential warnings, not to suppress uncertain cases.
 *
 * IMPORTANT — scope rules:
 *   Only call with health-related text (healthLimitations, injury description).
 *   Never pass trainingGoal, motivational text, or other non-medical fields.
 */
export function detectPainKeywords(healthText: string | null | undefined): boolean {
  if (!healthText || healthText.trim() === "") return false;
  const normalized = normalizePL(healthText);

  // Tokenise into words; strip punctuation so negation words are not stuck to
  // adjacent characters (e.g. "nie." would not match the negation set otherwise).
  const words = normalized
    .replace(/[.,;:!?()'"""„"'–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Fast-exit: only proceed when the word matches at least one pain pattern
    if (!PAIN_PATTERNS.some((p) => p.test(word))) continue;

    // Pain keyword candidate — look for a negation word in the 4 preceding positions
    const windowStart = Math.max(0, i - 4);
    let negated = false;
    for (let j = windowStart; j < i; j++) {
      if (NEGATION_WORDS.has(words[j])) {
        negated = true;
        break;
      }
    }
    if (!negated) return true;
  }

  // Multi-word patterns checked against the full normalised string; negation is
  // verified by scanning the ~4 words that appear before the matched phrase.
  for (const pattern of MULTI_WORD_PAIN_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match || match.index === undefined) continue;
    const before = normalized
      .slice(Math.max(0, match.index - 40), match.index)
      .replace(/[.,;:!?()'"""„"'–—]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(-4);
    const negated = before.some((w) => NEGATION_WORDS.has(w));
    if (!negated) return true;
  }

  return false;
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

/**
 * Why the cardio / activity recommendation was triggered:
 *   experience_cap          – surplus days above the level-based strength cap (any goal)
 *   sedentary               – sedentary lifestyle, no fat-loss goal
 *   fat_loss                – fat-loss goal, non-sedentary
 *   sedentary_and_fat_loss  – both sedentary + fat-loss
 */
export type CardioReasonType =
  | "experience_cap"
  | "sedentary"
  | "fat_loss"
  | "sedentary_and_fat_loss";

export interface CardioRecommendation {
  type: CardioRecommendationType;
  text: string;
  reason: CardioReasonType;
}

/**
 * Maximum allowed strength-training days by experience level.
 * Surplus days above this cap MUST be redirected to cardio / general activity.
 *
 *   "Brak aktywności fizycznej" → 2 strength days max
 *   "Początkujący"              → 3 strength days max
 *   all other levels            → no cap enforced here
 */
const STRENGTH_DAY_CAP: Record<string, number> = {
  "Brak aktywności fizycznej": 2,
  "Początkujący": 3,
};

const FAT_LOSS_GOAL_VALUES = ["Redukcja tkanki tłuszczowej"];
const FAT_LOSS_KEYWORDS_NORM = ["redukcja", "odchudzanie", "tluszcz", "fat loss", "schudnac", "schudnac"];

export function isFatLossGoal(trainingGoal: string | null | undefined): boolean {
  if (!trainingGoal) return false;
  if (FAT_LOSS_GOAL_VALUES.includes(trainingGoal)) return true;
  const norm = normalizePL(trainingGoal);
  return FAT_LOSS_KEYWORDS_NORM.some((kw) => norm.includes(kw));
}

export function isSedentaryLifestyle(activityLevel: string | null | undefined): boolean {
  return activityLevel === "Siedzący";
}

/**
 * Returns a mandatory cardio / activity recommendation when ANY of the following apply:
 *
 *   1. Experience cap (highest priority):
 *      - "Brak aktywności fizycznej": max 2 strength days; surplus → cardio/activity days
 *      - "Początkujący":              max 3 strength days; surplus → cardio/activity days
 *      Fires for any goal and any activity level.
 *
 *   2. Sedentary lifestyle and/or fat-loss goal (when no surplus days above cap):
 *      - No extra days available → daily step target (8000–10000 steps)
 *
 * Returns null when none of the above conditions are met.
 */
export function getCardioRecommendation(
  trainingGoal: string | null | undefined,
  activityLevel: string | null | undefined,
  availableDays: number | null | undefined,
  experienceLevel: string | null | undefined,
): CardioRecommendation | null {
  const days = availableDays ?? 3;
  const cap = experienceLevel != null ? (STRENGTH_DAY_CAP[experienceLevel] ?? Infinity) : Infinity;
  const surplusDays = cap < Infinity ? Math.max(0, days - cap) : 0;

  // ── Priority 1: experience-level cap ────────────────────────────────────────
  if (surplusDays > 0) {
    const fatLoss = isFatLossGoal(trainingGoal);
    const sedentary = isSedentaryLifestyle(activityLevel);
    const capLabel = cap === 2 ? "2 treningi siłowe" : "3 treningi siłowe";
    const dayWord = surplusDays === 1 ? "dzień" : "dni";

    // Build contextual reason — cap always dominates, but we can layer the other reasons into text
    const reason: CardioReasonType =
      fatLoss && sedentary ? "sedentary_and_fat_loss"
      : sedentary ? "sedentary"
      : fatLoss ? "fat_loss"
      : "experience_cap";

    const capNote = `Poziom zaawansowania "${experienceLevel}" dopuszcza maksymalnie ${capLabel} tygodniowo.`;
    const extraNote =
      reason === "sedentary_and_fat_loss"
        ? " Siedzący tryb życia i cel redukcyjny dodatkowo uzasadniają aktywność tlenową."
        : reason === "sedentary"
        ? " Siedzący tryb życia dodatkowo uzasadnia aktywność tlenową."
        : reason === "fat_loss"
        ? " Cel redukcyjny dodatkowo uzasadnia aktywność tlenową."
        : "";

    return {
      type: "cardio_day",
      text: `${capNote} Nadprogramowe ${surplusDays} ${dayWord}: cardio / aktywność ogólnorozwojowa (nie siłownia).${extraNote}`,
      reason,
    };
  }

  // ── Priority 2: sedentary / fat-loss (no surplus days available) ─────────────
  const fatLoss = isFatLossGoal(trainingGoal);
  const sedentary = isSedentaryLifestyle(activityLevel);

  if (!fatLoss && !sedentary) return null;

  const reason: CardioReasonType =
    fatLoss && sedentary ? "sedentary_and_fat_loss" : sedentary ? "sedentary" : "fat_loss";

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
