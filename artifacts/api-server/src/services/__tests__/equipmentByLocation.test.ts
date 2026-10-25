import { describe, expect, it } from "vitest";
import { expandEquipmentForLocation, FULL_GYM_EQUIPMENT, normalizeEquipmentList, homeWithoutBackEquipment } from "../equipmentNormalizer";
import { isEquipmentCompatible } from "../planDraftDayRecommendationsService";

describe("sprzęt wg miejsca (worek bokserski, młot i opona)", () => {
  it("siłownia zawiera worek bokserski, ale nie młot z oponą", () => {
    const gym = expandEquipmentForLocation([], "Siłownia");
    expect(gym).toContain("Worek bokserski");
    expect(gym).not.toContain("Młot i opona");
    expect(FULL_GYM_EQUIPMENT).toContain("Worek bokserski");
  });
  it("młot z oponą tylko gdy klient sam zaznaczy; dom i plener nie dostają worka domyślnie", () => {
    expect(expandEquipmentForLocation(["Młot i opona"], "Siłownia")).toContain("Młot i opona");
    expect(expandEquipmentForLocation([], "Dom")).not.toContain("Worek bokserski");
    expect(expandEquipmentForLocation([], "Siłownia plenerowa")).not.toContain("Worek bokserski");
    expect(expandEquipmentForLocation([], "Siłownia plenerowa")).not.toContain("Młot i opona");
  });
  it("ćwiczenie z workiem/młotem przechodzi filtr tylko z odpowiednim sprzętem", () => {
    expect(isEquipmentCompatible(["Worek bokserski"], [], "Worek bokserski, Hantle")).toBe(true);
    expect(isEquipmentCompatible(["Worek bokserski"], [], "Hantle")).toBe(false);
    expect(isEquipmentCompatible(["Młot i opona"], [], "Hantle, Młot i opona")).toBe(true);
    expect(isEquipmentCompatible(["Młot i opona"], [], "Worek bokserski")).toBe(false);
    expect(isEquipmentCompatible(["Worek bokserski"], [], expandEquipmentForLocation([], "Siłownia").join(", "))).toBe(true);
  });
  it("aliasy trafiają na nazwy kanoniczne", () => {
    expect(normalizeEquipmentList("worek, młot z oponą")).toEqual(["Worek bokserski", "Młot i opona"]);
  });
  it("dom bez gumy, hantli i drążka — ostrzeżenie; z którymkolwiek — nie", () => {
    expect(homeWithoutBackEquipment("Dom", ["Brak sprzętu"])).toBe(true);
    expect(homeWithoutBackEquipment("Dom", ["Gumy oporowe"])).toBe(false);
    expect(homeWithoutBackEquipment("Siłownia", [])).toBe(false);
  });
});
