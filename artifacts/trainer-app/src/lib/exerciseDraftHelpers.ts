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
