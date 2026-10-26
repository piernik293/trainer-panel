/**
 * Public survey routes (token-scoped)
 *
 * The old generic POST /public/survey has been removed. All client creation
 * now requires a valid one-time invitation token issued by an authenticated trainer.
 *
 * GET  /public/survey/:token   Validate a token and return metadata for the form.
 * POST /public/survey/:token   Submit the survey, create the client, consume the token.
 */

import { HEALTH_CONSENT_VERSION } from "@workspace/survey-config";
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, clientsTable, surveysTable, surveyInvitesTable } from "@workspace/db";
import { SubmitPublicSurveyBody } from "@workspace/api-zod";
import { PRIORITY_BEGINNER_MESSAGE, goalIsSport, isBeginnerLevel, resolveEffectiveLevel, EQUIPMENT_CONFLICT_MESSAGE, birthDateError, equipmentConflict, heightError, parseEquipment, weightError } from "@workspace/survey-config";
import { logger } from "../lib/logger";
import {
  assertSubscriptionLimitInTransaction,
  isSubscriptionLimitError,
} from "../services/subscriptionService";

const router: IRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) {
    age--;
  }
  return age;
}

/** Current link or the one before the last resend/reminder (see survey_invites.previous_token_hash). */
function matchesToken(tokenHash: string) {
  return or(eq(surveyInvitesTable.tokenHash, tokenHash), eq(surveyInvitesTable.previousTokenHash, tokenHash));
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function sendNotificationEmail(
  clientName: string,
  email: string | undefined,
  trainingGoal: string | undefined
): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];
  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];

  if (!adminEmail || !smtpHost || !smtpUser || !smtpPass) {
    logger.info("Email notification skipped — ADMIN_EMAIL/SMTP_* not configured");
    return;
  }

  const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "587", 10);

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: adminEmail,
      subject: `Nowy wywiad treningowy od klienta: ${clientName}`,
      html: `
        <h2>Nowy wywiad treningowy</h2>
        <p><strong>Klient:</strong> ${clientName}</p>
        ${email ? `<p><strong>E-mail:</strong> ${email}</p>` : ""}
        ${trainingGoal ? `<p><strong>Cel treningowy:</strong> ${trainingGoal}</p>` : ""}
        <p>Zaloguj się do Panelu Trenera, aby zobaczyć pełny wywiad treningowy.</p>
      `,
    });

    logger.info({ adminEmail, clientName }, "Notification email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send notification email");
  }
}

// ─── GET /public/survey/:token ────────────────────────────────────────────────

router.get("/public/survey/:token", async (req, res): Promise<void> => {
  const rawToken = req.params.token;
  if (!rawToken || rawToken.length !== 64) {
    res.status(400).json({ error: "Nieprawidłowy token zaproszenia" });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [invite] = await db
    .select()
    .from(surveyInvitesTable)
    .where(matchesToken(tokenHash));

  if (!invite) {
    res.status(404).json({ code: "INVITE_NOT_FOUND", error: "Nieprawidłowy link zaproszeniowy" });
    return;
  }

  if (invite.revokedAt) {
    res.status(410).json({ code: "INVITE_REVOKED", error: "Link zaproszeniowy został odwołany" });
    return;
  }

  if (invite.usedAt) {
    res.status(410).json({ code: "INVITE_USED", error: "Link zaproszeniowy został już wykorzystany" });
    return;
  }

  if (invite.expiresAt < now) {
    res.status(410).json({ code: "INVITE_EXPIRED", error: "Link zaproszeniowy wygasł" });
    return;
  }

  // First opening of the link → "Otwarte" on the trainer's list.
  if (!invite.openedAt) {
    await db
      .update(surveyInvitesTable)
      .set({ openedAt: now })
      .where(and(eq(surveyInvitesTable.id, invite.id), isNull(surveyInvitesTable.openedAt)));
  }

  // Invitation tied to an existing client: personal data comes from the client
  // record, so the interview skips the name / contact screens.
  let existingClient: { firstName: string; lastName: string; email: string | null; phone: string | null } | null = null;
  if (invite.clientId) {
    const [c] = await db
      .select({ firstName: clientsTable.firstName, lastName: clientsTable.lastName, email: clientsTable.email, phone: clientsTable.phone })
      .from(clientsTable)
      .where(eq(clientsTable.id, invite.clientId));
    existingClient = c ?? null;
  }

  res.json({
    valid: true,
    intendedEmail: invite.intendedEmail ?? null,
    clientName: invite.clientName ?? null,
    existingClient,
    expiresAt: invite.expiresAt,
  });
});

// ─── POST /public/survey/:token ───────────────────────────────────────────────

router.post("/public/survey/:token", async (req, res): Promise<void> => {
  const rawToken = req.params.token;
  if (!rawToken || rawToken.length !== 64) {
    res.status(400).json({ error: "Nieprawidłowy token zaproszenia" });
    return;
  }

  const parsed = SubmitPublicSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Consent to process health data (owner's decision, block 5d). healthConsent === false → the health questions were not asked:
  // whatever came with the request in those fields is dropped. Omitted (older client) → legacy behaviour below.
  const consentDeclined = parsed.data.healthConsent === false;
  if (consentDeclined) { parsed.data.injuryStatus = undefined; parsed.data.healthLimitations = ""; }
  // Health question is mandatory when consent is given (answer "Brak" or "Tak"); "Tak" needs a description.
  if (!consentDeclined && !parsed.data.injuryStatus) {
    res.status(400).json({ error: "Odpowiedz na pytanie o kontuzje i ograniczenia ruchowe." });
    return;
  }
  if (parsed.data.injuryStatus === "Tak" && !parsed.data.healthLimitations?.trim()) {
    res.status(400).json({ error: "Opisz swoje ograniczenia zdrowotne, kontuzje lub dolegliwości bólowe." });
    return;
  }

  const trimmedEmail = parsed.data.email.trim();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    res.status(400).json({ error: "Nieprawidłowy adres e-mail" });
    return;
  }

  if (parsed.data.trainingGoal === "Inny" && (!parsed.data.trainingGoalOther || parsed.data.trainingGoalOther.trim() === "")) {
    res.status(400).json({ error: "Opis celu treningowego jest wymagany, gdy wybrano \"Inny\"" });
    return;
  }

  // Pre-validate the token BEFORE parsing the body so that expired/revoked
  // tokens always return 410 regardless of whether the body is valid.
  // The transaction re-checks atomically — this is just an early-exit guard.
  const tokenHash = hashToken(rawToken);
  const preNow = new Date();

  const [precheck] = await db
    .select()
    .from(surveyInvitesTable)
    .where(matchesToken(tokenHash));

  if (!precheck) {
    res.status(404).json({ error: "Nieprawidłowy link zaproszeniowy" });
    return;
  }
  if (precheck.revokedAt) {
    res.status(410).json({ error: "Link zaproszeniowy został odwołany" });
    return;
  }
  if (precheck.usedAt) {
    res.status(410).json({ error: "Link zaproszeniowy został już wykorzystany" });
    return;
  }
  if (precheck.expiresAt < preNow) {
    res.status(410).json({ error: "Link zaproszeniowy wygasł" });
    return;
  }

  const {
    firstName,
    lastName,
    phone,
    trainingGoal,
    trainingGoalOther,
    experienceLevel,
    trainingDuration,
    healthLimitations,
    injuryStatus,
    weeklyFrequency,
    desiredWeeklyFrequency,
    sessionDuration,
    preferredMuscles,
    avoidedMuscles,
    avoidedExercises,
    favoriteExercises,
    advancedMethodsToAvoid,
    additionalInfo,
    dateOfBirth,
    gender,
    heightCm,
    weightKg,
    activityLevel,
    sleepHours,
    stressLevel,
    planStylePreference,
    priorityMuscle1,
    priorityMuscle2,
    priorityMuscle3,
    trainingLocation,
    equipment,
    cardioPreference,
    cardioFrequency,
    preferredCardioType,
    jumpExperience,
    avoidsAdvancedMethods,
    athleteStatus,
    sportDiscipline,
    sportPerformanceNeeds,
    avoidedExerciseIds,
    avoidedExerciseReasons,
    avoidedExerciseOtherText,
    avoidedExerciseOtherReason,
    trainingMotivation,
    sportsPriorities,
  } = parsed.data;

  const dateOfBirthDate = new Date(dateOfBirth);
  if (dateOfBirthDate.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  // Same limits as the interview screens (lib/survey-config): age 16–90, height 120–230 cm, weight 35–250 kg.
  const bodyError = birthDateError(dateOfBirthDate.toISOString().slice(0, 10)) ?? heightError(heightCm) ?? weightError(weightKg);
  if (bodyError) {
    res.status(400).json({ error: bodyError });
    return;
  }
  // Beginners (effective level, 2-year rule included) pick at most one priority muscle group.
  const priorities = [priorityMuscle1, priorityMuscle2, priorityMuscle3].filter((m) => !!m && m.trim());
  if (isBeginnerLevel(resolveEffectiveLevel(experienceLevel, trainingDuration).effective ?? undefined) && priorities.length > 1) {
    res.status(400).json({ error: PRIORITY_BEGINNER_MESSAGE });
    return;
  }
  if (equipmentConflict(parseEquipment(equipment).items, parseEquipment(equipment).other)) {
    res.status(400).json({ error: EQUIPMENT_CONFLICT_MESSAGE });
    return;
  }
  const calculatedAge = calculateAge(dateOfBirthDate);

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the invite row via UPDATE WHERE usedAt IS NULL.
      // Only the first concurrent request will succeed — the second gets 0 rows back.
      const now = new Date();
      const [consumed] = await tx
        .update(surveyInvitesTable)
        .set({ usedAt: now })
        .where(
          and(
            matchesToken(tokenHash),
            isNull(surveyInvitesTable.usedAt),
            isNull(surveyInvitesTable.revokedAt),
            gt(surveyInvitesTable.expiresAt, now),
          ),
        )
        .returning();

      if (!consumed) {
        // Token was invalid, already used, revoked, or expired.
        throw Object.assign(new Error("TOKEN_INVALID"), { code: "TOKEN_INVALID" });
      }

      // trainerId is derived ONLY from the invite — never from the request body.
      const trainerId = consumed.trainerId;

      // If the invite is tied to a pre-existing client (trainer used "Nowy Klient"),
      // skip creating a new client and attach the survey to the existing one.
      let clientId: number;
      if (consumed.clientId) {
        clientId = consumed.clientId;
      } else {
        await assertSubscriptionLimitInTransaction(tx, trainerId, "clients");
        const [client] = await tx
          .insert(clientsTable)
          .values({ firstName, lastName, email: trimmedEmail, phone, trainerId })
          .returning();
        clientId = client.id;
        // Link the invitation to the new client ("Zobacz odpowiedzi" on the list).
        await tx.update(surveyInvitesTable).set({ clientId }).where(eq(surveyInvitesTable.id, consumed.id));
      }

      await tx.insert(surveysTable).values({
        clientId,
        trainingGoal,
        trainingGoalOther,
        experienceLevel,
        trainingDuration,
        healthLimitations,
        injuryStatus: injuryStatus ?? null,
        healthConsentStatus: parsed.data.healthConsent === true ? "given" : parsed.data.healthConsent === false ? "declined" : null,
        healthConsentAt: parsed.data.healthConsent === undefined ? null : new Date(),
        healthConsentVersion: parsed.data.healthConsent === undefined ? null : HEALTH_CONSENT_VERSION,
        athleteStatus: athleteStatus ?? null,
        sportDiscipline: sportDiscipline ?? null,
        sportPerformanceNeeds: sportPerformanceNeeds ?? [],
        weeklyFrequency,
        desiredWeeklyFrequency,
        sessionDuration,
        preferredMuscles,
        avoidedMuscles,
        avoidedExercises,
        favoriteExercises,
        advancedMethodsToAvoid: advancedMethodsToAvoid ?? [],
        additionalInfo,
        age: calculatedAge,
        dateOfBirth: dateOfBirthDate.toISOString().split("T")[0],
        gender,
        heightCm,
        weightKg,
        activityLevel,
        sleepHours,
        stressLevel,
        planStylePreference,
        priorityMuscle1,
        priorityMuscle2,
        priorityMuscle3,
        trainingLocation,
        equipment,
        cardioPreference,
        cardioFrequency,
        preferredCardioType,
        jumpExperience: goalIsSport(trainingGoal) ? jumpExperience ?? null : null,
        trainingMotivation,
        sportsPriorities: sportsPriorities ?? [],
        avoidsAdvancedMethods,
        avoidedExerciseIds: avoidedExerciseIds ?? [],
        avoidedExerciseReasons: avoidedExerciseReasons ?? {},
        avoidedExerciseOtherText: avoidedExerciseOtherText ?? null,
        avoidedExerciseOtherReason: avoidedExerciseOtherReason ?? null,
      });

      logger.info({ clientId, trainerId, inviteId: consumed.id }, "Survey invite submission processed");
      return { clientId, firstName, lastName, trainingGoal };
    });

    // Fire-and-forget email notification
    void sendNotificationEmail(
      `${result.firstName} ${result.lastName}`,
      trimmedEmail,
      result.trainingGoal
    );

    res.status(201).json({
      success: true,
      clientId: result.clientId,
      message: "Dziękuję za wypełnienie wywiadu treningowego. Przeanalizuję Twoje odpowiedzi i przygotuję indywidualny plan treningowy.",
    });
  } catch (err) {
    if (isSubscriptionLimitError(err)) {
      res.status(409).json(err.toResponse());
      return;
    }
    if ((err as { code?: string }).code === "TOKEN_INVALID") {
      res.status(410).json({ error: "Link zaproszeniowy jest nieprawidłowy, wygasł lub został już wykorzystany." });
      return;
    }
    logger.error({ err }, "Failed to process survey invite submission");
    res.status(500).json({ error: "Błąd serwera. Spróbuj ponownie." });
  }
});

export default router;
