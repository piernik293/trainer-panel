import { Router, type IRouter } from "express";
import { eq, and, ilike } from "drizzle-orm";
import { db, exercisesTable } from "@workspace/db";
import {
  ListExercisesQueryParams,
  ListExercisesResponse,
  CreateExerciseBody,
  CreateExerciseResponse,
  GetExerciseParams,
  GetExerciseResponse,
  UpdateExerciseParams,
  UpdateExerciseBody,
  UpdateExerciseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateUniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name) || "cwiczenie";
  let candidate = base;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(eq(exercisesTable.slug, candidate));

    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// Postgres unique_violation error code.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/**
 * Runs `operation` with the freshly generated slug, retrying with a new
 * candidate if a concurrent request wins the race on the unique slug index.
 */
async function withUniqueSlugRetry<T>(
  name: string,
  operation: (slug: string) => Promise<T>,
  excludeId?: number,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const slug = await generateUniqueSlug(name, excludeId);
    try {
      return await operation(slug);
    } catch (error) {
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function parseIsActiveFilter(raw: unknown): boolean | undefined {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

router.get("/exercises", async (req, res): Promise<void> => {
  const query = ListExercisesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search, mainMuscleGroup, equipment, difficultyLevel, trainingLocation } = query.data;
  // The generated query schema coerces "isActive" with zod.coerce.boolean(),
  // which treats any non-empty string (including "false") as true. Parse the
  // raw query value ourselves so `?isActive=false` is honored correctly.
  const isActive = parseIsActiveFilter(req.query.isActive);

  const conditions = [
    search ? ilike(exercisesTable.name, `%${search}%`) : undefined,
    mainMuscleGroup ? eq(exercisesTable.mainMuscleGroup, mainMuscleGroup) : undefined,
    difficultyLevel ? eq(exercisesTable.difficultyLevel, difficultyLevel) : undefined,
    typeof isActive === "boolean" ? eq(exercisesTable.isActive, isActive) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  let exercises = await db
    .select()
    .from(exercisesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(exercisesTable.name);

  // Array-membership filters (equipment / trainingLocation) are applied in
  // application code to keep the query portable across the existing
  // Postgres text[] columns without introducing new query helpers.
  if (equipment) {
    exercises = exercises.filter((e) => e.equipment.includes(equipment));
  }
  if (trainingLocation) {
    exercises = exercises.filter((e) => e.trainingLocation.includes(trainingLocation));
  }

  res.json(ListExercisesResponse.parse(exercises));
});

router.post("/exercises", async (req, res): Promise<void> => {
  const parsed = CreateExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const slugSource = parsed.data.slug?.trim() ? parsed.data.slug : parsed.data.name;

  const [exercise] = await withUniqueSlugRetry(slugSource, (slug) =>
    db
      .insert(exercisesTable)
      .values({ ...parsed.data, slug })
      .returning(),
  );

  res.status(201).json(CreateExerciseResponse.parse(exercise));
});

router.get("/exercises/:id", async (req, res): Promise<void> => {
  const params = GetExerciseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [exercise] = await db
    .select()
    .from(exercisesTable)
    .where(eq(exercisesTable.id, params.data.id));

  if (!exercise) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  res.json(GetExerciseResponse.parse(exercise));
});

router.patch("/exercises/:id", async (req, res): Promise<void> => {
  const params = UpdateExerciseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: typeof parsed.data & { updatedAt: Date } = { ...parsed.data, updatedAt: new Date() };

  let exercise;
  if (parsed.data.slug?.trim()) {
    [exercise] = await withUniqueSlugRetry(
      parsed.data.slug,
      (slug) =>
        db
          .update(exercisesTable)
          .set({ ...updates, slug })
          .where(eq(exercisesTable.id, params.data.id))
          .returning(),
      params.data.id,
    );
  } else {
    [exercise] = await db
      .update(exercisesTable)
      .set(updates)
      .where(eq(exercisesTable.id, params.data.id))
      .returning();
  }

  if (!exercise) {
    res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    return;
  }

  res.json(UpdateExerciseResponse.parse(exercise));
});

export default router;
