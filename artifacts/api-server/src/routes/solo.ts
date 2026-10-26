/**
 * Solo (block 11) — behind SOLO_ENABLED (default OFF → every route is 404 and the app shows "Wkrótce").
 *  GET  /solo/status        { enabled }  (public: the app uses it to choose between "Wkrótce" and the Solo screens)
 *  POST /solo/start         the signed-in Clerk user becomes a Solo person (a client without a trainer (trainer_id NULL)); never a trainer
 *  GET  /solo/me            own Solo record
 * The interview → plan → training flow reuses the client portal and the generator with the Solo rules (services/solo.ts).
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, trainersTable } from "@workspace/db";
import { isSoloClient, soloEnabled } from "../services/solo";

const router: IRouter = Router();

const gate = (_req: Request, res: Response, next: NextFunction): void => {
  if (!soloEnabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "SOLO_DISABLED" }); return; }
  next();
};

router.get("/solo/status", (_req, res): void => { res.json({ enabled: soloEnabled() }); });

router.post("/solo/start", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const body = z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().max(60).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Podaj imię." }); return; }
  // roles stay separate: a trainer account or an account already linked to a trainer's client never becomes Solo
  const [trainer] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  if (trainer) { res.status(403).json({ error: "To konto jest kontem trenera.", code: "TRAINER_ACCOUNT" }); return; }
  const [existing] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (existing) {
    if (isSoloClient(existing)) { res.json({ clientId: existing.id, created: false }); return; }
    res.status(403).json({ error: "To konto jest już połączone z trenerem.", code: "ALREADY_LINKED" }); return;
  }
  const [c] = await db.insert(clientsTable).values({ trainerId: null, firstName: body.data.firstName, lastName: body.data.lastName ?? "", status: "active", clerkUserId: userId }).returning({ id: clientsTable.id });
  res.status(201).json({ clientId: c!.id, created: true });
});

router.get("/solo/me", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const [c] = await db.select({ id: clientsTable.id, firstName: clientsTable.firstName, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (!c || !isSoloClient(c)) { res.status(404).json({ error: "Brak konta Solo." }); return; }
  res.json({ clientId: c.id, firstName: c.firstName });
});

export default router;
