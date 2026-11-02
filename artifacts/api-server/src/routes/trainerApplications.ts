/**
 * Wnioski o konto trenera (blok 6).
 *  Konto (sesja Clerk):  GET  /account/roles               { isTrainer, isClient, application }
 *                        POST /trainer-applications        „Prowadzę podopiecznych” — wniosek (jeden oczekujący; po odrzuceniu ponownie po 14 dniach)
 *  Administrator:        GET  /admin/trainer-applications  lista (?status=pending)
 *                        POST /admin/trainer-applications/:id/accept | reject
 *                        GET/PUT /admin/settings           { autoAccept } — przełącznik „przyjmuj automatycznie”, domyślnie WYŁĄCZONY
 * Akceptacja nadaje rolę trenera (rekord trainers); lista TRAINER_CLERK_IDS w .env zostaje jako lista awaryjna.
 * Tożsamość wnioskodawcy tylko z sesji Clerk. Maile (do właściciela i do wnioskodawcy) tylko jeśli skonfigurowano pocztę.
 */
import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, trainersTable, trainerApplicationsTable, appSettingsTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin, provisionTrainer, canBecomeTrainer } from "../middlewares/requireAuth";
import { ensureSoloClient, soloEnabled } from "../services/solo";
import { ensureSelfClient } from "../services/selfTraining";
import { mailApplicationAccepted, mailApplicationRejected, notifyOwnerNewApplication } from "../services/applicationMail";
import { AUTO_ACCEPT_KEY, REAPPLY_LATER_MESSAGE, canApplyNow, nextApplyAt } from "../services/trainerApplications";

const router: IRouter = Router();

const adminOnly = [requireAuth, (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
}];

async function autoAcceptOn(): Promise<boolean> {
  const [row] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, AUTO_ACCEPT_KEY));
  return row?.value === "on";
}

async function lastApplication(clerkUserId: string) {
  const [a] = await db.select().from(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, clerkUserId))
    .orderBy(desc(trainerApplicationsTable.createdAt), desc(trainerApplicationsTable.id)).limit(1);
  return a ?? null;
}

router.get("/account/roles", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const [t] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  const last = await lastApplication(userId);
  const until = last?.status === "rejected" && last.decidedAt ? nextApplyAt(last.decidedAt) : null;
  res.json({
    isTrainer: !!t, isClient: !!c,
    application: last ? { status: last.status, canApply: last.status === "rejected" ? canApplyNow(last.decidedAt) : false, applyAgainFrom: until && until.getTime() > Date.now() ? until : null } : null,
  });
});

/**
 * Dokąd skierować osobę po zalogowaniu — decyduje serwer, nie przeglądarka:
 *  panel   — konto trenera (także administrator),
 *  portal  — wszyscy pozostali: podopieczny trenera albo konto bez trenera (ekran „Połącz się z trenerem”),
 *  blocked — trener zablokowany przez administratora.
 * Samo wywołanie niczego nie tworzy (konto nie staje się trenerem bez akceptacji wniosku).
 */
router.get("/account/home", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const [t] = await db.select({ id: trainersTable.id, blockedAt: trainersTable.blockedAt }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  const [c] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  const isTrainer = !!t, isClient = !!c;
  // Konto zatwierdzone przez administratora (lista w .env / administrator), któremu panel dopiero utworzy profil trenera.
  if (!t && canBecomeTrainer(userId)) { res.json({ destination: "panel", isTrainer: false, isClient }); return; }
  if (t) {
    if (t.blockedAt && !checkIsAppAdmin(userId)) { res.json({ destination: "blocked", isTrainer, isClient }); return; }
    res.json({ destination: "panel", isTrainer, isClient });
    return;
  }
  // Każde konto jest od razu Solo (SOLO_ENABLED): osoba bez roli trenera i bez klienta dostaje konto Solo — nigdy trenera.
  if (!c && soloEnabled()) await ensureSoloClient(userId);
  res.json({ destination: "portal", isTrainer, isClient: isClient || (!c && soloEnabled()), linked: !!c && c.trainerId != null });
});

const ApplyBody = z.object({ note: z.string().trim().max(500).optional() });

async function grantTrainer(app: { id: number; clerkUserId: string; displayName: string | null; email: string | null }, decidedBy: string): Promise<void> {
  const trainer = await provisionTrainer(app.clerkUserId);
  if (trainer && (app.displayName || app.email)) {
    await db.update(trainersTable).set({ displayName: trainer.displayName ?? app.displayName, email: trainer.email ?? app.email }).where(eq(trainersTable.id, trainer.id));
  }
  if (trainer) await ensureSelfClient({ id: trainer.id, clerkUserId: trainer.clerkUserId, email: trainer.email ?? app.email });
  await db.update(trainerApplicationsTable).set({ status: "accepted", decidedAt: new Date(), decidedBy }).where(eq(trainerApplicationsTable.id, app.id));
  await mailApplicationAccepted(app.email);
}

router.post("/trainer-applications", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const body = ApplyBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Opis może mieć najwyżej 500 znaków." }); return; }
  const [t] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  if (t) { res.status(409).json({ error: "To konto ma już dostęp trenera.", code: "ALREADY_TRAINER" }); return; }
  const last = await lastApplication(userId);
  if (last?.status === "pending") { res.status(409).json({ error: "Twój wniosek czeka na rozpatrzenie.", code: "PENDING" }); return; }
  if (last?.status === "rejected" && !canApplyNow(last.decidedAt)) {
    const until = nextApplyAt(last.decidedAt!);
    res.status(409).json({ error: REAPPLY_LATER_MESSAGE(until), code: "REAPPLY_LATER", applyAgainFrom: until });
    return;
  }
  const [c] = await db.select({ firstName: clientsTable.firstName, email: clientsTable.email }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  // Imię i e-mail do podglądu wniosku w panelu administratora: z wiersza klienta albo z konta (Clerk); brak = puste, wniosek i tak się zapisuje.
  let displayName = c?.firstName ?? null, email = c?.email ?? null;
  if (!displayName || !email) {
    try {
      const u = await clerkClient.users.getUser(userId);
      displayName = displayName ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || null);
      email = email ?? u.primaryEmailAddress?.emailAddress ?? null;
    } catch { /* bez danych z konta */ }
  }
  const [created] = await db.insert(trainerApplicationsTable).values({ clerkUserId: userId, displayName, email, note: body.data.note ?? null })
    .onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "Twój wniosek czeka na rozpatrzenie.", code: "PENDING" }); return; }
  if (await autoAcceptOn()) {
    await grantTrainer(created, "auto");
    res.status(201).json({ status: "accepted" });
    return;
  }
  await notifyOwnerNewApplication({ name: displayName, email, note: body.data.note ?? null });
  res.status(201).json({ status: "pending" });
});

// ─── Administrator ───────────────────────────────────────────────────────────

router.get("/admin/trainer-applications", ...adminOnly, async (req, res): Promise<void> => {
  const status = req.query["status"] === "pending" ? "pending" : null;
  const rows = await db.select().from(trainerApplicationsTable).where(status ? eq(trainerApplicationsTable.status, status) : undefined)
    .orderBy(desc(trainerApplicationsTable.createdAt)).limit(100);
  res.json({ applications: rows.map((a) => ({ id: a.id, name: a.displayName, email: a.email, note: a.note, status: a.status, createdAt: a.createdAt, decidedAt: a.decidedAt })) });
});

async function decide(req: import("express").Request, res: import("express").Response, accept: boolean): Promise<void> {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowy wniosek." }); return; }
  const [a] = await db.select().from(trainerApplicationsTable).where(and(eq(trainerApplicationsTable.id, id), eq(trainerApplicationsTable.status, "pending")));
  if (!a) { res.status(404).json({ error: "Nie znaleziono oczekującego wniosku." }); return; }
  if (accept) await grantTrainer(a, req.clerkUserId!);
  else {
    await db.update(trainerApplicationsTable).set({ status: "rejected", decidedAt: new Date(), decidedBy: req.clerkUserId! }).where(eq(trainerApplicationsTable.id, id));
    await mailApplicationRejected(a.email);
  }
  res.json({ ok: true });
}
router.post("/admin/trainer-applications/:id/accept", ...adminOnly, (req, res) => decide(req, res, true));
router.post("/admin/trainer-applications/:id/reject", ...adminOnly, (req, res) => decide(req, res, false));

router.get("/admin/settings", ...adminOnly, async (_req, res): Promise<void> => { res.json({ autoAccept: await autoAcceptOn() }); });
router.put("/admin/settings", ...adminOnly, async (req, res): Promise<void> => {
  const body = z.object({ autoAccept: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  await db.insert(appSettingsTable).values({ key: AUTO_ACCEPT_KEY, value: body.data.autoAccept ? "on" : "off" })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: body.data.autoAccept ? "on" : "off", updatedAt: new Date() } });
  res.json({ autoAccept: body.data.autoAccept });
});

export default router;
