/**
 * Stage 4.1B.1 — day status + bulk selection unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  getDayStatus,
  dayStatusText,
  DAY_STATUS_META,
  isSelectable,
  toggleDay,
  selectRange,
  summarizeDates,
} from "./calendarDayStatus";

const day = (over: Partial<Parameters<typeof getDayStatus>[0] & object> = {}) => ({
  freeSlots: 0,
  bookedSlots: 0,
  isBlockedDay: false,
  hasAvailability: false,
  ...over,
});

describe("getDayStatus", () => {
  it("AVAILABLE: free slots, no bookings, green + count text", () => {
    const d = day({ freeSlots: 4, hasAvailability: true });
    expect(getDayStatus(d, false)).toBe("AVAILABLE");
    expect(dayStatusText("AVAILABLE", d)).toEqual(["4 wolne"]);
    expect(DAY_STATUS_META.AVAILABLE.cellClass).toContain("green");
  });

  it("PARTIALLY_BOOKED is distinct from AVAILABLE and lists both counts", () => {
    const d = day({ freeSlots: 3, bookedSlots: 1, hasAvailability: true });
    expect(getDayStatus(d, false)).toBe("PARTIALLY_BOOKED");
    expect(dayStatusText("PARTIALLY_BOOKED", d)).toEqual(["3 wolne", "1 rezerwacja"]);
    expect(getDayStatus(day({ freeSlots: 3, hasAvailability: true }), false)).toBe("AVAILABLE");
  });

  it("FULLY_BOOKED is never marked as BLOCKED (red = manual block only)", () => {
    const d = day({ bookedSlots: 4, hasAvailability: true });
    expect(getDayStatus(d, false)).toBe("FULLY_BOOKED");
    expect(dayStatusText("FULLY_BOOKED", d)).toEqual(["Brak wolnych terminów"]);
    expect(DAY_STATUS_META.FULLY_BOOKED.cellClass).not.toContain("red");
  });

  it("BLOCKED: blocked_day wins, red status and text", () => {
    const d = day({ isBlockedDay: true, bookedSlots: 1, hasAvailability: true });
    expect(getDayStatus(d, false)).toBe("BLOCKED");
    expect(dayStatusText("BLOCKED", d)).toEqual(["Dzień zablokowany"]);
    expect(DAY_STATUS_META.BLOCKED.cellClass).toContain("red");
  });

  it("NO_AVAILABILITY stays neutral (grey), PAST overrides everything", () => {
    expect(getDayStatus(day(), false)).toBe("NO_AVAILABILITY");
    expect(getDayStatus(undefined, false)).toBe("NO_AVAILABILITY");
    expect(DAY_STATUS_META.NO_AVAILABILITY.cellClass).not.toMatch(/green|red|amber|blue/);
    expect(getDayStatus(day({ freeSlots: 4 }), true)).toBe("PAST");
  });
});

describe("bulk selection", () => {
  const today = "2026-08-10";

  it("past days and blank cells are not selectable", () => {
    expect(isSelectable("2026-08-09", today)).toBe(false);
    expect(isSelectable(null, today)).toBe(false);
    expect(isSelectable("2026-08-10", today)).toBe(true);
    expect(isSelectable("2026-08-11", today)).toBe(true);
  });

  it("toggleDay selects and deselects", () => {
    let s = toggleDay(new Set(), "2026-08-12");
    expect([...s]).toEqual(["2026-08-12"]);
    s = toggleDay(s, "2026-08-12");
    expect(s.size).toBe(0);
  });

  it("selectRange (drag / shift+click) selects several days, skipping past ones", () => {
    const grid = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    const s = selectRange(new Set(), grid, "2026-08-08", "2026-08-14", today);
    // 8th–9th are past relative to today=10th → excluded.
    expect([...s].sort()).toEqual(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]);
    // Reversed order behaves the same.
    const s2 = selectRange(new Set(), grid, "2026-08-14", "2026-08-08", today);
    expect(s2).toEqual(s);
  });

  it("summarizeDates compresses consecutive runs", () => {
    expect(
      summarizeDates(["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-12", "2026-08-15", "2026-08-16"]),
    ).toBe("4–6 sierpnia, 12 sierpnia, 15–16 sierpnia");
  });
});
