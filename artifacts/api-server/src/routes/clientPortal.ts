/**
 * Client Portal routes
 *
 * Provides the execution layer: clients view their active plan, create workout
 * sessions, and log exercise data.  Trainers can read session history.
 *
 * Auth model (client-portal session routes):
 *   All /client-portal/sessions* routes are protected by requireClientAuth.
 *   The authenticated client identity (req.client.id) is the exclusive source
 *   of clientId — caller-provided clientId values in query params or bodies
 *   are removed from the contract and must never be used for authorization.
 *
 * Auth model (trainer-facing session routes):
 *   GET /clients/:clientId/workout-sessions and :sessionId are protected by
 *   requireAuth (trainer Clerk session) + verifyClientBelongsToTrainer.
 */

import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
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
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";

const router: IRouter = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateSessionBody = z.object({
  planId: z.number().int().positive(),
  planDayId: z.number().int().positive(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
});

const UpsertExerciseLogBody = z.object({
  setsCompleted: z.number().int().min(0).nullable().optional(),
  repsCompleted: z.number().int().min(0).nullable().optional(),
  weightKg: z.number().min(0).nullable().optional(),
  rir: z.number().int().min(0).max(10).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  isCompleted: z.boolean().optional(),
});

const PatchSessionBody = z.object({
  isCompleted: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // Optional post-workout feedback — never required, never blocks completion.
  difficultyRating: z.number().int().min(1).max(10).nullable().optional(),
  hadPain: z.boolean().nullable().optional(),
  energyLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
});

// Postgres error codes may be on the error itself or (Drizzle ≥0.45) on .cause.
function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

const OpenSessionBody = z.object({
  planId: z.number().int().positive(),
  planDayId: z.number().int().positive(),
});

// ─── Progression suggestion (informational only — never mutates the plan) ────

export type ProgressionSuggestion = "increase" | "maintain" | "repeat_or_reduce";

export function computeProgressionSuggestion(input: {
  prevSetsCompleted: number | null;
  prevRepsCompleted: number | null;
  prevRir: number | null;
  plannedSets: number | null;
  plannedRepMin: number | null;
  plannedRepMax: number | null;
  plannedRir: number | null;
  hadPain: boolean | null;
}): ProgressionSuggestion | null {
  const { prevSetsCompleted, prevRepsCompleted, prevRir, plannedSets, plannedRepMin, plannedRepMax, plannedRir, hadPain } = input;

  // Not enough data for any suggestion.
  if (prevRepsCompleted == null && prevSetsCompleted == null) return null;

  // Pain always blocks an increase.
  if (hadPain === true) return "repeat_or_reduce";

  // Missed the minimum rep target.
  if (plannedRepMin != null && prevRepsCompleted != null && prevRepsCompleted < plannedRepMin) {
    return "repeat_or_reduce";
  }

  const allSetsDone = plannedSets != null && prevSetsCompleted != null && prevSetsCompleted >= plannedSets;
  const topOfRange = plannedRepMax != null && prevRepsCompleted != null && prevRepsCompleted >= plannedRepMax;
  // RIR requirement: if a target exists, it must be recorded and not below target.
  const rirOk = plannedRir == null || (prevRir != null && prevRir >= plannedRir);

  if (allSetsDone && topOfRange && rirOk) return "increase";
  return "maintain";
}

// ─── Trainer-ownership helpers ────────────────────────────────────────────────

/**
 * Verify a client belongs to the authenticated trainer.
 * Returns true on success, or false after sending 404.
 * Must only be called on routes guarded by requireAuth.
 */
async function verifyClientBelongsToTrainer(
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
    res.status(404).json({ error: "Klient nie znaleziony." });
    return false;
  }
  return true;
}

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
      updatedAt: workoutPlansTable.updatedAt,
      // Trainer-authored cardio prescription (JSON string, null = none saved).
      // The client portal must never generate cardio on its own — display only.
      cardioRecommendation: workoutPlansTable.cardioRecommendation,
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

// ─── GET /client-portal/plan ──────────────────────────────────────────────────
// Returns the active plan for the authenticated client.
// Auth: requireClientAuth — clientId comes from req.client.id, never from query.
// The legacy ?email= query parameter is silently ignored.

router.get("/client-portal/plan", requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;

  // Resolve display fields for the response (name shown in the portal).
  const [clientRow] = await db
    .select({ id: clientsTable.id, firstName: clientsTable.firstName, lastName: clientsTable.lastName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!clientRow) {
    // requireClientAuth already guarantees the row exists, but guard defensively.
    res.status(404).json({ error: "Klient nie znaleziony." });
    return;
  }

  const [activePlan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")))
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

  res.json({ client: { id: clientRow.id, firstName: clientRow.firstName, lastName: clientRow.lastName }, plan });
});

// ─── GET /client-portal/sessions ─────────────────────────────────────────────
// Returns sessions for a specific plan day that belong to the authenticated client.
// Auth: requireClientAuth — clientId comes from req.client.id, never from query.

router.get("/client-portal/sessions", requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;
  const planDayId = Number(req.query["planDayId"]);
  if (!planDayId) {
    res.status(400).json({ error: "planDayId jest wymagane." });
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
// Auth: requireClientAuth — clientId comes from req.client.id, never from body.
// Ownership: plan must belong to the authenticated client.

router.post("/client-portal/sessions", requireClientAuth, async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clientId = req.client!.id;
  const { planId, planDayId, sessionDate } = parsed.data;

  // Verify plan belongs to the authenticated client (plan → authenticated client chain).
  const [plan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.id, planId), eq(workoutPlansTable.clientId, clientId)));
  if (!plan) {
    res.status(404).json({ error: "Plan nie znaleziony." });
    return;
  }

  // Verify plan day belongs to the plan (plan day → plan → authenticated client chain).
  const [planDay] = await db
    .select({ id: workoutPlanDaysTable.id })
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, planDayId), eq(workoutPlanDaysTable.planId, planId)));
  if (!planDay) {
    res.status(404).json({ error: "Dzień planu nie znaleziony." });
    return;
  }

  // Single-active-session invariant (partial unique index ws_one_active_per_client_day):
  // if an active session already exists for this day, return it instead of failing.
  const [existingActive] = await db
    .select()
    .from(workoutSessionsTable)
    .where(
      and(
        eq(workoutSessionsTable.clientId, clientId),
        eq(workoutSessionsTable.planDayId, planDayId),
        eq(workoutSessionsTable.isCompleted, false),
      ),
    )
    .limit(1);
  if (existingActive) {
    res.status(200).json(existingActive);
    return;
  }

  try {
    const [session] = await db
      .insert(workoutSessionsTable)
      .values({ clientId, planId, planDayId, sessionDate })
      .returning();
    res.status(201).json(session);
  } catch (err: unknown) {
    // Concurrent create hit the unique index — return the winner.
    if (pgErrorCode(err) === "23505") {
      const [winner] = await db
        .select()
        .from(workoutSessionsTable)
        .where(
          and(
            eq(workoutSessionsTable.clientId, clientId),
            eq(workoutSessionsTable.planDayId, planDayId),
            eq(workoutSessionsTable.isCompleted, false),
          ),
        )
        .limit(1);
      if (winner) { res.status(200).json(winner); return; }
    }
    throw err;
  }
});

// ─── POST /client-portal/sessions/open ───────────────────────────────────────
// Get-or-create the single ACTIVE (not completed) session for a plan day.
// Completed sessions are never reopened or reset here — a new session is
// created instead. Also returns previous completed results per plan exercise
// (matched by clientId + exerciseId) plus a non-binding progression suggestion.
// Auth: requireClientAuth — clientId from req.client.id only.

router.post("/client-portal/sessions/open", requireClientAuth, async (req, res): Promise<void> => {
  const parsed = OpenSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const clientId = req.client!.id;
  const { planId, planDayId } = parsed.data;

  // Ownership chain: plan → authenticated client; plan day → plan.
  const [plan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.id, planId), eq(workoutPlansTable.clientId, clientId)));
  if (!plan) { res.status(404).json({ error: "Plan nie znaleziony." }); return; }

  const [planDay] = await db
    .select({ id: workoutPlanDaysTable.id })
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, planDayId), eq(workoutPlanDaysTable.planId, planId)));
  if (!planDay) { res.status(404).json({ error: "Dzień planu nie znaleziony." }); return; }

  // Find the newest ACTIVE session for this day, if any.
  const [active] = await db
    .select()
    .from(workoutSessionsTable)
    .where(
      and(
        eq(workoutSessionsTable.clientId, clientId),
        eq(workoutSessionsTable.planDayId, planDayId),
        eq(workoutSessionsTable.isCompleted, false),
      ),
    )
    .orderBy(desc(workoutSessionsTable.createdAt))
    .limit(1);

  let session = active;
  if (!session) {
    const today = new Date().toISOString().split("T")[0]!;
    try {
      const [created] = await db
        .insert(workoutSessionsTable)
        .values({ clientId, planId, planDayId, sessionDate: today })
        .returning();
      session = created!;
    } catch (err: unknown) {
      // Concurrent open hit the ws_one_active_per_client_day unique index —
      // fall back to the session the concurrent request created.
      if (pgErrorCode(err) !== "23505") throw err;
      const [winner] = await db
        .select()
        .from(workoutSessionsTable)
        .where(
          and(
            eq(workoutSessionsTable.clientId, clientId),
            eq(workoutSessionsTable.planDayId, planDayId),
            eq(workoutSessionsTable.isCompleted, false),
          ),
        )
        .orderBy(desc(workoutSessionsTable.createdAt))
        .limit(1);
      if (!winner) throw err;
      session = winner;
    }
  }

  const logs = await db
    .select()
    .from(exerciseExecutionLogsTable)
    .where(eq(exerciseExecutionLogsTable.sessionId, session.id));

  // ── Previous completed results per plan exercise (clientId + exerciseId) ──
  const dayExercises = await db
    .select({
      planExerciseId: workoutPlanExercisesTable.id,
      exerciseId: workoutPlanExercisesTable.exerciseId,
      workingSets: workoutPlanExercisesTable.workingSets,
      repRangeMin: workoutPlanExercisesTable.repRangeMin,
      repRangeMax: workoutPlanExercisesTable.repRangeMax,
      repsExact: workoutPlanExercisesTable.repsExact,
      rir: workoutPlanExercisesTable.rir,
    })
    .from(workoutPlanExercisesTable)
    .where(eq(workoutPlanExercisesTable.dayId, planDayId));

  const exerciseIds = [...new Set(dayExercises.map((e) => e.exerciseId))];

  type PrevResult = {
    weightKg: string | null;
    repsCompleted: number | null;
    setsCompleted: number | null;
    rir: number | null;
    completedAt: string | null;
    suggestion: ProgressionSuggestion | null;
  };
  const previous: Record<number, PrevResult> = {};

  if (exerciseIds.length > 0) {
    // All completed logs of this client for these exercises, newest session first.
    const prevRows = await db
      .select({
        exerciseId: exerciseExecutionLogsTable.exerciseId,
        setsCompleted: exerciseExecutionLogsTable.setsCompleted,
        repsCompleted: exerciseExecutionLogsTable.repsCompleted,
        weightKg: exerciseExecutionLogsTable.weightKg,
        rir: exerciseExecutionLogsTable.rir,
        plannedSets: exerciseExecutionLogsTable.plannedSets,
        plannedRepMin: exerciseExecutionLogsTable.plannedRepMin,
        plannedRepMax: exerciseExecutionLogsTable.plannedRepMax,
        plannedRir: exerciseExecutionLogsTable.plannedRir,
        hadPain: workoutSessionsTable.hadPain,
        completedAt: workoutSessionsTable.completedAt,
        sessionId: workoutSessionsTable.id,
      })
      .from(exerciseExecutionLogsTable)
      .innerJoin(workoutSessionsTable, eq(exerciseExecutionLogsTable.sessionId, workoutSessionsTable.id))
      .where(
        and(
          eq(workoutSessionsTable.clientId, clientId),
          eq(workoutSessionsTable.isCompleted, true),
          // Only exercises the client actually finished count as a
          // "previous result" — an unchecked log with typed-in numbers
          // must never prefill or drive a progression suggestion.
          eq(exerciseExecutionLogsTable.isCompleted, true),
          inArray(exerciseExecutionLogsTable.exerciseId, exerciseIds),
        ),
      )
      .orderBy(desc(workoutSessionsTable.completedAt));

    // Exclude the session being opened (safety: it is active, but be explicit).
    const newestByExercise = new Map<number, (typeof prevRows)[number]>();
    for (const row of prevRows) {
      if (row.sessionId === session.id || row.exerciseId == null) continue;
      if (!newestByExercise.has(row.exerciseId)) newestByExercise.set(row.exerciseId, row);
    }

    for (const ex of dayExercises) {
      const prev = newestByExercise.get(ex.exerciseId);
      if (!prev) continue;
      previous[ex.planExerciseId] = {
        weightKg: prev.weightKg,
        repsCompleted: prev.repsCompleted,
        setsCompleted: prev.setsCompleted,
        rir: prev.rir,
        completedAt: prev.completedAt?.toISOString() ?? null,
        suggestion: computeProgressionSuggestion({
          prevSetsCompleted: prev.setsCompleted,
          prevRepsCompleted: prev.repsCompleted,
          prevRir: prev.rir,
          // Prefer the snapshot the previous result was performed against;
          // fall back to the current prescription.
          plannedSets: prev.plannedSets ?? ex.workingSets,
          plannedRepMin: prev.plannedRepMin ?? ex.repRangeMin ?? ex.repsExact,
          plannedRepMax: prev.plannedRepMax ?? ex.repRangeMax ?? ex.repsExact,
          plannedRir: prev.plannedRir ?? ex.rir,
          hadPain: prev.hadPain,
        }),
      };
    }
  }

  res.json({ session: { ...session, logs }, previous });
});

// ─── GET /client-portal/history ──────────────────────────────────────────────
// Completed sessions of the authenticated client, newest first, paginated.
// Auth: requireClientAuth.

router.get("/client-portal/history", requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;
  const rawLimit = Number(req.query["limit"]);
  const rawOffset = Number(req.query["offset"]);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 12;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const sessions = await db
    .select({
      id: workoutSessionsTable.id,
      planId: workoutSessionsTable.planId,
      planDayId: workoutSessionsTable.planDayId,
      sessionDate: workoutSessionsTable.sessionDate,
      completedAt: workoutSessionsTable.completedAt,
      dayName: workoutPlanDaysTable.dayName,
      daySubtitle: workoutPlanDaysTable.subtitle,
      dayOrder: workoutPlanDaysTable.dayOrder,
      planTitle: workoutPlansTable.title,
    })
    .from(workoutSessionsTable)
    .leftJoin(workoutPlanDaysTable, eq(workoutSessionsTable.planDayId, workoutPlanDaysTable.id))
    .leftJoin(workoutPlansTable, eq(workoutSessionsTable.planId, workoutPlansTable.id))
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.isCompleted, true)))
    .orderBy(desc(workoutSessionsTable.completedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = sessions.length > limit;
  const page = hasMore ? sessions.slice(0, limit) : sessions;

  const sessionIds = page.map((s) => s.id);
  const logs =
    sessionIds.length > 0
      ? await db
          .select({
            sessionId: exerciseExecutionLogsTable.sessionId,
            isCompleted: exerciseExecutionLogsTable.isCompleted,
            setsCompleted: exerciseExecutionLogsTable.setsCompleted,
          })
          .from(exerciseExecutionLogsTable)
          .where(inArray(exerciseExecutionLogsTable.sessionId, sessionIds))
      : [];

  const items = page.map((s) => {
    const sLogs = logs.filter((l) => l.sessionId === s.id);
    const completedLogs = sLogs.filter((l) => l.isCompleted);
    return {
      ...s,
      completedExercises: completedLogs.length,
      completedSets: completedLogs.reduce((sum, l) => sum + (l.setsCompleted ?? 0), 0),
    };
  });

  res.json({ items, hasMore, offset, limit });
});

// ─── GET /client-portal/sessions/:sessionId ──────────────────────────────────
// Returns session details with all exercise execution logs.
// Auth: requireClientAuth — clientId from req.client.id, never from query.
// Ownership: session.clientId must equal req.client.id.

router.get("/client-portal/sessions/:sessionId", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const clientId = req.client!.id;
  if (!sessionId) {
    res.status(400).json({ error: "Nieprawidłowe parametry żądania." });
    return;
  }

  const session = await verifySessionOwnership(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  // Left-join current plan exercise + exercise name; snapshots keep history
  // readable when the trainer has since edited or removed the plan exercise.
  const logRows = await db
    .select({
      log: exerciseExecutionLogsTable,
      currentName: exercisesTable.name,
      orderInDay: workoutPlanExercisesTable.orderInDay,
    })
    .from(exerciseExecutionLogsTable)
    .leftJoin(workoutPlanExercisesTable, eq(exerciseExecutionLogsTable.planExerciseId, workoutPlanExercisesTable.id))
    .leftJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
    .where(eq(exerciseExecutionLogsTable.sessionId, sessionId));

  const logs = logRows
    .sort((a, b) => (a.orderInDay ?? 999) - (b.orderInDay ?? 999))
    .map((r) => ({
      ...r.log,
      exerciseName: r.log.exerciseNameSnapshot ?? r.currentName ?? null,
    }));

  res.json({ ...session, logs });
});

// ─── PATCH /client-portal/sessions/:sessionId ────────────────────────────────
// Mark session complete or update session-level notes.
// Auth: requireClientAuth — clientId from req.client.id, never from body.
// Ownership: session.clientId must equal req.client.id.

router.patch("/client-portal/sessions/:sessionId", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const clientId = req.client!.id;
  const parsed = PatchSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { isCompleted, notes, difficultyRating, hadPain, energyLevel } = parsed.data;

  const existing = await verifySessionOwnership(sessionId, clientId);
  if (!existing) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }

  // Build a properly typed update object.
  type SessionUpdate = {
    updatedAt: Date;
    isCompleted?: boolean;
    completedAt?: Date | null;
    notes?: string | null;
    difficultyRating?: number | null;
    hadPain?: boolean | null;
    energyLevel?: string | null;
  };

  const patch: SessionUpdate = { updatedAt: new Date() };
  if (isCompleted !== undefined) {
    patch.isCompleted = isCompleted;
    patch.completedAt = isCompleted ? new Date() : null;
  }
  if (notes !== undefined) patch.notes = notes;
  if (difficultyRating !== undefined) patch.difficultyRating = difficultyRating;
  if (hadPain !== undefined) patch.hadPain = hadPain;
  if (energyLevel !== undefined) patch.energyLevel = energyLevel;

  try {
    const [updated] = await db
      .update(workoutSessionsTable)
      .set(patch)
      .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.clientId, clientId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
    res.json(updated);
  } catch (err: unknown) {
    // Un-completing while another active session exists for the same day
    // would violate the single-active-session invariant.
    if (pgErrorCode(err) === "23505") {
      res.status(409).json({ error: "Istnieje już aktywna sesja dla tego dnia treningowego." });
      return;
    }
    throw err;
  }
});

// ─── PUT /client-portal/sessions/:sessionId/exercises/:planExerciseId ────────
// Upsert an exercise execution log.
// Auth: requireClientAuth — clientId from req.client.id, never from body.
// Ownership: session.clientId must equal req.client.id before any write.

router.put(
  "/client-portal/sessions/:sessionId/exercises/:planExerciseId",
  requireClientAuth,
  async (req, res): Promise<void> => {
    const sessionId = Number(req.params["sessionId"]);
    const planExerciseId = Number(req.params["planExerciseId"]);
    const clientId = req.client!.id;
    const parsed = UpsertExerciseLogBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { setsCompleted, repsCompleted, weightKg, rir, note, isCompleted } = parsed.data;

    // Verify this session belongs to the authenticated client.
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
      // Snapshot the prescription at execution time so history stays readable
      // even if the trainer later edits or removes this plan exercise.
      const [prescription] = await db
        .select({
          exerciseId: workoutPlanExercisesTable.exerciseId,
          exerciseName: exercisesTable.name,
          workingSets: workoutPlanExercisesTable.workingSets,
          repRangeMin: workoutPlanExercisesTable.repRangeMin,
          repRangeMax: workoutPlanExercisesTable.repRangeMax,
          repsExact: workoutPlanExercisesTable.repsExact,
          rir: workoutPlanExercisesTable.rir,
        })
        .from(workoutPlanExercisesTable)
        .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
        .where(eq(workoutPlanExercisesTable.id, planExerciseId));

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
          exerciseId: prescription?.exerciseId ?? null,
          exerciseNameSnapshot: prescription?.exerciseName ?? null,
          plannedSets: prescription?.workingSets ?? null,
          plannedRepMin: prescription?.repRangeMin ?? prescription?.repsExact ?? null,
          plannedRepMax: prescription?.repRangeMax ?? prescription?.repsExact ?? null,
          plannedRir: prescription?.rir ?? null,
        })
        .returning();
      log = inserted;
    }

    res.json(log);
  },
);

// ─── GET /client-portal/sessions/:sessionId/warmup ───────────────────────────
// Returns RAMP warm-up blocks for the day associated with this session.
// Auth: requireClientAuth — clientId from req.client.id, never from query.
// Ownership: session.clientId must equal req.client.id.

router.get("/client-portal/sessions/:sessionId/warmup", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const clientId = req.client!.id;
  if (!sessionId) {
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
// Trainer-facing: list sessions for a client belonging to the authenticated trainer.
// Auth: requireAuth (trainer Clerk session) + ownership check.

router.get("/clients/:clientId/workout-sessions", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId) { res.status(400).json({ error: "Nieprawidłowy clientId." }); return; }

  const ok = await verifyClientBelongsToTrainer(req, res, clientId);
  if (!ok) return;

  const sessions = await db
    .select({
      id: workoutSessionsTable.id,
      clientId: workoutSessionsTable.clientId,
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
// Trainer-facing: session detail for a client belonging to the authenticated trainer.
// Auth: requireAuth (trainer Clerk session) + ownership check.

router.get("/clients/:clientId/workout-sessions/:sessionId", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  const sessionId = Number(req.params["sessionId"]);
  if (!clientId || !sessionId) { res.status(400).json({ error: "Nieprawidłowe parametry." }); return; }

  const ok = await verifyClientBelongsToTrainer(req, res, clientId);
  if (!ok) return;

  const [session] = await db
    .select({
      id: workoutSessionsTable.id,
      clientId: workoutSessionsTable.clientId,
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
