import { describe, it, expect } from "vitest";
import { canSendFeedback, FEEDBACK_KINDS, FEEDBACK_MAX } from "../feedback";

describe("„Zgłoś uwagę” — kiedy można wysłać", () => {
  it("potrzebny rodzaj i niepusta treść do 1000 znaków", () => {
    expect(canSendFeedback(null, "tekst", false)).toBe(false);
    expect(canSendFeedback("blad", "   ", false)).toBe(false);
    expect(canSendFeedback("blad", "coś nie działa", false)).toBe(true);
    expect(canSendFeedback("pomysl", "x".repeat(FEEDBACK_MAX), false)).toBe(true);
    expect(canSendFeedback("pomysl", "x".repeat(FEEDBACK_MAX + 1), false)).toBe(false);
  });
  it("w trakcie wysyłania przycisk jest zablokowany", () => {
    expect(canSendFeedback("blad", "coś nie działa", true)).toBe(false);
  });
  it("trzy rodzaje: błąd, pomysł, niejasne", () => {
    expect(FEEDBACK_KINDS.map((k) => k.label)).toEqual(["Błąd", "Pomysł", "Niejasne"]);
  });
});
