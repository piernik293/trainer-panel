/**
 * Shared volume calculation service.
 *
 * Single source of truth for:
 * - live editor calculations
 * - weekly volume summary
 * - activation validation
 *
 * Algorithm for each (plan exercise, volume target) pair:
 *   contribution = workingSets × max(coefficient of target members assigned to exercise)
 *
 * This max-coefficient rule prevents one physical set from being counted
 * multiple times for group targets (e.g. Mięśnie naramienne with 3 deltoid heads).
 * For single-member targets it is equivalent to a direct coefficient multiply.
 */

import { eq, inArray, and } from "drizzle-orm";
import {
  db,
  volumeTargetsTable,
  volumeTargetMembersTable,
  volumeGuidelinesTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  exercisesTable,
  exerciseMuscleAssignmentsTable,
} from "@workspace/db";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VolumeBreakdownItem {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  planExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficientUsed: number;
  effectiveSets: number;
}

export interface PerDaySummary {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  effectiveSets: number;
}

export type VolumeStatus =
  | "below_preferred"
  | "within_preferred"
  | "above_preferred"
  | "above_absolute";

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  below_preferred: "Poniżej preferowanego poziomu",
  within_preferred: "W preferowanym zakresie",
  above_preferred: "Powyżej preferowanego limitu",
  above_absolute: "Przekroczony limit absolutny",
};

export interface VolumeTargetResult {
  targetId: number;
  targetName: string;
  targetType: string;
  weeklyEffectiveSets: number;
  sessionMin: number;
  sessionMax: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  status: VolumeStatus;
  breakdown: VolumeBreakdownItem[];
  perDay: PerDaySummary[];
  sessionWarnings: string[];
}

export interface VolumeResult {
  targets: VolumeTargetResult[];
  /** Exercises present in the plan that have zero muscle assignments. */
  exercisesWithoutAssignments: { planExerciseId: number; exerciseName: string }[];
}

// ─── Experience level → guideline level mapping ───────────────────────────────

/**
 * Maps the raw survey experience level to the guideline profile key stored
 * in volume_guidelines.experienceLevel.
 *
 * Each level has its own dedicated row set in the guidelines table.
 * "Brak aktywności fizycznej" uses its own reduced ceilings (~50% of Beginner).
 * Unknown values fall back to "Początkujący" as a safe default.
 */
export function mapToGuidelineLevel(experienceLevelUsed: string): string {
  switch (experienceLevelUsed) {
    case "Zaawansowany":
      return "Zaawansowany";
    case "Średniozaawansowany":
      return "Średniozaawansowany";
    case "Początkujący":
      return "Początkujący";
    case "Brak aktywności fizycznej":
      return "Brak aktywności fizycznej";
    default:
      return "Początkujący";
  }
}

// ─── Approved target order (for consistent display) ──────────────────────────

const TARGET_ORDER: string[] = [
  "Mięsień czworogłowy uda",
  "Mięśnie pośladkowe",
  "Mięsień trójgłowy łydki",
  "Przywodziciele",
  "Grupa kulszowo-goleniowa",
  "Mięśnie naramienne",
  "Mięsień trójgłowy ramienia",
  "Mięsień piersiowy większy",
  "Mięsień najszerszy grzbietu",
  "Mięsień czworoboczny grzbietu",
  "Mięsień dwugłowy ramienia",
];

// ─── Main calculation function ────────────────────────────────────────────────

export async function calculatePlanVolume(
  planId: number,
  guidelineVersionId: number,
  experienceLevelUsed: string,
): Promise<VolumeResult> {
  const guidelineLevel = mapToGuidelineLevel(experienceLevelUsed);

  // 1. Load all active volume targets with their member specific_muscle IDs.
  const targetRows = await db
    .select({
      targetId: volumeTargetsTable.id,
      targetName: volumeTargetsTable.name,
      targetType: volumeTargetsTable.targetType,
      specificMuscleId: volumeTargetMembersTable.specificMuscleId,
    })
    .from(volumeTargetsTable)
    .leftJoin(
      volumeTargetMembersTable,
      eq(volumeTargetMembersTable.volumeTargetId, volumeTargetsTable.id),
    )
    .where(eq(volumeTargetsTable.isActive, true));

  // Group by target, collecting member muscle IDs.
  const targetMap = new Map<
    number,
    { name: string; type: string; memberMuscleIds: Set<number> }
  >();
  for (const row of targetRows) {
    if (!targetMap.has(row.targetId)) {
      targetMap.set(row.targetId, {
        name: row.targetName,
        type: row.targetType,
        memberMuscleIds: new Set(),
      });
    }
    if (row.specificMuscleId !== null) {
      targetMap.get(row.targetId)!.memberMuscleIds.add(row.specificMuscleId);
    }
  }

  // 2. Load guidelines for this version + mapped experience level.
  const guidelineRows = await db
    .select({
      volumeTargetId: volumeGuidelinesTable.volumeTargetId,
      sessionMin: volumeGuidelinesTable.sessionMin,
      sessionMax: volumeGuidelinesTable.sessionMax,
      weeklyPreferredCeiling: volumeGuidelinesTable.weeklyPreferredCeiling,
      weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling,
    })
    .from(volumeGuidelinesTable)
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, guidelineVersionId),
        eq(volumeGuidelinesTable.experienceLevel, guidelineLevel),
      ),
    );

  const guidelineMap = new Map<
    number,
    {
      sessionMin: number;
      sessionMax: number;
      weeklyPreferredCeiling: number;
      weeklyAbsoluteCeiling: number;
    }
  >();
  for (const g of guidelineRows) {
    guidelineMap.set(g.volumeTargetId, {
      sessionMin: Number(g.sessionMin),
      sessionMax: Number(g.sessionMax),
      weeklyPreferredCeiling: Number(g.weeklyPreferredCeiling),
      weeklyAbsoluteCeiling: Number(g.weeklyAbsoluteCeiling),
    });
  }

  // 3. Load all plan exercises with day info and exercise names.
  const planExerciseRows = await db
    .select({
      id: workoutPlanExercisesTable.id,
      dayId: workoutPlanExercisesTable.dayId,
      exerciseId: workoutPlanExercisesTable.exerciseId,
      workingSets: workoutPlanExercisesTable.workingSets,
      orderInDay: workoutPlanExercisesTable.orderInDay,
      dayName: workoutPlanDaysTable.dayName,
      dayOrder: workoutPlanDaysTable.dayOrder,
      exerciseName: exercisesTable.name,
    })
    .from(workoutPlanExercisesTable)
    .innerJoin(
      workoutPlanDaysTable,
      eq(workoutPlanExercisesTable.dayId, workoutPlanDaysTable.id),
    )
    .innerJoin(
      exercisesTable,
      eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id),
    )
    .where(eq(workoutPlanDaysTable.planId, planId));

  // 4. Load muscle assignments for all unique exercises in the plan.
  const uniqueExerciseIds = [...new Set(planExerciseRows.map((pe) => pe.exerciseId))];

  const assignmentRows =
    uniqueExerciseIds.length > 0
      ? await db
          .select({
            exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
            specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId,
            coefficient: exerciseMuscleAssignmentsTable.coefficient,
          })
          .from(exerciseMuscleAssignmentsTable)
          .where(inArray(exerciseMuscleAssignmentsTable.exerciseId, uniqueExerciseIds))
      : [];

  // Build exerciseId → Map<specificMuscleId, coefficient>.
  const exerciseAssignments = new Map<number, Map<number, number>>();
  for (const asgn of assignmentRows) {
    if (!exerciseAssignments.has(asgn.exerciseId)) {
      exerciseAssignments.set(asgn.exerciseId, new Map());
    }
    exerciseAssignments.get(asgn.exerciseId)!.set(asgn.specificMuscleId, asgn.coefficient);
  }

  // 5. For each target, compute weekly volume with max-coefficient rule.
  const targetResults: VolumeTargetResult[] = [];

  for (const [targetId, { name, type, memberMuscleIds }] of targetMap) {
    const guideline = guidelineMap.get(targetId);
    if (!guideline) continue; // target has no guideline for this level — skip

    const breakdown: VolumeBreakdownItem[] = [];

    for (const pe of planExerciseRows) {
      const muscleMap = exerciseAssignments.get(pe.exerciseId) ?? new Map<number, number>();

      // Find max coefficient among this target's member muscles on this exercise.
      let maxCoeff = 0;
      for (const muscleId of memberMuscleIds) {
        const coeff = muscleMap.get(muscleId);
        if (coeff !== undefined && coeff > maxCoeff) {
          maxCoeff = coeff;
        }
      }

      if (maxCoeff > 0) {
        breakdown.push({
          dayId: pe.dayId,
          dayName: pe.dayName ?? null,
          dayOrder: pe.dayOrder,
          planExerciseId: pe.id,
          exerciseId: pe.exerciseId,
          exerciseName: pe.exerciseName,
          workingSets: pe.workingSets,
          coefficientUsed: maxCoeff,
          effectiveSets: pe.workingSets * maxCoeff,
        });
      }
    }

    const weeklyEffectiveSets = breakdown.reduce((sum, b) => sum + b.effectiveSets, 0);

    // Per-day aggregation.
    const perDayMap = new Map<number, { dayName: string | null; dayOrder: number; sum: number }>();
    for (const b of breakdown) {
      if (!perDayMap.has(b.dayId)) {
        perDayMap.set(b.dayId, { dayName: b.dayName, dayOrder: b.dayOrder, sum: 0 });
      }
      perDayMap.get(b.dayId)!.sum += b.effectiveSets;
    }

    const perDay: PerDaySummary[] = [...perDayMap.entries()]
      .sort((a, b) => a[1].dayOrder - b[1].dayOrder)
      .map(([dayId, { dayName, dayOrder, sum }]) => ({
        dayId,
        dayName,
        dayOrder,
        effectiveSets: sum,
      }));

    // Per-session warnings (only when daily effective sets > 0).
    const sessionWarnings: string[] = [];
    for (const d of perDay) {
      if (d.effectiveSets > 0) {
        if (d.effectiveSets < guideline.sessionMin) {
          sessionWarnings.push(
            `${d.dayName ?? `Dzień ${d.dayOrder}`}: Objętość na tej jednostce jest niższa niż wartość orientacyjna.`,
          );
        } else if (d.effectiveSets > guideline.sessionMax) {
          sessionWarnings.push(
            `${d.dayName ?? `Dzień ${d.dayOrder}`}: Objętość na tej jednostce przekracza wartość orientacyjną.`,
          );
        }
      }
    }

    // Weekly status.
    const preferred = guideline.weeklyPreferredCeiling;
    const absolute = guideline.weeklyAbsoluteCeiling;
    let status: VolumeStatus;
    if (weeklyEffectiveSets > absolute) {
      status = "above_absolute";
    } else if (weeklyEffectiveSets > preferred) {
      status = "above_preferred";
    } else if (weeklyEffectiveSets > 0) {
      status = "within_preferred";
    } else {
      status = "below_preferred";
    }

    targetResults.push({
      targetId,
      targetName: name,
      targetType: type,
      weeklyEffectiveSets,
      sessionMin: guideline.sessionMin,
      sessionMax: guideline.sessionMax,
      weeklyPreferredCeiling: preferred,
      weeklyAbsoluteCeiling: absolute,
      status,
      breakdown,
      perDay,
      sessionWarnings,
    });
  }

  // Sort by the canonical approved-target order.
  targetResults.sort((a, b) => {
    const ia = TARGET_ORDER.indexOf(a.targetName);
    const ib = TARGET_ORDER.indexOf(b.targetName);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // 6. Identify exercises without any muscle assignments.
  const exercisesWithoutAssignments = planExerciseRows
    .filter((pe) => {
      const map = exerciseAssignments.get(pe.exerciseId);
      return !map || map.size === 0;
    })
    .map((pe) => ({ planExerciseId: pe.id, exerciseName: pe.exerciseName }));

  return { targets: targetResults, exercisesWithoutAssignments };
}
