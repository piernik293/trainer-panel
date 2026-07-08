import { Router, type IRouter } from "express";
import { eq, desc, count, isNotNull } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
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

const router: IRouter = Router();

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db
    .select()
    .from(clientsTable)
    .orderBy(desc(clientsTable.createdAt));

  const surveyClientIds = await db
    .select({ clientId: surveysTable.clientId })
    .from(surveysTable);

  const surveySet = new Set(surveyClientIds.map((s) => s.clientId));

  const result = clients.map((c) => ({ ...c, hasSurvey: surveySet.has(c.id) }));
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

  res.status(201).json(CreateClientResponse.parse({ ...client, hasSurvey: false }));
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

  const [survey] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.id));

  res.json(GetClientResponse.parse({ ...client, hasSurvey: !!survey }));
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

  const [survey] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.id));

  res.json(UpdateClientResponse.parse({ ...client, hasSurvey: !!survey }));
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
