/**
 * Kalistenika (docs/KALISTENIKA.md) — behind CALISTHENICS_ENABLED (default OFF → 404 CALISTHENICS_DISABLED; the status answers always).
 *  GET /calisthenics/status                                   { enabled }  (the plan editor shows its hidden style option only when true)
 *  GET /clients/:clientId/plan-draft/calisthenics-days?days=N  days of the week by station (bar / parallel bars and push-ups / legs and core)
 * The style itself is a parameter of POST .../generate-day (`style: "calisthenics"`); nothing is stored.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { calisthenicsDays, calisthenicsEnabled, stationsFor } from "../services/calisthenics";

const router: IRouter = Router();

router.get("/calisthenics/status", (_req, res): void => { res.json({ enabled: calisthenicsEnabled() }); });

router.get("/clients/:clientId/plan-draft/calisthenics-days", requireAuth, async (req, res): Promise<void> => {
  if (!calisthenicsEnabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "CALISTHENICS_DISABLED" }); return; }
  const q = z.object({ clientId: z.coerce.number().int().positive(), days: z.coerce.number().int().min(1).max(7) }).safeParse({ clientId: req.params.clientId, days: req.query.days });
  if (!q.success) { res.status(400).json({ error: "Podaj liczbę dni (1–7)." }); return; }
  const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, q.data.clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!client) { res.status(404).json({ error: "Klient nie znaleziony" }); return; }
  const [survey] = await db.select({ trainingLocation: surveysTable.trainingLocation, equipment: surveysTable.equipment })
    .from(surveysTable).where(eq(surveysTable.clientId, client.id)).orderBy(desc(surveysTable.createdAt)).limit(1);
  const stations = stationsFor(survey?.trainingLocation, survey?.equipment);
  res.json({ ...calisthenicsDays(q.data.days, stations), stations });
});

export default router;
