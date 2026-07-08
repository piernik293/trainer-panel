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

  res.json(GetClientSurveyResponse.parse(survey));
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

  const [existing] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId));

  let survey;
  if (existing) {
    [survey] = await db
      .update(surveysTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(surveysTable.clientId, params.data.clientId))
      .returning();
  } else {
    [survey] = await db
      .insert(surveysTable)
      .values({ ...parsed.data, clientId: params.data.clientId })
      .returning();
  }

  res.json(UpsertClientSurveyResponse.parse(survey));
});

export default router;
