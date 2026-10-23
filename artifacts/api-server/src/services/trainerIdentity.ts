/**
 * Trainer's name and e-mail for invitation e-mails (sender name, Reply-To).
 * Read from Clerk on the server — never trusted from the request body.
 * Falls back to the trainers row when Clerk is unavailable (e.g. in tests).
 */

import type { Trainer } from "@workspace/db";
import { logger } from "../lib/logger";

export interface TrainerIdentity {
  fullName: string | null;
  email: string | null;
}

export async function getTrainerIdentity(trainer: Trainer): Promise<TrainerIdentity> {
  try {
    const { clerkClient } = await import("@clerk/express");
    const user = await clerkClient.users.getUser(trainer.clerkUserId);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
    const email = user.primaryEmailAddress?.emailAddress ?? null;
    return { fullName: fullName ?? trainer.displayName ?? null, email: email ?? trainer.email ?? null };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Trainer identity from Clerk unavailable");
    return { fullName: trainer.displayName ?? null, email: trainer.email ?? null };
  }
}
