/**
 * Nowy wygląd portalu (docs/screens/ux-v2) — behind UI_V2_ENABLED (default OFF → 404 UI_V2_DISABLED; the status answers always).
 *  GET /ui-v2/status                 { enabled }
 *  GET /client-portal/profile        own nick, display name, avatar colour, "trains since"
 *  PUT /client-portal/profile        { nick?, displayName?, avatarColor? } — nick: unique (case-insensitive), validated, profanity-filtered, reserved names
 *                                    refused, "almost identical" nicks refused (key without _ . and trailing digits), a change at most once per 30 days
 *                                    and the old nick stays blocked for other people for 30 days
 * Only the person's own row; the trainer's views keep first/last name.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db, clientsTable, nickHistoryTable, trainersTable, workoutSessionsTable } from "@workspace/db";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import { AVATAR_COLORS, checkNick, holdUntil, nextNickChangeAt, nickKey, trainerLookalikeCore } from "../services/nick";

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
    /** the "Trener" badge next to the nick */
    isTrainer: c!.clerkUserId ? !!(await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, c!.clerkUserId)).limit(1))[0] : false,
    /** null = the nick can be changed now */
    nickChangeAvailableAt: nextNickChangeAt(c!.nickChangedAt)?.toISOString() ?? null,
  };
}

router.get("/client-portal/profile", gate, requireClientAuth, async (req, res): Promise<void> => { res.json(await profileOf(req.client!.id)); });

router.put("/client-portal/profile", gate, requireClientAuth, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { nick?: unknown; displayName?: unknown; avatarColor?: unknown };
  const patch: Partial<typeof clientsTable.$inferInsert> = {};
  let nickWrite: { nick: string | null; key: string | null; changedAt: Date | null; releaseOld: { nick: string; key: string } | null } | null = null;
  if ("nick" in body) {
    const n = checkNick(body.nick);
    if (!n.ok) { res.status(400).json({ error: n.error, code: n.code }); return; }
    const [cur] = await db.select({ nick: clientsTable.nick, key: clientsTable.nickKey, changedAt: clientsTable.nickChangedAt }).from(clientsTable).where(eq(clientsTable.id, req.client!.id));
    if ((cur?.nick ?? null)?.toLowerCase() === (n.nick ?? null)?.toLowerCase()) {
      // the same nick (only the letter case may differ): nothing to check, nothing counts as a change
      nickWrite = { nick: n.nick, key: n.nick ? nickKey(n.nick) : null, changedAt: cur?.changedAt ?? null, releaseOld: null };
    } else {
      const lock = nextNickChangeAt(cur?.changedAt ?? null);
      if (lock) { res.status(429).json({ error: `Nick możesz zmienić ponownie ${lock.toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}.`, code: "NICK_COOLDOWN", availableAt: lock.toISOString() }); return; }
      const key = n.nick ? nickKey(n.nick) : null;
      if (key) {
        const [taken] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.nickKey, key), ne(clientsTable.id, req.client!.id))).limit(1);
        if (taken) { res.status(409).json({ error: "Ten nick jest zajęty albo zbyt podobny do cudzego.", code: "NICK_TAKEN" }); return; }
        // „trener_ola” przy trenerce „ola”: nick z dopiskiem trenera, którego rdzeń jest nickiem konta z odznaką „Trener”
        const core = trainerLookalikeCore(n.nick!);
        if (core) {
          const [lookalike] = await db.select({ id: clientsTable.id }).from(clientsTable)
            .innerJoin(trainersTable, eq(trainersTable.clerkUserId, clientsTable.clerkUserId))
            .where(and(eq(clientsTable.nickKey, core), ne(clientsTable.id, req.client!.id))).limit(1);
          if (lookalike) { res.status(409).json({ error: "Ten nick jest zbyt podobny do nicka trenera. Wybierz inny.", code: "NICK_TRAINER_LOOKALIKE" }); return; }
        }
        const [held] = await db.select({ id: nickHistoryTable.id }).from(nickHistoryTable).where(and(eq(nickHistoryTable.nickKey, key), gt(nickHistoryTable.blockedUntil, new Date()), ne(nickHistoryTable.clientId, req.client!.id))).limit(1);
        if (held) { res.status(409).json({ error: "Ten nick jest chwilowo zablokowany. Wybierz inny.", code: "NICK_HELD" }); return; }
      }
      nickWrite = { nick: n.nick, key, changedAt: new Date(), releaseOld: cur?.nick ? { nick: cur.nick, key: cur.key ?? nickKey(cur.nick) } : null };
    }
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
  if (Object.keys(patch).length > 0 || nickWrite) {
    try {
      await db.transaction(async (tx) => {
        if (nickWrite?.releaseOld) await tx.insert(nickHistoryTable).values({ clientId: req.client!.id, nick: nickWrite.releaseOld.nick, nickKey: nickWrite.releaseOld.key, blockedUntil: holdUntil() });
        await tx.update(clientsTable).set({
          ...patch,
          ...(nickWrite ? { nick: nickWrite.nick, nickKey: nickWrite.key, nickChangedAt: nickWrite.changedAt } : {}),
          updatedAt: new Date(),
        }).where(eq(clientsTable.id, req.client!.id));
      });
    } catch (err) {
      if ((err as { code?: string; cause?: { code?: string } }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") {
        res.status(409).json({ error: "Ten nick jest zajęty albo zbyt podobny do cudzego.", code: "NICK_TAKEN" }); return;
      }
      throw err;
    }
  }
  res.json(await profileOf(req.client!.id));
});

export default router;
