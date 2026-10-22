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
  isClientAccount,
  provisionTrainer,
} from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

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

  const trainer = await provisionTrainer(userId);
  if (!trainer) {
    logger.error({ clerkUserId: userId }, "Failed to provision trainer row");
    res.status(500).json({ error: "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę." });
    return;
  }
  res.json({ id: trainer.id, displayName: trainer.displayName, email: trainer.email });
});

export default router;
