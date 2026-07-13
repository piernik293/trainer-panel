/**
 * Plan Draft Input routes — Phase 1 of the Workout Plan Draft Generator.
 *
 * GET  /clients/:clientId/plan-draft-input
 *   Returns all normalized data needed to configure the generation wizard.
 *   Does NOT generate a plan, select exercises, or allocate volume.
 *
 * POST /plans/draft-input/validate
 *   Validates a set of wizard preferences. Does NOT save or generate anything.
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  GetClientPlanDraftInputParams,
  ValidateDraftInputBody,
  ValidateDraftInputResponse,
  VALID_EXPERIENCE_LEVELS,
  getCompatibleSplits,
  type PlanDraftInputWarningType,
} from "@workspace/api-zod";
import { loadPlanDraftInput } from "../services/planDraftInputService";

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

export default router;
