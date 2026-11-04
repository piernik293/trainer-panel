import { describe, it, expect } from "vitest";
import { checkNick, isBadNick } from "../nick";

describe("nick", () => {
  it("poprawne: 3–20 znaków, litery/cyfry/_/., wolno @ na początku; puste = brak nicka", () => {
    expect(checkNick("ShiiFuu")).toEqual({ ok: true, nick: "ShiiFuu" });
    expect(checkNick("@ola_k.92")).toEqual({ ok: true, nick: "ola_k.92" });
    expect(checkNick("")).toEqual({ ok: true, nick: null });
    expect(checkNick(null)).toEqual({ ok: true, nick: null });
  });
  it("niepoprawne: za krótki/długi, spacje, polskie znaki, inne znaki, nie-tekst", () => {
    for (const bad of ["ab", "a".repeat(21), "ala ma", "żółw123", "ola-k", "ola!", 123]) expect(checkNick(bad).ok, String(bad)).toBe(false);
  });
  it("filtr wulgaryzmów łapie też zamienniki cyfrowe i separatory", () => {
    for (const bad of ["kurwa123", "Ch_u.j", "j3b4c", "f.u.c.k", "xxPIZDAxx"]) expect(isBadNick(bad), bad).toBe(true);
    for (const ok of ["ShiiFuu", "Kasia_92", "Marcin.fit"]) expect(isBadNick(ok), ok).toBe(false);
  });
});
