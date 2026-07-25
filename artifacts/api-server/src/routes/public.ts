import { Router, type IRouter } from "express";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { SubmitPublicSurveyBody, SubmitPublicSurveyResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

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

  const trimmedEmail = parsed.data.email.trim();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    res.status(400).json({ error: "Nieprawidłowy adres e-mail" });
    return;
  }

  if (parsed.data.trainingGoal === "Inny" && (!parsed.data.trainingGoalOther || parsed.data.trainingGoalOther.trim() === "")) {
    res.status(400).json({ error: "Opis celu treningowego jest wymagany, gdy wybrano \"Inny\"" });
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

  // `dateOfBirth` is a plain "YYYY-MM-DD" string (see @workspace/api-zod's
  // `dateOnly` schema) — parse it into a `Date` only for validation/age math.
  const dateOfBirthDate = new Date(dateOfBirth);
  if (dateOfBirthDate.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const calculatedAge = calculateAge(dateOfBirthDate);

  // Insert client, then insert a new survey history row for them
  const [client] = await db
    .insert(clientsTable)
    .values({ firstName, lastName, email: trimmedEmail, phone })
    .returning();

  await db.insert(surveysTable).values({
    clientId: client.id,
    trainingGoal,
    trainingGoalOther,
    experienceLevel,
    trainingDuration,
    healthLimitations,
    injuryStatus: injuryStatus ?? null,
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
    trainingMotivation,
    sportsPriorities: sportsPriorities ?? [],
    avoidsAdvancedMethods,
    avoidedExerciseIds: avoidedExerciseIds ?? [],
    avoidedExerciseReasons: avoidedExerciseReasons ?? {},
    avoidedExerciseOtherText: avoidedExerciseOtherText ?? null,
    avoidedExerciseOtherReason: avoidedExerciseOtherReason ?? null,
  });

  // Fire-and-forget email notification
  void sendNotificationEmail(
    `${firstName} ${lastName}`,
    trimmedEmail,
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
