import { describe, it, expect } from "vitest";
import { isGeneratorSafe } from "../exerciseRoles";

const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];

describe("isGeneratorSafe", () => {
  it("ukryte nigdy, na żadnym poziomie", () => {
    for (const l of LEVELS) expect(isGeneratorSafe({ hidden: true, reviewedByTrainer: true }, l)).toBe(false);
  });
  it("niezweryfikowane tylko dla średniozaawansowanego i zaawansowanego", () => {
    const ex = { hidden: false, reviewedByTrainer: false };
    expect(LEVELS.map((l) => isGeneratorSafe(ex, l))).toEqual([false, false, true, true]);
    expect(isGeneratorSafe(ex, null)).toBe(false);
  });
  it("zweryfikowane i widoczne — dla każdego poziomu", () => {
    for (const l of LEVELS) expect(isGeneratorSafe({ hidden: false, reviewedByTrainer: true }, l)).toBe(true);
  });
  it("pliometria: nigdy BA/P; intensywność wysoka tylko zaawansowany", () => {
    const low = { reviewedByTrainer: true, intensity: "niska" };
    const high = { reviewedByTrainer: true, intensity: "wysoka" };
    expect(LEVELS.map((l) => isGeneratorSafe(low, l))).toEqual([false, false, true, true]);
    expect(LEVELS.map((l) => isGeneratorSafe(high, l))).toEqual([false, false, false, true]);
  });
});
