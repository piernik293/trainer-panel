import { describe, it, expect } from "vitest";
import { volumeSets, chooseMethods, orderForMethods, plannedMethods, methodsV2Enabled, type MethodExercise } from "../methods";
import { methodTilesFor, methodTileOf, METHOD_AUTO } from "@workspace/survey-config";

const ex = (id: number, name: string, group: string, type: "Izolowane" | "Złożone", equipment: string[], pri = "Średni"): MethodExercise =>
  ({ id, name, mainMuscleGroup: group, exerciseType: type, exercisePriority: pri, equipment, verified: true });
const day: MethodExercise[] = [
  ex(1, "Wyciskanie hantli na ławce", "Klatka piersiowa", "Złożone", ["Hantle", "Ławka"], "Wysoki"),
  ex(2, "Wiosłowanie na maszynie", "Plecy", "Złożone", ["Maszyna"]),
  ex(3, "Uginanie ramion z hantlami", "Biceps", "Izolowane", ["Hantle"]),
  ex(4, "Prostowanie ramion na wyciągu", "Triceps", "Izolowane", ["Wyciąg"]),
  ex(5, "Unoszenie ramion bokiem", "Barki", "Izolowane", ["Hantle"]),
];
const base = { level: "Zaawansowany", goal: "Budowa sylwetki", solo: false } as const;

describe("metody intensyfikacji (docs/METODY.md)", () => {
  it("flaga domyślnie wyłączona", () => { expect(methodsV2Enabled({})).toBe(false); expect(methodsV2Enabled({ METHODS_V2_ENABLED: "1" })).toBe(true); });
  it("kafelki: początkujący bez pytania, Solo tylko superserie i drop sety, rest-pause tylko Z", () => {
    expect(methodTilesFor("Początkujący", "trainer")).toEqual([]);
    expect(methodTilesFor("Średniozaawansowany", "solo")).toEqual([METHOD_AUTO, "Superserie", "Drop sety"]);
    expect(methodTilesFor("Średniozaawansowany", "trainer")).not.toContain("Rest-pause");
    expect(methodTilesFor("Zaawansowany", "trainer")).toContain("Rest-pause");
    expect(methodTileOf("Serie wymuszone")).toBeNull();
  });
  it("bez odpowiedzi albo dla początkującego — brak metod", () => {
    expect(chooseMethods(day, { ...base, choices: [] })).toEqual([]);
    expect(chooseMethods(day, { ...base, level: "Początkujący", choices: ["Superserie"] })).toEqual([]);
  });
  it("superserie: antagonistyczna para obok siebie, para ramion", () => {
    const a = chooseMethods(day, { ...base, choices: ["Superserie"] });
    const ids = a.filter((x) => x.method === "superserie").map((x) => x.exerciseId).sort();
    expect(ids).toEqual([3, 4]);
    expect(a.every((x) => x.group === 1 && x.note.length > 10)).toBe(true);
    const ordered = orderForMethods(day, a).map((e) => e.id);
    expect(Math.abs(ordered.indexOf(3) - ordered.indexOf(4))).toBe(1);
  });
  it("najwyżej 2 ćwiczenia z metodą w dniu i nigdy martwy ciąg / sztanga nad głową", () => {
    const big = [...day, ex(6, "Martwy ciąg", "Plecy", "Złożone", ["Sztanga"], "Bardzo wysoki"), ex(7, "Wyciskanie sztangi nad głowę", "Barki", "Złożone", ["Sztanga"], "Wysoki")];
    const a = chooseMethods(big, { ...base, choices: [METHOD_AUTO, "Superserie", "Drop sety"].slice(1) });
    expect(a.length).toBeLessThanOrEqual(2);
    expect(a.some((x) => x.exerciseId === 6 || x.exerciseId === 7)).toBe(false);
  });
  it("drop set tylko na izolowanym ćwiczeniu z hantlami/maszyną/wyciągiem, nigdy na sztandze", () => {
    const a = chooseMethods([...day, ex(8, "Uginanie ze sztangą", "Biceps", "Izolowane", ["Sztanga"])], { ...base, choices: ["Drop sety"] });
    expect(a.length).toBeGreaterThan(0);
    for (const m of a) expect([1, 2, 8]).not.toContain(m.exerciseId);
  });
  it("Solo: bez serii złożonych, rest-pause i upadku", () => {
    const p = plannedMethods({ ...base, solo: true, choices: ["Superserie", "Serie złożone", "Rest-pause", "Serie do upadku mięśniowego", "Drop sety"] }).map((x) => x.method);
    expect(p).toEqual(["superserie", "drop_set"]);
  });
  it("Rest-pause tylko Zaawansowany, upadek tylko na maszynie/wyciągu", () => {
    expect(plannedMethods({ ...base, level: "Średniozaawansowany", choices: ["Rest-pause"] })).toEqual([]);
    const a = chooseMethods(day, { ...base, choices: ["Serie do upadku mięśniowego"] });
    for (const m of a) expect([2, 4]).toContain(m.exerciseId);
  });
  it("„Dobierz za mnie”: Siła i kondycja bez metod; Budowa sylwetki z metodami; limit tygodniowy", () => {
    expect(chooseMethods(day, { ...base, goal: "Zwiększenie siły", choices: [METHOD_AUTO] })).toEqual([]);
    expect(chooseMethods(day, { ...base, goal: "Zwiększenie siły", choices: [METHOD_AUTO], sessionDuration: "60–90 min" })).toEqual([]);
    const shortSila = chooseMethods(day, { ...base, goal: "Zwiększenie siły", choices: [METHOD_AUTO], sessionDuration: "30–45 min" });
    expect(shortSila.map((x) => x.exerciseId).sort()).toEqual([3, 4]); // tylko ćwiczenia dodatkowe (izolowane)
    expect(shortSila.every((x) => x.method === "superserie")).toBe(true);
    expect(chooseMethods(day, { ...base, goal: "Poprawa kondycji", choices: [METHOD_AUTO] })).toEqual([]);
    expect(chooseMethods(day, { ...base, choices: [METHOD_AUTO] }).length).toBeGreaterThan(0);
    expect(chooseMethods(day, { ...base, choices: ["Superserie"], weekDays: { superserie: 2 } })).toEqual([]);
  });
  it("„Metody do unikania” nigdy nie są stosowane", () => {
    expect(chooseMethods(day, { ...base, choices: ["Superserie", "Drop sety"], avoid: ["Superserie"] }).some((x) => x.method === "superserie")).toBe(false);
    expect(chooseMethods(day, { ...base, choices: [METHOD_AUTO], avoid: ["Superserie", "Drop sety", "Rest-pause"] })).toEqual([]);
  });
  it("dzień z 3 ćwiczeniami nie dostaje metod; niezweryfikowane i unikane odpadają", () => {
    expect(chooseMethods(day.slice(0, 3), { ...base, choices: ["Superserie"] })).toEqual([]);
    const avoided = day.map((e) => (e.id === 3 ? { ...e, avoided: true } : e));
    expect(chooseMethods(avoided, { ...base, choices: ["Superserie"] }).some((x) => x.exerciseId === 3)).toBe(false);
  });
});

describe("objętość", () => {
  it("drop set i rest-pause = +1 seria efektywna, superserie bez zmian", () => {
    expect(volumeSets(3, "drop_set")).toBe(4); expect(volumeSets(3, "rest_pause")).toBe(4);
    expect(volumeSets(3, "superserie")).toBe(3); expect(volumeSets(3, null)).toBe(3);
  });
});
