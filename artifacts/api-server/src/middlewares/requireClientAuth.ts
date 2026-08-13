/**
 * requireClientAuth middleware
 *
 * Authenticates the incoming request as a client (not a trainer).
 * Uses the same Clerk session token as trainer auth, but resolves the
 * authenticated identity against the clientsTable.clerkUserId column
 * instead of the trainersTable.
 *
 * IMPORTANT: The internal clientId is NEVER read from the request body,
 * query string, or custom headers.  The only authoritative source is
 * Clerk's signed session token, accessed via getAuth(req).
 *
 * On success: sets req.client = { id, clerkUserId } and calls next().
 * On failure:
 *   - 401 if there is no valid Clerk session.
 *   - 404 if the Clerk user has no matching client record.
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// Augment Express Request so downstream handlers have typed access.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Authenticated client context — set only after requireClientAuth succeeds */
      client?: { id: number; clerkUserId: string };
    }
  }
}

export async function requireClientAuth(
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

  try {
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.clerkUserId, userId));

    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony." });
      return;
    }

    req.client = { id: client.id, clerkUserId: userId };
    next();
  } catch (err) {
    logger.error({ err, clerkUserId: userId }, "requireClientAuth: DB error");
    res.status(500).json({ error: "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę." });
  }
}
