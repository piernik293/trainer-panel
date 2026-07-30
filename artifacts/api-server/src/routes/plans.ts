/**
 * Plan routes — all workout plan CRUD, day/exercise management, volume, activation.
 *
 * Uses inline Zod schemas (no codegen dependency).
 * Returns the full plan object (with days, exercises, and computed volume) after
 * every mutating operation so the frontend always has up-to-date state.
 */

import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { eq, and, inArray, sql, max, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  surveysTable,
  clientsTable,
  exercisesTable,
  volumeGuidelineVersionsTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  volumeGuidelinesTable,
  volumeTargetsTable,
  volumeTargetMembersTable,
} from "@workspace/db";
import {
  calculatePlanVolume,
  calculateVolumePreview,
  mapToGuidelineLevel,
  isValidExperienceLevel,
  type VolumePreviewWarning,
} from "../services/volumeCalculator";
import { analyseDraftPreview, type AnalysisPreviewInput } from "../services/planAnalyzer";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── Ownership helpers ────────────────────────────────────────────────────────

/**
 * Load a plan and verify it belongs to the authenticated trainer.
 * Returns the plan row on success, or null after sending 401/404.
 */
async function loadPlanAndVerifyOwner(
  req: Request,
  res: Response,
  planId: number,
): Promise<{ id: number; clientId: number } | null> {
  const [row] = await db
    .select({ id: workoutPlansTable.id, clientId: workoutPlansTable.clientId })
    .from(workoutPlansTable)
    .innerJoin(clientsTable, eq(clientsTable.id, workoutPlansTable.clientId))
    .where(
      and(
        eq(workoutPlansTable.id, planId),
        eq(clientsTable.trainerId, req.trainer!.id),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return null;
  }
  return row;
}

/**
 * Verify a client belongs to the authenticated trainer.
 * Returns true on success, or false after sending 404.
 */
async function verifyClientOwner(
  req: Request,
  res: Response,
  clientId: number,
): Promise<boolean> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.id, clientId),
        eq(clientsTable.trainerId, req.trainer!.id),
      ),
    );
  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return false;
  }
  return true;
}

// ─── Inline Zod schemas ───────────────────────────────────────────────────────

const CreatePlanBody = z.object({
  title: z.string().min(1, "Tytuł planu jest wymagany"),
  surveyId: z.number().int().positive(),
  goal: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  trainerNotes: z.string().nullable().optional(),
  // Generator fields — set at creation when saving from the wizard
  splitType: z.enum(["full_body","full_body_ab","upper_lower","upper_lower_full_body","push_pull_legs","push_pull_lower_full_body","specialization","custom"]).nullable().optional(),
  blockDurationWeeks: z.number().int().min(4).max(12).nullable().optional(),
});

const UpdatePlanBody = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["draft", "archived"]).optional(),
  goal: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  trainerNotes: z.string().nullable().optional(),
  // Generator fields
  splitType: z.enum(["full_body","full_body_ab","upper_lower","upper_lower_full_body","push_pull_legs","push_pull_lower_full_body","specialization","custom"]).nullable().optional(),
  blockDurationWeeks: z.number().int().min(4).max(12).nullable().optional(),
  cardioRecommendation: z.string().nullable().optional(),
});

const CreatePlanDayBody = z.object({
  dayName: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  trainerNotes: z.string().nullable().optional(),
});

const UpdatePlanDayBody = z.object({
  dayName: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  trainerNotes: z.string().nullable().optional(),
  dayOrder: z.number().int().positive().optional(),
});

const ExercisePrescriptionFields = z.object({
  workingSets: z.number().int().min(1),
  warmUpSets: z.number().int().min(0).optional().default(0),
  // Repetition prescription
  repType: z.enum(["exact", "range", "time", "distance", "open"]).nullable().optional(),
  repsExact: z.number().int().positive().nullable().optional(),
  repRangeMin: z.number().int().positive().nullable().optional(),
  repRangeMax: z.number().int().positive().nullable().optional(),
  repTimeSeconds: z.number().int().positive().nullable().optional(),
  repDistanceMeters: z.number().int().positive().nullable().optional(),
  repOpenInstruction: z.string().nullable().optional(),
  // Load prescription
  loadType: z.string().nullable().optional(),
  loadValue: z.string().nullable().optional(),
  loadInstruction: z.string().nullable().optional(),
  // Intensity
  rir: z.number().int().min(0).max(5).nullable().optional(),
  rpe: z.string().nullable().optional(),
  rirOrRpe: z.string().nullable().optional(),
  // Technique
  tempo: z.string().nullable().optional(),
  restSeconds: z.number().int().positive().nullable().optional(),
  // Notes
  notes: z.string().nullable().optional(),
  clientInstructions: z.string().nullable().optional(),
});

const CreatePlanExerciseBody = ExercisePrescriptionFields.extend({
  exerciseId: z.number().int().positive(),
});

const UpdatePlanExerciseBody = ExercisePrescriptionFields.partial().extend({
  orderInDay: z.number().int().min(1).optional(),
  /** Move exercise to a different day */
  dayId: z.number().int().positive().optional(),
});

const ReorderDaysBody = z.object({
  order: z.array(z.object({ id: z.number().int(), dayOrder: z.number().int().min(1) })),
});

const ReorderExercisesBody = z.object({
  order: z.array(z.object({ id: z.number().int(), orderInDay: z.number().int().min(1) })),
});

const VolumePreviewExerciseSchema = z.object({
  exerciseEntryId: z.number().int(),
  exerciseId: z.number().int().positive(),
  workingSets: z.number().int().min(1),
});

const VolumePreviewDaySchema = z.object({
  dayId: z.number().int(),
  dayName: z.string().nullable().optional(),
  exercises: z.array(VolumePreviewExerciseSchema),
});

const VolumePreviewBody = z.object({
  clientId: z.number().int().positive(),
  /** Optional — when provided the plan's stored values are the authoritative source. */
  planId: z.number().int().positive().optional(),
  /** Supplied by the frontend for validation; backend re-derives the authoritative value. */
  guidelineVersionId: z.number().int().positive().optional(),
  experienceLevelUsed: z.string().optional(),
  days: z.array(VolumePreviewDaySchema),
});

// ─── Helper: build the full plan response ────────────────────────────────────

/**
 * Derive the ExerciseClass for a saved plan exercise using its catalogue metadata.
 * Mirrors the server-side logic in recommendation-engine.ts — exerciseClass is
 * never stored on the plan itself; it is always resolved from the exercise catalogue.
 */
function resolveExerciseClass(
  exerciseType: string | null,
  exercisePriority: string | null,
  mainMuscleGroup: string | null,
  suitableForNoActivity: boolean | null,
): string {
  if (suitableForNoActivity === true) return "regression_beginner";
  const mg = (mainMuscleGroup ?? "").trim().toLowerCase();
  if (mg === "brzuch") return "core";
  const et = (exerciseType ?? "").toLowerCase();
  if (et === "izolowane") return "isolation";
  if (et === "złożone") {
    if (exercisePriority === "Bardzo wysoki" || exercisePriority === "Wysoki") return "main_compound";
    return "secondary_compound";
  }
  return "secondary_compound";
}

async function getPlanFull(planId: number) {
  const [plan] = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) return null;

  // Fetch client name (safe fallback if client record is missing).
  const [client] = await db
    .select({ firstName: clientsTable.firstName, lastName: clientsTable.lastName })
    .from(clientsTable)
    .where(eq(clientsTable.id, plan.clientId));
  const clientName = client ? `${client.firstName} ${client.lastName}` : null;

  // Load survey cardio fields for recommendation generation in the trainer app.
  const [surveyCardioRow] = await db
    .select({
      cardioPreference: surveysTable.cardioPreference,
      cardioFrequency: surveysTable.cardioFrequency,
      preferredCardioType: surveysTable.preferredCardioType,
      activityLevel: surveysTable.activityLevel,
      trainingGoal: surveysTable.trainingGoal,
      healthLimitations: surveysTable.healthLimitations,
      injuryStatus: surveysTable.injuryStatus,
    })
    .from(surveysTable)
    .where(eq(surveysTable.id, plan.surveyId));
  const surveyCardio = surveyCardioRow ?? null;

  const days = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId))
    .orderBy(workoutPlanDaysTable.dayOrder);

  const dayIds = days.map((d) => d.id);

  const exercises =
    dayIds.length > 0
      ? await db
          .select({
            id: workoutPlanExercisesTable.id,
            dayId: workoutPlanExercisesTable.dayId,
            exerciseId: workoutPlanExercisesTable.exerciseId,
            exerciseName: exercisesTable.name,
            orderInDay: workoutPlanExercisesTable.orderInDay,
            workingSets: workoutPlanExercisesTable.workingSets,
            warmUpSets: workoutPlanExercisesTable.warmUpSets,
            // Repetition prescription
            repType: workoutPlanExercisesTable.repType,
            repsExact: workoutPlanExercisesTable.repsExact,
            repRangeMin: workoutPlanExercisesTable.repRangeMin,
            repRangeMax: workoutPlanExercisesTable.repRangeMax,
            repTimeSeconds: workoutPlanExercisesTable.repTimeSeconds,
            repDistanceMeters: workoutPlanExercisesTable.repDistanceMeters,
            repOpenInstruction: workoutPlanExercisesTable.repOpenInstruction,
            // Load prescription
            loadType: workoutPlanExercisesTable.loadType,
            loadValue: workoutPlanExercisesTable.loadValue,
            loadInstruction: workoutPlanExercisesTable.loadInstruction,
            // Intensity
            rir: workoutPlanExercisesTable.rir,
            rpe: workoutPlanExercisesTable.rpe,
            rirOrRpe: workoutPlanExercisesTable.rirOrRpe,
            // Technique
            tempo: workoutPlanExercisesTable.tempo,
            restSeconds: workoutPlanExercisesTable.restSeconds,
            // Notes
            notes: workoutPlanExercisesTable.notes,
            clientInstructions: workoutPlanExercisesTable.clientInstructions,
            // Exercise catalogue fields — used to derive exerciseClass without storing it
            _exerciseType: exercisesTable.exerciseType,
            _exercisePriority: exercisesTable.exercisePriority,
            _suitableForNoActivity: exercisesTable.suitableForNoActivity,
            _mainMuscleGroup: exercisesTable.mainMuscleGroup,
          })
          .from(workoutPlanExercisesTable)
          .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
          .where(inArray(workoutPlanExercisesTable.dayId, dayIds))
          .orderBy(workoutPlanExercisesTable.orderInDay)
      : [];

  // Group exercises by day.
  const exercisesByDay = new Map<number, typeof exercises>();
  for (const ex of exercises) {
    if (!exercisesByDay.has(ex.dayId)) exercisesByDay.set(ex.dayId, []);
    exercisesByDay.get(ex.dayId)!.push(ex);
  }

  const volume = await calculatePlanVolume(
    planId,
    plan.guidelineVersionId,
    plan.experienceLevelUsed,
  );

  return {
    ...plan,
    clientName,
    surveyCardio,
    days: days.map((d) => ({
      ...d,
      exercises: (exercisesByDay.get(d.id) ?? []).map(
        ({ _exerciseType, _exercisePriority, _suitableForNoActivity, _mainMuscleGroup, ...rest }) => ({
          ...rest,
          exerciseClass: resolveExerciseClass(
            _exerciseType,
            _exercisePriority,
            _mainMuscleGroup,
            _suitableForNoActivity,
          ),
        }),
      ),
    })),
    volume,
  };
}

// ─── POST /plans/volume-preview ──────────────────────────────────────────────
// Must be registered before any /plans/:id routes.
//
// Ownership protection:
//   • requireAuth — unauthenticated requests → 401.
//   • clientId (required) — verified to belong to the authenticated trainer via
//     verifyClientOwner; foreign client → 404.
//   • planId (optional) — when supplied, verified via loadPlanAndVerifyOwner
//     (plan → client → trainer join).  If the plan belongs to a different client
//     than the one in the body, the call also returns 404.
//   • trainerId is never read from the body; it comes from req.trainer.id.

router.post("/plans/volume-preview", requireAuth, async (req, res): Promise<void> => {
  const parsed = VolumePreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, planId, days } = parsed.data;
  const frontendLevel = parsed.data.experienceLevelUsed;
  const frontendVersionId = parsed.data.guidelineVersionId;

  // Route-level warnings accumulated before calculation.
  const routeWarnings: VolumePreviewWarning[] = [];

  // ── Verify client belongs to the authenticated trainer ────────────────────
  if (!(await verifyClientOwner(req, res, clientId))) return;

  // ── Determine authoritative guidelineVersionId and experienceLevelUsed ───
  // Strategy:
  //   1. If planId is provided → use the plan's stored values (authoritative for existing plan).
  //   2. Otherwise → derive from the client's most recent Training Interview + active version.
  // In both cases, validate any frontend-supplied values against the authoritative source.

  let authoritativeVersionId: number;
  let authoritativeLevel: string | null;

  if (planId) {
    // Existing plan: load plan's own stored values; also verifies trainer ownership.
    const planRow = await loadPlanAndVerifyOwner(req, res, planId);
    if (!planRow) return;

    if (planRow.clientId !== clientId) {
      res.status(404).json({ error: "Plan nie należy do podanego klienta" });
      return;
    }

    const [existingPlan] = await db
      .select({
        guidelineVersionId: workoutPlansTable.guidelineVersionId,
        experienceLevelUsed: workoutPlansTable.experienceLevelUsed,
      })
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.id, planId));

    authoritativeVersionId = existingPlan.guidelineVersionId;
    authoritativeLevel = existingPlan.experienceLevelUsed;

    // Warn if the frontend sent different values than the plan stores.
    if (frontendVersionId !== undefined && frontendVersionId !== authoritativeVersionId) {
      routeWarnings.push({
        code: "MISSING_GUIDELINE_VERSION",
        scope: "plan",
        message: `Wersja wytycznych podana przez klienta (${frontendVersionId}) różni się od wersji zapisanej w planie (${authoritativeVersionId}). Użyto wersji z planu.`,
      });
    }
    if (frontendLevel !== undefined && frontendLevel !== authoritativeLevel) {
      routeWarnings.push({
        code: "INVALID_EXPERIENCE_LEVEL",
        scope: "plan",
        message: `Poziom doświadczenia podany przez klienta ("${frontendLevel}") różni się od poziomu zapisanego w planie ("${authoritativeLevel}"). Użyto poziomu z planu.`,
      });
    }
  } else {
    // FIX 3 & 4 — new draft: derive from client's Training Interview + active version.
    const [latestSurvey] = await db
      .select({
        id: surveysTable.id,
        experienceLevel: surveysTable.experienceLevel,
      })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.id))
      .limit(1);

    if (!latestSurvey) {
      routeWarnings.push({
        code: "MISSING_CLIENT_SURVEY",
        scope: "plan",
        message: "Klient nie ma uzupełnionego wywiadu treningowego. Obliczenia mogą być nieprecyzyjne.",
      });
    }

    const surveyLevel = latestSurvey?.experienceLevel ?? null;

    if (!surveyLevel) {
      routeWarnings.push({
        code: "MISSING_EXPERIENCE_LEVEL",
        scope: "plan",
        message: "Wywiad treningowy klienta nie zawiera poziomu doświadczenia.",
      });
    } else if (!isValidExperienceLevel(surveyLevel)) {
      routeWarnings.push({
        code: "INVALID_EXPERIENCE_LEVEL",
        scope: "plan",
        message: `Poziom doświadczenia klienta ("${surveyLevel}") nie jest obsługiwany przez wytyczne objętościowe.`,
      });
    }

    // Load the active guideline version.
    const [activeVersion] = await db
      .select({ id: volumeGuidelineVersionsTable.id })
      .from(volumeGuidelineVersionsTable)
      .where(eq(volumeGuidelineVersionsTable.isActive, true))
      .orderBy(volumeGuidelineVersionsTable.id)
      .limit(1);

    if (!activeVersion) {
      routeWarnings.push({
        code: "MISSING_GUIDELINE_VERSION",
        scope: "plan",
        message: "Brak aktywnej wersji wytycznych objętościowych w systemie.",
      });
    }

    authoritativeVersionId = activeVersion?.id ?? frontendVersionId ?? 1;
    // Strict: only use the level when it is one of the four canonical values.
    // Unknown or missing levels must NOT be mapped to any guideline level —
    // not "Brak aktywności fizycznej", not "Początkujący".  The null value
    // signals to the calculation block below that volume cannot be computed.
    authoritativeLevel = (surveyLevel && isValidExperienceLevel(surveyLevel))
      ? surveyLevel
      : null;

    // Warn if frontend-supplied values differ from the backend-derived authoritative values.
    if (frontendVersionId !== undefined && frontendVersionId !== authoritativeVersionId) {
      routeWarnings.push({
        code: "MISSING_GUIDELINE_VERSION",
        scope: "plan",
        message: `Wersja wytycznych podana przez klienta (${frontendVersionId}) różni się od aktywnej wersji (${authoritativeVersionId}). Użyto aktywnej wersji.`,
      });
    }
    if (frontendLevel !== undefined && frontendLevel !== authoritativeLevel) {
      routeWarnings.push({
        code: "INVALID_EXPERIENCE_LEVEL",
        scope: "plan",
        message: `Poziom doświadczenia podany przez klienta ("${frontendLevel}") różni się od poziomu z wywiadu ("${authoritativeLevel}"). Użyto poziomu z wywiadu.`,
      });
    }
  }

  // ── Guard: do not calculate volume when experience level is unknown ────────
  // Return a structured "no guidelines" response immediately so the caller
  // knows exactly why no volume data is available.  Do not call
  // calculateVolumePreview with a null or invalid level.
  if (!authoritativeLevel) {
    res.json({
      clientId,
      experienceLevel: null,
      guidelineLevel: null,
      hasGuidelines: false,
      days: [],
      weekly: [],
      warnings: routeWarnings,
    });
    return;
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  const result = await calculateVolumePreview({
    clientId,
    guidelineVersionId: authoritativeVersionId,
    experienceLevelUsed: authoritativeLevel,
    days: days.map((d) => ({
      dayId: d.dayId,
      dayName: d.dayName ?? null,
      exercises: d.exercises,
    })),
  });

  // Prepend route-level warnings (context validation) before engine warnings.
  result.warnings = [...routeWarnings, ...result.warnings];

  res.json(result);
});

// ─── POST /plans/analysis-preview ────────────────────────────────────────────
// Must be registered before any /plans/:id routes.
//
// Ownership protection:
//   • requireAuth — unauthenticated requests → 401.
//   • clientId (required) — verified to belong to the authenticated trainer via
//     verifyClientOwner; foreign client → 404.
//   • planId (optional) — when supplied, verified via loadPlanAndVerifyOwner
//     (plan → client → trainer join).  If plan belongs to a different client
//     than the one in the body → 404.
//   • trainerId is never read from the body; it comes from req.trainer.id.

const AnalysisPreviewExerciseSchema = z.object({
  exerciseEntryId: z.number().int(),
  exerciseId:      z.number().int().positive(),
  workingSets:     z.number().int().min(1),
  orderInDay:      z.number().int().optional(),
});

const AnalysisPreviewDaySchema = z.object({
  dayId:    z.number().int(),
  dayName:  z.string().nullable().optional(),
  dayOrder: z.number().int().optional().default(0),
  exercises: z.array(AnalysisPreviewExerciseSchema),
});

const AnalysisPreviewBody = z.object({
  clientId: z.number().int().positive(),
  planId:   z.number().int().positive().optional(),
  goal:     z.string().nullable().optional(),
  days:     z.array(AnalysisPreviewDaySchema),
});

router.post("/plans/analysis-preview", requireAuth, async (req, res): Promise<void> => {
  const parsed = AnalysisPreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, planId, goal, days } = parsed.data;

  // Verify client belongs to the authenticated trainer.
  if (!(await verifyClientOwner(req, res, clientId))) return;

  // If planId is supplied, verify it belongs to this trainer and this client.
  if (planId !== undefined) {
    const planRow = await loadPlanAndVerifyOwner(req, res, planId);
    if (!planRow) return;

    if (planRow.clientId !== clientId) {
      res.status(404).json({ error: "Plan nie należy do podanego klienta" });
      return;
    }
  }

  const input: AnalysisPreviewInput = { clientId, planId, goal, days };
  const result = await analyseDraftPreview(input);
  res.json(result);
});

// ─── POST /clients/:clientId/plans/draft ─────────────────────────────────────
//
// Atomically saves a full plan draft (plan header + all days + all exercises)
// inside a single DB transaction.  If any step fails the whole write is rolled
// back, so the trainer never ends up with a partial / orphaned plan row.
//
// This replaces the old multi-request sequential save used by the wizard.
// The individual POST /plans/:id/days and POST /plans/:id/days/:dayId/exercises
// endpoints still exist for the interactive plan editor.

const SaveDraftExerciseBody = z.object({
  exerciseId: z.number().int().positive(),
  workingSets: z.number().int().min(1).default(3),
  warmUpSets: z.number().int().min(0).optional().default(0),
  repType: z.enum(["exact", "range", "time", "distance", "open"]).nullable().optional(),
  repsExact: z.number().int().positive().nullable().optional(),
  repRangeMin: z.number().int().positive().nullable().optional(),
  repRangeMax: z.number().int().positive().nullable().optional(),
  repTimeSeconds: z.number().int().positive().nullable().optional(),
  repDistanceMeters: z.number().int().positive().nullable().optional(),
  repOpenInstruction: z.string().nullable().optional(),
  loadType: z.string().nullable().optional(),
  loadValue: z.string().nullable().optional(),
  loadInstruction: z.string().nullable().optional(),
  rir: z.number().int().min(0).max(5).nullable().optional(),
  rpe: z.string().nullable().optional(),
  rirOrRpe: z.string().nullable().optional(),
  tempo: z.string().nullable().optional(),
  restSeconds: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  clientInstructions: z.string().nullable().optional(),
});

const SaveDraftDayBody = z.object({
  dayName: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  exercises: z.array(SaveDraftExerciseBody),
});

const SaveDraftPlanBody = z.object({
  title: z.string().min(1, "Tytuł planu jest wymagany"),
  surveyId: z.number().int().positive(),
  goal: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  splitType: z
    .enum([
      "full_body",
      "full_body_ab",
      "upper_lower",
      "upper_lower_full_body",
      "push_pull_legs",
      "push_pull_lower_full_body",
      "specialization",
      "custom",
    ])
    .nullable()
    .optional(),
  blockDurationWeeks: z.number().int().min(4).max(12).nullable().optional(),
  cardioRecommendation: z.string().nullable().optional(),
  days: z.array(SaveDraftDayBody),
});

router.post("/clients/:clientId/plans/draft", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Nieprawidłowe ID klienta" });
    return;
  }

  // ── Verify client belongs to the authenticated trainer ────────────────────
  if (!(await verifyClientOwner(req, res, clientId))) return;

  const parsed = SaveDraftPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, surveyId, goal, description, splitType, blockDurationWeeks, cardioRecommendation, days } = parsed.data;

  // ── Validate survey ownership ──────────────────────────────────────────────
  const [survey] = await db
    .select({ id: surveysTable.id, clientId: surveysTable.clientId, experienceLevel: surveysTable.experienceLevel })
    .from(surveysTable)
    .where(and(eq(surveysTable.id, surveyId), eq(surveysTable.clientId, clientId)));

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony dla tego klienta" });
    return;
  }

  if (!survey.experienceLevel) {
    res.status(400).json({
      error: "Wywiad treningowy klienta nie zawiera poziomu doświadczenia. Uzupełnij wywiad treningowy przed utworzeniem planu.",
    });
    return;
  }
  if (!isValidExperienceLevel(survey.experienceLevel)) {
    res.status(400).json({
      error: `Nieznany poziom doświadczenia w wywiadzie treningowym: "${survey.experienceLevel}".`,
    });
    return;
  }
  const experienceLevelUsed = survey.experienceLevel;

  // ── Get active guideline version ───────────────────────────────────────────
  const [activeVersion] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .orderBy(volumeGuidelineVersionsTable.id)
    .limit(1);

  if (!activeVersion) {
    res.status(500).json({ error: "Brak aktywnej wersji wytycznych objętości." });
    return;
  }

  // ── Validate all exerciseIds exist before opening the transaction ──────────
  const allExerciseIds = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  if (allExerciseIds.length > 0) {
    const foundExercises = await db
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(inArray(exercisesTable.id, allExerciseIds));
    const foundIds = new Set(foundExercises.map((e) => e.id));
    const missing = allExerciseIds.find((id) => !foundIds.has(id));
    if (missing !== undefined) {
      res.status(404).json({ error: `Ćwiczenie o ID ${missing} nie zostało znalezione.` });
      return;
    }
  }

  // ── Atomic write — single transaction ─────────────────────────────────────
  let planId: number;
  try {
    await db.transaction(async (tx) => {
      // 1. Insert plan header.
      const [plan] = await tx
        .insert(workoutPlansTable)
        .values({
          clientId,
          surveyId,
          guidelineVersionId: activeVersion.id,
          experienceLevelUsed,
          title,
          goal: goal ?? null,
          description: description ?? null,
          status: "draft",
          splitType: splitType ?? null,
          blockDurationWeeks: blockDurationWeeks ?? null,
          cardioRecommendation: cardioRecommendation ?? null,
        })
        .returning({ id: workoutPlansTable.id });

      planId = plan.id;

      // 2. Insert each day in order, then its exercises.
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const day = days[dayIdx];
        const dayOrder = dayIdx + 1;
        const defaultName = `Dzień ${dayOrder}`;

        const [insertedDay] = await tx
          .insert(workoutPlanDaysTable)
          .values({
            planId: planId,
            dayOrder,
            dayName: day.dayName ?? defaultName,
            subtitle: day.subtitle ?? null,
            estimatedDurationMinutes: day.estimatedDurationMinutes ?? null,
          })
          .returning({ id: workoutPlanDaysTable.id });

        // 3. Insert exercises for this day.
        for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
          const ex = day.exercises[exIdx];
          await tx.insert(workoutPlanExercisesTable).values({
            dayId: insertedDay.id,
            exerciseId: ex.exerciseId,
            orderInDay: exIdx + 1,
            workingSets: ex.workingSets,
            warmUpSets: ex.warmUpSets ?? 0,
            repType: ex.repType ?? null,
            repsExact: ex.repsExact ?? null,
            repRangeMin: ex.repRangeMin ?? null,
            repRangeMax: ex.repRangeMax ?? null,
            repTimeSeconds: ex.repTimeSeconds ?? null,
            repDistanceMeters: ex.repDistanceMeters ?? null,
            repOpenInstruction: ex.repOpenInstruction ?? null,
            loadType: ex.loadType ?? null,
            loadValue: ex.loadValue ?? null,
            loadInstruction: ex.loadInstruction ?? null,
            rir: ex.rir ?? null,
            rpe: ex.rpe ?? null,
            rirOrRpe: ex.rirOrRpe ?? null,
            tempo: ex.tempo ?? null,
            restSeconds: ex.restSeconds ?? null,
            notes: ex.notes ?? null,
            clientInstructions: ex.clientInstructions ?? null,
          });
        }
      }
    });
  } catch (err) {
    // Transaction was rolled back automatically.  Surface a clean error to the caller.
    const message = err instanceof Error ? err.message : "Nieznany błąd";
    res.status(500).json({ error: `Nie udało się zapisać planu (transakcja wycofana): ${message}` });
    return;
  }

  const full = await getPlanFull(planId!);
  res.status(201).json(full);
});

// ─── GET /clients/:clientId/plans ─────────────────────────────────────────────

router.get("/clients/:clientId/plans", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Nieprawidłowe ID klienta" });
    return;
  }

  if (!(await verifyClientOwner(req, res, clientId))) return;

  const plans = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.clientId, clientId))
    .orderBy(workoutPlansTable.createdAt);

  res.json(plans);
});

// ─── POST /clients/:clientId/plans ────────────────────────────────────────────

router.post("/clients/:clientId/plans", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Nieprawidłowe ID klienta" });
    return;
  }

  if (!(await verifyClientOwner(req, res, clientId))) return;

  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, surveyId, goal, description, startDate, endDate, trainerNotes, splitType, blockDurationWeeks } = parsed.data;

  // Verify survey belongs to this client.
  const [survey] = await db
    .select({ id: surveysTable.id, clientId: surveysTable.clientId, experienceLevel: surveysTable.experienceLevel })
    .from(surveysTable)
    .where(and(eq(surveysTable.id, surveyId), eq(surveysTable.clientId, clientId)));

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony dla tego klienta" });
    return;
  }

  // Validate the experience level before writing it to the plan.
  // Silently mapping null → "Początkujący" would assign incorrect volume
  // guidelines to the client.  The trainer must complete the survey first.
  if (!survey.experienceLevel) {
    res.status(400).json({
      error: "Wywiad treningowy klienta nie zawiera poziomu doświadczenia. Uzupełnij wywiad treningowy przed utworzeniem planu.",
    });
    return;
  }
  if (!isValidExperienceLevel(survey.experienceLevel)) {
    res.status(400).json({
      error: `Nieznany poziom doświadczenia w wywiadzie treningowym: "${survey.experienceLevel}". Oczekiwana jedna z wartości: Brak aktywności fizycznej, Początkujący, Średniozaawansowany, Zaawansowany.`,
    });
    return;
  }
  const experienceLevelUsed = survey.experienceLevel;

  // Get the active guideline version.
  const [activeVersion] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .orderBy(volumeGuidelineVersionsTable.id)
    .limit(1);

  if (!activeVersion) {
    res.status(500).json({ error: "Brak aktywnej wersji wytycznych objętości. Upewnij się, że serwer API wykonał seed." });
    return;
  }

  const [plan] = await db
    .insert(workoutPlansTable)
    .values({
      clientId,
      surveyId,
      guidelineVersionId: activeVersion.id,
      experienceLevelUsed,
      title,
      goal: goal ?? null,
      description: description ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      trainerNotes: trainerNotes ?? null,
      status: "draft",
      splitType: splitType ?? null,
      blockDurationWeeks: blockDurationWeeks ?? null,
    })
    .returning({ id: workoutPlansTable.id });

  const full = await getPlanFull(plan.id);
  res.status(201).json(full);
});

// ─── GET /plans/:id ───────────────────────────────────────────────────────────

router.get("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const full = await getPlanFull(planId);
  if (!full) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  res.json(full);
});

// ─── PATCH /plans/:id ─────────────────────────────────────────────────────────

router.patch("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof workoutPlansTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.goal !== undefined) updates.goal = parsed.data.goal;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate;
  if (parsed.data.trainerNotes !== undefined) updates.trainerNotes = parsed.data.trainerNotes;
  if (parsed.data.splitType !== undefined) updates.splitType = parsed.data.splitType ?? null;
  if (parsed.data.blockDurationWeeks !== undefined) updates.blockDurationWeeks = parsed.data.blockDurationWeeks ?? null;
  if (parsed.data.cardioRecommendation !== undefined) updates.cardioRecommendation = parsed.data.cardioRecommendation ?? null;

  await db.update(workoutPlansTable).set(updates).where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── DELETE /plans/:id ────────────────────────────────────────────────────────

router.delete("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  await db.delete(workoutPlansTable).where(eq(workoutPlansTable.id, planId));
  res.status(204).end();
});

// ─── POST /plans/:id/days ─────────────────────────────────────────────────────

router.post("/plans/:id/days", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const parsed = CreatePlanDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Determine next day order.
  const [maxRow] = await db
    .select({ maxOrder: max(workoutPlanDaysTable.dayOrder) })
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId));

  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
  const defaultName = `Dzień ${nextOrder}`;

  await db.insert(workoutPlanDaysTable).values({
    planId,
    dayOrder: nextOrder,
    dayName: parsed.data.dayName ?? defaultName,
    subtitle: parsed.data.subtitle ?? null,
    description: parsed.data.description ?? null,
    estimatedDurationMinutes: parsed.data.estimatedDurationMinutes ?? null,
    trainerNotes: parsed.data.trainerNotes ?? null,
  });

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.status(201).json(full);
});

// ─── PATCH /plans/:id/days/reorder ────────────────────────────────────────────

router.patch("/plans/:id/days/reorder", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const parsed = ReorderDaysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { order } = parsed.data;

  // Reject duplicate IDs.
  const ids = order.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "Zduplikowane ID dni w żądaniu." });
    return;
  }

  // Verify all IDs belong to this plan and that ALL plan days are included
  // (partial reorder would leave non-included days with stale values, creating gaps/dupes).
  const existingDays = await db
    .select({ id: workoutPlanDaysTable.id })
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId));
  if (existingDays.length !== ids.length) {
    res.status(400).json({ error: "Żądanie musi zawierać wszystkie dni planu." });
    return;
  }
  const existingDayIds = new Set(existingDays.map((d) => d.id));
  if (ids.some((id) => !existingDayIds.has(id))) {
    res.status(400).json({ error: "Niektóre ID dni nie należą do tego planu." });
    return;
  }

  // Execute reorder inside a single transaction.
  // Final order values are normalized to 1, 2, 3 … N by array position (ignoring
  // client-provided dayOrder numbers) so gaps and duplicates can never persist.
  await db.transaction(async (tx) => {
    // Step 1: temporary negative values — avoids any ordering conflicts mid-flight.
    for (const { id } of order) {
      const rows = await tx
        .update(workoutPlanDaysTable)
        .set({ dayOrder: -id })
        .where(and(eq(workoutPlanDaysTable.id, id), eq(workoutPlanDaysTable.planId, planId)))
        .returning({ id: workoutPlanDaysTable.id });
      if (rows.length !== 1) {
        throw new Error(`Nie można zaktualizować dnia o ID ${id}.`);
      }
    }
    // Step 2: normalized final values (1-based position in the request array).
    for (let i = 0; i < order.length; i++) {
      await tx
        .update(workoutPlanDaysTable)
        .set({ dayOrder: i + 1 })
        .where(and(eq(workoutPlanDaysTable.id, order[i].id), eq(workoutPlanDaysTable.planId, planId)));
    }
    // Update plan's updatedAt inside the same transaction.
    await tx
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));
  });

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── PATCH /plans/:id/days/:dayId ────────────────────────────────────────────

router.patch("/plans/:id/days/:dayId", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const parsed = UpdatePlanDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  const updates: Partial<typeof workoutPlanDaysTable.$inferInsert> = {};
  if (parsed.data.dayName !== undefined) updates.dayName = parsed.data.dayName;
  if (parsed.data.subtitle !== undefined) updates.subtitle = parsed.data.subtitle;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.estimatedDurationMinutes !== undefined) updates.estimatedDurationMinutes = parsed.data.estimatedDurationMinutes;
  if (parsed.data.trainerNotes !== undefined) updates.trainerNotes = parsed.data.trainerNotes;
  if (parsed.data.dayOrder !== undefined) updates.dayOrder = parsed.data.dayOrder;

  if (Object.keys(updates).length > 0) {
    await db
      .update(workoutPlanDaysTable)
      .set(updates)
      .where(eq(workoutPlanDaysTable.id, dayId));
  }

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── DELETE /plans/:id/days/:dayId ───────────────────────────────────────────

router.delete("/plans/:id/days/:dayId", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  await db.delete(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.id, dayId));

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── POST /plans/:id/days/:dayId/duplicate ────────────────────────────────────

router.post("/plans/:id/days/:dayId/duplicate", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  // Determine next day order.
  const [maxRow] = await db
    .select({ maxOrder: max(workoutPlanDaysTable.dayOrder) })
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId));

  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

  // Insert the duplicated day.
  const [newDay] = await db
    .insert(workoutPlanDaysTable)
    .values({
      planId,
      dayOrder: nextOrder,
      dayName: `${day.dayName ?? `Dzień ${day.dayOrder}`} (kopia)`,
      subtitle: day.subtitle,
      description: day.description,
      estimatedDurationMinutes: day.estimatedDurationMinutes,
      trainerNotes: day.trainerNotes,
    })
    .returning({ id: workoutPlanDaysTable.id });

  // Copy all exercises from the original day.
  const srcExercises = await db
    .select()
    .from(workoutPlanExercisesTable)
    .where(eq(workoutPlanExercisesTable.dayId, dayId))
    .orderBy(workoutPlanExercisesTable.orderInDay);

  if (srcExercises.length > 0) {
    await db.insert(workoutPlanExercisesTable).values(
      srcExercises.map(({ id: _id, dayId: _dayId, ...rest }) => ({
        ...rest,
        dayId: newDay.id,
      })),
    );
  }

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.status(201).json(full);
});

// ─── POST /plans/:id/days/:dayId/exercises ────────────────────────────────────

router.post("/plans/:id/days/:dayId/exercises", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const parsed = CreatePlanExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify day belongs to plan.
  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  // Verify exercise exists.
  const [exercise] = await db
    .select({ id: exercisesTable.id })
    .from(exercisesTable)
    .where(eq(exercisesTable.id, parsed.data.exerciseId));

  if (!exercise) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  // Next order_in_day.
  const [maxRow] = await db
    .select({ maxOrder: max(workoutPlanExercisesTable.orderInDay) })
    .from(workoutPlanExercisesTable)
    .where(eq(workoutPlanExercisesTable.dayId, dayId));

  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
  const d = parsed.data;

  await db.insert(workoutPlanExercisesTable).values({
    dayId,
    exerciseId: d.exerciseId,
    orderInDay: nextOrder,
    workingSets: d.workingSets,
    warmUpSets: d.warmUpSets ?? 0,
    repType: d.repType ?? null,
    repsExact: d.repsExact ?? null,
    repRangeMin: d.repRangeMin ?? null,
    repRangeMax: d.repRangeMax ?? null,
    repTimeSeconds: d.repTimeSeconds ?? null,
    repDistanceMeters: d.repDistanceMeters ?? null,
    repOpenInstruction: d.repOpenInstruction ?? null,
    loadType: d.loadType ?? null,
    loadValue: d.loadValue ?? null,
    loadInstruction: d.loadInstruction ?? null,
    rir: d.rir ?? null,
    rpe: d.rpe ?? null,
    rirOrRpe: d.rirOrRpe ?? null,
    tempo: d.tempo ?? null,
    restSeconds: d.restSeconds ?? null,
    notes: d.notes ?? null,
    clientInstructions: d.clientInstructions ?? null,
  });

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.status(201).json(full);
});

// ─── PATCH /plans/:id/days/:dayId/exercises/reorder ──────────────────────────

router.patch(
  "/plans/:id/days/:dayId/exercises/reorder",
  requireAuth,
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

    const parsed = ReorderExercisesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { order } = parsed.data;

    // Reject duplicate IDs.
    const ids = order.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      res.status(400).json({ error: "Zduplikowane ID ćwiczeń w żądaniu." });
      return;
    }

    // Verify the day belongs to this plan.
    const [day] = await db
      .select({ id: workoutPlanDaysTable.id })
      .from(workoutPlanDaysTable)
      .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));
    if (!day) {
      res.status(404).json({ error: "Dzień nie znaleziony w tym planie." });
      return;
    }

    // Verify all exercise IDs belong to this day and that ALL day exercises are included
    // (partial reorder would leave non-included exercises with stale values).
    const existingExercises = await db
      .select({ id: workoutPlanExercisesTable.id })
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, dayId));
    if (existingExercises.length !== ids.length) {
      res.status(400).json({ error: "Żądanie musi zawierać wszystkie ćwiczenia z danego dnia." });
      return;
    }
    const existingExIds = new Set(existingExercises.map((e) => e.id));
    if (ids.some((id) => !existingExIds.has(id))) {
      res.status(400).json({ error: "Niektóre ID ćwiczeń nie należą do tego dnia." });
      return;
    }

    // Execute reorder inside a single transaction.
    // Final values normalized to 1, 2, 3 … N by array position.
    await db.transaction(async (tx) => {
      // Step 1: temporary negative values.
      for (const { id } of order) {
        const rows = await tx
          .update(workoutPlanExercisesTable)
          .set({ orderInDay: -id })
          .where(and(eq(workoutPlanExercisesTable.id, id), eq(workoutPlanExercisesTable.dayId, dayId)))
          .returning({ id: workoutPlanExercisesTable.id });
        if (rows.length !== 1) {
          throw new Error(`Nie można zaktualizować ćwiczenia o ID ${id}.`);
        }
      }
      // Step 2: normalized final values.
      for (let i = 0; i < order.length; i++) {
        await tx
          .update(workoutPlanExercisesTable)
          .set({ orderInDay: i + 1 })
          .where(and(eq(workoutPlanExercisesTable.id, order[i].id), eq(workoutPlanExercisesTable.dayId, dayId)));
      }
      // Update plan's updatedAt inside the same transaction.
      await tx
        .update(workoutPlansTable)
        .set({ updatedAt: new Date() })
        .where(eq(workoutPlansTable.id, planId));
    });

    const full = await getPlanFull(planId);
    res.json(full);
  },
);

// ─── PATCH /plans/:id/days/:dayId/exercises/:exerciseId ──────────────────────

router.patch(
  "/plans/:id/days/:dayId/exercises/:exerciseId",
  requireAuth,
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    const planExerciseId = Number(req.params.exerciseId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId) || !Number.isFinite(planExerciseId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

    const parsed = UpdatePlanExerciseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [planEx] = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, dayId),
        ),
      );

    if (!planEx) {
      res.status(404).json({ error: "Ćwiczenie w planie nie znalezione" });
      return;
    }

    // If moving to a different day, verify that day also belongs to the same plan.
    if (parsed.data.dayId !== undefined && parsed.data.dayId !== dayId) {
      const [targetDay] = await db
        .select()
        .from(workoutPlanDaysTable)
        .where(
          and(
            eq(workoutPlanDaysTable.id, parsed.data.dayId),
            eq(workoutPlanDaysTable.planId, planId),
          ),
        );
      if (!targetDay) {
        res.status(404).json({ error: "Dzień docelowy nie znaleziony w tym planie" });
        return;
      }
    }

    const d = parsed.data;
    const updates: Partial<typeof workoutPlanExercisesTable.$inferInsert> = {};
    if (d.workingSets !== undefined) updates.workingSets = d.workingSets;
    if (d.warmUpSets !== undefined) updates.warmUpSets = d.warmUpSets;
    if (d.repType !== undefined) updates.repType = d.repType;
    if (d.repsExact !== undefined) updates.repsExact = d.repsExact;
    if (d.repRangeMin !== undefined) updates.repRangeMin = d.repRangeMin;
    if (d.repRangeMax !== undefined) updates.repRangeMax = d.repRangeMax;
    if (d.repTimeSeconds !== undefined) updates.repTimeSeconds = d.repTimeSeconds;
    if (d.repDistanceMeters !== undefined) updates.repDistanceMeters = d.repDistanceMeters;
    if (d.repOpenInstruction !== undefined) updates.repOpenInstruction = d.repOpenInstruction;
    if (d.loadType !== undefined) updates.loadType = d.loadType;
    if (d.loadValue !== undefined) updates.loadValue = d.loadValue;
    if (d.loadInstruction !== undefined) updates.loadInstruction = d.loadInstruction;
    if (d.rir !== undefined) updates.rir = d.rir;
    if (d.rpe !== undefined) updates.rpe = d.rpe;
    if (d.rirOrRpe !== undefined) updates.rirOrRpe = d.rirOrRpe;
    if (d.tempo !== undefined) updates.tempo = d.tempo;
    if (d.restSeconds !== undefined) updates.restSeconds = d.restSeconds;
    if (d.notes !== undefined) updates.notes = d.notes;
    if (d.clientInstructions !== undefined) updates.clientInstructions = d.clientInstructions;
    if (d.orderInDay !== undefined) updates.orderInDay = d.orderInDay;
    if (d.dayId !== undefined) updates.dayId = d.dayId;

    if (Object.keys(updates).length > 0) {
      await db
        .update(workoutPlanExercisesTable)
        .set(updates)
        .where(eq(workoutPlanExercisesTable.id, planExerciseId));
    }

    await db
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));

    const full = await getPlanFull(planId);
    res.json(full);
  },
);

// ─── POST /plans/:id/days/:dayId/exercises/:exerciseId/duplicate ──────────────

router.post(
  "/plans/:id/days/:dayId/exercises/:exerciseId/duplicate",
  requireAuth,
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    const planExerciseId = Number(req.params.exerciseId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId) || !Number.isFinite(planExerciseId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

    const [planEx] = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, dayId),
        ),
      );

    if (!planEx) {
      res.status(404).json({ error: "Ćwiczenie w planie nie znalezione" });
      return;
    }

    // Next order in day.
    const [maxRow] = await db
      .select({ maxOrder: max(workoutPlanExercisesTable.orderInDay) })
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, dayId));

    const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

    const { id: _id, ...exData } = planEx;
    await db.insert(workoutPlanExercisesTable).values({ ...exData, orderInDay: nextOrder });

    await db
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));

    const full = await getPlanFull(planId);
    res.status(201).json(full);
  },
);

// ─── DELETE /plans/:id/days/:dayId/exercises (clear all) ─────────────────────

router.delete("/plans/:id/days/:dayId/exercises", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  await db
    .delete(workoutPlanExercisesTable)
    .where(eq(workoutPlanExercisesTable.dayId, dayId));

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── DELETE /plans/:id/days/:dayId/exercises/:exerciseId ─────────────────────

router.delete(
  "/plans/:id/days/:dayId/exercises/:exerciseId",
  requireAuth,
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    const planExerciseId = Number(req.params.exerciseId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId) || !Number.isFinite(planExerciseId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

    const [planEx] = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, dayId),
        ),
      );

    if (!planEx) {
      res.status(404).json({ error: "Ćwiczenie w planie nie znalezione" });
      return;
    }

    await db
      .delete(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.id, planExerciseId));

    await db
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));

    const full = await getPlanFull(planId);
    res.json(full);
  },
);

// ─── POST /plans/:id/activate ─────────────────────────────────────────────────

// ─── Structured validation helper for plan activation ────────────────────────

interface ActivationMissingField {
  scope: "plan" | "day" | "exercise";
  dayId: number | null;
  exerciseEntryId: number | null;
  field: string;
  label: string;
  message: string;
}

function buildActivationMissingFields(
  plan: { title: string; status: string },
  fullPlan: NonNullable<Awaited<ReturnType<typeof getPlanFull>>>,
): ActivationMissingField[] {
  const missing: ActivationMissingField[] = [];

  // ── Plan level ─────────────────────────────────────────────────────────────
  if (!plan.title?.trim()) {
    missing.push({ scope: "plan", dayId: null, exerciseEntryId: null, field: "title", label: "Nazwa planu", message: "Plan musi mieć nazwę." });
  }
  if (fullPlan.days.length === 0) {
    missing.push({ scope: "plan", dayId: null, exerciseEntryId: null, field: "days", label: "Dni treningowe", message: "Plan musi zawierać co najmniej jeden dzień treningowy." });
  }

  // ── Day level ──────────────────────────────────────────────────────────────
  for (const day of fullPlan.days) {
    if (!day.dayName?.trim()) {
      missing.push({ scope: "day", dayId: day.id, exerciseEntryId: null, field: "dayName", label: "Nazwa dnia", message: `Dzień ${day.dayOrder} musi mieć nazwę.` });
    }
    if (day.exercises.length === 0) {
      missing.push({ scope: "day", dayId: day.id, exerciseEntryId: null, field: "exercises", label: "Ćwiczenia", message: `Dzień "${day.dayName ?? `Dzień ${day.dayOrder}`}" musi zawierać co najmniej jedno ćwiczenie.` });
    }

    // ── Exercise level ─────────────────────────────────────────────────────
    for (const ex of day.exercises) {
      const name = ex.exerciseName;

      // Working sets
      if (!ex.workingSets || ex.workingSets < 1) {
        missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "workingSets", label: "Serie robocze", message: `"${name}": wymagana jest co najmniej 1 seria robocza.` });
      }

      // Repetition prescription
      if (!ex.repType) {
        missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repType", label: "Typ powtórzeń", message: `"${name}": wymagane jest określenie sposobu liczenia powtórzeń.` });
      } else {
        switch (ex.repType) {
          case "exact":
            if (!ex.repsExact || ex.repsExact < 1) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repsExact", label: "Liczba powtórzeń", message: `"${name}": wymagana jest dokładna liczba powtórzeń.` });
            }
            break;
          case "range":
            if (!ex.repRangeMin || !ex.repRangeMax) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repRange", label: "Zakres powtórzeń", message: `"${name}": wymagane są min. i maks. liczba powtórzeń.` });
            } else if (ex.repRangeMin > ex.repRangeMax) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repRange", label: "Zakres powtórzeń", message: `"${name}": minimalna liczba powtórzeń nie może przekraczać maksymalnej.` });
            }
            break;
          case "time":
            if (!ex.repTimeSeconds || ex.repTimeSeconds < 1) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repTimeSeconds", label: "Czas trwania", message: `"${name}": wymagany jest czas trwania serii.` });
            }
            break;
          case "distance":
            if (!ex.repDistanceMeters || ex.repDistanceMeters < 1) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repDistanceMeters", label: "Dystans", message: `"${name}": wymagany jest dystans (w metrach).` });
            }
            break;
          case "open":
            if (!ex.repOpenInstruction?.trim()) {
              missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "repOpenInstruction", label: "Instrukcja AMRAP", message: `"${name}": wymagana jest instrukcja dla otwartego typu powtórzeń.` });
            }
            break;
        }
      }

      // RIR bounds (0–5)
      if (ex.rir != null && (ex.rir < 0 || ex.rir > 5)) {
        missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "rir", label: "RIR", message: `"${name}": RIR musi być wartością od 0 do 5.` });
      }

      // RPE bounds (1–10)
      if (ex.rpe != null && ex.rpe !== "") {
        const rpeVal = parseFloat(ex.rpe);
        if (isNaN(rpeVal) || rpeVal < 1 || rpeVal > 10) {
          missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "rpe", label: "RPE", message: `"${name}": RPE musi być wartością od 1 do 10.` });
        }
      }

      // Rest time non-negative
      if (ex.restSeconds != null && ex.restSeconds < 0) {
        missing.push({ scope: "exercise", dayId: day.id, exerciseEntryId: ex.id, field: "restSeconds", label: "Czas odpoczynku", message: `"${name}": czas odpoczynku nie może być ujemny.` });
      }
    }
  }

  // ── Muscle assignments from volume calculation ──────────────────────────────
  for (const unassigned of fullPlan.volume.exercisesWithoutAssignments) {
    const dayWithEx = fullPlan.days.find((d) =>
      d.exercises.some((e) => e.id === unassigned.planExerciseId),
    );
    missing.push({
      scope: "exercise",
      dayId: dayWithEx?.id ?? null,
      exerciseEntryId: unassigned.planExerciseId,
      field: "muscleAssignments",
      label: "Przypisania mięśni",
      message: `"${unassigned.exerciseName}": brak przypisanych mięśni do obliczeń objętości.`,
    });
  }

  return missing;
}

router.post("/plans/:id/activate", requireAuth, async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  if (!(await loadPlanAndVerifyOwner(req, res, planId))) return;

  const [plan] = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  if (plan.status === "active") {
    res.status(400).json({ error: "Plan jest już aktywny" });
    return;
  }

  // Load the full plan once (includes days, exercises, and pre-calculated volume).
  const fullPlan = await getPlanFull(planId);
  if (!fullPlan) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  // ── Structured validation ─────────────────────────────────────────────────
  const missingFields = buildActivationMissingFields(plan, fullPlan);
  if (missingFields.length > 0) {
    res.status(422).json({
      error: "PLAN_ACTIVATION_VALIDATION_FAILED",
      message: "Nie można aktywować niekompletnego planu.",
      missingFields,
    });
    return;
  }

  // ── Volume ceiling check ──────────────────────────────────────────────────
  const violations = fullPlan.volume.targets.filter(
    (t) => t.status === "above_max_recommended" || t.status === "overtraining_warning",
  );
  if (violations.length > 0) {
    res.status(422).json({
      error: "Aktywacja zablokowana: przekroczono absolutny limit tygodniowy",
      violations: violations.map((v) => ({
        targetName: v.targetName,
        weeklyEffectiveSets: Math.round(v.weeklyEffectiveSets * 10) / 10,
        weeklyAbsoluteCeiling: v.weeklyAbsoluteCeiling,
        contributing: v.breakdown.map((b) => b.exerciseName),
      })),
    });
    return;
  }

  // Activate.
  await db
    .update(workoutPlansTable)
    .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── GET /volume-guidelines ───────────────────────────────────────────────────
// Returns guidelines for a specific version + experience level (mapped).

router.get("/volume-guidelines", async (req, res): Promise<void> => {
  const versionId = req.query.versionId ? Number(req.query.versionId) : null;
  const experienceLevel = typeof req.query.experienceLevel === "string"
    ? req.query.experienceLevel
    : null;

  if (!versionId || !experienceLevel) {
    res.status(400).json({ error: "Wymagane: versionId, experienceLevel" });
    return;
  }

  const guidelineLevel = mapToGuidelineLevel(experienceLevel);
  if (!guidelineLevel) {
    res.status(400).json({
      error: `Nieznany poziom doświadczenia: "${experienceLevel}". Oczekiwana jedna z wartości: Brak aktywności fizycznej, Początkujący, Średniozaawansowany, Zaawansowany.`,
    });
    return;
  }

  const rows = await db
    .select({
      id: volumeGuidelinesTable.id,
      versionId: volumeGuidelinesTable.versionId,
      experienceLevel: volumeGuidelinesTable.experienceLevel,
      volumeTargetId: volumeGuidelinesTable.volumeTargetId,
      targetName: volumeTargetsTable.name,
      sessionMin: volumeGuidelinesTable.sessionMin,
      sessionMax: volumeGuidelinesTable.sessionMax,
      weeklyPreferredCeiling: volumeGuidelinesTable.weeklyPreferredCeiling,
      weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling,
    })
    .from(volumeGuidelinesTable)
    .innerJoin(
      volumeTargetsTable,
      eq(volumeGuidelinesTable.volumeTargetId, volumeTargetsTable.id),
    )
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, versionId),
        eq(volumeGuidelinesTable.experienceLevel, guidelineLevel),
      ),
    )
    .orderBy(volumeTargetsTable.name);

  res.json(rows);
});

export default router;
