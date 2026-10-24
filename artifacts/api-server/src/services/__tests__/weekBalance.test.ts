import { describe, it, expect } from "vitest";
import { balanceWeek, type BalanceEntry, type Guideline } from "../weekBalance";
import { computeVolumeCore } from "../volumeCalculator";

// Muscles: 1 = klatka, 14 = triceps, 17 = prosty brzucha, 19 = poprzeczny brzucha.
const targets = new Map([
  [12, { name: "Klatka", type: "muscle", memberMuscleIds: new Set([1]) }],
  [7, { name: "Mięsień trójgłowy ramienia", type: "muscle", memberMuscleIds: new Set([14]) }],
  [11, { name: "Brzuch", type: "muscle", memberMuscleIds: new Set([17, 19]) }],
]);
const g = (abs: number): Guideline => ({ sessionMin: 1, sessionMax: 3, weeklyPreferredCeiling: abs, weeklyAbsoluteCeiling: abs });
const PUSHUP = 116, DIP = 900, PLANK = 5, CRUNCH = 6;
const assignments = new Map([
  [PUSHUP, new Map([[1, 1], [14, 0.5]])], // pompki: triceps pośrednio 0,5
  [DIP, new Map([[14, 1], [1, 0.5]])],
  [PLANK, new Map([[19, 1], [17, 0.5]])], // max-coefficient: liczy się 1, nie 1,5
  [CRUNCH, new Map([[17, 1]])],
]);
const pushups3x3 = (): BalanceEntry[] => [0, 1, 2].map((d) => ({ exerciseId: PUSHUP, sets: 3, exerciseClass: "main_compound", dayIndex: d }));

/** Exactly the activation rule: any target with ratio > 1.00 blocks activation. */
function activationBlocked(entries: BalanceEntry[], sets: number[], guidelines: Map<number, Guideline>) {
  return computeVolumeCore(
    entries.map((e, i) => ({ entryId: i, dayId: e.dayIndex, dayName: null, dayOrder: e.dayIndex, exerciseId: e.exerciseId, exerciseName: "", workingSets: sets[i] })),
    assignments, targets, guidelines, [...targets.keys()],
  ).filter((t) => t.status === "above_max_recommended" || t.status === "overtraining_warning").map((t) => t.targetName);
}

describe("balanceWeek — plan po wyrównaniu zawsze przechodzi aktywację", () => {
  it("pompki 3 × 3 serie: triceps 4,5 > 4 (obciążenie pośrednie) → jedna seria mniej, aktywacja przechodzi", () => {
    const entries = pushups3x3();
    const guidelines = new Map([[12, g(9)], [7, g(4)], [11, g(6)]]);
    expect(activationBlocked(entries, entries.map((e) => e.sets), guidelines)).toEqual(["Mięsień trójgłowy ramienia"]);
    const { sets, residual } = balanceWeek(entries, assignments, targets, guidelines);
    expect(sets).toEqual([2, 3, 3]);
    expect(residual).toEqual([]);
    expect(activationBlocked(entries, sets, guidelines)).toEqual([]);
  });

  it("partia zablokowana na minimum nie zatrzymuje wyrównania pozostałych (błąd planu demo #101)", () => {
    // Brzuch: crunch 1 seria × 2 dni = 2 > 1 i nie da się zejść niżej → wcześniej pętla kończyła się i triceps zostawał 4,5.
    const entries: BalanceEntry[] = [
      ...pushups3x3(),
      { exerciseId: CRUNCH, sets: 1, exerciseClass: "core", dayIndex: 0 },
      { exerciseId: CRUNCH, sets: 1, exerciseClass: "core", dayIndex: 1 },
    ];
    const guidelines = new Map([[12, g(9)], [7, g(4)], [11, g(1)]]);
    const { sets, residual } = balanceWeek(entries, assignments, targets, guidelines);
    expect(sets.slice(0, 3).reduce((a, b) => a + b, 0) * 0.5).toBeLessThanOrEqual(4);
    expect(residual.map((r) => r.targetName)).toEqual(["Brzuch"]); // niemożliwe bez usuwania ćwiczeń — zgłoszone, nie ukryte
    expect(activationBlocked(entries, sets, guidelines)).toEqual(["Brzuch"]);
  });

  it("faza 2: gdy minimum 2 serii ćwiczenia głównego nie wystarcza, schodzi do 1 serii", () => {
    const entries = pushups3x3();
    const guidelines = new Map([[12, g(9)], [7, g(2)], [11, g(6)]]); // 3 dni × 2 serie × 0,5 = 3 > 2
    const { sets, residual } = balanceWeek(entries, assignments, targets, guidelines);
    expect(sets.reduce((a, b) => a + b, 0) * 0.5).toBeLessThanOrEqual(2);
    expect(Math.min(...sets)).toBeGreaterThanOrEqual(1);
    expect(residual).toEqual([]);
    expect(activationBlocked(entries, sets, guidelines)).toEqual([]);
  });

  it("liczy jak aktywacja (max-coefficient): plank 3 × 2 = 6 przy limicie 6 — bez zbędnych redukcji", () => {
    const entries: BalanceEntry[] = [0, 1].map((d) => ({ exerciseId: PLANK, sets: 3, exerciseClass: "core", dayIndex: d }));
    const { sets } = balanceWeek(entries, assignments, targets, new Map([[12, g(9)], [7, g(4)], [11, g(6)]]));
    expect(sets).toEqual([3, 3]); // suma współczynników (1,5) dałaby 9 > 6 i obcięłaby serie bez potrzeby
  });

  it("najpierw ćwiczenia pomocnicze, potem główne; nigdy nie dodaje serii", () => {
    const entries: BalanceEntry[] = [
      { exerciseId: PUSHUP, sets: 3, exerciseClass: "main_compound", dayIndex: 0 },
      { exerciseId: DIP, sets: 3, exerciseClass: "isolation", dayIndex: 0 },
    ];
    const guidelines = new Map([[12, g(9)], [7, g(3)], [11, g(6)]]); // 1,5 + 3 = 4,5 > 3
    const { sets } = balanceWeek(entries, assignments, targets, guidelines);
    expect(sets[0]).toBe(3);
    expect(sets[1]).toBeLessThan(3);
    expect(activationBlocked(entries, sets, guidelines)).toEqual([]);
  });

  it("losowe szkice: po wyrównaniu aktywacja przechodzi albo nadwyżka jest zgłoszona przy 1 serii wszędzie", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const ids = [PUSHUP, DIP, PLANK, CRUNCH];
    const classes = ["main_compound", "secondary_compound", "isolation", "core"];
    for (let run = 0; run < 200; run++) {
      const entries: BalanceEntry[] = Array.from({ length: 2 + Math.floor(rnd() * 10) }, () => ({
        exerciseId: ids[Math.floor(rnd() * ids.length)], sets: 1 + Math.floor(rnd() * 4),
        exerciseClass: classes[Math.floor(rnd() * classes.length)], dayIndex: Math.floor(rnd() * 3),
      }));
      const guidelines = new Map([[12, g(2 + Math.floor(rnd() * 8))], [7, g(2 + Math.floor(rnd() * 6))], [11, g(2 + Math.floor(rnd() * 6))]]);
      const before = entries.map((e) => e.sets);
      const { sets, residual } = balanceWeek(entries, assignments, targets, guidelines);
      sets.forEach((s, i) => { expect(s).toBeLessThanOrEqual(before[i]); expect(s).toBeGreaterThanOrEqual(1); });
      expect(activationBlocked(entries, sets, guidelines).sort()).toEqual(residual.map((r) => r.targetName).sort());
      for (const r of residual) {
        const members = targets.get(r.targetId)!.memberMuscleIds;
        entries.forEach((e, i) => {
          if ([...members].some((m) => (assignments.get(e.exerciseId)?.get(m) ?? 0) > 0)) expect(sets[i]).toBe(1);
        });
      }
    }
  });
});
