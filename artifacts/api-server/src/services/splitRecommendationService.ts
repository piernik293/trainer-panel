/**
 * Split Recommendation Service
 *
 * Pure, side-effect-free function that maps:
 *   (trainingDays, experienceLevel, recoveryQuality, trainingGoal)
 *   → { recommended, explanation, alternatives, fallbackApplied }
 *
 * Decision table mirrors the spec matrix exactly.
 * Goal is treated as a secondary modifier after the primary days × level matrix.
 * Recovery is applied last — poor recovery always pulls toward a simpler split.
 *
 * EXPERIENCE GATING
 *   Lower levels (Brak aktywności, Początkujący):
 *     - never receive specialized splits by default
 *     - priority muscles do NOT influence the recommendation
 *   Higher levels (Średniozaawansowany, Zaawansowany):
 *     - may receive more complex splits
 *     - future: priority-aware modifications can be added here
 *
 * SPLIT HIERARCHY (simplest → most complex)
 *   full_body → full_body_ab → upper_lower → upper_lower_full_body → push_pull_legs
 */

import type { SplitType } from "@workspace/api-zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplitRecommendationInput {
  trainingDays: number;
  experienceLevel: string | null;
  recoveryQuality: "excellent" | "good" | "standard" | "poor" | null;
  trainingGoal: string | null;
  priorityMuscleGroups?: string[];
}

export interface SplitRecommendationResult {
  recommended: SplitType;
  explanation: string;
  alternatives: SplitType[];
  /** True when recovery downgraded the initial recommendation. */
  fallbackApplied: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NO_ACTIVITY = "Brak aktywności fizycznej";
const BEGINNER    = "Początkujący";
const INTERMEDIATE = "Średniozaawansowany";
const ADVANCED    = "Zaawansowany";

// ─── Goal classifier ──────────────────────────────────────────────────────────

type GoalCategory = "general" | "strength" | "hypertrophy" | "fat_loss" | "unknown";

function classifyGoal(goal: string | null): GoalCategory {
  if (!goal) return "unknown";
  const g = goal.toLowerCase();
  if (/redukc|odchudz|fat.?loss|spalani|chudni|deficyt/.test(g)) return "fat_loss";
  if (/siła|strength|wyciskan|bench|powerlifting|pl|1rm/.test(g)) return "strength";
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

function levelLabel(level: string | null): string {
  return level ?? "nieznany poziom";
}

// ─── Core recommendation ──────────────────────────────────────────────────────

export function recommendSplit(input: SplitRecommendationInput): SplitRecommendationResult {
  const { trainingDays, experienceLevel, recoveryQuality, trainingGoal } = input;

  const goal        = classifyGoal(trainingGoal);
  const poorRecovery = isPoorRecovery(recoveryQuality);
  const lvl         = levelLabel(experienceLevel);

  // ─── 1 day ──────────────────────────────────────────────────────────────────
  if (trainingDays <= 1) {
    return {
      recommended: "full_body",
      explanation: "1 dzień treningowy — jedyna sensowna opcja to trening Full Body angażujący całe ciało.",
      alternatives: [],
      fallbackApplied: false,
    };
  }

  // ─── 2 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 2) {
    return {
      recommended: "full_body_ab",
      explanation:
        "2 dni treningowe — rekomendowany Full Body A/B dla wszystkich poziomów. " +
        "Rotacja sesji A i B zapewnia pełne pokrycie ciała przy optymalnej regeneracji.",
      alternatives: ["full_body"],
      fallbackApplied: false,
    };
  }

  // ─── 3 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 3) {
    if (isLowerLevel(experienceLevel)) {
      return {
        recommended: "full_body",
        explanation:
          `3 dni treningowe + poziom ${lvl} → rekomendowany Full Body. ` +
          "Na tym poziomie plan powinien mieć charakter ogólnorozwojowy. " +
          "Wysoka częstotliwość treningu każdej partii sprzyja nauce wzorców ruchowych.",
        alternatives: ["upper_lower_full_body"],
        fallbackApplied: false,
      };
    }

    // Intermediate / advanced
    if (goal === "general") {
      return {
        recommended: "full_body",
        explanation:
          `3 dni treningowe + poziom ${lvl} + cel ogólnorozwojowy → rekomendowany Full Body. ` +
          "Cel ogólnorozwojowy / zdrowotny preferuje prostsze, wszechstronne podziały.",
        alternatives: ["upper_lower_full_body"],
        fallbackApplied: false,
      };
    }

    // strength / hypertrophy / unknown → Góra/Dół/Full Body
    const base: SplitType = "upper_lower_full_body";
    let explanation =
      `3 dni treningowe + poziom ${lvl} → rekomendowany Góra / Dół / Full Body. ` +
      "Optymalny podział dla 3 sesji tygodniowo przy wyższym poziomie zaawansowania: " +
      "górna (A), górna (B), pełne ciało.";

    if (goal === "strength" || goal === "hypertrophy") {
      explanation += ` Cel ${goal === "strength" ? "siłowy" : "hipertroficzny"} wspiera wybór tego układu.`;
    }

    if (poorRecovery) {
      return {
        recommended: "full_body",
        explanation:
          `3 dni treningowe + poziom ${lvl} — słabsza regeneracja obniża rekomendację do Full Body. ` +
          "Przywróć Góra / Dół / Full Body gdy regeneracja się poprawi.",
        alternatives: ["upper_lower_full_body"],
        fallbackApplied: true,
      };
    }

    return { recommended: base, explanation, alternatives: ["full_body"], fallbackApplied: false };
  }

  // ─── 4 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 4) {
    if (experienceLevel === NO_ACTIVITY) {
      return {
        recommended: "upper_lower",
        explanation:
          "4 dni treningowe + brak aktywności fizycznej → Góra / Dół (stosuj ostrożnie). " +
          "4 dni to wymagający harmonogram dla osoby bez aktywności. " +
          "Góra / Dół zapewnia wystarczającą częstotliwość bez nadmiernej specjalizacji.",
        alternatives: ["full_body_ab"],
        fallbackApplied: false,
      };
    }

    // fat loss + poor recovery → drop to full_body_ab
    if (goal === "fat_loss" && poorRecovery) {
      return {
        recommended: "full_body_ab",
        explanation:
          `4 dni treningowe + poziom ${lvl} + redukcja + słaba regeneracja → Full Body A/B. ` +
          "Redukcja z ograniczoną regeneracją wymaga prostszego podziału chroniącego przed przetrenowaniem.",
        alternatives: ["upper_lower"],
        fallbackApplied: true,
      };
    }

    let explanation =
      `4 dni treningowe + poziom ${lvl} → rekomendowany Góra / Dół. ` +
      "Każda partia trenowana 2× w tygodniu — optymalna częstotliwość i prosty rozkład objętości.";

    if (poorRecovery) {
      explanation +=
        " Słabsza regeneracja: Góra / Dół pozostaje optymalnym wyborem — " +
        "monitoruj obciążenie i rozważ niższe intensywności.";
    }

    return {
      recommended: "upper_lower",
      explanation,
      alternatives: ["push_pull_lower_full_body"],
      fallbackApplied: false,
    };
  }

  // ─── 5 days ─────────────────────────────────────────────────────────────────
  if (trainingDays === 5) {
    if (isLowerLevel(experienceLevel)) {
      return {
        recommended: "upper_lower_full_body",
        explanation:
          `5 dni treningowe + poziom ${lvl} → rekomendowany Góra / Dół / Full Body. ` +
          "Na tym poziomie nie rekomenduje się wyspecjalizowanych podziałów przy 5 dniach. " +
          "Plan powinien mieć charakter ogólnorozwojowy.",
        alternatives: ["upper_lower"],
        fallbackApplied: false,
      };
    }

    // Intermediate / advanced
    if (poorRecovery) {
      return {
        recommended: "upper_lower_full_body",
        explanation:
          `5 dni treningowe + poziom ${lvl} — słabsza regeneracja obniża rekomendację do Góra / Dół / Full Body. ` +
          "Push / Pull / Legs zostanie rekomendowany gdy regeneracja się poprawi.",
        alternatives: ["push_pull_legs", "upper_lower"],
        fallbackApplied: true,
      };
    }

    let explanation =
      `5 dni treningowe + poziom ${lvl} → rekomendowany Push / Pull / Legs. ` +
      "Efektywna specjalizacja przy 5 sesjach tygodniowo.";

    if (goal === "strength" || goal === "hypertrophy") {
      explanation += ` Cel ${goal === "strength" ? "siłowy" : "hipertroficzny"} wspiera wybór PPL.`;
    }

    return {
      recommended: "push_pull_legs",
      explanation,
      alternatives: ["upper_lower_full_body"],
      fallbackApplied: false,
    };
  }

  // ─── 6–7 days ───────────────────────────────────────────────────────────────
  if (experienceLevel === ADVANCED) {
    if (poorRecovery) {
      return {
        recommended: "upper_lower",
        explanation:
          `${trainingDays} dni treningowe + poziom ${lvl} — słabsza regeneracja → Góra / Dół. ` +
          "Push / Pull / Legs jest dostępny gdy regeneracja pozwala na pełny harmonogram.",
        alternatives: ["push_pull_legs"],
        fallbackApplied: true,
      };
    }
    return {
      recommended: "push_pull_legs",
      explanation:
        `${trainingDays} dni treningowe + poziom ${lvl} → Push / Pull / Legs (rotacja 2×). ` +
        "Efektywny podział dla zaawansowanych przy wysokiej częstotliwości.",
      alternatives: ["upper_lower_full_body", "specialization"],
      fallbackApplied: false,
    };
  }

  // Not advanced, 6-7 days → simpler
  return {
    recommended: "upper_lower",
    explanation:
      `${trainingDays} dni treningowe + poziom ${lvl} → Góra / Dół. ` +
      "Push / Pull / Legs przy tej częstotliwości jest zarezerwowany dla zaawansowanych. " +
      "Prostszy podział jest tu bardziej efektywny.",
    alternatives: ["upper_lower_full_body"],
    fallbackApplied: false,
  };
}
