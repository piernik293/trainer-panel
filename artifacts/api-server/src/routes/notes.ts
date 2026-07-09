import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, trainerNotesTable } from "@workspace/db";
import {
  ListClientNotesParams,
  ListClientNotesResponse,
  CreateClientNoteParams,
  CreateClientNoteBody,
  CreateClientNoteResponse,
  UpdateClientNoteParams,
  UpdateClientNoteBody,
  UpdateClientNoteResponse,
  DeleteClientNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients/:clientId/notes", async (req, res): Promise<void> => {
  const params = ListClientNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const notes = await db
    .select()
    .from(trainerNotesTable)
    .where(eq(trainerNotesTable.clientId, params.data.clientId))
    .orderBy(desc(trainerNotesTable.createdAt));

  res.json(ListClientNotesResponse.parse(notes));
});

router.post("/clients/:clientId/notes", async (req, res): Promise<void> => {
  const params = CreateClientNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateClientNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .insert(trainerNotesTable)
    .values({ content: parsed.data.content, clientId: params.data.clientId })
    .returning();

  res.status(201).json(CreateClientNoteResponse.parse(note));
});

router.patch("/clients/:clientId/notes/:noteId", async (req, res): Promise<void> => {
  const params = UpdateClientNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .update(trainerNotesTable)
    .set({ content: parsed.data.content, updatedAt: new Date() })
    .where(and(eq(trainerNotesTable.clientId, params.data.clientId), eq(trainerNotesTable.id, params.data.noteId)))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  res.json(UpdateClientNoteResponse.parse(note));
});

router.delete("/clients/:clientId/notes/:noteId", async (req, res): Promise<void> => {
  const params = DeleteClientNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [note] = await db
    .delete(trainerNotesTable)
    .where(and(eq(trainerNotesTable.clientId, params.data.clientId), eq(trainerNotesTable.id, params.data.noteId)))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  res.sendStatus(204);
});

export default router;
