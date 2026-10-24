/**
 * Auxiliary Core / Brzuch Volume Block
 *
 * Pure, deterministic service. No database reads. No writes. No exercises assigned.
 * All values are whole integers.
 *
 * Represents direct core working sets (planks, anti-rotation, ab isolation, etc.)
 * NOT indirect work from squats, deadlifts, or other compound exercises.
 */

import type { AuxiliaryCoreBlockType } from "@workspace/api-zod";

// ─── Experience level constants ────────────────────────────────────────────────

const NO_ACTIVITY = "Brak aktywności fizycznej";
const BEGINNER = "Początkujący";
const INTERMEDIATE = "Średniozaawansowany";
const ADVANCED = "Zaawansowany";

/** Base weekly core sets per experience level. All integers. */
const BASE_SETS: Record<string, number> = {
  [NO_ACTIVITY]: 6, // = Początkujący (decyzja 24.10.2026; było 4)
  [BEGINNER]: 6,
  [INTERMEDIATE]: 6,
  [ADVANCED]: 8,
};

const PRIORITY_BONUS = 2;
const MAX_AUTO_SETS = 10;

// ─── Future exercise rules (deterministic, Phase B ready) ─────────────────────

/**
 * Future-use exercise preference rules.
 * These are NOT applied in this task — no exercises are assigned.
 * Used by a future exercise-selection phase.
 */
export const CORE_EXERCISE_FUTURE_RULES = {
  /** Preferred for "Brak aktywności fizycznej" clients. */
  noActivity: ["Dead bug", "Bird dog", "Pallof press"] as const,
  /** Additional options for Początkujący / Średniozaawansowany / Zaawansowany. */
  otherLevels: [
    "plank",
    "side plank",
    "cable crunch",
    "rollout variations",
    "carries",
  ] as const,
} as const;

// ─── Core recommendation ──────────────────────────────────────────────────────

/**
 * Returns the recommended weekly core working sets for the given experience level.
 *
 * - No Activity → 4
 * - Beginner    → 6
 * - Intermediate → 6
 * - Advanced    → 8
 *
 * If `isPriority` is true, adds +2 sets up to MAX_AUTO_SETS (10).
 * Always returns a whole integer.
 */
export function recommendWeeklyCoreSets(
  experienceLevel: string | null,
  isPriority: boolean,
): number {
  const base = BASE_SETS[experienceLevel ?? ""] ?? 6;
  return isPriority ? Math.min(base + PRIORITY_BONUS, MAX_AUTO_SETS) : base;
}

// ─── Core distribution ────────────────────────────────────────────────────────

/**
 * Distributes weekly core sets across training days.
 *
 * Rules:
 * - ≤6 sets → 2 sessions; ≥7 sets → 3 sessions.
 * - Never more sessions than available training days.
 * - Prefer days with the lowest current muscle-target workload.
 * - Use dayIndex as a deterministic tie-breaker when workloads are equal.
 * - Each allocation is a whole integer (largest-remainder).
 *
 * Examples:
 *   4  / 2 sessions → [2, 2]
 *   6  / 2 sessions → [3, 3]
 *   8  / 3 sessions → [3, 3, 2]
 *   10 / 3 sessions → [4, 3, 3]
 *
 * @param weeklyTotal  Total weekly core sets (integer).
 * @param trainingDays Number of available training days.
 * @param dayWorkloads Map of dayIndex → totalEffectiveTargetVolume (lower = lighter day).
 */
export function distributeCoreVolume(
  weeklyTotal: number,
  trainingDays: number,
  dayWorkloads: Map<number, number>,
): Array<{ dayIndex: number; sets: number }> {
  if (weeklyTotal === 0 || trainingDays === 0 || dayWorkloads.size === 0) return [];

  const targetSessions = weeklyTotal <= 6 ? 2 : 3;
  const numSessions = Math.min(targetSessions, trainingDays);

  // Sort by workload ascending, then dayIndex ascending (deterministic tie-break)
  const selectedDays = [...dayWorkloads.entries()]
    .sort(([aIdx, aLoad], [bIdx, bLoad]) => {
      if (aLoad !== bLoad) return aLoad - bLoad;
      return aIdx - bIdx;
    })
    .slice(0, numSessions)
    .map(([idx]) => idx)
    .sort((a, b) => a - b); // re-sort by dayIndex for consistent allocation order

  const N = selectedDays.length;
  if (N === 0) return [];

  // Largest-remainder integer distribution
  const base = Math.floor(weeklyTotal / N);
  const extra = weeklyTotal % N;

  return selectedDays.map((dayIndex, i) => ({
    dayIndex,
    sets: base + (i < extra ? 1 : 0),
  }));
}

// ─── Full block computation ───────────────────────────────────────────────────

/**
 * Compute the full auxiliary core / brzuch block.
 *
 * @param experienceLevel  Canonical experience level string or null.
 * @param isPriority       Whether the trainer selected core as a priority.
 * @param trainingDays     Number of training days in the plan.
 * @param dayWorkloads     Map of dayIndex → totalEffectiveTargetVolume for each day.
 */
export function computeAuxiliaryCoreBlock(params: {
  experienceLevel: string | null;
  isPriority: boolean;
  trainingDays: number;
  dayWorkloads: Map<number, number>;
}): AuxiliaryCoreBlockType {
  const { experienceLevel, isPriority, trainingDays, dayWorkloads } = params;

  const weeklyRecommendedSets = recommendWeeklyCoreSets(experienceLevel, isPriority);
  const weeklySelectedSets = weeklyRecommendedSets; // no trainer override in Phase 3A
  const dayAllocations = distributeCoreVolume(weeklySelectedSets, trainingDays, dayWorkloads);

  const reasons: string[] = [
    `${weeklySelectedSets} serii Core / brzuch tygodniowo (bezpośrednia praca)`,
  ];
  if (isPriority) {
    reasons.push("Priorytet: Core / brzuch (+2 serie tygodniowo)");
  }

  return {
    weeklyRecommendedSets,
    weeklySelectedSets,
    isPriority,
    dayAllocations,
    placement: "end_of_session",
    reasons,
    warnings: [],
  };
}
