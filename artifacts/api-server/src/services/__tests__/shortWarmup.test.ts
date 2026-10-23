import { describe, it, expect } from "vitest";
import { buildShortWarmup, SHORT_WARMUP_ITEMS, type DayType } from "../rampWarmup";

const DAYS: DayType[] = ["upper", "lower", "full"];
const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];

describe("short warm-up: 5 exercises, about 7 minutes", () => {
  for (const day of DAYS) {
    for (const level of LEVELS) {
      it(`${day} / ${level}: ${SHORT_WARMUP_ITEMS} distinct exercises, 6–8 min`, () => {
        const w = buildShortWarmup(day, level);
        expect(w.items).toHaveLength(SHORT_WARMUP_ITEMS);
        expect(new Set(w.items.map((i) => i.name)).size).toBe(SHORT_WARMUP_ITEMS);
        expect(w.minutes).toBeGreaterThanOrEqual(6);
        expect(w.minutes).toBeLessThanOrEqual(8);
        for (const i of w.items) expect(i.detail.length).toBeGreaterThan(0);
      });
    }
  }
  it("the raise item is shown as 2 min", () => {
    expect(buildShortWarmup("upper", "Średniozaawansowany").items[0]!.detail).toBe("2 min");
  });
});

describe("safety filters for beginners", () => {
  const COMPLEX = ["Pompki (tempo 2-1-1)", "Przysiad z własnym ciężarem (tempo 3-1-1)", "Wykrok w miejscu"];
  const IMPACT = ["Jumping jacks", "Skoki na skakance lub jumping jacks"];
  it("beginners never get items that need technique or balance", () => {
    for (const day of DAYS) for (const level of ["Początkujący", "Brak aktywności fizycznej"]) {
      for (const i of buildShortWarmup(day, level).items) expect(COMPLEX, `${day}/${level}: ${i.name}`).not.toContain(i.name);
    }
  });
  it("'Brak aktywności fizycznej': no impact and no potentiation items", () => {
    for (const day of DAYS) {
      const names = buildShortWarmup(day, "Brak aktywności fizycznej").items.map((i) => i.name);
      for (const n of [...IMPACT, ...COMPLEX, "Pompki", "Face pull z gumą", "Przysiad z własnym ciężarem"]) expect(names).not.toContain(n);
    }
  });
  it("experienced clients may get the potentiation item", () => {
    const names = DAYS.flatMap((d) => buildShortWarmup(d, "Zaawansowany").items.map((i) => i.name));
    expect(names.some((n) => COMPLEX.includes(n))).toBe(true);
  });
  it("an unknown level is treated like experienced (everything allowed) but still 5 items", () => {
    expect(buildShortWarmup("full", null).items).toHaveLength(5);
  });
});
