import { describe, it, expect } from "vitest";
import { buildCatalogue, type EarnedRow } from "../achievementsCatalogue";

const row = (id: number, kind: string, key: string, title: string, at = "2026-11-01T10:00:00.000Z"): EarnedRow => ({ id, kind, key, title, body: null, earnedAt: at, seen: true });

describe("katalog osiągnięć (Postępy)", () => {
  it("nowe konto: nic zdobytego, jedno „w toku” na serię, reszta zablokowana; kolejność: zdobyte, w toku, zablokowane", () => {
    const c = buildCatalogue([], 0, 0);
    expect(c.earnedCount).toBe(0);
    const states = c.items.map((i) => i.state);
    expect(states).toEqual([...states].sort((a, b) => ["earned", "progress", "locked"].indexOf(a) - ["earned", "progress", "locked"].indexOf(b)));
    expect(c.items.filter((i) => i.state === "progress").map((i) => i.id)).toEqual(["milestone:1", "week_streak:2"]);
    expect(c.items.find((i) => i.id === "milestone:25")).toMatchObject({ state: "locked", progress: null }); // nazwa widoczna, bez paska
  });
  it("postęp do progu: 8 z 10 treningów, nigdy ponad próg", () => {
    const c = buildCatalogue([row(1, "milestone", "1", "Pierwszy trening za Tobą")], 8, 4);
    expect(c.items.find((i) => i.id === "milestone:10")).toMatchObject({ state: "progress", progress: { value: 8, target: 10 } });
    expect(c.items.find((i) => i.id === "milestone:1")).toMatchObject({ state: "earned", progress: null });
    expect(c.items.find((i) => i.id === "week_streak:4")).toBeDefined();
    const capped = buildCatalogue([], 99, 0).items.find((i) => i.state === "progress" && i.kind === "milestone")!.progress!;
    expect(capped.value).toBeLessThan(capped.target);
  });
  it("szczebel drabinki i pierwszy rekord liczą się jako zdobyte; liczba w katalogu rośnie o szczeble", () => {
    const base = buildCatalogue([], 0, 0).total;
    const c = buildCatalogue([row(2, "ladder_step", "pompki:3", "Nowy szczebel: Pompki klasyczne"), row(3, "record", "5:9", "Nowy rekord: Przysiad", "2026-10-01T10:00:00.000Z"), row(4, "record", "5:10", "Nowy rekord: Przysiad", "2026-11-02T10:00:00.000Z")], 3, 0);
    expect(c.total).toBe(base + 1);
    expect(c.items.find((i) => i.id === "ladder_step:pompki:3")).toMatchObject({ title: "Pompki klasyczne", state: "earned" });
    expect(c.items.find((i) => i.id === "record")).toMatchObject({ state: "earned" });
    expect(c.earnedCount).toBe(2);
  });
  it("w tekstach nie ma słów o utracie ani zawstydzania", () => {
    const text = buildCatalogue([], 0, 0).items.map((i) => `${i.title} ${i.hint}`).join(" ").toLowerCase();
    for (const w of ["strac", "utrac", "przepad", "zawied", "porażk"]) expect(text).not.toContain(w);
  });
});
