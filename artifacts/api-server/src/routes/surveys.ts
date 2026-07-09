import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, surveysTable } from "@workspace/db";
import {
  GetClientSurveyParams,
  UpsertClientSurveyParams,
  UpsertClientSurveyBody,
  GetClientSurveyResponse,
  UpsertClientSurveyResponse,
  ListClientSurveysParams,
  ListClientSurveysResponse,
  GetClientSurveyByIdParams,
  GetClientSurveyByIdResponse,
} from "@workspace/api-zod";

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

// Returns the client's most recent survey (used for the profile/edit-form prefill
// and as the "current" survey for overview/full-survey views).
router.get("/clients/:clientId/survey", async (req, res): Promise<void> => {
  const params = GetClientSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId))
    .orderBy(desc(surveysTable.createdAt))
    .limit(1);

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony" });
    return;
  }

  res.json(GetClientSurveyResponse.parse(survey));
});

// Full survey history for a client, newest first.
router.get("/clients/:clientId/surveys", async (req, res): Promise<void> => {
  const params = ListClientSurveysParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const surveys = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId))
    .orderBy(desc(surveysTable.createdAt));

  res.json(ListClientSurveysResponse.parse(surveys));
});

// A specific historical survey, for read-only viewing.
router.get("/clients/:clientId/surveys/:surveyId", async (req, res): Promise<void> => {
  const params = GetClientSurveyByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(and(eq(surveysTable.clientId, params.data.clientId), eq(surveysTable.id, params.data.surveyId)));

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony" });
    return;
  }

  res.json(GetClientSurveyByIdResponse.parse(survey));
});

// Always inserts a new survey row — surveys are append-only history so past
// answers are never lost when the trainer saves an updated interview.
router.put("/clients/:clientId/survey", async (req, res): Promise<void> => {
  const params = UpsertClientSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpsertClientSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // `dateOfBirth` is a plain "YYYY-MM-DD" string (see @workspace/api-zod's
  // `dateOnly` schema) — parse it into a `Date` only for validation/age math.
  const { dateOfBirth, ...rest } = parsed.data;
  const dateOfBirthDate = dateOfBirth ? new Date(dateOfBirth) : undefined;
  if (dateOfBirthDate && dateOfBirthDate.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const normalizedData = {
    ...rest,
    dateOfBirth,
    age: dateOfBirthDate ? calculateAge(dateOfBirthDate) : rest.age,
  };

  const [survey] = await db
    .insert(surveysTable)
    .values({ ...normalizedData, clientId: params.data.clientId })
    .returning();

  res.json(UpsertClientSurveyResponse.parse(survey));
});

export default router;
