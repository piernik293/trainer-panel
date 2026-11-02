/** Uprzedzenie o limitach planu Free przy pierwszej wizycie (D2) — tylko gdy plan jest Free i beta nie jest „bez limitów”. */
export const LIMITS_NOTICE_KEY = "optimatren-limits-notice-seen";
export const LIMITS_NOTICE_TEXT = "Plan Free: do 3 klientów, 1 automatyczny plan miesięcznie i do 10 własnych ćwiczeń. Ręczne plany i ich edycja są bez limitu.";

export function showLimitsNotice(s: { noLimits?: boolean; plan: { code: string } } | undefined, seen: boolean): boolean {
  return !!s && !s.noLimits && s.plan.code === "FREE" && !seen;
}

type TrialSummary = { noLimits?: boolean; trial?: { state: "active" | "ended" | "none"; daysLeft: number; showEnded: boolean } };
export const TRIAL_ENDED_TEXT = "Okres próbny minął — masz plan Free: 3 podopiecznych. Napisz do nas, jeśli potrzebujesz więcej.";

/** Komunikat o okresie próbnym: spokojny, w ostatnich 3 dniach wyraźniejszy; przy BETA_NO_LIMITS ukryty. Dane nigdy nie są blokowane. */
export function trialNotice(s: TrialSummary | undefined): { text: string; urgent: boolean } | null {
  if (!s || s.noLimits || !s.trial) return null;
  const t = s.trial;
  if (t.state === "active") return { text: `Okres próbny: zostało ${t.daysLeft} ${t.daysLeft === 1 ? "dzień" : "dni"}`, urgent: t.daysLeft <= 3 };
  if (t.state === "ended" && t.showEnded) return { text: TRIAL_ENDED_TEXT, urgent: false };
  return null;
}
