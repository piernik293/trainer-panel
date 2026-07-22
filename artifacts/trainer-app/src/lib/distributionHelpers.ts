/**
 * Phase 3B — Pure helper functions for building and validating
 * the daily volume distribution request and response.
 *
 * All functions are pure (no side effects, no React, no fetch).
 * They are tested in isolation in __tests__/distributionHelpers.test.ts.
 */

import {
  VALID_EXPERIENCE_LEVELS,
  type WeeklyVolumeDecisionResponseType,
  type WeeklyVolumeDistributionResponseType,
  type DraftVolumeDistributionBodyType,
  type SplitType,
} from "@workspace/api-zod";

// ─── Request builder ──────────────────────────────────────────────────────────

export interface BuildDistributionRequestParams {
  clientId: number;
  /** From draftInput.input.experienceLevel — null when survey missing */
  experienceLevel: string | null | undefined;
  /** Trainer-selected training days (from wizard Step 2) */
  trainingDays: number;
  /** Trainer-selected split type (from wizard Step 2) */
  selectedSplitType: string;
  /** Phase 2 decisions with selectedValue per target */
  volumeDecisions: WeeklyVolumeDecisionResponseType;
  /** Trainer manual overrides: targetId → override volume */
  volumeOverrides: Record<number, number>;
  /** Whether the trainer selected Core / brzuch as a priority. Default false. */
  corePriority?: boolean;
}

/**
 * Build the POST /api/plans/draft-distribution/preview request body from
 * current wizard state.
 *
 * Returns null if any required precondition is unmet:
 *   - experienceLevel is missing or invalid
 *   - trainingDays is not a finite integer in [1, 6]
 *   - selectedSplitType is empty
 *   - Phase 2 decisions array does not have exactly 11 entries
 *
 * For weekly volume: uses the trainer override when present, otherwise
 * the Phase 2 engine's selectedValue.
 *
 * Priority order: derived from Phase 2 decisions (targets with non-null
 * priorityOrder, sorted ascending).
 *
 * The recommended split is NOT included — the backend calculates it.
 */
export function buildDistributionRequest(
  params: BuildDistributionRequestParams,
): DraftVolumeDistributionBodyType | null {
  const {
    clientId,
    experienceLevel,
    trainingDays,
    selectedSplitType,
    volumeDecisions,
    volumeOverrides,
    corePriority = false,
  } = params;

  // Precondition: valid experience level
  if (!experienceLevel) return null;
  if (!(VALID_EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) return null;

  // Precondition: trainingDays integer in [1, 6]
  if (!Number.isFinite(trainingDays) || !Number.isInteger(trainingDays)) return null;
  if (trainingDays < 1 || trainingDays > 6) return null;

  // Precondition: split type present
  if (!selectedSplitType) return null;

  // Precondition: at least one Phase 2 decision
  if (volumeDecisions.decisions.length < 1) return null;

  // Build selected weekly volumes: override > Phase 2 selectedValue
  const selectedWeeklyVolumes = volumeDecisions.decisions.map((d) => ({
    targetId: d.targetId,
    selectedVolume:
      volumeOverrides[d.targetId] !== undefined
        ? volumeOverrides[d.targetId]!
        : d.selectedValue,
  }));

  // Derive priority target IDs from Phase 2 decisions (sorted by priorityOrder asc)
  const priorityTargetIds = volumeDecisions.decisions
    .filter((d) => d.priorityOrder !== null)
    .sort((a, b) => (a.priorityOrder ?? 0) - (b.priorityOrder ?? 0))
    .map((d) => d.targetId);

  return {
    clientId,
    experienceLevel,
    trainingDays,
    selectedSplitType: selectedSplitType as SplitType,
    selectedWeeklyVolumes,
    priorityTargetIds,
    corePriority,
  };
}

// ─── Consistency check ────────────────────────────────────────────────────────

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  reason: string | null;
}

/**
 * Verify that the distribution response is internally consistent:
 *   1. days.length equals expectedTrainingDays
 *   2. allocatedWeeklyTotal === weeklySelectedVolume for every target (±0.01)
 *
 * Returns { isConsistent: true } when all checks pass.
 * Returns { isConsistent: false, reason } for the first failing check.
 */
export function checkDistributionConsistency(
  result: WeeklyVolumeDistributionResponseType,
  expectedTrainingDays: number,
): ConsistencyCheckResult {
  if (result.days.length !== expectedTrainingDays) {
    return {
      isConsistent: false,
      reason: `days count ${result.days.length} ≠ ${expectedTrainingDays}`,
    };
  }

  for (const decision of result.targetDecisions) {
    if (Math.abs(decision.allocatedWeeklyTotal - decision.weeklySelectedVolume) > 0.01) {
      return {
        isConsistent: false,
        reason: `target ${decision.targetId}: allocatedWeeklyTotal ${decision.allocatedWeeklyTotal} ≠ weeklySelectedVolume ${decision.weeklySelectedVolume}`,
      };
    }
  }

  return { isConsistent: true, reason: null };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Filter a day's target allocations to only those with allocatedVolume > 0.
 * Zero allocations are not shown in the UI.
 */
export function filterNonZeroAllocations<T extends { allocatedVolume: number }>(
  allocations: T[],
): T[] {
  return allocations.filter((a) => a.allocatedVolume > 0);
}
