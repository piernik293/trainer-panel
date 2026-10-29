/** Uprzedzenie o limitach planu Free przy pierwszej wizycie (D2) — tylko gdy plan jest Free i beta nie jest „bez limitów”. */
export const LIMITS_NOTICE_KEY = "optimatren-limits-notice-seen";
export const LIMITS_NOTICE_TEXT = "Plan Free: do 3 klientów, 1 automatyczny plan miesięcznie i do 10 własnych ćwiczeń. Ręczne plany i ich edycja są bez limitu.";

export function showLimitsNotice(s: { noLimits?: boolean; plan: { code: string } } | undefined, seen: boolean): boolean {
  return !!s && !s.noLimits && s.plan.code === "FREE" && !seen;
}
