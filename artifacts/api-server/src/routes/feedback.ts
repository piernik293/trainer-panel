/**
 * „Zgłoś uwagę” (blok 4) — za flagą FEEDBACK_ENABLED (wyłączona: wszystko poza /feedback/status zwraca 404).
 *  GET  /feedback/status             { enabled } — czy pokazać przycisk (bez logowania)
 *  POST /feedback                    zgłoszenie od zalogowanej osoby (trener albo klient); limit na osobę
 *  GET  /admin/feedback              lista (tylko administrator); ?status=new|read
 *  POST /admin/feedback/:id/read     oznacz jako przeczytane (tylko administrator)
 * Nikt poza administratorem nie ma jak odczytać cudzych uwag.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, trainersTable, userFeedbackTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH, cleanFeedbackText, feedbackEnabled, notifyOwner, saveFeedback } from "../services/feedback";
import { normalizePlace } from "../services/errorLog";

const router: IRouter = Router();

const whenEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (!feedbackEnabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "FEEDBACK_DISABLED" }); return; }
  next();
};
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};

/** 5 uwag na godzinę na osobę — wystarczy na zwykłe użycie, a spam nie zapełni skrzynki. */
export const FEEDBACK_LIMIT = { name: "feedback", windowMs: 3_600_000, max: 5, by: "user" as const, message: "Wysłano już kilka uwag. Spróbuj ponownie za godzinę." };

const Body = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().max(FEEDBACK_MAX_LENGTH),
  page: z.string().max(300).optional(),
  source: z.enum(["panel", "portal"]),
});

router.get("/feedback/status", (_req, res): void => { res.json({ enabled: feedbackEnabled() }); });

router.post("/feedback", whenEnabled, rateLimit(FEEDBACK_LIMIT), async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const body = Body.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `Wpisz uwagę (do ${FEEDBACK_MAX_LENGTH} znaków) i wybierz rodzaj.`, code: "INVALID" }); return; }
  const cleaned = cleanFeedbackText(body.data.message);
  if (!cleaned.ok) {
    res.status(422).json({
      error: cleaned.code === "EMPTY" ? "Wpisz uwagę." : "Wygląda na to, że uwaga zawiera dane zdrowotne. Opisz sprawę bez nich.",
      code: cleaned.code,
    });
    return;
  }
  const [trainer] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  const role = trainer ? "trener" : "klient";
  const page = normalizePlace(body.data.page);
  await saveFeedback({ source: body.data.source, role, category: body.data.category, text: cleaned.text, page, userKey: userId });
  notifyOwner({ source: body.data.source, role, category: body.data.category, text: cleaned.text, page });
  res.status(201).json({ ok: true });
});

router.get("/admin/feedback", whenEnabled, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const status = req.query["status"] === "read" ? "read" : req.query["status"] === "new" ? "new" : null;
  const rows = await db.select().from(userFeedbackTable).where(status ? eq(userFeedbackTable.status, status) : undefined).orderBy(desc(userFeedbackTable.createdAt)).limit(200);
  res.json({ feedback: rows.map((f) => ({ id: f.id, createdAt: f.createdAt, source: f.source, role: f.authorRole, category: f.category, message: f.message, page: f.page, appVersion: f.appVersion, status: f.status, readAt: f.readAt })) });
});

router.post("/admin/feedback/:id/read", whenEnabled, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowa uwaga." }); return; }
  const r = await db.update(userFeedbackTable).set({ status: "read", readAt: new Date() }).where(eq(userFeedbackTable.id, id)).returning({ id: userFeedbackTable.id });
  if (r.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

export default router;
