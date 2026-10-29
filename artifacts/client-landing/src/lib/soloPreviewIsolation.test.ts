import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Strona podglądu jest importowana przez App.tsx. Gdyby podmiana window.fetch była na poziomie modułu, zepsułaby wszystkie
// wywołania API w całym portalu (w produkcji też) — dlatego musi siedzieć wyłącznie w bloku „tylko strona podglądu”.
describe("podgląd Solo nie psuje fetch w całym portalu", () => {
  const src = readFileSync(join(__dirname, "../pages/solo-preview.tsx"), "utf8");
  it("podmiana window.fetch jest tylko wewnątrz warunku strony /solo-preview", () => {
    const at = src.indexOf("window.fetch = ");
    expect(at).toBeGreaterThan(-1);
    expect(src.indexOf("window.fetch = ", at + 1)).toBe(-1);
    const guard = src.lastIndexOf("if (isSoloPreviewPath()) {", at);
    expect(guard).toBeGreaterThan(-1);
    expect(src.slice(guard, at)).not.toMatch(/\n}\n/); // blok warunku nie został zamknięty przed podmianą
  });
  it("podgląd działa tylko w trybie dev i na ścieżce /solo-preview", () => {
    expect(src).toMatch(/import\.meta\.env\.DEV[^;]*endsWith\("\/solo-preview"\)/);
  });
});
