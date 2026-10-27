/**
 * Link i kod trenera, prośby o dołączenie, odłączenie (blok 2).
 *
 *  publiczne:   GET  /join/:code                         sprawdza kod/link (zwraca tylko nazwę trenera); limit prób na IP
 *  zalogowany:  POST /join/:code/request                 osoba (konto bez roli trenera) prosi o dołączenie; bez konta klienta powstaje konto bez trenera (Solo)
 *               GET  /account/status                     { linked, trainerName, pendingTrainerName } dla portalu
 *               POST /client-portal/disconnect           osoba odłącza się od trenera
 *  trener:      GET  /trainer/join                       kod, link i prośby oczekujące
 *               POST /trainer/join/code                  nowy kod (stary przestaje działać)
 *               POST /trainer/join-requests/:id/accept   [Akceptuj]
 *               POST /trainer/join-requests/:id/reject   [Odrzuć]
 *               POST /clients/:clientId/disconnect       trener odłącza podopiecznego z kontem
 *
 * Zasady: tożsamość tylko z sesji Clerk; konto z linku NIGDY nie staje się trenerem (rola trenera tylko z listy dopuszczonych);
 * trener widzi dane osoby dopiero po akceptacji i traci je po odłączeniu (clients.trainer_id = NULL); historia treningów zostaje u osoby.
 * Nieistniejący, zmieniony lub błędny kod → zawsze to samo 404 (bez zgadywania).
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, trainersTable, trainerJoinRequestsTable, clientLinkEventsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { appPublicUrl, sendPlainEmail } from "../services/inviteEmail";
import { allowJoinAttempt, generateJoinCode, normalizeJoinCode } from "../services/joinCode";

const router: IRouter = Router();

const NOT_FOUND = { error: "Nie znaleziono trenera dla tego kodu. Sprawdź kod lub poproś trenera o nowy." };
const TOO_MANY = { error: "Za dużo prób. Spróbuj ponownie za kilkanaście minut." };

const clientIp = (req: { ip?: string }) => req.ip ?? "unknown";
const joinLink = (code: string) => `${appPublicUrl().replace(/\/$/, "")}/client-landing/join/${code}`;

async function trainerByCode(raw: unknown) {
  const code = normalizeJoinCode(raw);
  if (!code) return null;
  const [t] = await db.select({ id: trainersTable.id, displayName: trainersTable.displayName }).from(trainersTable).where(eq(trainersTable.joinCode, code));
  return t ?? null;
}

router.get("/join/:code", async (req, res): Promise<void> => {
  if (!allowJoinAttempt(`ip:${clientIp(req)}`)) { res.status(429).json(TOO_MANY); return; }
  const t = await trainerByCode(req.params["code"]);
  if (!t) { res.status(404).json(NOT_FOUND); return; }
  res.json({ trainerName: t.displayName ?? "Twój trener" });
});

const RequestBody = z.object({ firstName: z.string().trim().min(1).max(60).optional() });

router.post("/join/:code/request", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  // limit na konto i na IP, żeby nie dało się zgadywać kodów
  if (!allowJoinAttempt(`u:${userId}`) || !allowJoinAttempt(`ip:${clientIp(req)}`)) { res.status(429).json(TOO_MANY); return; }
  const body = RequestBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Podaj imię." }); return; }

  // konto trenera nigdy nie staje się kontem podopiecznego (role są rozdzielone)
  const [asTrainer] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  if (asTrainer) { res.status(403).json({ error: "To konto jest kontem trenera. Użyj innego adresu e-mail.", code: "TRAINER_ACCOUNT" }); return; }

  const trainer = await trainerByCode(req.params["code"]);
  if (!trainer) { res.status(404).json(NOT_FOUND); return; }

  let [client] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (client && client.trainerId != null) {
    res.status(409).json({ error: client.trainerId === trainer.id ? "Już jesteś u tego trenera." : "Jesteś już połączony z trenerem. Najpierw się odłącz.", code: "ALREADY_LINKED" });
    return;
  }
  if (!client) {
    if (!body.data.firstName) { res.status(400).json({ error: "Podaj imię." }); return; }
    // konto bez trenera istnieje w bazie od razu (Solo); trener zobaczy je dopiero po akceptacji
    [client] = await db.insert(clientsTable).values({ trainerId: null, firstName: body.data.firstName, lastName: "", status: "active", clerkUserId: userId })
      .returning({ id: clientsTable.id, trainerId: clientsTable.trainerId });
  }
  await db.insert(trainerJoinRequestsTable).values({ trainerId: trainer.id, clientId: client!.id }).onConflictDoNothing();
  res.status(201).json({ ok: true, trainerName: trainer.displayName ?? "Twój trener" });
});

router.get("/account/status", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const [c] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (!c) { res.status(404).json({ error: "Brak konta." }); return; }
  const linkedTrainer = c.trainerId != null
    ? (await db.select({ name: trainersTable.displayName }).from(trainersTable).where(eq(trainersTable.id, c.trainerId)))[0]
    : undefined;
  const [pending] = await db.select({ name: trainersTable.displayName }).from(trainerJoinRequestsTable)
    .innerJoin(trainersTable, eq(trainersTable.id, trainerJoinRequestsTable.trainerId))
    .where(and(eq(trainerJoinRequestsTable.clientId, c.id), eq(trainerJoinRequestsTable.status, "pending")))
    .orderBy(desc(trainerJoinRequestsTable.createdAt)).limit(1);
  res.json({
    linked: c.trainerId != null, trainerName: linkedTrainer ? (linkedTrainer.name ?? "Twój trener") : null,
    pendingTrainerName: pending ? (pending.name ?? "Twój trener") : null,
  });
});

// ─── Odłączenie: każda ze stron, mail do drugiej, historia zostaje u osoby ────

async function disconnect(clientId: number, trainerId: number, by: "trainer" | "client"): Promise<boolean> {
  const done = await db.transaction(async (tx) => {
    const r = await tx.update(clientsTable).set({ trainerId: null, updatedAt: new Date() })
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId))).returning({ id: clientsTable.id });
    if (r.length === 0) return false;
    await tx.insert(clientLinkEventsTable).values({ clientId, trainerId, kind: "disconnected", bySide: by });
    return true;
  });
  if (!done) return false;
  const [c] = await db.select({ email: clientsTable.email, firstName: clientsTable.firstName }).from(clientsTable).where(eq(clientsTable.id, clientId));
  const [t] = await db.select({ email: trainersTable.email, name: trainersTable.displayName }).from(trainersTable).where(eq(trainersTable.id, trainerId));
  if (by === "trainer") {
    await sendPlainEmail({ to: c?.email, fromName: t?.name, subject: "Zakończono współpracę z trenerem",
      text: `Trener ${t?.name ?? ""} odłączył Twoje konto. Twoja historia treningów zostaje u Ciebie.` });
  } else {
    await sendPlainEmail({ to: t?.email, subject: "Podopieczny odłączył się",
      text: `${c?.firstName ?? "Podopieczny"} odłączył się od Ciebie. Nie masz już dostępu do danych tej osoby.` });
  }
  return true;
}

router.post("/clients/:clientId/disconnect", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!Number.isInteger(clientId) || clientId <= 0) { res.status(400).json({ error: "Nieprawidłowy klient." }); return; }
  const [c] = await db.select({ id: clientsTable.id, clerkUserId: clientsTable.clerkUserId }).from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return; }
  if (!c.clerkUserId) { res.status(409).json({ error: "Ten klient nie ma konta w aplikacji. Możesz go zarchiwizować.", code: "NO_ACCOUNT" }); return; }
  await disconnect(clientId, req.trainer!.id, "trainer");
  res.json({ ok: true });
});

router.post("/client-portal/disconnect", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const [c] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (!c) { res.status(404).json({ error: "Brak konta." }); return; }
  if (c.trainerId == null) { res.status(409).json({ error: "Nie jesteś połączony z trenerem.", code: "NOT_LINKED" }); return; }
  await disconnect(c.id, c.trainerId, "client");
  res.json({ ok: true });
});

// ─── Trener: kod, link, prośby ───────────────────────────────────────────────

async function pendingRequests(trainerId: number) {
  const rows = await db.select({ id: trainerJoinRequestsTable.id, createdAt: trainerJoinRequestsTable.createdAt, firstName: clientsTable.firstName })
    .from(trainerJoinRequestsTable).innerJoin(clientsTable, eq(clientsTable.id, trainerJoinRequestsTable.clientId))
    .where(and(eq(trainerJoinRequestsTable.trainerId, trainerId), eq(trainerJoinRequestsTable.status, "pending")))
    .orderBy(desc(trainerJoinRequestsTable.createdAt));
  return rows;
}

async function ensureCode(trainerId: number, current: string | null): Promise<string> {
  if (current) return current;
  for (let i = 0; i < 5; i++) {
    const code = generateJoinCode();
    const r = await db.update(trainersTable).set({ joinCode: code, joinCodeCreatedAt: new Date() })
      .where(and(eq(trainersTable.id, trainerId), isNull(trainersTable.joinCode))).returning({ code: trainersTable.joinCode });
    if (r[0]?.code) return r[0].code;
    const [t] = await db.select({ code: trainersTable.joinCode }).from(trainersTable).where(eq(trainersTable.id, trainerId));
    if (t?.code) return t.code;
  }
  throw new Error("join code generation failed");
}

router.get("/trainer/join", requireAuth, async (req, res): Promise<void> => {
  const code = await ensureCode(req.trainer!.id, req.trainer!.joinCode);
  res.json({ code, link: joinLink(code), requests: await pendingRequests(req.trainer!.id) });
});

router.post("/trainer/join/code", requireAuth, async (req, res): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    const code = generateJoinCode();
    try {
      await db.update(trainersTable).set({ joinCode: code, joinCodeCreatedAt: new Date() }).where(eq(trainersTable.id, req.trainer!.id));
      res.json({ code, link: joinLink(code) });
      return;
    } catch { /* kolizja unikalnego indeksu — losujemy ponownie */ }
  }
  res.status(500).json({ error: "Nie udało się utworzyć kodu. Spróbuj ponownie." });
});

async function decide(req: import("express").Request, res: import("express").Response, accept: boolean): Promise<void> {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowa prośba." }); return; }
  const [r] = await db.select().from(trainerJoinRequestsTable)
    .where(and(eq(trainerJoinRequestsTable.id, id), eq(trainerJoinRequestsTable.trainerId, req.trainer!.id)));
  if (!r || r.status !== "pending") { res.status(404).json({ error: "Nie znaleziono prośby." }); return; }
  if (accept) {
    const ok = await db.transaction(async (tx) => {
      // tylko osoba, która nadal nie ma trenera
      const upd = await tx.update(clientsTable).set({ trainerId: req.trainer!.id, updatedAt: new Date() })
        .where(and(eq(clientsTable.id, r.clientId), isNull(clientsTable.trainerId))).returning({ id: clientsTable.id });
      if (upd.length === 0) return false;
      await tx.update(trainerJoinRequestsTable).set({ status: "accepted", decidedAt: new Date() }).where(eq(trainerJoinRequestsTable.id, id));
      await tx.insert(clientLinkEventsTable).values({ clientId: r.clientId, trainerId: req.trainer!.id, kind: "joined", bySide: "client" });
      // pozostałe prośby tej osoby do innych trenerów wygasają
      await tx.update(trainerJoinRequestsTable).set({ status: "rejected", decidedAt: new Date() })
        .where(and(eq(trainerJoinRequestsTable.clientId, r.clientId), eq(trainerJoinRequestsTable.status, "pending")));
      return true;
    });
    if (!ok) {
      await db.update(trainerJoinRequestsTable).set({ status: "rejected", decidedAt: new Date() }).where(eq(trainerJoinRequestsTable.id, id));
      res.status(409).json({ error: "Ta osoba jest już połączona z innym trenerem.", code: "ALREADY_LINKED" });
      return;
    }
    res.json({ ok: true, clientId: r.clientId });
    return;
  }
  await db.update(trainerJoinRequestsTable).set({ status: "rejected", decidedAt: new Date() }).where(eq(trainerJoinRequestsTable.id, id));
  res.json({ ok: true });
}

router.post("/trainer/join-requests/:id/accept", requireAuth, (req, res) => decide(req, res, true));
router.post("/trainer/join-requests/:id/reject", requireAuth, (req, res) => decide(req, res, false));

export default router;
