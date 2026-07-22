/**
 * Split Recommendation Service
 *
 * Pure, side-effect-free function that maps:
 *   (trainingDays, experienceLevel, recoveryQuality, trainingGoal)
 *   → { recommended, explanation, alternatives, fallbackApplied, cappedTrainingDays }
 *
 * ── Product-level split families ────────────────────────────────────────────
 *   full_body · upper_lower · upper_lower_full_body · push_pull_legs
 *
 *   `full_body_ab` is an internal template variant (two non-identical A/B days
 *   within the Full Body family). It must NOT appear in recommendation output.
 *   All public recommendations use `full_body` for the Full Body family.
 *
 * ── Beginner / Brak aktywności hard cap ─────────────────────────────────────
 *   Maximum recommended training frequency for these levels is 3 days/week.
 *   If the survey declares more than 3 days, the recommendation still returns
 *   `full_body` + `cappedTrainingDays: 3`. The declared value is preserved in
 *   the input object; only the recommendation is capped.
 *
 * ── Split hierarchy (simplest → most complex) ───────────────────────────────
 *   full_body → upper_lower → upper_lower_full_body → push_pull_legs
 *
 * ── Recovery modifier ───────────────────────────────────────────────────────
 *   Applied last. `poor` pulls toward a simpler split for intermediate/advanced.
 *   Beginner/no-activity are already at the simplest split, so no further
 *   downgrade is possible.
 */

import type { SplitType } from "@workspace/api-zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplitRecommendationInput {
  trainingDays: number;
  experienceLevel: string | null;
  recoveryQuality: "excellent" | "good" | "standard" | "poor" | null;
  trainingGoal: string | null;
  priorityMuscleGroups?: string[];
  /** Athlete status from survey ("Tak — zawodowo" | "Tak — amatorsko" | "Nie" | null). */
  athleteStatus?: string | null;
  /** Sport performance sub-priorities (e.g. ["Dynamika", "Szybkość", "Stabilizacja"]). */
  sportPerformanceNeeds?: string[];
  /** Session duration in minutes — used to gate the competitive-athlete override (≥90). */
  sessionDurationMinutes?: number | null;
  /** Whether the client has gym access (barbell + machines). Defaults to true when omitted. */
  hasGymAccess?: boolean;
}

export interface SplitRecommendationResult {
  recommended: SplitType;
  explanation: string;
  alternatives: SplitType[];
  /** True when recovery downgraded the initial intermediate/advanced recommendation. */
  fallbackApplied: boolean;
  /**
   * Set when the recommendation caps the training frequency below what the
   * user declared in their survey. E.g. survey says 5 days but level is
   * Początkujący → cappedTrainingDays = 3.
   * Null when no cap was applied.
   */
  cappedTrainingDays: number | null;
  /**
   * Set when a competitive sport profile justifies substituting one session type
   * with a more athletic alternative (e.g. replacing the 4th Lower session with
   * a FBW/Plyo day for competitive athletes with Dynamika/Szybkość priorities).
   *
   * Plain-language explanation for the trainer / plan summary.
   * Null when no override was applied.
   */
  structureOverrideReason?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NO_ACTIVITY  = "Brak aktywności fizycznej";
const BEGINNER     = "Początkujący";
const INTERMEDIATE = "Średniozaawansowany";
const ADVANCED     = "Zaawansowany";

/** Maximum recommended training days per week for beginner / no-activity levels. */
const LOWER_LEVEL_MAX_DAYS = 3;

// ─── Goal classifier ──────────────────────────────────────────────────────────

type GoalCategory = "general" | "strength" | "hypertrophy" | "fat_loss" | "unknown";

function classifyGoal(goal: string | null): GoalCategory {
  if (!goal) return "unknown";
  const g = goal.toLowerCase();
  if (/redukc|odchudz|fat.?loss|spalani|chudni|deficyt/.test(g)) return "fat_loss";
  if (/siła|strength|wyciskan|bench|powerlifting|pl|1rm/.test(g))  return "strength";
  if (/mas[ay]|hipertrofi|hypertrophy|muskulat|objętoś|mięśni/.test(g)) return "hypertrophy";
  if (/ogólnorozwoj|zdrowi|kondycj|aktywno|sprawno|ruch|forma|wellbeing/.test(g)) return "general";
  return "unknown";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLowerLevel(level: string | null): boolean {
  return level === NO_ACTIVITY || level === BEGINNER;
}

function isPoorRecovery(r: "excellent" | "good" | "standard" | "poor" | null): boolean {
  return r === "poor";
}

function lvl(level: string | null): string {
  return level ?? "nieznany poziom";
}

// ─── Core recommendation ──────────────────────────────────────────────────────

export function recommendSplit(input: SplitRecommendationInput): SplitRecommendationResult {
  const { trainingDays, experienceLevel, recoveryQuality, trainingGoal } = input;

  const goal        = classifyGoal(trainingGoal);
  const poorRecovery = isPoorRecovery(recoveryQuality);

  // ── Beginner / no-activity: hard 3-day cap ───────────────────────────────
  //
  // No matter how many days the survey declares, these levels should not
  // receive a recommendation above 3 days or a split above Full Body.
  // Return immediately with cappedTrainingDays set.
  //
  if (isLowerLevel(experienceLevel)) {
    const declared = trainingDays;
    const capped   = declared > LOWER_LEVEL_MAX_DAYS;

    if (capped) {
      return {
        recommended: "full_body",
        explanation:
          `Wywiad wskazuje ${declared} dni, ale na poziomie ${lvl(experienceLevel)} ` +
          `rekomendujemy maksymalnie ${LOWER_LEVEL_MAX_DAYS} dni treningowe tygodniowo ` +
          "i plan ogólnorozwojowy Full Body. " +
          "Wyższa częstotliwość zostanie uwzględniona gdy poziom zaawansowania wzrośnie.",
        alternatives: [],
        fallbackApplied: false,
        cappedTrainingDays: LOWER_LEVEL_MAX_DAYS,
      };
    }

    // ≤ 3 days, lower level — always Full Body, no alternatives needed
    const dayNote = declared <= 1
      ? "1 dzień treningowy"
      : `${declared} ${declared === 2 ? "dni treningowe" : "dni treningowe"}`;

    return {
      recommended: "full_body",
      explanation:
        `${dayNote} + poziom ${lvl(experienceLevel)} → rekomendowany Full Body. ` +
        "Plan powinien mieć charakter ogólnorozwojowy. " +
        "Wysoka częstotliwość treningu każdej partii sprzyja nauce wzorców ruchowych.",
      alternatives: [],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ── Intermediate / advanced below ────────────────────────────────────────

  // ─── 1 day ──────────────────────────────────────────────────────────────────
  if (trainingDays <= 1) {
    return {
      recommended: "full_body",
      explanation: "1 dzień treningowy — jedyna sensowna opcja to trening Full Body angażujący całe ciało.",
      alternatives: [],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ─── 2 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 2) {
    return {
      recommended: "full_body",
      explanation:
        `2 dni treningowe + poziom ${lvl(experienceLevel)} → rekomendowany Full Body. ` +
        "Dwie sesje tygodniowo angażujące całe ciało z wariantami A i B.",
      alternatives: [],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ─── 3 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 3) {
    if (goal === "general") {
      return {
        recommended: "full_body",
        explanation:
          `3 dni treningowe + poziom ${lvl(experienceLevel)} + cel ogólnorozwojowy → rekomendowany Full Body. ` +
          "Cel ogólnorozwojowy / zdrowotny preferuje prostsze, wszechstronne podziały.",
        alternatives: ["upper_lower_full_body"],
        fallbackApplied: false,
        cappedTrainingDays: null,
      };
    }

    // Poor recovery → downgrade to full_body
    if (poorRecovery) {
      return {
        recommended: "full_body",
        explanation:
          `3 dni treningowe + poziom ${lvl(experienceLevel)} — słabsza regeneracja obniża rekomendację do Full Body. ` +
          "Przywróć Góra / Dół / Full Body gdy regeneracja się poprawi.",
        alternatives: ["upper_lower_full_body"],
        fallbackApplied: true,
        cappedTrainingDays: null,
      };
    }

    // strength / hypertrophy / unknown → Góra/Dół/Full Body
    let explanation =
      `3 dni treningowe + poziom ${lvl(experienceLevel)} → rekomendowany Góra / Dół / Full Body. ` +
      "Optymalny podział dla 3 sesji tygodniowo: górna (A), górna (B), pełne ciało.";

    if (goal === "strength" || goal === "hypertrophy") {
      explanation += ` Cel ${goal === "strength" ? "siłowy" : "hipertroficzny"} wspiera wybór tego układu.`;
    }

    return {
      recommended: "upper_lower_full_body",
      explanation,
      alternatives: ["full_body"],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ─── 4 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 4) {
    // ── Competitive athlete structure override (Stage G — Part 3) ─────────────
    //
    // For competitive sport clients with Dynamika/Szybkość priorities, long
    // sessions (≥ 90 min), and gym access: swap the plain Upper/Lower × 2 for
    // upper_lower_full_body, whose 4th day maps to an FBW/athletic session
    // rather than a second identical Lower session.
    //
    // Gate: poor recovery takes priority over this override — a fatigued
    // competitive athlete still needs the simpler structure.
    {
      const isSportGoal =
        input.trainingGoal != null &&
        (input.trainingGoal.includes("sportow") ||
          input.trainingGoal.toLowerCase().includes("cel sport"));
      const isCompetitiveSport =
        isSportGoal &&
        (input.athleteStatus === "Tak — zawodowo" ||
          (input.athleteStatus ?? "").toLowerCase().includes("zawodowo"));
      const needs = (input.sportPerformanceNeeds ?? []).map((s) => s.toLowerCase());
      const hasDynSpeed =
        needs.includes("dynamika") || needs.includes("szybkość");
      const hasLongSessions = (input.sessionDurationMinutes ?? 0) >= 90;
      const hasGym = input.hasGymAccess !== false; // default true when not supplied

      if (isCompetitiveSport && hasDynSpeed && hasLongSessions && hasGym && !poorRecovery) {
        return {
          recommended: "upper_lower_full_body",
          explanation:
            `4 dni treningowe + poziom ${lvl(experienceLevel)} + sportowiec zawodowy ` +
            `+ priorytet Dynamika/Szybkość → układ Górna / Dolna / Górna / FBW-atletyczny. ` +
            `Czwarty dzień zamieniony na sesję FBW z komponentem plyo/atletycznym.`,
          structureOverrideReason:
            `Zmieniono klasyczny układ Góra/Dół 2× na Górna A / Dolna / Górna B / FBW-Plyo. ` +
            `Powód: klient jest sportowcem zawodowym z priorytetem Dynamika/Szybkość, ` +
            `sesje ≥ 90 min, dostęp do siłowni. ` +
            `Czwarty dzień powinien zawierać ćwiczenia o wysokim obciążeniu neurologicznym ` +
            `i/lub plyometryczne zamiast drugiej sesji Dolnej.`,
          alternatives: ["upper_lower"],
          fallbackApplied: false,
          cappedTrainingDays: null,
        };
      }
    }

    // Fat loss + poor recovery → simplify
    if (goal === "fat_loss" && poorRecovery) {
      return {
        recommended: "full_body",
        explanation:
          `4 dni treningowe + poziom ${lvl(experienceLevel)} + redukcja + słaba regeneracja → Full Body. ` +
          "Redukcja z ograniczoną regeneracją wymaga prostszego podziału chroniącego przed przetrenowaniem.",
        alternatives: ["upper_lower"],
        fallbackApplied: true,
        cappedTrainingDays: null,
      };
    }

    let explanation =
      `4 dni treningowe + poziom ${lvl(experienceLevel)} → rekomendowany Góra / Dół. ` +
      "Każda partia trenowana 2× w tygodniu — optymalna częstotliwość i prosty rozkład objętości.";

    if (poorRecovery) {
      explanation +=
        " Słabsza regeneracja: Góra / Dół pozostaje optymalnym wyborem — " +
        "monitoruj obciążenie i rozważ niższe intensywności.";
    }

    return {
      recommended: "upper_lower",
      explanation,
      alternatives: ["upper_lower_full_body"],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ─── 5 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 5) {
    if (poorRecovery) {
      return {
        recommended: "upper_lower_full_body",
        explanation:
          `5 dni treningowe + poziom ${lvl(experienceLevel)} — słabsza regeneracja obniża rekomendację ` +
          "do Góra / Dół / Full Body. Push / Pull / Legs zostanie rekomendowany gdy regeneracja się poprawi.",
        alternatives: ["push_pull_legs", "upper_lower"],
        fallbackApplied: true,
        cappedTrainingDays: null,
      };
    }

    let explanation =
      `5 dni treningowe + poziom ${lvl(experienceLevel)} → rekomendowany Push / Pull / Legs. ` +
      "Efektywna specjalizacja przy 5 sesjach tygodniowo.";

    if (goal === "strength" || goal === "hypertrophy") {
      explanation += ` Cel ${goal === "strength" ? "siłowy" : "hipertroficzny"} wspiera wybór PPL.`;
    }

    return {
      recommended: "push_pull_legs",
      explanation,
      alternatives: ["upper_lower_full_body"],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // ─── 6–7 days ───────────────────────────────────────────────────────────────
  //
  // NOTE: getCompatibleSplits(≥6) = ["push_pull_legs", "push_pull_lower_full_body",
  //       "specialization", "custom"].  "upper_lower" is NOT in that list, so every
  //       branch here must recommend a split from the compatible set only.
  if (experienceLevel === ADVANCED) {
    if (poorRecovery) {
      return {
        recommended: "push_pull_legs",
        explanation:
          `${trainingDays} dni treningowe + poziom ${lvl(experienceLevel)} — słabsza regeneracja. ` +
          "Push / Pull / Legs pozostaje optymalnym wyborem przy tej częstotliwości; " +
          "monitoruj obciążenie i rozważ niższe intensywności na słabszych sesjach.",
        alternatives: ["push_pull_lower_full_body"],
        fallbackApplied: true,
        cappedTrainingDays: null,
      };
    }
    return {
      recommended: "push_pull_legs",
      explanation:
        `${trainingDays} dni treningowe + poziom ${lvl(experienceLevel)} → Push / Pull / Legs (rotacja 2×). ` +
        "Efektywny podział dla zaawansowanych przy wysokiej częstotliwości.",
      alternatives: ["push_pull_lower_full_body", "specialization"],
      fallbackApplied: false,
      cappedTrainingDays: null,
    };
  }

  // Intermediate, 6-7 days → Push / Pull / Legs
  // upper_lower is not in getCompatibleSplits(≥6); PPL is the lowest-complexity
  // allowed option and appropriate for an intermediate at this frequency.
  return {
    recommended: "push_pull_legs",
    explanation:
      `${trainingDays} dni treningowe + poziom ${lvl(experienceLevel)} → Push / Pull / Legs. ` +
      "Przy tej częstotliwości PPL jest optymalnym wyborem — każda partia trenowana 2× w tygodniu " +
      "przy dobrym rozłożeniu objętości na 6–7 sesji.",
    alternatives: ["push_pull_lower_full_body"],
    fallbackApplied: false,
    cappedTrainingDays: null,
  };
}
