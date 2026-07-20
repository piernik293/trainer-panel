/**
 * Client Portal routes
 *
 * Provides the execution layer: clients view their active plan, create workout
 * sessions, and log exercise data.  Trainers can read session history.
 *
 * Auth: email-keyed lookup for plan access; all subsequent session operations
 * require the clientId (derived from the email lookup) and are verified
 * server-side so one client cannot read or write another's sessions.
 */

import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  clientsTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  exercisesTable,
  workoutSessionsTable,
  exerciseExecutionLogsTable,
} from "@workspace/db";
import { determineDayType, getRampWarmup } from "../services/rampWarmup";

const router: IRouter = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateSessionBody = z.object({
  clientId: z.number().int().positive(),
  planId: z.number().int().positive(),
  planDayId: z.number().int().positive(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
});

const UpsertExerciseLogBody = z.object({
  clientId: z.number().int().positive(),
  setsCompleted: z.number().int().min(0).nullable().optional(),
  repsCompleted: z.number().int().min(0).nullable().optional(),
  weightKg: z.number().min(0).nullable().optional(),
  rir: z.number().int().min(0).max(10).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  isCompleted: z.boolean().optional(),
});

const PatchSessionBody = z.object({
  clientId: z.number().int().positive(),
  isCompleted: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// ─── Helper: verify session ownership ────────────────────────────────────────
// Returns the session row if it exists and belongs to clientId, else null.

async function verifySessionOwnership(sessionId: number, clientId: number) {
  const [session] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.clientId, clientId)));
  return session ?? null;
}

// ─── Helper: build full plan response for client (no trainer notes) ──────────

async function getClientPlanFull(planId: number) {
  const [plan] = await db
    .select({
      id: workoutPlansTable.id,
      clientId: workoutPlansTable.clientId,
      title: workoutPlansTable.title,
      goal: workoutPlansTable.goal,
      description: workoutPlansTable.description,
      startDate: workoutPlansTable.startDate,
      endDate: workoutPlansTable.endDate,
      status: workoutPlansTable.status,
      createdAt: workoutPlansTable.createdAt,
    })
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) return null;

  const days = await db
    .select({
      id: workoutPlanDaysTable.id,
      planId: workoutPlanDaysTable.planId,
      dayOrder: workoutPlanDaysTable.dayOrder,
      dayName: workoutPlanDaysTable.dayName,
      subtitle: workoutPlanDaysTable.subtitle,
      description: workoutPlanDaysTable.description,
      estimatedDurationMinutes: workoutPlanDaysTable.estimatedDurationMinutes,
    })
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
            mainMuscleGroup: exercisesTable.mainMuscleGroup,
            orderInDay: workoutPlanExercisesTable.orderInDay,
            workingSets: workoutPlanExercisesTable.workingSets,
            warmUpSets: workoutPlanExercisesTable.warmUpSets,
            repType: workoutPlanExercisesTable.repType,
            repsExact: workoutPlanExercisesTable.repsExact,
            repRangeMin: workoutPlanExercisesTable.repRangeMin,
            repRangeMax: workoutPlanExercisesTable.repRangeMax,
            repTimeSeconds: workoutPlanExercisesTable.repTimeSeconds,
            repOpenInstruction: workoutPlanExercisesTable.repOpenInstruction,
            loadType: workoutPlanExercisesTable.loadType,
            loadValue: workoutPlanExercisesTable.loadValue,
            loadInstruction: workoutPlanExercisesTable.loadInstruction,
            rir: workoutPlanExercisesTable.rir,
            rpe: workoutPlanExercisesTable.rpe,
            tempo: workoutPlanExercisesTable.tempo,
            restSeconds: workoutPlanExercisesTable.restSeconds,
            clientInstructions: workoutPlanExercisesTable.clientInstructions,
          })
          .from(workoutPlanExercisesTable)
          .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
          .where(inArray(workoutPlanExercisesTable.dayId, dayIds))
          .orderBy(workoutPlanExercisesTable.orderInDay)
      : [];

  const exercisesByDay = new Map<number, typeof exercises>();
  for (const ex of exercises) {
    if (!exercisesByDay.has(ex.dayId)) exercisesByDay.set(ex.dayId, []);
    exercisesByDay.get(ex.dayId)!.push(ex);
  }

  return {
    ...plan,
    days: days.map((d) => ({
      ...d,
      exercises: exercisesByDay.get(d.id) ?? [],
    })),
  };
}

// ─── GET /client-portal/plan?email=xxx ──────────────────────────────────────
// Returns the active plan for the client identified by email.

router.get("/client-portal/plan", async (req, res): Promise<void> => {
  const email = (req.query["email"] as string | undefined)?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "Podaj adres e-mail." });
    return;
  }

  const [client] = await db
    .select({ id: clientsTable.id, firstName: clientsTable.firstName, lastName: clientsTable.lastName })
    .from(clientsTable)
    .where(eq(clientsTable.email, email))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Nie znaleziono klienta z podanym adresem e-mail." });
    return;
  }

  const [activePlan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.clientId, client.id), eq(workoutPlansTable.status, "active")))
    .orderBy(desc(workoutPlansTable.activatedAt))
    .limit(1);

  if (!activePlan) {
    res.status(404).json({ error: "Brak aktywnego planu treningowego. Trener jeszcze nie aktywował Twojego planu." });
    return;
  }

  const plan = await getClientPlanFull(activePlan.id);
  if (!plan) {
    res.status(404).json({ error: "Plan nie znaleziony." });
    return;
  }

  res.json({ client: { id: client.id, firstName: client.firstName, lastName: client.lastName }, plan });
});

// ─── GET /client-portal/sessions?clientId=x&planDayId=y ─────────────────────
// Returns existing sessions for a client + day combination.
// clientId is the ownership key — only sessions for that client are returned.

router.get("/client-portal/sessions", async (req, res): Promise<void> => {
  const clientId = Number(req.query["clientId"]);
  const planDayId = Number(req.query["planDayId"]);
  if (!clientId || !planDayId) {
    res.status(400).json({ error: "clientId i planDayId są wymagane." });
    return;
  }

  const sessions = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.planDayId, planDayId)))
    .orderBy(desc(workoutSessionsTable.sessionDate));

  res.json(sessions);
});

// ─── POST /client-portal/sessions ────────────────────────────────────────────
// Creates a new workout session for a plan day.

router.post("/client-portal/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, planId, planDayId, sessionDate } = parsed.data;

  // Verify plan belongs to client.
  const [plan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.id, planId), eq(workoutPlansTable.clientId, clientId)));
  if (!plan) {
    res.status(403).json({ error: "Plan nie należy do tego klienta." });
    return;
  }

  const [session] = await db
    .insert(workoutSessionsTable)
    .values({ clientId, planId, planDayId, sessionDate })
    .returning();

  res.status(201).json(session);
});

// ─── GET /client-portal/sessions/:sessionId?clientId=x ───────────────────────
// Returns session details with all exercise execution logs.
// Requires clientId query param to verify ownership.

router.get("/client-portal/sessions/:sessionId", async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const clientId = Number(req.query["clientId"]);
  if (!sessionId || !clientId) {
    res.status(400).json({ error: "Nieprawidłowe parametry żądania." });
    return;
  }

  const session = await verifySessionOwnership(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  const logs = await db
    .select()
    .from(exerciseExecutionLogsTable)
    .where(eq(exerciseExecutionLogsTable.sessionId, sessionId));

  res.json({ ...session, logs });
});

// ─── PATCH /client-portal/sessions/:sessionId ────────────────────────────────
// Mark session complete or update session-level notes.
// Requires clientId in body to verify ownership.

router.patch("/client-portal/sessions/:sessionId", async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const parsed = PatchSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { clientId, isCompleted, notes } = parsed.data;

  const existing = await verifySessionOwnership(sessionId, clientId);
  if (!existing) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  // Build a properly typed update object.
  type SessionUpdate = {
    updatedAt: Date;
    isCompleted?: boolean;
    completedAt?: Date | null;
    notes?: string | null;
  };

  const patch: SessionUpdate = { updatedAt: new Date() };
  if (isCompleted !== undefined) {
    patch.isCompleted = isCompleted;
    patch.completedAt = isCompleted ? new Date() : null;
  }
  if (notes !== undefined) patch.notes = notes;

  const [updated] = await db
    .update(workoutSessionsTable)
    .set(patch)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.clientId, clientId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  res.json(updated);
});

// ─── PUT /client-portal/sessions/:sessionId/exercises/:planExerciseId ────────
// Upsert an exercise execution log.
// Requires clientId in body to verify session ownership before writing.

router.put(
  "/client-portal/sessions/:sessionId/exercises/:planExerciseId",
  async (req, res): Promise<void> => {
    const sessionId = Number(req.params["sessionId"]);
    const planExerciseId = Number(req.params["planExerciseId"]);
    const parsed = UpsertExerciseLogBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { clientId, setsCompleted, repsCompleted, weightKg, rir, note, isCompleted } = parsed.data;

    // Verify this session belongs to the requesting client.
    const session = await verifySessionOwnership(sessionId, clientId);
    if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

    // Verify the exercise belongs to the session's day.
    const [planExercise] = await db
      .select({ id: workoutPlanExercisesTable.id })
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, session.planDayId),
        ),
      );
    if (!planExercise) { res.status(403).json({ error: "Ćwiczenie nie należy do tego dnia treningowego." }); return; }

    // Check if log already exists.
    const [existing] = await db
      .select({ id: exerciseExecutionLogsTable.id })
      .from(exerciseExecutionLogsTable)
      .where(
        and(
          eq(exerciseExecutionLogsTable.sessionId, sessionId),
          eq(exerciseExecutionLogsTable.planExerciseId, planExerciseId),
        ),
      );

    let log;
    if (existing) {
      const [updated] = await db
        .update(exerciseExecutionLogsTable)
        .set({
          ...(setsCompleted !== undefined ? { setsCompleted } : {}),
          ...(repsCompleted !== undefined ? { repsCompleted } : {}),
          ...(weightKg !== undefined ? { weightKg: weightKg?.toString() ?? null } : {}),
          ...(rir !== undefined ? { rir } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(isCompleted !== undefined ? { isCompleted } : {}),
          updatedAt: new Date(),
        })
        .where(eq(exerciseExecutionLogsTable.id, existing.id))
        .returning();
      log = updated;
    } else {
      const [inserted] = await db
        .insert(exerciseExecutionLogsTable)
        .values({
          sessionId,
          planExerciseId,
          setsCompleted: setsCompleted ?? null,
          repsCompleted: repsCompleted ?? null,
          weightKg: weightKg?.toString() ?? null,
          rir: rir ?? null,
          note: note ?? null,
          isCompleted: isCompleted ?? false,
        })
        .returning();
      log = inserted;
    }

    res.json(log);
  },
);

// ─── GET /client-portal/sessions/:sessionId/warmup?clientId=x ────────────────
// Returns RAMP warm-up blocks for the day associated with this session.
// Requires clientId query param to verify ownership.

router.get("/client-portal/sessions/:sessionId/warmup", async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const clientId = Number(req.query["clientId"]);
  if (!sessionId || !clientId) {
    res.status(400).json({ error: "Nieprawidłowe parametry żądania." });
    return;
  }

  const session = await verifySessionOwnership(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  const exercises = await db
    .select({ mainMuscleGroup: exercisesTable.mainMuscleGroup })
    .from(workoutPlanExercisesTable)
    .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
    .where(eq(workoutPlanExercisesTable.dayId, session.planDayId));

  const muscleGroups = exercises.map((e) => e.mainMuscleGroup);
  const dayType = determineDayType(muscleGroups);
  const warmup = getRampWarmup(dayType);

  res.json({ dayType, blocks: warmup });
});

// ─── GET /clients/:clientId/workout-sessions ─────────────────────────────────
// Trainer view: list all sessions for a client, newest first.

router.get("/clients/:clientId/workout-sessions", async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId) { res.status(400).json({ error: "Nieprawidłowe ID klienta." }); return; }

  const sessions = await db
    .select({
      id: workoutSessionsTable.id,
      planId: workoutSessionsTable.planId,
      planDayId: workoutSessionsTable.planDayId,
      sessionDate: workoutSessionsTable.sessionDate,
      isCompleted: workoutSessionsTable.isCompleted,
      notes: workoutSessionsTable.notes,
      completedAt: workoutSessionsTable.completedAt,
      createdAt: workoutSessionsTable.createdAt,
      planTitle: workoutPlansTable.title,
      dayName: workoutPlanDaysTable.dayName,
      daySubtitle: workoutPlanDaysTable.subtitle,
    })
    .from(workoutSessionsTable)
    .innerJoin(workoutPlansTable, eq(workoutSessionsTable.planId, workoutPlansTable.id))
    .innerJoin(workoutPlanDaysTable, eq(workoutSessionsTable.planDayId, workoutPlanDaysTable.id))
    .where(eq(workoutSessionsTable.clientId, clientId))
    .orderBy(desc(workoutSessionsTable.sessionDate));

  res.json(sessions);
});

// ─── GET /clients/:clientId/workout-sessions/:sessionId ──────────────────────
// Trainer view: full session detail with prescribed vs. actual per exercise.

router.get("/clients/:clientId/workout-sessions/:sessionId", async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  const sessionId = Number(req.params["sessionId"]);

  const [session] = await db
    .select({
      id: workoutSessionsTable.id,
      planId: workoutSessionsTable.planId,
      planDayId: workoutSessionsTable.planDayId,
      sessionDate: workoutSessionsTable.sessionDate,
      isCompleted: workoutSessionsTable.isCompleted,
      notes: workoutSessionsTable.notes,
      completedAt: workoutSessionsTable.completedAt,
      planTitle: workoutPlansTable.title,
      dayName: workoutPlanDaysTable.dayName,
      daySubtitle: workoutPlanDaysTable.subtitle,
    })
    .from(workoutSessionsTable)
    .innerJoin(workoutPlansTable, eq(workoutSessionsTable.planId, workoutPlansTable.id))
    .innerJoin(workoutPlanDaysTable, eq(workoutSessionsTable.planDayId, workoutPlanDaysTable.id))
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.clientId, clientId)));

  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  const exercises = await db
    .select({
      planExerciseId: workoutPlanExercisesTable.id,
      exerciseName: exercisesTable.name,
      orderInDay: workoutPlanExercisesTable.orderInDay,
      workingSets: workoutPlanExercisesTable.workingSets,
      repType: workoutPlanExercisesTable.repType,
      repsExact: workoutPlanExercisesTable.repsExact,
      repRangeMin: workoutPlanExercisesTable.repRangeMin,
      repRangeMax: workoutPlanExercisesTable.repRangeMax,
      rir: workoutPlanExercisesTable.rir,
      loadType: workoutPlanExercisesTable.loadType,
      loadValue: workoutPlanExercisesTable.loadValue,
      restSeconds: workoutPlanExercisesTable.restSeconds,
    })
    .from(workoutPlanExercisesTable)
    .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
    .where(eq(workoutPlanExercisesTable.dayId, session.planDayId))
    .orderBy(workoutPlanExercisesTable.orderInDay);

  const logs = await db
    .select()
    .from(exerciseExecutionLogsTable)
    .where(eq(exerciseExecutionLogsTable.sessionId, sessionId));

  const logByExercise = new Map(logs.map((l) => [l.planExerciseId, l]));

  const detail = exercises.map((ex) => ({
    ...ex,
    actual: logByExercise.get(ex.planExerciseId) ?? null,
  }));

  res.json({ ...session, exercises: detail });
});

export default router;
