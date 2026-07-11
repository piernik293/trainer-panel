/**
 * Plan API — custom React Query hooks for workout plan management.
 * Uses native fetch against /api (same base as generated client).
 */

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
  repRangeMin: number | null;
  repRangeMax: number | null;
  rirOrRpe: string | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface PlanDay {
  id: number;
  planId: number;
  dayOrder: number;
  dayName: string | null;
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
  surveyId: number;
  guidelineVersionId: number;
  experienceLevelUsed: string;
  title: string;
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
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
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

// ─── Mutation helpers ─────────────────────────────────────────────────────────

/** After any plan mutation, invalidate both the detail query and the list. */
function usePlanInvalidator(planId: number, clientId?: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: planKeys.detail(planId) });
    if (clientId) qc.invalidateQueries({ queryKey: planKeys.list(clientId) });
  };
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreatePlan(clientId: number) {
  const qc = useQueryClient();
  return useMutation<WorkoutPlan, Error, { title: string; surveyId: number }>({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/clients/${clientId}/plans`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planKeys.list(clientId) });
    },
  });
}

export function useUpdatePlan(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<WorkoutPlan, Error, { title?: string; status?: "draft" | "archived" }>({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlan(clientId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (planId) =>
      apiFetch<void>(`/plans/${planId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planKeys.list(clientId) });
    },
  });
}

export function useAddPlanDay(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<WorkoutPlan, Error, { dayName?: string }>({
    mutationFn: (body) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanDay(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<WorkoutPlan, Error, { dayId: number; dayName?: string | null; dayOrder?: number }>({
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

export function useAddPlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<
    WorkoutPlan,
    Error,
    {
      dayId: number;
      exerciseId: number;
      workingSets: number;
      warmUpSets?: number;
      repRangeMin?: number | null;
      repRangeMax?: number | null;
      rirOrRpe?: string | null;
      restSeconds?: number | null;
      notes?: string | null;
    }
  >({
    mutationFn: ({ dayId, ...body }) =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/days/${dayId}/exercises`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanExercise(planId: number) {
  const invalidate = usePlanInvalidator(planId);
  return useMutation<
    WorkoutPlan,
    Error,
    {
      dayId: number;
      planExerciseId: number;
      workingSets?: number;
      warmUpSets?: number;
      repRangeMin?: number | null;
      repRangeMax?: number | null;
      rirOrRpe?: string | null;
      restSeconds?: number | null;
      notes?: string | null;
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

export function useActivatePlan(planId: number, clientId?: number) {
  const invalidate = usePlanInvalidator(planId, clientId);
  return useMutation<WorkoutPlan, Error, void>({
    mutationFn: () =>
      apiFetch<WorkoutPlan>(`/plans/${planId}/activate`, { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });
}
