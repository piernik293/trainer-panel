/**
 * Plan Feedback System
 *
 * Analyses a DailyAllocationResult (plus the original input) and produces
 * human-readable messages explaining what is wrong and what to improve.
 *
 * Rules (exactly as specified — do not add more):
 *   1. Unresolved volume   → warn + suggest reducing volume / changing split
 *   2. Low frequency       → warn per target when trained only 1 day AND volume ≥ 10
 *   3. Session overload    → warn per day when total ≥ 90 % of sessionMax
 *   4. Impossible case     → warn when status === "infeasible"
 *   5. Clean case          → confirm when none of the above triggered
 *
 * This module is pure (no side effects, no DB access).
 * DO NOT integrate with autoFill or any other service here.
 */

import type { DailyAllocationInput, DailyAllocationResult } from "./dailyAllocationEngine.js";

// ─── Output type ─────────────────────────────────────────────────────────────

export interface PlanFeedbackResult {
  status: "feasible" | "feasible_with_tradeoffs" | "infeasible";
  /** What is wrong with the plan. */
  messages: string[];
  /** What the trainer should do about it. */
  suggestions: string[];
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Builds a feedback report for a plan based on the allocation result and input.
 *
 * @param allocation - Output of allocateDaily()
 * @param input      - The same DailyAllocationInput that was passed to allocateDaily()
 */
export function buildPlanFeedback(
  allocation: DailyAllocationResult,
  input: DailyAllocationInput,
): PlanFeedbackResult {
  const { sessionMax } = input.constraints;
  const messages: string[] = [];
  const suggestions: string[] = [];

  // ── Rule 1: Unresolved volume ────────────────────────────────────────────

  const hasUnresolved = Object.values(allocation.weeklyUnresolved).some(
    (v) => v > 0,
  );

  if (hasUnresolved) {
    messages.push("Nie cała objętość została rozłożona w tygodniu.");
    suggestions.push("Zmniejsz objętość lub zmień podział treningów.");
  }

  // ── Rule 2: Low frequency ────────────────────────────────────────────────

  for (const [targetId, weeklyVolume] of Object.entries(input.weeklyTargets)) {
    // Count days where this target has allocation > 0
    const activeDays = allocation.days.filter(
      (day) => (day.allocations[targetId] ?? 0) > 0,
    ).length;

    if (activeDays === 1 && weeklyVolume >= 10) {
      messages.push(`Niska częstotliwość dla: ${targetId}`);
      suggestions.push("Zwiększ częstotliwość tej partii mięśniowej.");
    }
  }

  // ── Rule 3: Session overload ─────────────────────────────────────────────

  const nearMaxThreshold = sessionMax * 0.9;

  for (const day of allocation.days) {
    if (day.total >= nearMaxThreshold) {
      messages.push(`Trening bardzo obciążony: dzień ${day.dayIndex + 1}`);
      suggestions.push(
        "Zmniejsz objętość lub zwiększ liczbę dni treningowych.",
      );
    }
  }

  // ── Rule 4: Impossible case ──────────────────────────────────────────────

  if (allocation.status === "infeasible") {
    messages.push(
      "Nie można poprawnie rozłożyć planu przy obecnych założeniach.",
    );
    suggestions.push("Zmień split lub zmniejsz objętość.");
  }

  // ── Rule 5: Clean case ───────────────────────────────────────────────────

  const isClean =
    !hasUnresolved &&
    allocation.days.every((day) => day.total < nearMaxThreshold) &&
    allocation.status !== "infeasible" &&
    messages.length === 0;

  if (isClean) {
    messages.push("Plan jest dobrze zbalansowany.");
  }

  return {
    status: allocation.status,
    messages,
    suggestions,
  };
}
