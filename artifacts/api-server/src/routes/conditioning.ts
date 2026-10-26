/**
 * Moduł kondycyjny (blok 12) — WSZYSTKIE trasy za CONDITIONING_ENABLED (domyślnie wyłączone → 404 CONDITIONING_DISABLED).
 *  trener:  GET  /conditioning/rules                              słownik cel × element
 *           PUT  /conditioning/rules/:id                          zmiana wpisu słownika (tylko administrator aplikacji)
 *           GET  /clients/:clientId/conditioning/options          metody i sprzęt dla poziomu klienta i jego bólu
 *           POST /clients/:clientId/plans/:planId/conditioning-days   dodaje dzień kondycyjny do planu
 *           GET  /clients/:clientId/conditioning/logs             wykonane jednostki i check-iny
 *  klient:  GET  /client-portal/conditioning                      dni kondycyjne aktywnego planu z opisem
 *           POST /client-portal/conditioning/log                  zapis jednostki (client_uuid → idempotentnie)
 *           POST /client-portal/conditioning/checkin              cotygodniowy check-in — tylko podopieczny trenera
 * Identyfikator klienta/trenera tylko z sesji lub z własności (klient musi należeć do trenera).
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import {
  db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable,
  planElementRulesTable, conditioningLogsTable, conditioningCheckinsTable,
} from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { resolveEffectiveLevel } from "../lib/effectiveLevel";
import { loadBlockedJoints } from "../services/jointExclusion";
import { todayWarsaw } from "../services/steps";
import {
  CONDITIONING_DISABLED_BODY, METHODS, allowedMethods, allowedTools, conditioningEnabled, prescribe, weekStartOf,
  type ConditioningMethod,
} from "../services/conditioning";

const router: IRouter = Router();

const gate = (_req: Request, res: Response, next: NextFunction): void => {
  if (!conditioningEnabled()) { res.status(404).json(CONDITIONING_DISABLED_BODY); return; }
  next();
};

const idParam = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function clientContext(clientId: number) {
  const [client] = await db.select({ override: clientsTable.experienceLevelOverride, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.id, clientId));
  const [survey] = await db.select({ level: surveysTable.experienceLevel, duration: surveysTable.trainingDuration, health: surveysTable.healthLimitations })
    .from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
  const level = resolveEffectiveLevel(survey?.level, survey?.duration, client?.override).effective;
  const blocked = await loadBlockedJoints(clientId, survey?.health);
  return { level, blocked, trainerId: client?.trainerId ?? null };
}

async function ownClient(req: Request, res: Response): Promise<number | null> {
  const clientId = idParam(req.params.clientId);
  if (!clientId) { res.status(400).json({ error: "Nieprawidłowy klient." }); return null; }
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return null; }
  return clientId;
}

// ─── Trener ──────────────────────────────────────────────────────────────────

router.get("/conditioning/rules", gate, requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(planElementRulesTable).orderBy(asc(planElementRulesTable.goal), asc(planElementRulesTable.element));
  res.json({ rules: rows });
});

const RuleBody = z.object({
  mode: z.enum(["wymagany", "opcjonalny", "brak"]),
  perWeekMin: z.number().int().min(0).max(7).nullable().optional(),
  perWeekMax: z.number().int().min(0).max(7).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});
router.put("/conditioning/rules/:id", gate, requireAuth, async (req, res): Promise<void> => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Brak uprawnień." }); return; }
  const id = idParam(req.params.id); const body = RuleBody.safeParse(req.body);
  if (!id || !body.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const [row] = await db.update(planElementRulesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(planElementRulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Nie znaleziono wpisu." }); return; }
  res.json(row);
});

router.get("/clients/:clientId/conditioning/options", gate, requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res); if (!clientId) return;
  const ctx = await clientContext(clientId);
  const methods = allowedMethods(ctx.level);
  res.json({
    level: ctx.level, blockedJoints: [...ctx.blocked],
    methods: methods.map((m) => ({ method: m, tools: allowedTools(ctx.level, m, ctx.blocked).map((t) => ({ id: t.id, label: t.label, place: t.place })) })),
  });
});

const DayBody = z.object({
  method: z.enum(METHODS as unknown as [ConditioningMethod, ...ConditioningMethod[]]),
  tool: z.string().max(40).nullable().optional(),
  week: z.number().int().min(1).max(52).default(1),
  dayName: z.string().trim().min(1).max(60).optional(),
});
router.post("/clients/:clientId/plans/:planId/conditioning-days", gate, requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res); if (!clientId) return;
  const planId = idParam(req.params.planId); const body = DayBody.safeParse(req.body);
  if (!planId || !body.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const [plan] = await db.select({ id: workoutPlansTable.id }).from(workoutPlansTable).where(and(eq(workoutPlansTable.id, planId), eq(workoutPlansTable.clientId, clientId)));
  if (!plan) { res.status(404).json({ error: "Plan nie znaleziony." }); return; }
  const ctx = await clientContext(clientId);
  const p = prescribe({ level: ctx.level, method: body.data.method, toolId: body.data.tool, week: body.data.week, blockedJoints: ctx.blocked });
  if (!p.ok) { res.status(422).json({ error: p.error, code: p.code }); return; }
  const existing = await db.select({ order: workoutPlanDaysTable.dayOrder }).from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, planId)).orderBy(desc(workoutPlanDaysTable.dayOrder)).limit(1);
  const [day] = await db.insert(workoutPlanDaysTable).values({
    planId, dayOrder: (existing[0]?.order ?? 0) + 1, dayName: body.data.dayName ?? `Kondycja — ${p.value.methodLabel}`,
    subtitle: p.value.toolLabel, estimatedDurationMinutes: p.value.weekPlan.totalMinutes,
    dayType: "kondycyjny", conditioning: { method: p.value.method, tool: p.value.tool, startWeek: body.data.week },
  }).returning();
  res.status(201).json({ day, prescription: p.value });
});

router.get("/clients/:clientId/conditioning/logs", gate, requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res); if (!clientId) return;
  const logs = await db.select().from(conditioningLogsTable).where(eq(conditioningLogsTable.clientId, clientId)).orderBy(desc(conditioningLogsTable.loggedOn), desc(conditioningLogsTable.id)).limit(60);
  const checkins = await db.select().from(conditioningCheckinsTable).where(eq(conditioningCheckinsTable.clientId, clientId)).orderBy(desc(conditioningCheckinsTable.weekStart)).limit(12);
  res.json({ logs, checkins });
});

// ─── Klient ──────────────────────────────────────────────────────────────────

router.get("/client-portal/conditioning", gate, requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;
  const days = await db.select({ id: workoutPlanDaysTable.id, name: workoutPlanDaysTable.dayName, cond: workoutPlanDaysTable.conditioning })
    .from(workoutPlanDaysTable).innerJoin(workoutPlansTable, eq(workoutPlansTable.id, workoutPlanDaysTable.planId))
    .where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active"), eq(workoutPlanDaysTable.dayType, "kondycyjny")))
    .orderBy(asc(workoutPlanDaysTable.dayOrder));
  const ctx = await clientContext(clientId);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const recent = await db.select({ id: conditioningLogsTable.id }).from(conditioningLogsTable).where(and(eq(conditioningLogsTable.clientId, clientId), gte(conditioningLogsTable.loggedOn, since)));
  const items = days.map((d) => {
    const c = (d.cond ?? {}) as { method?: ConditioningMethod; tool?: string | null; startWeek?: number };
    if (!c.method) return null;
    // ból zgłoszony po ułożeniu planu → narzędzie zamieniane na bezpieczne przy każdym odczycie
    const p = prescribe({ level: ctx.level, method: c.method, toolId: c.tool, week: c.startWeek ?? 1, blockedJoints: ctx.blocked });
    return p.ok ? { dayId: d.id, name: d.name, ...p.value } : { dayId: d.id, name: d.name, error: p.error };
  }).filter((x) => x !== null);
  res.json({ days: items, doneLast14Days: recent.length, checkinAllowed: ctx.trainerId != null });
});

const LogBody = z.object({
  clientUuid: z.string().uuid(),
  planDayId: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(METHODS as unknown as [ConditioningMethod, ...ConditioningMethod[]]),
  tool: z.string().max(40).nullable().optional(),
  minutes: z.number().int().min(1).max(300),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  talkTest: z.enum(["zdania", "pojedyncze_slowa", "wcale"]).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
router.post("/client-portal/conditioning/log", gate, requireClientAuth, async (req, res): Promise<void> => {
  const body = LogBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Uzupełnij czas (1–300 min) i formę treningu." }); return; }
  const clientId = req.client!.id; const d = body.data;
  if (d.planDayId) { // dzień musi należeć do planu tego klienta
    const [own] = await db.select({ id: workoutPlanDaysTable.id }).from(workoutPlanDaysTable).innerJoin(workoutPlansTable, eq(workoutPlansTable.id, workoutPlanDaysTable.planId))
      .where(and(eq(workoutPlanDaysTable.id, d.planDayId), eq(workoutPlansTable.clientId, clientId)));
    if (!own) { res.status(404).json({ error: "Nie znaleziono dnia." }); return; }
  }
  const inserted = await db.insert(conditioningLogsTable).values({
    clientUuid: d.clientUuid, clientId, planDayId: d.planDayId ?? null, loggedOn: d.date ?? todayWarsaw(),
    method: d.method, tool: d.tool ?? null, minutes: d.minutes, rpe: d.rpe ?? null, talkTest: d.talkTest ?? null, note: d.note ?? null,
  }).onConflictDoNothing({ target: conditioningLogsTable.clientUuid }).returning({ id: conditioningLogsTable.id });
  if (inserted.length === 0) {
    // ten sam client_uuid: tylko jeśli to wpis tego samego klienta — inaczej nie ujawniamy, że istnieje
    const [mine] = await db.select({ id: conditioningLogsTable.id }).from(conditioningLogsTable).where(and(eq(conditioningLogsTable.clientUuid, d.clientUuid), eq(conditioningLogsTable.clientId, clientId)));
    if (!mine) { res.status(409).json({ error: "Nie udało się zapisać. Spróbuj ponownie." }); return; }
    res.json({ id: mine.id, duplicate: true }); return;
  }
  res.status(201).json({ id: inserted[0]!.id, duplicate: false });
});

const CheckinBody = z.object({ felt: z.enum(["lekko", "w_sam_raz", "ciezko"]), note: z.string().trim().max(300).nullable().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
router.post("/client-portal/conditioning/checkin", gate, requireClientAuth, async (req, res): Promise<void> => {
  const body = CheckinBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Wybierz, jak było w tym tygodniu." }); return; }
  const clientId = req.client!.id;
  const ctx = await clientContext(clientId);
  // tygodniowy check-in tylko dla podopiecznego trenera — Solo go nie dostaje (nikt go nie czyta)
  if (ctx.trainerId == null) { res.status(403).json({ error: "Check-in jest dostępny tylko u trenera.", code: "NO_TRAINER" }); return; }
  const weekStart = weekStartOf(body.data.date ?? todayWarsaw());
  await db.insert(conditioningCheckinsTable).values({ clientId, weekStart, felt: body.data.felt, note: body.data.note ?? null })
    .onConflictDoUpdate({ target: [conditioningCheckinsTable.clientId, conditioningCheckinsTable.weekStart], set: { felt: body.data.felt, note: body.data.note ?? null } });
  res.json({ ok: true, weekStart });
});

export default router;
