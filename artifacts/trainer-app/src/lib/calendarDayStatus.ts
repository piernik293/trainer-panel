/**
 * Day-status + bulk-selection helpers for the trainer month calendar
 * (Stage 4.1B.1). Pure functions — unit-tested in calendarDayStatus.test.ts.
 */

export interface DayStatusInput {
  freeSlots: number;
  bookedSlots: number;
  isBlockedDay: boolean;
  hasAvailability: boolean;
}

export type DayStatus =
  | "PAST"
  | "BLOCKED"
  | "PARTIALLY_BOOKED"
  | "FULLY_BOOKED"
  | "AVAILABLE"
  | "NO_AVAILABILITY";

/**
 * Classify a calendar day. Red is reserved for manual blocks only —
 * a fully booked day is NEVER "BLOCKED".
 */
export function getDayStatus(day: DayStatusInput | undefined, isPast: boolean): DayStatus {
  if (isPast) return "PAST";
  if (!day) return "NO_AVAILABILITY";
  if (day.isBlockedDay) return "BLOCKED";
  if (day.freeSlots > 0 && day.bookedSlots > 0) return "PARTIALLY_BOOKED";
  if (day.freeSlots > 0) return "AVAILABLE";
  if (day.hasAvailability || day.bookedSlots > 0) return "FULLY_BOOKED";
  return "NO_AVAILABILITY";
}

/** Visual + textual meta per status. Meaning never carried by color alone. */
export const DAY_STATUS_META: Record<
  DayStatus,
  { label: string; cellClass: string; dotClass: string }
> = {
  AVAILABLE: {
    label: "Wolne terminy",
    cellClass: "bg-green-500/10 border-green-600/40",
    dotClass: "bg-green-600",
  },
  PARTIALLY_BOOKED: {
    label: "Częściowo zajęty",
    cellClass: "bg-amber-500/10 border-amber-600/40",
    dotClass: "bg-amber-500",
  },
  FULLY_BOOKED: {
    label: "Brak wolnych terminów",
    cellClass: "bg-blue-500/10 border-blue-600/40",
    dotClass: "bg-blue-600",
  },
  BLOCKED: {
    label: "Dzień zablokowany",
    cellClass: "bg-red-500/10 border-red-600/40",
    dotClass: "bg-red-600",
  },
  NO_AVAILABILITY: {
    label: "Brak dostępności",
    cellClass: "bg-muted/40 border-border",
    dotClass: "bg-muted-foreground/50",
  },
  PAST: {
    label: "Dzień przeszły",
    cellClass: "border-border",
    dotClass: "bg-muted-foreground/30",
  },
};

/** Short status text shown inside the cell (mobile-compact variant separate). */
export function dayStatusText(status: DayStatus, day: DayStatusInput | undefined): string[] {
  switch (status) {
    case "AVAILABLE":
      return [pluralPl(day!.freeSlots, "wolny", "wolne", "wolnych")];
    case "PARTIALLY_BOOKED":
      return [
        pluralPl(day!.freeSlots, "wolny", "wolne", "wolnych"),
        pluralPl(day!.bookedSlots, "rezerwacja", "rezerwacje", "rezerwacji"),
      ];
    case "FULLY_BOOKED":
      return ["Brak wolnych terminów"];
    case "BLOCKED":
      return ["Dzień zablokowany"];
    case "NO_AVAILABILITY":
      return ["Brak dostępności"];
    case "PAST":
      return [];
  }
}

export function pluralPl(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

// ─── Bulk selection (pure state transitions) ─────────────────────────────────

/** A day can join the bulk selection only if it's a real, non-past grid day. */
export function isSelectable(date: string | null, today: string): boolean {
  return date !== null && date >= today;
}

export function toggleDay(selected: ReadonlySet<string>, date: string): Set<string> {
  const next = new Set(selected);
  if (next.has(date)) next.delete(date);
  else next.add(date);
  return next;
}

/**
 * Shift+click range: all selectable days between anchor and date (inclusive),
 * added to the selection. Order-agnostic. gridDates = the month's real dates.
 */
export function selectRange(
  selected: ReadonlySet<string>,
  gridDates: string[],
  anchor: string,
  date: string,
  today: string,
): Set<string> {
  const next = new Set(selected);
  const [lo, hi] = anchor <= date ? [anchor, date] : [date, anchor];
  for (const d of gridDates) {
    if (d >= lo && d <= hi && isSelectable(d, today)) next.add(d);
  }
  return next;
}

/** Compact human summary of selected dates, e.g. "4–8, 12, 15–16 sierpnia". */
export function summarizeDates(dates: string[]): string {
  const sorted = [...dates].sort();
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (
      j + 1 < sorted.length &&
      shiftDay(sorted[j], 1) === sorted[j + 1]
    ) {
      j++;
    }
    const dayNum = (d: string) => String(Number(d.slice(8)));
    parts.push(i === j ? shortDatePl(sorted[i]) : `${dayNum(sorted[i])}–${shortDatePl(sorted[j])}`);
    i = j + 1;
  }
  return parts.join(", ");
}

export function shortDatePl(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
  });
}

export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}
