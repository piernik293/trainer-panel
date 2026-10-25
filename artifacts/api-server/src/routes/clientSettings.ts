/**
 * Client portal settings set by the client alone (the trainer does not control them):
 *  GET/PUT /client-portal/settings — { breathingCooldown } "Kończ schłodzenie minutą spokojnego oddechu" (default off).
 * The client id comes only from the session.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable } from "@workspace/db";
import { requireClientAuth } from "../middlewares/requireClientAuth";

const router: IRouter = Router();
const Body = z.object({ breathingCooldown: z.boolean() });

router.get("/client-portal/settings", requireClientAuth, async (req, res): Promise<void> => {
  const [c] = await db.select({ breathingCooldown: clientsTable.breathingCooldown }).from(clientsTable).where(eq(clientsTable.id, req.client!.id));
  res.json({ breathingCooldown: c?.breathingCooldown === true });
});

router.put("/client-portal/settings", requireClientAuth, async (req, res): Promise<void> => {
  const body = Body.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Nieprawidłowe ustawienie." }); return; }
  await db.update(clientsTable).set({ breathingCooldown: body.data.breathingCooldown }).where(eq(clientsTable.id, req.client!.id));
  res.json({ breathingCooldown: body.data.breathingCooldown });
});

export default router;
