import { Router, type IRouter } from "express";
import { eq, and, ilike, inArray, count, sql } from "drizzle-orm";
import {
  db,
  exercisesTable,
  exerciseSubstitutionsTable,
  exerciseProgressionsTable,
  specificMusclesTable,
  exerciseMuscleAssignmentsTable,
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

/**
 * Normalises an exercise name for duplicate comparison ONLY.
 * The original name is always preserved in the database.
 *
 * Normalises:
 *   - leading / trailing whitespace
 *   - repeated internal whitespace → single space
 *   - letter casing → lowercase
 *   - Polish diacritics (ą→a, ę→e, ó→o, ś→s, ź→z, ć→c, ń→n, ż→z)
 *     ł is not decomposable via NFD and is mapped explicitly (ł→l)
 *   - common punctuation variants (en/em dash→hyphen, curly quotes→straight)
 *
 * Does NOT merge semantically different names:
 *   "Wyciskanie hantli siedząc" ≠ "Wyciskanie hantli stojąc" after normalisation.
 */
function normalizeForComparison(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")              // collapse repeated spaces
    .toLowerCase()
    .replace(/ł/g, "l")               // ł does not decompose in NFD
    .normalize("NFD")                  // decompose ą ę ó ś ź ć ń ż into base + combining
    .replace(/[\u0300-\u036f]/g, "")  // strip combining diacritical marks
    .replace(/[\u2013\u2014]/g, "-")  // en dash / em dash → hyphen
    .replace(/[\u2018\u2019\u0060]/g, "'")  // curly apostrophes / backtick → straight
    .replace(/[\u201c\u201d\u201e]/g, '"'); // curly / low-9 quotes → straight
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

// ─── Muscle-assignment import helper ─────────────────────────────────────────

type MuscleAssignmentInput = {
  specificMuscleName: string;
  isPrimary: boolean;
  coefficient: number;
};

/**
 * Look up each muscle by name and insert exercise_muscle_assignments rows.
 * Unknown muscle names are silently skipped (the exercise import still succeeds).
 */
async function processMuscleAssignments(
  exerciseId: number,
  assignments: MuscleAssignmentInput[] | undefined,
): Promise<void> {
  if (!Array.isArray(assignments) || assignments.length === 0) return;

  const muscleNames = [...new Set(assignments.map((a) => a.specificMuscleName).filter(Boolean))];
  if (muscleNames.length === 0) return;

  const muscles = await db
    .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
    .from(specificMusclesTable)
    .where(inArray(specificMusclesTable.name, muscleNames));

  const muscleIdMap = new Map(muscles.map((m) => [m.name, m.id]));

  const toInsert = assignments
    .filter((a) => muscleIdMap.has(a.specificMuscleName))
    .map((a) => ({
      exerciseId,
      specificMuscleId: muscleIdMap.get(a.specificMuscleName)!,
      coefficient: Math.min(1.0, Math.max(0.01, Number(a.coefficient))),
      isPrimary: Boolean(a.isPrimary),
    }));

  if (toInsert.length > 0) {
    await db.insert(exerciseMuscleAssignmentsTable).values(toInsert);
  }
}

function parseIsActiveFilter(raw: unknown): boolean | undefined {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

// ─── Lightweight search (used by SurveyForm picker — no full descriptions) ────
// Must be registered before /exercises/:id to avoid route ambiguity.

router.get("/exercises/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rawLimit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10);
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

  const rows = await db
    .select({
      id: exercisesTable.id,
      name: exercisesTable.name,
      mainMuscleGroup: exercisesTable.mainMuscleGroup,
      equipment: exercisesTable.equipment,
      movementPattern: exercisesTable.movementPattern,
      isActive: exercisesTable.isActive,
    })
    .from(exercisesTable)
    .where(eq(exercisesTable.isActive, true))
    .orderBy(exercisesTable.name);

  const results = q
    ? rows.filter((e) => normalizeForComparison(e.name).includes(normalizeForComparison(q)))
    : rows;

  res.json(results.slice(0, limit));
});

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/exercises", async (req, res): Promise<void> => {
  const query = ListExercisesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search, mainMuscleGroup, equipment, difficultyLevel, trainingLocation, exerciseType, movementPattern, secondaryMuscleGroup, movementComplexity } = query.data;
  // The generated query schema coerces boolean params with zod.coerce.boolean(),
  // which treats any non-empty string (including "false") as true.
  // Parse all boolean filters from raw query ourselves so ?param=false is honoured.
  const isActive = parseIsActiveFilter(req.query.isActive);
  const isCompleteFilter = parseIsActiveFilter(req.query.isComplete);
  const suitableForNoActivityFilter = parseIsActiveFilter(req.query.suitableForNoActivity);

  const conditions = [
    search ? ilike(exercisesTable.name, `%${search}%`) : undefined,
    mainMuscleGroup ? eq(exercisesTable.mainMuscleGroup, mainMuscleGroup) : undefined,
    difficultyLevel ? eq(exercisesTable.difficultyLevel, difficultyLevel) : undefined,
    exerciseType ? eq(exercisesTable.exerciseType, exerciseType) : undefined,
    movementPattern ? eq(exercisesTable.movementPattern, movementPattern) : undefined,
    movementComplexity ? eq(exercisesTable.movementComplexity, movementComplexity) : undefined,
    typeof isActive === "boolean" ? eq(exercisesTable.isActive, isActive) : undefined,
    typeof suitableForNoActivityFilter === "boolean"
      ? eq(exercisesTable.suitableForNoActivity, suitableForNoActivityFilter)
      : undefined,
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
  "Anti-ekstensja", "Anti-rotacja",
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
const VALID_LOCATION = new Set(["Siłownia", "Dom", "Plener"]);

/**
 * Normalize legacy / alias location values in an import row before validation
 * and insertion.  "Siłownia plenerowa" is silently mapped to the canonical
 * stored value "Plener" so bulk-import files created before the consolidation
 * continue to work without modification.
 */
function normalizeImportLocations<T extends { trainingLocation?: string[] }>(row: T): T {
  if (!Array.isArray(row.trainingLocation)) return row;
  return {
    ...row,
    trainingLocation: row.trainingLocation.map((l) =>
      l?.trim() === "Siłownia plenerowa" ? "Plener" : l,
    ),
  };
}

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

type RelationInput = { exerciseName: string };

type ImportRowFull = ImportRowInput & {
  muscleAssignments?: MuscleAssignmentInput[];
  substitutions?: RelationInput[];
  progressions?: RelationInput[];
  regressions?: RelationInput[];
};

/** Transaction type — same interface as db but scoped to the current transaction. */
type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/**
 * Insert or replace muscle assignments inside a transaction.
 * Clears existing rows for the exercise first (safe for update strategy).
 * Throws MUSCLE_NOT_FOUND if any specificMuscleName is not in the canonical table.
 */
async function processMuscleAssignmentsTx(
  tx: TxType,
  exerciseId: number,
  exerciseName: string,
  assignments: MuscleAssignmentInput[],
): Promise<void> {
  if (!assignments.length) return;

  await tx
    .delete(exerciseMuscleAssignmentsTable)
    .where(eq(exerciseMuscleAssignmentsTable.exerciseId, exerciseId));

  const muscleNames = [...new Set(assignments.map((a) => a.specificMuscleName).filter(Boolean))];
  const muscles = await tx
    .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
    .from(specificMusclesTable)
    .where(inArray(specificMusclesTable.name, muscleNames));
  const muscleIdMap = new Map(muscles.map((m) => [m.name, m.id]));

  for (const assignment of assignments) {
    const muscleId = muscleIdMap.get(assignment.specificMuscleName);
    if (!muscleId) {
      throw Object.assign(
        new Error(`Muscle "${assignment.specificMuscleName}" for "${exerciseName}" not found`),
        { code: "MUSCLE_NOT_FOUND", exerciseName, muscleName: assignment.specificMuscleName },
      );
    }
    await tx.insert(exerciseMuscleAssignmentsTable).values({
      exerciseId,
      specificMuscleId: muscleId,
      coefficient: Math.min(1.0, Math.max(0.01, Number(assignment.coefficient))),
      isPrimary: Boolean(assignment.isPrimary),
    });
  }
}

/**
 * Generate a unique slug using tx so new slugs from within the batch are visible.
 */
async function generateUniqueSlugTx(
  tx: TxType,
  name: string,
  excludeId?: number,
): Promise<string> {
  const base = slugify(name) || "cwiczenie";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(eq(exercisesTable.slug, candidate));
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

async function withUniqueSlugRetryTx<T>(
  tx: TxType,
  name: string,
  operation: (slug: string) => Promise<T>,
  excludeId?: number,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const slug = await generateUniqueSlugTx(tx, name, excludeId);
    try {
      return await operation(slug);
    } catch (error) {
      if (isUniqueViolation(error)) { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError;
}

// ─── Preview ──────────────────────────────────────────────────────────────────

router.post("/exercises/import/preview", async (req, res): Promise<void> => {
  const parsed = PreviewExerciseImportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { rows } = parsed.data;
  const errors: Array<{ rowIndex: number; exerciseName?: string; errors: string[] }> = [];
  const duplicates: Array<{ rowIndex: number; exerciseName: string; existingId: number }> = [];
  let validCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = normalizeImportLocations(rows[i] as ImportRowInput);
    const rowErrors = validateImportRow(row, i);
    if (rowErrors.length > 0) {
      errors.push({ rowIndex: i, exerciseName: row.name, errors: rowErrors });
    } else {
      validCount++;
    }
  }

  // Resolve existing exercises once for duplicate + relation target checks.
  const existing = await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable);
  const nameMap = new Map(existing.map((e) => [normalizeForComparison(e.name), e.id]));
  // Also add names from this batch so cross-row relation targets are visible.
  for (const row of rows) {
    const name = (row as ImportRowInput).name?.trim();
    if (name) {
      const key = normalizeForComparison(name);
      nameMap.set(key, nameMap.get(key) ?? -1);
    }
  }

  // Duplicate detection
  for (let i = 0; i < rows.length; i++) {
    if (errors.some((e) => e.rowIndex === i)) continue;
    const name = (rows[i] as ImportRowInput).name?.trim() ?? "";
    const existingId = existing.find((e) => normalizeForComparison(e.name) === normalizeForComparison(name))?.id;
    if (existingId) duplicates.push({ rowIndex: i, exerciseName: name, existingId });
  }

  // Relation target validation — report missing targets as errors
  for (let i = 0; i < rows.length; i++) {
    if (errors.some((e) => e.rowIndex === i)) continue;
    const row = rows[i] as ImportRowFull;
    const rowName = row.name?.trim() ?? `row ${i}`;
    const relErrors: string[] = [];

    const checkRel = (label: string, rels: RelationInput[] | undefined) => {
      for (const rel of rels ?? []) {
        if (!nameMap.has(normalizeForComparison(rel.exerciseName))) {
          relErrors.push(`${label} target nie istnieje: "${rel.exerciseName}"`);
        }
      }
    };
    checkRel("Substitution", row.substitutions);
    checkRel("Progression", row.progressions);
    checkRel("Regression", row.regressions);

    if (relErrors.length > 0) {
      errors.push({ rowIndex: i, exerciseName: rowName, errors: relErrors });
      validCount--;
    }
  }

  res.json(PreviewExerciseImportResponse.parse({ validCount, errors, duplicates }));
});

// ─── Atomic import ────────────────────────────────────────────────────────────

router.post("/exercises/import", async (req, res): Promise<void> => {
  const parsed = ImportExercisesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { rows, duplicateStrategy, skipInvalidRows } = parsed.data;

  // ── Stage 0: pre-validate all rows before opening a transaction ─────────────
  const validRows: ImportRowFull[] = [];
  const preErrors: Array<{ rowIndex: number; exerciseName?: string; errors: string[] }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = normalizeImportLocations(rows[i] as ImportRowFull);
    const rowErrors = validateImportRow(row, i);
    if (rowErrors.length > 0) {
      if (skipInvalidRows) continue; // silently drop
      preErrors.push({ rowIndex: i, exerciseName: row.name, errors: rowErrors });
    } else {
      validRows.push(row);
    }
  }

  if (preErrors.length > 0) {
    res.status(422).json({
      error: "VALIDATION_FAILURE",
      message: `${preErrors.length} row(s) failed validation. No transaction started.`,
      errors: preErrors,
    });
    return;
  }

  // ── Atomic transaction ──────────────────────────────────────────────────────
  try {
    const result = await db.transaction(async (tx) => {
      // Build global name→id map from ALL existing exercises.
      const allExisting = await tx
        .select({ id: exercisesTable.id, name: exercisesTable.name })
        .from(exercisesTable);
      const globalNameToId = new Map(allExisting.map((e) => [normalizeForComparison(e.name), e.id]));

      let imported = 0, updated = 0, skipped = 0;
      // exerciseId → row (all exercises being processed, including skipped duplicates).
      const processedExercises = new Map<number, ImportRowFull>();
      // Ids of exercises that were inserted or updated (need completeness check).
      const modifiedIds: number[] = [];

      // ── Step 1: Exercises ────────────────────────────────────────────────────
      for (const row of validRows) {
        const name = (row.name ?? "").trim();
        const existingId = globalNameToId.get(normalizeForComparison(name));

        if (existingId !== undefined && duplicateStrategy === "skip") {
          skipped++;
          processedExercises.set(existingId, row); // still process relations

        } else if (existingId !== undefined && duplicateStrategy === "update") {
          const {
            name: _n, muscleAssignments: _ma,
            substitutions: _s, progressions: _p, regressions: _r,
            ...exerciseFields
          } = row;
          await tx
            .update(exercisesTable)
            .set({ ...(exerciseFields as object), updatedAt: new Date() })
            .where(eq(exercisesTable.id, existingId));
          updated++;
          processedExercises.set(existingId, row);
          modifiedIds.push(existingId);

        } else {
          // Insert new exercise (no duplicate, or "create" strategy).
          const {
            muscleAssignments: _ma, substitutions: _s,
            progressions: _p, regressions: _r,
            ...exerciseFields
          } = row;
          const insertedRows = await withUniqueSlugRetryTx(tx, name, (slug) =>
            tx.insert(exercisesTable)
              .values({ ...(exerciseFields as Partial<typeof exercisesTable.$inferInsert>), name, slug } as typeof exercisesTable.$inferInsert)
              .returning({ id: exercisesTable.id }),
          );
          const newId = insertedRows[0]?.id;
          if (!newId) {
            throw Object.assign(
              new Error(`Failed to get inserted ID for "${name}"`),
              { code: "INTERNAL_ERROR" },
            );
          }
          imported++;
          globalNameToId.set(normalizeForComparison(name), newId);
          processedExercises.set(newId, row);
          modifiedIds.push(newId);
        }
      }

      // ── Step 2: Muscle assignments (inserted/updated exercises only) ──────────
      for (const exerciseId of modifiedIds) {
        const row = processedExercises.get(exerciseId)!;
        if (row.muscleAssignments?.length) {
          await processMuscleAssignmentsTx(tx, exerciseId, row.name ?? "", row.muscleAssignments);
        }
      }

      // ── Step 3: Completeness verification — fail fast, roll back all ─────────
      for (const exerciseId of modifiedIds) {
        const [ex] = await tx
          .select()
          .from(exercisesTable)
          .where(eq(exercisesTable.id, exerciseId));

        const [stats] = await tx
          .select({
            total: count(exerciseMuscleAssignmentsTable.id),
            primaryCount: sql<number>`COUNT(CASE WHEN ${exerciseMuscleAssignmentsTable.isPrimary} = true THEN 1 END)::int`,
          })
          .from(exerciseMuscleAssignmentsTable)
          .where(eq(exerciseMuscleAssignmentsTable.exerciseId, exerciseId));

        const completeness = computeCompleteness(ex, {
          total: Number(stats?.total ?? 0),
          primaryCount: Number(stats?.primaryCount ?? 0),
        });

        if (!completeness.isComplete) {
          throw Object.assign(
            new Error(`"${ex.name}" failed completeness check`),
            { code: "COMPLETENESS_FAILURE", exerciseName: ex.name, missingFields: completeness.missingFields },
          );
        }
      }

      // ── Steps 4–6: Relations (substitutions → progressions → regressions) ────
      // onConflictDoNothing makes relation insertion idempotent across re-imports.
      let substitutionsImported = 0;
      let progressionsImported = 0;
      let regressionsImported = 0;

      for (const [exerciseId, row] of processedExercises) {
        const rowName = (row.name ?? "").trim();

        // Step 4: Substitutions
        for (let si = 0; si < (row.substitutions?.length ?? 0); si++) {
          const sub = row.substitutions![si];
          const targetId = globalNameToId.get(normalizeForComparison(sub.exerciseName));
          if (targetId === undefined) {
            throw Object.assign(
              new Error(`Substitution target "${sub.exerciseName}" not found for "${rowName}"`),
              { code: "RELATION_NOT_FOUND", relationType: "substitution", sourceName: rowName, targetName: sub.exerciseName },
            );
          }
          await tx.insert(exerciseSubstitutionsTable)
            .values({ exerciseId, substituteExerciseId: targetId, sortOrder: si })
            .onConflictDoNothing();
          substitutionsImported++;
        }

        // Step 5: Progressions
        for (let pi = 0; pi < (row.progressions?.length ?? 0); pi++) {
          const prog = row.progressions![pi];
          const targetId = globalNameToId.get(normalizeForComparison(prog.exerciseName));
          if (targetId === undefined) {
            throw Object.assign(
              new Error(`Progression target "${prog.exerciseName}" not found for "${rowName}"`),
              { code: "RELATION_NOT_FOUND", relationType: "progression", sourceName: rowName, targetName: prog.exerciseName },
            );
          }
          await tx.insert(exerciseProgressionsTable)
            .values({ exerciseId, linkedExerciseId: targetId, direction: "progression", sortOrder: pi })
            .onConflictDoNothing();
          progressionsImported++;
        }

        // Step 6: Regressions
        for (let ri = 0; ri < (row.regressions?.length ?? 0); ri++) {
          const reg = row.regressions![ri];
          const targetId = globalNameToId.get(normalizeForComparison(reg.exerciseName));
          if (targetId === undefined) {
            throw Object.assign(
              new Error(`Regression target "${reg.exerciseName}" not found for "${rowName}"`),
              { code: "RELATION_NOT_FOUND", relationType: "regression", sourceName: rowName, targetName: reg.exerciseName },
            );
          }
          await tx.insert(exerciseProgressionsTable)
            .values({ exerciseId, linkedExerciseId: targetId, direction: "regression", sortOrder: ri })
            .onConflictDoNothing();
          regressionsImported++;
        }
      }

      return {
        imported, updated, skipped, failed: 0, errors: [],
        substitutionsImported, progressionsImported, regressionsImported,
      };
    });

    res.json(ImportExercisesResponse.parse(result));

  } catch (err: unknown) {
    const e = err as {
      code?: string; message?: string;
      exerciseName?: string; missingFields?: string[];
      relationType?: string; sourceName?: string; targetName?: string;
      muscleName?: string;
    };

    if (e.code === "COMPLETENESS_FAILURE") {
      res.status(422).json({
        error: "COMPLETENESS_FAILURE",
        exerciseName: e.exerciseName,
        missingFields: e.missingFields,
        message: `Import rolled back: "${e.exerciseName}" failed completeness check. All ${e.missingFields?.length ?? 0} missing field(s) must be resolved.`,
      });
    } else if (e.code === "RELATION_NOT_FOUND") {
      res.status(422).json({
        error: "RELATION_NOT_FOUND",
        relationType: e.relationType,
        sourceName: e.sourceName,
        targetName: e.targetName,
        message: `Import rolled back: ${e.relationType} target "${e.targetName}" for "${e.sourceName}" not found in the database or current batch.`,
      });
    } else if (e.code === "MUSCLE_NOT_FOUND") {
      res.status(422).json({
        error: "MUSCLE_NOT_FOUND",
        exerciseName: e.exerciseName,
        muscleName: e.muscleName,
        message: `Import rolled back: muscle "${e.muscleName}" for "${e.exerciseName}" not found in the canonical muscle table.`,
      });
    } else {
      res.status(500).json({
        error: "IMPORT_FAILED",
        message: e.message ?? "Unknown database error. Full batch rolled back.",
      });
    }
  }
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
