/**
 * requireAuth middleware
 *
 * Verifies the Clerk session and loads the caller's trainers row. It never
 * creates one: trainer profiles are created only by POST /api/trainer/profile,
 * which the trainer app calls right after sign-in. A Clerk account linked to a
 * client (client portal) is refused with 403 on every trainer endpoint.
 *
 * IMPORTANT: clerkUserId / trainerId are NEVER read from the request body,
 * query string, or custom headers. The only authoritative source is Clerk's
 * signed session token, accessed via getAuth(req).
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { trainersTable, clientsTable, type Trainer } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// Augment Express Request so downstream handlers have typed access.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Clerk userId — set only after requireAuth succeeds */
      clerkUserId?: string;
      /** DB trainer row — set only after requireAuth succeeds */
      trainer?: Trainer;
    }
  }
}

/**
 * checkIsAppAdmin
 *
 * Returns true when the given Clerk user ID is listed in APP_ADMIN_CLERK_IDS.
 * Fail-closed: an absent or empty env var grants no admin access.
 * Never expose the Clerk ID allowlist in logs or responses.
 */
export function checkIsAppAdmin(clerkUserId: string | undefined): boolean {
  if (!clerkUserId) return false;
  const raw = process.env.APP_ADMIN_CLERK_IDS ?? "";
  const adminIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return adminIds.includes(clerkUserId);
}

export const CLIENT_ACCOUNT_MESSAGE =
  "To konto należy do klienta. Zaloguj się w portalu klienta albo użyj konta trenera.";
export const NO_TRAINER_PROFILE_MESSAGE =
  "To konto nie ma profilu trenera. Zaloguj się w panelu trenera.";

/** True when the Clerk account is linked to a client (client portal account). */
export async function isClientAccount(clerkUserId: string): Promise<boolean> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.clerkUserId, clerkUserId));
  return client !== undefined;
}

/**
 * Create (or return the existing) trainers row for the Clerk user.
 * Uses INSERT … ON CONFLICT DO NOTHING + SELECT so concurrent first requests
 * from the same user cannot create duplicates. Callers must refuse client
 * accounts first (isClientAccount).
 */
export async function provisionTrainer(clerkUserId: string): Promise<Trainer | null> {
  return db.transaction(async (tx) => {
    // Attempt insert — silently ignored on duplicate clerk_user_id.
    await tx
      .insert(trainersTable)
      .values({ clerkUserId })
      .onConflictDoNothing();

    // Always SELECT after — returns the row whether it was just inserted or
    // already existed.
    const [trainer] = await tx
      .select()
      .from(trainersTable)
      .where(eq(trainersTable.clerkUserId, clerkUserId));

    return trainer ?? null;
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." });
    return;
  }

  req.clerkUserId = userId;

  try {
    const [trainer] = await db
      .select()
      .from(trainersTable)
      .where(eq(trainersTable.clerkUserId, userId));
    if (!trainer) {
      const clientAccount = await isClientAccount(userId);
      res.status(403).json({
        error: clientAccount ? CLIENT_ACCOUNT_MESSAGE : NO_TRAINER_PROFILE_MESSAGE,
        code: clientAccount ? "CLIENT_ACCOUNT" : "TRAINER_PROFILE_REQUIRED",
      });
      return;
    }
    req.trainer = trainer;
    next();
  } catch (err) {
    logger.error({ err, clerkUserId: userId }, "requireAuth: DB error while loading trainer");
    res.status(500).json({ error: "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę." });
  }
}

/**
 * requireCatalogueAdmin middleware
 *
 * Protects exercise catalogue mutation routes.
 * Reads the CATALOGUE_ADMIN_CLERK_IDS env var (comma-separated Clerk user IDs).
 * If the var is absent, empty, or the caller is not in the list → 403.
 * There is NO fallback that allows all authenticated trainers.
 */
export function requireCatalogueAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!checkIsCatalogueAdmin(req.clerkUserId)) {
    res.status(403).json({ error: "Nie masz dostępu do tego widoku." });
    return;
  }
  next();
}

export function checkIsCatalogueAdmin(clerkUserId: string | undefined): boolean {
  if (!clerkUserId) return false;
  const raw = process.env.CATALOGUE_ADMIN_CLERK_IDS ?? "";
  const adminIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return adminIds.includes(clerkUserId);
}
