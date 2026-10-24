import { describe, it, expect } from "vitest";
import { volumeRowsLevel, mapToGuidelineLevel } from "../volumeCalculator";

describe("volumeRowsLevel — brak aktywności uses the beginner's weekly volume", () => {
  it("maps only 'Brak aktywności fizycznej' to 'Początkujący'; other levels unchanged", () => {
    expect(volumeRowsLevel("Brak aktywności fizycznej")).toBe("Początkujący");
    for (const l of ["Początkujący", "Średniozaawansowany", "Zaawansowany"] as const) expect(volumeRowsLevel(l)).toBe(l);
  });
  it("the client's own level is still reported as 'Brak aktywności fizycznej' (validation unchanged)", () => {
    expect(mapToGuidelineLevel("Brak aktywności fizycznej")).toBe("Brak aktywności fizycznej");
    expect(mapToGuidelineLevel("nieznany")).toBeNull();
  });
});
