/**
 * requireAuth middleware
 *
 * Verifies the Clerk session on every request and JIT-provisions a trainers row
 * on the first authenticated request for a new Clerk user.
 *
 * IMPORTANT: clerkUserId / trainerId are NEVER read from the request body,
 * query string, or custom headers. The only authoritative source is Clerk's
 * signed session token, accessed via getAuth(req).
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { trainersTable, type Trainer } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// Augment Express Request so downstream handlers have typed access.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Clerk userId — set only after requireAuth succeeds */
      clerkUserId?: string;
      /** DB trainer row — set only after JIT provisioning succeeds */
      trainer?: Trainer;
    }
  }
}

/**
 * JIT-provision a trainers row for the Clerk user.
 * Uses INSERT … ON CONFLICT DO NOTHING + SELECT so concurrent first requests
 * from the same user cannot create duplicates.
 */
async function provisionTrainer(clerkUserId: string): Promise<Trainer | null> {
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
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkUserId = userId;

  try {
    const trainer = await provisionTrainer(userId);
    if (!trainer) {
      logger.error({ clerkUserId: userId }, "Failed to provision trainer row");
      res.status(500).json({ error: "Failed to provision trainer account" });
      return;
    }
    req.trainer = trainer;
    next();
  } catch (err) {
    logger.error({ err, clerkUserId: userId }, "requireAuth: DB error during provisioning");
    res.status(500).json({ error: "Internal server error" });
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
  const raw = process.env.CATALOGUE_ADMIN_CLERK_IDS ?? "";
  const adminIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminIds.length === 0) {
    // No admin configured — fail closed.
    res.status(403).json({ error: "Catalogue mutations are disabled: no admin configured" });
    return;
  }

  const clerkUserId = req.clerkUserId;
  if (!clerkUserId || !adminIds.includes(clerkUserId)) {
    res.status(403).json({ error: "Forbidden: catalogue admin access required" });
    return;
  }

  next();
}
