import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface LibraryExercise { id: number; name: string; isActive: boolean; complete: boolean; missing: string[]; jointStress: string | null; jointStressAreas: string[] | null; shareConsent: boolean; shareStatus: "none" | "proposed" | "added" | "rejected"; shareRejectReason: string | null }
export interface LibraryResponse { useOwnInGenerator: boolean; joints: string[]; levels: string[]; exercises: LibraryExercise[] }
export const useLibraryStatus = () => useQuery<{ enabled: boolean }>({ queryKey: ["library-status"], queryFn: () => customFetch("/api/trainer-library/status"), staleTime: 300_000, retry: false });
export const useLibrary = (enabled = true) => useQuery<LibraryResponse>({ queryKey: ["trainer-library"], enabled, queryFn: () => customFetch("/api/trainer-library") });
export function useLibraryActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["trainer-library"] });
  return {
    complete: useMutation({ mutationFn: (v: { id: number; jointStress: string; jointStressAreas: string[] }) => { const { id, ...b } = v; return customFetch(`/api/trainer-library/${id}`, { method: "PATCH", body: JSON.stringify(b) }); }, onSuccess: done }),
    share: useMutation({ mutationFn: (v: { id: number; consent: boolean }) => customFetch(`/api/trainer-library/${v.id}/share`, { method: "PUT", body: JSON.stringify({ consent: v.consent }) }), onSuccess: done }),
    settings: useMutation({ mutationFn: (v: { useOwnInGenerator: boolean }) => customFetch("/api/trainer-library/settings", { method: "PUT", body: JSON.stringify(v) }), onSuccess: done }),
  };
}

export interface AdminProposal { id: number; name: string; description: string | null; executionInstructions: string | null; coachingTips: string | null; movementPattern: string | null; mainMuscleGroup: string | null; equipment: string[] | null; difficultyLevel: string | null; jointStress: string | null; jointStressAreas: string[] | null; status: "proposed" | "added" | "rejected"; consentAt: string | null; rejectReason: string | null; author: string; similar: { id: number; name: string }[] }
export const useAdminProposals = () => useQuery<{ items: AdminProposal[] }>({ queryKey: ["admin-proposals"], queryFn: () => customFetch("/api/admin/exercise-proposals") });
export function useProposalActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["admin-proposals"] });
  return {
    add: useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/exercise-proposals/${id}/add`, { method: "POST" }), onSuccess: done }),
    reject: useMutation({ mutationFn: (v: { id: number; reason: string }) => customFetch(`/api/admin/exercise-proposals/${v.id}/reject`, { method: "POST", body: JSON.stringify({ reason: v.reason }) }), onSuccess: done }),
  };
}
