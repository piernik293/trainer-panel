import { describe, it, expect } from "vitest";
import { normalizeCardioPreference, wantsCardio, CARDIO_PREFERENCE_OPTIONS } from "@workspace/survey-config";
import { generateCardioRecommendation, type CardioInputs } from "@/lib/cardioGenerator";

const base: CardioInputs = {
  cardioPreference: null, cardioFrequency: null, preferredCardioType: null, activityLevel: "Lekko aktywny",
  trainingGoal: "Poprawa kondycji", experienceLevel: "Średniozaawansowany", trainingDays: 3, hasHealthLimitation: false,
};
const run = (cardioPreference: string | null, cardioFrequency: string | null = null, trainingGoal = base.trainingGoal) =>
  generateCardioRecommendation({ ...base, cardioPreference, cardioFrequency, trainingGoal });

describe("cardio: jedno pytanie Tak/Nie, starsze odpowiedzi nadal rozumiane", () => {
  it("są tylko dwie odpowiedzi", () => {
    expect([...CARDIO_PREFERENCE_OPTIONS]).toEqual(["Tak", "Nie"]);
  });
  it.each([
    ["Tak", "include"], ["Nie", "none"],
    ["Tak, uwzględnij cardio w planie", "include"],
    ["Chętnie uwzględnię cardio w planie", "include"],
    ["Cardio może być dodatkiem do planu", "include"],
    ["Tylko niezbędne minimum", "none"],
    ["Wolę ograniczyć cardio do niezbędnego minimum", "none"],
    ["", null], [null, null],
  ])("%s → %s", (raw, kind) => expect(normalizeCardioPreference(raw as string | null)).toBe(kind));

  it("starsze wywiady: „Nie wykonuję cardio” i „minimum” → Nie, reszta → Tak", () => {
    expect(wantsCardio("Tylko niezbędne minimum")).toBe(false);
    expect(wantsCardio("Wolę ograniczyć cardio do niezbędnego minimum")).toBe(false);
    expect(wantsCardio(null, "Nie wykonuję cardio")).toBe(false);
    expect(wantsCardio("Tak, uwzględnij cardio w planie", "Nie wykonuję cardio")).toBe(false);
    expect(wantsCardio(null, "2–3 razy w tygodniu")).toBe(true);
    expect(wantsCardio(null, null)).toBe(true); // początkujący nie są pytani — cardio zostaje jak dotąd
    expect(wantsCardio("Tak", "Nie wykonuję cardio")).toBe(true); // nowa odpowiedź ma pierwszeństwo
    expect(wantsCardio("Nie", "2–3 razy w tygodniu")).toBe(false);
  });
  it("generator: Nie = brak cardio, także przy redukcji; Tak = rekomendacja jak dotąd", () => {
    expect(run("Nie")).toBeNull();
    expect(run("Nie", null, "Redukcja tkanki tłuszczowej")).toBeNull();
    expect(run(null, "Nie wykonuję cardio", "Redukcja tkanki tłuszczowej")).toBeNull();
    expect(run("Tak")).not.toBeNull();
    expect(run("Tak", null, "Redukcja tkanki tłuszczowej")?.sessionsPerWeek).toBeGreaterThan(0);
    expect(run("Cardio może być dodatkiem do planu")).toEqual(run("Tak"));
  });
});
