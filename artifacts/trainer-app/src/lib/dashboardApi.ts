import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type AttentionKind = "pain" | "hard_twice" | "silent" | "package" | "interview" | "no_plan" | "plan_ending" | "invite_pending";

export interface AttentionItem {
  kind: AttentionKind;
  clientId: number | null;
  name: string;
  reasonLabel: string;
  description: string;
  at: string;
  actionLabel: string;
  actionHref: string;
  /** concrete event; sent back to mark the reason as done */
  ref: string;
}

export interface DashboardSummary {
  today: string; // YYYY-MM-DD, Europe/Warsaw
  trainerName: string | null;
  counts: { totalClients: number; activeClients: number; newInterviews: number; plansEndingSoon: number };
  attention: { items: AttentionItem[]; allItems: AttentionItem[]; total: number; silenceDays: number };
  todayBookings: { id: number; clientId: number; clientName: string; startsAt: string; durationMinutes: number }[];
  recentEvents: {
    type: "interview_submitted" | "plan_activated" | "portal_joined";
    clientId: number;
    clientName: string;
    at: string;
  }[];
  onboarding: {
    steps: { key: "account" | "invite" | "interview" | "plan" | "share"; title: string; done: boolean; href: string | null }[];
    completed: number;
    total: number;
    next: string | null;
  };
}

export const getDashboardSummaryQueryKey = () => ["dashboard-summary"] as const;

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: getDashboardSummaryQueryKey(),
    queryFn: ({ signal }) => customFetch<DashboardSummary>("/api/dashboard/summary", { signal }),
    // No background polling after a failure: a refetch of a query that never
    // succeeded would flip back to "pending" and re-show the skeleton.
    refetchInterval: (query) => (query.state.status === "error" ? false : 60_000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useDismissAttention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: AttentionKind; ref: string }) => customFetch(`/api/dashboard/attention/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: getDashboardSummaryQueryKey() }),
  });
}

export function useSetSilenceDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (silenceDays: 7 | 10 | 14) => customFetch(`/api/dashboard/attention-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ silenceDays }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: getDashboardSummaryQueryKey() }),
  });
}
