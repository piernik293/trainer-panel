/**
 * Okres próbny trenera: 14 dni z pełnym dostępem od akceptacji wniosku (dla obecnych trenerów — od uruchomienia migracji 0066).
 * Po nim obowiązuje plan trenera (domyślnie Free). Dane trenera i podopiecznych NIGDY nie są przez to blokowane ani usuwane —
 * limity Free dotyczą tylko tworzenia nowych rzeczy ponad limit. Płatności w systemie nie ma.
 */
export const TRIAL_DAYS = 14;
export const TRIAL_WARNING_DAYS = 3;
const DAY = 86_400_000;

export type TrialState = "active" | "ended" | "none";
export interface TrialInfo { state: TrialState; daysLeft: number; endsAt: string | null }

/** Czysta funkcja: stan okresu próbnego i liczba pozostałych dni (zaokrąglana w górę; dziś w ostatnim dniu = 1). */
export function trialInfo(endsAt: Date | null | undefined, now: Date = new Date()): TrialInfo {
  if (!endsAt) return { state: "none", daysLeft: 0, endsAt: null };
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return { state: "ended", daysLeft: 0, endsAt: endsAt.toISOString() };
  return { state: "active", daysLeft: Math.ceil(left / DAY), endsAt: endsAt.toISOString() };
}

export const newTrialDates = (now: Date = new Date()) => ({ trialStartedAt: now, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY) });

/** Przedłużenie przez administratora: o 14 dni od dziś albo od końca, jeśli okres jeszcze trwa. */
export function extendedTrialEnd(current: Date | null | undefined, now: Date = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + TRIAL_DAYS * DAY);
}
