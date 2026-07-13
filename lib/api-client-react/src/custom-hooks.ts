import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

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
