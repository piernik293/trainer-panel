/**
 * Plan-Draft Record Generation — HTTP route
 *
 * POST /api/clients/:clientId/plan-draft/record-generation
 *
 * Commits a completed, validated plan-draft generation to the per-client
 * exercise-usage history log.  Called by the trainer-app frontend once after
 * ALL days have been generated and the balance-week pass has succeeded.
 *
 * Only automatically selected exercises from handleGenerateFromEmpty are
 * stored.  Manual or locked exercises are never passed to this endpoint.
 *
 * Idempotency (three cases):
 *   A. No rows exist for (client_id, generation_id)
 *      → insert the deduplicated exercise set, return 201.
 *   B. Rows exist and the stored set exactly equals the incoming set
 *      → return 200 { status: "already_committed" } — safe network retry.
 *   C. Rows exist but the stored set differs
 *      → return 409 — the same generationId was used for a different plan.
 *
 * All inserts run in one transaction.
 * The UNIQUE constraint (client_id, generation_id, exercise_id) is the
 * final database integrity guard; ON CONFLICT DO NOTHING is the safety net.
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  clientsTable,
  clientExerciseUsageLogTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  /** Frontend-generated UUID, created exactly once per Generate invocation. */
  generationId: z.string().uuid(),
  /** Automatically selected exercise IDs from all generated days. */
  exerciseIds: z.array(z.number().int().positive()).min(1),
});

router.post(
  "/clients/:clientId/plan-draft/record-generation",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = BodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body: " + body.error.message });
      return;
    }

    const { clientId } = params.data;
    const { generationId, exerciseIds } = body.data;

    // Verify client belongs to the authenticated trainer.
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony" });
      return;
    }

    // Deduplicate incoming IDs (§4 — frontend also deduplicates, this is the
    // server-side safety net).
    const uniqueExerciseIds = [...new Set(exerciseIds)];

    // ── Idempotency check ───────────────────────────────────────────────────────
    const existing = await db
      .select({ exerciseId: clientExerciseUsageLogTable.exerciseId })
      .from(clientExerciseUsageLogTable)
      .where(
        and(
          eq(clientExerciseUsageLogTable.clientId, clientId),
          eq(clientExerciseUsageLogTable.generationId, generationId),
        ),
      );

    if (existing.length > 0) {
      const storedSet = new Set(existing.map((r) => r.exerciseId));
      const incomingSet = new Set(uniqueExerciseIds);
      const setsMatch =
        storedSet.size === incomingSet.size &&
        [...incomingSet].every((id) => storedSet.has(id));

      if (setsMatch) {
        // §6-B: idempotent retry with the same payload — safe to return success.
        res.status(200).json({ generationId, status: "already_committed" });
        return;
      }

      // §6-C: same generationId, different exercise set — reject to prevent
      // accidentally merging two different plans under one generation ID.
      res.status(409).json({
        error:
          "generationId is already committed with a different exercise set. " +
          "Each Generate click must produce a new generationId.",
      });
      return;
    }

    // ── Insert in one transaction (§5) ──────────────────────────────────────────
    await db.transaction(async (tx) => {
      await tx
        .insert(clientExerciseUsageLogTable)
        .values(
          uniqueExerciseIds.map((exerciseId) => ({
            clientId,
            generationId,
            exerciseId,
          })),
        )
        .onConflictDoNothing(); // UNIQUE guard — safety net for race conditions
    });

    console.log(
      `GENERATION_COMMITTED: client=${clientId} generationId=${generationId} exercises=${uniqueExerciseIds.length}`,
    );
    res.status(201).json({ generationId, committed: uniqueExerciseIds.length });
  },
);

export default router;
