/**
 * Phase 2 — Weekly Volume Target Decision Engine
 *
 * Data contracts for the draft-volume preview endpoint and wizard Step 3.
 * These are computation-only contracts: no workout plan is created, no exercises
 * are selected, and no volume is allocated to any training day.
 */

import * as z from "zod";
import { PlanDraftGenerationPreferences } from "./plan-draft-input";

// ─── Warning codes ─────────────────────────────────────────────────────────────

export const VOLUME_DECISION_WARNING_CODES = [
  "MISSING_EXPERIENCE_LEVEL",
  "INVALID_EXPERIENCE_LEVEL",
  "MISSING_VOLUME_GUIDELINES",
  "MISSING_RECOVERY_DATA",
  "LIMITED_TRAINING_AVAILABILITY",
  "PRIORITY_TARGET_NOT_FOUND",
  "EXCLUDED_TARGET_NOT_FOUND",
  "VOLUME_OVERRIDE_BELOW_MIN",
  "VOLUME_OVERRIDE_ABOVE_MAX",
  "VOLUME_TARGET_CLAMPED",
  "NO_VOLUME_DECISIONS_AVAILABLE",
  "TARGET_DEPRIORITIZED_BY_TRAINER",
] as const;

export type VolumeDecisionWarningCode = typeof VOLUME_DECISION_WARNING_CODES[number];

export const VolumeDecisionWarning = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "notice", "info"]),
  message: z.string(),
  blocking: z.boolean(),
  suggestedAction: z.string().optional(),
});

export type VolumeDecisionWarningType = z.infer<typeof VolumeDecisionWarning>;

// ─── Recovery profile ─────────────────────────────────────────────────────────

export const RECOVERY_PROFILES = ["good", "neutral", "reduced"] as const;
export type RecoveryProfile = typeof RECOVERY_PROFILES[number];

export const RecoveryProfileSchema = z.enum(RECOVERY_PROFILES);

// ─── Core decision per target ─────────────────────────────────────────────────

/**
 * A single volume target's weekly recommendation produced by the decision engine.
 *
 * Calculation order (matches spec Step 8):
 *  1. guidelineMin / guidelineMax loaded from volume_guidelines
 *  2. rangePosition selected by experience level
 *  3. priorityAdjustment applied (stays within range)
 *  4. (excluded: set to guidelineMin)
 *  5. recoveryAdjustment applied
 *  6. availabilityAdjustment applied
 *  7. clamped to [guidelineMin, guidelineMax]
 *  8. rounded to 0.5-set precision → recommendedValue
 *  9. trainerOverride replaces selectedValue if present
 * 10. reasons and warnings generated
 */
export const WeeklyVolumeTargetDecision = z.object({
  // Identity
  targetId: z.number().int().positive(),
  targetName: z.string(),

  // Guideline data
  experienceLevel: z.string().nullable(),
  guidelineMin: z.number(),   // weekly_preferred_ceiling for the level
  guidelineMax: z.number(),   // weekly_absolute_ceiling for the level

  // Calculation components
  rangePosition: z.number(),       // 0.00 – 0.50
  baseValue: z.number(),           // before adjustments
  priorityAdjustment: z.number(),  // positive delta
  recoveryAdjustment: z.number(),  // negative delta (or 0)
  availabilityAdjustment: z.number(), // negative delta (or 0)

  // Outputs
  recommendedValue: z.number(),    // after all adjustments + clamp + rounding
  selectedValue: z.number(),       // recommendation OR trainer override (rounded)
  trainerOverride: z.number().nullable(),  // raw trainer input before rounding

  // Source and display
  source: z.enum(["calculated", "trainer_override"]),
  priorityOrder: z.number().nullable(),  // 1, 2, 3 or null
  isExcluded: z.boolean(),
  isOverridden: z.boolean(),

  // Explanations
  reasons: z.array(z.string()),
  warnings: z.array(VolumeDecisionWarning),
});

export type WeeklyVolumeTargetDecisionType = z.infer<typeof WeeklyVolumeTargetDecision>;

// ─── Decision input ───────────────────────────────────────────────────────────

/**
 * All inputs consumed by the volume decision engine.
 * Constructed by the service from Phase 1 draft input + wizard preferences.
 */
export const WeeklyVolumeDecisionInput = z.object({
  clientId: z.number().int().positive(),

  // From Phase 1 draft input (survey-derived)
  experienceLevel: z.string().nullable(),
  priorityMuscleGroups: z.array(z.string()),
  excludedMuscleGroups: z.array(z.string()),
  sleep: z.number().nullable(),
  stress: z.number().int().min(1).max(10).nullable(),
  physicalWork: z.boolean(),
  dailyActivity: z.string().nullable(),
  recoveryQuality: z.enum(["excellent", "good", "standard", "poor"]).nullable(),

  // From wizard Step 2 preferences
  trainingDays: z.number().int().min(1).max(7),
  sessionDuration: z.number().int().min(20).max(180),

  // Optional trainer volume overrides: Record<targetId.toString(), selectedValue>
  trainerOverrides: z.record(z.string(), z.number()).default({}),
});

export type WeeklyVolumeDecisionInputType = z.infer<typeof WeeklyVolumeDecisionInput>;

// ─── Decision response ────────────────────────────────────────────────────────

export const WeeklyVolumeDecisionSummary = z.object({
  totalTargets: z.number().int(),
  targetsWithDecisions: z.number().int(),
  targetsWithWarnings: z.number().int(),
  targetsOverridden: z.number().int(),
  experienceLevelUsed: z.string().nullable(),
  recoveryProfile: RecoveryProfileSchema.nullable(),
  blockingIssues: z.boolean(),
});

export type WeeklyVolumeDecisionSummaryType = z.infer<typeof WeeklyVolumeDecisionSummary>;

export const WeeklyVolumeDecisionResponse = z.object({
  decisions: z.array(WeeklyVolumeTargetDecision),
  summary: WeeklyVolumeDecisionSummary,
  warnings: z.array(VolumeDecisionWarning),
  metadata: z.object({
    calculatedAt: z.string(),
    experienceLevel: z.string().nullable(),
    guidelineVersionId: z.number(),
    recoveryProfile: RecoveryProfileSchema.nullable(),
  }),
});

export type WeeklyVolumeDecisionResponseType = z.infer<typeof WeeklyVolumeDecisionResponse>;

// ─── API endpoint contracts ───────────────────────────────────────────────────

/**
 * Request body for POST /api/plans/draft-volume/preview
 *
 * Read-only: repeated calls with the same input produce the same output.
 * No database rows are created or modified.
 */
export const DraftVolumePreviewBody = z.object({
  clientId: z.number().int().positive(),
  preferences: PlanDraftGenerationPreferences,
  trainerVolumeOverrides: z.record(z.string(), z.number()).optional().default({}),
});

export type DraftVolumePreviewBodyType = z.infer<typeof DraftVolumePreviewBody>;

// ─── Experience-level base positions ─────────────────────────────────────────

export const EXPERIENCE_LEVEL_RANGE_POSITIONS: Record<string, number> = {
  "Brak aktywności fizycznej": 0.00,
  "Początkujący": 0.25,
  "Średniozaawansowany": 0.50,
  "Zaawansowany": 0.50,
};

// ─── Priority adjustment percentages ─────────────────────────────────────────

/** Fraction of the range width added per priority order. */
export const PRIORITY_ADJUSTMENTS: Record<1 | 2 | 3, number> = {
  1: 0.20,  // first priority: +20% of range width
  2: 0.10,  // second priority: +10%
  3: 0.05,  // third priority: +5%
};

// ─── Recovery adjustment magnitude ───────────────────────────────────────────

/** Fraction of the range width subtracted when recovery is reduced. */
export const REDUCED_RECOVERY_ADJUSTMENT = 0.20;

// ─── Availability thresholds ──────────────────────────────────────────────────

/** Short availability: reduce non-priority targets by this fraction of range width. */
export const SHORT_AVAILABILITY_ADJUSTMENT = 0.25;
