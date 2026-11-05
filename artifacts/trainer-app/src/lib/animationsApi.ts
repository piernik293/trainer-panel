import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { AnimSpec } from "@workspace/survey-config";

export interface AdminAnimation { exerciseId: number; name: string; status: "draft" | "review" | "approved"; reviewNote: string | null; approvedBy: string | null; approvedAt: string | null; spec: AnimSpec; problems: string[];
  description: string | null; executionInstructions: string | null; coachingTips: string | null; commonMistakes: string | null }
export const useAdminAnimations = () => useQuery<{ items: AdminAnimation[] }>({ queryKey: ["admin-animations"], queryFn: () => customFetch("/api/admin/animations"), retry: false });
export function useAnimationActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["admin-animations"] });
  return {
    seed: useMutation({ mutationFn: () => customFetch<{ added: number[]; skipped: { id: number; why: string }[] }>("/api/admin/animations/seed", { method: "POST" }), onSuccess: done }),
    approve: useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/animations/${id}/approve`, { method: "POST" }), onSuccess: done }),
    needsWork: useMutation({ mutationFn: (v: { id: number; note: string }) => customFetch(`/api/admin/animations/${v.id}/needs-work`, { method: "POST", body: JSON.stringify({ note: v.note }) }), onSuccess: done }),
  };
}
