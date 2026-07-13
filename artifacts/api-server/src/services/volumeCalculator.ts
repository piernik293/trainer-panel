/**
 * Shared volume calculation service.
 *
 * Single source of truth for:
 * - live editor calculations (calculateVolumePreview)
 * - weekly volume summary / activation validation (calculatePlanVolume)
 *
 * Algorithm for each (plan exercise, volume target) pair:
 *   contribution = workingSets × max(coefficient of target members assigned to exercise)
 *
 * This max-coefficient rule prevents one physical set from being counted
 * multiple times for group targets (e.g. Mięśnie naramienne with 3 deltoid heads).
 * For single-member targets it is equivalent to a direct coefficient multiply.
 *
 * Both public functions normalise their DB data into the same shape and call
 * the shared pure core — computeVolumeCore — so the formula is maintained in
 * exactly one place.
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
  /** Exercises present in the plan that are inactive in the library. */
  inactiveExercises: { planExerciseId: number; exerciseName: string }[];
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

/** Returns true when experienceLevelUsed is one of the four canonical values. */
export function isValidExperienceLevel(level: string): boolean {
  return [
    "Zaawansowany",
    "Średniozaawansowany",
    "Początkujący",
    "Brak aktywności fizycznej",
  ].includes(level);
}

// ─── Assignment validation ────────────────────────────────────────────────────

/** Raw row as returned by the exercise_muscle_assignments DB query. */
export interface RawAssignmentRow {
  exerciseId: number;
  specificMuscleId: number;
  coefficient: number;
}

/** Result of validateAssignments: valid map + rows that failed validation. */
export interface ValidatedAssignments {
  /** exerciseId → (specificMuscleId → coefficient) for valid assignments only. */
  assignments: Map<number, Map<number, number>>;
  /** Rows that failed coefficient validation (NOT included in assignments). */
  invalidRows: RawAssignmentRow[];
}

/**
 * Partition raw assignment rows into a valid assignments map and a list of
 * invalid rows.
 *
 * A coefficient is valid iff it is a finite number in the range (0, 1].
 * Invalid coefficients are never silently substituted with 0 or 1 — they are
 * returned as invalidRows so the caller can emit INVALID_MUSCLE_COEFFICIENT
 * warnings.
 *
 * Pure function — no DB access, safe to unit-test in isolation.
 */
export function validateAssignments(rows: RawAssignmentRow[]): ValidatedAssignments {
  const assignments = new Map<number, Map<number, number>>();
  const invalidRows: RawAssignmentRow[] = [];

  for (const row of rows) {
    const coeff = Number(row.coefficient);
    if (!isFinite(coeff) || coeff <= 0 || coeff > 1) {
      invalidRows.push(row);
      continue;
    }
    if (!assignments.has(row.exerciseId)) {
      assignments.set(row.exerciseId, new Map());
    }
    assignments.get(row.exerciseId)!.set(row.specificMuscleId, coeff);
  }

  return { assignments, invalidRows };
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

// ─── Shared-core types ────────────────────────────────────────────────────────

/**
 * Normalised exercise entry used as input to computeVolumeCore.
 * Both calculatePlanVolume and calculateVolumePreview reduce their
 * respective data shapes to this common form before calling the core.
 */
export interface NormalizedEntry {
  /** Unique ID within the calculation batch (plan exercise ID or exerciseEntryId). */
  entryId: number;
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
}

/** One exercise's contribution to one volume target in one session. */
export interface CoreContribution {
  entryId: number;
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

/** Result for one volume target, produced by computeVolumeCore. */
export interface CoreTargetResult {
  targetId: number;
  targetName: string;
  targetType: string;
  weeklyEffectiveSets: number;
  status: VolumeStatus;
  hasGuideline: boolean;
  sessionMin: number;
  sessionMax: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  remainingToPreferred: number;
  remainingToAbsolute: number;
  contributions: CoreContribution[];
}

// ─── Shared pure calculation core ─────────────────────────────────────────────

/**
 * Pure function — no DB access.
 *
 * Given pre-loaded, normalised data, computes the effective-set total and
 * status for every volume target using the max-coefficient algorithm.
 *
 * Called by both calculatePlanVolume and calculateVolumePreview.
 * Any change to the formula here is automatically reflected in both paths.
 */
export function computeVolumeCore(
  entries: NormalizedEntry[],
  exerciseAssignments: Map<number, Map<number, number>>,
  targetMap: Map<number, { name: string; type: string; memberMuscleIds: Set<number> }>,
  guidelineMap: Map<
    number,
    {
      sessionMin: number;
      sessionMax: number;
      weeklyPreferredCeiling: number;
      weeklyAbsoluteCeiling: number;
    }
  >,
  orderedTargetIds: number[],
): CoreTargetResult[] {
  return orderedTargetIds.map((targetId) => {
    const target = targetMap.get(targetId)!;
    const guideline = guidelineMap.get(targetId);
    const contributions: CoreContribution[] = [];

    for (const entry of entries) {
      if (entry.workingSets <= 0) continue;

      const muscleMap = exerciseAssignments.get(entry.exerciseId) ?? new Map<number, number>();

      // Max-coefficient rule: find the highest coefficient among this target's
      // member muscles that are assigned to this exercise.
      let maxCoeff = 0;
      for (const muscleId of target.memberMuscleIds) {
        const coeff = muscleMap.get(muscleId);
        if (coeff !== undefined && coeff > maxCoeff) maxCoeff = coeff;
      }

      if (maxCoeff > 0) {
        contributions.push({
          entryId: entry.entryId,
          dayId: entry.dayId,
          dayName: entry.dayName,
          dayOrder: entry.dayOrder,
          exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName,
          workingSets: entry.workingSets,
          coefficient: maxCoeff,
          effectiveSets: entry.workingSets * maxCoeff,
        });
      }
    }

    const weeklyEffectiveSets = contributions.reduce((s, c) => s + c.effectiveSets, 0);
    const preferred = guideline?.weeklyPreferredCeiling ?? 0;
    const absolute = guideline?.weeklyAbsoluteCeiling ?? 0;

    // Status boundaries follow the same precedence as the legacy code.
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
      targetId,
      targetName: target.name,
      targetType: target.type,
      weeklyEffectiveSets,
      status,
      hasGuideline: !!guideline,
      sessionMin: guideline?.sessionMin ?? 0,
      sessionMax: guideline?.sessionMax ?? 0,
      weeklyPreferredCeiling: preferred,
      weeklyAbsoluteCeiling: absolute,
      remainingToPreferred: Math.max(0, preferred - weeklyEffectiveSets),
      remainingToAbsolute: Math.max(0, absolute - weeklyEffectiveSets),
      contributions,
    };
  });
}

// ─── Shared DB loaders ────────────────────────────────────────────────────────

/** Load all active volume targets with their member muscle IDs. */
async function loadTargetMap(): Promise<
  Map<number, { name: string; type: string; memberMuscleIds: Set<number> }>
> {
  const rows = await db
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

  const map = new Map<number, { name: string; type: string; memberMuscleIds: Set<number> }>();
  for (const row of rows) {
    if (!map.has(row.targetId)) {
      map.set(row.targetId, { name: row.targetName, type: row.targetType, memberMuscleIds: new Set() });
    }
    if (row.specificMuscleId !== null) {
      map.get(row.targetId)!.memberMuscleIds.add(row.specificMuscleId);
    }
  }
  return map;
}

/** Load guidelines for a specific version + mapped experience level. */
async function loadGuidelineMap(
  guidelineVersionId: number,
  guidelineLevel: string,
): Promise<
  Map<
    number,
    { sessionMin: number; sessionMax: number; weeklyPreferredCeiling: number; weeklyAbsoluteCeiling: number }
  >
> {
  const rows = await db
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

  const map = new Map<
    number,
    { sessionMin: number; sessionMax: number; weeklyPreferredCeiling: number; weeklyAbsoluteCeiling: number }
  >();
  for (const g of rows) {
    map.set(g.volumeTargetId, {
      sessionMin: Number(g.sessionMin),
      sessionMax: Number(g.sessionMax),
      weeklyPreferredCeiling: Number(g.weeklyPreferredCeiling),
      weeklyAbsoluteCeiling: Number(g.weeklyAbsoluteCeiling),
    });
  }
  return map;
}

/** Load muscle assignments for a set of exercise IDs. */
async function loadExerciseAssignments(
  exerciseIds: number[],
): Promise<Map<number, Map<number, number>>> {
  if (exerciseIds.length === 0) return new Map();

  const rows = await db
    .select({
      exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
      specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId,
      coefficient: exerciseMuscleAssignmentsTable.coefficient,
    })
    .from(exerciseMuscleAssignmentsTable)
    .where(inArray(exerciseMuscleAssignmentsTable.exerciseId, exerciseIds));

  const map = new Map<number, Map<number, number>>();
  for (const asgn of rows) {
    if (!map.has(asgn.exerciseId)) map.set(asgn.exerciseId, new Map());
    map.get(asgn.exerciseId)!.set(asgn.specificMuscleId, asgn.coefficient);
  }
  return map;
}

/** Return sorted target IDs using the canonical display order. */
function orderedIds(targetMap: Map<number, { name: string }>): number[] {
  return [...targetMap.keys()].sort((a, b) => {
    const ia = TARGET_ORDER.indexOf(targetMap.get(a)!.name);
    const ib = TARGET_ORDER.indexOf(targetMap.get(b)!.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

// ─── calculatePlanVolume ──────────────────────────────────────────────────────

export async function calculatePlanVolume(
  planId: number,
  guidelineVersionId: number,
  experienceLevelUsed: string,
): Promise<VolumeResult> {
  const guidelineLevel = mapToGuidelineLevel(experienceLevelUsed);

  // Load shared lookup structures in parallel.
  const [targetMap, guidelineMap, planExerciseRows] = await Promise.all([
    loadTargetMap(),
    loadGuidelineMap(guidelineVersionId, guidelineLevel),
    db
      .select({
        id: workoutPlanExercisesTable.id,
        dayId: workoutPlanExercisesTable.dayId,
        exerciseId: workoutPlanExercisesTable.exerciseId,
        workingSets: workoutPlanExercisesTable.workingSets,
        orderInDay: workoutPlanExercisesTable.orderInDay,
        dayName: workoutPlanDaysTable.dayName,
        dayOrder: workoutPlanDaysTable.dayOrder,
        exerciseName: exercisesTable.name,
        isActive: exercisesTable.isActive,
      })
      .from(workoutPlanExercisesTable)
      .innerJoin(workoutPlanDaysTable, eq(workoutPlanExercisesTable.dayId, workoutPlanDaysTable.id))
      .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
      .where(eq(workoutPlanDaysTable.planId, planId)),
  ]);

  const uniqueExerciseIds = [...new Set(planExerciseRows.map((pe) => pe.exerciseId))];
  const exerciseAssignments = await loadExerciseAssignments(uniqueExerciseIds);

  // Normalise to NormalizedEntry for the core.
  const entries: NormalizedEntry[] = planExerciseRows.map((pe) => ({
    entryId: pe.id,
    dayId: pe.dayId,
    dayName: pe.dayName ?? null,
    dayOrder: pe.dayOrder,
    exerciseId: pe.exerciseId,
    exerciseName: pe.exerciseName,
    workingSets: pe.workingSets,
  }));

  const coreResults = computeVolumeCore(
    entries,
    exerciseAssignments,
    targetMap,
    guidelineMap,
    orderedIds(targetMap),
  );

  // Map CoreTargetResult → VolumeTargetResult (adds breakdown, perDay, sessionWarnings).
  const targetResults: VolumeTargetResult[] = [];

  for (const core of coreResults) {
    if (!core.hasGuideline) continue; // skip targets without a guideline for this level

    const breakdown: VolumeBreakdownItem[] = core.contributions.map((c) => ({
      dayId: c.dayId,
      dayName: c.dayName,
      dayOrder: c.dayOrder,
      planExerciseId: c.entryId,
      exerciseId: c.exerciseId,
      exerciseName: c.exerciseName,
      workingSets: c.workingSets,
      coefficientUsed: c.coefficient,
      effectiveSets: c.effectiveSets,
    }));

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
        if (d.effectiveSets < core.sessionMin) {
          sessionWarnings.push(
            `${d.dayName ?? `Dzień ${d.dayOrder}`}: Objętość na tej jednostce jest niższa niż wartość orientacyjna.`,
          );
        } else if (d.effectiveSets > core.sessionMax) {
          sessionWarnings.push(
            `${d.dayName ?? `Dzień ${d.dayOrder}`}: Objętość na tej jednostce przekracza wartość orientacyjną.`,
          );
        }
      }
    }

    targetResults.push({
      targetId: core.targetId,
      targetName: core.targetName,
      targetType: core.targetType,
      weeklyEffectiveSets: core.weeklyEffectiveSets,
      sessionMin: core.sessionMin,
      sessionMax: core.sessionMax,
      weeklyPreferredCeiling: core.weeklyPreferredCeiling,
      weeklyAbsoluteCeiling: core.weeklyAbsoluteCeiling,
      status: core.status,
      breakdown,
      perDay,
      sessionWarnings,
    });
  }

  // Exercises with no muscle assignments at all.
  const exercisesWithoutAssignments = planExerciseRows
    .filter((pe) => {
      const map = exerciseAssignments.get(pe.exerciseId);
      return !map || map.size === 0;
    })
    .map((pe) => ({ planExerciseId: pe.id, exerciseName: pe.exerciseName }));

  // Inactive exercises.
  const inactiveExercises = planExerciseRows
    .filter((pe) => !pe.isActive)
    .map((pe) => ({ planExerciseId: pe.id, exerciseName: pe.exerciseName }));

  return { targets: targetResults, exercisesWithoutAssignments, inactiveExercises };
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

// ─── calculateVolumePreview ───────────────────────────────────────────────────

/**
 * Calculate training volume from a draft plan snapshot (no DB writes).
 * Calls the same computeVolumeCore as calculatePlanVolume — the formula
 * is maintained in exactly one place.
 */
export async function calculateVolumePreview(
  input: VolumePreviewInput,
): Promise<VolumePreviewResult> {
  const { clientId, guidelineVersionId, experienceLevelUsed, days } = input;
  const guidelineLevel = mapToGuidelineLevel(experienceLevelUsed);
  const warnings: VolumePreviewWarning[] = [];

  // 0. Input validation — warn about structurally invalid entries.
  //    (The route's Zod schema normally prevents these; these checks guard
  //    against direct function calls with out-of-range data.)
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!ex.exerciseId || ex.exerciseId <= 0) {
        warnings.push({
          code: "EXERCISE_ENTRY_WITHOUT_EXERCISE_ID",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: null,
          message: `Wpis ćwiczenia (entryId=${ex.exerciseEntryId}) nie zawiera prawidłowego ID ćwiczenia i zostanie pominięty.`,
        });
      } else if (!Number.isInteger(ex.workingSets) || ex.workingSets <= 0) {
        warnings.push({
          code: "INVALID_WORKING_SETS",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie ID ${ex.exerciseId} ma nieprawidłową liczbę serii roboczych (${ex.workingSets}) — musi być dodatnią liczbą całkowitą.`,
        });
      }
    }
  }

  // 1. Collect unique exercise IDs across all days.
  const allEntries = days.flatMap((d) => d.exercises);
  const uniqueExerciseIds = [...new Set(allEntries.map((e) => e.exerciseId))];

  // 2. Load exercise records (name + isActive).
  const exerciseRecords =
    uniqueExerciseIds.length > 0
      ? await db
          .select({ id: exercisesTable.id, name: exercisesTable.name, isActive: exercisesTable.isActive })
          .from(exercisesTable)
          .where(inArray(exercisesTable.id, uniqueExerciseIds))
      : [];

  const exerciseNameMap = new Map<number, string>(exerciseRecords.map((e) => [e.id, e.name]));
  const exerciseActiveMap = new Map<number, boolean>(exerciseRecords.map((e) => [e.id, e.isActive]));

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

  // Warn about inactive exercises (FIX 2). Contribution is still counted.
  const warnedInactiveExercises = new Set<number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) continue;
      if (exerciseActiveMap.get(ex.exerciseId) === false && !warnedInactiveExercises.has(ex.exerciseId)) {
        warnedInactiveExercises.add(ex.exerciseId);
        warnings.push({
          code: "INACTIVE_EXERCISE",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie jest nieaktywne w bibliotece, ale pozostaje uwzględnione w objętości istniejącego planu.`,
        });
      }
    }
  }

  // 3. Load muscle assignments with coefficient validation.
  //    Uses validateAssignments (pure) so INVALID_MUSCLE_COEFFICIENT warnings
  //    can be emitted without silently substituting 0 or 1.
  const validExerciseIds = exerciseRecords.map((e) => e.id);
  const rawAssignmentRows: RawAssignmentRow[] =
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

  const { assignments: exerciseAssignments, invalidRows } = validateAssignments(rawAssignmentRows);

  for (const row of invalidRows) {
    warnings.push({
      code: "INVALID_MUSCLE_COEFFICIENT",
      scope: "exercise",
      exerciseId: row.exerciseId,
      message: `Ćwiczenie ID ${row.exerciseId} ma nieprawidłowy współczynnik mięśniowy (${row.coefficient}) dla mięśnia ID ${row.specificMuscleId} — musi być w zakresie (0, 1]. Przypisanie zostanie pominięte.`,
    });
  }

  // 4. Warn about exercises with no muscle assignments at all.
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

  // 5. Load shared lookup structures in parallel.
  const [targetMap, guidelineMap] = await Promise.all([
    loadTargetMap(),
    loadGuidelineMap(guidelineVersionId, guidelineLevel),
  ]);

  const hasGuidelines = guidelineMap.size > 0;

  if (!hasGuidelines) {
    warnings.push({
      code: "MISSING_GUIDELINES",
      scope: "plan",
      message: `Brak wytycznych dla poziomu "${guidelineLevel}" (wersja ${guidelineVersionId}).`,
    });
  }

  // 5b. Warn about exercises whose assignments don't map to any volume target.
  const muscleMemberOfTarget = new Set<number>();
  for (const [, tgt] of targetMap) {
    for (const mId of tgt.memberMuscleIds) muscleMemberOfTarget.add(mId);
  }
  const warnedNoTargetEntries = new Set<number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) continue;
      const map = exerciseAssignments.get(ex.exerciseId);
      if (!map || map.size === 0) continue; // already warned above
      if (warnedNoTargetEntries.has(ex.exerciseEntryId)) continue;
      const contributesToTarget = [...map.keys()].some((mId) => muscleMemberOfTarget.has(mId));
      if (!contributesToTarget) {
        warnedNoTargetEntries.add(ex.exerciseEntryId);
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

  // 5c. MISSING_MUSCLE_TARGET: warn about individual muscle assignments that are
  //     not a member of any active volume target.  Fires for each unique
  //     (exerciseId, specificMuscleId) pair so the trainer knows exactly which
  //     muscles aren't being tracked — even when the exercise still contributes
  //     through other muscles.  Deduped across days.
  const warnedMissingTargetPairs = new Set<string>();
  for (const [exerciseId, muscleMap] of exerciseAssignments) {
    for (const [specificMuscleId] of muscleMap) {
      if (!muscleMemberOfTarget.has(specificMuscleId)) {
        const key = `${exerciseId}:${specificMuscleId}`;
        if (!warnedMissingTargetPairs.has(key)) {
          warnedMissingTargetPairs.add(key);
          warnings.push({
            code: "MISSING_MUSCLE_TARGET",
            scope: "exercise",
            exerciseId,
            message: `Mięsień ID ${specificMuscleId} (w ćwiczeniu "${exerciseNameMap.get(exerciseId) ?? String(exerciseId)}") nie należy do żadnej grupy docelowej objętości i nie wpływa na obliczenia.`,
          });
        }
      }
    }
  }

  // 6. Normalise days to NormalizedEntry[] for the core.
  // Assign a synthetic dayOrder based on array position (preview has no DB dayOrder).
  const entries: NormalizedEntry[] = [];
  days.forEach((day, dayIndex) => {
    for (const ex of day.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) continue;
      entries.push({
        entryId: ex.exerciseEntryId,
        dayId: day.dayId,
        dayName: day.dayName,
        dayOrder: dayIndex,
        exerciseId: ex.exerciseId,
        exerciseName: exerciseNameMap.get(ex.exerciseId)!,
        workingSets: ex.workingSets,
      });
    }
  });

  const ordered = orderedIds(targetMap);
  const coreResults = computeVolumeCore(entries, exerciseAssignments, targetMap, guidelineMap, ordered);

  // 7. Build DayVolumeResult[] by pivoting contributions per core target, per day.
  const dayResults: DayVolumeResult[] = days.map((day, dayIndex) => {
    const dayMuscles: SessionMuscleResult[] = [];

    for (const core of coreResults) {
      const dayContribs = core.contributions.filter((c) => c.dayId === day.dayId);
      const effectiveSets = dayContribs.reduce((s, c) => s + c.effectiveSets, 0);
      if (effectiveSets === 0) continue;

      const guideline = guidelineMap.get(core.targetId);
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
        targetId: core.targetId,
        muscleName: core.targetName,
        effectiveSets,
        sessionMin: core.sessionMin,
        sessionMax: core.sessionMax,
        sessionStatus,
        contributions: dayContribs.map((c) => ({
          exerciseEntryId: c.entryId,
          exerciseId: c.exerciseId,
          exerciseName: c.exerciseName,
          workingSets: c.workingSets,
          coefficient: c.coefficient,
          effectiveSets: c.effectiveSets,
        })),
      });
    }

    return { dayId: day.dayId, dayName: day.dayName, muscles: dayMuscles };
  });

  // 8. Build WeeklyMuscleResult[] from core results.
  const weekly: WeeklyMuscleResult[] = coreResults.map((core) => ({
    targetId: core.targetId,
    muscleName: core.targetName,
    effectiveSets: core.weeklyEffectiveSets,
    weeklyPreferredCeiling: core.weeklyPreferredCeiling,
    weeklyAbsoluteCeiling: core.weeklyAbsoluteCeiling,
    sessionMin: core.sessionMin,
    sessionMax: core.sessionMax,
    remainingToPreferred: core.remainingToPreferred,
    remainingToAbsolute: core.remainingToAbsolute,
    status: core.status,
    hasGuideline: core.hasGuideline,
    contributions: core.contributions.map((c) => ({
      exerciseEntryId: c.entryId,
      exerciseId: c.exerciseId,
      exerciseName: c.exerciseName,
      dayId: c.dayId,
      dayName: c.dayName,
      workingSets: c.workingSets,
      coefficient: c.coefficient,
      effectiveSets: c.effectiveSets,
    })),
  }));

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
