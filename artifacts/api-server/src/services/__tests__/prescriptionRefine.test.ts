import { describe, it, expect } from "vitest";
import { prescribeExercise, refinePrescription } from "../exercisePrescriptionService";

const base = prescribeExercise("secondary_compound", "hypertrophy");
const ex = (name: string, extra: Record<string, string> = {}) => ({ name, ...extra });

describe("zakresy powtórzeń zależą od ćwiczenia", () => {
  it("negatywy: 3 × 3–5 i dłuższa przerwa", () => {
    const p = refinePrescription(ex("Negatywy dipów"), "secondary_compound", base);
    expect(p).toMatchObject({ sets: 3, repsLabel: "3–5", restSeconds: 150 });
  });
  it("wiosłowanie 8–12, łydki 12–20, dipy i podciąganie 6–10, trudne stopnie 5–8", () => {
    expect(refinePrescription(ex("Wiosłowanie hantlem"), "secondary_compound", base).repsLabel).toBe("8–12");
    expect(refinePrescription(ex("Wspięcia na palce stojąc", { mainMuscleGroup: "Łydki" }), "isolation", prescribeExercise("isolation", "hypertrophy")).repsLabel).toBe("12–20");
    expect(refinePrescription(ex("Dipy na poręczach"), "main_compound", prescribeExercise("main_compound", "hypertrophy")).repsLabel).toBe("6–10");
    expect(refinePrescription(ex("Dipy z obciążeniem"), "main_compound", prescribeExercise("main_compound", "hypertrophy")).repsLabel).toBe("5–8");
  });
  it("początkujący zachowują bezpieczną bazę (poza negatywami, łydkami i wiosłowaniem)", () => {
    const b = prescribeExercise("regression_beginner", "general");
    expect(refinePrescription(ex("Pompki na podwyższeniu"), "regression_beginner", b)).toEqual(b);
    expect(refinePrescription(ex("Wiosłowanie gumą"), "regression_beginner", b).repsLabel).toBe("10–12");
  });
  it("rdzeń, skoki i ćwiczenia na czas bez zmian", () => {
    const core = prescribeExercise("core", "general");
    expect(refinePrescription(ex("Plank"), "core", core)).toEqual(core);
    expect(refinePrescription(ex("Wiosłowanie izometryczne"), "secondary_compound", { sets: 3, repsLabel: "30–45 sek", restSeconds: 60 }).repsLabel).toBe("30–45 sek");
  });
  it("różne ćwiczenia jednego dnia nie mają jednego zakresu", () => {
    const day = [
      refinePrescription(ex("Dipy na poręczach"), "main_compound", prescribeExercise("main_compound", "general")),
      refinePrescription(ex("Wiosłowanie hantlem"), "secondary_compound", prescribeExercise("secondary_compound", "general")),
      refinePrescription(ex("Negatywy podciągnięć"), "secondary_compound", prescribeExercise("secondary_compound", "general")),
      refinePrescription(ex("Wspięcia", { mainMuscleGroup: "Łydki" }), "isolation", prescribeExercise("isolation", "general")),
    ].map((p) => p.repsLabel);
    expect(new Set(day).size).toBe(4);
  });
});
