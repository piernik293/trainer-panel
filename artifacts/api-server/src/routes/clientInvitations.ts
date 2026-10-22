/**
 * Client Invitation routes
 *
 * Trainer-authenticated (requireAuth):
 *   POST   /clients/:clientId/invite          Create / refresh invitation link.
 *   GET    /clients/:clientId/invite/status   Current account + invitation state.
 *   DELETE /clients/:clientId/invite          Revoke active invitation.
 *
 * Public (token validation, no Clerk session required):
 *   GET    /client-invitations/:token         Validate a raw token.
 *
 * Client Clerk session (getAuth — NOT requireClientAuth, client has no DB record yet):
 *   POST   /client-invitations/:token/activate  Link Clerk user to client.
 *
 * ─── Security rules ──────────────────────────────────────────────────────────
 *   • Raw token is never stored; only the SHA-256 hash is persisted.
 *   • Trainer identity comes exclusively from the signed Clerk session.
 *   • clientId comes exclusively from the verified token — never from the body.
 *   • A client whose clerk_user_id is already set cannot be claimed again.
 *   • A Clerk user already linked to any client cannot claim another.
 *   • Expired / revoked / used tokens are all rejected with distinct states.
 *   • Foreign or invalid tokens always return 404 (no enumeration).
 */

import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { eq, and, isNull, gt, desc } from "drizzle-orm";
import {
  db,
  clientsTable,
  trainersTable,
  clientInvitationsTable,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const INVITE_EXPIRY_DAYS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Returns true and responds 404 when the client does not belong to the trainer. */
async function ownershipGuard(
  req: Request,
  res: Response,
  clientId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: clientsTable.id, clerkUserId: clientsTable.clerkUserId })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Klient nie znaleziony." });
    return false;
  }
  return true;
}

/**
 * Compute a concise account status for the trainer UI:
 *   "active"  — client.clerk_user_id is set
 *   "invited" — there is a non-expired, non-revoked, non-used invitation
 *   "none"    — no active invitation, no linked account
 */
async function resolveAccountStatus(clientId: number): Promise<{
  accountStatus: "active" | "invited" | "none";
  invitation: {
    id: number;
    expiresAt: Date;
    createdAt: Date;
    revokedAt: Date | null;
    usedAt: Date | null;
  } | null;
  clerkUserId: string | null;
}> {
  const [client] = await db
    .select({ clerkUserId: clientsTable.clerkUserId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (client?.clerkUserId) {
    return { accountStatus: "active", invitation: null, clerkUserId: client.clerkUserId };
  }

  // Find the most recent invitation (regardless of state) to show in UI.
  const [latestInvite] = await db
    .select({
      id: clientInvitationsTable.id,
      expiresAt: clientInvitationsTable.expiresAt,
      usedAt: clientInvitationsTable.usedAt,
      revokedAt: clientInvitationsTable.revokedAt,
      createdAt: clientInvitationsTable.createdAt,
    })
    .from(clientInvitationsTable)
    .where(eq(clientInvitationsTable.clientId, clientId))
    .orderBy(desc(clientInvitationsTable.createdAt))
    .limit(1);

  if (!latestInvite) {
    return { accountStatus: "none", invitation: null, clerkUserId: null };
  }

  const isActive =
    !latestInvite.usedAt &&
    !latestInvite.revokedAt &&
    new Date(latestInvite.expiresAt) > new Date();

  return {
    accountStatus: isActive ? "invited" : "none",
    invitation: latestInvite,
    clerkUserId: null,
  };
}

// ─── POST /clients/:clientId/invite ──────────────────────────────────────────
// Creates a new single-use activation link for the client.
// If a previous active invitation exists it is automatically revoked.

router.post("/clients/:clientId/invite", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Nieprawidłowy clientId." });
    return;
  }

  const trainerId = req.trainer!.id;

  const [client] = await db
    .select({ id: clientsTable.id, clerkUserId: clientsTable.clerkUserId })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony." });
    return;
  }

  if (client.clerkUserId) {
    res.status(409).json({ error: "Klient ma już aktywne konto w portalu." });
    return;
  }

  // Revoke any existing active invitation for this client.
  await db
    .update(clientInvitationsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(clientInvitationsTable.clientId, clientId),
        isNull(clientInvitationsTable.usedAt),
        isNull(clientInvitationsTable.revokedAt),
        gt(clientInvitationsTable.expiresAt, new Date()),
      ),
    );

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(clientInvitationsTable)
    .values({ clientId, trainerId, tokenHash, expiresAt })
    .returning();

  logger.info({ inviteId: invite.id, clientId, trainerId }, "Client invitation created");

  res.status(201).json({
    id: invite.id,
    token: rawToken,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  });
});

// ─── GET /clients/:clientId/invite/status ────────────────────────────────────
// Returns the current account and invitation status for a trainer's client.

router.get("/clients/:clientId/invite/status", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Nieprawidłowy clientId." });
    return;
  }

  const ok = await ownershipGuard(req, res, clientId);
  if (!ok) return;

  const status = await resolveAccountStatus(clientId);
  res.json(status);
});

// ─── DELETE /clients/:clientId/invite ────────────────────────────────────────
// Revokes the active invitation for a client.

router.delete("/clients/:clientId/invite", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Nieprawidłowy clientId." });
    return;
  }

  const ok = await ownershipGuard(req, res, clientId);
  if (!ok) return;

  const [revoked] = await db
    .update(clientInvitationsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(clientInvitationsTable.clientId, clientId),
        eq(clientInvitationsTable.trainerId, req.trainer!.id),
        isNull(clientInvitationsTable.usedAt),
        isNull(clientInvitationsTable.revokedAt),
        gt(clientInvitationsTable.expiresAt, new Date()),
      ),
    )
    .returning({ id: clientInvitationsTable.id });

  if (!revoked) {
    res.status(404).json({ error: "Brak aktywnego zaproszenia." });
    return;
  }

  logger.info({ inviteId: revoked.id, clientId }, "Client invitation revoked");
  res.sendStatus(204);
});

// ─── GET /client-invitations/:token ──────────────────────────────────────────
// Public endpoint: validates a raw token and returns the invite state.
// Returns 404 for any unknown/foreign token to prevent enumeration.
// Returns 410 with a machine-readable `state` for expired/revoked/used tokens
// so the client-side UI can show the correct error message.

router.get("/client-invitations/:token", async (req, res): Promise<void> => {
  const rawToken = req.params["token"];
  if (!rawToken || rawToken.length < 32) {
    res.status(404).json({ error: "Zaproszenie nie znalezione." });
    return;
  }

  const tokenHash = hashToken(rawToken);

  const [invite] = await db
    .select({
      id: clientInvitationsTable.id,
      clientId: clientInvitationsTable.clientId,
      expiresAt: clientInvitationsTable.expiresAt,
      usedAt: clientInvitationsTable.usedAt,
      revokedAt: clientInvitationsTable.revokedAt,
    })
    .from(clientInvitationsTable)
    .where(eq(clientInvitationsTable.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Zaproszenie nie znalezione." });
    return;
  }

  if (invite.revokedAt) {
    res.status(410).json({ state: "revoked", error: "Zaproszenie zostało odwołane." });
    return;
  }

  if (invite.usedAt) {
    res.status(410).json({ state: "used", error: "To zaproszenie zostało już wykorzystane." });
    return;
  }

  if (new Date(invite.expiresAt) <= new Date()) {
    res.status(410).json({ state: "expired", error: "Zaproszenie wygasło." });
    return;
  }

  // Fetch client name + email and trainer name for the UI context header.
  const [client] = await db
    .select({
      firstName: clientsTable.firstName,
      lastName: clientsTable.lastName,
      email: clientsTable.email,
      trainerId: clientsTable.trainerId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, invite.clientId))
    .limit(1);

  let trainerName: string | null = null;
  if (client?.trainerId != null) {
    const [trainer] = await db
      .select({ displayName: trainersTable.displayName, email: trainersTable.email })
      .from(trainersTable)
      .where(eq(trainersTable.id, client.trainerId))
      .limit(1);
    trainerName = trainer?.displayName ?? trainer?.email ?? null;
  }

  res.json({
    state: "valid",
    clientName: client ? `${client.firstName} ${client.lastName}`.trim() : null,
    clientEmail: client?.email ?? null,
    trainerName,
    expiresAt: invite.expiresAt,
  });
});

// ─── POST /client-invitations/:token/activate ─────────────────────────────────
// Consumes the invitation and links the authenticated Clerk user to the client.
//
// Auth model: uses getAuth(req) directly.
//   • requireClientAuth cannot be used here — the client has no DB record yet.
//   • The caller MUST have a valid Clerk session (just signed up or signed in).
//
// Concurrency guard: the UPDATE uses WHERE used_at IS NULL so exactly one
// concurrent request succeeds.

router.post("/client-invitations/:token/activate", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // A trainer account must never become a client portal account (roles stay
  // separate; see requireAuth / POST /trainer/profile).
  const [trainerAccount] = await db
    .select({ id: trainersTable.id })
    .from(trainersTable)
    .where(eq(trainersTable.clerkUserId, clerkUserId));
  if (trainerAccount) {
    res.status(403).json({
      error: "To konto jest kontem trenera. Użyj innego adresu e-mail.",
      code: "TRAINER_ACCOUNT",
    });
    return;
  }

  const rawToken = req.params["token"];
  if (!rawToken || rawToken.length < 32) {
    res.status(404).json({ error: "Zaproszenie nie znalezione." });
    return;
  }

  const tokenHash = hashToken(rawToken);

  const [invite] = await db
    .select({
      id: clientInvitationsTable.id,
      clientId: clientInvitationsTable.clientId,
      trainerId: clientInvitationsTable.trainerId,
      expiresAt: clientInvitationsTable.expiresAt,
      usedAt: clientInvitationsTable.usedAt,
      revokedAt: clientInvitationsTable.revokedAt,
    })
    .from(clientInvitationsTable)
    .where(eq(clientInvitationsTable.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Zaproszenie nie znalezione." });
    return;
  }

  if (invite.revokedAt) {
    res.status(410).json({ state: "revoked", error: "Zaproszenie zostało odwołane." });
    return;
  }

  if (invite.usedAt) {
    res.status(409).json({ state: "used", error: "To zaproszenie zostało już wykorzystane." });
    return;
  }

  if (new Date(invite.expiresAt) <= new Date()) {
    res.status(410).json({ state: "expired", error: "Zaproszenie wygasło." });
    return;
  }

  // Guard: this Clerk user is already linked to some client.
  const [alreadyLinked] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.clerkUserId, clerkUserId))
    .limit(1);

  if (alreadyLinked) {
    if (alreadyLinked.id === invite.clientId) {
      // Idempotent: same user, same client — treat as success.
      res.json({ message: "Konto jest już aktywne." });
    } else {
      // This Clerk account is linked to a DIFFERENT client — block.
      res.status(409).json({ error: "To konto Clerk jest już powiązane z innym profilem klienta." });
    }
    return;
  }

  // Guard: client is already linked to a different Clerk user.
  const [clientRow] = await db
    .select({ id: clientsTable.id, clerkUserId: clientsTable.clerkUserId })
    .from(clientsTable)
    .where(eq(clientsTable.id, invite.clientId))
    .limit(1);

  if (!clientRow) {
    res.status(404).json({ error: "Klient nie znaleziony." });
    return;
  }

  if (clientRow.clerkUserId) {
    res.status(409).json({ error: "Ten klient ma już powiązane konto." });
    return;
  }

  // Atomic write: link Clerk user + mark invite used.
  // The WHERE clause on the invite update acts as a concurrency guard.
  await db
    .update(clientsTable)
    .set({ clerkUserId })
    .where(and(eq(clientsTable.id, invite.clientId), isNull(clientsTable.clerkUserId)));

  const [marked] = await db
    .update(clientInvitationsTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(clientInvitationsTable.id, invite.id),
        isNull(clientInvitationsTable.usedAt),
      ),
    )
    .returning({ id: clientInvitationsTable.id });

  if (!marked) {
    // Another concurrent request beat us — the account is linked but by a race.
    res.status(409).json({ state: "used", error: "To zaproszenie zostało już wykorzystane." });
    return;
  }

  logger.info({ inviteId: invite.id, clientId: invite.clientId, clerkUserId }, "Client portal activated");
  res.json({ message: "Konto portalu klienta zostało aktywowane." });
});

export default router;
