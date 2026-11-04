/**
 * „Złote Byczki” (za flagą GOLDEN_BULLS_ENABLED):
 *  GET  /golden-bulls/status                  publiczny: { enabled, trainer:{pool,left}, solo:{pool,left} } — do licznika „Zostało X z 10”
 *  GET  /admin/golden-bulls                   lista Byczków (kto, numer, kiedy) — tylko administrator
 *  POST /admin/golden-bulls/grant             { kind, id, reason } ręczne przyznanie (id trenera albo osoby), z powodem
 *  POST /admin/golden-bulls/:id/revoke        { reason } odebranie z powodem (zwalnia miejsce w puli)
 * Bez danych zdrowotnych; w liście tylko imię/nazwa i e-mail trenera.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, trainersTable, clientsTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { bullStatus, goldenBullsEnabled, grantBull, listBulls, revokeBull, poolFor } from "../services/goldenBulls";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];

router.get("/golden-bulls/status", async (_req, res): Promise<void> => {
  try { res.json(await bullStatus()); } catch { res.json({ enabled: false, trainer: { pool: 0, left: 0 }, solo: { pool: 0, left: 0 } }); }
});

router.get("/admin/golden-bulls", ...admin, async (_req, res): Promise<void> => {
  const rows = await listBulls();
  res.json({ enabled: goldenBullsEnabled(), pools: { trainer: poolFor("trainer"), solo: poolFor("solo") },
    bulls: rows.map((r) => ({ id: r.id, kind: r.kind, number: r.number, who: r.kind === "trainer" ? (r.trainerName ?? r.trainerEmail ?? `Konto …${r.clerkUserId.slice(-6)}`) : (r.clientFirstName ?? `Konto …${r.clerkUserId.slice(-6)}`),
      grantedAt: r.grantedAt, grantedBy: r.grantedBy === "auto" ? "automatycznie" : "administrator", reason: r.reason, perksUntil: r.perksUntil, revoked: r.revokedAt != null, revokedAt: r.revokedAt, revokedReason: r.revokedReason })) });
});

const GrantBody = z.object({ kind: z.enum(["trainer", "solo"]), id: z.number().int().positive(), reason: z.string().trim().min(5).max(300) });
router.post("/admin/golden-bulls/grant", ...admin, async (req, res): Promise<void> => {
  if (!goldenBullsEnabled()) { res.status(404).json({ error: "Kampania jest wyłączona.", code: "GOLDEN_BULLS_DISABLED" }); return; }
  const b = GrantBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Podaj rodzaj, numer konta i powód (co najmniej 5 znaków)." }); return; }
  let target: { clerkUserId: string; trainerId?: number; clientId?: number } | null = null;
  if (b.data.kind === "trainer") {
    const [t] = await db.select({ id: trainersTable.id, clerk: trainersTable.clerkUserId }).from(trainersTable).where(eq(trainersTable.id, b.data.id));
    if (t) target = { clerkUserId: t.clerk, trainerId: t.id };
  } else {
    const [c] = await db.select({ id: clientsTable.id, clerk: clientsTable.clerkUserId, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.id, b.data.id));
    if (c?.clerk && c.trainerId == null) target = { clerkUserId: c.clerk, clientId: c.id };
  }
  if (!target) { res.status(404).json({ error: "Nie znaleziono takiego konta (dla Solo — osoby bez trenera, z kontem)." }); return; }
  const row = await grantBull(b.data.kind, target, { by: req.clerkUserId!, reason: b.data.reason, ignoreExclusion: true });
  if (!row) { res.status(409).json({ error: "Nie przyznano: pula jest pełna albo odznaka została już odebrana temu kontu.", code: "NOT_GRANTED" }); return; }
  logger.info({ kind: row.kind, number: row.number }, "Złoty Byczek przyznany ręcznie");
  res.status(201).json({ id: row.id, kind: row.kind, number: row.number });
});

const RevokeBody = z.object({ reason: z.string().trim().min(5).max(300) });
router.post("/admin/golden-bulls/:id/revoke", ...admin, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const b = RevokeBody.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !b.success) { res.status(400).json({ error: "Podaj powód (co najmniej 5 znaków)." }); return; }
  const row = await revokeBull(id, b.data.reason, req.clerkUserId!);
  if (!row) { res.status(404).json({ error: "Nie znaleziono aktywnej odznaki." }); return; }
  res.json({ ok: true });
});

export default router;
