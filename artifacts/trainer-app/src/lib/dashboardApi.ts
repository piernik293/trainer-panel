import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type AttentionKind = "pain" | "interview" | "no_plan" | "plan_ending" | "invite_pending";

export interface AttentionItem {
  kind: AttentionKind;
  clientId: number | null;
  name: string;
  reasonLabel: string;
  description: string;
  at: string;
  actionLabel: string;
  actionHref: string;
}

export interface DashboardSummary {
  today: string; // YYYY-MM-DD, Europe/Warsaw
  trainerName: string | null;
  counts: { totalClients: number; activeClients: number; newInterviews: number; plansEndingSoon: number };
  attention: { items: AttentionItem[]; total: number };
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
