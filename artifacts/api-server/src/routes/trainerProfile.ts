/**
 * POST /trainer/profile — create the caller's trainer profile.
 *
 * Called by the trainer app right after sign-in. This is the only place a
 * trainers row is created (requireAuth never provisions). Idempotent: repeated
 * or concurrent calls return the same row. Accounts linked to a client
 * (client portal) are refused with 403.
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  CLIENT_ACCOUNT_MESSAGE,
  TRAINER_NOT_APPROVED_MESSAGE,
  canBecomeTrainer,
  isClientAccount,
  provisionTrainer,
} from "../middlewares/requireAuth";
import { eq } from "drizzle-orm";
import { db, trainersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getTrainerIdentity } from "../services/trainerIdentity";

const router: IRouter = Router();

router.post("/trainer/profile", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." });
    return;
  }

  if (await isClientAccount(userId)) {
    res.status(403).json({ error: CLIENT_ACCOUNT_MESSAGE, code: "CLIENT_ACCOUNT" });
    return;
  }

  // A new trainer profile only for accounts the administrator approved; an existing trainer just gets the row back.
  const [existing] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, userId));
  if (!existing && !canBecomeTrainer(userId)) {
    res.status(403).json({ error: TRAINER_NOT_APPROVED_MESSAGE, code: "TRAINER_NOT_APPROVED" });
    return;
  }

  const trainer = await provisionTrainer(userId);
  if (!trainer) {
    logger.error({ clerkUserId: userId }, "Failed to provision trainer row");
    res.status(500).json({ error: "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę." });
    return;
  }
  // Imię i e-mail trenera z Clerka, gdy w bazie ich jeszcze nie ma (lista trenerów w panelu administratora). Nie nadpisuje tego, co już jest.
  let { displayName, email } = trainer;
  if (!displayName || !email) {
    const identity = await getTrainerIdentity(trainer);
    const patch = { ...(!displayName && identity.fullName ? { displayName: identity.fullName } : {}), ...(!email && identity.email ? { email: identity.email } : {}) };
    if (Object.keys(patch).length > 0) {
      await db.update(trainersTable).set(patch).where(eq(trainersTable.id, trainer.id)).catch((err) => logger.warn({ err }, "Trainer identity not saved"));
      displayName = patch.displayName ?? displayName;
      email = patch.email ?? email;
    }
  }
  res.json({ id: trainer.id, displayName, email });
});

export default router;
