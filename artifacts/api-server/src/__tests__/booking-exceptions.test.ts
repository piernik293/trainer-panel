/**
 * Availability exceptions (Stage 4.1A) — focused tests.
 *
 * Generator (shared logic — the same generateSlots call is used by the
 * client slot list AND the booking re-validation, so "client cannot book a
 * blocked slot" is covered by the generator excluding it):
 *  1. blocked_day removes every free slot of that day
 *  2. blocked_range removes only overlapping slots
 *  3. extra_range creates one-off slots
 *  4. extra_range does not duplicate weekly slots
 *  5. an existing booking is unaffected by a later block (only free slots filtered)
 *  6. exceptions are keyed to the Warsaw calendar day
 *
 * Validation (validateExceptionPayload):
 *  7. end before/equal start rejected
 *  8. blocked_day with times rejected
 *  9. extra_range without session/break rejected
 * 10. invalid date format rejected
 */

import { describe, it, expect } from "vitest";
import {
  generateSlots,
  wallTimeToUtc,
  type AvailabilityRow,
  type ExceptionRow,
} from "../services/bookingSlots";
import { validateExceptionPayload } from "../routes/bookings";

// Fixed "now": Monday 2026-08-03 10:00 Warsaw (CEST). First Monday slots: 16–19.
const NOW = wallTimeToUtc(2026, 8, 3, 10 * 60);

const monday16to20: AvailabilityRow = {
  weekday: 0,
  startTime: "16:00",
  endTime: "20:00",
  sessionMinutes: 60,
  bufferMinutes: 0,
  isActive: true,
};

const iso = (min: number, day = 3) => wallTimeToUtc(2026, 8, day, min).toISOString();
const onDay = (slots: ReturnType<typeof generateSlots>, day: string) =>
  slots.filter((s) => s.startsAt.toISOString().startsWith(day));

describe("generateSlots with exceptions", () => {
  it("blocked_day removes all free slots of that day only", () => {
    const ex: ExceptionRow[] = [
      { date: "2026-08-03", type: "blocked_day", startTime: null, endTime: null, sessionDurationMinutes: null, breakMinutes: null },
    ];
    const slots = generateSlots([monday16to20], [], NOW, ex);
    expect(onDay(slots, "2026-08-03")).toHaveLength(0);
    // Next Monday (2026-08-10) unaffected.
    expect(onDay(slots, "2026-08-10")).toHaveLength(4);
  });

  it("blocked_range removes only overlapping slots", () => {
    // Block 17:30–18:30 → kills 17:00 and 18:00 slots; 16:00 and 19:00 remain.
    const ex: ExceptionRow[] = [
      { date: "2026-08-03", type: "blocked_range", startTime: "17:30", endTime: "18:30", sessionDurationMinutes: null, breakMinutes: null },
    ];
    const slots = onDay(generateSlots([monday16to20], [], NOW, ex), "2026-08-03");
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([iso(16 * 60), iso(19 * 60)]);
  });

  it("extra_range creates one-off slots", () => {
    // Tuesday has no weekly availability; extra_range 09:00–11:00 adds 2 slots.
    const ex: ExceptionRow[] = [
      { date: "2026-08-04", type: "extra_range", startTime: "09:00", endTime: "11:00", sessionDurationMinutes: 60, breakMinutes: 0 },
    ];
    const slots = onDay(generateSlots([monday16to20], [], NOW, ex), "2026-08-04");
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      iso(9 * 60, 4),
      iso(10 * 60, 4),
    ]);
  });

  it("extra_range overlapping weekly availability does not duplicate slots", () => {
    const ex: ExceptionRow[] = [
      { date: "2026-08-03", type: "extra_range", startTime: "16:00", endTime: "20:00", sessionDurationMinutes: 60, breakMinutes: 0 },
    ];
    const slots = onDay(generateSlots([monday16to20], [], NOW, ex), "2026-08-03");
    const starts = slots.map((s) => s.startsAt.getTime());
    expect(new Set(starts).size).toBe(starts.length);
    expect(slots).toHaveLength(4);
  });

  it("a later blocked_day only filters FREE slots — an existing booking's start simply stops being offered, nothing else", () => {
    const booked = wallTimeToUtc(2026, 8, 3, 17 * 60);
    const ex: ExceptionRow[] = [
      { date: "2026-08-03", type: "blocked_day", startTime: null, endTime: null, sessionDurationMinutes: null, breakMinutes: null },
    ];
    // Generator takes bookings as opaque input and never returns/creates/cancels
    // bookings; blocking the day yields zero free slots, booked list untouched.
    const bookedStarts = [booked];
    const slots = generateSlots([monday16to20], bookedStarts, NOW, ex);
    expect(onDay(slots, "2026-08-03")).toHaveLength(0);
    expect(bookedStarts).toEqual([booked]);
  });

  it("keys exceptions to the Warsaw calendar day (not UTC)", () => {
    // A blocked_day for Warsaw 2026-08-04 must not touch a Monday 23:00-ish
    // slot that is still 2026-08-03 in Warsaw but 2026-08-03T21:00Z+ in UTC.
    const lateMonday: AvailabilityRow = { ...monday16to20, startTime: "22:00", endTime: "23:00" };
    const ex: ExceptionRow[] = [
      { date: "2026-08-04", type: "blocked_day", startTime: null, endTime: null, sessionDurationMinutes: null, breakMinutes: null },
    ];
    const slots = generateSlots([lateMonday], [], NOW, ex);
    // The 22:00 Warsaw Monday slot (20:00 UTC) survives.
    expect(slots.some((s) => s.startsAt.getTime() === wallTimeToUtc(2026, 8, 3, 22 * 60).getTime())).toBe(true);
  });
});

describe("extra_range vs regular slot conflict (deterministic MVP rule)", () => {
  it("regular slot wins when extra_range yields the same start with a different duration", () => {
    // Weekly slot at 16:00 lasts 60 min; extra_range also starts 16:00 but 90 min.
    const ex: ExceptionRow[] = [
      { date: "2026-08-03", type: "extra_range", startTime: "16:00", endTime: "19:00", sessionDurationMinutes: 90, breakMinutes: 0 },
    ];
    const slots = onDay(generateSlots([monday16to20], [], NOW, ex), "2026-08-03");
    const at16 = slots.filter((s) => s.startsAt.getTime() === wallTimeToUtc(2026, 8, 3, 16 * 60).getTime());
    // Exactly ONE version of the 16:00 slot, and it's the regular 60-min one.
    expect(at16).toHaveLength(1);
    expect(at16[0].durationMinutes).toBe(60);
  });
});

describe("Europe/Warsaw DST transitions", () => {
  // Spring forward: Sunday 2026-03-29, 02:00 → 03:00 (CET→CEST).
  // Fall back:      Sunday 2026-10-25, 03:00 → 02:00 (CEST→CET).
  const sunday: AvailabilityRow = { ...monday16to20, weekday: 6, startTime: "08:00", endTime: "10:00" };

  it("spring-forward day: slots start at the correct UTC instants (UTC+2 after shift)", () => {
    const now = wallTimeToUtc(2026, 3, 28, 12 * 60); // Saturday before
    const slots = generateSlots([sunday], [], now).filter((s) =>
      s.startsAt.toISOString().startsWith("2026-03-29"),
    );
    // 08:00 CEST = 06:00Z, 09:00 CEST = 07:00Z.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-03-29T06:00:00.000Z",
      "2026-03-29T07:00:00.000Z",
    ]);
  });

  it("fall-back day: slots start at the correct UTC instants (UTC+1 after shift)", () => {
    const now = wallTimeToUtc(2026, 10, 24, 12 * 60); // Saturday before
    const slots = generateSlots([sunday], [], now).filter((s) =>
      s.startsAt.toISOString().startsWith("2026-10-25"),
    );
    // 08:00 CET = 07:00Z, 09:00 CET = 08:00Z.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-10-25T07:00:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ]);
  });

  it("blocked_day on a DST date blocks exactly that Warsaw day (no UTC drift)", () => {
    const now = wallTimeToUtc(2026, 3, 28, 12 * 60);
    const ex: ExceptionRow[] = [
      { date: "2026-03-29", type: "blocked_day", startTime: null, endTime: null, sessionDurationMinutes: null, breakMinutes: null },
    ];
    // Availability on Saturday evening + Sunday morning.
    const saturday: AvailabilityRow = { ...monday16to20, weekday: 5, startTime: "22:00", endTime: "23:00" };
    const slots = generateSlots([sunday, saturday], [], now, ex);
    // Sunday blocked entirely…
    expect(slots.some((s) => s.startsAt.toISOString().startsWith("2026-03-29"))).toBe(false);
    // …but the Saturday 22:00 Warsaw slot (2026-03-28T21:00Z, still Saturday) survives.
    expect(slots.some((s) => s.startsAt.getTime() === wallTimeToUtc(2026, 3, 28, 22 * 60).getTime())).toBe(true);
  });

  it("blocked_range around the fall-back hour removes only overlapping slots", () => {
    const now = wallTimeToUtc(2026, 10, 24, 12 * 60);
    const ex: ExceptionRow[] = [
      { date: "2026-10-25", type: "blocked_range", startTime: "08:00", endTime: "09:00", sessionDurationMinutes: null, breakMinutes: null },
    ];
    const slots = generateSlots([sunday], [], now, ex).filter((s) =>
      s.startsAt.toISOString().startsWith("2026-10-25"),
    );
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(["2026-10-25T08:00:00.000Z"]); // only 09:00 CET remains
  });
});

describe("validateExceptionPayload", () => {
  it("rejects end time not after start time", () => {
    const r = validateExceptionPayload({ type: "blocked_range", date: "2026-08-10", startTime: "12:00", endTime: "12:00" });
    expect("error" in r && r.error).toMatch(/późniejsza/);
  });

  it("rejects blocked_day with times", () => {
    const r = validateExceptionPayload({ type: "blocked_day", date: "2026-08-10", startTime: "12:00", endTime: "13:00" });
    expect("error" in r && r.error).toMatch(/całego dnia/);
  });

  it("rejects extra_range without session duration or break", () => {
    const r = validateExceptionPayload({ type: "extra_range", date: "2026-08-10", startTime: "09:00", endTime: "11:00" });
    expect("error" in r).toBe(true);
  });

  it("rejects invalid date format", () => {
    const r = validateExceptionPayload({ type: "blocked_day", date: "10.08.2026" });
    expect("error" in r).toBe(true);
    const r2 = validateExceptionPayload({ type: "blocked_day", date: "2026-02-30" });
    expect("error" in r2).toBe(true);
  });

  it("accepts valid payloads of each type", () => {
    expect("data" in validateExceptionPayload({ type: "blocked_day", date: "2026-08-10" })).toBe(true);
    expect("data" in validateExceptionPayload({ type: "blocked_range", date: "2026-08-10", startTime: "12:00", endTime: "14:00" })).toBe(true);
    expect("data" in validateExceptionPayload({ type: "extra_range", date: "2026-08-10", startTime: "09:00", endTime: "11:00", sessionDurationMinutes: 60, breakMinutes: 0 })).toBe(true);
  });
});
