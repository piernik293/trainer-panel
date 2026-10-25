/**
 * Daily steps entered by hand (blok 6, 25.10.2026).
 *  - client portal: GET/PUT /client-portal/steps, PUT /client-portal/steps-goal (client id only from the session);
 *  - trainer: GET /clients/:clientId/steps, PUT /clients/:clientId/steps-goal (client must belong to the trainer).
 * No integration with Apple Health / Google Health Connect (needs a native app — see docs/ROADMAP.md).
 */
import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, dailyStepsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { MAX_STEPS, MIN_GOAL, isEnterableDate, shiftDate, summarize, todayWarsaw } from "../services/steps";

const router: IRouter = Router();

const StepsBody = z.object({
  date: z.string().optional(),
  steps: z.number().int().min(0).max(MAX_STEPS),
});
const GoalBody = z.object({ goal: z.number().int().min(MIN_GOAL).max(MAX_STEPS).nullable() });

async function loadSummary(clientId: number) {
  const today = todayWarsaw();
  const [client] = await db.select({ goal: clientsTable.stepsGoal }).from(clientsTable).where(eq(clientsTable.id, clientId));
  const rows = await db.select({ day: dailyStepsTable.day, steps: dailyStepsTable.steps }).from(dailyStepsTable)
    .where(and(eq(dailyStepsTable.clientId, clientId), gte(dailyStepsTable.day, shiftDate(today, -6)), lte(dailyStepsTable.day, today)));
  return summarize(rows, client?.goal ?? null, today);
}

// ─── Client portal ────────────────────────────────────────────────────────────

router.get("/client-portal/steps", requireClientAuth, async (req, res): Promise<void> => {
  res.json(await loadSummary(req.client!.id));
});

router.put("/client-portal/steps", requireClientAuth, async (req, res): Promise<void> => {
  const body = StepsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Wpisz liczbę kroków od 0 do 100 000." }); return; }
  const today = todayWarsaw();
  const date = body.data.date ?? today;
  if (!isEnterableDate(date, today)) { res.status(400).json({ error: "Kroki można wpisać za dziś i ostatnie 6 dni." }); return; }
  await db.insert(dailyStepsTable).values({ clientId: req.client!.id, day: date, steps: body.data.steps })
    .onConflictDoUpdate({ target: [dailyStepsTable.clientId, dailyStepsTable.day], set: { steps: body.data.steps, updatedAt: new Date() } });
  res.json(await loadSummary(req.client!.id));
});

router.put("/client-portal/steps-goal", requireClientAuth, async (req, res): Promise<void> => {
  const body = GoalBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Cel kroków: liczba od 1 000 do 100 000 albo brak celu." }); return; }
  await db.update(clientsTable).set({ stepsGoal: body.data.goal }).where(eq(clientsTable.id, req.client!.id));
  res.json(await loadSummary(req.client!.id));
});

// ─── Trainer ──────────────────────────────────────────────────────────────────

async function ownClient(clientId: number, trainerId: number): Promise<boolean> {
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)));
  return !!c;
}

router.get("/clients/:clientId/steps", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0 || !(await ownClient(clientId, req.trainer!.id))) { res.status(404).json({ error: "Klient nie znaleziony" }); return; }
  res.json(await loadSummary(clientId));
});

router.put("/clients/:clientId/steps-goal", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0 || !(await ownClient(clientId, req.trainer!.id))) { res.status(404).json({ error: "Klient nie znaleziony" }); return; }
  const body = GoalBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Cel kroków: liczba od 1 000 do 100 000 albo brak celu." }); return; }
  await db.update(clientsTable).set({ stepsGoal: body.data.goal }).where(eq(clientsTable.id, clientId));
  res.json(await loadSummary(clientId));
});

export default router;
