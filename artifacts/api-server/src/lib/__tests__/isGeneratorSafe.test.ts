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

import { preferMainOverVariants } from "../exerciseRoles";
describe("preferMainOverVariants", () => {
  const main = { id: 1, parentExerciseId: null }, v = { id: 2, parentExerciseId: 1 }, other = { id: 3, parentExerciseId: 99 };
  it("odmiana odpada, gdy ćwiczenie główne jest w puli", () => { expect(preferMainOverVariants([main, v])).toEqual([main]); });
  it("odmiana zostaje, gdy głównego nie ma w puli (sprzęt miejsca, staw, poziom)", () => { expect(preferMainOverVariants([v, other])).toEqual([v, other]); });
  it("kilka odmian jednego głównego zostaje, gdy głównego brak", () => { const v2 = { id: 4, parentExerciseId: 1 }; expect(preferMainOverVariants([v, v2])).toEqual([v, v2]); });
});
