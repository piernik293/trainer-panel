/**
 * Booking slot generation (Stage 4 MVP).
 *
 * Slots are generated on the fly from weekly trainer availability rows —
 * they are never stored. A slot occupies `sessionMinutes` and the next slot
 * starts after `sessionMinutes + bufferMinutes`.
 *
 * Timezone: availability times are the trainer's wall-clock times in
 * Europe/Warsaw. Generated `startsAt` values are real UTC instants, so
 * DST is handled without any configurable timezone settings.
 */

export const BOOKING_WINDOW_DAYS = 30;
const TIME_ZONE = "Europe/Warsaw";

export interface AvailabilityRow {
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  /** "HH:MM" or "HH:MM:SS" */
  startTime: string;
  endTime: string;
  sessionMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

export interface GeneratedSlot {
  startsAt: Date;
  durationMinutes: number;
}

/** One-off exception applied on top of weekly availability. */
export interface ExceptionRow {
  /** Warsaw calendar day "YYYY-MM-DD". */
  date: string;
  type: "blocked_day" | "blocked_range" | "extra_range";
  /** "HH:MM[:SS]" — required for blocked_range / extra_range. */
  startTime: string | null;
  endTime: string | null;
  /** extra_range only */
  sessionDurationMinutes: number | null;
  breakMinutes: number | null;
}

/** Minutes since midnight from "HH:MM[:SS]". */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const wallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** What wall-clock time (in Warsaw) does this UTC instant correspond to? */
function utcToWallParts(d: Date): { y: number; mo: number; d: number; h: number; mi: number } {
  const p = Object.fromEntries(wallFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +(p.hour === "24" ? "0" : p.hour), mi: +p.minute };
}

/**
 * Convert a Warsaw wall time (y, mo, d, minutesOfDay) to a UTC Date.
 * Two-pass fixed-point: guess UTC, measure the wall time it produces,
 * correct by the difference.
 */
export function wallTimeToUtc(y: number, mo: number, d: number, minutesOfDay: number): Date {
  let guess = new Date(Date.UTC(y, mo - 1, d, 0, minutesOfDay));
  for (let i = 0; i < 2; i++) {
    const w = utcToWallParts(guess);
    const wallMs = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
    const targetMs = Date.UTC(y, mo - 1, d, 0, minutesOfDay);
    guess = new Date(guess.getTime() + (targetMs - wallMs));
  }
  return guess;
}

/** ISO weekday index 0=Mon…6=Sun for a Warsaw calendar date. */
function isoWeekday(y: number, mo: number, d: number): number {
  const js = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Sun
  return (js + 6) % 7;
}

/** "YYYY-MM-DD" key for a Warsaw calendar day given (y, mo, d). */
function dayKey(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Emit slots for one wall-time range on one Warsaw calendar day. */
function emitRangeSlots(
  out: GeneratedSlot[],
  y: number,
  mo: number,
  d: number,
  startMin: number,
  endMin: number,
  sessionMinutes: number,
  bufferMinutes: number,
): void {
  const step = sessionMinutes + bufferMinutes;
  if (sessionMinutes <= 0 || step <= 0) return;
  for (let t = startMin; t + sessionMinutes <= endMin; t += step) {
    out.push({ startsAt: wallTimeToUtc(y, mo, d, t), durationMinutes: sessionMinutes });
  }
}

/**
 * Generate available slots for the next `BOOKING_WINDOW_DAYS` days.
 *
 * Order of operations (single shared generator for client + trainer):
 *  1. slots from weekly availability, 2. add extra_range slots,
 *  3. drop blocked_day days, 4. drop slots overlapping blocked_range,
 *  5. drop past slots, 6. drop booked slots, 7. dedupe, 8. sort.
 *
 * Blocks affect only NEW bookings — existing bookings are handled elsewhere
 * and are never hidden or cancelled here.
 */
export interface SlotRange {
  /** First Warsaw calendar day "YYYY-MM-DD" (inclusive). */
  fromDay: string;
  /** Number of calendar days to cover. */
  days: number;
}

export function generateSlots(
  availability: AvailabilityRow[],
  bookedStarts: Date[],
  now: Date,
  exceptions: ExceptionRow[] = [],
  /**
   * Optional explicit day range (used by the trainer month calendar).
   * Defaults to [today, today + BOOKING_WINDOW_DAYS) — the client booking
   * window. Past slots are always excluded either way; this only widens or
   * shifts which calendar days are walked, it is NOT a second generator.
   */
  range?: SlotRange,
): GeneratedSlot[] {
  const active = availability.filter((a) => a.isActive);
  const bookedMs = new Set(bookedStarts.map((b) => b.getTime()));

  // Index exceptions by Warsaw day key ("YYYY-MM-DD" straight from the date column).
  const blockedDays = new Set<string>();
  const blockedRanges = new Map<string, Array<{ start: number; end: number }>>();
  const extraRanges = new Map<string, ExceptionRow[]>();
  for (const ex of exceptions) {
    const key = ex.date.slice(0, 10);
    if (ex.type === "blocked_day") {
      blockedDays.add(key);
    } else if (ex.type === "blocked_range" && ex.startTime && ex.endTime) {
      const list = blockedRanges.get(key) ?? [];
      list.push({ start: toMinutes(ex.startTime), end: toMinutes(ex.endTime) });
      blockedRanges.set(key, list);
    } else if (ex.type === "extra_range") {
      const list = extraRanges.get(key) ?? [];
      list.push(ex);
      extraRanges.set(key, list);
    }
  }

  const out: GeneratedSlot[] = [];
  const today = utcToWallParts(now);
  let first = { y: today.y, mo: today.mo, d: today.d };
  let dayCount = BOOKING_WINDOW_DAYS;
  if (range) {
    const [ry, rm, rd] = range.fromDay.split("-").map(Number);
    first = { y: ry, mo: rm, d: rd };
    dayCount = range.days;
  }
  for (let offset = 0; offset < dayCount; offset++) {
    // Walk calendar days in Warsaw time.
    const dayUtc = new Date(Date.UTC(first.y, first.mo - 1, first.d + offset, 12));
    const w = utcToWallParts(dayUtc);
    const key = dayKey(w.y, w.mo, w.d);
    const weekday = isoWeekday(w.y, w.mo, w.d);

    const dayCandidates: GeneratedSlot[] = [];
    // 1. Weekly availability.
    for (const row of active) {
      if (row.weekday !== weekday) continue;
      emitRangeSlots(
        dayCandidates, w.y, w.mo, w.d,
        toMinutes(row.startTime), toMinutes(row.endTime),
        row.sessionMinutes, row.bufferMinutes,
      );
    }
    // 2. extra_range one-off availability.
    for (const ex of extraRanges.get(key) ?? []) {
      if (!ex.startTime || !ex.endTime || ex.sessionDurationMinutes == null || ex.breakMinutes == null) continue;
      emitRangeSlots(
        dayCandidates, w.y, w.mo, w.d,
        toMinutes(ex.startTime), toMinutes(ex.endTime),
        ex.sessionDurationMinutes, ex.breakMinutes,
      );
    }
    // 3. blocked_day removes the whole day.
    if (blockedDays.has(key)) continue;
    // 4. blocked_range removes any slot OVERLAPPING the blocked window.
    const blocks = blockedRanges.get(key) ?? [];
    for (const slot of dayCandidates) {
      if (blocks.length > 0) {
        const slotWall = utcToWallParts(slot.startsAt);
        const slotStart = slotWall.h * 60 + slotWall.mi;
        const slotEnd = slotStart + slot.durationMinutes;
        if (blocks.some((b) => slotStart < b.end && slotEnd > b.start)) continue;
      }
      // 5. past, 6. booked.
      if (slot.startsAt.getTime() <= now.getTime()) continue;
      if (bookedMs.has(slot.startsAt.getTime())) continue;
      out.push(slot);
    }
  }

  // 7. dedupe (extra_range may coincide with weekly slots), 8. sort.
  const seen = new Set<number>();
  const deduped = out.filter((s) => {
    const ms = s.startsAt.getTime();
    if (seen.has(ms)) return false;
    seen.add(ms);
    return true;
  });
  deduped.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return deduped;
}
