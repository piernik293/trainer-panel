import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, clientsTable, surveysTable, type Client, type Survey } from "@workspace/db";
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
});

// ─── GET /clients ─────────────────────────────────────────────────────────────

router.get("/clients", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;

  const clients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.trainerId, trainerId))
    .orderBy(desc(clientsTable.createdAt));

  const latestByClient = await fetchLatestSurveyPerClient();

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

  const [client] = await db
    .insert(clientsTable)
    .values({ ...parsed.data, trainerId })
    .returning();

  res.status(201).json(CreateClientResponse.parse(toClientListItem(client, undefined)));
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
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.trainerId, trainerId)));

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
