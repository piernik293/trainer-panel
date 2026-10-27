import { describe, it, expect } from "vitest";
import { dayFocusLabel } from "@workspace/survey-config";

describe("etykieta rodzaju dnia", () => {
  it("klucze techniczne z kreatora są po polsku", () => {
    expect(dayFocusLabel("upper")).toBe("Góra ciała");
    expect(dayFocusLabel("lower")).toBe("Dół ciała");
    expect(dayFocusLabel("full_body")).toBe("Całe ciało");
    expect(dayFocusLabel("FULL_BODY_A")).toBe("Całe ciało A");
  });
  it("tekst wpisany przez trenera zostaje, nieznany klucz nie wygląda technicznie, pusty to null", () => {
    expect(dayFocusLabel("Góra ciała")).toBe("Góra ciała");
    expect(dayFocusLabel("some_new_key")).toBe("Some new key");
    expect(dayFocusLabel("  ")).toBeNull();
    expect(dayFocusLabel(null)).toBeNull();
  });
});
