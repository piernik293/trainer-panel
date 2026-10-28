/**
 * "Trening" flow (tor C): today's workout, per-set logging, pain reports, finish.
 *
 * Client routes (/client-portal/training/*) use requireClientAuth: the client id
 * is always req.client.id, never taken from the request. Writes carry a
 * client-generated UUID so the offline queue can retry without duplicating.
 * Trainer routes (/clients/:clientId/…) use requireAuth + ownership check.
 *
 * Aborted sessions are stored with is_completed = true and status = 'aborted':
 * the partial unique index ws_one_active_per_client_day (is_completed = false)
 * then never blocks the next attempt. Use `status` (not is_completed) to tell
 * completed from aborted; status NULL = session from the older per-exercise flow.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
  setLogsTable,
  painReportsTable,
  surveysTable,
  PAIN_AREAS,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { determineDayType, buildShortWarmup } from "../services/rampWarmup";
import { getCooldown } from "../services/cooldown";
import { WARMUP_ROLES } from "../lib/exerciseRoles";
import { isConservativeHealth } from "../services/jointExclusion";
import { estimateMinutes, formatAmount, isRollerDay, reportedJoints, selectCooldown, selectWarmup, type CatalogueWarmupItem } from "../services/warmupSelection";
import {
  weightStepFor, exerciseRoleFor, restFor, formatRest, recordGain, bestSet, compactHistory, nextDayIndex,
  startOfWeek, PL_WEEKDAYS, PAIN_MESSAGE, type PerformedSet,
} from "../services/training";

const router: IRouter = Router();

const uuidSchema = z.string().uuid();
const RATINGS = ["too_easy", "just_right", "too_hard"] as const;

const StartBody = z.object({ clientUuid: uuidSchema, planDayId: z.number().int().positive() });
const SetBody = z.object({
  clientUuid: uuidSchema,
  planExerciseId: z.number().int().positive(),
  setNumber: z.number().int().min(1).max(20),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(200).nullable().optional(),
  rir: z.number().int().min(0).max(4).nullable().optional(),
  skipped: z.boolean().optional(),
});
const PainBody = z.object({
  clientUuid: uuidSchema,
  planExerciseId: z.number().int().positive().nullable().optional(),
  area: z.enum(PAIN_AREAS),
  severity: z.number().int().min(1).max(5),
  description: z.string().max(500).nullable().optional(),
});
const FinishBody = z.object({
  status: z.enum(["completed", "aborted"]),
  rating: z.enum(RATINGS).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  endedAt: z.string().datetime().optional(),
});

const num = (v: string | number | null | undefined): number | null => (v == null ? null : Number(v));
const isUniqueViolation = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

// ─── Shared loaders ───────────────────────────────────────────────────────────

async function loadSession(sessionId: number, clientId: number) {
  const [s] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.clientId, clientId)));
  return s ?? null;
}

/** All performed (not skipped) sets of the client for the exercises, with their session. Optionally excluding one session. */
async function loadHistory(clientId: number, exerciseIds: number[], excludeSessionId?: number) {
  if (exerciseIds.length === 0) return [];
  const rows = await db
    .select({
      sessionId: setLogsTable.sessionId,
      exerciseId: setLogsTable.exerciseId,
      setNumber: setLogsTable.setNumber,
      weightKg: setLogsTable.weightKg,
      reps: setLogsTable.reps,
      rir: setLogsTable.rir,
      at: sql<Date>`coalesce(${workoutSessionsTable.endedAt}, ${workoutSessionsTable.startedAt}, ${workoutSessionsTable.createdAt})`,
    })
    .from(setLogsTable)
    .innerJoin(workoutSessionsTable, eq(setLogsTable.sessionId, workoutSessionsTable.id))
    .where(
      and(
        eq(workoutSessionsTable.clientId, clientId),
        inArray(setLogsTable.exerciseId, exerciseIds),
        eq(setLogsTable.skipped, false),
        excludeSessionId ? ne(setLogsTable.sessionId, excludeSessionId) : undefined,
      ),
    );
  const legacy = await db
    .select({
      sessionId: exerciseExecutionLogsTable.sessionId,
      exerciseId: exerciseExecutionLogsTable.exerciseId,
      setsCompleted: exerciseExecutionLogsTable.setsCompleted,
      weightKg: exerciseExecutionLogsTable.weightKg,
      reps: exerciseExecutionLogsTable.repsCompleted,
      rir: exerciseExecutionLogsTable.rir,
      at: sql<Date>`coalesce(${workoutSessionsTable.completedAt}, ${workoutSessionsTable.createdAt})`,
    })
    .from(exerciseExecutionLogsTable)
    .innerJoin(workoutSessionsTable, eq(exerciseExecutionLogsTable.sessionId, workoutSessionsTable.id))
    .where(
      and(
        eq(workoutSessionsTable.clientId, clientId),
        inArray(exerciseExecutionLogsTable.exerciseId, exerciseIds),
        excludeSessionId ? ne(exerciseExecutionLogsTable.sessionId, excludeSessionId) : undefined,
      ),
    );
  type H = { sessionId: number; exerciseId: number; setNumber: number; weightKg: number | null; reps: number | null; rir: number | null; at: number };
  const out: H[] = rows.map((r) => ({ sessionId: r.sessionId, exerciseId: r.exerciseId, setNumber: r.setNumber, weightKg: num(r.weightKg), reps: r.reps, rir: r.rir, at: new Date(r.at).getTime() }));
  for (const l of legacy) {
    if (l.exerciseId == null) continue;
    // Older flow stored one aggregate per exercise — expand to identical sets.
    const n = Math.max(1, l.setsCompleted ?? 1);
    for (let i = 1; i <= n; i++) {
      out.push({ sessionId: l.sessionId, exerciseId: l.exerciseId, setNumber: i, weightKg: num(l.weightKg), reps: l.reps, rir: l.rir, at: new Date(l.at).getTime() });
    }
  }
  return out;
}

function previousSetsFor(history: Awaited<ReturnType<typeof loadHistory>>, exerciseId: number) {
  const mine = history.filter((h) => h.exerciseId === exerciseId);
  if (mine.length === 0) return [];
  const latest = mine.reduce((a, b) => (b.at > a.at ? b : a));
  return mine
    .filter((h) => h.sessionId === latest.sessionId)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((h) => ({ setNumber: h.setNumber, weightKg: h.weightKg, reps: h.reps, rir: h.rir }));
}

const repsText = (e: { repType: string | null; repsExact: number | null; repRangeMin: number | null; repRangeMax: number | null; repTimeSeconds: number | null; repOpenInstruction: string | null }) => {
  if (e.repsExact != null) return String(e.repsExact);
  if (e.repRangeMin != null && e.repRangeMax != null) return e.repRangeMin === e.repRangeMax ? String(e.repRangeMin) : `${e.repRangeMin}–${e.repRangeMax}`;
  if (e.repTimeSeconds != null) return `${e.repTimeSeconds} s`;
  return e.repOpenInstruction ?? "";
};

/**
 * Warm-up and cool-down from the catalogue (services/warmupSelection.ts). When the catalogue has no such
 * exercises (an empty / test database) the static RAMP template is the fallback.
 */
async function buildWarmupAndCooldown(opts: { clientId: number; level: string | null; dayType: ReturnType<typeof determineDayType>; dayGroups: string[]; dayIndex: number; totalDays: number }) {
  const catalogue = (await db.select().from(exercisesTable).where(and(eq(exercisesTable.isActive, true), inArray(exercisesTable.role, [...WARMUP_ROLES])))) as unknown as CatalogueWarmupItem[];
  const [survey] = await db
    .select({ equipment: surveysTable.equipment, trainingLocation: surveysTable.trainingLocation, healthLimitations: surveysTable.healthLimitations, healthConsentStatus: surveysTable.healthConsentStatus })
    .from(surveysTable).where(eq(surveysTable.clientId, opts.clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
  const [setting] = await db.select({ breathing: clientsTable.breathingCooldown }).from(clientsTable).where(eq(clientsTable.id, opts.clientId));
  const since = new Date(Date.now() - 30 * 86_400_000);
  const pains = await db.select({ area: painReportsTable.area }).from(painReportsTable)
    .where(and(eq(painReportsTable.clientId, opts.clientId), gte(painReportsTable.createdAt, since)));
  const ctx = {
    dayGroups: opts.dayGroups, level: opts.level,
    painAreas: reportedJoints(survey?.healthLimitations, pains.map((p) => p.area)),
    conservative: isConservativeHealth(survey?.healthConsentStatus),
    trainingLocation: survey?.trainingLocation ?? null, equipmentText: survey?.equipment ?? null,
    breathing: setting?.breathing === true, rollerAllowed: isRollerDay(opts.dayIndex, opts.totalDays),
  };
  const toItem = (it: CatalogueWarmupItem) => ({ name: it.name, detail: formatAmount(it), description: it.executionInstructions ?? "", joints: it.jointStressAreas ?? [] });
  const w = selectWarmup(catalogue, ctx);
  const c = selectCooldown(catalogue, ctx);
  if (w.length === 0 && c.length === 0) {
    const fallback = buildShortWarmup(opts.dayType, opts.level);
    return { warmup: fallback.items, warmupMinutes: fallback.minutes, cooldown: getCooldown(opts.dayType), cooldownMinutes: 5 };
  }
  return {
    warmup: w.map(toItem), warmupMinutes: estimateMinutes(w),
    cooldown: c.map(toItem), cooldownMinutes: estimateMinutes(c),
  };
}

// ─── GET /client-portal/training/today ────────────────────────────────────────

router.get("/client-portal/training/today", requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;
  const [client] = await db
    .select({ firstName: clientsTable.firstName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  const [plan] = await db
    .select({ id: workoutPlansTable.id, title: workoutPlansTable.title, level: workoutPlansTable.experienceLevelUsed })
    .from(workoutPlansTable)
    .where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")))
    .orderBy(desc(workoutPlansTable.activatedAt))
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Brak aktywnego planu treningowego. Trener jeszcze nie aktywował Twojego planu." });
    return;
  }

  const days = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, plan.id))
    .orderBy(asc(workoutPlanDaysTable.dayOrder));
  const dayIds = days.map((d) => d.id);

  const sessions = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.planId, plan.id)))
    .orderBy(desc(workoutSessionsTable.createdAt));

  const now = new Date();
  const weekStart = startOfWeek(now);
  const doneSessions = sessions.filter((s) => s.status === "completed" || (s.status == null && s.isCompleted));
  const lastDone = doneSessions.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))[0] ?? null;
  const inProgress = sessions.find((s) => s.status === "in_progress") ?? null;
  const todayKey = now.toDateString();
  const doneToday = lastDone?.completedAt != null && lastDone.completedAt.toDateString() === todayKey;
  const weekCount = doneSessions.filter((s) => (s.completedAt ?? s.createdAt) >= weekStart).length;

  const lastDayIdx = nextDayIndex(dayIds, lastDone?.planDayId ?? null);
  const targetDay = inProgress ? days.find((d) => d.id === inProgress.planDayId) : days[lastDayIdx];

  const base = {
    client: { firstName: client?.firstName ?? "" },
    plan: { id: plan.id, title: plan.title },
    week: { done: weekCount, target: days.length },
    lastSession: lastDone
      ? { id: lastDone.id, completedAt: lastDone.completedAt, dayName: days.find((d) => d.id === lastDone.planDayId)?.dayName ?? null }
      : null,
  };
  if (!targetDay) { res.json({ ...base, today: null, next: null }); return; }

  const exRows = await db
    .select({
      id: workoutPlanExercisesTable.id,
      exerciseId: workoutPlanExercisesTable.exerciseId,
      name: exercisesTable.name,
      mainMuscleGroup: exercisesTable.mainMuscleGroup,
      exerciseType: exercisesTable.exerciseType,
      equipment: exercisesTable.equipment,
      executionInstructions: exercisesTable.executionInstructions,
      coachingTips: exercisesTable.coachingTips,
      videoUrl: exercisesTable.videoUrl,
      imageUrl: exercisesTable.imageUrl,
      orderInDay: workoutPlanExercisesTable.orderInDay,
      workingSets: workoutPlanExercisesTable.workingSets,
      repType: workoutPlanExercisesTable.repType,
      repsExact: workoutPlanExercisesTable.repsExact,
      repRangeMin: workoutPlanExercisesTable.repRangeMin,
      repRangeMax: workoutPlanExercisesTable.repRangeMax,
      repTimeSeconds: workoutPlanExercisesTable.repTimeSeconds,
      repOpenInstruction: workoutPlanExercisesTable.repOpenInstruction,
      loadInstruction: workoutPlanExercisesTable.loadInstruction,
      rir: workoutPlanExercisesTable.rir,
      restSeconds: workoutPlanExercisesTable.restSeconds,
      clientInstructions: workoutPlanExercisesTable.clientInstructions,
    })
    .from(workoutPlanExercisesTable)
    .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
    .where(eq(workoutPlanExercisesTable.dayId, targetDay.id))
    .orderBy(asc(workoutPlanExercisesTable.orderInDay));

  const exerciseIds = exRows.map((e) => e.exerciseId);
  const history = await loadHistory(clientId, exerciseIds, inProgress?.id);
  const exercises = exRows.map((e) => {
    const step = weightStepFor(e.equipment);
    const role = exerciseRoleFor(e.exerciseType, e.repRangeMax ?? e.repsExact);
    const rest = restFor({ level: plan.level, role, sessionMinutes: targetDay.estimatedDurationMinutes, trainerRestSeconds: e.restSeconds });
    const hist: PerformedSet[] = history.filter((h) => h.exerciseId === e.exerciseId);
    const best = bestSet(hist);
    return {
      planExerciseId: e.id,
      exerciseId: e.exerciseId,
      name: e.name,
      muscleGroup: e.mainMuscleGroup,
      equipment: e.equipment,
      sets: e.workingSets,
      reps: repsText(e),
      repMin: e.repRangeMin ?? e.repsExact ?? null,
      repMax: e.repRangeMax ?? e.repsExact ?? null,
      rir: e.rir,
      restText: formatRest(rest),
      restSource: rest.source,
      weightStepKg: step.stepKg,
      showWeight: step.showWeight,
      howTo: e.executionInstructions ?? e.coachingTips ?? null,
      note: e.clientInstructions ?? e.loadInstruction ?? null,
      videoUrl: e.videoUrl,
      imageUrl: e.imageUrl,
      previous: previousSetsFor(history, e.exerciseId),
      record: best ? { weightKg: best.weightKg, reps: best.reps } : null,
      history: compactHistory(hist),
    };
  });

  const dayType = determineDayType(exRows.map((e) => e.mainMuscleGroup));
  const { warmup, warmupMinutes, cooldown, cooldownMinutes } = await buildWarmupAndCooldown({
    clientId, level: plan.level, dayType, dayGroups: [...new Set(exRows.map((e) => e.mainMuscleGroup))],
    dayIndex: days.findIndex((d) => d.id === targetDay.id), totalDays: days.length,
  });
  const equipment = [...new Set(exRows.flatMap((e) => e.equipment))].filter((x) => !["Masa własnego ciała", "Brak sprzętu"].includes(x));

  let active: { id: number; sets: unknown[]; pain: unknown[] } | null = null;
  if (inProgress) {
    const sets = await db.select().from(setLogsTable).where(eq(setLogsTable.sessionId, inProgress.id));
    const pain = await db.select({ id: painReportsTable.id, exerciseId: painReportsTable.exerciseId }).from(painReportsTable).where(eq(painReportsTable.sessionId, inProgress.id));
    active = {
      id: inProgress.id,
      sets: sets.map((s) => ({ planExerciseId: s.planExerciseId, exerciseId: s.exerciseId, setNumber: s.setNumber, weightKg: num(s.weightKg), reps: s.reps, rir: s.rir, skipped: s.skipped })),
      pain,
    };
  }

  const day = {
    planDayId: targetDay.id,
    weekday: PL_WEEKDAYS[now.getDay()],
    position: { index: days.findIndex((d) => d.id === targetDay.id) + 1, total: days.length },
    name: targetDay.dayName ?? targetDay.subtitle ?? `Dzień ${targetDay.dayOrder}`,
    estimatedMinutes: targetDay.estimatedDurationMinutes,
    exerciseCount: exercises.length,
    equipment,
    trainerNote: targetDay.description,
    exercises,
    warmup,
    warmupMinutes,
    cooldownMinutes,
    cooldown,
    activeSession: active,
  };

  if (doneToday && !inProgress) {
    res.json({ ...base, today: null, next: { ...day, activeSession: null } });
    return;
  }
  res.json({ ...base, today: day, next: null });
});

// ─── POST /client-portal/training/sessions ────────────────────────────────────

router.post("/client-portal/training/sessions", requireClientAuth, async (req, res): Promise<void> => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const clientId = req.client!.id;
  const { clientUuid, planDayId } = parsed.data;

  const [same] = await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.clientUuid, clientUuid));
  if (same) {
    if (same.clientId !== clientId) { res.status(409).json({ error: "Konflikt identyfikatora." }); return; }
    res.json({ id: same.id, status: same.status });
    return;
  }

  const [day] = await db
    .select({ id: workoutPlanDaysTable.id, planId: workoutPlanDaysTable.planId, trainerId: clientsTable.trainerId })
    .from(workoutPlanDaysTable)
    .innerJoin(workoutPlansTable, eq(workoutPlanDaysTable.planId, workoutPlansTable.id))
    .innerJoin(clientsTable, eq(workoutPlansTable.clientId, clientsTable.id))
    .where(and(eq(workoutPlanDaysTable.id, planDayId), eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")));
  if (!day) { res.status(404).json({ error: "Dzień planu nie znaleziony." }); return; }

  const [active] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.planDayId, planDayId), eq(workoutSessionsTable.isCompleted, false)));
  if (active) { res.json({ id: active.id, status: active.status ?? "in_progress" }); return; }

  const now = new Date();
  try {
    const [row] = await db
      .insert(workoutSessionsTable)
      .values({
        clientId, planId: day.planId, planDayId, sessionDate: now.toISOString().slice(0, 10),
        trainerId: day.trainerId, startedAt: now, status: "in_progress", clientUuid,
      })
      .returning({ id: workoutSessionsTable.id, status: workoutSessionsTable.status });
    res.status(201).json(row);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const [again] = await db.select().from(workoutSessionsTable).where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.planDayId, planDayId), eq(workoutSessionsTable.isCompleted, false)));
    if (!again) throw e;
    res.json({ id: again.id, status: again.status ?? "in_progress" });
  }
});

// ─── PUT /client-portal/training/sessions/:id/sets ────────────────────────────

router.put("/client-portal/training/sessions/:sessionId/sets", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const parsed = SetBody.safeParse(req.body);
  if (!sessionId || !parsed.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const clientId = req.client!.id;
  const session = await loadSession(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  if (session.status !== "in_progress") { res.status(409).json({ error: "Ten trening jest już zakończony." }); return; }
  const b = parsed.data;

  const [pe] = await db
    .select({ id: workoutPlanExercisesTable.id, exerciseId: workoutPlanExercisesTable.exerciseId, name: exercisesTable.name })
    .from(workoutPlanExercisesTable)
    .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
    .where(and(eq(workoutPlanExercisesTable.id, b.planExerciseId), eq(workoutPlanExercisesTable.dayId, session.planDayId)));
  if (!pe) { res.status(403).json({ error: "Ćwiczenie nie należy do tego dnia treningowego." }); return; }

  const [byUuid] = await db.select().from(setLogsTable).where(eq(setLogsTable.clientUuid, b.clientUuid));
  if (byUuid) {
    if (byUuid.sessionId !== sessionId) { res.status(409).json({ error: "Konflikt identyfikatora." }); return; }
    res.json({ id: byUuid.id, duplicate: true });
    return;
  }

  const values = {
    planExerciseId: pe.id, exerciseNameSnapshot: pe.name,
    weightKg: b.weightKg == null ? null : String(b.weightKg), reps: b.reps ?? null, rir: b.rir ?? null,
    skipped: b.skipped ?? false, clientUuid: b.clientUuid, updatedAt: new Date(),
  };
  // One row per (session, exercise, set number): a correction replaces the earlier entry.
  const [row] = await db
    .insert(setLogsTable)
    .values({ sessionId, exerciseId: pe.exerciseId, setNumber: b.setNumber, ...values })
    .onConflictDoUpdate({ target: [setLogsTable.sessionId, setLogsTable.exerciseId, setLogsTable.setNumber], set: values })
    .returning({ id: setLogsTable.id });
  res.json({ id: row!.id, duplicate: false });
});

// ─── POST /client-portal/training/sessions/:id/pain ───────────────────────────

router.post("/client-portal/training/sessions/:sessionId/pain", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const parsed = PainBody.safeParse(req.body);
  if (!sessionId || !parsed.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const clientId = req.client!.id;
  const session = await loadSession(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  const b = parsed.data;

  const [dup] = await db.select().from(painReportsTable).where(eq(painReportsTable.clientUuid, b.clientUuid));
  if (dup) {
    if (dup.sessionId !== sessionId) { res.status(409).json({ error: "Konflikt identyfikatora." }); return; }
    res.json({ id: dup.id, duplicate: true, message: PAIN_MESSAGE });
    return;
  }

  let exerciseId: number | null = null;
  let name: string | null = null;
  let plannedSets = 0;
  if (b.planExerciseId) {
    const [pe] = await db
      .select({ exerciseId: workoutPlanExercisesTable.exerciseId, name: exercisesTable.name, sets: workoutPlanExercisesTable.workingSets })
      .from(workoutPlanExercisesTable)
      .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
      .where(and(eq(workoutPlanExercisesTable.id, b.planExerciseId), eq(workoutPlanExercisesTable.dayId, session.planDayId)));
    if (!pe) { res.status(403).json({ error: "Ćwiczenie nie należy do tego dnia treningowego." }); return; }
    exerciseId = pe.exerciseId; name = pe.name; plannedSets = pe.sets;
  }

  const description = b.description?.trim() ? b.description.trim() : null;
  const id = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(painReportsTable)
      .values({ sessionId, clientId, exerciseId, exerciseNameSnapshot: name, area: b.area, severity: b.severity, description, clientUuid: b.clientUuid })
      .returning({ id: painReportsTable.id });
    // The exercise is skipped: every set without a result becomes a skipped row.
    if (exerciseId != null && b.planExerciseId && session.status === "in_progress") {
      for (let n = 1; n <= plannedSets; n++) {
        await tx
          .insert(setLogsTable)
          .values({ sessionId, planExerciseId: b.planExerciseId, exerciseId, exerciseNameSnapshot: name, setNumber: n, skipped: true, clientUuid: randomUUID() })
          .onConflictDoNothing();
      }
    }
    await tx.update(workoutSessionsTable).set({ hadPain: true, updatedAt: new Date() }).where(eq(workoutSessionsTable.id, sessionId));
    return r!.id;
  });
  res.status(201).json({ id, duplicate: false, message: PAIN_MESSAGE });
});

// ─── POST /client-portal/training/sessions/:id/finish ─────────────────────────

router.post("/client-portal/training/sessions/:sessionId/finish", requireClientAuth, async (req, res): Promise<void> => {
  const sessionId = Number(req.params["sessionId"]);
  const parsed = FinishBody.safeParse(req.body);
  if (!sessionId || !parsed.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const clientId = req.client!.id;
  const session = await loadSession(sessionId, clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  const b = parsed.data;

  if (session.status === "in_progress") {
    const ended = b.endedAt ? new Date(b.endedAt) : new Date();
    const safeEnd = ended.getTime() > Date.now() + 60_000 ? new Date() : ended;
    await db
      .update(workoutSessionsTable)
      .set({
        status: b.status, isCompleted: true, completedAt: safeEnd, endedAt: safeEnd,
        sessionRating: b.rating ?? null, notes: b.note?.trim() ? b.note.trim() : null, updatedAt: new Date(),
      })
      .where(eq(workoutSessionsTable.id, sessionId));
  }
  // Repeating the request (offline retry) returns the same summary.
  const fresh = (await loadSession(sessionId, clientId))!;

  const sets = await db.select().from(setLogsTable).where(and(eq(setLogsTable.sessionId, sessionId), eq(setLogsTable.skipped, false)));
  const history = await loadHistory(clientId, [...new Set(sets.map((s) => s.exerciseId))], sessionId);
  const records: { exerciseId: number; name: string | null; weightKg: number; reps: number; gainKg: number }[] = [];
  for (const exId of new Set(sets.map((s) => s.exerciseId))) {
    const past = history.filter((h) => h.exerciseId === exId);
    let top: (typeof records)[number] | null = null;
    for (const s of sets.filter((x) => x.exerciseId === exId)) {
      const gain = recordGain(past, { weightKg: num(s.weightKg), reps: s.reps });
      if (gain != null && (!top || gain > top.gainKg)) top = { exerciseId: exId, name: s.exerciseNameSnapshot, weightKg: num(s.weightKg)!, reps: s.reps!, gainKg: gain };
    }
    if (top && fresh.status === "completed") records.push(top);
  }

  const [days] = await db.select({ n: sql<number>`count(*)::int` }).from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, fresh.planId));
  const weekRows = await db
    .select({ id: workoutSessionsTable.id })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.status, "completed"), sql`${workoutSessionsTable.completedAt} >= ${startOfWeek(new Date())}`));

  const minutes = fresh.startedAt && fresh.endedAt ? Math.max(1, Math.round((fresh.endedAt.getTime() - fresh.startedAt.getTime()) / 60000)) : null;
  res.json({
    id: fresh.id, status: fresh.status, minutes, sets: sets.length,
    week: { done: weekRows.length, target: days?.n ?? 0 }, records,
  });
});

// ─── Trainer routes ───────────────────────────────────────────────────────────

async function ownClient(req: Request, res: Response): Promise<number | null> {
  const clientId = Number(req.params["clientId"]);
  if (!clientId) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return null; }
  const [c] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return null; }
  return clientId;
}

router.get("/clients/:clientId/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res);
  if (clientId == null) return;
  const rows = await db
    .select({
      id: workoutSessionsTable.id, status: workoutSessionsTable.status, isCompleted: workoutSessionsTable.isCompleted,
      date: workoutSessionsTable.sessionDate, startedAt: workoutSessionsTable.startedAt, endedAt: workoutSessionsTable.endedAt,
      completedAt: workoutSessionsTable.completedAt, rating: workoutSessionsTable.sessionRating, note: workoutSessionsTable.notes,
      dayName: workoutPlanDaysTable.dayName,
      sets: sql<number>`(select count(*)::int from set_logs sl where sl.session_id = ${workoutSessionsTable.id} and sl.skipped = false)`,
      pain: sql<number>`(select count(*)::int from pain_reports pr where pr.session_id = ${workoutSessionsTable.id})`,
    })
    .from(workoutSessionsTable)
    .leftJoin(workoutPlanDaysTable, eq(workoutSessionsTable.planDayId, workoutPlanDaysTable.id))
    .where(eq(workoutSessionsTable.clientId, clientId))
    .orderBy(desc(workoutSessionsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, legacy: r.status == null })));
});

router.get("/clients/:clientId/training-sessions/:sessionId", requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res);
  if (clientId == null) return;
  const session = await loadSession(Number(req.params["sessionId"]), clientId);
  if (!session) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  const sets = await db.select().from(setLogsTable).where(eq(setLogsTable.sessionId, session.id)).orderBy(asc(setLogsTable.exerciseId), asc(setLogsTable.setNumber));
  const pain = await db.select().from(painReportsTable).where(eq(painReportsTable.sessionId, session.id)).orderBy(asc(painReportsTable.createdAt));
  const legacyLogs = session.status == null
    ? await db.select().from(exerciseExecutionLogsTable).where(eq(exerciseExecutionLogsTable.sessionId, session.id))
    : [];
  res.json({
    session: { ...session, legacy: session.status == null },
    sets: sets.map((s) => ({ exerciseId: s.exerciseId, name: s.exerciseNameSnapshot, setNumber: s.setNumber, weightKg: num(s.weightKg), reps: s.reps, rir: s.rir, skipped: s.skipped })),
    pain,
    legacyLogs,
  });
});

router.get("/clients/:clientId/training-records", requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res);
  if (clientId == null) return;
  const rows = await db
    .select({ exerciseId: setLogsTable.exerciseId, name: setLogsTable.exerciseNameSnapshot, weightKg: setLogsTable.weightKg, reps: setLogsTable.reps, at: workoutSessionsTable.endedAt })
    .from(setLogsTable)
    .innerJoin(workoutSessionsTable, eq(setLogsTable.sessionId, workoutSessionsTable.id))
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.status, "completed"), eq(setLogsTable.skipped, false)));
  const byEx = new Map<number, { exerciseId: number; name: string | null; weightKg: number; reps: number; at: Date | null }>();
  for (const r of rows) {
    const w = num(r.weightKg);
    if (w == null || r.reps == null) continue;
    const cur = byEx.get(r.exerciseId);
    if (!cur || w > cur.weightKg || (w === cur.weightKg && r.reps > cur.reps)) byEx.set(r.exerciseId, { exerciseId: r.exerciseId, name: r.name, weightKg: w, reps: r.reps, at: r.at });
  }
  res.json([...byEx.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pl")));
});

router.get("/clients/:clientId/pain-reports", requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res);
  if (clientId == null) return;
  const rows = await db.select().from(painReportsTable).where(eq(painReportsTable.clientId, clientId)).orderBy(desc(painReportsTable.createdAt));
  res.json(rows);
});

router.patch("/clients/:clientId/pain-reports/:reportId/read", requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res);
  if (clientId == null) return;
  const reportId = Number(req.params["reportId"]);
  const [row] = await db
    .update(painReportsTable)
    .set({ readByTrainerAt: new Date() })
    .where(and(eq(painReportsTable.id, reportId), eq(painReportsTable.clientId, clientId), isNull(painReportsTable.readByTrainerAt)))
    .returning({ id: painReportsTable.id });
  if (!row) {
    const [exists] = await db.select({ id: painReportsTable.id }).from(painReportsTable).where(and(eq(painReportsTable.id, reportId), eq(painReportsTable.clientId, clientId)));
    if (!exists) { res.status(404).json({ error: "Zgłoszenie nie znalezione." }); return; }
  }
  res.json({ id: reportId, read: true });
});

export default router;
