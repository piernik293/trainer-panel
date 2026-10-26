/**
 * Dom bez sprzętu (blok 4c): plan z masą ciała; wzorce bez pasującego ćwiczenia generator POMIJA — nie podstawia
 * ćwiczenia trudniejszego ani spoza poziomu i nie dopełnia planu sztucznymi ćwiczeniami. Puli nie tworzy tu silnik:
 * używamy tego samego filtra zgodności (miejsce + sprzęt) co trasa generatora.
 */
import { describe, expect, it } from "vitest";
import { runExerciseSelectionEngineV0, type V0PriorityContext, type V0SessionType } from "../ExerciseSelectionEngineV0";
import { buildCompatibilityFilter, type ScoredAndFilteredExercise } from "../planDraftDayRecommendationsService";

let n = 0;
const ex = (name: string, o: Partial<ScoredAndFilteredExercise>): ScoredAndFilteredExercise => ({
  id: ++n, name, mainMuscleGroup: "Brzuch", secondaryMuscleGroups: [], equipment: ["Masa własnego ciała"], requiredEquipmentAll: [],
  trainingLocation: ["Dom", "Siłownia", "Plener"], score: 50, matchReasons: [], warnReasons: [], isAvoided: false, exerciseType: "Złożone",
  neurologicalFatigue: 1, learningDifficulty: 1, exercisePriority: "Średni", movementPattern: "Stabilizacja", suitableForNoActivity: true, ...o,
});

const POOL: ScoredAndFilteredExercise[] = [
  ex("Pompki ścienne", { mainMuscleGroup: "Klatka piersiowa", movementPattern: "Pchanie poziome" }),
  ex("Pompki na kolanach", { mainMuscleGroup: "Klatka piersiowa", movementPattern: "Pchanie poziome" }),
  ex("Pompki klasyczne", { mainMuscleGroup: "Klatka piersiowa", movementPattern: "Pchanie poziome", learningDifficulty: 2, suitableForNoActivity: false }),
  ex("Pompki z biodrami w górze (pike)", { mainMuscleGroup: "Barki", movementPattern: "Pchanie pionowe", learningDifficulty: 3, suitableForNoActivity: false }),
  ex("Pompka jednorącz", { mainMuscleGroup: "Klatka piersiowa", movementPattern: "Pchanie poziome", learningDifficulty: 5, suitableForNoActivity: false }),
  ex("Podciąganie nachwytem", { mainMuscleGroup: "Plecy", movementPattern: "Przyciąganie pionowe", equipment: ["Drążek"], learningDifficulty: 3, suitableForNoActivity: false }),
  ex("Wiosłowanie z gumą", { mainMuscleGroup: "Plecy", movementPattern: "Przyciąganie poziome", equipment: ["Gumy oporowe"] }),
  ex("Wiosłowanie hantlem", { mainMuscleGroup: "Plecy", movementPattern: "Przyciąganie poziome", equipment: ["Hantle"] }),
  ex("Przysiad z masą ciała", { mainMuscleGroup: "Mięśnie czworogłowe uda", movementPattern: "Przysiad" }),
  ex("Wykrok w tył", { mainMuscleGroup: "Pośladki", movementPattern: "Wykrok" }),
  ex("Most biodrowy", { mainMuscleGroup: "Pośladki", movementPattern: "Zawias biodrowy" }),
  ex("Wspięcia na palce", { mainMuscleGroup: "Łydki", movementPattern: "Wspięcie na palce", exerciseType: "Izolowane" }),
  ex("Deska", { mainMuscleGroup: "Brzuch", movementPattern: "Stabilizacja", exerciseType: "Izolowane" }),
];

const ctx = (over: Partial<V0PriorityContext>): V0PriorityContext => ({
  isPriorityEligible: false, isBeginnerClient: false, isNoActivityClient: false, tierA: [], tierB: [], allowPlyometrics: false, ...over,
});

function homePool(equipment: string | null) {
  const ok = buildCompatibilityFilter("Dom", equipment, new Set<number>());
  return POOL.filter(ok);
}
const run = (pool: ScoredAndFilteredExercise[], c: V0PriorityContext, type: V0SessionType = "full_body") =>
  runExerciseSelectionEngineV0(pool, type, new Set<string>(), c).exercises;

describe("dom bez sprzętu", () => {
  it("pula to tylko masa ciała — przyciąganie wymaga drążka, gumy lub hantli", () => {
    const pool = homePool("Brak sprzętu");
    expect(pool.every((e) => e.equipment.every((q) => q === "Masa własnego ciała"))).toBe(true);
    expect(pool.some((e) => /Przyciąganie/.test(e.movementPattern ?? ""))).toBe(false);
  });
  for (const [label, c] of [["Brak aktywności", ctx({ isNoActivityClient: true, isBeginnerClient: true })], ["Początkujący", ctx({ isBeginnerClient: true })]] as const) {
    it(`${label}: brak przyciągania i pchania pionowego, nic ponad poziom, plan nie jest dopełniany`, () => {
      const picked = run(homePool("Brak sprzętu"), c);
      const names = picked.map((p) => p.name);
      expect(picked.length).toBeGreaterThan(0);
      expect(picked.some((p) => /Przyciąganie|Pchanie pionowe/.test(p.movementPattern ?? ""))).toBe(false);
      for (const p of picked) {
        expect(p.learningDifficulty, p.name).toBeLessThanOrEqual(2);
        if (c.isNoActivityClient) expect(p.suitableForNoActivity, p.name).toBe(true);
      }
      expect(names).not.toContain("Pompka jednorącz");
      expect(names).not.toContain("Pompki z biodrami w górze (pike)");
      expect(names.some((x) => /Pompki (ścienne|na kolanach|klasyczne)/.test(x))).toBe(true); // pchanie poziome zostaje
      expect(picked.length).toBeLessThanOrEqual(homePool("Brak sprzętu").length); // żadnych dodatków spoza puli
    });
  }
  it("dom z gumą: przyciąganie jest", () => {
    const picked = run(homePool("Gumy oporowe"), ctx({ isBeginnerClient: true }));
    expect(picked.some((p) => p.name === "Wiosłowanie z gumą")).toBe(true);
  });
  it("dom z hantlami: przyciąganie jest", () => {
    const picked = run(homePool("Hantle"), ctx({ isNoActivityClient: true, isBeginnerClient: true }));
    expect(picked.some((p) => p.name === "Wiosłowanie hantlem")).toBe(true);
  });
});
