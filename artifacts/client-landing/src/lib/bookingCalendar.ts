/**
 * Month-grid + slot-grouping helpers for the client booking calendar
 * (Stage 4.1C).
 *
 * IMPORTANT: this module contains NO availability logic. Which days/hours are
 * bookable comes exclusively from the backend's free-slot list
 * (GET /client-portal/booking/slots — the shared generator). These helpers
 * only lay out a Warsaw-calendar month and group the returned slots by
 * Warsaw day.
 *
 * All date math uses plain "YYYY-MM-DD" strings + UTC-noon Dates — never
 * `new Date("YYYY-MM-DD")` browser-zone parsing.
 */

export const BOOKING_TIME_ZONE = "Europe/Warsaw";

/** Mirrors the backend's client booking window; display-only clamp. */
export const BOOKING_WINDOW_DAYS = 30;

export interface MonthGridCell {
  /** "YYYY-MM-DD" or null for a blank leading/trailing cell. */
  date: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Today's Warsaw calendar day (device timezone irrelevant). */
export function todayWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BOOKING_TIME_ZONE }).format(now);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday 0=Mon…6=Sun. */
export function isoWeekday(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** Monday-start month grid with null blanks before the 1st / after the last day. */
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
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 + 1 };
}

const MONTHS_PL = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export function monthLabelPl(year: number, month: number): string {
  return `${MONTHS_PL[month - 1]} ${year}`;
}

/** Shift a "YYYY-MM-DD" day by N calendar days (pure calendar math). */
export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * The client booking window as calendar days: [today, today + 29].
 * Days outside are dimmed/disabled in the UI (backend enforces it anyway).
 */
export function bookingWindow(today: string): { first: string; last: string } {
  return { first: today, last: shiftDay(today, BOOKING_WINDOW_DAYS - 1) };
}

/** Months (year, month) the booking window touches — the only navigable months. */
export function windowMonths(today: string): Array<{ year: number; month: number }> {
  const { first, last } = bookingWindow(today);
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const months = [{ year: fy, month: fm }];
  if (fy !== ly || fm !== lm) months.push({ year: ly, month: lm });
  return months;
}

/** Warsaw calendar-day key of a slot's ISO start (device-zone independent). */
export function slotDayKeyIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: BOOKING_TIME_ZONE });
}

/**
 * Group backend free slots by Warsaw day. Pure regrouping of the backend
 * list — a day with no entry simply has no free slots.
 */
export function groupSlotsByDay<S extends { startsAt: string }>(slots: S[]): Map<string, S[]> {
  const byDay = new Map<string, S[]>();
  for (const s of slots) {
    const key = slotDayKeyIso(s.startsAt);
    const list = byDay.get(key);
    if (list) list.push(s);
    else byDay.set(key, [s]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return byDay;
}

/** Polish plural for free-slot counts shown in day cells. */
export function freeCountLabel(n: number): string {
  if (n === 1) return "1 wolny";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} wolne`;
  return `${n} wolnych`;
}
