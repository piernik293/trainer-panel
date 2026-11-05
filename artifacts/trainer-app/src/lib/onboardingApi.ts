import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface OnboardingView { steps: { id: "client" | "invite" | "plan" | "activate"; label: string; done: boolean }[]; dismissed: boolean; completed: boolean; completedMinutes: number | null; exampleClientId: number | null }
export const useOnboardingStatus = () => useQuery<{ enabled: boolean }>({ queryKey: ["onboarding-status"], queryFn: () => customFetch("/api/onboarding/status"), staleTime: 300_000, retry: false });
export const useOnboarding = (enabled: boolean) => useQuery<OnboardingView>({ queryKey: ["onboarding"], enabled, retry: false, queryFn: () => customFetch("/api/onboarding") });
export function useOnboardingActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["onboarding"] });
  return {
    dismiss: useMutation({ mutationFn: () => customFetch("/api/onboarding/dismiss", { method: "POST" }), onSuccess: done }),
    show: useMutation({ mutationFn: () => customFetch("/api/onboarding/show", { method: "POST" }), onSuccess: done }),
    createExample: useMutation({ mutationFn: () => customFetch<{ clientId: number }>("/api/onboarding/example", { method: "POST" }), onSuccess: done }),
    removeExample: useMutation({ mutationFn: () => customFetch("/api/onboarding/example", { method: "DELETE" }), onSuccess: () => { void done(); void qc.invalidateQueries(); } }),
  };
}
