/**
 * Exercise draft state helpers for Phase 4A (Ćwiczenia step).
 *
 * All functions are pure — no side effects, no database calls.
 * The draft lives in wizard state only; nothing is persisted until Phase 5.
 */

// ─── Validation codes ─────────────────────────────────────────────────────────

export const EXERCISE_STEP_INCOMPLETE = "EXERCISE_STEP_INCOMPLETE" as const;
export const EXERCISE_DAY_EMPTY = "EXERCISE_DAY_EMPTY" as const;
export const EXERCISE_SELECTION_VALID = "EXERCISE_SELECTION_VALID" as const;

export type ExerciseStepValidationCode =
  | typeof EXERCISE_STEP_INCOMPLETE
  | typeof EXERCISE_DAY_EMPTY
  | typeof EXERCISE_SELECTION_VALID;

// ─── Draft types ──────────────────────────────────────────────────────────────

// ─── Manual override types ─────────────────────────────────────────────────────

/**
 * Fields that a trainer can manually override on an exercise in the draft.
 * Used as keys in `DraftExercise.manualOverrides`.
 */
export type ManualOverrideField = "tempo" | "rir" | "weight" | "exercise";

// ─── Exercise class (from generator) ─────────────────────────────────────────

/**
 * The exercise class assigned by the server-side generator.
 * Drives prescription (sets/reps/rest) and session ordering on the backend,
 * and is used here for visual tier display in the plan preview.
 */
export type ExerciseClass =
  | "plyometric_power"
  | "main_compound"
  | "secondary_compound"
  | "isolation"
  | "core"
  | "regression_beginner";

// ─── Generator explanation (from generate-day API) ───────────────────────────

/**
 * Explanation block returned by the generate-day API.
 * Stored in wizard state so Step 5 can render coach-facing insights.
 */
export interface GeneratedDayExplanation {
  rationale: string[];
  preferredExercises: Array<{
    keyword: string;
    status: "used" | "not_used";
    note: string;
  }>;
  excludedExercises: Array<{
    name: string;
    scope: "exact" | "family";
    label?: string;
    reason: string;
  }>;
  notes: string[];
}

/** A single exercise assigned to a workout day in the local generator draft. */
export interface DraftExercise {
  /** Client-side stable ID — NOT a database ID. Unique within the session. */
  localId: string;
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  equipment: string[];
  /**
   * When true this is a Core/brzuch auxiliary exercise.
   * Core exercises are always placed at the bottom of their day.
   */
  isCore: boolean;
  /**
   * Exercise class assigned by the generator (plyometric_power, main_compound,
   * secondary_compound, isolation, core, regression_beginner).
   * Optional — absent when the exercise was added manually by the trainer.
   */
  exerciseClass?: ExerciseClass;
  /** Display order within the day (0-based). Assigned automatically. */
  order: number;
  /** Working sets. Integer 1–6. */
  sets: number;
  /** Minimum repetition count. Whole integer. */
  repsMin: number;
  /** Maximum repetition count. Whole integer. Must be ≥ repsMin. */
  repsMax: number;
  /** Reps In Reserve. Whole integer 0–5. */
  rir: number;
  /** Rest between sets in seconds. Whole integer. */
  restSeconds: number;
  /**
   * Lifting tempo string (e.g. "3-0-1-0": eccentric-pause-concentric-pause).
   * undefined = no tempo prescribed.
   */
  tempo?: string;
  /**
   * Target load in kilograms. undefined = no load prescribed.
   */
  weight?: number;
  /**
   * Sparse map of fields that were explicitly set by the trainer.
   * Only present keys count as overridden; absent key means auto/default.
   */
  manualOverrides?: Partial<Record<ManualOverrideField, true>>;
  /**
   * Set when this exercise was selected specifically because of a trainer-confirmed
   * restriction (action = "regression"). Surfaced as a badge in Step 4 and Step 5.
   * Value is the human-readable Polish label from the scoring engine, e.g.
   * "Wariant regresyjny — dobrany ze względu na zgłoszone ograniczenie."
   */
  restrictionLabel?: string;
}

/** Exercises keyed by day index (from distributionResult.days[i].dayIndex). */
export type ExerciseDraftByDay = Record<number, DraftExercise[]>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DRAFT_EXERCISE_DEFAULTS = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  rir: 2,
  restSeconds: 90,
} as const;

/**
 * Target RIR by effective level (phase 1, block 7): "Brak aktywności fizycznej" 3–4, "Początkujący" 2–3, others as before (2).
 * The default is the bottom of the range; the trainer can still change it by hand (a manual override).
 */
export const RIR_BY_LEVEL: Record<string, { min: number; max: number; default: number }> = {
  "Brak aktywności fizycznej": { min: 3, max: 4, default: 3 },
  "Początkujący": { min: 2, max: 3, default: 2 },
};

export function defaultRirForLevel(level: string | null | undefined): number {
  return (level && RIR_BY_LEVEL[level]?.default) ?? DRAFT_EXERCISE_DEFAULTS.rir;
}

/** Soft check (not a blocker): returns a hint when the RIR is outside the level's recommended range. */
export function rirLevelHint(rir: number, level: string | null | undefined): string | null {
  const r = level ? RIR_BY_LEVEL[level] : undefined;
  if (!r || (rir >= r.min && rir <= r.max)) return null;
  return `Zalecany RIR dla poziomu „${level}”: ${r.min}–${r.max}.`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ExerciseStepValidationResult {
  code: ExerciseStepValidationCode;
  /**
   * The first dayIndex with no exercises assigned when code is EXERCISE_DAY_EMPTY.
   */
  emptyDayIndex?: number;
}

/**
 * Determine the validation state of the exercise step.
 *
 * EXERCISE_SELECTION_VALID — every day has at least one exercise.
 * EXERCISE_DAY_EMPTY       — at least one day has no exercises (trainer started but left some empty).
 * EXERCISE_STEP_INCOMPLETE — the draft is completely empty (no day has been touched).
 */
export function getExerciseStepValidation(
  days: Array<{ dayIndex: number }>,
  draft: ExerciseDraftByDay,
): ExerciseStepValidationResult {
  if (Object.keys(draft).length === 0) {
    return { code: EXERCISE_STEP_INCOMPLETE };
  }

  for (const day of days) {
    const exercises = draft[day.dayIndex] ?? [];
    if (exercises.length === 0) {
      return { code: EXERCISE_DAY_EMPTY, emptyDayIndex: day.dayIndex };
    }
  }

  return { code: EXERCISE_SELECTION_VALID };
}

// ─── Sets / repetitions validation ───────────────────────────────────────────

/** Returns an error string or null when the value is a valid set count. */
export function validateSets(value: number): string | null {
  if (!Number.isInteger(value)) return "Liczba serii musi być liczbą całkowitą.";
  if (value < 1) return "Minimum 1 seria.";
  if (value > 6) return "Maksimum 6 serii.";
  return null;
}

/** Returns an error string or null for a repsMin/repsMax pair. */
export function validateReps(repsMin: number, repsMax: number): string | null {
  if (!Number.isInteger(repsMin) || !Number.isInteger(repsMax))
    return "Liczba powtórzeń musi być liczbą całkowitą.";
  if (repsMin < 1) return "Minimum 1 powtórzenie.";
  if (repsMin > repsMax) return "Minimalna liczba powtórzeń nie może przekraczać maksymalnej.";
  return null;
}

/** Returns an error string or null for a RIR value. */
export function validateRir(value: number): string | null {
  if (!Number.isInteger(value)) return "RIR musi być liczbą całkowitą.";
  if (value < 0) return "RIR nie może być ujemny.";
  if (value > 5) return "Maksymalny RIR wynosi 5.";
  return null;
}

// ─── Draft mutations (pure) ───────────────────────────────────────────────────

/** Generate a stable client-side localId. */
function makeLocalId(exerciseId: number): string {
  return `draft-${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add an exercise to a day.
 * Normal exercises are inserted before existing Core exercises.
 * Core exercises are appended after all normal exercises.
 * Returns a new draft object (immutable).
 */
export function addExerciseToDay(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  exercise: Omit<DraftExercise, "localId" | "order">,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const coreCount = existing.filter((e) => e.isCore).length;

  // Normal → before core block; Core → after normal block
  const insertIndex = exercise.isCore ? existing.length : existing.length - coreCount;

  const newExercise: DraftExercise = {
    ...exercise,
    localId: makeLocalId(exercise.exerciseId),
    order: insertIndex,
  };

  const updated = [...existing];
  updated.splice(insertIndex, 0, newExercise);
  const reordered = updated.map((e, i) => ({ ...e, order: i }));

  return { ...draft, [dayIndex]: reordered };
}

/**
 * Remove an exercise from a day by localId.
 * Returns a new draft object (immutable).
 */
export function removeExerciseFromDay(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const filtered = existing.filter((e) => e.localId !== localId);
  const reordered = filtered.map((e, i) => ({ ...e, order: i }));
  return { ...draft, [dayIndex]: reordered };
}

/**
 * Update a single field on an existing draft exercise.
 * Returns a new draft object (immutable).
 */
export function updateDraftExerciseField<K extends keyof DraftExercise>(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
  field: K,
  value: DraftExercise[K],
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const updated = existing.map((e) =>
    e.localId === localId ? { ...e, [field]: value } : e,
  );
  return { ...draft, [dayIndex]: updated };
}

// ─── Manual parameter update functions ───────────────────────────────────────

/**
 * Exercise identity data required when replacing an exercise.
 * Prescription fields (sets, reps, rir, rest, tempo, weight) are NOT included —
 * they are always preserved from the original entry.
 */
export interface ReplaceExerciseData {
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  equipment: string[];
  isCore: boolean;
}

/**
 * Set or clear the tempo on one exercise and mark it as manually overridden.
 * All other fields and all other exercises are preserved unchanged.
 * Returns a new draft (immutable).
 */
export function updateExerciseTempo(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
  tempo: string | undefined,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const updated = existing.map((e) =>
    e.localId !== localId
      ? e
      : { ...e, tempo, manualOverrides: { ...e.manualOverrides, tempo: true as const } },
  );
  return { ...draft, [dayIndex]: updated };
}

/**
 * Update the RIR on one exercise and mark it as manually overridden.
 * All other fields and all other exercises are preserved unchanged.
 * Returns a new draft (immutable).
 */
export function updateExerciseRir(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
  rir: number,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const updated = existing.map((e) =>
    e.localId !== localId
      ? e
      : { ...e, rir, manualOverrides: { ...e.manualOverrides, rir: true as const } },
  );
  return { ...draft, [dayIndex]: updated };
}

/**
 * Set or clear the target load on one exercise and mark it as manually overridden.
 * All other fields and all other exercises are preserved unchanged.
 * Returns a new draft (immutable).
 */
export function updateExerciseWeight(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
  weight: number | undefined,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const updated = existing.map((e) =>
    e.localId !== localId
      ? e
      : { ...e, weight, manualOverrides: { ...e.manualOverrides, weight: true as const } },
  );
  return { ...draft, [dayIndex]: updated };
}

/**
 * Replace the exercise identity (id, name, muscle group, equipment, isCore) while
 * preserving all prescription parameters (sets, repsMin, repsMax, rir, restSeconds,
 * tempo, weight) from the original entry.
 *
 * Marks the entry as manually replaced via `manualOverrides.exercise`.
 * The localId and order are unchanged.
 * Returns a new draft (immutable).
 */
export function replaceExercise(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  localId: string,
  newExercise: ReplaceExerciseData,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  const updated = existing.map((e) => {
    if (e.localId !== localId) return e;
    return {
      ...e,
      exerciseId: newExercise.exerciseId,
      exerciseName: newExercise.exerciseName,
      mainMuscleGroup: newExercise.mainMuscleGroup,
      equipment: newExercise.equipment,
      isCore: newExercise.isCore,
      manualOverrides: { ...e.manualOverrides, exercise: true as const },
    };
  });
  return { ...draft, [dayIndex]: updated };
}

// ─── Prescription validation ──────────────────────────────────────────────────

/**
 * A single structural problem found in one exercise prescription.
 * Volume coverage issues are NOT prescription issues — they are advisory only
 * and must never block Step 5.
 */
export interface PrescriptionIssue {
  dayIndex: number;
  localId: string;
  exerciseName: string;
  field: "exerciseId" | "sets" | "reps" | "rir" | "rest";
  message: string;
}

/**
 * Validates every exercise prescription in the draft for structural correctness.
 *
 * Returns one PrescriptionIssue per invalid field per exercise.
 * An empty array means every prescription is structurally valid.
 *
 * Volume coverage is NOT validated here — uncovered or over-covered targets
 * are advisory-only and must never block Step 5 (the plan preview).
 */
export function validatePrescription(draft: ExerciseDraftByDay): PrescriptionIssue[] {
  const issues: PrescriptionIssue[] = [];

  for (const [dayIndexStr, exercises] of Object.entries(draft)) {
    const dayIndex = Number(dayIndexStr);
    for (const ex of exercises) {
      if (!ex.exerciseId || ex.exerciseId <= 0) {
        issues.push({
          dayIndex,
          localId: ex.localId,
          exerciseName: ex.exerciseName,
          field: "exerciseId",
          message: "Brak identyfikatora ćwiczenia.",
        });
      }
      const setsError = validateSets(ex.sets);
      if (setsError) {
        issues.push({ dayIndex, localId: ex.localId, exerciseName: ex.exerciseName, field: "sets", message: setsError });
      }
      const repsError = validateReps(ex.repsMin, ex.repsMax);
      if (repsError) {
        issues.push({ dayIndex, localId: ex.localId, exerciseName: ex.exerciseName, field: "reps", message: repsError });
      }
      const rirError = validateRir(ex.rir);
      if (rirError) {
        issues.push({ dayIndex, localId: ex.localId, exerciseName: ex.exerciseName, field: "rir", message: rirError });
      }
      if (!Number.isInteger(ex.restSeconds) || ex.restSeconds < 1) {
        issues.push({
          dayIndex,
          localId: ex.localId,
          exerciseName: ex.exerciseName,
          field: "rest",
          message: "Czas przerwy musi być dodatnią liczbą całkowitą.",
        });
      }
    }
  }

  return issues;
}

/**
 * Reorder exercises within a single day by moving the item at `oldIndex`
 * to `newIndex`.
 * Does not allow dragging between days.
 * Returns a new draft object (immutable).
 */
export function reorderExercisesInDay(
  draft: ExerciseDraftByDay,
  dayIndex: number,
  oldIndex: number,
  newIndex: number,
): ExerciseDraftByDay {
  const existing = draft[dayIndex] ?? [];
  if (
    oldIndex === newIndex ||
    oldIndex < 0 || newIndex < 0 ||
    oldIndex >= existing.length || newIndex >= existing.length
  ) {
    return draft;
  }

  const reordered = [...existing];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  const withOrder = reordered.map((e, i) => ({ ...e, order: i }));

  return { ...draft, [dayIndex]: withOrder };
}
