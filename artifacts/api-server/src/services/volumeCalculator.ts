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

// ─── Live-preview types ────────────────────────────────────────────────────────

export type SessionStatus = "below_min" | "within_range" | "above_max" | "no_guideline";

export interface SessionContribution {
  exerciseEntryId: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

export interface SessionMuscleResult {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  sessionMin: number;
  sessionMax: number;
  sessionStatus: SessionStatus;
  contributions: SessionContribution[];
}

export interface DayVolumeResult {
  dayId: number;
  dayName: string | null;
  muscles: SessionMuscleResult[];
}

export interface WeeklyContribution {
  exerciseEntryId: number;
  exerciseId: number;
  exerciseName: string;
  dayId: number;
  dayName: string | null;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

export interface WeeklyMuscleResult {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  sessionMin: number;
  sessionMax: number;
  remainingToPreferred: number;
  remainingToAbsolute: number;
  status: VolumeStatus;
  hasGuideline: boolean;
  contributions: WeeklyContribution[];
}

export interface VolumePreviewWarning {
  code: string;
  scope: "plan" | "day" | "exercise";
  dayId?: number | null;
  exerciseEntryId?: number | null;
  exerciseId?: number | null;
  message: string;
}

export interface VolumePreviewExercise {
  exerciseEntryId: number;
  exerciseId: number;
  workingSets: number;
}

export interface VolumePreviewDay {
  dayId: number;
  dayName: string | null;
  exercises: VolumePreviewExercise[];
}

export interface VolumePreviewInput {
  clientId: number;
  guidelineVersionId: number;
  experienceLevelUsed: string;
  days: VolumePreviewDay[];
}

export interface VolumePreviewResult {
  clientId: number;
  experienceLevel: string;
  guidelineLevel: string;
  hasGuidelines: boolean;
  days: DayVolumeResult[];
  weekly: WeeklyMuscleResult[];
  warnings: VolumePreviewWarning[];
}

// ─── Live preview calculation ─────────────────────────────────────────────────

/**
 * Calculate training volume from a draft plan snapshot (no DB writes).
 * Uses the same algorithm and data sources as calculatePlanVolume so that
 * the editor and saved-plan views are always consistent.
 */
export async function calculateVolumePreview(
  input: VolumePreviewInput,
): Promise<VolumePreviewResult> {
  const { clientId, guidelineVersionId, experienceLevelUsed, days } = input;
  const guidelineLevel = mapToGuidelineLevel(experienceLevelUsed);
  const warnings: VolumePreviewWarning[] = [];

  // 1. Collect unique exercise IDs across all days.
  const allEntries = days.flatMap((d) => d.exercises);
  const uniqueExerciseIds = [...new Set(allEntries.map((e) => e.exerciseId))];

  // 2. Load exercise records (names + existence check).
  const exerciseRecords =
    uniqueExerciseIds.length > 0
      ? await db
          .select({ id: exercisesTable.id, name: exercisesTable.name })
          .from(exercisesTable)
          .where(inArray(exercisesTable.id, uniqueExerciseIds))
      : [];

  const exerciseNameMap = new Map<number, string>(exerciseRecords.map((e) => [e.id, e.name]));

  // Warn about exercise IDs not found in DB.
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) {
        warnings.push({
          code: "EXERCISE_NOT_FOUND",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie o ID ${ex.exerciseId} nie istnieje w bazie danych i zostało pominięte.`,
        });
      }
    }
  }

  // 3. Load muscle assignments for known exercise IDs.
  const validExerciseIds = exerciseRecords.map((e) => e.id);
  const assignmentRows =
    validExerciseIds.length > 0
      ? await db
          .select({
            exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
            specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId,
            coefficient: exerciseMuscleAssignmentsTable.coefficient,
          })
          .from(exerciseMuscleAssignmentsTable)
          .where(inArray(exerciseMuscleAssignmentsTable.exerciseId, validExerciseIds))
      : [];

  const exerciseAssignments = new Map<number, Map<number, number>>();
  for (const asgn of assignmentRows) {
    if (!exerciseAssignments.has(asgn.exerciseId)) {
      exerciseAssignments.set(asgn.exerciseId, new Map());
    }
    exerciseAssignments.get(asgn.exerciseId)!.set(asgn.specificMuscleId, asgn.coefficient);
  }

  // 4. Load targets BEFORE checking assignment coverage (needed to check target membership).
  // Build preliminary targetMap here (full load happens in step 4 below).
  // We defer this to after step 4; just collect the unique exercise IDs that need a warning.

  // Warn about exercises with no muscle assignments at all.
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) continue;
      const map = exerciseAssignments.get(ex.exerciseId);
      if (!map || map.size === 0) {
        warnings.push({
          code: "EXERCISE_WITHOUT_MUSCLE_ASSIGNMENTS",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie "${exerciseNameMap.get(ex.exerciseId)}" nie ma przypisanych mięśni i nie zostało uwzględnione w objętości.`,
        });
      }
    }
  }

  // 4. Load active targets with member muscle IDs (same query as calculatePlanVolume).
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

  // 5. Load guidelines for this version + mapped experience level.
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

  const hasGuidelines = guidelineRows.length > 0;

  if (!hasGuidelines) {
    warnings.push({
      code: "MISSING_GUIDELINES",
      scope: "plan",
      message: `Brak wytycznych dla poziomu "${guidelineLevel}" (wersja ${guidelineVersionId}).`,
    });
  }

  // 5b. Warn about exercises that have muscle assignments but none map to any volume target.
  // This mirrors calculatePlanVolume's exercisesWithoutAssignments tracking.
  const muscleMemberOfTarget = new Set<number>();
  for (const [, tgt] of targetMap) {
    for (const mId of tgt.memberMuscleIds) muscleMemberOfTarget.add(mId);
  }
  const warnedExerciseEntries = new Set<number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) continue;
      const map = exerciseAssignments.get(ex.exerciseId);
      if (!map || map.size === 0) continue; // already warned above
      if (warnedExerciseEntries.has(ex.exerciseEntryId)) continue;
      const contributesToTarget = [...map.keys()].some((mId) => muscleMemberOfTarget.has(mId));
      if (!contributesToTarget) {
        warnedExerciseEntries.add(ex.exerciseEntryId);
        warnings.push({
          code: "EXERCISE_WITHOUT_MUSCLE_ASSIGNMENTS",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie "${exerciseNameMap.get(ex.exerciseId)}" ma przypisane mięśnie, lecz żadne z nich nie należy do grup docelowych objętości i nie zostało uwzględnione.`,
        });
      }
    }
  }

  // 6. Determine canonical target order.
  const orderedTargetIds: number[] = [...targetMap.keys()].sort((a, b) => {
    const ia = TARGET_ORDER.indexOf(targetMap.get(a)!.name);
    const ib = TARGET_ORDER.indexOf(targetMap.get(b)!.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // Weekly accumulators per target.
  const weeklyAcc = new Map<
    number,
    { contributions: WeeklyContribution[]; weeklyEffectiveSets: number }
  >();
  for (const tid of orderedTargetIds) {
    weeklyAcc.set(tid, { contributions: [], weeklyEffectiveSets: 0 });
  }

  // 7. Per-day calculation using the same max-coefficient algorithm.
  const dayResults: DayVolumeResult[] = days.map((day) => {
    const dayMuscles: SessionMuscleResult[] = [];

    for (const tid of orderedTargetIds) {
      const target = targetMap.get(tid)!;
      const guideline = guidelineMap.get(tid);
      const contributions: SessionContribution[] = [];

      for (const ex of day.exercises) {
        if (!exerciseNameMap.has(ex.exerciseId)) continue;
        if (ex.workingSets <= 0) continue;

        const muscleMap = exerciseAssignments.get(ex.exerciseId) ?? new Map<number, number>();
        let maxCoeff = 0;
        for (const muscleId of target.memberMuscleIds) {
          const coeff = muscleMap.get(muscleId);
          if (coeff !== undefined && coeff > maxCoeff) maxCoeff = coeff;
        }

        if (maxCoeff > 0) {
          const effectiveSets = ex.workingSets * maxCoeff;
          const exerciseName = exerciseNameMap.get(ex.exerciseId)!;
          contributions.push({
            exerciseEntryId: ex.exerciseEntryId,
            exerciseId: ex.exerciseId,
            exerciseName,
            workingSets: ex.workingSets,
            coefficient: maxCoeff,
            effectiveSets,
          });
          const acc = weeklyAcc.get(tid)!;
          acc.weeklyEffectiveSets += effectiveSets;
          acc.contributions.push({
            exerciseEntryId: ex.exerciseEntryId,
            exerciseId: ex.exerciseId,
            exerciseName,
            dayId: day.dayId,
            dayName: day.dayName,
            workingSets: ex.workingSets,
            coefficient: maxCoeff,
            effectiveSets,
          });
        }
      }

      const effectiveSets = contributions.reduce((s, c) => s + c.effectiveSets, 0);

      // Skip muscles with no volume in this session.
      if (effectiveSets === 0) continue;

      let sessionStatus: SessionStatus;
      if (!guideline) {
        sessionStatus = "no_guideline";
      } else if (effectiveSets < guideline.sessionMin) {
        sessionStatus = "below_min";
      } else if (effectiveSets > guideline.sessionMax) {
        sessionStatus = "above_max";
      } else {
        sessionStatus = "within_range";
      }

      dayMuscles.push({
        targetId: tid,
        muscleName: target.name,
        effectiveSets,
        sessionMin: guideline?.sessionMin ?? 0,
        sessionMax: guideline?.sessionMax ?? 0,
        sessionStatus,
        contributions,
      });
    }

    return { dayId: day.dayId, dayName: day.dayName, muscles: dayMuscles };
  });

  // 8. Build weekly results.
  const weekly: WeeklyMuscleResult[] = orderedTargetIds.map((tid) => {
    const target = targetMap.get(tid)!;
    const guideline = guidelineMap.get(tid);
    const acc = weeklyAcc.get(tid)!;
    const { weeklyEffectiveSets, contributions } = acc;
    const preferred = guideline?.weeklyPreferredCeiling ?? 0;
    const absolute = guideline?.weeklyAbsoluteCeiling ?? 0;

    let status: VolumeStatus;
    if (weeklyEffectiveSets > absolute && absolute > 0) {
      status = "above_absolute";
    } else if (weeklyEffectiveSets > preferred && preferred > 0) {
      status = "above_preferred";
    } else if (weeklyEffectiveSets > 0) {
      status = "within_preferred";
    } else {
      status = "below_preferred";
    }

    return {
      targetId: tid,
      muscleName: target.name,
      effectiveSets: weeklyEffectiveSets,
      weeklyPreferredCeiling: preferred,
      weeklyAbsoluteCeiling: absolute,
      sessionMin: guideline?.sessionMin ?? 0,
      sessionMax: guideline?.sessionMax ?? 0,
      remainingToPreferred: Math.max(0, preferred - weeklyEffectiveSets),
      remainingToAbsolute: Math.max(0, absolute - weeklyEffectiveSets),
      status,
      hasGuideline: !!guideline,
      contributions,
    };
  });

  return {
    clientId,
    experienceLevel: experienceLevelUsed,
    guidelineLevel,
    hasGuidelines,
    days: dayResults,
    weekly,
    warnings,
  };
}
