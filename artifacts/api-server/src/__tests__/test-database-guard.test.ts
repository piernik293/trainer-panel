import { describe, it, expect } from "vitest";
import { assertTestDatabase, databaseNameOf, isTestDatabaseUrl } from "../../test-guard";

describe("zabezpieczenie: testy API tylko na bazie *_test", () => {
  it("baza testowa jest dozwolona", () => {
    expect(isTestDatabaseUrl("postgresql://u:p@localhost:5432/trainer_panel_test")).toBe(true);
    expect(() => assertTestDatabase("postgresql://u:p@localhost:5432/trainer_panel_test?sslmode=disable")).not.toThrow();
  });
  it("baza aplikacji, brak adresu i śmieci są odrzucane z czytelnym komunikatem", () => {
    for (const url of ["postgresql://u:p@localhost:5432/trainer_panel", "postgresql://u:p@localhost:5432/test_trainer_panel", "postgresql://u:p@localhost:5432/", "", undefined, "to nie jest adres"]) {
      expect(isTestDatabaseUrl(url), String(url)).toBe(false);
      expect(() => assertTestDatabase(url), String(url)).toThrow(/odmawiają startu.*scripts\/test-api\.sh/s);
    }
  });
  it("nazwa bazy jest czytana z adresu, a hasło nie trafia do komunikatu", () => {
    expect(databaseNameOf("postgresql://u:sekret@h:5432/trainer_panel_test")).toBe("trainer_panel_test");
    try { assertTestDatabase("postgresql://u:sekret@h:5432/trainer_panel"); } catch (e) { expect(String(e)).not.toContain("sekret"); }
  });
  it("uruchomiony zestaw naprawdę działa na bazie *_test", () => {
    expect(isTestDatabaseUrl(process.env.DATABASE_URL)).toBe(true);
  });
});
