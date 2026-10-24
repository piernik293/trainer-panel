import { describe, it, expect } from "vitest";
import { jointWarningFromError, planJointWarningText, jointReplaceConfirmText, activationConfirmText } from "../jointWarning";

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

describe("planJointWarningText", () => {
  it("lista stawów małymi literami", () => {
    expect(planJointWarningText(["Bark", "Plecy — dół"])).toBe("To ćwiczenie obciąża zgłoszony staw: bark, plecy — dół");
  });
  it("bez listy — sama treść ostrzeżenia", () => {
    expect(planJointWarningText([])).toBe("To ćwiczenie obciąża zgłoszony staw");
  });
});

describe("jointReplaceConfirmText", () => {
  it("treść potwierdzenia zamiany", () => {
    expect(jointReplaceConfirmText("Arnold press", "Wyciskanie na maszynie nad głowę", "Ala Demo"))
      .toBe("Zamienić Arnold press na Wyciskanie na maszynie nad głowę w planie Ala Demo? Serie i powtórzenia zostaną.");
  });
  it("brak nazwy klienta → „klienta”", () => {
    expect(jointReplaceConfirmText("A", "B", null)).toBe("Zamienić A na B w planie klienta? Serie i powtórzenia zostaną.");
  });
});

describe("activationConfirmText", () => {
  it("inny aktywny plan klienta → informacja o archiwizacji", () => {
    expect(activationConfirmText("Plan demo — siła")).toBe("Aktywny plan Plan demo — siła zostanie zarchiwizowany. Historia treningów zostaje.");
  });
  it("brak innego aktywnego planu → dotychczasowa treść", () => {
    expect(activationConfirmText(null)).toBe("Aktywować plan? Po aktywacji nie będzie można zmieniać jego struktury.");
  });
});
