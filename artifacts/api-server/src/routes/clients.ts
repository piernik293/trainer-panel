import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";
import { db, clientsTable, surveysTable, surveyInvitesTable, type Client, type Survey } from "@workspace/db";
import {
  GetClientParams,
  UpdateClientParams,
  DeleteClientParams,
  GetClientResponse,
  ListClientsResponse,
  UpdateClientResponse,
  CreateClientResponse,
} from "@workspace/api-zod";
import { z } from "zod";
import { computeSurveyStatus, fetchLatestSurveyPerClient } from "../lib/survey-status";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  isSubscriptionLimitError,
  runWithSubscriptionLimit,
} from "../services/subscriptionService";

const router: IRouter = Router();

function toClientListItem(client: Client, latestSurvey: Survey | undefined) {
  return {
    ...client,
    hasSurvey: !!latestSurvey,
    surveyStatus: computeSurveyStatus(latestSurvey),
    lastSurveyDate: latestSurvey ? latestSurvey.createdAt : null,
    trainingGoal: latestSurvey?.trainingGoal ?? null,
    experienceLevel: latestSurvey?.experienceLevel ?? null,
    weeklyFrequency: latestSurvey?.weeklyFrequency ?? null,
    preferredMuscles: latestSurvey?.preferredMuscles ?? null,
    priorityMuscle1: latestSurvey?.priorityMuscle1 ?? null,
    trainingLocation: latestSurvey?.trainingLocation ?? null,
    cardioPreference: latestSurvey?.cardioPreference ?? null,
  };
}

/**
 * Allowlist of fields accepted in POST /clients body.
 * trainerId, id, createdAt are explicitly stripped — always set server-side.
 */
const CreateClientBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["active", "paused", "finished"]).optional(),
});

/**
 * Allowlist of fields accepted in PATCH /clients/:id body.
 * trainerId, id, createdAt are explicitly stripped — always set server-side.
 */
const UpdateClientBody = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["active", "paused", "finished"]).optional(),
  cooperationMode: z.enum(["online", "in_person", "hybrid"]).optional(),
});

// ─── GET /clients ─────────────────────────────────────────────────────────────

router.get("/clients", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;

  const clients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.trainerId, trainerId))
    .orderBy(desc(clientsTable.createdAt));

  // Scope the survey query to only this trainer's clients to avoid loading all
  // surveys into memory.  When the trainer has no clients yet, skip the DB call.
  const clientIds = clients.map((c) => c.id);
  const latestByClient =
    clientIds.length > 0 ? await fetchLatestSurveyPerClient(clientIds) : new Map();

  const result = clients.map((c) => toClientListItem(c, latestByClient.get(c.id)));
  res.json(ListClientsResponse.parse(result));
});

// ─── POST /clients ────────────────────────────────────────────────────────────

router.post("/clients", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trainerId = req.trainer!.id;

  try {
    const [client] = await runWithSubscriptionLimit(
      trainerId,
      "clients",
      (tx) =>
        tx
          .insert(clientsTable)
          .values({ ...parsed.data, trainerId })
          .returning(),
    );
    res.status(201).json(CreateClientResponse.parse(toClientListItem(client, undefined)));
  } catch (error) {
    if (isSubscriptionLimitError(error)) {
      res.status(409).json(error.toResponse());
      return;
    }
    throw error;
  }
});

// ─── POST /clients/:clientId/survey-invite ────────────────────────────────────
// Creates a public survey invitation for a pre-existing client.
// After creation, optionally sends the link to the client's email.
// Returns: { token, url, expiresAt, emailSent, emailError? }

const INVITE_EXPIRY_DAYS = 7;
const CLIENT_PORTAL_PATH = "/client-landing/survey";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildSurveyUrl(token: string): string {
  const localOrigin = process.env["LOCAL_CLIENT_PORTAL_ORIGIN"];
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const prodOrigin = process.env["CLIENT_PORTAL_ORIGIN"];
  const base = localOrigin ?? (devDomain ? `https://${devDomain}` : (prodOrigin ?? ""));
  return `${base}${CLIENT_PORTAL_PATH}/${token}`;
}

async function sendSurveyInviteEmail(
  toEmail: string,
  surveyUrl: string,
  expiresAt: Date,
): Promise<{ sent: boolean; error?: string }> {
  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { sent: false, error: "SMTP_HOST, SMTP_USER, SMTP_PASS not configured" };
  }

  const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const expiryStr = expiresAt.toLocaleDateString("pl-PL", {
    day: "numeric", month: "long", year: "numeric",
  });

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: toEmail,
      subject: "Twój wywiad treningowy",
      html: `
        <p>Twój trener zaprasza Cię do wypełnienia wywiadu treningowego.
        Odpowiedzi pozwolą przygotować plan dopasowany do Twoich potrzeb,
        możliwości i celu.</p>
        <p><a href="${surveyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;
          border-radius:6px;text-decoration:none;display:inline-block;">
          Wypełnij wywiad
        </a></p>
        <p><strong>Ważne:</strong> Link jest jednorazowy i wygasa ${expiryStr}.</p>
        <p>Jeśli link nie działa, skontaktuj się ze swoim trenerem, a wyśle Ci nowy.</p>
      `,
    });

    return { sent: true };
  } catch (err) {
    logger.error({ err, toEmail }, "Failed to send survey invite email");
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

router.post("/clients/:clientId/survey-invite", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params["clientId"]);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Nieprawidłowy clientId." });
    return;
  }

  const trainerId = req.trainer!.id;

  // Ownership guard — trainer can only invite their own clients.
  const [client] = await db
    .select({ id: clientsTable.id, email: clientsTable.email })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony." });
    return;
  }

  // Revoke any previous active invite for this client so only one is valid.
  await db
    .update(surveyInvitesTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(surveyInvitesTable.clientId, clientId),
        eq(surveyInvitesTable.trainerId, trainerId),
      ),
    );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(surveyInvitesTable)
    .values({ trainerId, clientId, tokenHash, intendedEmail: client.email ?? null, expiresAt })
    .returning();

  logger.info({ inviteId: invite.id, clientId, trainerId }, "Survey invite created for existing client");

  const url = buildSurveyUrl(rawToken);

  let emailSent = false;
  let emailError: string | undefined;

  if (client.email) {
    const emailResult = await sendSurveyInviteEmail(client.email, url, expiresAt);
    emailSent = emailResult.sent;
    emailError = emailResult.error;
  }

  res.status(201).json({
    id: invite.id,
    token: rawToken,
    url,
    expiresAt: invite.expiresAt,
    emailSent,
    ...(emailError !== undefined ? { emailError } : {}),
  });
});

// ─── GET /clients/:id ─────────────────────────────────────────────────────────

router.get("/clients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const trainerId = req.trainer!.id;

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.trainerId, trainerId)))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const clientSurveys = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.id))
    .orderBy(desc(surveysTable.createdAt));

  res.json(GetClientResponse.parse(toClientListItem(client, clientSurveys[0])));
});

// ─── PATCH /clients/:id ───────────────────────────────────────────────────────

router.patch("/clients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trainerId = req.trainer!.id;

  const [client] = await db
    .update(clientsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.trainerId, trainerId)))
    .returning();

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const clientSurveys = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.id))
    .orderBy(desc(surveysTable.createdAt));

  res.json(UpdateClientResponse.parse(toClientListItem(client, clientSurveys[0])));
});

// ─── PATCH /clients/:id/adaptive-start ───────────────────────────────────────

const AdaptiveStartBody = z.object({
  decision: z.enum(["accepted", "declined"]),
});

const AdaptiveStartParams = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Records the trainer's explicit decision on the adaptive-start recommendation.
 * Only eligible clients (beginners / sedentary) should receive this call from
 * the UI, but the endpoint itself is not gated on experience level so a trainer
 * can freely change their mind or override the system's eligibility judgement.
 */
router.patch("/clients/:id/adaptive-start", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = AdaptiveStartParams.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  const id = paramsResult.data.id;

  const parsed = AdaptiveStartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trainerId = req.trainer!.id;

  const [updated] = await db
    .update(clientsTable)
    .set({ adaptiveStartDecision: parsed.data.decision, updatedAt: new Date() })
    .where(and(eq(clientsTable.id, id), eq(clientsTable.trainerId, trainerId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  res.json({ adaptiveStartDecision: updated.adaptiveStartDecision });
});

// ─── DELETE /clients/:id ──────────────────────────────────────────────────────

router.delete("/clients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const trainerId = req.trainer!.id;

  const [client] = await db
    .delete(clientsTable)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.trainerId, trainerId)))
    .returning();

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  res.sendStatus(204);
});

export default router;
