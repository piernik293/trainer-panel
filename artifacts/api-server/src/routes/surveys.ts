import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, surveysTable } from "@workspace/db";
import {
  GetClientSurveyParams,
  UpsertClientSurveyParams,
  UpsertClientSurveyBody,
  GetClientSurveyResponse,
  UpsertClientSurveyResponse,
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

router.get("/clients/:clientId/survey", async (req, res): Promise<void> => {
  const params = GetClientSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId));

  if (!survey) {
    res.status(404).json({ error: "Ankieta nie znaleziona" });
    return;
  }

  const parsedSurvey = GetClientSurveyResponse.parse(survey);
  res.json({
    ...parsedSurvey,
    dateOfBirth: parsedSurvey.dateOfBirth ? parsedSurvey.dateOfBirth.toISOString().slice(0, 10) : parsedSurvey.dateOfBirth,
  });
});

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

  const [existing] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId));

  let survey;
  if (existing) {
    [survey] = await db
      .update(surveysTable)
      .set({ ...normalizedData, updatedAt: new Date() })
      .where(eq(surveysTable.clientId, params.data.clientId))
      .returning();
  } else {
    [survey] = await db
      .insert(surveysTable)
      .values({ ...normalizedData, clientId: params.data.clientId })
      .returning();
  }

  const parsedResponse = UpsertClientSurveyResponse.parse(survey);
  res.json({
    ...parsedResponse,
    dateOfBirth: parsedResponse.dateOfBirth ? parsedResponse.dateOfBirth.toISOString().slice(0, 10) : parsedResponse.dateOfBirth,
  });
});

export default router;
