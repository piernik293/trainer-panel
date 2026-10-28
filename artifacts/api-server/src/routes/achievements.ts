/**
 * Osiągnięcia (docs/OSIAGNIECIA.md) — behind ACHIEVEMENTS_ENABLED (default OFF → 404 ACHIEVEMENTS_DISABLED; the status answers always).
 *  GET    /achievements/status                      { enabled }
 *  GET    /client-portal/achievements               own awards (newest first) + current streak in weeks (only a positive number, never a loss)
 *  POST   /client-portal/achievements/seen          marks all awards as seen
 *  GET    /client-portal/activity                   days with a completed training in the last 365 days (the "map of the year"; dates only)
 *  GET    /client-portal/pauses · POST · DELETE /:id   own holiday / illness periods (neutral weeks for the streak)
 *  GET    /clients/:clientId/pauses · POST · DELETE /:id   the same for the trainer's own client
 * No rankings, no comparisons between people: every query is scoped to one client.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, clientAchievementsTable, clientPausesTable, workoutSessionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { achievementsEnabled } from "../services/achievements";
import { evaluateAndStore } from "../services/achievementsStore";
import { shiftDate, todayWarsaw, isIsoDate } from "../services/steps";

const router: IRouter = Router();

const gate = (_req: Request, res: Response, next: NextFunction): void => {
  if (!achievementsEnabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "ACHIEVEMENTS_DISABLED" }); return; }
  next();
};

router.get("/achievements/status", (_req, res): void => { res.json({ enabled: achievementsEnabled() }); });

router.get("/client-portal/achievements", gate, requireClientAuth, async (req, res): Promise<void> => {
  const clientId = req.client!.id;
  const { streakWeeks } = await evaluateAndStore(clientId); // idempotent: stores only what is new
  const rows = await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, clientId)).orderBy(desc(clientAchievementsTable.earnedAt), desc(clientAchievementsTable.id));
  res.json({
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, earnedAt: r.earnedAt, seen: r.seenAt != null })),
    streakWeeks: streakWeeks > 0 ? streakWeeks : null,
  });
});

router.post("/client-portal/achievements/seen", gate, requireClientAuth, async (req, res): Promise<void> => {
  await db.update(clientAchievementsTable).set({ seenAt: new Date() }).where(and(eq(clientAchievementsTable.clientId, req.client!.id), isNull(clientAchievementsTable.seenAt)));
  res.json({ ok: true });
});

router.get("/client-portal/activity", gate, requireClientAuth, async (req, res): Promise<void> => {
  const since = shiftDate(todayWarsaw(), -365);
  const rows = await db.select({ d: workoutSessionsTable.sessionDate }).from(workoutSessionsTable).where(and(
    eq(workoutSessionsTable.clientId, req.client!.id),
    or(eq(workoutSessionsTable.status, "completed"), and(isNull(workoutSessionsTable.status), eq(workoutSessionsTable.isCompleted, true))),
    gte(workoutSessionsTable.sessionDate, since),
  ));
  res.json({ days: [...new Set(rows.map((r) => String(r.d)))].sort() });
});

// ─── Pauses ───────────────────────────────────────────────────────────────────

const PauseBody = z.object({
  startDate: z.string().refine(isIsoDate, "Nieprawidłowa data."),
  endDate: z.string().refine(isIsoDate, "Nieprawidłowa data."),
  reason: z.enum(["urlop", "choroba", "inne"]),
});
const MAX_DAYS = { client: 28, trainer: 120 } as const;
const MAX_BACK_DAYS = 14;
const lengthDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

async function createPause(clientId: number, by: "client" | "trainer", body: unknown, res: Response): Promise<void> {
  const p = PauseBody.safeParse(body);
  if (!p.success) { res.status(400).json({ error: "Podaj daty od–do w formacie RRRR-MM-DD i powód." }); return; }
  const { startDate, endDate, reason } = p.data;
  if (endDate < startDate) { res.status(400).json({ error: "Data końca nie może być przed początkiem." }); return; }
  if (lengthDays(startDate, endDate) > MAX_DAYS[by]) { res.status(400).json({ error: `Przerwa może trwać najwyżej ${MAX_DAYS[by]} dni.` }); return; }
  if (by === "client" && startDate < shiftDate(todayWarsaw(), -MAX_BACK_DAYS)) { res.status(400).json({ error: "Przerwę można zgłosić najwyżej 14 dni wstecz." }); return; }
  const [row] = await db.insert(clientPausesTable).values({ clientId, startDate, endDate, reason, setBy: by }).returning();
  res.status(201).json({ id: row!.id, startDate, endDate, reason, setBy: by });
}
const listPauses = async (clientId: number) =>
  (await db.select().from(clientPausesTable).where(eq(clientPausesTable.clientId, clientId)).orderBy(desc(clientPausesTable.startDate)))
    .map((r) => ({ id: r.id, startDate: String(r.startDate), endDate: String(r.endDate), reason: r.reason, setBy: r.setBy }));

router.get("/client-portal/pauses", gate, requireClientAuth, async (req, res): Promise<void> => { res.json({ items: await listPauses(req.client!.id) }); });
router.post("/client-portal/pauses", gate, requireClientAuth, async (req, res): Promise<void> => { await createPause(req.client!.id, "client", req.body, res); });
router.delete("/client-portal/pauses/:id", gate, requireClientAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const gone = await db.delete(clientPausesTable).where(and(eq(clientPausesTable.id, id), eq(clientPausesTable.clientId, req.client!.id))).returning({ id: clientPausesTable.id });
  if (gone.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

async function ownClient(req: Request, res: Response): Promise<number | null> {
  const clientId = Number(req.params["clientId"]);
  if (!clientId) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return null; }
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return null; }
  return clientId;
}
router.get("/clients/:clientId/pauses", gate, requireAuth, async (req, res): Promise<void> => {
  const id = await ownClient(req, res); if (id == null) return;
  res.json({ items: await listPauses(id) });
});
router.post("/clients/:clientId/pauses", gate, requireAuth, async (req, res): Promise<void> => {
  const id = await ownClient(req, res); if (id == null) return;
  await createPause(id, "trainer", req.body, res);
});
router.delete("/clients/:clientId/pauses/:id", gate, requireAuth, async (req, res): Promise<void> => {
  const clientId = await ownClient(req, res); if (clientId == null) return;
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const gone = await db.delete(clientPausesTable).where(and(eq(clientPausesTable.id, id), eq(clientPausesTable.clientId, clientId))).returning({ id: clientPausesTable.id });
  if (gone.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

export default router;
