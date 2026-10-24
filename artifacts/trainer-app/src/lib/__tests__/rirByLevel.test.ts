import { describe, it, expect } from "vitest";
import { defaultRirForLevel, rirLevelHint, RIR_BY_LEVEL, DRAFT_EXERCISE_DEFAULTS } from "../exerciseDraftHelpers";

describe("RIR by level (block 7)", () => {
  it("brak aktywności 3–4, początkujący 2–3", () => {
    expect(RIR_BY_LEVEL["Brak aktywności fizycznej"]).toMatchObject({ min: 3, max: 4 });
    expect(RIR_BY_LEVEL["Początkujący"]).toMatchObject({ min: 2, max: 3 });
  });
  it("defaults sit inside the range; other levels keep the old default", () => {
    expect(defaultRirForLevel("Brak aktywności fizycznej")).toBe(3);
    expect(defaultRirForLevel("Początkujący")).toBe(2);
    for (const l of ["Średniozaawansowany", "Zaawansowany", null, undefined, "x"]) expect(defaultRirForLevel(l)).toBe(DRAFT_EXERCISE_DEFAULTS.rir);
  });
  it("hint only outside the range, never for levels without a range", () => {
    expect(rirLevelHint(3, "Brak aktywności fizycznej")).toBeNull();
    expect(rirLevelHint(4, "Brak aktywności fizycznej")).toBeNull();
    expect(rirLevelHint(2, "Brak aktywności fizycznej")).toContain("3–4");
    expect(rirLevelHint(1, "Początkujący")).toContain("2–3");
    expect(rirLevelHint(0, "Zaawansowany")).toBeNull();
  });
});
