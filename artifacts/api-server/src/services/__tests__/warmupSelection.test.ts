import { describe, it, expect } from "vitest";
import { WARMUP_CATALOGUE } from "../../seeds/warmupCatalogueData";
import {
  selectWarmup, selectCooldown, rollerDayIndexes, isRollerDay, jointsFromText, reportedJoints, formatAmount, estimateMinutes,
  type CatalogueWarmupItem, type SelectionContext,
} from "../warmupSelection";

let id = 1000;
const catalogue: CatalogueWarmupItem[] = WARMUP_CATALOGUE.map((e) => ({
  id: id++, name: e.name, role: e.role, mainMuscleGroup: e.main, secondaryMuscleGroups: e.secondary, movementPattern: e.pattern,
  learningDifficulty: e.learning, suitableForNoActivity: e.suitable, verificationStatus: e.suitable === true ? "zweryfikowane" : "do_weryfikacji",
  jointStressAreas: e.joints, equipment: e.equipment, equipmentDetail: e.nr === 15 ? ["Rower stacjonarny"] : [],
  trainingLocation: e.location, defaultReps: e.reps, defaultDurationSeconds: e.secs, perSide: e.perSide, executionInstructions: e.instr,
}));
const extra = (over: Partial<CatalogueWarmupItem>): CatalogueWarmupItem => ({
  id: id++, name: "Dodatkowe", role: "rozciąganie", mainMuscleGroup: "Mięśnie czworogłowe uda", secondaryMuscleGroups: [], movementPattern: "Mobilizacja", learningDifficulty: 1,
  suitableForNoActivity: true, verificationStatus: "zweryfikowane", jointStressAreas: [], equipment: ["Masa własnego ciała"], equipmentDetail: [], trainingLocation: ["Siłownia", "Dom", "Plener"],
  defaultReps: null, defaultDurationSeconds: 30, perSide: false, executionInstructions: "", ...over,
});
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
  });
  it("hip and shoulder are recognised in every case form (regression: \"problem z biodrem\" was ignored, so hip-loading lunges reached the plan)", () => {
    for (const t of ["problem z biodrem", "ból biodra", "boli mnie w biodrze", "bóle w biodrach", "staw biodrowy", "operacja biodra"]) expect(jointsFromText(t), t).toContain("Biodro");
    for (const t of ["ból w ramieniu", "ból ramienia", "boli barku", "problem z barkiem"]) expect(jointsFromText(t), t).toContain("Bark");
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


describe("cool-down: roller, breathing, hidden and unreviewed items (blok 5)", () => {
  const roller = extra({ name: "Rolowanie przodu uda", equipment: ["Roller"], mainMuscleGroup: "Mięśnie czworogłowe uda" });
  const roller2 = extra({ name: "Rolowanie tyłu uda", equipment: ["Roller"], mainMuscleGroup: "Mięśnie czworogłowe uda" });
  const breath = extra({ name: "Oddech pudełkowy", movementPattern: "Oddychanie", mainMuscleGroup: "Brzuch" });
  const breath2 = extra({ name: "Wydłużony wydech", movementPattern: "Oddychanie", mainMuscleGroup: "Brzuch" });
  const lower = ["Mięśnie czworogłowe uda", "Pośladki"];
  const rolling = { rollerAllowed: true };
  it("roller only when the client ticked it or trains at a gym", () => {
    const withRoller = [...catalogue, roller];
    expect(names(selectCooldown(withRoller, ctx({ ...rolling, dayGroups: lower, trainingLocation: "Dom", equipmentText: "Hantle" })))).not.toContain("Rolowanie przodu uda");
    expect(names(selectCooldown(withRoller, ctx({ ...rolling, dayGroups: lower, trainingLocation: "Dom", equipmentText: "Hantle, Roller" })))).toContain("Rolowanie przodu uda");
    expect(names(selectCooldown(withRoller, ctx({ ...rolling, dayGroups: lower, trainingLocation: "Siłownia", equipmentText: "" })))).toContain("Rolowanie przodu uda");
  });
  it("at most one roller exercise per cool-down", () => {
    const c = selectCooldown([...catalogue, roller, roller2], ctx({ ...rolling, dayGroups: lower }));
    expect(c.filter((i) => i.equipment.includes("Roller")).length).toBeLessThanOrEqual(1);
  });
  it("rolling only on rolling days: never by default, at most 2 days of any week", () => {
    const withRoller = [...catalogue, roller, roller2];
    expect(names(selectCooldown(withRoller, ctx({ dayGroups: lower })))).not.toContain("Rolowanie przodu uda"); // default: no
    for (let total = 1; total <= 7; total++) {
      expect(rollerDayIndexes(total).length).toBeLessThanOrEqual(2);
      const days = Array.from({ length: total }, (_, d) =>
        selectCooldown(withRoller, ctx({ dayGroups: lower, rollerAllowed: isRollerDay(d, total) })).some((i) => i.equipment.includes("Roller")));
      expect(days.filter(Boolean).length).toBeGreaterThanOrEqual(1);
      expect(days.filter(Boolean).length).toBeLessThanOrEqual(2);
    }
  });
  it("no rolling for 'Brak aktywności fizycznej' (rollers are not marked suitable for them)", () => {
    const r = extra({ name: "Rolowanie", equipment: ["Roller"], suitableForNoActivity: false, mainMuscleGroup: "Mięśnie czworogłowe uda" });
    expect(names(selectCooldown([r], ctx({ ...rolling, dayGroups: lower, level: "Brak aktywności fizycznej" })))).toEqual([]);
  });
  it("breathing: none by default; with the setting on it is the last item (3 stretches + 1); skipped when none is eligible", () => {
    const pool = [...catalogue, breath, breath2];
    expect(selectCooldown(pool, ctx({ dayGroups: lower })).some((i) => i.movementPattern === "Oddychanie")).toBe(false);
    expect(selectCooldown(pool, ctx({ dayGroups: lower, breathing: false })).some((i) => i.movementPattern === "Oddychanie")).toBe(false);
    for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
      const c = selectCooldown(pool, ctx({ dayGroups: lower, breathing: true, level }));
      expect(c.length).toBeLessThanOrEqual(4);
      expect(c[c.length - 1]!.movementPattern).toBe("Oddychanie");
      expect(c.filter((i) => i.movementPattern === "Oddychanie")).toHaveLength(1);
    }
    expect(selectCooldown(catalogue, ctx({ dayGroups: lower, breathing: true })).some((i) => i.movementPattern === "Oddychanie")).toBe(false);
  });
  it("hidden items never; unreviewed items only for intermediate / advanced", () => {
    const hidden = extra({ name: "Ukryte", hidden: true });
    const unreviewed = extra({ name: "Niezweryfikowane", reviewedByTrainer: false, suitableForNoActivity: false });
    expect(names(selectCooldown([hidden], ctx({ dayGroups: lower })))).toEqual([]);
    expect(names(selectCooldown([unreviewed], ctx({ dayGroups: lower, level: "Zaawansowany" })))).toEqual(["Niezweryfikowane"]);
    expect(names(selectCooldown([unreviewed], ctx({ dayGroups: lower, level: "Początkujący" })))).toEqual([]);
    expect(names(selectCooldown([unreviewed], ctx({ dayGroups: lower, level: "Brak aktywności fizycznej" })))).toEqual([]);
  });
});
