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
 * Key difference from the per-day pass:
 *   Uses SUM of all coefficients per exercise-target pair (not MAX) so the
 *   computation matches the activation check exactly.  For example, an
 *   exercise that trains both "lats" and "teres major" (both mapped to the
 *   Lats volume target) contributes coefficient₁ + coefficient₂ per set —
 *   the same amount the activation endpoint counts.
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
 *   }
 *
 * Guarantees:
 *   - Never returns more sets than the input.
 *   - Never returns below minimum (2 for main_compound, 1 for all others).
 *   - Response day/exercise order matches input exactly.
 *   - Non-fatal: errors return original sets unchanged.
 */

import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
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
      res.json(originalResponse());
      return;
    }

    try {
      const expLevel = survey?.experienceLevel ?? "Początkujący";
      const allExIds = [...new Set(allEntries.map((e) => e.id))];

      // 1. Load weekly absolute ceilings for this experience level.
      const guidelinesResult = await db.execute(sql`
        SELECT vg.volume_target_id::int          AS target_id,
               vg.weekly_absolute_ceiling::numeric AS ceiling
        FROM volume_guidelines vg
        JOIN volume_targets vt ON vt.id = vg.volume_target_id
        WHERE vg.experience_level = ${expLevel}
          AND vt.is_active = true
      `);

      const ceilingMap = new Map<number, number>();
      for (const row of guidelinesResult.rows as Array<Record<string, unknown>>) {
        ceilingMap.set(Number(row.target_id), Number(row.ceiling));
      }

      if (ceilingMap.size === 0) {
        res.json(originalResponse());
        return;
      }

      // 2. Load SUM of coefficients per exercise-target pair.
      //    SUM (not MAX) so that exercises contributing via multiple specific
      //    muscles to the same target (e.g. lats + teres major → Lats target)
      //    are counted the same way the activation endpoint counts them.
      const coeffResult = await db.execute(sql`
        SELECT ema.exercise_id::int          AS exercise_id,
               vtm.volume_target_id::int     AS target_id,
               SUM(ema.coefficient)::numeric AS total_coeff
        FROM exercise_muscle_assignments ema
        JOIN volume_target_members vtm
          ON vtm.specific_muscle_id = ema.specific_muscle_id
        JOIN volume_targets vt ON vt.id = vtm.volume_target_id
        WHERE vt.is_active = true
          AND ema.exercise_id = ANY(
                ARRAY[${sql.raw(allExIds.join(","))}]::int[]
              )
        GROUP BY ema.exercise_id, vtm.volume_target_id
      `);

      // exerciseId → Map<targetId, totalCoeff>
      const exCoeffMap = new Map<number, Map<number, number>>();
      for (const row of coeffResult.rows as Array<Record<string, unknown>>) {
        const exId = Number(row.exercise_id);
        const tId  = Number(row.target_id);
        const coef = Number(row.total_coeff);
        if (!exCoeffMap.has(exId)) exCoeffMap.set(exId, new Map());
        exCoeffMap.get(exId)!.set(tId, coef);
      }

      // 3. Mutable set-count array (indexed by flatIdx).
      const setCounts = days.flatMap((d) => d.exercises.map((e) => e.sets));

      // Helper: compute current total effective sets per target across all days.
      const computeWeeklyTotals = (): Map<number, number> => {
        const totals = new Map<number, number>();
        for (const entry of allEntries) {
          const coeffs = exCoeffMap.get(entry.id);
          if (!coeffs) continue;
          for (const [tId, coef] of coeffs) {
            totals.set(tId, (totals.get(tId) ?? 0) + setCounts[entry.flatIdx] * coef);
          }
        }
        return totals;
      };

      // Reduction tier: 0 = reduce first, 3 = reduce last.
      //   0 — core / regression_beginner  (reduce first — most optional)
      //   1 — isolation
      //   2 — secondary_compound
      //   3 — main_compound               (reduce last)
      const getReductionTier = (entry: ExEntry): number => {
        const ec = entry.exerciseClass;
        if (ec === "core" || ec === "regression_beginner") return 0;
        if (ec === "isolation")                            return 1;
        if (ec === "secondary_compound")                   return 2;
        return 3; // main_compound
      };

      // Minimum allowed sets per class.
      const minSets = (entry: ExEntry): number =>
        entry.exerciseClass === "main_compound" ? 2 : 1;

      // Pre-sort indices by (tier ASC, flatIdx ASC) so that within the same tier
      // the algorithm reduces Day 1 exercises before Day 2, Day 2 before Day 3 —
      // spreading reductions evenly across the week rather than gutting Day 3.
      const sortedIndices = allEntries
        .map((ex) => ({ fi: ex.flatIdx, tier: getReductionTier(ex) }))
        .sort((a, b) => a.tier - b.tier || a.fi - b.fi)
        .map(({ fi }) => fi);

      // 4. Balance loop — one set reduction per iteration.
      const MAX_ITER = 300;
      for (let iter = 0; iter < MAX_ITER; iter++) {
        const weeklyTotals = computeWeeklyTotals();

        // Find the target with the largest absolute overage.
        let worstTargetId = -1;
        let worstDeficit  = 0;
        for (const [tId, ceiling] of ceilingMap) {
          const total   = weeklyTotals.get(tId) ?? 0;
          const deficit = total - ceiling;
          if (deficit > worstDeficit) {
            worstDeficit  = deficit;
            worstTargetId = tId;
          }
        }

        if (worstDeficit <= 0) break; // All targets within ceiling.

        // Reduce the first exercise (lowest tier, earliest day) contributing
        // to the worst target that still has sets above its minimum.
        let reduced = false;
        for (const fi of sortedIndices) {
          if (setCounts[fi] <= minSets(allEntries[fi])) continue;
          const contrib = exCoeffMap.get(allEntries[fi].id)?.get(worstTargetId) ?? 0;
          if (contrib > 0) {
            const prev = setCounts[fi];
            setCounts[fi]--;
            reduced = true;
            console.log(
              `[WeekBalance] "${allEntries[fi].name}" ` +
              `day${allEntries[fi].dayIdx + 1} ` +
              `${prev}→${setCounts[fi]} sets ` +
              `(target=${worstTargetId} deficit=${worstDeficit.toFixed(2)})`,
            );
            break;
          }
        }

        if (!reduced) break; // Structural minimum reached on every contributor.
      }

      // 5. Log any remaining overages after the pass.
      const finalTotals = computeWeeklyTotals();
      for (const [tId, ceiling] of ceilingMap) {
        const total = finalTotals.get(tId) ?? 0;
        if (total > ceiling) {
          console.log(
            `[WeekBalance] Residual overage target ${tId}: ` +
            `${total.toFixed(2)} vs ceiling ${ceiling} ` +
            `(structural minimum hit — review guidelines or session count)`,
          );
        }
      }

      // 6. Rebuild response preserving day/exercise order exactly.
      const result = days.map((day, dIdx) => ({
        exercises: day.exercises.map((ex, eIdx) => {
          const entry = allEntries.find(
            (e) => e.dayIdx === dIdx && e.exIdx === eIdx,
          )!;
          return { id: ex.id, sets: setCounts[entry.flatIdx] };
        }),
      }));

      res.json({ days: result });
    } catch (err) {
      console.error("[WeekBalance] Non-fatal error:", err);
      // Return original sets unchanged so the generate flow is never blocked.
      res.json(originalResponse());
    }
  },
);

export default router;
