import { describe, it, expect } from "vitest";
import { initialsOf, longDate, shownName, trainsSinceLabel, weekCircles, kgLabel } from "./helpers";
import { drawStory, storyTexts, type StoryData } from "./story";
import { nextAchievement, type CatalogueItem } from "./achievements";
import { storyDataFor } from "@/components/v2/FinishV2";
import type { Summary } from "@/components/training/TrainingFlow";
import type { TrainingDay } from "@/lib/training/types";

describe("helpery ekranów v2", () => {
  it("data: WTOREK, 3 LISTOPADA", () => { expect(longDate(new Date(2026, 10, 3))).toBe("WTOREK, 3 LISTOPADA"); });
  it("„trenuje od października”; brak danych → null", () => { expect(trainsSinceLabel("2026-10")).toBe("trenuje od października"); expect(trainsSinceLabel(null)).toBeNull(); });
  it("kółka tygodnia: tyle, ile treningów w planie; zrobione od początku; nigdy więcej niż cel", () => {
    expect(weekCircles(1, 3)).toEqual(["done", "planned", "planned"]);
    expect(weekCircles(5, 3)).toEqual(["done", "done", "done"]);
    expect(weekCircles(0, 0)).toEqual([]);
  });
  it("nazwa: nick > nazwa wyświetlana > imię; inicjały", () => {
    expect(shownName({ nick: "ShiiFuu", displayName: "Shii", firstName: "Anna" })).toBe("ShiiFuu");
    expect(shownName({ nick: null, displayName: "Shii", firstName: "Anna" })).toBe("Shii");
    expect(shownName({ nick: " ", displayName: null, firstName: "Anna" })).toBe("Anna");
    expect(initialsOf("ShiiFuu")).toBe("SH"); expect(initialsOf("Anna Nowak")).toBe("AN");
  });
  it("kg z odstępem tysięcy", () => { expect(kgLabel(3240)).toBe("3 240"); });
  it("następne osiągnięcie = najbliższe progu", () => {
    const mk = (id: string, v: number, t: number): CatalogueItem => ({ id, kind: "milestone", title: id, hint: "", state: "progress", progress: { value: v, target: t }, earnedAt: null, seen: true });
    expect(nextAchievement([mk("a", 1, 10), mk("b", 8, 10), mk("c", 3, 4)])?.id).toBe("b");
    expect(nextAchievement([])).toBeNull();
  });
});

const DAY = { name: "Góra ciała", cooldown: [], warmup: [], exercises: [] } as unknown as TrainingDay;
const SUM: Summary = { minutes: 48, sets: 15, kg: 3240, reps: 130, hadPain: false, weekDone: 2, weekTarget: 3, records: [{ name: "Wyciskanie hantli leżąc", weightKg: 24, reps: 8, gainKg: 2 }] };

function fakeCtx() {
  const texts: string[] = [];
  const noop = () => {};
  const ctx = new Proxy({ fillText: (t: string) => texts.push(t), measureText: () => ({ width: 10 }) } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : noop), set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

describe("story 9:16 — prywatność", () => {
  const private_ = ["ból", "bol", "Kowalska", "Anna", "kg ciała", "waga", "zdrow", "staw", "kontuz"];
  it("na obrazku jest tylko to, co dozwolone: logo, dzień, trening, czas, kg, serie, rekord, seria, nick", () => {
    const d = storyDataFor(DAY, SUM, { streakWeeks: 4, nick: "shiifuu" }, new Date(2026, 10, 3));
    const { ctx, texts } = fakeCtx();
    drawStory(ctx, d);
    const all = texts.join(" | ");
    expect(all).toContain("WTOREK · TRENING"); expect(all).toContain("Góra ciała"); expect(all).toContain("48 min"); expect(all).toContain("3 240 kg");
    expect(all).toContain("NOWY REKORD") ; expect(all).toContain("4 tygodnie z rzędu · @shiifuu");
    for (const w of private_) expect(all.toLowerCase()).not.toContain(w.toLowerCase());
    expect(Object.keys(d).sort()).toEqual(["goldenBull", "kg", "minutes", "nick", "record", "reps", "sets", "streakWeeks", "title", "weekDone", "weekTarget", "weekday"]);
  });
  it("po zgłoszeniu bólu: bez rekordu na obrazku", () => {
    const d = storyDataFor(DAY, { ...SUM, hadPain: true }, { streakWeeks: 4, nick: "shiifuu" });
    expect(d.record).toBeNull();
    expect(storyTexts(d).join(" ")).not.toContain("REKORD");
  });
  it("bez nicka — bez podpisu (tylko seria); bez serii i nicka — bez podpisu w ogóle", () => {
    expect(storyTexts(storyDataFor(DAY, SUM, { streakWeeks: 4, nick: null })).join("|")).not.toContain("@");
    const none = storyTexts(storyDataFor(DAY, SUM, { streakWeeks: null, nick: "  " }));
    expect(none.join("|")).not.toMatch(/z rzędu|@/);
  });
  it("ćwiczenia bez ciężaru: zamiast kg są powtórzenia", () => {
    const d = storyDataFor(DAY, { ...SUM, kg: 0 }, { streakWeeks: null, nick: null });
    expect(d.kg).toBeNull();
    expect(storyTexts(d)).toContain("Powtórzenia");
  });
  it("Złoty Byczek na story: tylko znaczek (flaga), bez numeru i bez tekstu; bez flagi nie ma znaczka", () => {
    const withBull = storyDataFor(DAY, SUM, { streakWeeks: 4, nick: "shiifuu", goldenBull: true }, new Date(2026, 10, 3));
    expect(withBull.goldenBull).toBe(true);
    expect(storyDataFor(DAY, SUM, { streakWeeks: 4, nick: "x" }).goldenBull).toBe(false);
    const { ctx, texts } = fakeCtx();
    drawStory(ctx, withBull);
    expect(texts.join(" | ").toLowerCase()).not.toMatch(/byczek|#\d/); // znaczek jest rysunkiem, nie tekstem
  });
  it("StoryData nie ma pól na imię, nazwisko, wagę ciała ani ból", () => {
    const keys: (keyof StoryData)[] = ["weekday", "title", "minutes", "kg", "reps", "sets", "record", "streakWeeks", "weekDone", "weekTarget", "nick", "goldenBull"];
    expect(keys.join(",")).not.toMatch(/name|weight|pain|health|email/i);
  });
});
