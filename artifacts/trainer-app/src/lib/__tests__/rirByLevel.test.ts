import { describe, it, expect } from "vitest";
import { defaultRirForLevel, rirLevelHint, rirTargetLabel, weekBalanceResidualWarnings, RIR_BY_LEVEL, DRAFT_EXERCISE_DEFAULTS } from "../exerciseDraftHelpers";

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

describe("rirTargetLabel — neutralna podpowiedź przy polu RIR", () => {
  it("pokazuje zakres celu dla poziomów z zakresem", () => {
    expect(rirTargetLabel("Brak aktywności fizycznej")).toBe("Cel: RIR 3–4");
    expect(rirTargetLabel("Początkujący")).toBe("Cel: RIR 2–3");
  });
  it("brak podpowiedzi dla pozostałych poziomów i braku poziomu", () => {
    expect(rirTargetLabel("Średniozaawansowany")).toBeNull();
    expect(rirTargetLabel("Zaawansowany")).toBeNull();
    expect(rirTargetLabel(null)).toBeNull();
  });
});

describe("weekBalanceResidualWarnings — komunikat, gdy po wyrównaniu zostaje nadwyżka", () => {
  it("jedna linia na partię, zaokrąglenie do 0,1", () => {
    expect(weekBalanceResidualWarnings([{ targetName: "Brzuch", weeklyEffectiveSets: 6.75, weeklyAbsoluteCeiling: 6 }]))
      .toEqual(["Brzuch: 6.8 serii przy limicie 6 — zmniejsz serie przed aktywacją."]);
    expect(weekBalanceResidualWarnings([])).toEqual([]);
  });
});
