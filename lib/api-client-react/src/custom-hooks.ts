import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type {
  WeeklyVolumeDecisionResponseType,
  WeeklyVolumeDistributionResponseType,
  DraftVolumeDistributionBodyType,
} from "@workspace/api-zod";

// ─── Exercise search (lightweight) ────────────────────────────────────────────

export interface ExerciseSearchResult {
  id: number;
  name: string;
  mainMuscleGroup: string;
  equipment: string[];
  movementPattern: string | null;
  isActive: boolean;
}

export function useSearchExercises(q: string, limit = 20) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ["exercises", "search", trimmed, limit] as const,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (trimmed) params.set("q", trimmed);
      return customFetch<ExerciseSearchResult[]>(`/api/exercises/search?${params}`);
    },
    enabled: trimmed.length >= 1,
    staleTime: 30_000,
  });
}

// ─── Client avoided exercises ─────────────────────────────────────────────────

export interface ClientAvoidedExercise {
  id: number;
  name: string;
  isActive: boolean;
  reason: string | null;
  otherText: string | null;
  otherReason: string | null;
}

export function getClientAvoidedExercisesQueryKey(clientId: number) {
  return ["clients", clientId, "avoided-exercises"] as const;
}

export function useGetClientAvoidedExercises(clientId: number | null | undefined) {
  return useQuery({
    queryKey: getClientAvoidedExercisesQueryKey(clientId ?? 0),
    queryFn: () =>
      customFetch<ClientAvoidedExercise[]>(`/api/clients/${clientId}/avoided-exercises`),
    enabled: !!clientId,
    staleTime: 30_000,
  });
}

// ─── Plan Draft Input ──────────────────────────────────────────────────────────

export function getClientPlanDraftInputQueryKey(clientId: number) {
  return ["clients", clientId, "plan-draft-input"] as const;
}

export function useGetClientPlanDraftInput(clientId: number | null | undefined) {
  return useQuery({
    queryKey: getClientPlanDraftInputQueryKey(clientId ?? 0),
    queryFn: () =>
      customFetch<Record<string, unknown>>(`/api/clients/${clientId}/plan-draft-input`),
    enabled: !!clientId,
    staleTime: 60_000,
  });
}

// ─── Draft Volume Preview ──────────────────────────────────────────────────────

export interface DraftVolumePreviewRequest {
  clientId: number;
  preferences: {
    trainingDays: number;
    sessionDurationMinutes: number;
    splitType: string;
    blockDurationWeeks: number;
    trainingGoal: string | null;
    priorityMuscleGroups: string[];
    preferredTrainingStyle: string | null;
    trainerRestrictions: string | null;
  };
  trainerVolumeOverrides?: Record<string, number>;
}

export function useDraftVolumePreview() {
  return useMutation<WeeklyVolumeDecisionResponseType, Error, DraftVolumePreviewRequest>({
    mutationFn: (body) =>
      customFetch<WeeklyVolumeDecisionResponseType>("/api/plans/draft-volume/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });
}

// ─── Draft Distribution Preview (Phase 3B) ────────────────────────────────────

export function useDraftDistributionPreview() {
  return useMutation<
    WeeklyVolumeDistributionResponseType,
    Error,
    DraftVolumeDistributionBodyType
  >({
    mutationFn: (body) =>
      customFetch<WeeklyVolumeDistributionResponseType>(
        "/api/plans/draft-distribution/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
  });
}
