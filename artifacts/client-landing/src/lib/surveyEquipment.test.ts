import { describe, it, expect } from "vitest";
import {
  equipmentHint, equipmentOptionsFor, showEquipmentField, parseEquipment,
  NO_EQUIPMENT_HOME_HINT, BANDS_ONLY_HOME_HINT, BOXING_BAG, HAMMER_AND_TYRE,
  JUMP_EXPERIENCE_OPTIONS, JUMP_EXPERIENCE_QUESTION, jumpExperienceCode, showJumpExperience,
} from "@workspace/survey-config";
import { EMPTY_ANSWERS, isStepVisible, normalizeAnswers, validateStep, visibleSteps, type Answers } from "./surveyWizard";

const GOALS = ["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa kondycji", "Poprawa sprawności", "Cel sportowy"];
const SPORTY = ["Poprawa sprawności", "Cel sportowy"];
const PLACES = ["Dom", "Siłownia plenerowa", "Siłownia"];
const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];

describe("teksty pod listą sprzętu (4a, 4b): każdy tylko w swoim warunku", () => {
  it("tekst dokładnie jak w decyzji właściciela", () => {
    expect(NO_EQUIPMENT_HOME_HINT).toBe("Bez sprzętu część ćwiczeń nie będzie możliwa, a efekty będą wolniejsze. Do pełnego treningu wystarczy guma oporowa, a para hantli przyspieszy postępy.");
    expect(BANDS_ONLY_HOME_HINT).toBe("Guma wystarczy na start. Para hantli pozwoli bezpiecznie zwiększać obciążenie, gdy ćwiczenia staną się łatwe.");
  });
  it("4a: dom + „Brak sprzętu” — tylko wtedy", () => {
    expect(equipmentHint({ trainingLocation: "Dom", items: ["Brak sprzętu"] })).toBe(NO_EQUIPMENT_HOME_HINT);
    for (const place of ["Siłownia plenerowa", "Siłownia", undefined]) expect(equipmentHint({ trainingLocation: place, items: ["Brak sprzętu"] })).toBeNull();
    expect(equipmentHint({ trainingLocation: "Dom", items: [] })).toBeNull();
    expect(equipmentHint({ trainingLocation: "Dom", items: ["Hantle"] })).toBeNull();
  });
  it("4b: dom + tylko guma — BA i początkujący (i gdy poziom nieznany); Ś/Z nie", () => {
    for (const lvl of LEVELS.slice(0, 2)) expect(equipmentHint({ trainingLocation: "Dom", items: ["Gumy oporowe"], effectiveLevel: lvl })).toBe(BANDS_ONLY_HOME_HINT);
    for (const lvl of LEVELS.slice(2)) expect(equipmentHint({ trainingLocation: "Dom", items: ["Gumy oporowe"], effectiveLevel: lvl })).toBeNull();
    expect(equipmentHint({ trainingLocation: "Dom", items: ["Gumy oporowe"], effectiveLevel: null })).toBe(BANDS_ONLY_HOME_HINT); // poziom nieznany → wszyscy z samą gumą
    expect(equipmentHint({ trainingLocation: "Dom", items: ["Gumy oporowe", "Hantle"], effectiveLevel: "Początkujący" })).toBeNull();
    expect(equipmentHint({ trainingLocation: "Dom", items: ["Gumy oporowe"], other: "skakanka", effectiveLevel: "Początkujący" })).toBeNull();
    expect(equipmentHint({ trainingLocation: "Siłownia plenerowa", items: ["Gumy oporowe"], effectiveLevel: "Początkujący" })).toBeNull();
  });
});

describe("worek bokserski i młot z oponą (4d)", () => {
  it("widoczne tylko przy 2 celach; przy innych oba ukryte", () => {
    for (const goal of GOALS) for (const place of PLACES) {
      const o = equipmentOptionsFor(goal, place);
      if (SPORTY.includes(goal)) {
        expect(o).toContain(HAMMER_AND_TYRE);
        expect(o.includes(BOXING_BAG)).toBe(place === "Dom"); // worek tylko w domu, na siłowni jest domyślnie
      } else {
        expect(o).not.toContain(BOXING_BAG);
        expect(o).not.toContain(HAMMER_AND_TYRE);
      }
    }
    expect(equipmentOptionsFor(undefined, "Dom")).not.toContain(BOXING_BAG);
  });
  it("„Brak sprzętu” zostaje na końcu listy; siłownia pokazuje tylko młot z oponą", () => {
    const home = equipmentOptionsFor("Cel sportowy", "Dom");
    expect(home[home.length - 1]).toBe("Brak sprzętu");
    expect(equipmentOptionsFor("Cel sportowy", "Siłownia")).toEqual([HAMMER_AND_TYRE]);
  });
  it("ekran sprzętu na siłowni tylko przy 2 celach", () => {
    for (const goal of GOALS) expect(showEquipmentField("Siłownia", goal)).toBe(SPORTY.includes(goal));
    expect(showEquipmentField("Siłownia")).toBe(false);
    expect(showEquipmentField("Dom", "Budowa sylwetki")).toBe(true);
  });
  it("zapisany ciąg znaków wraca do pozycji listy (nie do „Inny sprzęt”)", () => {
    expect(parseEquipment("Gumy oporowe, Worek bokserski, Młot i opona")).toEqual({ items: ["Gumy oporowe", BOXING_BAG, HAMMER_AND_TYRE], other: "" });
  });
});

describe("ekran sprzętu w wywiadzie", () => {
  const a = (over: Partial<Answers>): Answers => ({ ...EMPTY_ANSWERS, ...over });
  it("na siłowni: ekran tylko przy 2 celach, i jest opcjonalny", () => {
    expect(isStepVisible("equipment", a({ trainingLocation: "Siłownia", trainingGoal: "Cel sportowy" }))).toBe(true);
    expect(isStepVisible("equipment", a({ trainingLocation: "Siłownia", trainingGoal: "Budowa sylwetki" }))).toBe(false);
    expect(validateStep("equipment", a({ trainingLocation: "Siłownia", trainingGoal: "Cel sportowy" }))).toBeNull();
    expect(validateStep("equipment", a({ trainingLocation: "Dom", trainingGoal: "Cel sportowy" }))).not.toBeNull();
  });
  it("zmiana celu usuwa worek i młot z odpowiedzi; siłownia zostawia tylko młot", () => {
    const home = normalizeAnswers(a({ trainingLocation: "Dom", trainingGoal: "Budowa sylwetki", equipmentItems: ["Gumy oporowe", BOXING_BAG, HAMMER_AND_TYRE] }));
    expect(home.equipmentItems).toEqual(["Gumy oporowe"]);
    const gym = normalizeAnswers(a({ trainingLocation: "Siłownia", trainingGoal: "Cel sportowy", equipmentItems: ["Hantle", HAMMER_AND_TYRE], equipmentOther: "x" }));
    expect(gym.equipmentItems).toEqual([HAMMER_AND_TYRE]);
    expect(gym.equipmentOther).toBe("");
    expect(normalizeAnswers(a({ trainingLocation: "Siłownia", trainingGoal: "Budowa sylwetki", equipmentItems: [HAMMER_AND_TYRE] })).equipmentItems).toEqual([]);
  });
});

describe("pytanie o doświadczenie ze skokami (5b)", () => {
  const a = (over: Partial<Answers>): Answers => ({ ...EMPTY_ANSWERS, ...over });
  it("treść pytania i odpowiedzi dokładnie jak w decyzji", () => {
    expect(JUMP_EXPERIENCE_QUESTION).toBe("Czy masz doświadczenie ze skokami (np. skakanie na skrzynię, przeskoki)?");
    expect([...JUMP_EXPERIENCE_OPTIONS]).toEqual(["Nie — dopiero zaczynam", "Trochę — okazjonalnie", "Tak — robię regularnie"]);
  });
  it("widoczne tylko przy celu „Cel sportowy”, tuż po pytaniach o sport", () => {
    for (const goal of GOALS) expect(isStepVisible("jumps", a({ trainingGoal: goal }))).toBe(goal === "Cel sportowy");
    expect(isStepVisible("jumps", a({ trainingGoal: "" }))).toBe(false);
    const ids = visibleSteps(a({ trainingGoal: "Cel sportowy" }), { existingClient: true });
    expect(ids.indexOf("jumps")).toBe(ids.indexOf("sportNeeds") + 1);
    expect(visibleSteps(a({ trainingGoal: "Budowa sylwetki" })).includes("jumps")).toBe(false);
  });
  it("jest wymagane, a po zmianie celu odpowiedź znika i nie trafia do wysyłki", () => {
    expect(validateStep("jumps", a({ trainingGoal: "Cel sportowy" }))).not.toBeNull();
    expect(validateStep("jumps", a({ trainingGoal: "Cel sportowy", jumpExperience: JUMP_EXPERIENCE_OPTIONS[1] }))).toBeNull();
    expect(normalizeAnswers(a({ trainingGoal: "Poprawa kondycji", jumpExperience: JUMP_EXPERIENCE_OPTIONS[2] })).jumpExperience).toBe("");
    expect(normalizeAnswers(a({ trainingGoal: "Cel sportowy", jumpExperience: JUMP_EXPERIENCE_OPTIONS[2] })).jumpExperience).toBe(JUMP_EXPERIENCE_OPTIONS[2]);
  });
  it("kody odpowiedzi", () => {
    expect(JUMP_EXPERIENCE_OPTIONS.map((o) => jumpExperienceCode(o))).toEqual(["nie", "troche", "tak"]);
    expect(jumpExperienceCode("cokolwiek")).toBeNull();
    expect(jumpExperienceCode(undefined)).toBeNull();
    expect(showJumpExperience("Cel sportowy")).toBe(true);
    expect(showJumpExperience("Poprawa sprawności")).toBe(false);
  });
});

describe("odpowiedź o skokach: nowe brzmienie bez płci i zgodność z zapisanym starym", () => {
  it("stare „Trochę — robiłem/am okazjonalnie” nadal znaczy „trochę”", () => {
    expect(jumpExperienceCode("Trochę — okazjonalnie")).toBe("troche");
    expect(jumpExperienceCode("Trochę — robiłem/am okazjonalnie")).toBe("troche");
    expect(jumpExperienceCode("Nie — dopiero zaczynam")).toBe("nie");
    expect(jumpExperienceCode("Tak — robię regularnie")).toBe("tak");
    expect(jumpExperienceCode("coś innego")).toBeNull();
  });
});
