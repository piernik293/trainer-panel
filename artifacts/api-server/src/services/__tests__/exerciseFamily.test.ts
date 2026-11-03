import { describe, it, expect } from "vitest";
import { exerciseFamily, familyDuplicates, dropFamilyDuplicates } from "../exerciseFamily";
import { runExerciseSelectionEngineV0, type V0PriorityContext } from "../ExerciseSelectionEngineV0";

describe("rodziny wzorców (jeden wzorzec na dzień)", () => {
  it.each([
    ["Dipy na poręczach", "dipy"], ["Dipy na ławce", "dipy"], ["Negatywy dipów", "dipy"],
    ["Pompki klasyczne", "pompki"], ["Pompki na kolanach", "pompki"], ["Pompki z wybiciem", null],
    ["Podciąganie podchwytem", "podciaganie"], ["Podciąganie kolan w leżeniu na ławce", null],
    ["Martwy ciąg rumuński z hantlami", "martwy ciag"], ["Przysiad do skrzyni", "przysiad"],
    ["Przysiad wykroczny z podparciem", "wykrok"], ["Przysiad z wyskokiem", null],
    ["Wiosłowanie jednorącz hantlem", null], ["Wyciskanie hantli nad głowę", null],
  ])("%s → %s", (name, fam) => expect(exerciseFamily(name)).toBe(fam));

  it("licznik duplikatów i usuwanie", () => {
    const day = [{ name: "Dipy na poręczach" }, { name: "Wiosłowanie hantlem" }, { name: "Dipy na ławce" }, { name: "Pompki klasyczne" }, { name: "Pompki na kolanach" }];
    expect(familyDuplicates(day.map((d) => d.name))).toBe(2);
    expect(dropFamilyDuplicates(day).map((d) => d.name)).toEqual(["Dipy na poręczach", "Wiosłowanie hantlem", "Pompki klasyczne"]);
  });

  it("silnik: dzień ze sprzętem nie dostaje dwóch dipów ani dwóch wariantów pompek", () => {
    const mk = (id: number, name: string, group: string, pattern: string) => ({
      id, name, mainMuscleGroup: group, matchingTargets: [], equipment: ["Masa własnego ciała"], trainingLocation: ["Dom", "Siłownia"], score: 10 - id % 5,
      matchReasons: [], warnReasons: [], isAvoided: false, exerciseType: "Wielostawowe", neurologicalFatigue: "średnie", learningDifficulty: 2,
      exercisePriority: 1, movementPattern: pattern, movementCategoryKey: null, secondaryMuscleGroups: [], suitableForNoActivity: true,
    });
    const pool = [
      mk(1, "Dipy na poręczach", "Klatka piersiowa", "Pchanie poziome"), mk(2, "Dipy na ławce", "Triceps", "Wyprost łokcia"),
      mk(3, "Pompki klasyczne", "Klatka piersiowa", "Pchanie poziome"), mk(4, "Pompki na kolanach", "Klatka piersiowa", "Pchanie poziome"),
      mk(5, "Wyciskanie hantli nad głowę", "Barki", "Pchanie pionowe"), mk(6, "Prostowanie ramion z hantlem", "Triceps", "Wyprost łokcia"),
      mk(7, "Unoszenie ramion bokiem", "Barki", "Odwodzenie"), mk(8, "Plank", "Brzuch", "Stabilizacja"),
    ] as unknown as Parameters<typeof runExerciseSelectionEngineV0>[0];
    const ctx = { isPriorityEligible: false, isNoActivityClient: false, isBeginnerClient: false, tierA: [], tierB: [], benchGoalActive: false } as unknown as V0PriorityContext;
    const r = runExerciseSelectionEngineV0(pool, "push", new Set(), ctx);
    expect(familyDuplicates(r.exercises.map((e) => e.name))).toBe(0);
  });
});
