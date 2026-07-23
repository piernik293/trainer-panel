/**
 * Plan API — custom React Query hooks for workout plan management.
 * Uses native fetch against /api (same base as generated client).
 */

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanExercise {
  id: number;
  dayId: number;
  exerciseId: number;
  exerciseName: string;
  orderInDay: number;
  workingSets: number;
  warmUpSets: number;
  // Repetition prescription
  repType: string | null;
  repsExact: number | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  repTimeSeconds: number | null;
  repDistanceMeters: number | null;
  repOpenInstruction: string | null;
  // Load prescription
  loadType: string | null;
  loadValue: string | null;
  loadInstruction: string | null;
  // Intensity
  rir: number | null;
  rpe: string | null;
  rirOrRpe: string | null;
  // Technique
  tempo: string | null;
  restSeconds: number | null;
  // Notes
  notes: string | null;
  clientInstructions: string | null;
}

export interface PlanDay {
  id: number;
  planId: number;
  dayOrder: number;
  dayName: string | null;
  subtitle: string | null;
  description: string | null;
  estimatedDurationMinutes: number | null;
  trainerNotes: string | null;
  exercises: PlanExercise[];
}

export interface VolumeBreakdownItem {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  planExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficientUsed: number;
  effectiveSets: number;
}

export interface PerDaySummary {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  effectiveSets: number;
}

export type VolumeStatus =
  | "below_preferred"
  | "within_preferred"
  | "above_preferred"
  | "above_absolute";

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  below_preferred: "Poniżej preferowanego poziomu",
  within_preferred: "W preferowanym zakresie",
  above_preferred: "Powyżej preferowanego limitu",
  above_absolute: "Przekroczony limit absolutny",
};

export interface VolumeTargetResult {
  targetId: number;
  targetName: string;
  targetType: string;
  weeklyEffectiveSets: number;
  sessionMin: number;
  sessionMax: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  status: VolumeStatus;
  breakdown: VolumeBreakdownItem[];
  perDay: PerDaySummary[];
  sessionWarnings: string[];
}

export interface VolumeResult {
  targets: VolumeTargetResult[];
  exercisesWithoutAssignments: { planExerciseId: number; exerciseName: string }[];
}

export interface WorkoutPlan {
  id: number;
  clientId: number;
  clientName: string | null;
  surveyId: number;
  guidelineVersionId: number;
  experienceLevelUsed: string;
  title: string;
  goal: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  trainerNotes: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  days: PlanDay[];
  volume: VolumeResult;
}

export interface WorkoutPlanSummary {
  id: number;
  clientId: number;
  surveyId: number;
  guidelineVersionId: number;
  experienceLevelUsed: string;
  title: string;
  goal: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  trainerNotes: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface ExercisePrescription {
  workingSets?: number;
  warmUpSets?: number;
  repType?: string | null;
  repsExact?: number | null;
  repRangeMin?: number | null;
  repRangeMax?: number | null;
  repTimeSeconds?: number | null;
  repDistanceMeters?: number | null;
  repOpenInstruction?: string | null;
  loadType?: string | null;
  loadValue?: string | null;
  loadInstruction?: string | null;
  rir?: number | null;
  rpe?: string | null;
  rirOrRpe?: string | null;
  tempo?: string | null;
  restSeconds?: number | null;
  notes?: string | null;
  clientInstructions?: string | null;
}

// ─── Query key factories ──────────────────────────────────────────────────────

export const planKeys = {
  list: (clientId: number) => ["plans", "list", clientId] as const,
  detail: (planId: number) => ["plans", "detail", planId] as const,
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error ?? `HTTP ${res.status}`;
    const err = Object.assign(new Error(msg), { status: res.status, data });
    throw err;
  }
  return data as T;
}

// ─── Invalidation helper ──────────────────────────────────────────────────────

function usePlanInvalidator(planId: number, clientId?: number) {
  const queryClient = useQueryClient();
  return (updatedPlan: WorkoutPlan) => {
    queryClient.setQueryData(planKeys.detail(planId), updatedPlan);
    const cid = clientId ?? updatedPlan.clientId;
    if (cid) {
      queryClient.invalidateQueries({ queryKey: planKeys.list(cid) });
    }
  };
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useListClientPlans(clientId: number) {
  return useQuery<WorkoutPlanSummary[]>({
    queryKey: planKeys.list(clientId),
    queryFn: () => apiFetch<WorkoutPlanSummary[]>(`/clients/${clientId}/plans`),
    enabled: !!clientId,
  });
}

export function useGetPlan(planId: number) {
  return useQuery<WorkoutPlan>({
    queryKey: planKeys.detail(planId),
    queryFn: () => apiFetch<WorkoutPlan>(`/plans/${planId}`),
    enabled: !!planId,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreatePlan(clientId: number) {
  const queryClient = useQueryClient();
  return useMutation<WorkoutPlan, Error, { title: string; surveyId: number; goal?: string; description?: string }>({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/clients/${clientId}/plans`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: planKeys.list(clientId) });
      queryClient.setQueryData(planKeys.detail(plan.id), plan);
    },
  });
}

// ─── Save draft plan (wizard → DB) ───────────────────────────────────────────

export interface SaveDraftPlanExercise {
  exerciseId: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  rir: number;
}

export interface SaveDraftPlanDay {
  dayIndex: number;
  dayName: string;
  dayType: string;
  exercises: SaveDraftPlanExercise[];
}

export interface SaveDraftPlanInput {
  surveyId: number;
  title: string;
  goal: string | null;
  description: string | null;
  splitType: string | null;
  blockDurationWeeks: number | null;
  sessionDurationMinutes: number | null;
  days: SaveDraftPlanDay[];
}

/**
 * Persists a fully-generated plan draft to the database in one shot:
 * creates the plan record, adds all days in order, then adds all exercises
 * per day with their full prescription.  Returns the saved WorkoutPlan.
 */
export function useSaveDraftPlan(clientId: number) {
  const queryClient = useQueryClient();
  return useMutation<WorkoutPlan, Error, SaveDraftPlanInput>({
    mutationFn: async (input) => {
      // 1. Create the plan record (splitType + blockDurationWeeks stored immediately)
      let currentPlan = await apiFetch<WorkoutPlan>(`/clients/${clientId}/plans`, {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          surveyId: input.surveyId,
          goal: input.goal,
          description: input.description,
          splitType: input.splitType,
          blockDurationWeeks: input.blockDurationWeeks,
        }),
      });

      // 2. Add each day in order, then add its exercises
      for (const day of input.days) {
        const planAfterDay = await apiFetch<WorkoutPlan>(`/plans/${currentPlan.id}/days`, {
          method: "POST",
          body: JSON.stringify({
            dayName: day.dayName,
            subtitle: day.dayType,
            estimatedDurationMinutes: input.sessionDurationMinutes ?? null,
          }),
        });

        // The newly-added day has the highest dayOrder in the returned plan
        const sortedDays = [...planAfterDay.days].sort((a, b) => a.dayOrder - b.dayOrder);
        const createdDay = sortedDays[sortedDays.length - 1];
        currentPlan = planAfterDay;

        // 3. Add exercises for this day with full prescription
        for (const ex of day.exercises) {
          currentPlan = await apiFetch<WorkoutPlan>(
            `/plans/${currentPlan.id}/days/${createdDay.id}/exercises`,
            {
              method: "POST",
              body: JSON.stringify({
                exerciseId: ex.exerciseId,
                workingSets: ex.sets,
                repType: "range",
                repRangeMin: ex.repsMin,
                repRangeMax: ex.repsMax,
                restSeconds: ex.restSeconds,
                rir: ex.rir,
              }),
            },
          );
        }
      }

      return currentPlan;
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: planKeys.list(clientId) });
      queryClient.setQueryData(planKeys.detail(plan.id), plan);
    },
  });
}

export function useUpdatePlan(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<
    WorkoutPlan,
    Error,
    {
      title?: string;
      status?: "draft" | "archived";
      goal?: string | null;
      description?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      trainerNotes?: string | null;
    }
  >({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useDeletePlan(clientId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (planId) => apiFetch<void>(`/plans/${planId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.list(clientId) });
    },
  });
}

export function useAddPlanDay(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<WorkoutPlan, Error, { dayName?: string; subtitle?: string | null }>({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanDay(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<
    WorkoutPlan,
    Error,
    {
      dayId: number;
      dayName?: string | null;
      subtitle?: string | null;
      description?: string | null;
      estimatedDurationMinutes?: number | null;
      trainerNotes?: string | null;
      dayOrder?: number;
    }
  >({
    mutationFn: ({ dayId, ...body }) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlanDay(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, number>({
    mutationFn: (dayId) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useDuplicatePlanDay(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, number>({
    mutationFn: (dayId) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}/duplicate`, { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });
}

export function useReorderPlanDays(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, Array<{ id: number; dayOrder: number }>>({
    mutationFn: (order) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ order }),
      }),
    onSuccess: invalidate,
  });
}

export function useAddPlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, { dayId: number; exerciseId: number; workingSets?: number }>({
    mutationFn: ({ dayId, ...body }) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}/exercises`, {
        method: "POST",
        body: JSON.stringify({ workingSets: 3, ...body }),
      }),
    onSuccess: invalidate,
  });
}

export function useReorderPlanExercises(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<
    WorkoutPlan,
    Error,
    { dayId: number; order: Array<{ id: number; orderInDay: number }> }
  >({
    mutationFn: ({ dayId, order }) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}/exercises/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ order }),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<
    WorkoutPlan,
    Error,
    ExercisePrescription & {
      dayId: number;
      planExerciseId: number;
      orderInDay?: number;
      dayId_target?: number;
    }
  >({
    mutationFn: ({ dayId, planExerciseId, dayId_target, ...body }) => {
      const payload = { ...body, ...(dayId_target !== undefined ? { dayId: dayId_target } : {}) };
      return apiFetch<WorkoutPlan>(
        `/plans/${planId}/days/${dayId}/exercises/${planExerciseId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
    },
    onSuccess: invalidate,
  });
}

export function useDuplicatePlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, { dayId: number; planExerciseId: number }>({
    mutationFn: ({ dayId, planExerciseId }) =>
      apiFetch<WorkoutPlan>(
        `/plans/${planId}/days/${dayId}/exercises/${planExerciseId}/duplicate`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: invalidate,
  });
}

export function useDeletePlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, { dayId: number; planExerciseId: number }>({
    mutationFn: ({ dayId, planExerciseId }) =>
      apiFetch<WorkoutPlan>(
        `/plans/${planId}/days/${dayId}/exercises/${planExerciseId}`,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  });
}

export function useClearPlanDay(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, { dayId: number }>({
    mutationFn: ({ dayId }) =>
      apiFetch<WorkoutPlan>(
        `/plans/${planId}/days/${dayId}/exercises`,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  });
}

export function useActivatePlan(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<WorkoutPlan, Error, void>({
    mutationFn: () =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/activate`, { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });
}

// ─── Plan analysis types ──────────────────────────────────────────────────────

export type MovementCategoryKey =
  | "push" | "pull" | "squat" | "hinge" | "lunge" | "core" | "carry" | "rotation";

export type SubPatternKey =
  | "vertical_push" | "horizontal_push" | "vertical_pull" | "horizontal_pull" | null;

export type BalanceStatus =
  | "balanced" | "push_dominant" | "strongly_push_dominant"
  | "pull_dominant" | "strongly_pull_dominant" | "insufficient_data";

export type SquatHingeStatus =
  | "balanced" | "squat_dominant" | "strongly_squat_dominant"
  | "hinge_dominant" | "strongly_hinge_dominant" | "insufficient_data";

export interface PushPullBalance {
  pushSets: number;
  pullSets: number;
  ratio: number | null;
  status: BalanceStatus;
  severity: "success" | "warning" | "error" | "info";
  message: string;
}

export interface SquatHingeBalance {
  squatSets: number;
  hingeSets: number;
  ratio: number | null;
  status: SquatHingeStatus;
  severity: "success" | "warning" | "error" | "info";
  message: string;
}

export interface CategoryContributor {
  entryId: number;
  exerciseId: number;
  exerciseName: string;
  dayId: number;
  dayName: string | null;
  workingSets: number;
  subPattern: SubPatternKey;
}

export interface CategoryDaySummary {
  dayId: number;
  dayName: string | null;
  workingSets: number;
  exerciseEntries: number;
}

export interface CategoryAnalysis {
  category: MovementCategoryKey;
  label: string;
  workingSets: number;
  exerciseEntries: number;
  percentageOfPlanSets: number;
  daysPresent: number;
  dayBreakdown: CategoryDaySummary[];
  exercises: CategoryContributor[];
}

export interface DayAnalysis {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  totalWorkingSets: number;
  exerciseCount: number;
  categoryBreakdown: Array<{ category: MovementCategoryKey; label: string; workingSets: number; exerciseEntries: number }>;
  compoundSets: number;
  isolationSets: number;
  compoundEntries: number;
  isolationEntries: number;
  bilateralSets: number;
  unilateralSets: number;
  bilateralEntries: number;
  unilateralEntries: number;
  planesPresent: string[];
  repeatedPatterns: Array<{ pattern: string; exerciseCount: number; workingSets: number; exerciseNames: string[] }>;
}

export interface WeeklyDistributionEntry {
  category: MovementCategoryKey;
  label: string;
  totalSets: number;
  daysCount: number;
  maxSetsInOneDay: number;
  maxSetsDayName: string | null;
  concentrationPercentage: number;
}

export interface AnalysisWarning {
  code: string;
  severity: "info" | "notice" | "warning";
  scope: "plan" | "day" | "exercise";
  dayId?: number | null;
  exerciseEntryId?: number | null;
  exerciseId?: number | null;
  exerciseName?: string | null;
  message: string;
}

export interface PlanAnalysisResult {
  summary: {
    totalWorkingSets: number;
    totalExerciseEntries: number;
    analysedExerciseEntries: number;
    incompleteExerciseEntries: number;
  };
  balance: {
    pushPull: PushPullBalance;
    squatHinge: SquatHingeBalance;
  };
  movementCategories: CategoryAnalysis[];
  exerciseTypes: {
    compoundEntries: number;
    isolationEntries: number;
    compoundSets: number;
    isolationSets: number;
    compoundPercentage: number;
    isolationPercentage: number;
    unknownEntries: number;
    unknownSets: number;
  };
  executionTypes: {
    bilateralEntries: number;
    unilateralEntries: number;
    bilateralSets: number;
    unilateralSets: number;
    bilateralPercentage: number;
    unilateralPercentage: number;
    daysWithUnilateral: number;
    unknownEntries: number;
    unknownSets: number;
  };
  planesOfMotion: {
    sagittalSets: number;
    frontalSets: number;
    transverseSets: number;
    sagittalEntries: number;
    frontalEntries: number;
    transverseEntries: number;
    unknownSets: number;
    unknownEntries: number;
  };
  weeklyDistribution: WeeklyDistributionEntry[];
  days: DayAnalysis[];
  warnings: AnalysisWarning[];
}

// ─── Analysis preview hook ────────────────────────────────────────────────────

/**
 * Calls POST /plans/analysis-preview with 500 ms debounce.
 * Mirrors useVolumePreview: AbortController + monotonic reqId prevent stale
 * responses from overwriting newer results.
 *
 * Re-fires when: exercises added/removed/reordered, working sets changed,
 * exercise reference changed, days added/removed/reordered.
 * Does NOT re-fire for: notes, tempo, RIR, RPE, load prescriptions.
 */
export function useAnalysisPreview(plan: WorkoutPlan | undefined) {
  const [analysisResult, setAnalysisResult] = useState<PlanAnalysisResult | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const reqIdRef  = useRef(0);

  useEffect(() => {
    if (!plan) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const myId = ++reqIdRef.current;
      setIsLoadingAnalysis(true);

      try {
        const body = {
          clientId: plan.clientId,
          planId:   plan.id,
          goal:     plan.goal ?? null,
          days: plan.days.map((d) => ({
            dayId:    d.id,
            dayName:  d.dayName,
            dayOrder: d.dayOrder,
            exercises: d.exercises.map((e) => ({
              exerciseEntryId: e.id,
              exerciseId:      e.exerciseId,
              workingSets:     e.workingSets,
              orderInDay:      e.orderInDay,
            })),
          })),
        };

        const res = await fetch("/api/plans/analysis-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:   JSON.stringify(body),
          signal: controller.signal,
        });

        if (myId !== reqIdRef.current) return; // stale — discard

        if (res.ok) {
          const data: PlanAnalysisResult = await res.json();
          if (myId !== reqIdRef.current) return; // stale after parse
          setAnalysisResult(data);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // On network error keep the last valid result visible.
      } finally {
        if (myId === reqIdRef.current) setIsLoadingAnalysis(false);
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [plan]);

  return { analysisResult, isLoadingAnalysis };
}

// ─── Volume preview types ─────────────────────────────────────────────────────

export type SessionStatus = "below_min" | "within_range" | "above_max" | "no_guideline";

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  below_min: "Poniżej zalecanej objętości",
  within_range: "W zalecanym zakresie",
  above_max: "Powyżej zalecanej objętości na jednostkę",
  no_guideline: "Brak wytycznych",
};

export const SESSION_STATUS_COLOR: Record<SessionStatus, string> = {
  below_min: "bg-muted text-muted-foreground border-muted",
  within_range: "bg-green-100 text-green-700 border-green-200",
  above_max: "bg-amber-100 text-amber-700 border-amber-200",
  no_guideline: "bg-muted text-muted-foreground border-muted",
};

export interface SessionContribution {
  exerciseEntryId: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

export interface SessionMuscleResult {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  sessionMin: number;
  sessionMax: number;
  sessionStatus: SessionStatus;
  contributions: SessionContribution[];
}

export interface DayVolumeResult {
  dayId: number;
  dayName: string | null;
  muscles: SessionMuscleResult[];
}

export interface WeeklyContribution {
  exerciseEntryId: number;
  exerciseId: number;
  exerciseName: string;
  dayId: number;
  dayName: string | null;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

export interface WeeklyMuscleResult {
  targetId: number;
  muscleName: string;
  effectiveSets: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
  sessionMin: number;
  sessionMax: number;
  remainingToPreferred: number;
  remainingToAbsolute: number;
  status: VolumeStatus;
  hasGuideline: boolean;
  contributions: WeeklyContribution[];
}

export interface VolumePreviewWarning {
  code: string;
  scope: "plan" | "day" | "exercise";
  dayId?: number | null;
  exerciseEntryId?: number | null;
  exerciseId?: number | null;
  message: string;
}

export interface VolumePreviewExercise {
  exerciseEntryId: number;
  exerciseId: number;
  workingSets: number;
}

export interface VolumePreviewDay {
  dayId: number;
  dayName: string | null;
  exercises: VolumePreviewExercise[];
}

export interface VolumePreviewInput {
  clientId: number;
  /** When provided the backend uses the plan's stored values as authoritative source. */
  planId?: number;
  /** Supplied for backend validation; backend uses authoritative values from plan/survey. */
  guidelineVersionId?: number;
  experienceLevelUsed?: string;
  days: VolumePreviewDay[];
}

export interface VolumePreviewResult {
  // experienceLevel and guidelineLevel are null when the client's survey
  // level is missing or invalid — hasGuidelines will be false in that case.
  clientId: number;
  experienceLevel: string | null;
  guidelineLevel: string | null;
  hasGuidelines: boolean;
  days: DayVolumeResult[];
  weekly: WeeklyMuscleResult[];
  warnings: VolumePreviewWarning[];
}

// ─── Volume preview hook ──────────────────────────────────────────────────────

/**
 * Calls POST /plans/volume-preview with 400 ms debounce.
 * Cancels stale in-flight requests via AbortController.
 * The plan reference from TanStack Query is stable between renders and only
 * changes when a mutation updates the cache, so the effect fires exactly when
 * the plan content changes.
 */
export function useVolumePreview(plan: WorkoutPlan | undefined) {
  const [preview, setPreview] = useState<VolumePreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!plan) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const myId = ++reqIdRef.current;
      setIsLoadingPreview(true);

      try {
        const body: VolumePreviewInput = {
          clientId: plan.clientId,
          planId: plan.id,
          guidelineVersionId: plan.guidelineVersionId,
          experienceLevelUsed: plan.experienceLevelUsed,
          days: plan.days.map((d) => ({
            dayId: d.id,
            dayName: d.dayName,
            exercises: d.exercises.map((e) => ({
              exerciseEntryId: e.id,
              exerciseId: e.exerciseId,
              workingSets: e.workingSets,
            })),
          })),
        };

        const res = await fetch("/api/plans/volume-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (myId !== reqIdRef.current) return; // stale — discard

        if (res.ok) {
          const data: VolumePreviewResult = await res.json();
          if (myId !== reqIdRef.current) return; // stale after parse
          setPreview(data);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // On network error keep the last valid preview visible.
      } finally {
        if (myId === reqIdRef.current) setIsLoadingPreview(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [plan]);

  return { preview, isLoadingPreview };
}
