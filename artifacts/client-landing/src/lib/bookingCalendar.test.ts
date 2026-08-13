/**
 * Stage 4.1C unit tests — client booking calendar helpers.
 * Covers: month grid layout, 30-day window (incl. two-month spans),
 * Warsaw-day grouping (incl. DST) and device-zone independence.
 */

import { describe, it, expect } from "vitest";
import {
  getMonthGrid,
  daysInMonth,
  isoWeekday,
  todayWarsaw,
  bookingWindow,
  windowMonths,
  groupSlotsByDay,
  slotDayKeyIso,
  shiftDay,
  freeCountLabel,
} from "./bookingCalendar";

describe("month grid", () => {
  it("starts weeks on Monday with correct blanks", () => {
    // 2026-08-01 is a Saturday → 5 leading blanks.
    const grid = getMonthGrid(2026, 8);
    const flat = grid.flat();
    expect(flat.slice(0, 5).every((c) => c.date === null)).toBe(true);
    expect(flat[5].date).toBe("2026-08-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(flat.filter((c) => c.date).length).toBe(31);
  });

  it("handles February and leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(isoWeekday(2026, 2, 1)).toBe(6); // Sunday
  });
});

describe("booking window (30 days)", () => {
  it("spans exactly 30 calendar days", () => {
    const w = bookingWindow("2026-08-01");
    expect(w).toEqual({ first: "2026-08-01", last: "2026-08-30" });
  });

  it("crossing a month boundary yields two navigable months", () => {
    expect(windowMonths("2026-08-15")).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
    expect(windowMonths("2026-12-20")).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(windowMonths("2026-08-01")).toEqual([{ year: 2026, month: 8 }]);
  });

  it("window across a DST change still counts calendar days", () => {
    // Spring forward 2027-03-28 sits inside this window.
    const w = bookingWindow("2027-03-15");
    expect(w.last).toBe("2027-04-13");
    expect(shiftDay("2027-03-27", 2)).toBe("2027-03-29");
  });
});

describe("slot grouping (Warsaw days)", () => {
  it("groups by Warsaw calendar day and sorts chronologically", () => {
    const slots = [
      { startsAt: "2026-08-03T16:00:00.000Z" }, // 18:00 Warsaw
      { startsAt: "2026-08-03T14:00:00.000Z" }, // 16:00 Warsaw
      { startsAt: "2026-08-03T22:30:00.000Z" }, // 00:30 Warsaw NEXT day
    ];
    const byDay = groupSlotsByDay(slots);
    expect([...byDay.keys()]).toEqual(["2026-08-03", "2026-08-04"]);
    expect(byDay.get("2026-08-03")!.map((s) => s.startsAt)).toEqual([
      "2026-08-03T14:00:00.000Z",
      "2026-08-03T16:00:00.000Z",
    ]);
  });

  it("is correct around the autumn DST transition (2026-10-25)", () => {
    // 00:30 UTC on Oct 25 is 02:30 CEST; 23:30 UTC on Oct 24 is 01:30 CEST Oct 25.
    expect(slotDayKeyIso("2026-10-24T23:30:00.000Z")).toBe("2026-10-25");
    expect(slotDayKeyIso("2026-10-25T23:30:00.000Z")).toBe("2026-10-26"); // 00:30 CET
  });

  it("todayWarsaw is device-zone independent", () => {
    expect(todayWarsaw(new Date("2026-08-01T23:30:00Z"))).toBe("2026-08-02");
  });
});

describe("labels", () => {
  it("uses Polish plurals", () => {
    expect(freeCountLabel(1)).toBe("1 wolny");
    expect(freeCountLabel(3)).toBe("3 wolne");
    expect(freeCountLabel(5)).toBe("5 wolnych");
    expect(freeCountLabel(22)).toBe("22 wolne");
  });
});
