/**
 * Survey Invites — authenticated trainer endpoints
 *
 * POST /survey-invites   Create a one-time invitation link for a client.
 * GET  /survey-invites   List the caller's invites (for management UI).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, surveyInvitesTable } from "@workspace/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { buildPublicSurveyUrl, cleanText, cleanTrainerName, sendInviteEmail } from "../services/inviteEmail";
import { getTrainerIdentity } from "../services/trainerIdentity";

const router: IRouter = Router();

const INVITE_EXPIRY_DAYS = 7;

/** Hashes the raw token with SHA-256 (never store the raw token). */
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Default list window; older invitations are hidden. */
const LIST_WINDOW_DAYS = 30;
const REMINDER_COOLDOWN_MS = DAY_MS;

const CreateInviteBody = z.object({
  /** Client's first name (required by the screen; optional for older callers). */
  clientName: z.string().max(80).optional().nullable(),
  intendedEmail: z.string().email().optional().nullable(),
  /** Optional personal message for the e-mail (max 500 characters). */
  trainerMessage: z.string().max(500).optional().nullable(),
  /** Send the invitation by e-mail to intendedEmail (the link stays in the response). */
  sendEmail: z.boolean().optional(),
  /** Inviting trainer's name (fallback when Clerk is unavailable). */
  trainerName: z.string().max(200).optional().nullable(),
  /** Revoke an active invitation for the same client and create a new one. */
  replaceExisting: z.boolean().optional(),
});

export type InviteStatus = "sent" | "opened" | "completed" | "expired" | "revoked";

export function inviteStatus(
  i: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date; openedAt: Date | null },
  now = new Date(),
): InviteStatus {
  if (i.revokedAt) return "revoked";
  if (i.usedAt) return "completed";
  if (i.expiresAt.getTime() <= now.getTime()) return "expired";
  if (i.openedAt) return "opened";
  return "sent";
}

function isActive(i: Parameters<typeof inviteStatus>[0], now = new Date()) {
  const st = inviteStatus(i, now);
  return st === "sent" || st === "opened";
}

function sameClient(
  a: { intendedEmail: string | null; clientName: string | null },
  email: string | null,
  name: string | null,
): boolean {
  if (email) return (a.intendedEmail ?? "").trim().toLowerCase() === email.toLowerCase();
  // Without an e-mail: same first name, also without an e-mail.
  return !a.intendedEmail && !!name && (a.clientName ?? "").trim().toLowerCase() === name.toLowerCase();
}

async function senderFor(req: Request, bodyName: string | null) {
  const identity = await getTrainerIdentity(req.trainer!);
  return { trainerName: identity.fullName ?? bodyName, replyTo: identity.email };
}

type EmailOutcome = { requested: boolean; sent: boolean; code?: string; message?: string };

// ─── POST /survey-invites ─────────────────────────────────────────────────────

router.post("/survey-invites", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nieprawidłowe dane zaproszenia. Sprawdź imię, e-mail i wiadomość." });
    return;
  }

  // trainerId is ALWAYS derived from the authenticated session — never from body.
  const trainerId = req.trainer!.id;
  const clientName = cleanText(parsed.data.clientName, 80);
  const email = parsed.data.intendedEmail?.trim() || null;
  const trainerMessage = cleanText(parsed.data.trainerMessage, 500, { multiline: true });
  const now = new Date();

  // Duplicate: an active invitation for the same e-mail (or the same name without e-mail).
  const existing = await db
    .select()
    .from(surveyInvitesTable)
    .where(and(eq(surveyInvitesTable.trainerId, trainerId), isNull(surveyInvitesTable.archivedAt)));
  const duplicates = existing.filter((i) => isActive(i, now) && sameClient(i, email, clientName));
  if (duplicates.length > 0 && !parsed.data.replaceExisting) {
    const latest = duplicates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    res.status(409).json({
      code: "DUPLICATE_ACTIVE_INVITE",
      error: "Ten klient ma już aktywne zaproszenie.",
      existing: { id: latest.id, clientName: latest.clientName, createdAt: latest.createdAt },
    });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * DAY_MS);
  const wantsEmail = !!parsed.data.sendEmail;

  const invite = await db.transaction(async (tx) => {
    for (const d of duplicates) {
      // Replaced, never deleted: the previous invitation becomes revoked.
      await tx
        .update(surveyInvitesTable)
        .set({ revokedAt: now })
        .where(and(eq(surveyInvitesTable.id, d.id), eq(surveyInvitesTable.trainerId, trainerId)));
    }
    const [row] = await tx
      .insert(surveyInvitesTable)
      .values({
        trainerId,
        tokenHash: hashToken(rawToken),
        intendedEmail: email,
        clientName,
        trainerMessage,
        channel: wantsEmail ? "email" : "link",
        expiresAt,
      })
      .returning();
    return row;
  });

  logger.info({ inviteId: invite.id, trainerId, replaced: duplicates.length }, "Survey invite created");

  const url = buildPublicSurveyUrl(rawToken);
  let emailOutcome: EmailOutcome = { requested: false, sent: false };
  if (wantsEmail) {
    if (!email) {
      emailOutcome = { requested: true, sent: false, code: "NO_RECIPIENT", message: "Podaj adres e-mail klienta, aby wysłać zaproszenie." };
    } else {
      const sender = await senderFor(req, cleanTrainerName(parsed.data.trainerName));
      const result = await sendInviteEmail({
        to: email, ...sender, clientName, trainerMessage, url, expiresAt, kind: "invite",
      });
      emailOutcome = result.sent
        ? { requested: true, sent: true }
        : { requested: true, sent: false, code: result.code, message: result.message };
      if (result.sent) {
        await db.update(surveyInvitesTable).set({ lastSentAt: new Date() }).where(eq(surveyInvitesTable.id, invite.id));
      }
    }
  }

  res.status(201).json({
    id: invite.id,
    token: rawToken,
    url,
    email: emailOutcome,
    intendedEmail: invite.intendedEmail,
    clientName: invite.clientName,
    channel: invite.channel,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    replacedInviteIds: duplicates.map((d) => d.id),
  });
});

// ─── GET /survey-invites ──────────────────────────────────────────────────────
//
// Last 30 days, newest first, with a computed status. Archived invites are
// hidden (they stay in the database for audit purposes).

router.get("/survey-invites", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;
  const now = new Date();

  const rows = await db
    .select()
    .from(surveyInvitesTable)
    .where(
      and(
        eq(surveyInvitesTable.trainerId, trainerId),
        isNull(surveyInvitesTable.archivedAt),
      ),
    )
    .orderBy(desc(surveyInvitesTable.createdAt));

  const since = now.getTime() - LIST_WINDOW_DAYS * DAY_MS;
  res.json(
    rows
      .filter((i) => new Date(i.createdAt).getTime() >= since || isActive(i, now))
      .map((i) => ({
        id: i.id,
        clientName: i.clientName ?? null,
        intendedEmail: i.intendedEmail,
        channel: i.channel ?? (i.intendedEmail ? "email" : "link"),
        status: inviteStatus(i, now),
        clientId: i.clientId ?? null,
        expiresAt: i.expiresAt,
        usedAt: i.usedAt,
        revokedAt: i.revokedAt,
        openedAt: i.openedAt ?? null,
        lastSentAt: i.lastSentAt ?? null,
        remindedAt: i.remindedAt ?? null,
        createdAt: i.createdAt,
      })),
  );
});

// ─── POST /survey-invites/:id/resend and /:id/remind ─────────────────────────
//
// The raw token is never stored, so a new e-mail carries a new token. The
// previous link keeps working (previous_token_hash) — a client who already
// started from the first e-mail does not lose access. E-mails for one
// invitation: at most one per 24 h. A link-only invitation gets a fresh link
// in the response instead of an e-mail.

async function rotateAndSend(
  req: Request,
  res: Response,
  kind: "resend" | "reminder",
): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Nieprawidłowe zaproszenie." });
    return;
  }
  const trainerId = req.trainer!.id;
  const now = new Date();
  const [inv] = await db
    .select()
    .from(surveyInvitesTable)
    .where(and(eq(surveyInvitesTable.id, id), eq(surveyInvitesTable.trainerId, trainerId), isNull(surveyInvitesTable.archivedAt)));
  if (!inv) {
    res.status(404).json({ error: "Nie znaleziono zaproszenia." });
    return;
  }
  const status = inviteStatus(inv, now);
  const allowed = kind === "resend" ? status === "sent" : status === "opened" || status === "sent";
  if (!allowed) {
    res.status(409).json({ code: "INVITE_NOT_ACTIVE", error: "To zaproszenie nie jest już aktywne." });
    return;
  }
  const byEmail = (inv.channel ?? (inv.intendedEmail ? "email" : "link")) === "email" && !!inv.intendedEmail;
  const lastEmail = Math.max(inv.lastSentAt?.getTime() ?? 0, inv.remindedAt?.getTime() ?? 0);
  if (byEmail && lastEmail && now.getTime() - lastEmail < REMINDER_COOLDOWN_MS) {
    const nextAt = new Date(lastEmail + REMINDER_COOLDOWN_MS);
    res.status(429).json({
      code: "REMINDER_TOO_SOON",
      error: `Kolejny e-mail możesz wysłać po ${nextAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`,
      nextAllowedAt: nextAt,
    });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const url = buildPublicSurveyUrl(rawToken);
  let emailOutcome: EmailOutcome = { requested: false, sent: false };
  if (byEmail) {
    const sender = await senderFor(req, null);
    const result = await sendInviteEmail({
      to: inv.intendedEmail!, ...sender, clientName: inv.clientName ?? null, trainerMessage: inv.trainerMessage ?? null,
      url, expiresAt: inv.expiresAt, kind: kind === "reminder" ? "reminder" : "invite",
    });
    if (!result.sent) {
      // Nothing changes when the e-mail did not go out (the current link stays valid).
      res.status(502).json({ code: result.code, error: result.message, email: { requested: true, sent: false, code: result.code, message: result.message } });
      return;
    }
    emailOutcome = { requested: true, sent: true };
  }

  await db
    .update(surveyInvitesTable)
    .set({
      previousTokenHash: inv.tokenHash,
      tokenHash: hashToken(rawToken),
      ...(byEmail ? (kind === "reminder" ? { remindedAt: now, lastSentAt: now } : { lastSentAt: now }) : {}),
    })
    .where(and(eq(surveyInvitesTable.id, id), eq(surveyInvitesTable.trainerId, trainerId)));

  logger.info({ inviteId: id, trainerId, kind, byEmail }, "Survey invite re-sent");
  res.json({ id, token: rawToken, url, email: emailOutcome });
}

router.post("/survey-invites/:id/resend", requireAuth, (req, res) => rotateAndSend(req, res, "resend"));
router.post("/survey-invites/:id/remind", requireAuth, (req, res) => rotateAndSend(req, res, "reminder"));

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
    // trainerId filter is part of the WHERE — the update only fires for owned invites.
    .where(
      and(
        eq(surveyInvitesTable.id, id),
        eq(surveyInvitesTable.trainerId, trainerId),
      ),
    )
    .returning();

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
