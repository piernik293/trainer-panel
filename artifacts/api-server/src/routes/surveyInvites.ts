/**
 * Survey Invites — authenticated trainer endpoints
 *
 * POST /survey-invites   Create a one-time invitation link for a client.
 * GET  /survey-invites   List the caller's invites (for management UI).
 */

import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, surveyInvitesTable, trainersTable } from "@workspace/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const INVITE_EXPIRY_DAYS = 7;

/** Hashes the raw token with SHA-256 (never store the raw token). */
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const CreateInviteBody = z.object({
  intendedEmail: z.string().email().optional().nullable(),
});

// ─── POST /survey-invites ─────────────────────────────────────────────────────

router.post("/survey-invites", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // trainerId is ALWAYS derived from the authenticated session — never from body.
  const trainerId = req.trainer!.id;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(surveyInvitesTable)
    .values({
      trainerId,
      tokenHash,
      intendedEmail: parsed.data.intendedEmail ?? null,
      expiresAt,
    })
    .returning();

  logger.info({ inviteId: invite.id, trainerId }, "Survey invite created");

  res.status(201).json({
    id: invite.id,
    token: rawToken,
    intendedEmail: invite.intendedEmail,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  });
});

// ─── GET /survey-invites ──────────────────────────────────────────────────────
//
// Returns all non-archived invites for the authenticated trainer, newest first.
// Archived invites (archivedAt IS NOT NULL) are permanently hidden from the UI
// but remain in the database for audit purposes.

router.get("/survey-invites", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;

  const invites = await db
    .select({
      id: surveyInvitesTable.id,
      intendedEmail: surveyInvitesTable.intendedEmail,
      expiresAt: surveyInvitesTable.expiresAt,
      usedAt: surveyInvitesTable.usedAt,
      revokedAt: surveyInvitesTable.revokedAt,
      createdAt: surveyInvitesTable.createdAt,
    })
    .from(surveyInvitesTable)
    .where(
      and(
        eq(surveyInvitesTable.trainerId, trainerId),
        isNull(surveyInvitesTable.archivedAt),
      ),
    )
    .orderBy(desc(surveyInvitesTable.createdAt));

  res.json(invites);
});

// ─── PATCH /survey-invites/:id/archive (soft-archive) ────────────────────────
//
// Sets archivedAt = now() on the invite so it no longer appears in the trainer
// UI.  The row is never deleted — it stays in the DB for audit purposes.
//
// Rules:
//   • Only the owning trainer may archive their own invites (404 otherwise).
//   • Already-archived invites are rejected with 404.
//   • Active invitations (unused + unrevoked + not yet expired) are rejected
//     with 409 Conflict — the trainer must revoke the invite first.
//   • Used, revoked, or expired invitations may be archived freely.

router.patch("/survey-invites/:id/archive", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid invite ID" });
    return;
  }

  const trainerId = req.trainer!.id;

  // Fetch the invite first so we can evaluate its current state.
  const [existing] = await db
    .select({
      id:        surveyInvitesTable.id,
      expiresAt: surveyInvitesTable.expiresAt,
      usedAt:    surveyInvitesTable.usedAt,
      revokedAt: surveyInvitesTable.revokedAt,
    })
    .from(surveyInvitesTable)
    .where(
      and(
        eq(surveyInvitesTable.id, id),
        eq(surveyInvitesTable.trainerId, trainerId),
        isNull(surveyInvitesTable.archivedAt),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Invite not found or already archived" });
    return;
  }

  // Block archiving of active invitations.
  const isActive =
    !existing.usedAt &&
    !existing.revokedAt &&
    new Date(existing.expiresAt) > new Date();

  if (isActive) {
    res
      .status(409)
      .json({ error: "Active invitations cannot be archived. Revoke the invitation first." });
    return;
  }

  await db
    .update(surveyInvitesTable)
    .set({ archivedAt: new Date() })
    .where(eq(surveyInvitesTable.id, id))
    .returning();

  logger.info({ inviteId: id, trainerId }, "Survey invite archived");
  res.sendStatus(204);
});

// ─── DELETE /survey-invites/:id (revoke) ──────────────────────────────────────

router.delete("/survey-invites/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid invite ID" });
    return;
  }

  const trainerId = req.trainer!.id;

  const [invite] = await db
    .update(surveyInvitesTable)
    .set({ revokedAt: new Date() })
    // Must own the invite; cannot revoke already-used or already-revoked ones.
    .where(
      eq(surveyInvitesTable.id, id),
    )
    .returning();

  if (!invite || invite.trainerId !== trainerId) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
