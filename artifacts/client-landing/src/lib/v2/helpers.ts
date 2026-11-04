/** Small pure helpers of the v2 screens (no React, easy to test). */
const WEEKDAY_UP = ["NIEDZIELA", "PONIEDZIAŁEK", "WTOREK", "ŚRODA", "CZWARTEK", "PIĄTEK", "SOBOTA"];
const MONTH_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

/** "WTOREK, 3 LISTOPADA" */
export function longDate(d: Date): string {
  return `${WEEKDAY_UP[d.getDay()]}, ${d.getDate()} ${MONTH_GEN[d.getMonth()]!.toUpperCase()}`;
}
/** "trenuje od października" from "2026-10" (null → null). */
export function trainsSinceLabel(yearMonth: string | null): string | null {
  if (!yearMonth) return null;
  const m = Number(yearMonth.slice(5, 7)) - 1;
  const names = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  return names[m] ? `trenuje od ${names[m]}` : null;
}

export type CircleState = "done" | "planned" | "rest";
/** Week circles when the plan has no weekdays: `target` circles, the first `done` filled (never more than the target). */
export function weekCircles(done: number, target: number): CircleState[] {
  const n = Math.max(0, Math.min(14, target));
  const d = Math.max(0, Math.min(done, n));
  return Array.from({ length: n }, (_, i) => (i < d ? "done" : "planned"));
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
/** Name shown in the greeting and on the avatar: nick > display name > first name. */
export function shownName(p: { nick?: string | null; displayName?: string | null; firstName: string }): string {
  return p.nick?.trim() || p.displayName?.trim() || p.firstName;
}
export const kgLabel = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");  // pl-PL does not group four digits; the mock-up does
