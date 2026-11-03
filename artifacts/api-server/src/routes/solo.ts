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
import { clerkClient } from "@clerk/express";
import { SubmitPublicSurveyBody } from "@workspace/api-zod";
import { isSoloClient, soloEnabled, ensureSoloClient } from "../services/solo";
import { isSelfTraining } from "../services/selfTraining";
import { swapExercise, swapsUsed } from "../services/soloSwap";
import { generateSoloPlan } from "../services/soloPlanDriver";
import { surveyInsertValues, validateSurveyAnswers } from "../services/surveyInsert";
import { surveysTable } from "@workspace/db";

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

/** Osoba, która może sama układać sobie plan: bez trenera albo „Mój trening” trenera. */
async function soloActor(userId: string): Promise<{ id: number; firstName: string } | null> {
  await ensureSoloClient(userId);
  const [c] = await db.select({ id: clientsTable.id, firstName: clientsTable.firstName, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, userId));
  if (!c) return null;
  return c.trainerId === null || (await isSelfTraining(c.id)) ? { id: c.id, firstName: c.firstName } : null;
}

const calcAge = (dob: Date) => { const t = new Date(); let a = t.getUTCFullYear() - dob.getUTCFullYear(); if (t.getUTCMonth() - dob.getUTCMonth() < 0 || (t.getUTCMonth() === dob.getUTCMonth() && t.getUTCDate() < dob.getUTCDate())) a--; return a; };

/** Wywiad Solo: ten sam formularz co z zaproszenia trenera, zapis do `surveys` osoby; bez tokenu i bez e-maila w formularzu. */
router.post("/solo/survey", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const actor = await soloActor(userId);
  if (!actor) { res.status(403).json({ error: "Wywiad dla trenera wypełnia Twój trener.", code: "NOT_SOLO" }); return; }
  let email = "brak-adresu@optimatren.invalid";
  try { email = (await clerkClient.users.getUser(userId)).primaryEmailAddress?.emailAddress ?? email; } catch { /* bez adresu */ }
  const parsed = SubmitPublicSurveyBody.safeParse({ ...(req.body ?? {}), firstName: req.body?.firstName || actor.firstName, lastName: req.body?.lastName || "-", email });
  if (!parsed.success) { res.status(400).json({ error: "Uzupełnij odpowiedzi w wywiadzie." }); return; }
  const check = validateSurveyAnswers(parsed.data);
  if (check.error) { res.status(400).json({ error: check.error }); return; }
  await db.insert(surveysTable).values(surveyInsertValues(actor.id, parsed.data, { age: calcAge(new Date(check.dobIso)), dobIso: check.dobIso }) as never);
  // imię z wywiadu zastępuje to z konta (tylko u osoby bez trenera; „Mój trening” trenera zostaje jak jest)
  const [c] = await db.select({ trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.id, actor.id));
  if (c?.trainerId === null && parsed.data.firstName) await db.update(clientsTable).set({ firstName: parsed.data.firstName, lastName: req.body?.lastName ? parsed.data.lastName : "", updatedAt: new Date() }).where(eq(clientsTable.id, actor.id));
  res.status(201).json({ success: true });
});

/** Ułóż (albo ułóż od nowa) plan Solo. Limit: 1 nowy plan na 14 dni, chyba że beta bez limitów. */
router.post("/solo/plan", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const actor = await soloActor(userId);
  if (!actor) { res.status(403).json({ error: "Plan układa Twój trener.", code: "NOT_SOLO" }); return; }
  const r = await generateSoloPlan(actor.id);
  if (r.ok) { res.status(201).json(r); return; }
  res.status(r.code === "PLAN_LIMIT" ? 429 : r.code === "NO_SURVEY" ? 409 : r.code === "NOT_SOLO" ? 403 : 422).json({ error: r.message, code: r.code, retryAfter: r.retryAfter ?? null });
});

/** „Zamień na inne” (max 3 zamiany na tydzień): ile zostało. */
router.get("/solo/swaps", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const actor = await soloActor(userId);
  if (!actor) { res.status(403).json({ error: "Zamiany układa Twój trener.", code: "NOT_SOLO" }); return; }
  const q = await swapsUsed(actor.id);
  res.json({ used: q.used, limit: q.limit, left: Math.max(0, q.limit - q.used), nextAt: q.nextAt });
});

router.post("/solo/plan-exercises/:id/swap", gate, async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const actor = await soloActor(userId);
  if (!actor) { res.status(403).json({ error: "Zamiany układa Twój trener.", code: "NOT_SOLO" }); return; }
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowe ćwiczenie." }); return; }
  const r = await swapExercise(actor.id, id);
  if (r.ok) { res.json(r); return; }
  res.status(r.status).json({ error: r.message, code: r.code });
});

export default router;
