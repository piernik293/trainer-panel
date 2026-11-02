import { describe, it, expect } from "vitest";
import { tabLabel } from "../pages/Admin";

describe("licznik nowych wniosków na karcie administratora", () => {
  it("pokazuje liczbę tylko przy „Wnioskach” i tylko gdy są oczekujące", () => {
    expect(tabLabel({ id: "applications", label: "Wnioski" }, 2)).toBe("Wnioski (2)");
    expect(tabLabel({ id: "applications", label: "Wnioski" }, 0)).toBe("Wnioski");
    expect(tabLabel({ id: "errors", label: "Błędy" }, 5)).toBe("Błędy");
  });
});
