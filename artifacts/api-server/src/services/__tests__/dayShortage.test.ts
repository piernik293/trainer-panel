import { describe, it, expect } from "vitest";
import { dayShortageMessage, MIN_DAY_EXERCISES, FULL_DAY_EXERCISES } from "../dayShortage";

const base = { sessionType: "pull", effectiveLevel: "Średniozaawansowany", location: "Dom" as string | null, equipmentText: "Brak sprzętu" as string | null, blockedJoints: new Set<string>() };

describe("dayShortageMessage — plain words for the trainer (decision 51)", () => {
  it("the limits", () => { expect(MIN_DAY_EXERCISES).toBe(3); expect(FULL_DAY_EXERCISES).toBe(4); });
  it("a pulling day at home without band, dumbbells or bar: the owner's wording", () => {
    expect(dayShortageMessage(base)).toBe("Mało ćwiczeń na plecy bez sprzętu. Dodaj gumę albo drążek, a plan będzie pełniejszy.");
    expect(dayShortageMessage({ ...base, sessionType: "upper" })).toContain("plecy");
  });
  it("a leg day without equipment is not blamed on the back", () => {
    expect(dayShortageMessage({ ...base, sessionType: "legs" })).not.toContain("plecy");
    expect(dayShortageMessage({ ...base, sessionType: "legs" })).toContain("hantle albo gumę");
  });
  it("a reported pain is named", () => {
    const m = dayShortageMessage({ ...base, equipmentText: "Gumy oporowe", blockedJoints: new Set(["Bark"]) });
    expect(m).toContain("bark");
    expect(m).toContain("plan będzie pełniejszy");
  });
  it("a beginner and the rest get their own sentences; every message has a next step and no medical words", () => {
    const msgs = [
      dayShortageMessage({ ...base, equipmentText: "Gumy oporowe", effectiveLevel: "Początkujący" }),
      dayShortageMessage({ ...base, location: "Siłownia", equipmentText: null }),
      dayShortageMessage({ ...base, equipmentText: "Gumy oporowe", location: "Siłownia plenerowa" }),
    ];
    expect(msgs[0]).toContain("początkując");
    for (const m of msgs) { expect(m).toMatch(/Dodaj|wybierz|zmień/i); expect(m.toLowerCase()).not.toMatch(/diagnoz|chorob|leczeni/); }
  });
});
