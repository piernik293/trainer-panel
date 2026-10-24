/**
 * Whole-week volume balance (POST /plan-draft/balance-week) — pure part.
 *
 * Goal: the generator never produces a plan that activation rejects. Activation blocks a plan when any volume
 * target has weekly effective sets above its absolute ceiling (status above_max_recommended / overtraining_warning,
 * i.e. ratio > 1.00), counted by computeVolumeCore (max-coefficient rule — indirect load such as triceps from
 * push-ups / presses included). This module counts with the SAME function, so "within ceiling here" means
 * "activatable there".
 *
 * Algorithm — one set at a time:
 *  - pick the target with the largest overage that still has a reducible contributor (a target stuck at its
 *    minimum no longer stops the loop — the old version broke out and left e.g. triceps over the ceiling);
 *  - reduce its contributor in tier order (core → isolation → secondary compound → main compound), earlier day first;
 *  - phase 1 keeps the structural minimum (2 sets for main compounds, 1 otherwise); only if that is not enough,
 *    phase 2 allows every exercise down to 1 set. Never removes an exercise, never adds sets.
 * Residual overages (only possible when every contributor is already at 1 set) are returned for the caller to show.
 */
import { computeVolumeCore, type NormalizedEntry } from "./volumeCalculator";

export interface BalanceEntry { exerciseId: number; sets: number; exerciseClass: string; dayIndex: number }
export interface Guideline { sessionMin: number; sessionMax: number; weeklyPreferredCeiling: number; weeklyAbsoluteCeiling: number }
export interface Residual { targetId: number; targetName: string; weeklyEffectiveSets: number; weeklyAbsoluteCeiling: number }

const EPS = 1e-9;

const tier = (ec: string): number =>
  ec === "core" || ec === "regression_beginner" ? 0 : ec === "isolation" ? 1 : ec === "secondary_compound" ? 2 : 3;

function overages(
  entries: readonly BalanceEntry[], sets: readonly number[],
  assignments: Map<number, Map<number, number>>,
  targets: Map<number, { name: string; type: string; memberMuscleIds: Set<number> }>,
  guidelines: Map<number, Guideline>,
) {
  const normalized: NormalizedEntry[] = entries.map((e, i) => ({
    entryId: i, dayId: e.dayIndex, dayName: null, dayOrder: e.dayIndex, exerciseId: e.exerciseId, exerciseName: "", workingSets: sets[i],
  }));
  return computeVolumeCore(normalized, assignments, targets, guidelines, [...targets.keys()])
    .filter((t) => t.hasGuideline && t.weeklyEffectiveSets > t.weeklyAbsoluteCeiling + EPS)
    .sort((a, b) => (b.weeklyEffectiveSets - b.weeklyAbsoluteCeiling) - (a.weeklyEffectiveSets - a.weeklyAbsoluteCeiling));
}

export function balanceWeek(
  entries: readonly BalanceEntry[],
  assignments: Map<number, Map<number, number>>,
  targets: Map<number, { name: string; type: string; memberMuscleIds: Set<number> }>,
  guidelines: Map<number, Guideline>,
): { sets: number[]; residual: Residual[] } {
  const sets = entries.map((e) => e.sets);
  const order = entries.map((e, i) => i).sort((a, b) => tier(entries[a].exerciseClass) - tier(entries[b].exerciseClass) || a - b);
  const contributes = (i: number, targetId: number) => {
    const muscles = assignments.get(entries[i].exerciseId);
    const members = targets.get(targetId)?.memberMuscleIds;
    return !!muscles && !!members && [...members].some((m) => (muscles.get(m) ?? 0) > 0);
  };
  for (const phase of [1, 2] as const) {
    const min = (i: number) => (phase === 1 && entries[i].exerciseClass === "main_compound" ? 2 : 1);
    for (let iter = 0; iter < 1000; iter++) {
      const over = overages(entries, sets, assignments, targets, guidelines);
      if (over.length === 0) return { sets, residual: [] };
      let reduced = false;
      for (const t of over) {
        const i = order.find((k) => sets[k] > min(k) && contributes(k, t.targetId));
        if (i !== undefined) { sets[i]--; reduced = true; break; }
      }
      if (!reduced) break; // every over-ceiling target is at this phase's minimum
    }
  }
  const residual = overages(entries, sets, assignments, targets, guidelines).map((t) => ({
    targetId: t.targetId, targetName: t.targetName, weeklyEffectiveSets: t.weeklyEffectiveSets, weeklyAbsoluteCeiling: t.weeklyAbsoluteCeiling,
  }));
  return { sets, residual };
}
