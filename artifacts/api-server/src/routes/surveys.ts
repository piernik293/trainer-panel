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

// The `dateOfBirth` column is stored as a plain YYYY-MM-DD date, but the
// generated response schemas coerce it to a `Date`, which JSON-serializes as
// a full ISO timestamp (e.g. "1990-05-15T00:00:00.000Z"). The trainer app
// binds this value directly to an `<input type="date">`, which requires an
// exact "YYYY-MM-DD" string — anything else renders as blank/invalid. Trim
// back down to a date-only string before sending the response.
function toDateOnlyResponse<T extends { dateOfBirth?: Date | null }>(survey: T): T {
  if (survey.dateOfBirth instanceof Date) {
    return { ...survey, dateOfBirth: survey.dateOfBirth.toISOString().slice(0, 10) as unknown as Date };
  }
  return survey;
}

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

  res.json(toDateOnlyResponse(GetClientSurveyResponse.parse(survey)));
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

  res.json(ListClientSurveysResponse.parse(surveys).map(toDateOnlyResponse));
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

  res.json(toDateOnlyResponse(GetClientSurveyByIdResponse.parse(survey)));
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

  const { dateOfBirth, ...rest } = parsed.data;
  if (dateOfBirth && dateOfBirth.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const normalizedData = {
    ...rest,
    dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : undefined,
    age: dateOfBirth ? calculateAge(dateOfBirth) : rest.age,
  };

  const [survey] = await db
    .insert(surveysTable)
    .values({ ...normalizedData, clientId: params.data.clientId })
    .returning();

  res.json(toDateOnlyResponse(UpsertClientSurveyResponse.parse(survey)));
});

export default router;
