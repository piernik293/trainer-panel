/**
 * Plan routes — all workout plan CRUD, day/exercise management, volume, activation.
 *
 * Uses inline Zod schemas (no codegen dependency).
 * Returns the full plan object (with days, exercises, and computed volume) after
 * every mutating operation so the frontend always has up-to-date state.
 */

import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, max } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  surveysTable,
  exercisesTable,
  volumeGuidelineVersionsTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  volumeGuidelinesTable,
  volumeTargetsTable,
  volumeTargetMembersTable,
} from "@workspace/db";
import { calculatePlanVolume, mapToGuidelineLevel } from "../services/volumeCalculator";

const router: IRouter = Router();

// ─── Inline Zod schemas ───────────────────────────────────────────────────────

const CreatePlanBody = z.object({
  title: z.string().min(1, "Tytuł planu jest wymagany"),
  surveyId: z.number().int().positive(),
});

const UpdatePlanBody = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["draft", "archived"]).optional(),
});

const CreatePlanDayBody = z.object({
  dayName: z.string().optional(),
});

const UpdatePlanDayBody = z.object({
  dayName: z.string().nullable().optional(),
  dayOrder: z.number().int().positive().optional(),
});

const CreatePlanExerciseBody = z.object({
  exerciseId: z.number().int().positive(),
  workingSets: z.number().int().min(1),
  warmUpSets: z.number().int().min(0).optional().default(0),
  repRangeMin: z.number().int().positive().nullable().optional(),
  repRangeMax: z.number().int().positive().nullable().optional(),
  rirOrRpe: z.string().nullable().optional(),
  restSeconds: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdatePlanExerciseBody = z.object({
  workingSets: z.number().int().min(1).optional(),
  warmUpSets: z.number().int().min(0).optional(),
  repRangeMin: z.number().int().positive().nullable().optional(),
  repRangeMax: z.number().int().positive().nullable().optional(),
  rirOrRpe: z.string().nullable().optional(),
  restSeconds: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  orderInDay: z.number().int().min(1).optional(),
  /** Move exercise to a different day */
  dayId: z.number().int().positive().optional(),
});

// ─── Helper: build the full plan response ────────────────────────────────────

async function getPlanFull(planId: number) {
  const [plan] = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) return null;

  const days = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId))
    .orderBy(workoutPlanDaysTable.dayOrder);

  const dayIds = days.map((d) => d.id);

  const exercises =
    dayIds.length > 0
      ? await db
          .select({
            id: workoutPlanExercisesTable.id,
            dayId: workoutPlanExercisesTable.dayId,
            exerciseId: workoutPlanExercisesTable.exerciseId,
            exerciseName: exercisesTable.name,
            orderInDay: workoutPlanExercisesTable.orderInDay,
            workingSets: workoutPlanExercisesTable.workingSets,
            warmUpSets: workoutPlanExercisesTable.warmUpSets,
            repRangeMin: workoutPlanExercisesTable.repRangeMin,
            repRangeMax: workoutPlanExercisesTable.repRangeMax,
            rirOrRpe: workoutPlanExercisesTable.rirOrRpe,
            restSeconds: workoutPlanExercisesTable.restSeconds,
            notes: workoutPlanExercisesTable.notes,
          })
          .from(workoutPlanExercisesTable)
          .innerJoin(exercisesTable, eq(workoutPlanExercisesTable.exerciseId, exercisesTable.id))
          .where(inArray(workoutPlanExercisesTable.dayId, dayIds))
          .orderBy(workoutPlanExercisesTable.orderInDay)
      : [];

  // Group exercises by day.
  const exercisesByDay = new Map<number, typeof exercises>();
  for (const ex of exercises) {
    if (!exercisesByDay.has(ex.dayId)) exercisesByDay.set(ex.dayId, []);
    exercisesByDay.get(ex.dayId)!.push(ex);
  }

  const volume = await calculatePlanVolume(
    planId,
    plan.guidelineVersionId,
    plan.experienceLevelUsed,
  );

  return {
    ...plan,
    days: days.map((d) => ({
      ...d,
      exercises: exercisesByDay.get(d.id) ?? [],
    })),
    volume,
  };
}

// ─── GET /clients/:clientId/plans ─────────────────────────────────────────────

router.get("/clients/:clientId/plans", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Nieprawidłowe ID klienta" });
    return;
  }

  const plans = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.clientId, clientId))
    .orderBy(workoutPlansTable.createdAt);

  res.json(plans);
});

// ─── POST /clients/:clientId/plans ────────────────────────────────────────────

router.post("/clients/:clientId/plans", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Nieprawidłowe ID klienta" });
    return;
  }

  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, surveyId } = parsed.data;

  // Verify survey belongs to this client.
  const [survey] = await db
    .select({ id: surveysTable.id, clientId: surveysTable.clientId, experienceLevel: surveysTable.experienceLevel })
    .from(surveysTable)
    .where(and(eq(surveysTable.id, surveyId), eq(surveysTable.clientId, clientId)));

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony dla tego klienta" });
    return;
  }

  const experienceLevelUsed = survey.experienceLevel ?? "Początkujący";

  // Get the active guideline version.
  const [activeVersion] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .orderBy(volumeGuidelineVersionsTable.id)
    .limit(1);

  if (!activeVersion) {
    res.status(500).json({ error: "Brak aktywnej wersji wytycznych objętości. Upewnij się, że serwer API wykonał seed." });
    return;
  }

  const [plan] = await db
    .insert(workoutPlansTable)
    .values({
      clientId,
      surveyId,
      guidelineVersionId: activeVersion.id,
      experienceLevelUsed,
      title,
      status: "draft",
    })
    .returning({ id: workoutPlansTable.id });

  const full = await getPlanFull(plan.id);
  res.status(201).json(full);
});

// ─── GET /plans/:id ───────────────────────────────────────────────────────────

router.get("/plans/:id", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  const full = await getPlanFull(planId);
  if (!full) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  res.json(full);
});

// ─── PATCH /plans/:id ─────────────────────────────────────────────────────────

router.patch("/plans/:id", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!existing) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  const updates: Partial<typeof workoutPlansTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  await db.update(workoutPlansTable).set(updates).where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── DELETE /plans/:id ────────────────────────────────────────────────────────

router.delete("/plans/:id", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  const [existing] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!existing) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  await db.delete(workoutPlansTable).where(eq(workoutPlansTable.id, planId));
  res.status(204).end();
});

// ─── POST /plans/:id/days ─────────────────────────────────────────────────────

router.post("/plans/:id/days", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  const parsed = CreatePlanDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [plan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  // Determine next day order.
  const [maxRow] = await db
    .select({ maxOrder: max(workoutPlanDaysTable.dayOrder) })
    .from(workoutPlanDaysTable)
    .where(eq(workoutPlanDaysTable.planId, planId));

  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
  const defaultName = `Dzień ${nextOrder}`;

  await db.insert(workoutPlanDaysTable).values({
    planId,
    dayOrder: nextOrder,
    dayName: parsed.data.dayName ?? defaultName,
  });

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.status(201).json(full);
});

// ─── PATCH /plans/:id/days/:dayId ────────────────────────────────────────────

router.patch("/plans/:id/days/:dayId", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  const parsed = UpdatePlanDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  const updates: Partial<typeof workoutPlanDaysTable.$inferInsert> = {};
  if (parsed.data.dayName !== undefined) updates.dayName = parsed.data.dayName;
  if (parsed.data.dayOrder !== undefined) updates.dayOrder = parsed.data.dayOrder;

  if (Object.keys(updates).length > 0) {
    await db
      .update(workoutPlanDaysTable)
      .set(updates)
      .where(eq(workoutPlanDaysTable.id, dayId));
  }

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── DELETE /plans/:id/days/:dayId ───────────────────────────────────────────

router.delete("/plans/:id/days/:dayId", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  await db.delete(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.id, dayId));

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── POST /plans/:id/days/:dayId/exercises ────────────────────────────────────

router.post("/plans/:id/days/:dayId/exercises", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  const dayId = Number(req.params.dayId);
  if (!Number.isFinite(planId) || !Number.isFinite(dayId)) {
    res.status(400).json({ error: "Nieprawidłowe ID" });
    return;
  }

  const parsed = CreatePlanExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify day belongs to plan.
  const [day] = await db
    .select()
    .from(workoutPlanDaysTable)
    .where(and(eq(workoutPlanDaysTable.id, dayId), eq(workoutPlanDaysTable.planId, planId)));

  if (!day) {
    res.status(404).json({ error: "Dzień nie znaleziony" });
    return;
  }

  // Verify exercise exists.
  const [exercise] = await db
    .select({ id: exercisesTable.id })
    .from(exercisesTable)
    .where(eq(exercisesTable.id, parsed.data.exerciseId));

  if (!exercise) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  // Next order_in_day.
  const [maxRow] = await db
    .select({ maxOrder: max(workoutPlanExercisesTable.orderInDay) })
    .from(workoutPlanExercisesTable)
    .where(eq(workoutPlanExercisesTable.dayId, dayId));

  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

  await db.insert(workoutPlanExercisesTable).values({
    dayId,
    exerciseId: parsed.data.exerciseId,
    orderInDay: nextOrder,
    workingSets: parsed.data.workingSets,
    warmUpSets: parsed.data.warmUpSets ?? 0,
    repRangeMin: parsed.data.repRangeMin ?? null,
    repRangeMax: parsed.data.repRangeMax ?? null,
    rirOrRpe: parsed.data.rirOrRpe ?? null,
    restSeconds: parsed.data.restSeconds ?? null,
    notes: parsed.data.notes ?? null,
  });

  await db
    .update(workoutPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.status(201).json(full);
});

// ─── PATCH /plans/:id/days/:dayId/exercises/:exerciseId ──────────────────────

router.patch(
  "/plans/:id/days/:dayId/exercises/:exerciseId",
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    const planExerciseId = Number(req.params.exerciseId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId) || !Number.isFinite(planExerciseId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    const parsed = UpdatePlanExerciseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [planEx] = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, dayId),
        ),
      );

    if (!planEx) {
      res.status(404).json({ error: "Ćwiczenie w planie nie znalezione" });
      return;
    }

    // If moving to a different day, verify that day also belongs to the same plan.
    if (parsed.data.dayId !== undefined && parsed.data.dayId !== dayId) {
      const [targetDay] = await db
        .select()
        .from(workoutPlanDaysTable)
        .where(
          and(
            eq(workoutPlanDaysTable.id, parsed.data.dayId),
            eq(workoutPlanDaysTable.planId, planId),
          ),
        );
      if (!targetDay) {
        res.status(404).json({ error: "Dzień docelowy nie znaleziony w tym planie" });
        return;
      }
    }

    const updates: Partial<typeof workoutPlanExercisesTable.$inferInsert> = {};
    if (parsed.data.workingSets !== undefined) updates.workingSets = parsed.data.workingSets;
    if (parsed.data.warmUpSets !== undefined) updates.warmUpSets = parsed.data.warmUpSets;
    if (parsed.data.repRangeMin !== undefined) updates.repRangeMin = parsed.data.repRangeMin;
    if (parsed.data.repRangeMax !== undefined) updates.repRangeMax = parsed.data.repRangeMax;
    if (parsed.data.rirOrRpe !== undefined) updates.rirOrRpe = parsed.data.rirOrRpe;
    if (parsed.data.restSeconds !== undefined) updates.restSeconds = parsed.data.restSeconds;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.orderInDay !== undefined) updates.orderInDay = parsed.data.orderInDay;
    if (parsed.data.dayId !== undefined) updates.dayId = parsed.data.dayId;

    if (Object.keys(updates).length > 0) {
      await db
        .update(workoutPlanExercisesTable)
        .set(updates)
        .where(eq(workoutPlanExercisesTable.id, planExerciseId));
    }

    await db
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));

    const full = await getPlanFull(planId);
    res.json(full);
  },
);

// ─── DELETE /plans/:id/days/:dayId/exercises/:exerciseId ─────────────────────

router.delete(
  "/plans/:id/days/:dayId/exercises/:exerciseId",
  async (req, res): Promise<void> => {
    const planId = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    const planExerciseId = Number(req.params.exerciseId);
    if (!Number.isFinite(planId) || !Number.isFinite(dayId) || !Number.isFinite(planExerciseId)) {
      res.status(400).json({ error: "Nieprawidłowe ID" });
      return;
    }

    const [planEx] = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(
        and(
          eq(workoutPlanExercisesTable.id, planExerciseId),
          eq(workoutPlanExercisesTable.dayId, dayId),
        ),
      );

    if (!planEx) {
      res.status(404).json({ error: "Ćwiczenie w planie nie znalezione" });
      return;
    }

    await db
      .delete(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.id, planExerciseId));

    await db
      .update(workoutPlansTable)
      .set({ updatedAt: new Date() })
      .where(eq(workoutPlansTable.id, planId));

    const full = await getPlanFull(planId);
    res.json(full);
  },
);

// ─── POST /plans/:id/activate ─────────────────────────────────────────────────

router.post("/plans/:id/activate", async (req, res): Promise<void> => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Nieprawidłowe ID planu" });
    return;
  }

  const [plan] = await db
    .select()
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.id, planId));

  if (!plan) {
    res.status(404).json({ error: "Plan nie znaleziony" });
    return;
  }

  if (plan.status === "active") {
    res.status(400).json({ error: "Plan jest już aktywny" });
    return;
  }

  // Verify survey snapshot still exists (FK should protect this, but verify explicitly).
  const [survey] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.id, plan.surveyId));

  if (!survey) {
    res.status(422).json({ error: "Wywiad treningowy powiązany z planem został usunięty" });
    return;
  }

  // Verify guideline version exists.
  const [version] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.id, plan.guidelineVersionId));

  if (!version) {
    res.status(422).json({ error: "Wersja wytycznych objętości nie istnieje" });
    return;
  }

  // Server-side volume validation.
  const volumeResult = await calculatePlanVolume(
    planId,
    plan.guidelineVersionId,
    plan.experienceLevelUsed,
  );

  // Block if any exercise has zero muscle assignments.
  if (volumeResult.exercisesWithoutAssignments.length > 0) {
    const names = volumeResult.exercisesWithoutAssignments.map((e) => e.exerciseName).join(", ");
    res.status(422).json({
      error: `Aktywacja zablokowana: następujące ćwiczenia nie mają przypisanych mięśni: ${names}`,
      exercisesWithoutAssignments: volumeResult.exercisesWithoutAssignments,
    });
    return;
  }

  // Block if any approved target exceeds weeklyAbsoluteCeiling.
  const violations = volumeResult.targets.filter((t) => t.status === "above_absolute");
  if (violations.length > 0) {
    res.status(422).json({
      error: "Aktywacja zablokowana: przekroczono absolutny limit tygodniowy",
      violations: violations.map((v) => ({
        targetName: v.targetName,
        weeklyEffectiveSets: Math.round(v.weeklyEffectiveSets * 10) / 10,
        weeklyAbsoluteCeiling: v.weeklyAbsoluteCeiling,
        contributing: v.breakdown.map((b) => b.exerciseName),
      })),
    });
    return;
  }

  // Activate.
  await db
    .update(workoutPlansTable)
    .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
    .where(eq(workoutPlansTable.id, planId));

  const full = await getPlanFull(planId);
  res.json(full);
});

// ─── GET /volume-guidelines ───────────────────────────────────────────────────
// Returns guidelines for a specific version + experience level (mapped).

router.get("/volume-guidelines", async (req, res): Promise<void> => {
  const versionId = req.query.versionId ? Number(req.query.versionId) : null;
  const experienceLevel = typeof req.query.experienceLevel === "string"
    ? req.query.experienceLevel
    : null;

  if (!versionId || !experienceLevel) {
    res.status(400).json({ error: "Wymagane: versionId, experienceLevel" });
    return;
  }

  const guidelineLevel = mapToGuidelineLevel(experienceLevel);

  const rows = await db
    .select({
      id: volumeGuidelinesTable.id,
      versionId: volumeGuidelinesTable.versionId,
      experienceLevel: volumeGuidelinesTable.experienceLevel,
      volumeTargetId: volumeGuidelinesTable.volumeTargetId,
      targetName: volumeTargetsTable.name,
      sessionMin: volumeGuidelinesTable.sessionMin,
      sessionMax: volumeGuidelinesTable.sessionMax,
      weeklyPreferredCeiling: volumeGuidelinesTable.weeklyPreferredCeiling,
      weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling,
    })
    .from(volumeGuidelinesTable)
    .innerJoin(
      volumeTargetsTable,
      eq(volumeGuidelinesTable.volumeTargetId, volumeTargetsTable.id),
    )
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, versionId),
        eq(volumeGuidelinesTable.experienceLevel, guidelineLevel),
      ),
    )
    .orderBy(volumeTargetsTable.name);

  res.json(rows);
});

export default router;
