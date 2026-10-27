/**
 * Panel administratora (blok 3). Dostęp: tylko konta z listy administratorów w .env (APP_ADMIN_CLERK_IDS); nikt nie nadaje sobie tej roli z aplikacji.
 *  GET  /admin/me                          { isAdmin } (dla dowolnego trenera — do pokazania menu)
 *  GET  /admin/errors, POST /admin/errors/:id/reviewed            dziennik błędów
 *  GET  /admin/trainers, PATCH /admin/trainers/:id/plan, POST /admin/trainers/:id/block   trenerzy
 *  GET  /admin/solo                        liczby i lista kont bez trenera (bez danych zdrowotnych)
 *  GET  /admin/subscriptions               pakiety, limity i zużycie
 *  POST /admin/access/client               szczegółowy wgląd w podopiecznego: wymaga powodu, zapis w dzienniku
 *  GET  /admin/access-log                  dziennik dostępu (tylko odczyt; baza blokuje zmiany i usuwanie)
 *  POST /client-errors                     zgłoszenia błędów z panelu i portalu (oczyszczane przed zapisem)
 * RODO: poza wglądem z powodem administrator widzi tylko liczby i statusy — nigdy bólu, wywiadu ani notatek.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db, trainersTable, clientsTable, trainerSubscriptionsTable, appErrorsTable, adminAccessLogTable,
  workoutSessionsTable, workoutPlansTable, exercisesTable, trainerGenerationSessionsTable, surveysTable, painReportsTable,
} from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { recordError } from "../services/errorLog";
import { SUBSCRIPTION_PLANS, getSubscriptionPeriod, type PlanCode } from "../services/subscriptionService";

const router: IRouter = Router();

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];
const idParam = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get("/admin/me", requireAuth, (req, res): void => { res.json({ isAdmin: checkIsAppAdmin(req.clerkUserId) }); });

// ─── Błędy ───────────────────────────────────────────────────────────────────

router.get("/admin/errors", ...admin, async (req, res): Promise<void> => {
  const status = req.query["status"] === "reviewed" ? "reviewed" : req.query["status"] === "new" ? "new" : null;
  const rows = await db.select().from(appErrorsTable).where(status ? eq(appErrorsTable.status, status) : undefined).orderBy(desc(appErrorsTable.lastSeen)).limit(200);
  res.json({ errors: rows.map((e) => ({ id: e.id, source: e.source, place: e.place, message: e.message, occurrences: e.occurrences, users: e.usersCount, status: e.status, firstSeen: e.firstSeen, lastSeen: e.lastSeen })) });
});

router.post("/admin/errors/:id/reviewed", ...admin, async (req, res): Promise<void> => {
  const id = idParam(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Nieprawidłowy błąd." }); return; }
  const r = await db.update(appErrorsTable).set({ status: "reviewed", reviewedAt: new Date() }).where(eq(appErrorsTable.id, id)).returning({ id: appErrorsTable.id });
  if (r.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

// Zgłoszenia z panelu i portalu: otwarte (błąd może wystąpić przed zalogowaniem), z własnym limitem i oczyszczaniem treści.
const reportHits = new Map<string, { n: number; reset: number }>();
const ClientErrorBody = z.object({ source: z.enum(["panel", "portal"]), place: z.string().max(300), message: z.string().max(2000) });
router.post("/client-errors", async (req, res): Promise<void> => {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const cur = reportHits.get(key);
  if (!cur || cur.reset <= now) reportHits.set(key, { n: 1, reset: now + 60_000 });
  else if (++cur.n > 20) { res.status(429).json({ error: "Za dużo zgłoszeń." }); return; }
  const body = ClientErrorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Nieprawidłowe zgłoszenie." }); return; }
  await recordError({ source: body.data.source, place: body.data.place, message: body.data.message, userKey: getAuth(req)?.userId ?? null });
  res.status(202).json({ ok: true });
});

// ─── Trenerzy ────────────────────────────────────────────────────────────────

router.get("/admin/trainers", ...admin, async (_req, res): Promise<void> => {
  const trainers = await db.select().from(trainersTable).orderBy(trainersTable.createdAt);
  const subs = await db.select({ trainerId: trainerSubscriptionsTable.trainerId, planCode: trainerSubscriptionsTable.planCode }).from(trainerSubscriptionsTable);
  const clientCounts = await db.select({ trainerId: clientsTable.trainerId, n: count() }).from(clientsTable).where(sql`${clientsTable.trainerId} is not null`).groupBy(clientsTable.trainerId);
  const sessions = await db.select({ trainerId: clientsTable.trainerId, last: max(workoutSessionsTable.completedAt) }).from(workoutSessionsTable)
    .innerJoin(clientsTable, eq(clientsTable.id, workoutSessionsTable.clientId)).where(sql`${clientsTable.trainerId} is not null`).groupBy(clientsTable.trainerId);
  const plans = await db.select({ trainerId: clientsTable.trainerId, last: max(workoutPlansTable.updatedAt) }).from(workoutPlansTable)
    .innerJoin(clientsTable, eq(clientsTable.id, workoutPlansTable.clientId)).where(sql`${clientsTable.trainerId} is not null`).groupBy(clientsTable.trainerId);
  const plan = new Map(subs.map((s) => [s.trainerId, s.planCode]));
  const nClients = new Map(clientCounts.map((c) => [c.trainerId, Number(c.n)]));
  const lastOf = (id: number): Date | null => {
    const a = sessions.find((s) => s.trainerId === id)?.last ?? null, b = plans.find((s) => s.trainerId === id)?.last ?? null;
    return a && b ? (a > b ? a : b) : (a ?? b);
  };
  res.json({
    trainers: trainers.map((t) => ({
      id: t.id, name: t.displayName, email: t.email, planCode: plan.get(t.id) ?? "FREE", clients: nClients.get(t.id) ?? 0,
      lastActivity: lastOf(t.id), createdAt: t.createdAt, blocked: t.blockedAt != null, isAdmin: checkIsAppAdmin(t.clerkUserId),
    })),
    howToAddTrainer: "Nowego trenera dopuszcza lista w pliku .env (TRAINER_CLERK_IDS): dopisz jego identyfikator Clerk po przecinku i uruchom ponownie serwer (scripts/stop-gcp.sh && scripts/dev-gcp.sh). Lista nie jest zmieniana z aplikacji.",
  });
});

router.patch("/admin/trainers/:id/plan", ...admin, async (req, res): Promise<void> => {
  const id = idParam(req.params["id"]);
  const body = z.object({ planCode: z.enum(["FREE", "PRO", "UNLIMITED"]) }).safeParse(req.body);
  if (!id || !body.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const [t] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.id, id));
  if (!t) { res.status(404).json({ error: "Nie znaleziono trenera." }); return; }
  await db.insert(trainerSubscriptionsTable).values({ trainerId: id, planCode: body.data.planCode, status: "active" })
    .onConflictDoUpdate({ target: trainerSubscriptionsTable.trainerId, set: { planCode: body.data.planCode, status: "active", updatedAt: new Date() } });
  res.json({ ok: true, planCode: body.data.planCode });
});

router.post("/admin/trainers/:id/block", ...admin, async (req, res): Promise<void> => {
  const id = idParam(req.params["id"]);
  // blokada wymaga potwierdzenia w treści żądania (panel pyta przed wysłaniem)
  const body = z.object({ blocked: z.boolean(), confirm: z.literal(true) }).safeParse(req.body);
  if (!id || !body.success) { res.status(400).json({ error: "Potwierdź operację." }); return; }
  const [t] = await db.select({ id: trainersTable.id, clerkUserId: trainersTable.clerkUserId }).from(trainersTable).where(eq(trainersTable.id, id));
  if (!t) { res.status(404).json({ error: "Nie znaleziono trenera." }); return; }
  if (checkIsAppAdmin(t.clerkUserId)) { res.status(409).json({ error: "Konta administratora nie można zablokować." }); return; }
  await db.update(trainersTable).set({ blockedAt: body.data.blocked ? new Date() : null }).where(eq(trainersTable.id, id));
  res.json({ ok: true, blocked: body.data.blocked });
});

// ─── Solo ────────────────────────────────────────────────────────────────────

router.get("/admin/solo", ...admin, async (_req, res): Promise<void> => {
  const rows = await db.select({ id: clientsTable.id, firstName: clientsTable.firstName, createdAt: clientsTable.createdAt })
    .from(clientsTable).where(and(isNull(clientsTable.trainerId), sql`${clientsTable.clerkUserId} is not null`)).orderBy(desc(clientsTable.createdAt)).limit(200);
  res.json({ total: rows.length, accounts: rows });
});

// ─── Abonamenty i limity ─────────────────────────────────────────────────────

router.get("/admin/subscriptions", ...admin, async (_req, res): Promise<void> => {
  const { periodStart } = getSubscriptionPeriod();
  const trainers = await db.select({ id: trainersTable.id, name: trainersTable.displayName, email: trainersTable.email }).from(trainersTable).orderBy(trainersTable.id);
  const subs = new Map((await db.select({ id: trainerSubscriptionsTable.trainerId, code: trainerSubscriptionsTable.planCode }).from(trainerSubscriptionsTable)).map((s) => [s.id, s.code]));
  const clients = new Map((await db.select({ id: clientsTable.trainerId, n: count() }).from(clientsTable).where(sql`${clientsTable.trainerId} is not null`).groupBy(clientsTable.trainerId)).map((c) => [c.id, Number(c.n)]));
  const customs = new Map((await db.select({ id: exercisesTable.createdByTrainerId, n: count() }).from(exercisesTable).where(sql`${exercisesTable.createdByTrainerId} is not null`).groupBy(exercisesTable.createdByTrainerId)).map((c) => [c.id, Number(c.n)]));
  const gens = new Map((await db.select({ id: trainerGenerationSessionsTable.trainerId, n: count() }).from(trainerGenerationSessionsTable).where(eq(trainerGenerationSessionsTable.periodStart, periodStart)).groupBy(trainerGenerationSessionsTable.trainerId)).map((c) => [c.id, Number(c.n)]));
  res.json({
    plans: Object.values(SUBSCRIPTION_PLANS).map((p) => ({ code: p.code, name: p.name, monthlyPricePln: p.monthlyPricePln, limits: p.limits })),
    usage: trainers.map((t) => {
      const code = ((subs.get(t.id) ?? "FREE") as PlanCode);
      return { trainerId: t.id, name: t.name, email: t.email, planCode: code, limits: SUBSCRIPTION_PLANS[code].limits,
        used: { clients: clients.get(t.id) ?? 0, customExercises: customs.get(t.id) ?? 0, planGenerations: gens.get(t.id) ?? 0 } };
    }),
  });
});

// ─── Wgląd z powodem + dziennik dostępu ──────────────────────────────────────

const AccessBody = z.object({ clientId: z.number().int().positive(), reason: z.string().trim().min(10, "Podaj powód (co najmniej 10 znaków).").max(300) });
router.post("/admin/access/client", ...admin, async (req, res): Promise<void> => {
  const body = AccessBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Podaj powód wglądu." }); return; }
  const [c] = await db.select({ id: clientsTable.id, firstName: clientsTable.firstName, trainerId: clientsTable.trainerId, status: clientsTable.status, createdAt: clientsTable.createdAt })
    .from(clientsTable).where(eq(clientsTable.id, body.data.clientId));
  if (!c) { res.status(404).json({ error: "Nie znaleziono osoby." }); return; }
  // wpis powstaje ZANIM dane zostaną pokazane
  await db.insert(adminAccessLogTable).values({ adminClerkId: req.clerkUserId!, action: "client_detail", targetClientId: c.id, reason: body.data.reason });
  const [survey] = await db.select({ health: surveysTable.healthLimitations, level: surveysTable.experienceLevel }).from(surveysTable).where(eq(surveysTable.clientId, c.id)).orderBy(desc(surveysTable.createdAt)).limit(1);
  const pain = await db.select({ area: painReportsTable.area, createdAt: painReportsTable.createdAt }).from(painReportsTable).where(eq(painReportsTable.clientId, c.id)).orderBy(desc(painReportsTable.createdAt)).limit(20);
  res.json({ client: c, level: survey?.level ?? null, healthDescription: survey?.health ?? null, painReports: pain });
});

router.get("/admin/access-log", ...admin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(adminAccessLogTable).orderBy(desc(adminAccessLogTable.createdAt)).limit(200);
  res.json({ entries: rows.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, clientId: r.targetClientId, reason: r.reason, admin: r.adminClerkId.slice(-6) })) });
});

export default router;
