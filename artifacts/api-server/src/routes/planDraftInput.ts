/**
 * Plan Draft Input routes — Phase 1, 2 & 3A of the Workout Plan Draft Generator.
 *
 * Phase 1:
 *   GET  /clients/:clientId/plan-draft-input
 *     Returns all normalized data needed to configure the generation wizard.
 *     Does NOT generate a plan, select exercises, or allocate volume.
 *
 *   POST /plans/draft-input/validate
 *     Validates a set of wizard preferences. Does NOT save or generate anything.
 *
 * Phase 2:
 *   POST /plans/draft-volume/preview
 *     Calculates recommended weekly effective volumes for all 11 volume targets
 *     based on Phase 1 inputs and wizard Step 2 preferences.
 *     Read-only — no database writes, no plan created.
 *
 * Phase 3A:
 *   POST /plans/draft-distribution/preview
 *     Recommends a split type, generates day templates, and distributes the
 *     Phase 2 selected weekly volumes across training days.
 *     Read-only — no database writes, no plan created.
 */

import { Router, type IRouter } from "express";
import {
  GetClientPlanDraftInputParams,
  ValidateDraftInputBody,
  ValidateDraftInputResponse,
  VALID_EXPERIENCE_LEVELS,
  getCompatibleSplits,
  DraftVolumePreviewBody,
  DraftVolumeDistributionBody,
  type PlanDraftInputWarningType,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { db, volumeTargetsTable } from "@workspace/db";
import { loadPlanDraftInput } from "../services/planDraftInputService";
import { calculateVolumeDecisions } from "../services/planDraftVolumeDecisionService";
import { calculateVolumeDistribution } from "../services/planDraftVolumeDistributionService";

const router: IRouter = Router();

// ─── GET /clients/:clientId/plan-draft-input ──────────────────────────────────

router.get("/clients/:clientId/plan-draft-input", async (req, res): Promise<void> => {
  const params = GetClientPlanDraftInputParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await loadPlanDraftInput(params.data.clientId);
  if (!result) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  res.json(result);
});

// ─── POST /plans/draft-input/validate ────────────────────────────────────────

router.post("/plans/draft-input/validate", async (req, res): Promise<void> => {
  const parsed = ValidateDraftInputBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, preferences } = parsed.data;
  const warnings: PlanDraftInputWarningType[] = [];

  // Load input to validate experience level
  const draftInput = await loadPlanDraftInput(clientId);
  if (!draftInput) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  // Propagate blocking warnings from input loading
  for (const w of draftInput.warnings) {
    if (w.blocking) warnings.push(w);
  }

  // Validate split type compatibility with training days
  // PPL requires exactly 3 or 6 (or 7) days — 4 or 5 days repeat the first day, creating an
  // unbalanced structure (e.g. Push/Pull/Legs/Push). This is a blocking error.
  if (
    preferences.splitType === "push_pull_legs" &&
    preferences.trainingDays !== 3 &&
    preferences.trainingDays !== 6 &&
    preferences.trainingDays !== 7
  ) {
    warnings.push({
      code: "SPLIT_INCOMPATIBLE_WITH_TRAINING_DAYS",
      severity: "error",
      message: "Push / Pull / Legs wymaga 3 lub 6 dni treningowych.",
      blocking: true,
    });
  } else {
    const compatible = getCompatibleSplits(preferences.trainingDays);
    if (!compatible.includes(preferences.splitType) && preferences.splitType !== "custom") {
      warnings.push({
        code: "SPLIT_INCOMPATIBLE_WITH_DAYS",
        severity: "warning",
        message: `Podział "${preferences.splitType}" nie jest rekomendowany dla ${preferences.trainingDays} dni treningowych.`,
        blocking: false,
      });
    }
  }

  // Validate block duration
  if (preferences.blockDurationWeeks < 4 || preferences.blockDurationWeeks > 12) {
    warnings.push({
      code: "INVALID_BLOCK_DURATION",
      severity: "warning",
      message: `Długość bloku musi wynosić 4–12 tygodni. Podano: ${preferences.blockDurationWeeks}.`,
      blocking: false,
    });
  }

  const blocking = warnings.some((w) => w.blocking);

  res.json(
    ValidateDraftInputResponse.parse({
      valid: !blocking,
      blocking,
      warnings,
    }),
  );
});

// ─── POST /plans/draft-volume/preview ─────────────────────────────────────────

router.post("/plans/draft-volume/preview", async (req, res): Promise<void> => {
  const parsed = DraftVolumePreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, preferences, trainerVolumeOverrides } = parsed.data;

  // Load the client's Phase 1 draft input (normalized survey data)
  const draftInput = await loadPlanDraftInput(clientId);
  if (!draftInput) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  // Build the internal decision input from Phase 1 + wizard preferences.
  //
  // Priority source of truth: preferences.priorityMuscleGroups (trainer's wizard input).
  // The trainer may change priorities in Step 2; those changes must be sent to the engine.
  // draftInput.input.priorityMuscleGroups (client's survey) seeds the wizard default only;
  // it must NOT override what the trainer actually submitted in the request body.
  //
  // Excluded groups: no wizard UI for overriding these → always from the client's survey.
  // Experience level: not editable in the wizard → always from the client's survey.
  const decisionInput = {
    clientId,
    experienceLevel: draftInput.input.experienceLevel,
    priorityMuscleGroups: preferences.priorityMuscleGroups,
    excludedMuscleGroups: draftInput.input.excludedMuscleGroups,
    sleep: draftInput.input.sleepHours,
    stress: draftInput.input.stressLevel,
    physicalWork: draftInput.input.physicalWork,
    dailyActivity: draftInput.input.dailyActivity,
    recoveryQuality: draftInput.input.recoveryQuality,
    trainingDays: preferences.trainingDays,
    sessionDuration: preferences.sessionDurationMinutes,
    trainerOverrides: trainerVolumeOverrides,
  };

  const result = await calculateVolumeDecisions(decisionInput);

  res.json(result);
});

// ─── POST /plans/draft-distribution/preview ────────────────────────────────────

router.post("/plans/draft-distribution/preview", async (req, res): Promise<void> => {
  const parsed = DraftVolumeDistributionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, experienceLevel, trainingDays, selectedSplitType, selectedWeeklyVolumes, priorityTargetIds, corePriority } = parsed.data;

  // Validate experienceLevel is one of the four canonical levels
  if (!(VALID_EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) {
    res.status(400).json({
      error: `Nieznany poziom doświadczenia: "${experienceLevel}". Oczekiwano: ${VALID_EXPERIENCE_LEVELS.join(", ")}.`,
    });
    return;
  }

  // Load active volume target IDs from DB to validate the request
  const activeTargets = await db
    .select({ id: volumeTargetsTable.id })
    .from(volumeTargetsTable)
    .where(eq(volumeTargetsTable.isActive, true));

  const activeIds = new Set(activeTargets.map((t) => t.id));

  // Reject unknown target IDs
  const unknownIds = selectedWeeklyVolumes
    .map((v) => v.targetId)
    .filter((id) => !activeIds.has(id));
  if (unknownIds.length > 0) {
    res.status(400).json({ error: `Nieznane target ID: ${unknownIds.join(", ")}` });
    return;
  }

  // Validate that each active target appears exactly once
  const requestIds = selectedWeeklyVolumes.map((v) => v.targetId);
  const duplicates = requestIds.filter((id, idx) => requestIds.indexOf(id) !== idx);
  if (duplicates.length > 0) {
    res.status(400).json({ error: `Zduplikowane target ID: ${[...new Set(duplicates)].join(", ")}` });
    return;
  }

  const missingIds = [...activeIds].filter((id) => !requestIds.includes(id));
  if (missingIds.length > 0) {
    res.status(400).json({ error: `Brakujące target ID: ${missingIds.join(", ")}` });
    return;
  }

  // Verify clientId exists (lightweight check)
  const draftInput = await loadPlanDraftInput(clientId);
  if (!draftInput) {
    res.status(404).json({ error: "Klient nie znaleziony" });
    return;
  }

  const result = await calculateVolumeDistribution({
    clientId,
    experienceLevel,
    trainingDays,
    selectedSplitType,
    selectedWeeklyVolumes,
    priorityTargetIds,
    corePriority,
  });

  res.json(result);
});

export default router;
