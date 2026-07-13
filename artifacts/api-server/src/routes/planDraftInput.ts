/**
 * Plan Draft Input routes — Phase 1 & 2 of the Workout Plan Draft Generator.
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
 */

import { Router, type IRouter } from "express";
import {
  GetClientPlanDraftInputParams,
  ValidateDraftInputBody,
  ValidateDraftInputResponse,
  VALID_EXPERIENCE_LEVELS,
  getCompatibleSplits,
  DraftVolumePreviewBody,
  type PlanDraftInputWarningType,
} from "@workspace/api-zod";
import { loadPlanDraftInput } from "../services/planDraftInputService";
import { calculateVolumeDecisions } from "../services/planDraftVolumeDecisionService";

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
  const compatible = getCompatibleSplits(preferences.trainingDays);
  if (!compatible.includes(preferences.splitType) && preferences.splitType !== "custom") {
    warnings.push({
      code: "SPLIT_INCOMPATIBLE_WITH_DAYS",
      severity: "warning",
      message: `Podział "${preferences.splitType}" nie jest rekomendowany dla ${preferences.trainingDays} dni treningowych.`,
      blocking: false,
    });
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

  // Build the internal decision input from Phase 1 + wizard preferences
  const decisionInput = {
    clientId,
    experienceLevel: draftInput.input.experienceLevel,
    priorityMuscleGroups: draftInput.input.priorityMuscleGroups,
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

export default router;
