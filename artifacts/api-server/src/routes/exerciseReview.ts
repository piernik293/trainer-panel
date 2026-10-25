/**
 * "Do weryfikacji" (blok 3, 25.10.2026): list of imported exercises not yet reviewed by the trainer, with the actions
 *  - verify  (reviewed_by_trainer = true, status zweryfikowane) — does NOT touch suitableForNoActivity;
 *  - hide / unhide (hidden: excluded from the generator and pickers, never deleted);
 *  - no-activity (separate switch with explicit confirmation; only for reviewed exercises with a learning difficulty);
 * and the variants of an exercise (for the plan editor). Acting on public catalogue rows needs a catalogue admin
 * (same rule as editing: canMutateExercise); every trainer may read the list.
 */
import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db, exercisesTable } from "@workspace/db";
import { requireAuth, checkIsCatalogueAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

const canAct = (req: Request, createdBy: number | null) => createdBy === req.trainer!.id || (createdBy === null && checkIsCatalogueAdmin(req.clerkUserId));
const visibleTo = (trainerId: number) => or(isNull(exercisesTable.createdByTrainerId), eq(exercisesTable.createdByTrainerId, trainerId))!;

async function loadActable(req: Request, res: import("express").Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowy identyfikator ćwiczenia." }); return null; }
  const [ex] = await db.select().from(exercisesTable).where(and(eq(exercisesTable.id, id), visibleTo(req.trainer!.id)));
  if (!ex) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return null; }
  if (!canAct(req, ex.createdByTrainerId)) { res.status(403).json({ error: "Nie masz uprawnień do zmiany tego ćwiczenia." }); return null; }
  return ex;
}

const shape = (e: typeof exercisesTable.$inferSelect, parentName: string | null, actable: boolean) => ({
  id: e.id, name: e.name, difficultyLevel: e.difficultyLevel, movementPattern: e.movementPattern, mainMuscleGroup: e.mainMuscleGroup,
  equipment: e.equipment, jointStressAreas: e.jointStressAreas ?? [], parentExerciseId: e.parentExerciseId, parentName,
  variantGrip: e.variantGrip, variantPosition: e.variantPosition, unilateral: e.unilateral, intensity: e.intensity,
  description: e.description, learningDifficulty: e.learningDifficulty, suitableForNoActivity: e.suitableForNoActivity,
  reviewedByTrainer: e.reviewedByTrainer, hidden: e.hidden, source: e.source, canAct: actable,
});

// GET /exercises/review/pending?difficultyLevel=&movementPattern=&equipment=&hidden=true
router.get("/exercises/review/pending", requireAuth, async (req, res): Promise<void> => {
  const q = z.object({ difficultyLevel: z.string().optional(), movementPattern: z.string().optional(), equipment: z.string().optional(), hidden: z.enum(["true", "false"]).optional() }).safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Nieprawidłowe filtry." }); return; }
  const showHidden = q.data.hidden === "true";
  const conditions = [
    eq(exercisesTable.isActive, true), eq(exercisesTable.reviewedByTrainer, false), eq(exercisesTable.hidden, showHidden), visibleTo(req.trainer!.id),
    q.data.difficultyLevel ? eq(exercisesTable.difficultyLevel, q.data.difficultyLevel) : undefined,
    q.data.movementPattern ? eq(exercisesTable.movementPattern, q.data.movementPattern) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  let rows = await db.select().from(exercisesTable).where(and(...conditions)).orderBy(asc(exercisesTable.name));
  if (q.data.equipment) rows = rows.filter((r) => r.equipment.includes(q.data.equipment!));
  const parentIds = [...new Set(rows.map((r) => r.parentExerciseId).filter((v): v is number => v !== null))];
  const parents = parentIds.length ? await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable).where(inArray(exercisesTable.id, parentIds)) : [];
  const names = new Map(parents.map((p) => [p.id, p.name]));
  res.json(rows.map((r) => shape(r, r.parentExerciseId ? names.get(r.parentExerciseId) ?? null : null, canAct(req, r.createdByTrainerId))));
});

router.post("/exercises/:id/verify", requireAuth, async (req, res): Promise<void> => {
  const ex = await loadActable(req, res); if (!ex) return;
  const [u] = await db.update(exercisesTable).set({ reviewedByTrainer: true, verificationStatus: "zweryfikowane", updatedAt: new Date() }).where(eq(exercisesTable.id, ex.id)).returning();
  res.json(shape(u!, null, true));
});

router.post("/exercises/:id/hide", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ hidden: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Podaj hidden: true lub false." }); return; }
  const ex = await loadActable(req, res); if (!ex) return;
  const [u] = await db.update(exercisesTable).set({ hidden: body.data.hidden, updatedAt: new Date() }).where(eq(exercisesTable.id, ex.id)).returning();
  res.json(shape(u!, null, true));
});

// Separate switch: "nadaje się dla braku aktywności". Turning it on needs confirm = true and a reviewed exercise with a learning difficulty.
router.post("/exercises/:id/no-activity", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ value: z.boolean(), confirm: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Podaj value: true lub false." }); return; }
  const ex = await loadActable(req, res); if (!ex) return;
  if (body.data.value) {
    if (body.data.confirm !== true) { res.status(400).json({ error: "Potwierdź: to ćwiczenie będzie dostępne dla osób z poziomem „Brak aktywności fizycznej”.", code: "CONFIRM_REQUIRED" }); return; }
    if (!ex.reviewedByTrainer) { res.status(409).json({ error: "Najpierw zweryfikuj to ćwiczenie.", code: "NOT_REVIEWED" }); return; }
    if (ex.learningDifficulty == null) { res.status(409).json({ error: "Ćwiczenie nie ma oceny trudności nauki — uzupełnij ją najpierw.", code: "NO_LEARNING_DIFFICULTY" }); return; }
  }
  const [u] = await db.update(exercisesTable).set({ suitableForNoActivity: body.data.value, updatedAt: new Date() }).where(eq(exercisesTable.id, ex.id)).returning();
  res.json(shape(u!, null, true));
});

// GET /exercises/:id/variants — the other members of the exercise's family with their equipment (plan editor):
// for a main exercise its variants; for a variant its main exercise and sibling variants. Visible, active, not hidden.
router.get("/exercises/:id/variants", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowy identyfikator ćwiczenia." }); return; }
  const [self] = await db.select({ id: exercisesTable.id, parentExerciseId: exercisesTable.parentExerciseId }).from(exercisesTable).where(eq(exercisesTable.id, id));
  if (!self) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return; }
  const rootId = self.parentExerciseId ?? self.id;
  const rows = await db.select().from(exercisesTable)
    .where(and(or(eq(exercisesTable.id, rootId), eq(exercisesTable.parentExerciseId, rootId)), ne(exercisesTable.id, id), eq(exercisesTable.isActive, true), eq(exercisesTable.hidden, false), visibleTo(req.trainer!.id)))
    .orderBy(asc(exercisesTable.name));
  res.json(rows.map((r) => ({ ...shape(r, null, false), isMain: r.id === rootId })));
});

export default router;
