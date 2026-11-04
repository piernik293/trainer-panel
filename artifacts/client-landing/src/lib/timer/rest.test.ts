import { describe, it, expect } from "vitest";
import { adjustRest, cheerFor, CHEERS, formatClock, parseRestSeconds, remainingSeconds, restSecondsFor, startRest } from "./rest";

describe("przerwa z planu", () => {
  it("parsuje sekundy, minuty, „ok.”, przecinek i zakresy", () => {
    expect(parseRestSeconds("90 s")).toBe(90);
    expect(parseRestSeconds("ok. 90 s")).toBe(90);
    expect(parseRestSeconds("2 min")).toBe(120);
    expect(parseRestSeconds("1,5 min")).toBe(90);
    expect(parseRestSeconds("60–90 s")).toBe(75);
    expect(parseRestSeconds("2-3 min")).toBe(150);
    expect(parseRestSeconds("brak")).toBeNull();
    expect(parseRestSeconds("")).toBeNull();
    expect(parseRestSeconds("5 s")).toBeNull(); // poniżej minimum
  });
  it("domyślnie: 90 s z ciężarem, 60 s bez ciężaru / izometria", () => {
    expect(restSecondsFor({ restText: "", showWeight: true })).toBe(90);
    expect(restSecondsFor({ restText: "", showWeight: false })).toBe(60);
    expect(restSecondsFor({ restText: "", showWeight: true, timed: true })).toBe(60);
    expect(restSecondsFor({ restText: "2 min", showWeight: false })).toBe(120);
  });
});

describe("odliczanie od znacznika czasu", () => {
  it("czas liczony z endsAt: po „zgaszeniu ekranu” pokazuje prawidłową wartość", () => {
    const s = startRest(90, "Seria 2 z 3", 1_000_000);
    expect(remainingSeconds(s, 1_000_000)).toBe(90);
    expect(remainingSeconds(s, 1_000_000 + 30_000)).toBe(60);
    expect(remainingSeconds(s, 1_000_000 + 89_100)).toBe(1);
    expect(remainingSeconds(s, 1_000_000 + 400_000)).toBe(0); // nigdy ujemny
  });
  it("±15 s: zmiana od teraz, nie poniżej 0 i nie powyżej 10 min", () => {
    const s = startRest(90, "x", 0);
    expect(remainingSeconds(adjustRest(s, 15, 30_000), 30_000)).toBe(75);
    expect(remainingSeconds(adjustRest(s, -15, 30_000), 30_000)).toBe(45);
    expect(remainingSeconds(adjustRest(s, -15, 80_000), 80_000)).toBe(0);
    expect(remainingSeconds(adjustRest(startRest(590, "x", 0), 15, 0), 0)).toBe(600);
  });
  it("zegar mm:ss i teksty zachęty bez form zależnych od płci, rotujące", () => {
    expect(formatClock(75)).toBe("1:15"); expect(formatClock(9)).toBe("0:09");
    expect(new Set([1, 2, 3, 4].map(cheerFor)).size).toBe(CHEERS.length);
    for (const c of CHEERS) expect(c).not.toMatch(/(łeś|łaś|eś |aś )/);
  });
});
