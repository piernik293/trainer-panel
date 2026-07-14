/**
 * useVolumeCoverage — debounced volume coverage hook for Step 4.
 *
 * Calls the existing POST /api/plans/volume-preview endpoint (no new backend
 * logic). Debounces at 400 ms and only reacts to changes in exercise IDs or
 * set counts — not to changes in reps, RIR, rest, or order.
 *
 * Stale response protection: AbortController cancels any in-flight request
 * when a new one is triggered. The last valid result stays visible during
 * recalculation.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import type { ExerciseDraftByDay } from "@/lib/exerciseDraftHelpers";
import type { WeeklyVolumeDistributionResponseType } from "@workspace/api-zod";

// ─── Response types (mirrors VolumePreviewResult from volumeCalculator.ts) ────

export interface SessionContributionPreview {
  exerciseEntryId: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

export interface DayMusclePreview {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  sessionMin: number;
  sessionMax: number;
  sessionStatus: "below_min" | "within_range" | "above_max" | "no_guideline";
  contributions: SessionContributionPreview[];
}

export interface DayVolumePreview {
  dayId: number;
  dayName: string | null;
  muscles: DayMusclePreview[];
}

export interface WeeklyMusclePreview {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  sessionMin: number;
  sessionMax: number;
  remainingToPreferred: number;
  remainingToAbsolute: number;
  status: "below_preferred" | "within_preferred" | "above_preferred" | "above_absolute";
  hasGuideline: boolean;
  contributions: Array<{
    exerciseEntryId: number;
    exerciseId: number;
    exerciseName: string;
    dayId: number;
    dayName: string | null;
    workingSets: number;
    coefficient: number;
    effectiveSets: number;
  }>;
}

export interface VolumePreviewWarningItem {
  code: string;
  scope: "plan" | "day" | "exercise";
  dayId?: number | null;
  exerciseEntryId?: number | null;
  exerciseId?: number | null;
  message: string;
}

export interface DraftVolumePreviewResult {
  clientId: number;
  experienceLevel: string | null;
  guidelineLevel: string | null;
  hasGuidelines: boolean;
  days: DayVolumePreview[];
  weekly: WeeklyMusclePreview[];
  warnings: VolumePreviewWarningItem[];
}

// ─── Coverage key ──────────────────────────────────────────────────────────────

/**
 * Derives a stable string key that changes only when exercise IDs or set counts
 * change — not when reps, RIR, rest, or order change.
 * Used to gate debounced preview calls.
 */
export function buildCoverageKey(exerciseDraft: ExerciseDraftByDay): string {
  return Object.entries(exerciseDraft)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dayIndex, exs]) => {
      const exPart = [...exs]
        .sort(
          (a, b) =>
            a.exerciseId - b.exerciseId || a.localId.localeCompare(b.localId),
        )
        .map((e) => `${e.exerciseId}:${e.sets}`)
        .join(",");
      return `${dayIndex}[${exPart}]`;
    })
    .join("|");
}

// ─── Request builder ───────────────────────────────────────────────────────────

/**
 * Maps the current exercise draft to a POST /plans/volume-preview request body.
 *
 * Uses synthetic dayIds (dayIndex + 1) and exerciseEntryIds (unique per entry).
 * No plan ID is sent so the route derives experience level and guideline version
 * from the client's latest survey automatically.
 */
function buildPreviewBody(
  clientId: number,
  exerciseDraft: ExerciseDraftByDay,
  distributionResult: WeeklyVolumeDistributionResponseType,
) {
  const days = distributionResult.days.map((day) => {
    const exercises = (exerciseDraft[day.dayIndex] ?? []).map((ex, exIndex) => ({
      // Synthetic unique entry ID — not a DB ID
      exerciseEntryId: (day.dayIndex + 1) * 1000 + exIndex + 1,
      exerciseId: ex.exerciseId,
      workingSets: ex.sets,
    }));
    return {
      dayId: day.dayIndex + 1, // synthetic (1-based, avoids 0)
      dayName: day.dayName ?? null,
      exercises,
    };
  });

  return { clientId, days };
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;

export function useVolumeCoverage(
  clientId: number,
  exerciseDraft: ExerciseDraftByDay,
  distributionResult: WeeklyVolumeDistributionResponseType | null,
): { previewResult: DraftVolumePreviewResult | null; isLoading: boolean } {
  const [result, setResult] = useState<DraftVolumePreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Always hold the latest draft+distribution so the timer callback reads fresh data
  const exerciseDraftRef = useRef(exerciseDraft);
  const distributionResultRef = useRef(distributionResult);
  exerciseDraftRef.current = exerciseDraft;
  distributionResultRef.current = distributionResult;

  // Ref to preserve last valid result during recalculation
  const lastResultRef = useRef<DraftVolumePreviewResult | null>(null);

  const coverageKey = useMemo(() => buildCoverageKey(exerciseDraft), [exerciseDraft]);

  useEffect(() => {
    const ctrl = new AbortController();

    const timer = setTimeout(() => {
      if (!distributionResultRef.current) {
        // No distribution yet — nothing to calculate
        setIsLoading(false);
        return;
      }
      const body = buildPreviewBody(
        clientId,
        exerciseDraftRef.current,
        distributionResultRef.current,
      );

      setIsLoading(true);

      fetch("/api/plans/volume-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<DraftVolumePreviewResult>;
        })
        .then((data) => {
          if (ctrl.signal.aborted) return; // stale — discard silently
          lastResultRef.current = data;
          setResult(data);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          // Keep last valid result visible; just stop the spinner
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [coverageKey, clientId]); // distributionResult days shape is stable per wizard session

  // During recalculation show the last valid result so display stays stable
  const displayResult = result ?? lastResultRef.current;

  return { previewResult: displayResult, isLoading };
}
