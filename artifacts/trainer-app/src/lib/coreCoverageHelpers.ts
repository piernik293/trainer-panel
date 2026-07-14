/**
 * Core / brzuch coverage — pure helpers (no React, no DB).
 *
 * "Brzuch" is the reliable, DB-level exercise classification.
 * It comes from exercises.mainMuscleGroup (set when an exercise is created in
 * the Library), NOT from exercise-name matching.
 *
 * The auxiliaryCoreBlock stores direct set allocations, so Core coverage is
 * expressed in raw working sets — not in effective-set points.
 */

import type { DraftExercise, ExerciseDraftByDay } from "./exerciseDraftHelpers";
import type { AuxiliaryCoreBlockType } from "@workspace/api-zod";

/** The canonical DB value for the Core / abdominal muscle group. */
export const CORE_MUSCLE_GROUP = "Brzuch" as const;

/**
 * Returns true when an exercise is a direct Core / abdominal exercise.
 * Uses the DB-level mainMuscleGroup field — never exercise-name matching.
 *
 * Does NOT count incidental trunk stabilization from compound lifts
 * (squats, deadlifts, presses, rows) because those exercises have a
 * different mainMuscleGroup (e.g. "Mięśnie czworogłowe uda", "Plecy").
 */
export function isCoreExercise(ex: DraftExercise): boolean {
  return ex.mainMuscleGroup === CORE_MUSCLE_GROUP;
}

/**
 * Count the actual working sets dedicated to Core work for one workout day.
 * Counts only exercises where mainMuscleGroup === "Brzuch".
 */
export function countCoreActualSetsForDay(exercises: DraftExercise[]): number {
  return exercises
    .filter(isCoreExercise)
    .reduce((sum, ex) => sum + ex.sets, 0);
}

/**
 * Count the total actual Core working sets across the whole week.
 */
export function countCoreWeeklySets(exerciseDraft: ExerciseDraftByDay): number {
  return Object.values(exerciseDraft)
    .flat()
    .filter(isCoreExercise)
    .reduce((sum, ex) => sum + ex.sets, 0);
}

/**
 * Get the planned Core sets for one workout day from the auxiliaryCoreBlock.
 * Returns 0 when no Core allocation is defined for that day.
 */
export function getCorePlanForDay(
  auxiliaryCoreBlock: AuxiliaryCoreBlockType,
  dayIndex: number,
): number {
  return auxiliaryCoreBlock.dayAllocations.find((a) => a.dayIndex === dayIndex)?.sets ?? 0;
}

// ─── Polish pluralization for sets ────────────────────────────────────────────

/**
 * Returns a Polish-correct plural form for a count of series (sets).
 * Examples: 1 → "1 seria", 2–4 → "2 serie", 5+ → "5 serii"
 */
export function pluralizeSets(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 1) return `1 seria`;
  if (abs >= 2 && abs <= 4) return `${n} serie`;
  return `${n} serii`;
}

/**
 * Returns a Polish-correct "Pozostała/Pozostało" phrase for Core sets.
 */
export function formatCoreRemaining(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 1) return `Pozostała: 1 seria`;
  if (abs >= 2 && abs <= 4) return `Pozostało: ${n} serie`;
  return `Pozostało: ${n} serii`;
}

// ─── Phase 4B3: Eligible target needs ────────────────────────────────────────

/** Minimum remaining volume to consider a target still uncovered. */
const ELIGIBILITY_TOLERANCE = 0.01;

/**
 * One uncovered volume target for a workout day.
 * Used by DayRecommendations to request exercises for specific uncovered targets.
 */
export interface EligibleTargetNeed {
  targetId: number;
  targetName: string;
  plannedDaily: number;
  actualDaily: number;
  dailyRemaining: number;
  plannedWeekly: number;
  actualWeekly: number;
  weeklyRemaining: number;
  /** Original index from the day's targetAllocations (stable sort tie-breaker). */
  allocationOrder: number;
}

/**
 * Result of computeEligibleTargetNeeds for one workout day.
 */
export interface DayCoverageNeeds {
  /** Uncovered normal targets, sorted by priority (zero-actual first → remaining% desc → allocationOrder). */
  normalNeeds: EligibleTargetNeed[];
  coreEligible: boolean;
  coreDailyPlanned: number;
  coreDailyActual: number;
  coreDailyRemaining: number;
  coreWeeklyPlanned: number;
  coreWeeklyActual: number;
  /** True when normalNeeds is empty and coreEligible is false. */
  allDaysCovered: boolean;
}

// Structural types for inputs — avoids cross-layer import from hooks.
interface TargetAllocMin {
  targetId: number;
  targetName: string;
  allocatedVolume: number;
}

interface DayForNeeds {
  dayIndex: number;
  targetAllocations: TargetAllocMin[];
}

interface TargetDecisionMin {
  targetId: number;
  weeklySelectedVolume: number;
}

interface CoreDayAllocMin {
  dayIndex: number;
  sets: number;
}

interface CoreBlockMin {
  dayAllocations: CoreDayAllocMin[];
  weeklySelectedSets: number;
}

interface DistributionForNeeds {
  targetDecisions: TargetDecisionMin[];
  auxiliaryCoreBlock: CoreBlockMin;
}

interface DayMuscleMin {
  targetId: number;
  effectiveSets: number;
}

interface DayPreviewMin {
  dayId: number;
  muscles: DayMuscleMin[];
}

interface WeeklyMuscleMin {
  targetId: number;
  effectiveSets: number;
}

interface VolumePreviewMin {
  days: DayPreviewMin[];
  weekly: WeeklyMuscleMin[];
}

/**
 * Compute which volume targets for one workout day still need more volume.
 *
 * A target is eligible (still uncovered) when:
 *   plannedDaily > 0 AND dailyRemaining > ELIGIBILITY_TOLERANCE (0.01)
 *                   AND weeklyRemaining > ELIGIBILITY_TOLERANCE (0.01)
 *
 * Normal targets use effective-volume points (from the coverage preview).
 * Core uses direct working sets.
 *
 * Priority order of returned normalNeeds:
 *   1. Zero-actual targets first (actualDaily === 0)
 *   2. Then by remaining% descending (dailyRemaining / plannedDaily)
 *   3. Then by allocationOrder (original index, stable tie-breaker)
 *
 * Pure function — no side effects.
 */
export function computeEligibleTargetNeeds(
  day: DayForNeeds,
  distributionResult: DistributionForNeeds,
  previewResult: VolumePreviewMin,
  exerciseDraft: ExerciseDraftByDay,
): DayCoverageNeeds {
  // Synthetic dayId used by the coverage preview hook: dayIndex + 1
  const dayId = day.dayIndex + 1;
  const previewDay = previewResult.days.find((d) => d.dayId === dayId);

  const normalNeeds: EligibleTargetNeed[] = [];

  day.targetAllocations.forEach((alloc, idx) => {
    if (alloc.allocatedVolume <= 0) return;

    const actualDaily =
      previewDay?.muscles.find((m) => m.targetId === alloc.targetId)?.effectiveSets ?? 0;
    const dailyRemaining = alloc.allocatedVolume - actualDaily;
    if (dailyRemaining <= ELIGIBILITY_TOLERANCE) return; // daily covered

    const plannedWeekly =
      distributionResult.targetDecisions.find((d) => d.targetId === alloc.targetId)
        ?.weeklySelectedVolume ?? 0;
    const actualWeekly =
      previewResult.weekly.find((w) => w.targetId === alloc.targetId)?.effectiveSets ?? 0;
    const weeklyRemaining = plannedWeekly - actualWeekly;
    if (weeklyRemaining <= ELIGIBILITY_TOLERANCE) return; // weekly already covered

    normalNeeds.push({
      targetId: alloc.targetId,
      targetName: alloc.targetName,
      plannedDaily: alloc.allocatedVolume,
      actualDaily,
      dailyRemaining,
      plannedWeekly,
      actualWeekly,
      weeklyRemaining,
      allocationOrder: idx,
    });
  });

  // Sort: zero-actual first → highest remaining% → stable allocationOrder
  normalNeeds.sort((a, b) => {
    const aZero = a.actualDaily === 0;
    const bZero = b.actualDaily === 0;
    if (aZero !== bZero) return aZero ? -1 : 1;
    const aRemPct = a.plannedDaily > 0 ? a.dailyRemaining / a.plannedDaily : 0;
    const bRemPct = b.plannedDaily > 0 ? b.dailyRemaining / b.plannedDaily : 0;
    const diff = bRemPct - aRemPct;
    if (Math.abs(diff) > 1e-9) return diff;
    return a.allocationOrder - b.allocationOrder;
  });

  // Core: compare planned sets vs actual direct Core sets
  const coreDailyPlanned =
    distributionResult.auxiliaryCoreBlock.dayAllocations.find(
      (a) => a.dayIndex === day.dayIndex,
    )?.sets ?? 0;
  const coreDailyActual = countCoreActualSetsForDay(exerciseDraft[day.dayIndex] ?? []);
  const coreDailyRemaining = coreDailyPlanned - coreDailyActual;

  const coreWeeklyPlanned = distributionResult.auxiliaryCoreBlock.weeklySelectedSets;
  const coreWeeklyActual = countCoreWeeklySets(exerciseDraft);
  const coreWeeklyRemaining = coreWeeklyPlanned - coreWeeklyActual;

  const coreEligible =
    coreDailyPlanned > 0 &&
    coreDailyRemaining > 0 &&
    coreWeeklyRemaining > 0;

  return {
    normalNeeds,
    coreEligible,
    coreDailyPlanned,
    coreDailyActual,
    coreDailyRemaining,
    coreWeeklyPlanned,
    coreWeeklyActual,
    allDaysCovered: normalNeeds.length === 0 && !coreEligible,
  };
}
