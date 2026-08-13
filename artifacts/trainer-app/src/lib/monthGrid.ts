/**
 * Month grid helpers for the trainer calendar (Stage 4.1B).
 *
 * All date math is done on Warsaw calendar days represented as plain
 * "YYYY-MM-DD" strings + UTC-noon Date objects — never `new Date("YYYY-MM-DD")`
 * (which is parsed as UTC midnight and can shift a day in other zones).
 * "Today" comes from Intl with an explicit Europe/Warsaw timeZone.
 */

export const WARSAW_TZ = "Europe/Warsaw";

export interface MonthGridCell {
  /** "YYYY-MM-DD" or null for a blank leading/trailing cell. */
  date: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Today's Warsaw calendar day as "YYYY-MM-DD" (device timezone irrelevant). */
export function todayWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WARSAW_TZ }).format(now);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month == last day of this month (UTC-safe).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday 0=Mon…6=Sun of a calendar date. */
export function isoWeekday(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Build the month grid: an array of 7-cell weeks starting on Monday, with
 * null blanks before the 1st and after the last day.
 */
export function getMonthGrid(year: number, month: number): MonthGridCell[][] {
  const total = daysInMonth(year, month);
  const lead = isoWeekday(year, month, 1);
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null });
  for (let d = 1; d <= total; d++) cells.push({ date: dateKey(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12 + 12) % 12 + 1 };
}

const MONTHS_PL = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export function monthLabelPl(year: number, month: number): string {
  return `${MONTHS_PL[month - 1]} ${year}`;
}

/** First/last day of a month as "YYYY-MM-DD" (for the calendar API query). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: dateKey(year, month, 1), to: dateKey(year, month, daysInMonth(year, month)) };
}
