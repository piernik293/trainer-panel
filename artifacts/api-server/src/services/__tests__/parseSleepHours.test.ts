import { describe, it, expect } from "vitest";
import { parseSleepHours } from "../planDraftInputService";

// Same values as SLEEP_HOURS_OPTIONS in lib/survey-config (the api-server does not depend on it).
const SLEEP_HOURS_OPTIONS = ["Poniżej 5 godzin", "5–6 godzin", "6–7 godzin", "7–8 godzin", "Powyżej 8 godzin"];

describe("parseSleepHours — every survey answer reaches the generator", () => {
  it.each([
    ["Poniżej 5 godzin", 4],
    ["5–6 godzin", 5],
    ["6–7 godzin", 6],
    ["7–8 godzin", 7],
    ["Powyżej 8 godzin", 9],
  ])("%s → %i h", (raw, hours) => {
    expect(parseSleepHours(raw)).toBe(hours);
  });

  it("no survey option is treated as missing data", () => {
    for (const opt of SLEEP_HOURS_OPTIONS) expect(parseSleepHours(opt), opt).not.toBeNull();
  });

  it("shortest sleep counts as insufficient (< 6 h), longest as good (≥ 8 h)", () => {
    expect(parseSleepHours("Poniżej 5 godzin")!).toBeLessThan(6);
    expect(parseSleepHours("Powyżej 8 godzin")!).toBeGreaterThanOrEqual(8);
  });

  it("plain numbers and empty values keep the old behaviour", () => {
    expect(parseSleepHours("7")).toBe(7);
    expect(parseSleepHours("")).toBeNull();
    expect(parseSleepHours(null)).toBeNull();
    expect(parseSleepHours(undefined)).toBeNull();
    expect(parseSleepHours("brak")).toBeNull();
  });
});
