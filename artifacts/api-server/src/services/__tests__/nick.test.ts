import { describe, it, expect } from "vitest";
import { checkNick, isBadNick, isReservedNick, nextNickChangeAt, nickKey, trainerLookalikeCore } from "../nick";

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

describe("nicki prawie identyczne (klucz)", () => {
  it("wielkość liter oraz _ i . nie tworzą osobnego nicka", () => {
    const k = nickKey("ola");
    for (const n of ["Ola", "ola_", "o.l.a", "_ola_", "OLA.", "O_L.A"]) expect(nickKey(n), n).toBe(k);
  });
  it("cyfry ROZRÓŻNIAJĄ nicki: kasia, kasia92, kasia2004 to trzy różne nicki", () => {
    const keys = ["kasia", "kasia92", "kasia2004", "Kasia_92", "kasia.2004"].map(nickKey);
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
    expect(keys[3]).toBe(keys[1]); // ale kasia_92 to nadal kasia92
    expect(keys[4]).toBe(keys[2]);
    expect(nickKey("ola1")).not.toBe(nickKey("ola"));
    expect(nickKey("k0wal")).not.toBe(nickKey("kowal"));
  });
  it("różne nicki mają różne klucze", () => {
    expect(nickKey("ola")).not.toBe(nickKey("olaf"));
    expect(nickKey("marek")).not.toBe(nickKey("marcin"));
  });
});

describe("podobieństwo do nicka trenera (dopiski)", () => {
  it("wyciąga rdzeń z dopiskiem trener/trenerka/coach/pt/official z przodu lub z tyłu", () => {
    for (const [nick, core] of [["trener_ola", "ola"], ["Trenerka.Ola", "ola"], ["ola_trener", "ola"], ["coach_ola", "ola"], ["ola_pt", "ola"], ["official_ola", "ola"], ["trener_ola92", "ola92"]] as const) {
      expect(trainerLookalikeCore(nick), nick).toBe(core);
    }
  });
  it("bez dopiska albo przy zbyt krótkim rdzeniu: null", () => {
    for (const nick of ["ola", "kasia92", "ola_trenuje", "trener_ab", "systematyk"]) expect(trainerLookalikeCore(nick), nick).toBeNull();
  });
});

describe("nicki zarezerwowane", () => {
  it("admin, optimatren, trener, support, pomoc, moderator, root, system — także w wariantach", () => {
    for (const n of ["admin", "Admin", "admin_1", "a.d.m.i.n", "ADMIN99", "adm1n", "trener2004", "optimatren", "optimatren_pl", "Optimatren.support", "trener", "trener1", "support", "pomoc", "moderator", "root", "system", "administrator"]) {
      expect(isReservedNick(n), n).toBe(true);
      expect(checkNick(n), n).toMatchObject({ ok: false, code: "NICK_RESERVED" });
    }
  });
  it("zwykłe nicki, także zawierające słowo, ale nie będące nim, przechodzą", () => {
    for (const n of ["trener_ola", "ola_trenuje", "adminka_x", "systematyk"]) expect(isReservedNick(n), n).toBe(false);
  });
});

describe("zmiana nicka co 30 dni", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  it("pierwsze ustawienie wolne; potem blokada do 30 dni od zmiany", () => {
    expect(nextNickChangeAt(null, now)).toBeNull();
    expect(nextNickChangeAt(new Date("2026-10-25T12:00:00Z"), now)?.toISOString()).toBe("2026-11-24T12:00:00.000Z");
    expect(nextNickChangeAt(new Date("2026-10-05T12:00:00Z"), now)).toBeNull(); // minęło 30 dni
  });
});

