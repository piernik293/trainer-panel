/**
 * Month grid unit tests (Stage 4.1B):
 *  - grids for months starting on every weekday
 *  - February in a common and a leap year
 *  - week starts on Monday, correct leading/trailing blanks
 *  - DST months (March/October 2026) have the full day count
 *  - todayWarsaw is device-timezone independent
 */

import { describe, it, expect } from "vitest";
import { getMonthGrid, daysInMonth, isoWeekday, todayWarsaw, addMonths, monthRange } from "./monthGrid";

describe("getMonthGrid", () => {
  it("builds correct grids for months starting on each weekday (Mon..Sun)", () => {
    // 2026: Jun 1 = Mon, Sep 1 = Tue, Jul 1 = Wed, Oct 1 = Thu, May 1 = Fri, Aug 1 = Sat, Feb 1 = Sun.
    const cases: Array<[number, number, number]> = [
      [2026, 6, 0], [2026, 9, 1], [2026, 7, 2], [2026, 10, 3], [2026, 5, 4], [2026, 8, 5], [2026, 2, 6],
    ];
    for (const [y, m, lead] of cases) {
      expect(isoWeekday(y, m, 1)).toBe(lead);
      const grid = getMonthGrid(y, m);
      const flat = grid.flat();
      // Leading blanks equal the weekday index (Monday start).
      expect(flat.slice(0, lead).every((c) => c.date === null)).toBe(true);
      expect(flat[lead]?.date).toBe(`${y}-${String(m).padStart(2, "0")}-01`);
      // All weeks have exactly 7 cells.
      expect(grid.every((w) => w.length === 7)).toBe(true);
      // Non-null cells count equals the days of the month, in order.
      const days = flat.filter((c) => c.date !== null);
      expect(days).toHaveLength(daysInMonth(y, m));
      expect(days[days.length - 1].date!.endsWith(String(daysInMonth(y, m)))).toBe(true);
    }
  });

  it("handles February: 28 days (2026) and 29 days in a leap year (2028)", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(getMonthGrid(2028, 2).flat().filter((c) => c.date).length).toBe(29);
  });

  it("DST months contain the full set of days with no shift", () => {
    // March 2026 (spring forward Mar 29) and October 2026 (fall back Oct 25).
    for (const [y, m, n] of [[2026, 3, 31], [2026, 10, 31]] as const) {
      const days = getMonthGrid(y, m).flat().filter((c) => c.date).map((c) => c.date!);
      expect(days).toHaveLength(n);
      // Strictly consecutive day numbers — no duplicate or skipped date.
      expect(new Set(days).size).toBe(n);
      expect(days[28]).toBe(`${y}-${String(m).padStart(2, "0")}-29`);
    }
  });
});

describe("helpers", () => {
  it("todayWarsaw formats the Warsaw calendar day regardless of device zone", () => {
    // 2026-08-01T23:30Z is already 2026-08-02 01:30 in Warsaw (CEST).
    expect(todayWarsaw(new Date("2026-08-01T23:30:00Z"))).toBe("2026-08-02");
    // 2026-01-01T00:30Z is 01:30 CET — same day.
    expect(todayWarsaw(new Date("2026-01-01T00:30:00Z"))).toBe("2026-01-01");
  });

  it("addMonths wraps across year boundaries", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("monthRange covers the whole month", () => {
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
