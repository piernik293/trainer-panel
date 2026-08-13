/**
 * Booking slot generation (Stage 4 MVP) — focused unit tests.
 *
 * Matrix:
 *  1. Slots generated from an active availability row (duration + buffer step)
 *  2. Past slots excluded
 *  3. Booked slots excluded
 *  4. Inactive availability rows excluded
 *  5. Window limited to 30 days
 *  6. Buffer respected between slots
 */

import { describe, it, expect } from "vitest";
import { generateSlots, wallTimeToUtc, type AvailabilityRow } from "../services/bookingSlots";

// A fixed "now": Monday 2026-08-03 10:00 Warsaw time (CEST).
const NOW = wallTimeToUtc(2026, 8, 3, 10 * 60);

const monday16to20: AvailabilityRow = {
  weekday: 0, // Monday
  startTime: "16:00",
  endTime: "20:00",
  sessionMinutes: 60,
  bufferMinutes: 0,
  isActive: true,
};

describe("generateSlots", () => {
  it("generates hourly slots inside the range", () => {
    const slots = generateSlots([monday16to20], [], NOW);
    // First Monday (today, still in the future since now=10:00): 16,17,18,19.
    const today = slots.filter((s) => s.startsAt.toISOString().startsWith("2026-08-03"));
    expect(today.map((s) => s.startsAt.toISOString())).toEqual([
      wallTimeToUtc(2026, 8, 3, 16 * 60).toISOString(),
      wallTimeToUtc(2026, 8, 3, 17 * 60).toISOString(),
      wallTimeToUtc(2026, 8, 3, 18 * 60).toISOString(),
      wallTimeToUtc(2026, 8, 3, 19 * 60).toISOString(),
    ]);
    expect(today.every((s) => s.durationMinutes === 60)).toBe(true);
  });

  it("excludes past slots", () => {
    const lateNow = wallTimeToUtc(2026, 8, 3, 18 * 60 + 30); // Monday 18:30
    const slots = generateSlots([monday16to20], [], lateNow);
    const today = slots.filter((s) => s.startsAt.toISOString().startsWith("2026-08-03"));
    expect(today.map((s) => s.startsAt.toISOString())).toEqual([
      wallTimeToUtc(2026, 8, 3, 19 * 60).toISOString(),
    ]);
  });

  it("excludes booked slots", () => {
    const booked = wallTimeToUtc(2026, 8, 3, 17 * 60);
    const slots = generateSlots([monday16to20], [booked], NOW);
    const today = slots.filter((s) => s.startsAt.toISOString().startsWith("2026-08-03"));
    expect(today.map((s) => s.startsAt.getTime())).not.toContain(booked.getTime());
    expect(today).toHaveLength(3);
  });

  it("excludes inactive availability rows", () => {
    const slots = generateSlots([{ ...monday16to20, isActive: false }], [], NOW);
    expect(slots).toHaveLength(0);
  });

  it("limits the window to 30 days", () => {
    const slots = generateSlots([monday16to20], [], NOW);
    const limit = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startsAt < limit)).toBe(true);
  });

  it("respects the buffer between sessions", () => {
    const withBuffer = { ...monday16to20, bufferMinutes: 15 };
    const slots = generateSlots([withBuffer], [], NOW);
    const today = slots.filter((s) => s.startsAt.toISOString().startsWith("2026-08-03"));
    // 16:00, 17:15, 18:30 (19:45 + 60min would exceed 20:00).
    expect(today.map((s) => s.startsAt.toISOString())).toEqual([
      wallTimeToUtc(2026, 8, 3, 16 * 60).toISOString(),
      wallTimeToUtc(2026, 8, 3, 17 * 60 + 15).toISOString(),
      wallTimeToUtc(2026, 8, 3, 18 * 60 + 30).toISOString(),
    ]);
  });
});
