/**
 * Manually entered daily steps (blok 6, 25.10.2026): date helpers and the weekly summary.
 * Information only — no health claims. A day without an entry counts as "no data", not as zero.
 */
export const MAX_STEPS = 100_000;
export const MIN_GOAL = 1_000;

/** Today's calendar date in Warsaw as YYYY-MM-DD. */
export function todayWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Shifts a YYYY-MM-DD date by whole days (calendar arithmetic in UTC, no time zone surprises). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && shiftDate(v, 0) === v;

/** A client may enter steps for today and the six days before. */
export function isEnterableDate(date: string, today: string): boolean {
  return isIsoDate(date) && date <= today && date >= shiftDate(today, -6);
}

export interface StepsSummary {
  today: string;
  goal: number | null;
  todaySteps: number | null;
  /** 0–100, only with a goal and an entry for today */
  todayPercent: number | null;
  /** the last 7 days, oldest first */
  days: { date: string; steps: number | null }[];
  /** mean of the days that have an entry (rounded); null without any entry */
  average: number | null;
  /** days of the week with steps >= goal (only with a goal) */
  daysAtGoal: number | null;
  /** average relative to the goal, 0–100+ (only with a goal and an average) */
  averagePercent: number | null;
}

export function summarize(rows: readonly { day: string; steps: number }[], goal: number | null, today: string): StepsSummary {
  const byDay = new Map(rows.map((r) => [r.day, r.steps]));
  const days = Array.from({ length: 7 }, (_, i) => { const date = shiftDate(today, i - 6); return { date, steps: byDay.get(date) ?? null }; });
  const entered = days.filter((d): d is { date: string; steps: number } => d.steps !== null);
  const average = entered.length ? Math.round(entered.reduce((s, d) => s + d.steps, 0) / entered.length) : null;
  const todaySteps = byDay.get(today) ?? null;
  return {
    today, goal, todaySteps, days, average,
    todayPercent: goal && todaySteps !== null ? Math.min(100, Math.round((todaySteps / goal) * 100)) : null,
    daysAtGoal: goal ? entered.filter((d) => d.steps >= goal).length : null,
    averagePercent: goal && average !== null ? Math.round((average / goal) * 100) : null,
  };
}
