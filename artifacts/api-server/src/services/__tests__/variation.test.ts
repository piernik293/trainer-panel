import { describe, it, expect } from "vitest";
import { variationSeed, seededIndex, hash32 } from "../variation";
import { selectWarmup, selectCooldown, type CatalogueWarmupItem } from "../warmupSelection";

describe("zmienność planów", () => {
  it("ziarno jest powtarzalne, a zależy od konta i numeru planu", () => {
    expect(variationSeed("12", 1, 0)).toBe(variationSeed("12", 1, 0));
    expect(variationSeed("12", 1)).not.toBe(variationSeed("13", 1));
    expect(variationSeed("12", 1)).not.toBe(variationSeed("12", 2));
    expect(hash32("a")).not.toBe(hash32("b"));
  });
  it("indeks mieści się w zakresie i rozkłada się na różne wartości", () => {
    const seen = new Set<number>();
    for (let acc = 0; acc < 60; acc++) { const i = seededIndex(variationSeed(String(acc), 1), "push|slot", 3); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(3); seen.add(i); }
    expect(seen.size).toBe(3);
    expect(seededIndex(5, "x", 1)).toBe(0);
  });
  it("rozgrzewka i schłodzenie: różne konta — różne zestawy, to samo ziarno — ten sam; zasady bezpieczeństwa bez zmian", () => {
    const mk = (id: number, role: string, pattern: string, group: string, extra: Partial<CatalogueWarmupItem> = {}) => ({
      id, name: `Ćw ${id}`, role, movementPattern: pattern, mainMuscleGroup: group, secondaryMuscleGroups: [], equipment: [], trainingLocation: ["Siłownia"], hidden: false, reviewedByTrainer: true,
      suitableForNoActivity: true, learningDifficulty: 1, verificationStatus: "zweryfikowane", jointStressAreas: [], ...extra,
    }) as unknown as CatalogueWarmupItem;
    const cat = [
      mk(1, "rozgrzewka", "Aktywacja", "Barki"), mk(2, "rozgrzewka", "Aktywacja", "Barki"),
      ...Array.from({ length: 8 }, (_, i) => mk(10 + i, "rozgrzewka", "Mobilizacja", "Barki")),
      ...Array.from({ length: 10 }, (_, i) => mk(30 + i, "rozciąganie", "Rozciąganie", "Barki")),
      mk(99, "rozgrzewka", "Mobilizacja", "Barki"),
    ];
    const ctx = (seed?: number, pain: string[] = []) => ({ dayGroups: ["Barki"], level: "Początkujący", painAreas: new Set(pain), trainingLocation: "Siłownia", equipmentText: "", seed });
    const a = selectWarmup(cat, ctx(1)).map((x) => x.id), a2 = selectWarmup(cat, ctx(1)).map((x) => x.id);
    expect(a).toEqual(a2);
    const sets = new Set(Array.from({ length: 10 }, (_, s) => selectWarmup(cat, ctx(s + 1)).map((x) => x.id).join(",")));
    expect(sets.size).toBeGreaterThan(2);
    for (let s = 1; s < 20; s++) { expect(selectWarmup(cat.map((x) => (x.id === 99 ? ({ ...x, jointStressAreas: ["Bark"] } as typeof x) : x)), ctx(s, ["Bark"])).some((x) => x.id === 99)).toBe(false); expect(selectCooldown(cat, ctx(s)).every((x) => x.role === "rozciąganie")).toBe(true); }
    expect(new Set(Array.from({ length: 10 }, (_, s) => selectCooldown(cat, ctx(s + 1)).map((x) => x.id).join(","))).size).toBeGreaterThan(2);
  });
});
