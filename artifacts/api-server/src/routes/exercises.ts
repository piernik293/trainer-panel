import { Router, type IRouter } from "express";
import { eq, and, ilike } from "drizzle-orm";
import {
  db,
  exercisesTable,
  exerciseSubstitutionsTable,
  exerciseProgressionsTable,
} from "@workspace/db";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
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
  GetExerciseSubstitutionsParams,
  GetExerciseSubstitutionsResponse,
  AddExerciseSubstitutionParams,
  AddExerciseSubstitutionBody,
  AddExerciseSubstitutionResponse,
  RemoveExerciseSubstitutionParams,
  GetExerciseProgressionsParams,
  GetExerciseProgressionsResponse,
  AddExerciseProgressionParams,
  AddExerciseProgressionBody,
  AddExerciseProgressionResponse,
  RemoveExerciseProgressionParams,
  PreviewExerciseImportBody,
  PreviewExerciseImportResponse,
  ImportExercisesBody,
  ImportExercisesResponse,
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

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/exercises", async (req, res): Promise<void> => {
  const query = ListExercisesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search, mainMuscleGroup, equipment, difficultyLevel, trainingLocation, exerciseType, movementPattern, secondaryMuscleGroup } = query.data;
  // The generated query schema coerces "isActive" and "isComplete" with
  // zod.coerce.boolean(), which treats any non-empty string as true.
  // Parse both from raw query ourselves so `?isActive=false` is honoured.
  const isActive = parseIsActiveFilter(req.query.isActive);
  const isCompleteFilter = parseIsActiveFilter(req.query.isComplete);

  const conditions = [
    search ? ilike(exercisesTable.name, `%${search}%`) : undefined,
    mainMuscleGroup ? eq(exercisesTable.mainMuscleGroup, mainMuscleGroup) : undefined,
    difficultyLevel ? eq(exercisesTable.difficultyLevel, difficultyLevel) : undefined,
    exerciseType ? eq(exercisesTable.exerciseType, exerciseType) : undefined,
    movementPattern ? eq(exercisesTable.movementPattern, movementPattern) : undefined,
    typeof isActive === "boolean" ? eq(exercisesTable.isActive, isActive) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  let exercises = await db
    .select()
    .from(exercisesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(exercisesTable.name);

  // Array-membership filters applied in JS (portable across text[] columns).
  if (equipment) {
    exercises = exercises.filter((e) => e.equipment.includes(equipment));
  }
  if (trainingLocation) {
    exercises = exercises.filter((e) => e.trainingLocation.includes(trainingLocation));
  }
  if (secondaryMuscleGroup) {
    exercises = exercises.filter((e) => e.secondaryMuscleGroups.includes(secondaryMuscleGroup));
  }

  // Fetch muscle stats once for all exercises, then attach completeness.
  const statsMap = await fetchMuscleStats(exercises.map((e) => e.id));

  let result = exercises.map((e) => ({
    ...e,
    ...computeCompleteness(e, statsMap.get(e.id)),
  }));

  if (typeof isCompleteFilter === "boolean") {
    result = result.filter((e) => e.isComplete === isCompleteFilter);
  }

  res.json(ListExercisesResponse.parse(result));
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

  // New exercise always starts with 0 muscle assignments → incomplete.
  const completeness = computeCompleteness(exercise, undefined);
  res.status(201).json(CreateExerciseResponse.parse({ ...exercise, ...completeness }));
});

// ─── Import — these must be registered before /exercises/:id ─────────────────

// Known-valid option sets used for import row validation.
const VALID_DIFFICULTY = new Set(["Początkujący", "Średniozaawansowany", "Zaawansowany"]);
const VALID_EXERCISE_TYPE = new Set(["Złożone", "Izolowane"]);
const VALID_MOVEMENT_PATTERN = new Set([
  "Pchanie poziome", "Pchanie pionowe", "Przyciąganie poziome", "Przyciąganie pionowe",
  "Przysiad", "Zawias biodrowy", "Wykrok", "Zgięcie kolana", "Wyprost kolana",
  "Odwodzenie", "Przywodzenie", "Zgięcie łokcia", "Wyprost łokcia",
  "Stabilizacja tułowia", "Zgięcie tułowia", "Rotacja", "Lokomocja", "Inne",
]);
const VALID_MUSCLE_GROUPS = new Set([
  "Klatka piersiowa", "Plecy", "Barki", "Biceps", "Triceps", "Przedramiona",
  "Brzuch", "Pośladki", "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda",
  "Przywodziciele", "Odwodziciele", "Łydki", "Całe ciało", "Inne",
]);
const VALID_EQUIPMENT = new Set([
  "Sztanga", "Hantle", "Kettlebell", "Maszyna", "Wyciąg", "Drążek",
  "Poręcze", "Ławka", "Gumy oporowe", "TRX", "Masa własnego ciała",
  "Piłka", "Brak sprzętu", "Inny",
]);
const VALID_LOCATION = new Set(["Siłownia", "Dom", "Siłownia plenerowa", "Plener"]);

type ImportRowInput = {
  name?: string;
  mainMuscleGroup?: string;
  equipment?: string[];
  trainingLocation?: string[];
  difficultyLevel?: string;
  exerciseType?: string;
  movementPattern?: string;
  [key: string]: unknown;
};

function validateImportRow(row: ImportRowInput, idx: number): string[] {
  const errors: string[] = [];

  if (!row.name?.trim()) errors.push("Brak nazwy ćwiczenia");
  if (!row.mainMuscleGroup?.trim()) {
    errors.push("Brak głównej partii mięśniowej");
  } else if (!VALID_MUSCLE_GROUPS.has(row.mainMuscleGroup)) {
    errors.push(`Nieznana partia mięśniowa: "${row.mainMuscleGroup}"`);
  }

  if (row.difficultyLevel && !VALID_DIFFICULTY.has(row.difficultyLevel)) {
    errors.push(`Nieznany poziom trudności: "${row.difficultyLevel}"`);
  }
  if (row.exerciseType && !VALID_EXERCISE_TYPE.has(row.exerciseType)) {
    errors.push(`Nieznany typ ćwiczenia: "${row.exerciseType}"`);
  }
  if (row.movementPattern && !VALID_MOVEMENT_PATTERN.has(row.movementPattern)) {
    errors.push(`Nieznany wzorzec ruchowy: "${row.movementPattern}"`);
  }
  if (Array.isArray(row.equipment)) {
    for (const e of row.equipment) {
      if (e && !VALID_EQUIPMENT.has(e)) errors.push(`Nieznany sprzęt: "${e}"`);
    }
  }
  if (Array.isArray(row.trainingLocation)) {
    for (const l of row.trainingLocation) {
      if (l && !VALID_LOCATION.has(l)) errors.push(`Nieznane miejsce treningu: "${l}"`);
    }
  }

  return errors;
}

router.post("/exercises/import/preview", async (req, res): Promise<void> => {
  const parsed = PreviewExerciseImportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { rows } = parsed.data;
  const errors: Array<{ rowIndex: number; exerciseName?: string; errors: string[] }> = [];
  const duplicates: Array<{ rowIndex: number; exerciseName: string; existingId: number }> = [];
  let validCount = 0;

  // Check all rows for validation errors.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as ImportRowInput;
    const rowErrors = validateImportRow(row, i);
    if (rowErrors.length > 0) {
      errors.push({ rowIndex: i, exerciseName: row.name, errors: rowErrors });
    } else {
      validCount++;
    }
  }

  // Duplicate detection: find existing exercises matching any imported name.
  const validNames = rows
    .filter((_, i) => !errors.some((e) => e.rowIndex === i))
    .map((r) => (r as ImportRowInput).name?.trim().toLowerCase())
    .filter(Boolean) as string[];

  if (validNames.length > 0) {
    const existing = await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable);
    const nameMap = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));

    for (let i = 0; i < rows.length; i++) {
      if (errors.some((e) => e.rowIndex === i)) continue;
      const name = (rows[i] as ImportRowInput).name?.trim() ?? "";
      const existingId = nameMap.get(name.toLowerCase());
      if (existingId) {
        duplicates.push({ rowIndex: i, exerciseName: name, existingId });
      }
    }
  }

  res.json(PreviewExerciseImportResponse.parse({ validCount, errors, duplicates }));
});

router.post("/exercises/import", async (req, res): Promise<void> => {
  const parsed = ImportExercisesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { rows, duplicateStrategy, skipInvalidRows } = parsed.data;

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failedErrors: Array<{ rowIndex: number; exerciseName?: string; errors: string[] }> = [];

  // Fetch existing exercises once for duplicate detection.
  const existing = await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable);
  const nameMap = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as ImportRowInput;
    const rowErrors = validateImportRow(row, i);

    if (rowErrors.length > 0) {
      if (skipInvalidRows) {
        skipped++;
        continue;
      } else {
        failed++;
        failedErrors.push({ rowIndex: i, exerciseName: row.name, errors: rowErrors });
        continue;
      }
    }

    const name = (row.name ?? "").trim();
    const existingId = nameMap.get(name.toLowerCase());

    try {
      if (existingId && duplicateStrategy === "skip") {
        skipped++;
      } else if (existingId && duplicateStrategy === "update") {
        const { name: _n, ...rest } = row;
        await db.update(exercisesTable).set({ ...rest as object, updatedAt: new Date() }).where(eq(exercisesTable.id, existingId));
        updated++;
      } else {
        // "create" strategy or no duplicate — insert new.
        const slugSource = name;
        await withUniqueSlugRetry(slugSource, (slug) =>
          db.insert(exercisesTable).values({ ...(row as Partial<typeof exercisesTable.$inferInsert>), name, slug } as typeof exercisesTable.$inferInsert).returning(),
        );
        imported++;
        // Add to map so subsequent rows with the same name are treated as duplicates.
        const [inserted] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.name, name)).orderBy(exercisesTable.id).limit(1);
        if (inserted) nameMap.set(name.toLowerCase(), inserted.id);
      }
    } catch (err) {
      failed++;
      failedErrors.push({ rowIndex: i, exerciseName: name, errors: ["Błąd bazy danych podczas importu tego wiersza"] });
    }
  }

  res.json(ImportExercisesResponse.parse({ imported, updated, skipped, failed, errors: failedErrors }));
});

// ─── Single exercise CRUD ─────────────────────────────────────────────────────

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

  const statsMap = await fetchMuscleStats([exercise.id]);
  const completeness = computeCompleteness(exercise, statsMap.get(exercise.id));
  res.json(GetExerciseResponse.parse({ ...exercise, ...completeness }));
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

  const statsMap = await fetchMuscleStats([exercise.id]);
  const completeness = computeCompleteness(exercise, statsMap.get(exercise.id));
  res.json(UpdateExerciseResponse.parse({ ...exercise, ...completeness }));
});

// ─── Substitutions ────────────────────────────────────────────────────────────

router.get("/exercises/:id/substitutions", async (req, res): Promise<void> => {
  const params = GetExerciseSubstitutionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [exercise] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, params.data.id));
  if (!exercise) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return; }

  const rows = await db
    .select({
      id: exerciseSubstitutionsTable.id,
      exerciseId: exerciseSubstitutionsTable.exerciseId,
      substituteExerciseId: exerciseSubstitutionsTable.substituteExerciseId,
      substituteName: exercisesTable.name,
      substituteSlug: exercisesTable.slug,
      sortOrder: exerciseSubstitutionsTable.sortOrder,
    })
    .from(exerciseSubstitutionsTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, exerciseSubstitutionsTable.substituteExerciseId))
    .where(eq(exerciseSubstitutionsTable.exerciseId, params.data.id))
    .orderBy(exerciseSubstitutionsTable.sortOrder, exercisesTable.name);

  res.json(GetExerciseSubstitutionsResponse.parse(rows));
});

router.post("/exercises/:id/substitutions", async (req, res): Promise<void> => {
  const params = AddExerciseSubstitutionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = AddExerciseSubstitutionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [exercise] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, params.data.id));
  if (!exercise) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return; }

  const [sub] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, parsed.data.substituteExerciseId));
  if (!sub) { res.status(404).json({ error: "Zamiennik nie znaleziony" }); return; }

  try {
    const [inserted] = await db
      .insert(exerciseSubstitutionsTable)
      .values({
        exerciseId: params.data.id,
        substituteExerciseId: parsed.data.substituteExerciseId,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();

    const [row] = await db
      .select({
        id: exerciseSubstitutionsTable.id,
        exerciseId: exerciseSubstitutionsTable.exerciseId,
        substituteExerciseId: exerciseSubstitutionsTable.substituteExerciseId,
        substituteName: exercisesTable.name,
        substituteSlug: exercisesTable.slug,
        sortOrder: exerciseSubstitutionsTable.sortOrder,
      })
      .from(exerciseSubstitutionsTable)
      .innerJoin(exercisesTable, eq(exercisesTable.id, exerciseSubstitutionsTable.substituteExerciseId))
      .where(eq(exerciseSubstitutionsTable.id, inserted.id));

    res.status(201).json(AddExerciseSubstitutionResponse.parse(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Ten zamiennik jest już przypisany" });
      return;
    }
    throw error;
  }
});

router.delete("/exercises/:id/substitutions/:substituteId", async (req, res): Promise<void> => {
  const params = RemoveExerciseSubstitutionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const result = await db
    .delete(exerciseSubstitutionsTable)
    .where(
      and(
        eq(exerciseSubstitutionsTable.exerciseId, params.data.id),
        eq(exerciseSubstitutionsTable.substituteExerciseId, params.data.substituteId),
      ),
    )
    .returning({ id: exerciseSubstitutionsTable.id });

  if (result.length === 0) { res.status(404).json({ error: "Zamiennik nie znaleziony" }); return; }

  res.status(204).send();
});

// ─── Progressions ─────────────────────────────────────────────────────────────

router.get("/exercises/:id/progressions", async (req, res): Promise<void> => {
  const params = GetExerciseProgressionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [exercise] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, params.data.id));
  if (!exercise) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return; }

  const rows = await db
    .select({
      id: exerciseProgressionsTable.id,
      exerciseId: exerciseProgressionsTable.exerciseId,
      linkedExerciseId: exerciseProgressionsTable.linkedExerciseId,
      linkedExerciseName: exercisesTable.name,
      linkedExerciseSlug: exercisesTable.slug,
      direction: exerciseProgressionsTable.direction,
      sortOrder: exerciseProgressionsTable.sortOrder,
    })
    .from(exerciseProgressionsTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, exerciseProgressionsTable.linkedExerciseId))
    .where(eq(exerciseProgressionsTable.exerciseId, params.data.id))
    .orderBy(exerciseProgressionsTable.direction, exerciseProgressionsTable.sortOrder, exercisesTable.name);

  res.json(GetExerciseProgressionsResponse.parse(rows));
});

router.post("/exercises/:id/progressions", async (req, res): Promise<void> => {
  const params = AddExerciseProgressionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = AddExerciseProgressionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.direction !== "progression" && parsed.data.direction !== "regression") {
    res.status(400).json({ error: "direction musi być 'progression' lub 'regression'" });
    return;
  }

  const [exercise] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, params.data.id));
  if (!exercise) { res.status(404).json({ error: "Ćwiczenie nie znalezione" }); return; }

  const [linked] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, parsed.data.linkedExerciseId));
  if (!linked) { res.status(404).json({ error: "Powiązane ćwiczenie nie znalezione" }); return; }

  try {
    const [inserted] = await db
      .insert(exerciseProgressionsTable)
      .values({
        exerciseId: params.data.id,
        linkedExerciseId: parsed.data.linkedExerciseId,
        direction: parsed.data.direction,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();

    const [row] = await db
      .select({
        id: exerciseProgressionsTable.id,
        exerciseId: exerciseProgressionsTable.exerciseId,
        linkedExerciseId: exerciseProgressionsTable.linkedExerciseId,
        linkedExerciseName: exercisesTable.name,
        linkedExerciseSlug: exercisesTable.slug,
        direction: exerciseProgressionsTable.direction,
        sortOrder: exerciseProgressionsTable.sortOrder,
      })
      .from(exerciseProgressionsTable)
      .innerJoin(exercisesTable, eq(exercisesTable.id, exerciseProgressionsTable.linkedExerciseId))
      .where(eq(exerciseProgressionsTable.id, inserted.id));

    res.status(201).json(AddExerciseProgressionResponse.parse(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "To powiązanie już istnieje" });
      return;
    }
    throw error;
  }
});

router.delete("/exercises/:id/progressions/:progressionId", async (req, res): Promise<void> => {
  const params = RemoveExerciseProgressionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const result = await db
    .delete(exerciseProgressionsTable)
    .where(
      and(
        eq(exerciseProgressionsTable.exerciseId, params.data.id),
        eq(exerciseProgressionsTable.id, params.data.progressionId),
      ),
    )
    .returning({ id: exerciseProgressionsTable.id });

  if (result.length === 0) { res.status(404).json({ error: "Powiązanie nie znalezione" }); return; }

  res.status(204).send();
});

export default router;
