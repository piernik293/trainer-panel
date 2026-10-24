import { describe, it, expect } from "vitest";
import { jointWarningFromError } from "../jointWarning";

describe("jointWarningFromError", () => {
  it("zwraca treść ostrzeżenia z odpowiedzi 409 EXERCISE_LOADS_REPORTED_JOINT", () => {
    const err = Object.assign(new Error("x"), {
      status: 409,
      data: { code: "EXERCISE_LOADS_REPORTED_JOINT", error: "Klient zgłosił ból: bark. To ćwiczenie obciąża bark. Dodać mimo to?" },
    });
    expect(jointWarningFromError(err)).toBe("Klient zgłosił ból: bark. To ćwiczenie obciąża bark. Dodać mimo to?");
  });

  it("inne błędy (np. niezgodny sprzęt, sieć) nie otwierają ostrzeżenia", () => {
    expect(jointWarningFromError(Object.assign(new Error("x"), { data: { code: "EXERCISE_INCOMPATIBLE_WITH_CLIENT_PROFILE" } }))).toBeNull();
    expect(jointWarningFromError(new Error("sieć"))).toBeNull();
    expect(jointWarningFromError(null)).toBeNull();
  });

  it("brak tekstu z serwera → neutralny tekst zastępczy", () => {
    expect(jointWarningFromError({ data: { code: "EXERCISE_LOADS_REPORTED_JOINT" } })).toMatch(/Dodać mimo to\?$/);
  });
});
