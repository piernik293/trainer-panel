import { useQuery } from "@tanstack/react-query";

export type PlanCode = "FREE" | "PRO" | "UNLIMITED";

export interface UsageStat {
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  atLimit: boolean;
}

export interface SubscriptionSummaryData {
  plan: {
    code: PlanCode;
    name: string;
    monthlyPricePln: number | null;
  };
  usage: {
    clients: UsageStat;
    customExercises: UsageStat;
    planGenerations: UsageStat;
  };
  resetsAt: string;
  /** Beta bez limitów (BETA_NO_LIMITS): ukrywamy teksty o limitach */
  noLimits?: boolean;
  availablePlans: Array<{
    code: string;
    name: string;
    monthlyPricePln: number | null;
    benefits: string[];
  }>;
}

export const getSubscriptionSummaryQueryKey = () => ["subscription-summary"];

export function useSubscriptionSummary() {
  return useQuery<SubscriptionSummaryData>({
    queryKey: getSubscriptionSummaryQueryKey(),
    queryFn: async () => {
      const response = await fetch("/api/subscription/summary");
      if (!response.ok) {
        throw new Error("Failed to fetch subscription summary");
      }
      return response.json();
    },
  });
}
