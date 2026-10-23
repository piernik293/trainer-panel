import { describe, it, expect } from "vitest";
import { parseTrainingYears, resolveEffectiveLevel, effectiveLevelWarning } from "../effectiveLevel";

describe("parseTrainingYears", () => {
  it.each([
    ["2 lata", 2], ["1 rok", 1], ["3 lata z przerwami", 3], ["1,5 roku", 1.5], ["pół roku", 0.5],
    ["18 miesięcy", 1.5], ["1 rok 6 mies.", 1.5], ["5", 5], ["10 lat", 10],
  ])("%s → %f", (raw, years) => expect(parseTrainingYears(raw)).toBeCloseTo(years as number, 5));
  it.each([[""], [null], [undefined], ["od dawna"], ["nie pamiętam"]])("%s → null", (raw) =>
    expect(parseTrainingYears(raw as string | null | undefined)).toBeNull());
});

describe("effective level = lower of (client's choice, level implied by training time)", () => {
  it("under 2 years caps intermediate and advanced at Początkujący", () => {
    for (const chosen of ["Średniozaawansowany", "Zaawansowany"]) {
      expect(resolveEffectiveLevel(chosen, "1 rok")).toMatchObject({ chosen, effective: "Początkujący", capped: true });
    }
  });
  it("2 years or more keeps the choice", () => {
    expect(resolveEffectiveLevel("Zaawansowany", "2 lata")).toMatchObject({ effective: "Zaawansowany", capped: false });
    expect(resolveEffectiveLevel("Średniozaawansowany", "4 lata").effective).toBe("Średniozaawansowany");
  });
  it("never raises a level: beginners and no-activity stay as chosen", () => {
    expect(resolveEffectiveLevel("Początkujący", "10 lat").effective).toBe("Początkujący");
    expect(resolveEffectiveLevel("Brak aktywności fizycznej", "1 rok")).toMatchObject({
      effective: "Brak aktywności fizycznej", capped: false,
    });
  });
  it("unknown training time keeps the choice (no silent change)", () => {
    expect(resolveEffectiveLevel("Zaawansowany", "").effective).toBe("Zaawansowany");
    expect(resolveEffectiveLevel("Zaawansowany", "od dawna").capped).toBe(false);
    expect(resolveEffectiveLevel("Zaawansowany", null).effective).toBe("Zaawansowany");
  });
  it("trainer override wins, in both directions", () => {
    expect(resolveEffectiveLevel("Zaawansowany", "1 rok", "Zaawansowany")).toMatchObject({
      effective: "Zaawansowany", overridden: true, capped: false,
    });
    expect(resolveEffectiveLevel("Zaawansowany", "5 lat", "Początkujący").effective).toBe("Początkujący");
  });
  it("warning text: 'Klient wybrał X, staż Y — plan jako Z'", () => {
    expect(effectiveLevelWarning(resolveEffectiveLevel("Zaawansowany", "1 rok"))).toContain(
      "Klient wybrał „Zaawansowany”, staż 1 rok — plan jako „Początkujący”.",
    );
    expect(effectiveLevelWarning(resolveEffectiveLevel("Zaawansowany", "5 lat"))).toBeNull();
    expect(effectiveLevelWarning(resolveEffectiveLevel("Zaawansowany", "1 rok", "Średniozaawansowany"))).toContain(
      "ustawionego przez trenera",
    );
  });
});
