import { Router, type IRouter } from "express";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { SubmitPublicSurveyBody, SubmitPublicSurveyResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) {
    age--;
  }
  return age;
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
    // Dynamic import to avoid errors when nodemailer is not needed
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
    // Don't throw — email failure should not fail the API request
  }
}

router.post("/public/survey", async (req, res): Promise<void> => {
  const parsed = SubmitPublicSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    trainingGoal,
    experienceLevel,
    trainingDuration,
    healthLimitations,
    weeklyFrequency,
    sessionDuration,
    preferredMuscles,
    avoidedMuscles,
    avoidedExercises,
    favoriteExercises,
    advancedMethodsToAvoid,
    additionalInfo,
    age,
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
    avoidsAdvancedMethods,
  } = parsed.data;

  if (dateOfBirth.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const dateOfBirthIso = dateOfBirth.toISOString().slice(0, 10);
  const calculatedAge = calculateAge(dateOfBirth);

  // Insert client, then insert a new survey history row for them
  const [client] = await db
    .insert(clientsTable)
    .values({ firstName, lastName, email, phone })
    .returning();

  await db.insert(surveysTable).values({
    clientId: client.id,
    trainingGoal,
    experienceLevel,
    trainingDuration,
    healthLimitations,
    weeklyFrequency,
    sessionDuration,
    preferredMuscles,
    avoidedMuscles,
    avoidedExercises,
    favoriteExercises,
    advancedMethodsToAvoid: advancedMethodsToAvoid ?? [],
    additionalInfo,
    age: calculatedAge,
    dateOfBirth: dateOfBirthIso,
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
    avoidsAdvancedMethods,
  });

  // Fire-and-forget email notification
  void sendNotificationEmail(
    `${firstName} ${lastName}`,
    email,
    trainingGoal
  );

  res.status(201).json(
    SubmitPublicSurveyResponse.parse({
      success: true,
      clientId: client.id,
      message: "Dziękuję za wypełnienie wywiadu treningowego. Przeanalizuję Twoje odpowiedzi i przygotuję indywidualny plan treningowy.",
    })
  );
});

export default router;
