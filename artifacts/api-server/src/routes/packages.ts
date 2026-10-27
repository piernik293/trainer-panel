/**
 * Session packages (block 7).
 *  Trainer (own clients only; other trainers get 404):
 *    GET   /clients/:clientId/packages                 — all packages with usage and reminders
 *    POST  /clients/:clientId/packages                 — new package (one active per client)
 *    PATCH /packages/:id                               — title, price, validity, visibility for the client, close
 *    POST  /packages/:id/sessions                      — mark a held session ("odhacz")
 *    DELETE /packages/:id/sessions/:sessionId          — undo (the row is voided, not deleted)
 *  Client:
 *    GET   /client-portal/package                      — { visible, remaining, total } only when the trainer allowed it; never the price
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, clientPackagesTable, packageSessionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { activePackageOf, remainingSessions, toView, usedCounts } from "../services/packages";

const router: IRouter = Router();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data w formacie RRRR-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "Nieprawidłowa data");

const CreateBody = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  totalSessions: z.number().int().min(1).max(200),
  pricePln: z.number().min(0).max(100000).nullish(),
  validUntil: isoDate.nullish(),
  showToClient: z.boolean().optional(),
});
const PatchBody = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  pricePln: z.number().min(0).max(100000).nullable().optional(),
  validUntil: isoDate.nullable().optional(),
  showToClient: z.boolean().optional(),
  totalSessions: z.number().int().min(1).max(200).optional(),
  status: z.literal("closed").optional(),
});
const SessionBody = z.object({ heldOn: isoDate.optional(), note: z.string().trim().max(300).nullish() });

async function ownClient(req: Request, res: Response, clientId: number): Promise<boolean> {
  if (!Number.isInteger(clientId)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return false; }
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return false; }
  return true;
}
async function ownPackage(req: Request, res: Response, id: number) {
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return undefined; }
  const [p] = await db.select().from(clientPackagesTable).where(and(eq(clientPackagesTable.id, id), eq(clientPackagesTable.trainerId, req.trainer!.id)));
  if (!p) { res.status(404).json({ error: "Pakiet nie znaleziony." }); return undefined; }
  return p;
}
async function viewOf(packageId: number) {
  const [p] = await db.select().from(clientPackagesTable).where(eq(clientPackagesTable.id, packageId));
  const used = (await usedCounts([packageId])).get(packageId) ?? 0;
  return toView(p!, used);
}

router.get("/clients/:clientId/packages", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!(await ownClient(req, res, clientId))) return;
  const pkgs = await db.select().from(clientPackagesTable).where(eq(clientPackagesTable.clientId, clientId)).orderBy(desc(clientPackagesTable.createdAt), desc(clientPackagesTable.id));
  const used = await usedCounts(pkgs.map((p) => p.id));
  const active = pkgs.find((p) => p.status === "active");
  const sessions = active
    ? await db.select().from(packageSessionsTable).where(and(eq(packageSessionsTable.packageId, active.id), isNull(packageSessionsTable.voidedAt))).orderBy(desc(packageSessionsTable.heldOn), desc(packageSessionsTable.id)).limit(30)
    : [];
  res.json({ packages: pkgs.map((p) => toView(p, used.get(p.id) ?? 0)), activeSessions: sessions.map((s) => ({ id: s.id, heldOn: s.heldOn, note: s.note })) });
});

router.post("/clients/:clientId/packages", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!(await ownClient(req, res, clientId))) return;
  const b = CreateBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź dane pakietu (liczba sesji 1–200, data RRRR-MM-DD)." }); return; }
  if (await activePackageOf(clientId)) { res.status(409).json({ error: "Ten podopieczny ma już aktywny pakiet. Zamknij go, zanim dodasz nowy.", code: "ACTIVE_EXISTS" }); return; }
  try {
    const [p] = await db.insert(clientPackagesTable).values({
      trainerId: req.trainer!.id, clientId, title: b.data.title ?? "Pakiet sesji", totalSessions: b.data.totalSessions,
      pricePln: b.data.pricePln == null ? null : String(b.data.pricePln), validUntil: b.data.validUntil ?? null, showToClient: b.data.showToClient ?? false,
    }).returning();
    res.status(201).json(await viewOf(p!.id));
  } catch (e) {
    if ((e as { code?: string }).code === "23505") { res.status(409).json({ error: "Ten podopieczny ma już aktywny pakiet.", code: "ACTIVE_EXISTS" }); return; }
    throw e;
  }
});

router.patch("/packages/:id", requireAuth, async (req, res): Promise<void> => {
  const p = await ownPackage(req, res, Number(req.params.id));
  if (!p) return;
  const b = PatchBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź dane pakietu." }); return; }
  const used = (await usedCounts([p.id])).get(p.id) ?? 0;
  if (b.data.totalSessions !== undefined && b.data.totalSessions < used) { res.status(409).json({ error: `Odbyto już ${used} sesji — liczba sesji w pakiecie nie może być mniejsza.`, code: "BELOW_USED" }); return; }
  const set: Partial<typeof clientPackagesTable.$inferInsert> = {};
  if (b.data.title !== undefined) set.title = b.data.title;
  if (b.data.pricePln !== undefined) set.pricePln = b.data.pricePln === null ? null : String(b.data.pricePln);
  if (b.data.validUntil !== undefined) set.validUntil = b.data.validUntil;
  if (b.data.showToClient !== undefined) set.showToClient = b.data.showToClient;
  if (b.data.totalSessions !== undefined) set.totalSessions = b.data.totalSessions;
  if (b.data.status === "closed") { set.status = "closed"; set.closedAt = new Date(); set.showToClient = false; }
  if (Object.keys(set).length > 0) await db.update(clientPackagesTable).set(set).where(eq(clientPackagesTable.id, p.id));
  res.json(await viewOf(p.id));
});

router.post("/packages/:id/sessions", requireAuth, async (req, res): Promise<void> => {
  const p = await ownPackage(req, res, Number(req.params.id));
  if (!p) return;
  const b = SessionBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: "Sprawdź datę sesji (RRRR-MM-DD)." }); return; }
  if (p.status !== "active") { res.status(409).json({ error: "Pakiet jest zamknięty.", code: "CLOSED" }); return; }
  // the last session cannot be taken twice by two quick requests: lock the package row inside a transaction
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: clientPackagesTable.id }).from(clientPackagesTable).where(eq(clientPackagesTable.id, p.id)).for("update");
    const rows = await tx.select({ id: packageSessionsTable.id }).from(packageSessionsTable).where(and(eq(packageSessionsTable.packageId, p.id), isNull(packageSessionsTable.voidedAt)));
    if (remainingSessions(p.totalSessions, rows.length) === 0) return { ok: false as const };
    const [s] = await tx.insert(packageSessionsTable).values({ packageId: p.id, ...(b.data.heldOn ? { heldOn: b.data.heldOn } : {}), note: b.data.note ?? null }).returning();
    return { ok: true as const, session: s! };
  });
  if (!result.ok) { res.status(409).json({ error: "Wszystkie sesje z pakietu są już odhaczone.", code: "NO_SESSIONS_LEFT" }); return; }
  res.status(201).json({ session: { id: result.session.id, heldOn: result.session.heldOn, note: result.session.note }, package: await viewOf(p.id) });
});

router.delete("/packages/:id/sessions/:sessionId", requireAuth, async (req, res): Promise<void> => {
  const p = await ownPackage(req, res, Number(req.params.id));
  if (!p) return;
  const sessionId = Number(req.params.sessionId);
  if (!Number.isInteger(sessionId)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return; }
  const upd = await db.update(packageSessionsTable).set({ voidedAt: new Date() })
    .where(and(eq(packageSessionsTable.id, sessionId), eq(packageSessionsTable.packageId, p.id), isNull(packageSessionsTable.voidedAt))).returning({ id: packageSessionsTable.id });
  if (upd.length === 0) { res.status(404).json({ error: "Sesja nie znaleziona." }); return; }
  res.json({ package: await viewOf(p.id) });
});

router.get("/client-portal/package", requireClientAuth, async (req, res): Promise<void> => {
  const p = await activePackageOf(req.client!.id);
  if (!p || !p.showToClient) { res.json({ visible: false }); return; }
  const used = (await usedCounts([p.id])).get(p.id) ?? 0;
  res.json({ visible: true, remaining: remainingSessions(p.totalSessions, used), total: p.totalSessions, validUntil: p.validUntil });
});

export default router;
