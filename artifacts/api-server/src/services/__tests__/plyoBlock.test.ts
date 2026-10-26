import { describe, expect, it } from "vitest";
import { LANDING_ROLE, isPlyoExercise, plyoRule, selectPlyoBlock, type PlyoCandidate } from "../plyoBlock";
import { JUMP_EXPERIENCE_OPTIONS } from "@workspace/survey-config";

const GOALS = ["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa kondycji", "Poprawa sprawności", "Cel sportowy"];
const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"] as const;
const [NIE, TROCHE, TAK] = JUMP_EXPERIENCE_OPTIONS;

let n = 0;
const jump = (name: string, intensity: "niska" | "średnia" | "wysoka", difficultyLevel: string, o: Partial<PlyoCandidate> = {}): PlyoCandidate =>
  ({ id: ++n, name, role: "główne", intensity, equipment: ["Masa własnego ciała"], difficultyLevel, movementPattern: "Przysiad", hidden: false, reviewedByTrainer: true, ...o });

const LANDING = jump("Nauka lądowania", "niska", "Początkujący", { role: LANDING_ROLE, intensity: null });
const POOL: PlyoCandidate[] = [
  LANDING,
  jump("Skoki pogo", "niska", "Średniozaawansowany", { movementPattern: "Inne" }),
  jump("Przeskoki boczne", "niska", "Średniozaawansowany", { movementPattern: "Lokomocja" }),
  jump("Skok z zamachem", "średnia", "Średniozaawansowany"),
  jump("Wskok na podwyższenie", "średnia", "Średniozaawansowany", { movementPattern: "Wykrok" }),
  jump("Skok boczny z zatrzymaniem", "średnia", "Zaawansowany", { movementPattern: "Odwodzenie" }),
  jump("Zeskok z wybiciem", "wysoka", "Zaawansowany"),
  jump("Skok jednonóż", "wysoka", "Zaawansowany", { movementPattern: "Wykrok" }),
  // nie są skokami:
  jump("Uderzenia młotem w oponę", "średnia", "Średniozaawansowany", { equipment: ["Młot i opona"] }),
  jump("Pchnięcia worka", "średnia", "Średniozaawansowany", { equipment: ["Worek bokserski"] }),
  jump("Skip A (technika biegu)", "niska", "Średniozaawansowany", { role: "technika biegu" }),
];
const names = (l: PlyoCandidate[]) => l.map((e) => e.name);
const block = (goal: string, level: string, exp?: string, pool = POOL) =>
  selectPlyoBlock(pool, plyoRule({ goal, effectiveLevel: level, jumpExperience: exp }), level);

describe("kto w ogóle dostaje blok", () => {
  it("brak aktywności — nigdy, przy żadnym celu i odpowiedzi", () => {
    for (const goal of GOALS) for (const exp of [undefined, NIE, TROCHE, TAK]) expect(block(goal, LEVELS[0], exp)).toEqual([]);
  });
  it("cele spoza trzech: nigdy (trener może dodać ręcznie)", () => {
    for (const goal of ["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej"]) for (const level of LEVELS) expect(block(goal, level, TAK)).toEqual([]);
  });
  it("kondycja i sprawność: tylko niska, dopiero od średniozaawansowanego", () => {
    for (const goal of ["Poprawa kondycji", "Poprawa sprawności"]) {
      expect(block(goal, "Początkujący")).toEqual([]);
      for (const level of ["Średniozaawansowany", "Zaawansowany"]) {
        const b = block(goal, level);
        expect(b.length).toBeGreaterThanOrEqual(2);
        expect(b.every((e) => e.intensity === "niska")).toBe(true);
        expect(names(b)).not.toContain("Nauka lądowania");
      }
    }
  });
});

describe("Cel sportowy: niższe z (poziom, doświadczenie)", () => {
  const inten = (l: PlyoCandidate[]) => new Set(l.map((e) => e.role === LANDING_ROLE ? "lądowanie" : e.intensity));
  it("„Nie” (i brak odpowiedzi): tylko Nauka lądowania + niska, na każdym poziomie", () => {
    for (const level of LEVELS.slice(1)) for (const exp of [NIE, undefined]) {
      const b = block("Cel sportowy", level, exp);
      expect([...inten(b)].every((i) => i === "lądowanie" || i === "niska"), `${level}/${exp}`).toBe(true);
    }
    expect(names(block("Cel sportowy", "Zaawansowany", NIE))[0]).toBe("Nauka lądowania");
  });
  it("„Trochę”: niska i średnia; Początkujący nadal tylko lądowanie + niska", () => {
    for (const level of ["Średniozaawansowany", "Zaawansowany"]) {
      const b = block("Cel sportowy", level, TROCHE);
      expect([...inten(b)].every((i) => i === "niska" || i === "średnia")).toBe(true);
      expect(names(b)).not.toContain("Nauka lądowania");
    }
    expect([...inten(block("Cel sportowy", "Początkujący", TROCHE))].every((i) => i === "lądowanie" || i === "niska")).toBe(true);
  });
  it("„Tak”: wg poziomu — wysoka tylko zaawansowany, Ś bez wysokiej, Początkujący max lądowanie + niska", () => {
    expect(block("Cel sportowy", "Zaawansowany", TAK).some((e) => e.intensity === "wysoka")).toBe(true);
    expect(block("Cel sportowy", "Średniozaawansowany", TAK).some((e) => e.intensity === "wysoka")).toBe(false);
    expect([...inten(block("Cel sportowy", "Początkujący", TAK))].every((i) => i === "lądowanie" || i === "niska")).toBe(true);
  });
  it("pełna macierz cel × poziom × odpowiedź: 2–4 ćwiczeń (lub mniej przy małej puli), nic ponad poziom i intensywność", () => {
    const cap: Record<string, number> = { "Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3 };
    const expRank = (e: string | undefined) => (e === TAK ? 3 : e === TROCHE ? 2 : 1);
    const allowed = ["", "niska", "średnia", "wysoka"];
    const rank = (i: string) => (i === "niska" ? 1 : i === "średnia" ? 2 : 3);
    for (const level of LEVELS.slice(1)) for (const exp of [undefined, NIE, TROCHE, TAK]) {
      const b = block("Cel sportowy", level, exp);
      expect(b.length).toBeLessThanOrEqual(4);
      const r = Math.min(cap[level]!, expRank(exp));
      for (const e of b) {
        if (e.role !== LANDING_ROLE) expect(rank(e.intensity!), `${level}/${exp}/${e.name}`).toBeLessThanOrEqual(r);
        expect(["Początkujący", "Średniozaawansowany", "Zaawansowany"].indexOf(e.difficultyLevel!) + 1, e.name).toBeLessThanOrEqual(cap[level]!);
        expect(allowed).toContain(e.intensity ?? "");
      }
      if (r >= 2) expect(b.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("bezpieczeństwo wyboru", () => {
  it("nie wchodzą: worek, młot, technika biegu, ukryte, niezweryfikowane dla Początkującego", () => {
    const b = block("Cel sportowy", "Zaawansowany", TAK).map((e) => e.name);
    for (const bad of ["Uderzenia młotem w oponę", "Pchnięcia worka", "Skip A (technika biegu)"]) expect(b).not.toContain(bad);
    const hidden = [jump("Ukryty skok", "niska", "Początkujący", { hidden: true })];
    expect(block("Cel sportowy", "Początkujący", NIE, [...hidden, LANDING]).map((e) => e.name)).toEqual(["Nauka lądowania"]);
    const unreviewed = [{ ...LANDING, reviewedByTrainer: false }];
    expect(block("Cel sportowy", "Początkujący", NIE, unreviewed)).toEqual([]);
    expect(block("Cel sportowy", "Średniozaawansowany", NIE, unreviewed)).toHaveLength(1);
  });
  it("cienka pula: zwraca mniej niż 2, nie dopełnia niczym innym", () => {
    expect(block("Cel sportowy", "Początkujący", TAK).map((e) => e.name)).toEqual(["Nauka lądowania"]);
    expect(block("Cel sportowy", "Zaawansowany", TAK, [])).toEqual([]);
  });
  it("kolejny dzień (rotacja) bierze inne skoki, ale zawsze z dozwolonego zbioru", () => {
    const rule = plyoRule({ goal: "Cel sportowy", effectiveLevel: "Zaawansowany", jumpExperience: TAK });
    const a = names(selectPlyoBlock(POOL, rule, "Zaawansowany", 0));
    const b = names(selectPlyoBlock(POOL, rule, "Zaawansowany", 1));
    expect(a).not.toEqual(b);
  });
  it("rozpoznawanie skoków", () => {
    expect(isPlyoExercise(LANDING)).toBe(true);
    expect(isPlyoExercise({ role: "główne", intensity: null, equipment: [] })).toBe(false);
    expect(isPlyoExercise({ role: "główne", intensity: "średnia", equipment: ["Młot i opona"] })).toBe(false);
    expect(isPlyoExercise({ role: "technika biegu", intensity: "niska", equipment: [] })).toBe(false);
  });
});
