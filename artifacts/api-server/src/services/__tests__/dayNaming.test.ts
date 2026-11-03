import { describe, it, expect } from "vitest";
import { dayAccent, dayNames, usedEquipment } from "../dayNaming";

const ex = (name: string, group: string, equipment: string[] = ["Masa własnego ciała"], jump = false) => ({ name, mainMuscleGroup: group, equipment, jump });

describe("nazwy dni wg akcentu", () => {
  const barRails = [ex("Podciąganie", "Plecy", ["Drążek"]), ex("Dipy na poręczach", "Klatka piersiowa", ["Poręcze"]), ex("Pompki", "Klatka piersiowa")];
  const legsJump = [ex("Przysiad", "Uda"), ex("Wykrok", "Pośladki"), ex("Wspięcia", "Łydki"), ex("Skok w dal", "Uda", ["Masa własnego ciała"], true)];
  const upper = [ex("Pompki", "Klatka piersiowa"), ex("Wiosłowanie gumą", "Plecy", ["Gumy oporowe"]), ex("Unoszenie bokiem", "Barki", ["Gumy oporowe"])];
  it("akcenty", () => {
    expect(dayAccent({ exercises: barRails })).toBe("Drążek i poręcze");
    expect(dayAccent({ exercises: legsJump })).toBe("Nogi i skoki");
    expect(dayAccent({ exercises: upper })).toBe("Góra ciała");
    expect(dayAccent({ exercises: [] })).toBeNull();
  });
  it("nazwy planu: unikalne, powtórzone dostają A/B, brak akcentu → Dzień N", () => {
    expect(dayNames([{ exercises: barRails }, { exercises: legsJump }, { exercises: upper }])).toEqual(["Drążek i poręcze", "Nogi i skoki", "Góra ciała"]);
    expect(dayNames([{ exercises: upper }, { exercises: legsJump }, { exercises: upper }])).toEqual(["Góra ciała A", "Nogi i skoki", "Góra ciała B"]);
    expect(dayNames([{ exercises: [] }])).toEqual(["Dzień 1"]);
  });
  it("sprzęt dnia: tylko użyty, bez masy ciała", () => {
    expect(usedEquipment(upper)).toEqual(["Gumy oporowe"]);
    expect(usedEquipment(legsJump)).toEqual([]);
    expect(usedEquipment(barRails)).toEqual(["Drążek", "Poręcze"]);
  });
});
