import { describe, it, expect } from "vitest";
import { VALID_EQUIPMENT } from "../routes/exercises";

describe("closed equipment list — Piłka lekarska", () => {
  it("is accepted by the exercise import validation next to the existing values", () => {
    expect(VALID_EQUIPMENT.has("Piłka lekarska")).toBe(true);
    for (const v of ["Piłka", "Gumy oporowe", "Masa własnego ciała", "Inny"]) expect(VALID_EQUIPMENT.has(v)).toBe(true);
  });
  it("unknown values stay rejected", () => {
    expect(VALID_EQUIPMENT.has("Piłka lekarska 5 kg")).toBe(false);
  });
});
