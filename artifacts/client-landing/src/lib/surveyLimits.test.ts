import { describe, it, expect } from "vitest";
import {
  birthDateError, birthDateBounds, heightError, weightError, toggleEquipment, equipmentConflict, NO_EQUIPMENT,
  AGE_RANGE_MESSAGE, BIRTH_INVALID_MESSAGE, BIRTH_REQUIRED_MESSAGE, HEIGHT_RANGE_MESSAGE, WEIGHT_RANGE_MESSAGE,
} from "@workspace/survey-config";
import { EMPTY_ANSWERS, missingHint, normalizeAnswers, validateStep, type Answers } from "./surveyWizard";

const TODAY = new Date(2026, 9, 23); // 23 Oct 2026

describe("birth date: age 16–90", () => {
  it.each([
    ["2010-10-23", null],          // exactly 16 today
    ["2010-10-24", AGE_RANGE_MESSAGE], // one day short of 16
    ["1936-10-23", null],          // exactly 90
    ["1935-10-23", AGE_RANGE_MESSAGE], // 91
    ["2026-10-23", AGE_RANGE_MESSAGE], // born today
    ["2999-01-01", AGE_RANGE_MESSAGE],
    ["1992-02-31", BIRTH_INVALID_MESSAGE],
    ["abc", BIRTH_INVALID_MESSAGE],
    ["", BIRTH_REQUIRED_MESSAGE],
  ])("%s → %s", (dob, msg) => expect(birthDateError(dob, TODAY)).toBe(msg));
  it("messages are Polish and mention the limits", () => {
    expect(AGE_RANGE_MESSAGE).toBe("Wiek musi mieścić się między 16 a 90 lat. Sprawdź datę urodzenia.");
  });
  it("calendar: allowed range 16–90 years, opens ~30 years back (never at today)", () => {
    expect(birthDateBounds(TODAY)).toEqual({ min: "1935-10-23", max: "2010-10-23", opensAt: "1996-10-23" });
  });
});

describe("height 120–230 cm, weight 35–250 kg", () => {
  it.each([[119, HEIGHT_RANGE_MESSAGE], [120, null], [230, null], [231, HEIGHT_RANGE_MESSAGE], [undefined, HEIGHT_RANGE_MESSAGE], [NaN, HEIGHT_RANGE_MESSAGE]])("height %s", (h, m) =>
    expect(heightError(h as number | undefined)).toBe(m));
  it.each([[34.9, WEIGHT_RANGE_MESSAGE], [35, null], [250, null], [250.1, WEIGHT_RANGE_MESSAGE], [undefined, WEIGHT_RANGE_MESSAGE]])("weight %s", (w, m) =>
    expect(weightError(w as number | undefined)).toBe(m));
  it("messages", () => {
    expect(HEIGHT_RANGE_MESSAGE).toBe("Wzrost musi być między 120 a 230 cm.");
    expect(WEIGHT_RANGE_MESSAGE).toBe("Waga musi być między 35 a 250 kg.");
  });
});

describe("equipment: 'Brak sprzętu' excludes the rest", () => {
  it("ticking it clears the others, ticking another clears it", () => {
    expect(toggleEquipment(["Hantle", "Gumy oporowe"], NO_EQUIPMENT)).toEqual([NO_EQUIPMENT]);
    expect(toggleEquipment([NO_EQUIPMENT], "Hantle")).toEqual(["Hantle"]);
    expect(toggleEquipment([NO_EQUIPMENT], NO_EQUIPMENT)).toEqual([]);
    expect(toggleEquipment(["Hantle"], "Hantle")).toEqual([]);
    expect(toggleEquipment(["Hantle"], "Kettlebell")).toEqual(["Hantle", "Kettlebell"]);
  });
  it("conflict detection (used by the API)", () => {
    expect(equipmentConflict([NO_EQUIPMENT, "Hantle"])).toBe(true);
    expect(equipmentConflict([NO_EQUIPMENT], "Piłka")).toBe(true);
    expect(equipmentConflict([NO_EQUIPMENT])).toBe(false);
    expect(equipmentConflict(["Hantle"], "Piłka")).toBe(false);
  });
  it("a repaired draft keeps only 'Brak sprzętu'", () => {
    const a: Answers = { ...EMPTY_ANSWERS, trainingLocation: "Dom", equipmentItems: ["Hantle", NO_EQUIPMENT], equipmentOther: "x" };
    expect(normalizeAnswers(a)).toMatchObject({ equipmentItems: [NO_EQUIPMENT], equipmentOther: "" });
  });
});

describe("hint next to the disabled 'Dalej' says what to fill in", () => {
  it("per screen", () => {
    expect(missingHint("name", EMPTY_ANSWERS)).toBe("Uzupełnij: imię.");
    expect(missingHint("name", { ...EMPTY_ANSWERS, firstName: "Ala" })).toBe("Uzupełnij: nazwisko.");
    expect(missingHint("birth", EMPTY_ANSWERS)).toBe("Uzupełnij: datę urodzenia.");
    expect(missingHint("birth", { ...EMPTY_ANSWERS, dateOfBirth: "1990-01-01" })).toBe("Uzupełnij: płeć.");
    expect(missingHint("birth", { ...EMPTY_ANSWERS, dateOfBirth: "2020-01-01", gender: "Kobieta" })).toBe("Popraw datę urodzenia.");
    expect(missingHint("body", EMPTY_ANSWERS)).toBe("Uzupełnij: wzrost.");
    expect(missingHint("body", { ...EMPTY_ANSWERS, heightCm: 170 })).toBe("Uzupełnij: wagę.");
    expect(missingHint("body", { ...EMPTY_ANSWERS, heightCm: 100, weightKg: "60" })).toBe("Popraw wzrost.");
    expect(missingHint("body", { ...EMPTY_ANSWERS, heightCm: 170, weightKg: "20" })).toBe("Popraw wagę.");
    expect(missingHint("goal", EMPTY_ANSWERS)).toBe("Uzupełnij: cel treningowy.");
    expect(missingHint("equipment", EMPTY_ANSWERS)).toContain("sprzęt");
    expect(missingHint("motivation", EMPTY_ANSWERS)).toBeNull(); // optional screen
  });
  it("validateStep uses the shared limits", () => {
    expect(validateStep("body", { ...EMPTY_ANSWERS, heightCm: 175, weightKg: "251" })).toBe(WEIGHT_RANGE_MESSAGE);
  });
});

describe("cardio preference in drafts and priority muscles by effective level", () => {
  const A = (over: Partial<Answers>): Answers => ({ ...EMPTY_ANSWERS, ...over });
  it("an older draft with the removed answer is shown as 'Tak, uwzględnij cardio w planie'", () => {
    expect(normalizeAnswers(A({ cardioPreference: "Cardio może być dodatkiem do planu" })).cardioPreference).toBe("Tak, uwzględnij cardio w planie");
    expect(normalizeAnswers(A({ cardioPreference: "Chętnie uwzględnię cardio w planie" })).cardioPreference).toBe("Tak, uwzględnij cardio w planie");
    expect(normalizeAnswers(A({ cardioPreference: "Wolę ograniczyć cardio do niezbędnego minimum" })).cardioPreference).toBe("Tylko niezbędne minimum");
    expect(normalizeAnswers(A({ cardioPreference: "" })).cardioPreference).toBe("");
  });
  it("beginners keep one priority group, others three", () => {
    const three = { priorityMuscle1: "Barki", priorityMuscle2: "Plecy", priorityMuscle3: "Pośladki" };
    for (const experienceLevel of ["Brak aktywności fizycznej", "Początkujący"]) {
      expect(normalizeAnswers(A({ experienceLevel, ...three }))).toMatchObject({ priorityMuscle1: "Barki", priorityMuscle2: "", priorityMuscle3: "" });
    }
    // effective level: intermediate chosen, but only 1 year of training → one group
    expect(normalizeAnswers(A({ experienceLevel: "Średniozaawansowany", trainingDuration: "1 rok", ...three }))).toMatchObject({ priorityMuscle2: "", priorityMuscle3: "" });
    expect(normalizeAnswers(A({ experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata", ...three }))).toMatchObject(three);
    expect(normalizeAnswers(A({ experienceLevel: "Zaawansowany", ...three }))).toMatchObject(three);
  });
  it("validation of the priority screen", () => {
    const base = A({ experienceLevel: "Początkujący", priorityMuscle1: "Barki", priorityMuscle2: "Plecy" });
    expect(validateStep("priority", base)).toBe("Przy tym poziomie możesz wskazać najwyżej jedną partię priorytetową.");
    expect(validateStep("priority", { ...base, priorityMuscle2: "" })).toBeNull();
    expect(validateStep("priority", { ...base, experienceLevel: "Zaawansowany" })).toBeNull();
  });
});

describe("payload: methods to avoid", async () => {
  const { buildSurveyPayload } = await import("./surveyWizard");
  const full = (over: Partial<Answers>): Answers => ({ ...EMPTY_ANSWERS, firstName: "A", lastName: "B", email: "a@b.pl", ...over });
  it("the list is the answer", () => {
    const p = buildSurveyPayload(full({ experienceLevel: "Zaawansowany", trainingDuration: "5 lat", advancedMethodsToAvoid: ["Drop sety", "Rest-Pause"] }));
    expect(p["avoidsAdvancedMethods"]).toBe(true);
    expect(p["advancedMethodsToAvoid"]).toEqual(["Drop sety", "Rest-Pause"]);
    const none = buildSurveyPayload(full({ experienceLevel: "Zaawansowany", trainingDuration: "5 lat" }));
    expect(none["avoidsAdvancedMethods"]).toBe(false);
    expect(none["advancedMethodsToAvoid"]).toEqual([]);
  });
  it("not asked (effective beginner) → nothing is sent", () => {
    const p = buildSurveyPayload(full({ experienceLevel: "Zaawansowany", trainingDuration: "6 miesięcy", advancedMethodsToAvoid: ["Drop sety"] }));
    expect(p["avoidsAdvancedMethods"]).toBeUndefined();
    expect(p["advancedMethodsToAvoid"]).toEqual([]);
  });
});

describe("earlier wording of the methods question is ignored", async () => {
  const { methodsAnswerUsable, METHODS_QUESTION_FIXED_AT } = await import("@workspace/survey-config");
  it("answers saved before the fix are 'no data'; newer ones are used", () => {
    expect(methodsAnswerUsable("2026-10-01T10:00:00Z")).toBe(false);
    expect(methodsAnswerUsable(new Date("2026-10-23T12:00:00Z"))).toBe(false);
    expect(methodsAnswerUsable(METHODS_QUESTION_FIXED_AT)).toBe(true);
    expect(methodsAnswerUsable("2026-11-02T10:00:00Z")).toBe(true);
    expect(methodsAnswerUsable(null)).toBe(false);
    expect(methodsAnswerUsable(undefined)).toBe(false);
  });
});
