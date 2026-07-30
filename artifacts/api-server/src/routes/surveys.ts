import { Router, type IRouter } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db, surveysTable, exercisesTable, clientsTable } from "@workspace/db";
import {
  GetClientSurveyParams,
  UpsertClientSurveyParams,
  UpsertClientSurveyBody,
  GetClientSurveyResponse,
  UpsertClientSurveyResponse,
  ListClientSurveysParams,
  ListClientSurveysResponse,
  GetClientSurveyByIdParams,
  GetClientSurveyByIdResponse,
  GetClientAvoidedExercisesParams,
  GetClientAvoidedExercisesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * Verifies that the given client belongs to the authenticated trainer.
 * Returns false when the client does not exist or belongs to a different trainer.
 * Ownership is always derived through clients.trainer_id — never from request body
 * or query parameters.
 */
async function assertClientOwnership(clientId: number, trainerId: number): Promise<boolean> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)));
  return !!client;
}

// ─── GET /clients/:clientId/survey ───────────────────────────────────────────
// Returns the client's most recent survey (used for the profile/edit-form prefill
// and as the "current" survey for overview/full-survey views).

router.get("/clients/:clientId/survey", requireAuth, async (req, res): Promise<void> => {
  const params = GetClientSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId))
    .orderBy(desc(surveysTable.createdAt))
    .limit(1);

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony" });
    return;
  }

  res.json(GetClientSurveyResponse.parse(survey));
});

// ─── GET /clients/:clientId/surveys ──────────────────────────────────────────
// Full survey history for a client, newest first.

router.get("/clients/:clientId/surveys", requireAuth, async (req, res): Promise<void> => {
  const params = ListClientSurveysParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const surveys = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId))
    .orderBy(desc(surveysTable.createdAt));

  res.json(ListClientSurveysResponse.parse(surveys));
});

// ─── GET /clients/:clientId/surveys/:surveyId ─────────────────────────────────
// A specific historical survey, for read-only viewing.

router.get("/clients/:clientId/surveys/:surveyId", requireAuth, async (req, res): Promise<void> => {
  const params = GetClientSurveyByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(and(eq(surveysTable.clientId, params.data.clientId), eq(surveysTable.id, params.data.surveyId)));

  if (!survey) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony" });
    return;
  }

  res.json(GetClientSurveyByIdResponse.parse(survey));
});

// ─── GET /clients/:clientId/avoided-exercises ────────────────────────────────
// Returns the client's avoided exercises resolved from their latest survey.
// Fetches exercise metadata in a single DB query (no N+1).

router.get("/clients/:clientId/avoided-exercises", requireAuth, async (req, res): Promise<void> => {
  const params = GetClientAvoidedExercisesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const [survey] = await db
    .select({
      avoidedExerciseIds: surveysTable.avoidedExerciseIds,
      avoidedExerciseReasons: surveysTable.avoidedExerciseReasons,
      avoidedExerciseOtherText: surveysTable.avoidedExerciseOtherText,
      avoidedExerciseOtherReason: surveysTable.avoidedExerciseOtherReason,
    })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, params.data.clientId))
    .orderBy(desc(surveysTable.createdAt))
    .limit(1);

  if (!survey || survey.avoidedExerciseIds.length === 0) {
    // Optionally surface other-text even when no IDs are set
    const items = !survey ? [] : (survey.avoidedExerciseOtherText || survey.avoidedExerciseOtherReason)
      ? [{
          id: 0,
          name: "",
          isActive: true,
          reason: null,
          otherText: survey.avoidedExerciseOtherText ?? null,
          otherReason: survey.avoidedExerciseOtherReason ?? null,
        }]
      : [];
    res.json(GetClientAvoidedExercisesResponse.parse(items));
    return;
  }

  const reasons = (survey.avoidedExerciseReasons ?? {}) as Record<string, string>;

  const exercises = await db
    .select({ id: exercisesTable.id, name: exercisesTable.name, isActive: exercisesTable.isActive })
    .from(exercisesTable)
    .where(inArray(exercisesTable.id, survey.avoidedExerciseIds));

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  type AvoidedItem = {
    id: number;
    name: string;
    isActive: boolean;
    reason: string | null;
    otherText: string | null;
    otherReason: string | null;
  };

  const items: AvoidedItem[] = survey.avoidedExerciseIds.map((id) => {
    const ex = exerciseMap.get(id);
    return {
      id,
      name: ex?.name ?? `#${id}`,
      isActive: ex?.isActive ?? false,
      reason: reasons[String(id)] ?? null,
      otherText: null,
      otherReason: null,
    };
  });

  // Append other-text entry if present
  if (survey.avoidedExerciseOtherText || survey.avoidedExerciseOtherReason) {
    items.push({
      id: 0,
      name: "",
      isActive: true,
      reason: null,
      otherText: survey.avoidedExerciseOtherText ?? null,
      otherReason: survey.avoidedExerciseOtherReason ?? null,
    });
  }

  res.json(GetClientAvoidedExercisesResponse.parse(items));
});

// ─── PUT /clients/:clientId/survey ───────────────────────────────────────────
// Always inserts a new survey row — surveys are append-only history so past
// answers are never lost when the trainer saves an updated interview.

router.put("/clients/:clientId/survey", requireAuth, async (req, res): Promise<void> => {
  const params = UpsertClientSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const parsed = UpsertClientSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.trainingGoal === "Inny" && (!parsed.data.trainingGoalOther || parsed.data.trainingGoalOther.trim() === "")) {
    res.status(400).json({ error: "Opis celu treningowego jest wymagany, gdy wybrano \"Inny\"" });
    return;
  }

  // Validate & normalise avoidedExerciseIds
  const rawAvoidedIds = parsed.data.avoidedExerciseIds ?? [];
  const deduplicatedIds = [...new Set(rawAvoidedIds)];

  if (deduplicatedIds.length > 0) {
    const foundExercises = await db
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(inArray(exercisesTable.id, deduplicatedIds));
    const foundIds = new Set(foundExercises.map((e) => e.id));
    const missingIds = deduplicatedIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      res.status(400).json({ error: `Nieznane ID ćwiczeń: ${missingIds.join(", ")}` });
      return;
    }
  }

  // Trim reason values; empty string → omitted key
  const rawReasons = parsed.data.avoidedExerciseReasons ?? {};
  const normalizedReasons: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawReasons)) {
    const trimmed = v.trim();
    if (trimmed) normalizedReasons[k] = trimmed;
  }

  // `dateOfBirth` is a plain "YYYY-MM-DD" string — parse for validation/age math only.
  const { dateOfBirth, ...rest } = parsed.data;
  const dateOfBirthDate = dateOfBirth ? new Date(dateOfBirth) : undefined;
  if (dateOfBirthDate && dateOfBirthDate.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const { avoidedExerciseIds: _rawIds, avoidedExerciseReasons: _rawReasons, ...rest2 } = rest;

  // Strip any trainerId the caller may have included in the body — ownership comes
  // only from the authenticated session, never from the request payload.
  const { trainerId: _ignoredTrainerId, ...rest3 } = rest2 as typeof rest2 & { trainerId?: unknown };

  const normalizedData = {
    ...rest3,
    dateOfBirth: dateOfBirthDate ? dateOfBirthDate.toISOString().split("T")[0] : undefined,
    age: dateOfBirthDate ? calculateAge(dateOfBirthDate) : rest.age,
    avoidedExerciseIds: deduplicatedIds,
    avoidedExerciseReasons: normalizedReasons,
    avoidedExerciseOtherText: parsed.data.avoidedExerciseOtherText ?? null,
    avoidedExerciseOtherReason: parsed.data.avoidedExerciseOtherReason ?? null,
  };

  const [survey] = await db
    .insert(surveysTable)
    .values({ ...normalizedData, clientId: params.data.clientId })
    .returning();

  res.json(UpsertClientSurveyResponse.parse(survey));
});

// ─── PATCH /clients/:clientId/surveys/:surveyId ───────────────────────────────
// Updates an existing survey row in-place — used by the trainer-side edit form.
// Validates the body identically to PUT but does UPDATE instead of INSERT so the
// client's survey history is not extended.

router.patch("/clients/:clientId/surveys/:surveyId", requireAuth, async (req, res): Promise<void> => {
  const params = GetClientSurveyByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!await assertClientOwnership(params.data.clientId, req.trainer!.id)) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const parsed = UpsertClientSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.trainingGoal === "Inny" && (!parsed.data.trainingGoalOther || parsed.data.trainingGoalOther.trim() === "")) {
    res.status(400).json({ error: "Opis celu treningowego jest wymagany, gdy wybrano \"Inny\"" });
    return;
  }

  const rawAvoidedIds = parsed.data.avoidedExerciseIds ?? [];
  const deduplicatedIds = [...new Set(rawAvoidedIds)];

  if (deduplicatedIds.length > 0) {
    const foundExercises = await db
      .select({ id: exercisesTable.id })
      .from(exercisesTable)
      .where(inArray(exercisesTable.id, deduplicatedIds));
    const foundIds = new Set(foundExercises.map((e) => e.id));
    const missingIds = deduplicatedIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      res.status(400).json({ error: `Nieznane ID ćwiczeń: ${missingIds.join(", ")}` });
      return;
    }
  }

  const rawReasons = parsed.data.avoidedExerciseReasons ?? {};
  const normalizedReasons: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawReasons)) {
    const trimmed = v.trim();
    if (trimmed) normalizedReasons[k] = trimmed;
  }

  const { dateOfBirth, ...rest } = parsed.data;
  const dateOfBirthDate = dateOfBirth ? new Date(dateOfBirth) : undefined;
  if (dateOfBirthDate && dateOfBirthDate.getTime() > Date.now()) {
    res.status(400).json({ error: "Data urodzenia nie może być w przyszłości" });
    return;
  }
  const { avoidedExerciseIds: _rawIds, avoidedExerciseReasons: _rawReasons, ...rest2 } = rest;

  // Strip any trainerId the caller may have included in the body.
  const { trainerId: _ignoredTrainerId, ...rest3 } = rest2 as typeof rest2 & { trainerId?: unknown };

  const normalizedData = {
    ...rest3,
    dateOfBirth: dateOfBirthDate ? dateOfBirthDate.toISOString().split("T")[0] : undefined,
    age: dateOfBirthDate ? calculateAge(dateOfBirthDate) : rest.age,
    avoidedExerciseIds: deduplicatedIds,
    avoidedExerciseReasons: normalizedReasons,
    avoidedExerciseOtherText: parsed.data.avoidedExerciseOtherText ?? null,
    avoidedExerciseOtherReason: parsed.data.avoidedExerciseOtherReason ?? null,
  };

  const [updated] = await db
    .update(surveysTable)
    .set(normalizedData)
    .where(and(eq(surveysTable.id, params.data.surveyId), eq(surveysTable.clientId, params.data.clientId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Wywiad treningowy nie znaleziony" });
    return;
  }

  res.json(UpsertClientSurveyResponse.parse(updated));
});

export default router;
