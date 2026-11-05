/**
 * Samouczek trenera (flaga ONBOARDING_ENABLED, domyślnie wyłączona → 404):
 *  GET  /onboarding/status      { enabled } (publiczne)
 *  GET  /onboarding             kroki (z danych konta), pominięcie, ukończenie + „Zajęło Ci to X min”, klient przykładowy
 *  POST /onboarding/dismiss     „Pomiń samouczek”;   POST /onboarding/show   „Pokaż samouczek” z menu
 *  POST /onboarding/example     tworzy klienta przykładowego (Anna, początkująca, ból prawego kolana); idempotentne
 *  DELETE /onboarding/example   usuwa go jednym kliknięciem
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, onboardingStateTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { onboardingEnabled, view, ensureState, createExample, removeExample } from "../services/onboarding";

const router: IRouter = Router();
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!onboardingEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };

router.get("/onboarding/status", (_req, res): void => { res.json({ enabled: onboardingEnabled() }); });
router.get("/onboarding", gate, requireAuth, async (req, res): Promise<void> => { res.json(await view(req.trainer!.id)); });
router.post("/onboarding/dismiss", gate, requireAuth, async (req, res): Promise<void> => {
  await ensureState(req.trainer!.id);
  await db.update(onboardingStateTable).set({ dismissedAt: new Date() }).where(eq(onboardingStateTable.trainerId, req.trainer!.id));
  res.json({ ok: true });
});
router.post("/onboarding/show", gate, requireAuth, async (req, res): Promise<void> => {
  await ensureState(req.trainer!.id);
  await db.update(onboardingStateTable).set({ dismissedAt: null }).where(eq(onboardingStateTable.trainerId, req.trainer!.id));
  res.json({ ok: true });
});
router.post("/onboarding/example", gate, requireAuth, async (req, res): Promise<void> => { res.status(201).json({ clientId: await createExample(req.trainer!.id) }); });
router.delete("/onboarding/example", gate, requireAuth, async (req, res): Promise<void> => {
  if (!(await removeExample(req.trainer!.id))) { res.status(404).json({ error: "Nie masz klienta przykładowego." }); return; }
  res.json({ ok: true });
});

export default router;
