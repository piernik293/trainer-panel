import { describe, it, expect } from "vitest";
import { normalizeCardioPreference, CARDIO_PREFERENCE_OPTIONS } from "@workspace/survey-config";
import { generateCardioRecommendation, type CardioInputs } from "@/lib/cardioGenerator";

const base: CardioInputs = {
  cardioPreference: null, cardioFrequency: "0", preferredCardioType: null, activityLevel: "Lekko aktywny",
  trainingGoal: "Poprawa kondycji", experienceLevel: "Średniozaawansowany", trainingDays: 3, hasHealthLimitation: false,
};
const run = (cardioPreference: string | null) => generateCardioRecommendation({ ...base, cardioPreference });

describe("cardio preference: two answers, earlier wordings still understood", () => {
  it("only two options are offered", () => {
    expect([...CARDIO_PREFERENCE_OPTIONS]).toEqual(["Tak, uwzględnij cardio w planie", "Tylko niezbędne minimum"]);
  });
  it.each([
    ["Tak, uwzględnij cardio w planie", "include"],
    ["Chętnie uwzględnię cardio w planie", "include"],
    ["Uwzględnij w planie", "include"],
    ["Cardio może być dodatkiem do planu", "include"], // removed option: treated as "Tak"
    ["Tylko niezbędne minimum", "minimum"],
    ["Wolę ograniczyć cardio do niezbędnego minimum", "minimum"],
    ["", null], [null, null],
  ])("%s → %s", (raw, kind) => expect(normalizeCardioPreference(raw as string | null)).toBe(kind));

  it("the generator treats the earlier 'dodatek' answer exactly like 'Tak'", () => {
    expect(run("Cardio może być dodatkiem do planu")).toEqual(run("Tak, uwzględnij cardio w planie"));
    expect(run("Chętnie uwzględnię cardio w planie")).toEqual(run("Tak, uwzględnij cardio w planie"));
  });
  it("'minimum' is honoured in both wordings (it used to match only one of them)", () => {
    expect(run("Wolę ograniczyć cardio do niezbędnego minimum")).toEqual(run("Tylko niezbędne minimum"));
    expect(run("Tylko niezbędne minimum")).not.toEqual(run("Tak, uwzględnij cardio w planie"));
  });
});
