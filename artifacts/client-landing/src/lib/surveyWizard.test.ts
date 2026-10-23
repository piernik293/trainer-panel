/**
 * Wywiad 2.0 — "nothing got lost": the payload of the step-by-step interview equals
 * the payload of the former single-page form for the same answers, for every path
 * (beginner / intermediate / advanced, sport, injury, home vs gym). Differences are
 * only the documented ones (hidden answers are cleared, stress has no default).
 */

import { describe, it, expect } from "vitest";
import {
  EMPTY_ANSWERS, STAGES, buildSurveyPayload, isStepVisible, loadDraft, normalizeAnswers, saveDraft, clearDraft,
  validateStep, visibleSteps, visibleStages, type Answers, type StepId,
} from "@/lib/surveyWizard";

// ── Frozen copy of the OLD form's onSubmit (components/SurveyForm.tsx) ────────
interface OldValues {
  firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; gender: string;
  heightCm: number; weightKg: number; trainingGoal: string; experienceLevel: string; trainingDuration: string;
  injuryStatus: "Tak" | "Nie"; healthLimitations: string; sessionDuration: string; desiredWeeklyFrequency: number;
  activityLevel: string; sleepHours: string; stressLevel: number; planStylePreference: string; additionalInfo: string;
  priorityMuscle1: string; priorityMuscle2: string; priorityMuscle3: string; trainingLocation: string; equipment: string;
  cardioPreference: string; cardioFrequency: string; preferredCardioType: string; trainingMotivation: string;
  athleteStatus?: "Hobbystycznie" | "Zawodowo"; sportPerformanceNeeds: string[];
  avoidsAdvancedMethods?: "Tak" | "Nie"; advancedMethodsToAvoid: string[];
}
function oldPayload(
  data: OldValues,
  extra: { sportsPriorities: string[]; avoided: { id: number; name: string; reason: string }[]; otherText: string; otherReason: string; favorites: { name: string }[] },
  age: number,
) {
  const { avoidsAdvancedMethods, advancedMethodsToAvoid, injuryStatus, athleteStatus, sportPerformanceNeeds, ...rest } = data;
  const avoids = avoidsAdvancedMethods === "Tak" ? true : avoidsAdvancedMethods === "Nie" ? false : undefined;
  const isSport = rest.trainingGoal === "Cel sportowy";
  const map: Record<string, string> = { Hobbystycznie: "Tak — amatorsko", Zawodowo: "Tak — zawodowo" };
  return {
    ...rest,
    avoidedExercises: "",
    age,
    injuryStatus: injuryStatus === "Nie" ? "Brak" : injuryStatus,
    healthLimitations: injuryStatus === "Nie" ? "" : rest.healthLimitations,
    favoriteExercises: extra.favorites.length > 0 ? extra.favorites.map((e) => e.name).join(", ") : undefined,
    athleteStatus: isSport && athleteStatus ? (map[athleteStatus] ?? "Nie") : "Nie",
    sportDiscipline: undefined,
    sportPerformanceNeeds: isSport ? sportPerformanceNeeds : [],
    sportsPriorities: isSport ? extra.sportsPriorities : [],
    avoidsAdvancedMethods: avoids,
    advancedMethodsToAvoid: avoids === true ? advancedMethodsToAvoid : [],
    avoidedExerciseIds: extra.avoided.map((e) => e.id),
    avoidedExerciseReasons: Object.fromEntries(extra.avoided.filter((e) => e.reason.trim()).map((e) => [String(e.id), e.reason.trim()])),
    avoidedExerciseOtherText: extra.otherText.trim() || undefined,
    avoidedExerciseOtherReason: extra.otherReason.trim() || undefined,
  };
}

const base: Answers = {
  ...EMPTY_ANSWERS,
  firstName: "Anna", lastName: "Nowak", email: "anna@example.com", phone: "600100200",
  dateOfBirth: "1990-05-05", gender: "Kobieta", heightCm: 170, weightKg: "65.5",
  trainingGoal: "Budowa sylwetki", trainingMotivation: "Chcę być silniejsza",
  experienceLevel: "Początkujący", trainingLocation: "Siłownia",
  desiredWeeklyFrequency: 3, sessionDuration: "45–60 min",
  injuryStatus: "Nie", activityLevel: "Siedzący", sleepHours: "7–8 godzin", stressLevel: 4,
  cardioPreference: "Chętnie uwzględnię cardio w planie", cardioFrequency: "1 raz w tygodniu", preferredCardioType: "Marsz",
  planStylePreference: "Balans efektywności i wygody", favoriteExercises: [{ id: 1, name: "Przysiad" }, { id: 2, name: "Wiosłowanie" }],
  priorityMuscle1: "barki", additionalInfo: "Pracuję zmianowo",
};

function toOld(a: Answers): { values: OldValues; extra: Parameters<typeof oldPayload>[1]; age: number } {
  return {
    values: {
      firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, dateOfBirth: a.dateOfBirth, gender: a.gender,
      heightCm: a.heightCm!, weightKg: parseFloat(a.weightKg), trainingGoal: a.trainingGoal, experienceLevel: a.experienceLevel,
      trainingDuration: a.trainingDuration, injuryStatus: a.injuryStatus as "Tak" | "Nie", healthLimitations: a.healthLimitations,
      sessionDuration: a.sessionDuration, desiredWeeklyFrequency: a.desiredWeeklyFrequency!, activityLevel: a.activityLevel,
      sleepHours: a.sleepHours, stressLevel: a.stressLevel ?? 5, planStylePreference: a.planStylePreference, additionalInfo: a.additionalInfo,
      priorityMuscle1: a.priorityMuscle1, priorityMuscle2: a.priorityMuscle2, priorityMuscle3: a.priorityMuscle3,
      trainingLocation: a.trainingLocation, equipment: [...a.equipmentItems, a.equipmentOther.trim()].filter(Boolean).join(", "),
      cardioPreference: a.cardioPreference, cardioFrequency: a.cardioFrequency, preferredCardioType: a.preferredCardioType,
      trainingMotivation: a.trainingMotivation,
      athleteStatus: (a.athleteStatus || undefined) as OldValues["athleteStatus"], sportPerformanceNeeds: a.sportPerformanceNeeds,
      avoidsAdvancedMethods: (a.avoidsAdvancedMethods || undefined) as OldValues["avoidsAdvancedMethods"], advancedMethodsToAvoid: a.advancedMethodsToAvoid,
    },
    extra: {
      sportsPriorities: a.sportPerformanceNeeds.map((n) => ({ Dynamika: "dynamika", Szybkość: "szybkosc", Stabilizacja: "stabilizacja" })[n]!),
      avoided: a.avoidedExercises, otherText: a.avoidedOtherText, otherReason: a.avoidedOtherReason, favorites: a.favoriteExercises,
    },
    age: new Date().getFullYear() - 1990 - (new Date() < new Date(new Date().getFullYear(), 4, 5) ? 1 : 0),
  };
}

const paths: Record<string, Answers> = {
  "początkujący, siłownia, bez kontuzji": base,
  "brak aktywności fizycznej": { ...base, experienceLevel: "Brak aktywności fizycznej", activityLevel: "Siedzący" },
  "początkujący z kontuzją": { ...base, trainingDuration: "6 miesięcy", injuryStatus: "Tak", healthLimitations: "Ból kolana" },
  "początkujący, dom z wyposażeniem": { ...base, trainingLocation: "Dom", equipmentItems: ["Hantle", "Gumy oporowe"], equipmentOther: "Piłka" },
  "średniozaawansowany, metody i unikane ćwiczenia": {
    ...base, experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata",
    avoidedExercises: [{ id: 7, name: "Martwy ciąg", reason: "ból pleców" }, { id: 9, name: "Wyciskanie", reason: "" }],
    avoidedOtherText: "Skoki", avoidedOtherReason: "kolano", avoidsAdvancedMethods: "Tak", advancedMethodsToAvoid: ["Drop sety", "Rest-Pause"],
  },
  "zaawansowany, bez metod": { ...base, experienceLevel: "Zaawansowany", trainingDuration: "8 lat", avoidsAdvancedMethods: "Nie", priorityMuscle2: "plecy", priorityMuscle3: "uda" },
  "cel sportowy": { ...base, trainingGoal: "Cel sportowy", athleteStatus: "Zawodowo", sportPerformanceNeeds: ["Dynamika", "Stabilizacja"], experienceLevel: "Zaawansowany", trainingDuration: "5 lat" },
};

describe("payload identical to the old form, for every path from the inventory", () => {
  for (const [name, answers] of Object.entries(paths)) {
    it(name, () => {
      const { values, extra, age } = toOld(answers);
      const expected = oldPayload(values, extra, age);
      const actual = buildSurveyPayload(answers);
      // Same keys with the same values (old form also sent `hasAdditionalInfo`, not stored by the API).
      expect(actual).toEqual(expected);
    });
  }
});

describe("documented differences", () => {
  it("stress without an answer is not sent (stored as null), an answer is sent", () => {
    expect("stressLevel" in buildSurveyPayload({ ...base, stressLevel: undefined })).toBe(false);
    expect(buildSurveyPayload({ ...base, stressLevel: 7 }).stressLevel).toBe(7);
  });

  it("hidden answers are cleared, not sent", () => {
    const stale: Answers = {
      ...base, trainingLocation: "Siłownia", equipmentItems: ["Hantle"], equipmentOther: "Piłka", // gym → no equipment
      experienceLevel: "Brak aktywności fizycznej", trainingDuration: "3 lata", // no training time
      injuryStatus: "Nie", healthLimitations: "stary opis", // no health description
      avoidedExercises: [{ id: 7, name: "Martwy ciąg", reason: "x" }], avoidsAdvancedMethods: "Tak", advancedMethodsToAvoid: ["Drop sety"], // beginner
      athleteStatus: "Zawodowo", sportPerformanceNeeds: ["Dynamika"], // not a sport goal
    };
    const p = buildSurveyPayload(stale);
    expect(p).toMatchObject({
      equipment: "", trainingDuration: "", healthLimitations: "", avoidedExerciseIds: [], avoidsAdvancedMethods: undefined,
      advancedMethodsToAvoid: [], athleteStatus: "Nie", sportPerformanceNeeds: [], sportsPriorities: [],
    });
  });

  it("existing client: personal data comes from the client record", () => {
    const p = buildSurveyPayload(
      { ...base, firstName: "", lastName: "", email: "", phone: "" },
      { existingClient: true, firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phone: "500" },
    );
    expect(p).toMatchObject({ firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phone: "500" });
  });
});

describe("conditional questions", () => {
  const ids = (a: Answers, prefill = {}) => visibleSteps(a, prefill);

  it("appear only with their condition", () => {
    expect(ids(base)).not.toContain("sportStatus");
    expect(ids({ ...base, trainingGoal: "Cel sportowy" })).toEqual(expect.arrayContaining(["sportStatus", "sportNeeds"]));
    expect(ids(base)).not.toContain("equipment");
    expect(ids({ ...base, trainingLocation: "Dom" })).toContain("equipment");
    expect(ids({ ...base, trainingLocation: "Siłownia plenerowa" })).toContain("equipment");
    expect(ids(base)).not.toContain("healthDesc");
    expect(ids({ ...base, injuryStatus: "Tak" })).toContain("healthDesc");
    expect(ids(base)).not.toEqual(expect.arrayContaining(["avoided", "methods"]));
    expect(ids({ ...base, experienceLevel: "Zaawansowany" })).toEqual(expect.arrayContaining(["avoided", "methods"]));
    expect(ids({ ...base, experienceLevel: "Zaawansowany" })).not.toContain("methodsList");
    expect(ids({ ...base, experienceLevel: "Zaawansowany", avoidsAdvancedMethods: "Tak" })).toContain("methodsList");
    expect(ids({ ...base, experienceLevel: "Brak aktywności fizycznej" })).not.toContain("duration");
    expect(ids({ ...base, experienceLevel: "Początkujący" })).toContain("duration");
  });

  it("a dependent question always comes after the one it depends on", () => {
    const all = STAGES.flatMap((s) => s.steps);
    const after = (dep: StepId, on: StepId) => expect(all.indexOf(dep)).toBeGreaterThan(all.indexOf(on));
    after("sportStatus", "goal"); after("sportNeeds", "goal"); after("duration", "level"); after("equipment", "location");
    after("healthDesc", "injury"); after("avoided", "level"); after("methods", "level"); after("methodsList", "methods");
    after("cardioPref", "activity"); // cardio banner depends on daily activity
    after("frequency", "level"); // frequency hint depends on the level
  });

  it("the answer is cleared when the condition goes away", () => {
    const a = normalizeAnswers({ ...base, trainingLocation: "Dom", equipmentItems: ["Hantle"] });
    expect(a.equipmentItems).toEqual(["Hantle"]);
    expect(normalizeAnswers({ ...a, trainingLocation: "Siłownia" }).equipmentItems).toEqual([]);

    const s = normalizeAnswers({ ...base, trainingGoal: "Cel sportowy", athleteStatus: "Zawodowo", sportPerformanceNeeds: ["Dynamika"] });
    expect(s.athleteStatus).toBe("Zawodowo");
    expect(normalizeAnswers({ ...s, trainingGoal: "Poprawa kondycji" })).toMatchObject({ athleteStatus: "", sportPerformanceNeeds: [] });

    const adv = normalizeAnswers({ ...base, experienceLevel: "Zaawansowany", avoidsAdvancedMethods: "Tak", advancedMethodsToAvoid: ["Drop sety"], avoidedExercises: [{ id: 1, name: "x", reason: "" }] });
    expect(normalizeAnswers({ ...adv, experienceLevel: "Początkujący" })).toMatchObject({ avoidsAdvancedMethods: "", advancedMethodsToAvoid: [], avoidedExercises: [] });
    expect(normalizeAnswers({ ...adv, avoidsAdvancedMethods: "Nie" }).advancedMethodsToAvoid).toEqual([]);

    expect(normalizeAnswers({ ...base, injuryStatus: "Nie", healthLimitations: "x" }).healthLimitations).toBe("");
  });

  it("sport goal + 'Brak aktywności' contradict: the level is reset (as in the old form)", () => {
    expect(normalizeAnswers({ ...base, trainingGoal: "Cel sportowy", experienceLevel: "Brak aktywności fizycznej" }).experienceLevel).toBe("");
  });

  it("existing client: name and contact screens are skipped", () => {
    expect(isStepVisible("name", base, { existingClient: true })).toBe(false);
    expect(visibleStages(base, { existingClient: true })[0].visible).toEqual(["birth", "body"]);
  });
});

describe("question count (before = after)", () => {
  it("every question of the inventory sits on exactly one screen; screens per path", () => {
    const all = STAGES.flatMap((s) => s.steps);
    expect(new Set(all).size).toBe(all.length);
    expect(STAGES).toHaveLength(9);
    // beginner / gym / no injury: 22 of the 29 screens
    expect(visibleSteps(base)).toHaveLength(22);
    expect(visibleSteps({ ...base, experienceLevel: "Zaawansowany", trainingLocation: "Dom", injuryStatus: "Tak", trainingGoal: "Cel sportowy", avoidsAdvancedMethods: "Tak" })).toHaveLength(29);
  });
});

describe("validation as in the old form", () => {
  it("required answers block; optional ones do not", () => {
    expect(validateStep("injury", EMPTY_ANSWERS)).toBeTruthy(); // health question is mandatory now
    expect(validateStep("injury", { ...base, injuryStatus: "Nie" })).toBeNull();
    expect(validateStep("healthDesc", { ...base, injuryStatus: "Tak", healthLimitations: " " })).toBeTruthy();
    expect(validateStep("body", { ...base, heightCm: 79 })).toBe("Wzrost musi być między 80 a 260 cm");
    expect(validateStep("body", { ...base, weightKg: "19" })).toBe("Waga musi być między 20 a 400 kg");
    expect(validateStep("birth", { ...base, dateOfBirth: "2999-01-01" })).toBeTruthy();
    expect(validateStep("contact", { ...base, email: "zly" })).toContain("E-mail jest wymagany");
    expect(validateStep("frequency", { ...base, desiredWeeklyFrequency: 8 })).toBeTruthy();
    expect(validateStep("equipment", { ...base, equipmentItems: [], equipmentOther: "" })).toBeTruthy();
    expect(validateStep("equipment", { ...base, equipmentOther: "Piłka" })).toBeNull();
    for (const optional of ["motivation", "duration", "stress", "cardioPref", "cardioFreq", "cardioType", "avoided", "favorite", "priority", "methods", "additional"] as StepId[]) {
      expect(validateStep(optional, EMPTY_ANSWERS), optional).toBeNull();
    }
  });
});

describe("autosave", () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const withWindow = <T,>(fn: () => T) => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: ls };
    try { return fn(); } finally { delete (globalThis as unknown as { window?: unknown }).window; }
  };

  it("key is bound to the invitation token; resume returns answers and step; cleared after sending", () => {
    withWindow(() => {
      saveDraft("a".repeat(64), { v: 1, answers: { ...base, firstName: "Ola" }, stepId: "goal" });
      expect(loadDraft("b".repeat(64))).toBeNull(); // another invitation
      const d = loadDraft("a".repeat(64))!;
      expect(d.stepId).toBe("goal");
      expect(d.answers.firstName).toBe("Ola");
      clearDraft("a".repeat(64));
      expect(loadDraft("a".repeat(64))).toBeNull();
    });
  });

  it("broken or unavailable storage never throws", () => {
    withWindow(() => {
      store.set("optimatren-wywiad:" + "c".repeat(16), "{nie json");
      expect(loadDraft("c".repeat(64))).toBeNull();
    });
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } },
    };
    expect(() => { saveDraft("d".repeat(64), { v: 1, answers: base, stepId: "goal" }); expect(loadDraft("d".repeat(64))).toBeNull(); clearDraft("d".repeat(64)); }).not.toThrow();
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
