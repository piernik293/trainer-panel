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
import { db, clientsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  completeAndRecordGeneration,
  isGenerationSessionError,
} from "../services/subscriptionService";

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

    try {
      const result = await completeAndRecordGeneration({
        trainerId: req.trainer!.id,
        clientId,
        generationId,
        exerciseIds: uniqueExerciseIds,
      });
      req.log?.info(
        { clientId, generationId, exerciseCount: result.committed },
        "Generation history committed",
      );
      if (result.status === "already_committed") {
        res.status(200).json({ generationId, status: result.status });
        return;
      }
      res.status(201).json({ generationId, committed: result.committed });
    } catch (error) {
      if (isGenerationSessionError(error)) {
        res.status(409).json(error.toResponse());
        return;
      }
      throw error;
    }
  },
);

export default router;
