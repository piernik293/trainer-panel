import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, trainerNotesTable, clientsTable } from "@workspace/db";
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
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * Verifies that the given client belongs to the authenticated trainer.
 * Returns false when the client does not exist or belongs to a different trainer.
 * Ownership is always derived through clients.trainer_id — never from request body
 * or query parameters.
 */
async function assertClientOwnership(clientId: number, trainerId: number): Promise<boolean> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)));
  return !!client;
}

// ─── GET /clients/:clientId/notes ────────────────────────────────────────────

router.get("/clients/:clientId/notes", requireAuth, async (req, res): Promise<void> => {
  const params = ListClientNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const notes = await db
    .select()
    .from(trainerNotesTable)
    .where(eq(trainerNotesTable.clientId, params.data.clientId))
    .orderBy(desc(trainerNotesTable.createdAt));

  res.json(ListClientNotesResponse.parse(notes));
});

// ─── POST /clients/:clientId/notes ───────────────────────────────────────────

router.post("/clients/:clientId/notes", requireAuth, async (req, res): Promise<void> => {
  const params = CreateClientNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
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

// ─── PATCH /clients/:clientId/notes/:noteId ───────────────────────────────────
// Ownership is derived through note → client → trainer.
// The URL's :clientId is validated but ownership is confirmed via the note's
// stored clientId so a mismatched URL cannot be used to reach a foreign note.

router.patch("/clients/:clientId/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
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

  // Derive ownership through note → client → trainer (do not rely on URL's clientId).
  const [note] = await db
    .select({ id: trainerNotesTable.id, clientId: trainerNotesTable.clientId })
    .from(trainerNotesTable)
    .where(eq(trainerNotesTable.id, params.data.noteId));

  if (!note || !await assertClientOwnership(note.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  // note.clientId must match the URL's clientId — a note cannot be mutated
  // through a different client's URL, even if that client belongs to the same trainer.
  if (note.clientId !== params.data.clientId) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  const [updated] = await db
    .update(trainerNotesTable)
    .set({ content: parsed.data.content, updatedAt: new Date() })
    .where(eq(trainerNotesTable.id, params.data.noteId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  res.json(UpdateClientNoteResponse.parse(updated));
});

// ─── DELETE /clients/:clientId/notes/:noteId ──────────────────────────────────
// Ownership is derived through note → client → trainer (same as PATCH).

router.delete("/clients/:clientId/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteClientNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Derive ownership through note → client → trainer.
  const [note] = await db
    .select({ id: trainerNotesTable.id, clientId: trainerNotesTable.clientId })
    .from(trainerNotesTable)
    .where(eq(trainerNotesTable.id, params.data.noteId));

  if (!note || !await assertClientOwnership(note.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  // note.clientId must match the URL's clientId.
  if (note.clientId !== params.data.clientId) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  const [deleted] = await db
    .delete(trainerNotesTable)
    .where(eq(trainerNotesTable.id, params.data.noteId))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Notatka nie znaleziona" });
    return;
  }

  res.sendStatus(204);
});

export default router;
