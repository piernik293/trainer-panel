import { describe, it, expect } from "vitest";
import { VALID_EQUIPMENT } from "../routes/exercises";
import { IMPORT_EQUIPMENT } from "../services/paczkaImport";
import { weightStepFor } from "../services/training";
import { isEquipmentCompatible, effectiveClientEquipment } from "../services/planDraftDayRecommendationsService";

const NEW = ["Talerz obciążeniowy", "Uchwyty do pompek", "Kółka gimnastyczne"] as const;

describe("zamknięta lista sprzętu — talerz, uchwyty do pompek, kółka gimnastyczne", () => {
  it("formularz/API i import paczek przyjmują nowe wartości obok dotychczasowych", () => {
    for (const v of NEW) {
      expect(VALID_EQUIPMENT.has(v)).toBe(true);
      expect(IMPORT_EQUIPMENT.has(v)).toBe(true);
    }
    for (const v of ["Piłka lekarska", "Masa własnego ciała", "Inny"]) expect(IMPORT_EQUIPMENT.has(v)).toBe(true);
  });

  it("nieznane warianty nadal odrzucane", () => {
    for (const v of ["Talerz 10 kg", "Kółka", "Uchwyty"]) {
      expect(VALID_EQUIPMENT.has(v)).toBe(false);
      expect(IMPORT_EQUIPMENT.has(v)).toBe(false);
    }
  });

  it("ciężar: talerz ma pole ciężaru, uchwyty i kółka nie", () => {
    expect(weightStepFor(["Talerz obciążeniowy"]).showWeight).toBe(true);
    expect(weightStepFor(["Uchwyty do pompek"]).showWeight).toBe(false);
    expect(weightStepFor(["Kółka gimnastyczne"]).showWeight).toBe(false);
  });

  it("talerz pasuje do „Sztanga i talerze” z wywiadu i do domyślnej siłowni", () => {
    expect(isEquipmentCompatible(["Talerz obciążeniowy"], [], "Sztanga i talerze, Hantle")).toBe(true);
    expect(isEquipmentCompatible(["Talerz obciążeniowy"], [], effectiveClientEquipment(null, "Siłownia"))).toBe(true);
    expect(isEquipmentCompatible(["Talerz obciążeniowy"], [], "Hantle, Gumy oporowe")).toBe(false);
  });

  it("kółka i uchwyty wymagają zadeklarowanego sprzętu (klient bez sprzętu ich nie dostanie)", () => {
    expect(isEquipmentCompatible(["Kółka gimnastyczne"], [], "Brak sprzętu")).toBe(false);
    expect(isEquipmentCompatible(["Uchwyty do pompek"], [], "Brak sprzętu")).toBe(false);
    expect(isEquipmentCompatible(["Kółka gimnastyczne"], [], "Kółka gimnastyczne")).toBe(true);
    // ćwiczenie z alternatywą „Masa własnego ciała” pozostaje dostępne bez uchwytów
    expect(isEquipmentCompatible(["Uchwyty do pompek", "Masa własnego ciała"], [], "Brak sprzętu")).toBe(true);
  });
});
