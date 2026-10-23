import { describe, it, expect } from "vitest";
import { WARMUP_CATALOGUE } from "../../seeds/warmupCatalogueData";
import {
  selectWarmup, selectCooldown, jointsFromText, reportedJoints, formatAmount, estimateMinutes,
  type CatalogueWarmupItem, type SelectionContext,
} from "../warmupSelection";

let id = 1000;
const catalogue: CatalogueWarmupItem[] = WARMUP_CATALOGUE.map((e) => ({
  id: id++, name: e.name, role: e.role, mainMuscleGroup: e.main, secondaryMuscleGroups: e.secondary, movementPattern: e.pattern,
  learningDifficulty: e.learning, suitableForNoActivity: e.suitable, verificationStatus: e.suitable === true ? "zweryfikowane" : "do_weryfikacji",
  jointStressAreas: e.joints, equipment: e.equipment, equipmentDetail: e.nr === 15 ? ["Rower stacjonarny"] : [],
  trainingLocation: e.location, defaultReps: e.reps, defaultDurationSeconds: e.secs, perSide: e.perSide, executionInstructions: e.instr,
}));
const byNr = (nr: number) => catalogue[WARMUP_CATALOGUE.findIndex((e) => e.nr === nr)]!;
const names = (items: CatalogueWarmupItem[]) => items.map((i) => i.name);

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  dayGroups: ["Klatka piersiowa", "Barki", "Triceps"], level: "Średniozaawansowany", painAreas: new Set(), trainingLocation: "Siłownia",
  equipmentText: "Hantle, Gumy oporowe", ...over,
});

describe("the approved list in the catalogue data", () => {
  it("28 entries; #28 and the joint tags as approved", () => {
    expect(WARMUP_CATALOGUE).toHaveLength(28);
    const joints = (nr: number) => WARMUP_CATALOGUE.find((e) => e.nr === nr)!.joints;
    for (const nr of [7, 8, 20, 27]) expect(joints(nr)).toContain("Kolano");
    for (const nr of [2, 12]) expect(joints(nr)).toContain("Bark");
    expect(joints(12)).toContain("Nadgarstek");
    for (const nr of [4, 26]) expect(joints(nr)).toContain("Plecy — dół");
    const w = WARMUP_CATALOGUE.find((e) => e.nr === 28)!;
    expect(w).toMatchObject({ name: "Wymachy nóg (w przód i w bok)", role: "rozgrzewka", main: "Mięśnie dwugłowe uda", reps: 10, perSide: true, suitable: true, learning: 1 });
    expect(w.secondary).toEqual(expect.arrayContaining(["Pośladki", "Odwodziciele"]));
    expect(w.instr).toMatch(/ścian/);
    const ten = WARMUP_CATALOGUE.find((e) => e.nr === 10)!;
    expect(ten.existingSlug).toBe("rozciaganie-gumy-przed-klatka-band-pull-apart"); // existing row, no duplicate
    expect(new Set(WARMUP_CATALOGUE.map((e) => e.slug)).size).toBe(28);
  });
});

describe("warm-up: 1 general + 2–3 for the day + 1 activation", () => {
  it("5 items for an upper-body day: march first, day items, activation last", () => {
    const w = selectWarmup(catalogue, ctx());
    expect(w.length).toBeGreaterThanOrEqual(4);
    expect(w.length).toBeLessThanOrEqual(5);
    expect(w[0]!.name).toBe("Marsz w miejscu");
    expect(w[w.length - 1]!.movementPattern).toBe("Aktywacja");
    const day = w.slice(1, -1);
    expect(day.length).toBeGreaterThanOrEqual(2);
    expect(day.length).toBeLessThanOrEqual(3);
    for (const i of day) expect([i.mainMuscleGroup, ...i.secondaryMuscleGroups].some((g) => ctx().dayGroups.includes(g))).toBe(true);
    expect(new Set(w.map((i) => i.id)).size).toBe(w.length);
  });
  it("a lower-body day gets lower-body items and the glute bridge as activation", () => {
    const w = selectWarmup(catalogue, ctx({ dayGroups: ["Mięśnie czworogłowe uda", "Pośladki", "Mięśnie dwugłowe uda"] }));
    expect(w[w.length - 1]!.name).toBe("Mostek pośladkowy");
    expect(names(w).some((n) => /Przysiad|Wykroki|Wymachy/.test(n))).toBe(true);
  });
  it("the exercise bike is the general item only when the client has one", () => {
    expect(selectWarmup(catalogue, ctx())[0]!.name).toBe("Marsz w miejscu");
    expect(selectWarmup(catalogue, ctx({ equipmentText: "Hantle, Rower stacjonarny / orbitrek, Gumy oporowe" }))[0]!.name).toBe("Rowerek stacjonarny (lekki)");
  });
  it("bands the client does not have are never offered", () => {
    const all = names(selectWarmup(catalogue, ctx({ equipmentText: "Hantle" })));
    expect(all).not.toContain("Rotacje zewnętrzne z gumą");
    expect(all.join(" ")).not.toMatch(/Band Pull-Apart/);
  });
});

describe("cool-down: 3–4 stretches for the day's groups", () => {
  it("upper day", () => {
    const c = selectCooldown(catalogue, ctx());
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.length).toBeLessThanOrEqual(4);
    expect(c.every((i) => i.role === "rozciąganie")).toBe(true);
    expect(names(c)).toContain("Rozciąganie klatki przy ścianie");
  });
  it("is filled up to 3 when the day matches little", () => {
    expect(selectCooldown(catalogue, ctx({ dayGroups: ["Całe ciało"] })).length).toBeGreaterThanOrEqual(3);
  });
});

describe("safety: inactive and beginners — only suitableForNoActivity and difficulty <= 2", () => {
  for (const level of ["Brak aktywności fizycznej", "Początkujący"]) {
    for (const dayGroups of [["Klatka piersiowa", "Barki"], ["Mięśnie czworogłowe uda", "Pośladki"], ["Plecy", "Biceps"], ["Całe ciało"]]) {
      it(`${level} / ${dayGroups.join(", ")}`, () => {
        const c = ctx({ level, dayGroups });
        for (const i of [...selectWarmup(catalogue, c), ...selectCooldown(catalogue, c)]) {
          expect(i.suitableForNoActivity, i.name).toBe(true);
          expect(i.learningDifficulty!, i.name).toBeLessThanOrEqual(2);
          expect(i.verificationStatus, i.name).not.toBe("do_weryfikacji");
        }
      });
    }
  }
  it("'Wykroki chodzone (rozgrzewka)' (not confirmed for inactive clients) is offered to experienced clients only", () => {
    const lower = { dayGroups: ["Mięśnie czworogłowe uda", "Pośladki"] };
    expect(names(selectWarmup(catalogue, ctx({ ...lower, level: "Początkujący" })))).not.toContain("Wykroki chodzone (rozgrzewka)");
    const exp = [0, 1, 2].flatMap(() => names(selectWarmup(catalogue, ctx({ ...lower, level: "Zaawansowany" }))));
    expect(exp.length).toBeGreaterThan(0);
  });
});

describe("joint pain: the exercise is never offered (interview or a report during a workout)", () => {
  const KNEE = [7, 8, 20, 27], SHOULDER = [2, 12], WRIST = [12], LOWBACK = [4, 26];
  const cases: [string, number[]][] = [["Kolano", KNEE], ["Bark", SHOULDER], ["Nadgarstek", WRIST], ["Plecy — dół", LOWBACK]];
  for (const [joint, nrs] of cases) {
    it(`${joint}: items ${nrs.join(", ")} are excluded from warm-up and cool-down on every kind of day`, () => {
      const forbidden = nrs.map((n) => byNr(n).name);
      for (const level of ["Zaawansowany", "Początkujący"]) {
        for (const dayGroups of [["Klatka piersiowa", "Barki", "Triceps"], ["Mięśnie czworogłowe uda", "Pośladki"], ["Plecy", "Brzuch"], ["Całe ciało"]]) {
          const c = ctx({ level, dayGroups, painAreas: new Set([joint]) });
          for (const n of names([...selectWarmup(catalogue, c), ...selectCooldown(catalogue, c)])) expect(forbidden, `${joint}/${level}: ${n}`).not.toContain(n);
        }
      }
    });
    it(`${joint}: without a report the same items can be chosen (the filter is what removes them)`, () => {
      const seen = new Set<string>();
      for (const dayGroups of [["Klatka piersiowa", "Barki", "Triceps"], ["Mięśnie czworogłowe uda", "Pośladki"], ["Plecy", "Brzuch"]]) {
        const c = ctx({ level: "Zaawansowany", dayGroups });
        names([...selectWarmup(catalogue, c), ...selectCooldown(catalogue, c)]).forEach((n) => seen.add(n));
      }
      expect(nrs.some((n) => seen.has(byNr(n).name))).toBe(true);
    });
  }
  it("joints are read from the interview text and from pain-report areas", () => {
    expect(jointsFromText("Ból kolan przy schodzeniu, bark po urazie, czasem nadgarstki")).toEqual(expect.arrayContaining(["Kolano", "Bark", "Nadgarstek"]));
    expect(jointsFromText("ból odcinka lędźwiowego")).toContain("Plecy — dół");
    expect(jointsFromText("brak")).toEqual([]);
    const set = reportedJoints("problem z kolanami", ["Bark", "Inne"]);
    expect([...set].sort()).toEqual(["Bark", "Kolano"]);
  });
});

describe("amount shown as information", () => {
  it("formats repetitions, seconds, per side, minutes", () => {
    expect(formatAmount(byNr(2))).toBe("10 × na stronę");
    expect(formatAmount(byNr(13))).toBe("20 s");
    expect(formatAmount(byNr(16))).toBe("30 s na stronę");
    expect(formatAmount(byNr(15))).toBe("ok. 4 min");
    expect(formatAmount(byNr(9))).toBe("12 ×");
  });
  it("minutes estimate is a few minutes for a typical warm-up", () => {
    const m = estimateMinutes(selectWarmup(catalogue, ctx()));
    expect(m).toBeGreaterThanOrEqual(3);
    expect(m).toBeLessThanOrEqual(9);
  });
});
