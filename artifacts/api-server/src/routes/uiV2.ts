/**
 * Nowy wygląd portalu (docs/screens/ux-v2) — behind UI_V2_ENABLED (default OFF → 404 UI_V2_DISABLED; the status answers always).
 *  GET /ui-v2/status                 { enabled }
 *  GET /client-portal/profile        own nick, display name, avatar colour, "trains since"
 *  PUT /client-portal/profile        { nick?, displayName?, avatarColor? } — nick unique (case-insensitive), validated, profanity-filtered
 * Only the person's own row; the trainer's views keep first/last name.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, clientsTable, workoutSessionsTable } from "@workspace/db";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { AVATAR_COLORS, checkNick } from "../services/nick";

export const uiV2Enabled = (env: NodeJS.ProcessEnv = process.env) => env.UI_V2_ENABLED === "1";

const router: IRouter = Router();
const gate = (_req: Request, res: Response, next: NextFunction): void => {
  if (!uiV2Enabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "UI_V2_DISABLED" }); return; }
  next();
};

router.get("/ui-v2/status", (_req, res): void => { res.json({ enabled: uiV2Enabled() }); });

async function profileOf(clientId: number) {
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  const [first] = await db.select({ d: workoutSessionsTable.sessionDate }).from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.isCompleted, true))).orderBy(asc(workoutSessionsTable.sessionDate)).limit(1);
  return {
    firstName: c!.firstName, displayName: c!.displayName, nick: c!.nick, avatarColor: c!.avatarColor ?? AVATAR_COLORS[0],
    colors: AVATAR_COLORS, trainsSince: first ? String(first.d).slice(0, 7) : null, // YYYY-MM of the first finished training
  };
}

router.get("/client-portal/profile", gate, requireClientAuth, async (req, res): Promise<void> => { res.json(await profileOf(req.client!.id)); });

router.put("/client-portal/profile", gate, requireClientAuth, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { nick?: unknown; displayName?: unknown; avatarColor?: unknown };
  const patch: Partial<typeof clientsTable.$inferInsert> = {};
  if ("nick" in body) {
    const n = checkNick(body.nick);
    if (!n.ok) { res.status(400).json({ error: n.error, code: "NICK_INVALID" }); return; }
    patch.nick = n.nick;
  }
  if ("displayName" in body) {
    const d = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (d.length > 40) { res.status(400).json({ error: "Nazwa może mieć najwyżej 40 znaków." }); return; }
    patch.displayName = d || null;
  }
  if ("avatarColor" in body) {
    if (typeof body.avatarColor !== "string" || !(AVATAR_COLORS as readonly string[]).includes(body.avatarColor)) { res.status(400).json({ error: "Wybierz kolor z listy." }); return; }
    patch.avatarColor = body.avatarColor;
  }
  if (Object.keys(patch).length > 0) {
    try {
      await db.update(clientsTable).set({ ...patch, updatedAt: new Date() }).where(eq(clientsTable.id, req.client!.id));
    } catch (err) {
      if ((err as { code?: string; cause?: { code?: string } }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") {
        res.status(409).json({ error: "Ten nick jest zajęty.", code: "NICK_TAKEN" }); return;
      }
      throw err;
    }
  }
  res.json(await profileOf(req.client!.id));
});

export default router;
