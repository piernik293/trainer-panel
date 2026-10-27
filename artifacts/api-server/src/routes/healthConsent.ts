/**
 * Consent to process health data (block 5d).
 *  GET  /clients/:clientId/health-consent          trainer — status of the client's latest interview
 *  GET  /client-portal/health-consent              client  — own status
 *  POST /client-portal/health-consent/withdraw     client  — withdraws the consent (all own interviews with a given consent)
 * Withdrawal keeps the stored data (deleting it is a separate request, see docs/DO-DECYZJI.md) and switches the generator to the cautious
 * settings. The client id comes only from the session / the trainer's own clients.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";

const router: IRouter = Router();

async function latestStatus(clientId: number) {
  const [s] = await db
    .select({
      status: surveysTable.healthConsentStatus, givenAt: surveysTable.healthConsentAt,
      version: surveysTable.healthConsentVersion, withdrawnAt: surveysTable.healthConsentWithdrawnAt,
    })
    .from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
  return { status: s?.status ?? null, givenAt: s?.givenAt ?? null, version: s?.version ?? null, withdrawnAt: s?.withdrawnAt ?? null };
}

router.get("/clients/:clientId/health-consent", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return; }
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return; }
  res.json(await latestStatus(clientId));
});

router.get("/client-portal/health-consent", requireClientAuth, async (req, res): Promise<void> => {
  res.json(await latestStatus(req.client!.id));
});

router.post("/client-portal/health-consent/withdraw", requireClientAuth, async (req, res): Promise<void> => {
  await db.update(surveysTable)
    .set({ healthConsentStatus: "withdrawn", healthConsentWithdrawnAt: new Date() })
    .where(and(eq(surveysTable.clientId, req.client!.id), eq(surveysTable.healthConsentStatus, "given")));
  res.json(await latestStatus(req.client!.id));
});

export default router;
