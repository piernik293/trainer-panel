import { Router, type IRouter } from "express";
import { eq, inArray, desc, asc } from "drizzle-orm";
import {
  db,
  exercisesTable,
  specificMusclesTable,
  exerciseMuscleAssignmentsTable,
} from "@workspace/db";
import {
  ListMusclesQueryParams,
  ListMusclesResponse,
  CreateMuscleBody,
  CreateMuscleResponse,
  GetExerciseMusclesParams,
  GetExerciseMusclesResponse,
  SetExerciseMusclesParams,
  SetExerciseMusclesBody,
  SetExerciseMusclesResponse,
} from "@workspace/api-zod";
import { requireAuth, requireCatalogueAdmin } from "../middlewares/requireAuth";
import { canMutateExercise, canViewExercise } from "./exercises";

const router: IRouter = Router();

const UNIQUE_VIOLATION = "23505";

function hasCode(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === UNIQUE_VIOLATION
  );
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle ORM wraps pg errors in its own Error; the original pg error
  // (with code "23505") may be on the `cause` property.
  return hasCode(error) || hasCode((error as { cause?: unknown })?.cause);
}

// ─── Shared helper: SELECT assignments joined with muscle names ───────────────

async function queryAssignmentsForExercise(
  tx: typeof db,
  exerciseId: number,
) {
  return tx
    .select({
      id: exerciseMuscleAssignmentsTable.id,
      exerciseId: exerciseMuscleAssignmentsTable.exerciseId,
      specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId,
      muscleName: specificMusclesTable.name,
      broadCategory: specificMusclesTable.broadCategory,
      isPrimary: exerciseMuscleAssignmentsTable.isPrimary,
      coefficient: exerciseMuscleAssignmentsTable.coefficient,
    })
    .from(exerciseMuscleAssignmentsTable)
    .innerJoin(
      specificMusclesTable,
      eq(exerciseMuscleAssignmentsTable.specificMuscleId, specificMusclesTable.id),
    )
    .where(eq(exerciseMuscleAssignmentsTable.exerciseId, exerciseId))
    .orderBy(
      desc(exerciseMuscleAssignmentsTable.isPrimary),
      asc(specificMusclesTable.name),
    );
}

// ─── GET /muscles ─────────────────────────────────────────────────────────────

router.get("/muscles", async (req, res): Promise<void> => {
  const query = ListMusclesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let muscles = await db
    .select()
    .from(specificMusclesTable)
    .orderBy(specificMusclesTable.broadCategory, specificMusclesTable.name);

  if (query.data.broadCategory) {
    muscles = muscles.filter((m) => m.broadCategory === query.data.broadCategory);
  }

  res.json(ListMusclesResponse.parse(muscles));
});

// ─── POST /muscles ────────────────────────────────────────────────────────────

// The specific-muscle list is shared catalogue data: catalogue admins only.
router.post("/muscles", requireAuth, requireCatalogueAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMuscleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [muscle] = await db
      .insert(specificMusclesTable)
      .values(parsed.data)
      .returning();

    res.status(201).json(CreateMuscleResponse.parse(muscle));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Mięsień o tej nazwie już istnieje w katalogu" });
      return;
    }
    throw error;
  }
});

// ─── GET /exercises/:id/muscles ───────────────────────────────────────────────

router.get("/exercises/:id/muscles", async (req, res): Promise<void> => {
  const params = GetExerciseMusclesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [exercise] = await db
    .select({ id: exercisesTable.id, createdByTrainerId: exercisesTable.createdByTrainerId })
    .from(exercisesTable)
    .where(eq(exercisesTable.id, params.data.id));

  // Private exercises of other trainers are reported as missing (no enumeration).
  if (!exercise || !(await canViewExercise(req, exercise.createdByTrainerId))) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  const assignments = await queryAssignmentsForExercise(db, params.data.id);
  res.json(GetExerciseMusclesResponse.parse(assignments));
});

// ─── PUT /exercises/:id/muscles ───────────────────────────────────────────────
//
// Replaces ALL muscle assignments for the exercise atomically. Validations:
//   - If non-empty: exactly one entry must have isPrimary = true.
//   - No duplicate specificMuscleId values.
//   - All coefficient values must be in [0, 1].
//   - All referenced specificMuscleId values must exist in the catalogue.
//   - Primary coefficient is always forced to 1.0 (server-side enforcement).
// Runs inside a DB transaction; on any failure the old assignments are intact.

router.put("/exercises/:id/muscles", requireAuth, async (req, res): Promise<void> => {
  const params = SetExerciseMusclesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SetExerciseMusclesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { assignments } = body.data;
  const exerciseId = params.data.id;

  // Same rule and response as PATCH /exercises/:id: owner, or catalogue admin
  // for public exercises; anything else is reported as 404.
  const [exercise] = await db
    .select({ id: exercisesTable.id, createdByTrainerId: exercisesTable.createdByTrainerId })
    .from(exercisesTable)
    .where(eq(exercisesTable.id, exerciseId));

  if (!exercise || !canMutateExercise(req, exercise.createdByTrainerId)) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  if (assignments.length > 0) {
    // Exactly one primary.
    const primaryCount = assignments.filter((a) => a.isPrimary).length;
    if (primaryCount !== 1) {
      res
        .status(400)
        .json({ error: "Dokładnie jeden mięsień główny jest wymagany" });
      return;
    }

    // No duplicate muscle IDs.
    const ids = assignments.map((a) => a.specificMuscleId);
    if (new Set(ids).size !== ids.length) {
      res
        .status(400)
        .json({ error: "Ten sam mięsień nie może być przypisany więcej niż raz" });
      return;
    }

    // All muscle IDs must exist in the catalogue.
    const found = await db
      .select({ id: specificMusclesTable.id })
      .from(specificMusclesTable)
      .where(inArray(specificMusclesTable.id, ids));

    if (found.length !== ids.length) {
      res.status(400).json({ error: "Nieznany identyfikator mięśnia" });
      return;
    }
  }

  // Force primary coefficient to 1.0 regardless of what the client sent.
  const normalised = assignments.map((a) => ({
    exerciseId,
    specificMuscleId: a.specificMuscleId,
    isPrimary: a.isPrimary,
    coefficient: a.isPrimary ? 1.0 : a.coefficient,
  }));

  // Atomic replace inside a transaction.
  await db.transaction(async (tx) => {
    await tx
      .delete(exerciseMuscleAssignmentsTable)
      .where(eq(exerciseMuscleAssignmentsTable.exerciseId, exerciseId));

    if (normalised.length > 0) {
      await tx.insert(exerciseMuscleAssignmentsTable).values(normalised);
    }
  });

  // Read the updated assignments after the transaction has committed.
  const updated = await queryAssignmentsForExercise(db, exerciseId);
  res.json(SetExerciseMusclesResponse.parse(updated));
});

export default router;
