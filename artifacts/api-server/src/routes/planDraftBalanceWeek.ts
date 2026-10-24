/**
 * Plan-Draft Balance Week — HTTP route
 *
 * POST /api/clients/:clientId/plan-draft/balance-week
 *
 * Receives the complete multi-day draft (all days at once) and applies a
 * whole-week volume rebalancing pass that can reduce sets across ANY day —
 * not just the current day — to bring every volume target within its
 * absolute weekly ceiling.
 *
 * Unlike the per-day balance pass in generate-day (which can only touch the
 * current session because previous days' sets are already locked), this
 * endpoint sees the full week and solves the problem globally, one
 * set-reduction at a time, using the same reduction-tier priority ordering.
 *
 * Counting: exactly like plan activation (computeVolumeCore, max-coefficient rule, same guideline version
 * and level mapping) — a draft balanced here is never rejected by activation for a volume ceiling,
 * including indirect load (e.g. triceps from push-ups / presses). Algorithm: services/weekBalance.ts.
 *
 * Body:
 *   {
 *     days: Array<{
 *       exercises: Array<{
 *         id: number;             // exercise DB id
 *         sets: number;           // currently prescribed sets
 *         exerciseClass?: string; // "main_compound"|"secondary_compound"|"isolation"|"core"|...
 *         name?: string;          // for logging
 *       }>;
 *     }>;
 *   }
 *
 * Response:
 *   {
 *     days: Array<{
 *       exercises: Array<{ id: number; sets: number }>;
 *     }>;
 *     residual: Array<{ targetName; weeklyEffectiveSets; weeklyAbsoluteCeiling }>; // over-ceiling after balancing (normally empty)
 *   }
 *
 * Guarantees:
 *   - Never returns more sets than the input.
 *   - Keeps 2 sets for main_compound and 1 for others; only if that cannot meet the ceiling, goes down to 1 set.
 *   - Response day/exercise order matches input exactly.
 *   - Non-fatal: errors return original sets unchanged.
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, clientsTable, surveysTable, volumeGuidelineVersionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { loadExerciseAssignments, loadGuidelineMap, loadTargetMap, mapToGuidelineLevel } from "../services/volumeCalculator";
import { balanceWeek } from "../services/weekBalance";
import {
  isGenerationSessionError,
  runWithActiveGenerationSession,
} from "../services/subscriptionService";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  generationId: z.string().uuid(),
  days: z.array(
    z.object({
      exercises: z.array(
        z.object({
          id: z.number().int().positive(),
          sets: z.number().int().min(0),
          exerciseClass: z.string().optional(),
          name: z.string().optional(),
        }),
      ),
    }),
  ),
});

router.post(
  "/clients/:clientId/plan-draft/balance-week",
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
    const { days } = body.data;

    // Verify client belongs to the authenticated trainer.
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony" });
      return;
    }

    try {
      await runWithActiveGenerationSession({
        trainerId: req.trainer!.id,
        clientId,
        generationId: body.data.generationId,
        dayExerciseIds: days.map((day) => day.exercises.map((exercise) => exercise.id)),
      }, async () => {

        // Fetch latest survey for experience level.
        const [survey] = await db
      .select({ experienceLevel: surveysTable.experienceLevel })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    // Build a flat list of all exercises across all days for the algorithm.
    type ExEntry = {
      dayIdx: number;
      exIdx: number;
      flatIdx: number;
      id: number;
      exerciseClass: string;
      name: string;
    };

    const allEntries: ExEntry[] = [];
    let flatIdx = 0;
    for (let d = 0; d < days.length; d++) {
      for (let e = 0; e < days[d].exercises.length; e++) {
        const ex = days[d].exercises[e];
        allEntries.push({
          dayIdx: d,
          exIdx: e,
          flatIdx: flatIdx++,
          id: ex.id,
          exerciseClass: ex.exerciseClass ?? "isolation",
          name: ex.name ?? `exercise#${ex.id}`,
        });
      }
    }

    // Return original sets helper.
    const originalResponse = () => ({
      days: days.map((d) => ({
        exercises: d.exercises.map((e) => ({ id: e.id, sets: e.sets })),
      })),
    });

    if (allEntries.length === 0) {
      res.json({ ...originalResponse(), residual: [] });
      return;
    }

    try {
      // Same inputs as saving + activating the plan: the survey level (plans/draft stores it as
      // experienceLevelUsed), mapped like calculatePlanVolume, and the active guideline version.
      const level = mapToGuidelineLevel(survey?.experienceLevel ?? "");
      const [activeVersion] = await db
        .select({ id: volumeGuidelineVersionsTable.id })
        .from(volumeGuidelineVersionsTable)
        .where(eq(volumeGuidelineVersionsTable.isActive, true))
        .orderBy(volumeGuidelineVersionsTable.id)
        .limit(1);
      if (!level || !activeVersion) {
        res.json({ ...originalResponse(), residual: [] });
        return;
      }
      const [targets, guidelines, assignments] = await Promise.all([
        loadTargetMap(),
        loadGuidelineMap(activeVersion.id, level),
        loadExerciseAssignments([...new Set(allEntries.map((e) => e.id))]),
      ]);
      const { sets, residual } = balanceWeek(
        allEntries.map((e) => ({ exerciseId: e.id, sets: days[e.dayIdx].exercises[e.exIdx].sets, exerciseClass: e.exerciseClass, dayIndex: e.dayIdx })),
        assignments, targets, guidelines,
      );
      for (const e of allEntries) {
        const before = days[e.dayIdx].exercises[e.exIdx].sets;
        if (sets[e.flatIdx] !== before) req.log?.info(`[WeekBalance] "${e.name}" day${e.dayIdx + 1} ${before}→${sets[e.flatIdx]} sets`);
      }
      for (const r of residual) {
        req.log?.warn(`[WeekBalance] Residual overage ${r.targetName}: ${r.weeklyEffectiveSets.toFixed(2)} vs ceiling ${r.weeklyAbsoluteCeiling}`);
      }

      // Rebuild response preserving day/exercise order exactly.
      const result = days.map((day, dIdx) => ({
        exercises: day.exercises.map((ex, eIdx) => {
          const entry = allEntries.find((e) => e.dayIdx === dIdx && e.exIdx === eIdx)!;
          return { id: ex.id, sets: sets[entry.flatIdx] };
        }),
      }));

        res.json({ days: result, residual });
      } catch (err) {
        req.log?.warn({ err }, "Week balance failed; returning original sets");
        // Return original sets unchanged so the generate flow is never blocked.
        res.json({ ...originalResponse(), residual: [] });
      }
      });
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
