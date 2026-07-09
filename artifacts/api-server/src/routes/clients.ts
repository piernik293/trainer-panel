import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, clientsTable, surveysTable, type Client, type Survey } from "@workspace/db";
import {
  CreateClientBody,
  UpdateClientBody,
  GetClientParams,
  UpdateClientParams,
  DeleteClientParams,
  GetClientResponse,
  ListClientsResponse,
  UpdateClientResponse,
  CreateClientResponse,
} from "@workspace/api-zod";
import { computeSurveyStatus, fetchLatestSurveyPerClient } from "../lib/survey-status";

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

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db
    .select()
    .from(clientsTable)
    .orderBy(desc(clientsTable.createdAt));

  const latestByClient = await fetchLatestSurveyPerClient();

  const result = clients.map((c) => toClientListItem(c, latestByClient.get(c.id)));
  res.json(ListClientsResponse.parse(result));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db
    .insert(clientsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateClientResponse.parse(toClientListItem(client, undefined)));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.id));

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

router.patch("/clients/:id", async (req, res): Promise<void> => {
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

  const [client] = await db
    .update(clientsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(clientsTable.id, params.data.id))
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

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, params.data.id))
    .returning();

  if (!client) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  res.sendStatus(204);
});

export default router;
