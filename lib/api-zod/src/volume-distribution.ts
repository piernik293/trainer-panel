/**
 * Phase 3A — Weekly Volume Distribution Engine
 *
 * Data contracts for split recommendation and daily volume distribution.
 * Read-only: no workout plans, days, exercises, sets or reps are created.
 *
 * The engine operates in two steps:
 *   1. recommendSplitType — deterministic rules → recommended split
 *   2. distributeWeeklyVolume — Phase 2 selected values → per-day allocations
 *
 * All allocations are whole integers.
 * Sum of daily allocations equals selectedWeeklyVolume exactly for every target.
 * Auxiliary Core block is computed separately and returned alongside targetDecisions.
 */

import * as z from "zod";
import { SplitTypeSchema } from "./plan-draft-input";

// ─── Warning codes ─────────────────────────────────────────────────────────────

export const VOLUME_DISTRIBUTION_WARNING_CODES = [
  // Blocking
  "MISSING_EXPERIENCE_LEVEL",
  "INVALID_EXPERIENCE_LEVEL",
  "INVALID_TRAINING_DAYS",
  // Split recommendation — non-blocking
  "HIGH_FREQUENCY_FOR_NO_ACTIVITY",     // trainingDays > 3 for "Brak aktywności fizycznej"
  "HIGH_FREQUENCY_FOR_BEGINNER",        // trainingDays > 4 for "Początkujący"
  "SPLIT_DIFFERS_FROM_RECOMMENDATION",  // trainer-selected split ≠ engine recommendation
  // Special split types — non-blocking
  "SPECIALIZATION_REQUIRES_EXERCISE_PHASE",  // specialization treated as full_body in Phase 3A
  "CUSTOM_SPLIT_REQUIRES_TRAINER_REVIEW",    // custom split requires manual day review
  // Distribution — non-blocking
  "UNKNOWN_TARGET_CATEGORY",      // broadCategory not in canonical mapping → fallback to all days
  "TARGET_WITHOUT_ELIGIBLE_DAY",  // no day type eligible for target → fallback to all days
  "TARGET_SESSION_MAX_EXCEEDED",  // weekly volume cannot fit under sessionMax → distribute freely
  "TARGET_SESSION_BELOW_MIN",     // at least one daily allocation < sessionMin
] as const;

export type VolumeDistributionWarningCode =
  (typeof VOLUME_DISTRIBUTION_WARNING_CODES)[number];

export const VolumeDistributionWarning = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "notice", "info"]),
  message: z.string(),
  blocking: z.boolean(),
  suggestedAction: z.string().optional(),
});
export type VolumeDistributionWarningType = z.infer<typeof VolumeDistributionWarning>;

// ─── Selected weekly volume entry ─────────────────────────────────────────────

export const SelectedWeeklyVolume = z.object({
  targetId: z.number().int().positive(),
  selectedVolume: z
    .number()
    .min(0, { message: "Volume must be non-negative" })
    .refine((v) => Number.isInteger(Math.round(v * 2)) && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9, {
      message: "Volume must be a multiple of 0.5",
    }),
});
export type SelectedWeeklyVolumeType = z.infer<typeof SelectedWeeklyVolume>;

// ─── Auxiliary Core / brzuch block ────────────────────────────────────────────

export const CoreDayAllocation = z.object({
  dayIndex: z.number().int().min(0),
  sets: z.number().int().min(0),
});
export type CoreDayAllocationType = z.infer<typeof CoreDayAllocation>;

export const AuxiliaryCoreBlock = z.object({
  weeklyRecommendedSets: z.number().int().min(0),
  weeklySelectedSets: z.number().int().min(0),
  isPriority: z.boolean(),
  dayAllocations: z.array(CoreDayAllocation),
  placement: z.enum(["end_of_session"]),
  reasons: z.array(z.string()),
  warnings: z.array(VolumeDistributionWarning),
});
export type AuxiliaryCoreBlockType = z.infer<typeof AuxiliaryCoreBlock>;

// ─── Request body ─────────────────────────────────────────────────────────────

export const DraftVolumeDistributionBody = z.object({
  clientId: z.number().int().positive(),
  experienceLevel: z.string().min(1),
  trainingDays: z.number().int().min(1).max(6),
  selectedSplitType: SplitTypeSchema,
  /** Phase 2 selected weekly volumes — one entry per active volume target. */
  selectedWeeklyVolumes: z
    .array(SelectedWeeklyVolume)
    .min(1, { message: "At least one weekly volume entry required" }),
  /**
   * Priority target IDs in rank order (P1 = index 0, P2 = index 1, P3 = index 2).
   * Up to 3. Empty means no priorities for this session.
   */
  priorityTargetIds: z.array(z.number().int().positive()).max(3).optional().default([]),
  /**
   * Whether the trainer selected Core / brzuch as a priority (+2 sets, max 10).
   * Default false.
   */
  corePriority: z.boolean().optional().default(false),
});
export type DraftVolumeDistributionBodyType = z.infer<typeof DraftVolumeDistributionBody>;

// ─── Per-day allocation for one target ────────────────────────────────────────

export const TargetDayAllocation = z.object({
  targetId: z.number().int(),
  targetName: z.string(),
  dayIndex: z.number().int().min(0),
  allocatedVolume: z.number(),
});
export type TargetDayAllocationType = z.infer<typeof TargetDayAllocation>;

// ─── One training day in the distribution ─────────────────────────────────────

export const TrainingDayDistribution = z.object({
  dayIndex: z.number().int().min(0),
  dayName: z.string(),
  /** Canonical internal type: "push" | "pull" | "upper" | "lower" | "legs" | "full_body" | "full_body_a" | "full_body_b" | "custom" */
  dayType: z.string(),
  targetAllocations: z.array(TargetDayAllocation),
  totalEffectiveTargetVolume: z.number(),
});
export type TrainingDayDistributionType = z.infer<typeof TrainingDayDistribution>;

// ─── Per-target distribution decision ─────────────────────────────────────────

export const TargetDistributionDecision = z.object({
  targetId: z.number().int(),
  targetName: z.string(),
  broadCategory: z.string(),
  weeklySelectedVolume: z.number(),
  allocatedWeeklyTotal: z.number(),
  allocations: z.array(TargetDayAllocation),
  sessionMin: z.number(),
  sessionMax: z.number(),
  priorityOrder: z.number().int().nullable(),
  warnings: z.array(VolumeDistributionWarning),
});
export type TargetDistributionDecisionType = z.infer<typeof TargetDistributionDecision>;

// ─── Full response ────────────────────────────────────────────────────────────

export const WeeklyVolumeDistributionResponse = z.object({
  recommendedSplitType: SplitTypeSchema,
  selectedSplitType: SplitTypeSchema,
  trainingDays: z.number().int(),
  days: z.array(TrainingDayDistribution),
  targetDecisions: z.array(TargetDistributionDecision),
  warnings: z.array(VolumeDistributionWarning),
  hasBlockingIssues: z.boolean(),
  auxiliaryCoreBlock: AuxiliaryCoreBlock,
});
export type WeeklyVolumeDistributionResponseType = z.infer<
  typeof WeeklyVolumeDistributionResponse
>;
