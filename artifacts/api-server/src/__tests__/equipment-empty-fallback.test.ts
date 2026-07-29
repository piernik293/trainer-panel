/**
 * Focused tests: empty / missing client equipment normalizes to bodyweight-only.
 *
 * Verifies that undefined, null, and empty-string equipment never grant access
 * to dumbbell, barbell, machine, cable, bench, band, handle or ring exercises.
 */

import { describe, it, expect } from "vitest";
import { isEquipmentCompatible } from "../services/planDraftDayRecommendationsService";

// ─── Empty / missing → BW-only ────────────────────────────────────────────────

describe("empty equipment — true bodyweight exercises pass", () => {
  for (const raw of [undefined, null, "", "  "] as const) {
    const label = JSON.stringify(raw) ?? "undefined";
    it(`equipment=${label}: BW exercise (Masa własnego ciała) allowed`, () => {
      expect(isEquipmentCompatible(["Masa własnego ciała"], [], raw)).toBe(true);
    });
    it(`equipment=${label}: BW alias (Brak sprzętu) allowed`, () => {
      expect(isEquipmentCompatible(["Brak sprzętu"], [], raw)).toBe(true);
    });
    it(`equipment=${label}: no-equipment exercise (empty array) allowed`, () => {
      expect(isEquipmentCompatible([], [], raw)).toBe(true);
    });
  }
});

describe("empty equipment — non-BW exercises rejected", () => {
  const NON_BW_EXERCISES: Array<[string, string[]]> = [
    ["dumbbells only",          ["Hantle"]],
    ["barbell only",            ["Sztanga"]],
    ["kettlebell only",         ["Kettlebell"]],
    ["machine only",            ["Maszyna"]],
    ["cable only",              ["Wyciąg"]],
    ["bench only",              ["Ławka"]],
    ["TRX only",                ["TRX"]],
    ["resistance band only",    ["Gumy oporowe"]],
    ["pull-up bar only",        ["Drążek"]],
    ["parallel bars only",      ["Poręcze"]],
    ["dumbbell OR kettlebell",  ["Hantle", "Kettlebell"]],
  ];

  for (const [label, eq] of NON_BW_EXERCISES) {
    it(`${label} rejected with undefined equipment`, () => {
      expect(isEquipmentCompatible(eq, [], undefined)).toBe(false);
    });
    it(`${label} rejected with null equipment`, () => {
      expect(isEquipmentCompatible(eq, [], null)).toBe(false);
    });
    it(`${label} rejected with empty-string equipment`, () => {
      expect(isEquipmentCompatible(eq, [], "")).toBe(false);
    });
  }
});

describe("empty equipment — required_equipment_all also rejected", () => {
  it("bench exercise (Hantle AND Ławka) rejected when equipment missing", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], undefined)).toBe(false);
  });
  it("barbell bench (Sztanga AND Ławka) rejected when equipment missing", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], null)).toBe(false);
  });
});

// ─── Populated equipment behaves correctly ────────────────────────────────────

describe("Hantle profile — correct allow / reject", () => {
  const profile = "Hantle,Masa własnego ciała";

  it("dumbbell-only exercise allowed", () => {
    expect(isEquipmentCompatible(["Hantle"], [], profile)).toBe(true);
  });
  it("BW exercise allowed", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], [], profile)).toBe(true);
  });
  it("dumbbell + bench (AND) rejected — no Ławka", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(false);
  });
  it("barbell exercise rejected — no Sztanga", () => {
    expect(isEquipmentCompatible(["Sztanga"], [], profile)).toBe(false);
  });
});

describe("Hantle + Ławka profile — bench exercises allowed", () => {
  const profile = "Hantle,Ławka,Masa własnego ciała";

  it("dumbbell + bench (AND) allowed", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(true);
  });
  it("BW exercise still allowed", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], [], profile)).toBe(true);
  });
  it("cable exercise rejected — no Wyciąg", () => {
    expect(isEquipmentCompatible(["Wyciąg"], [], profile)).toBe(false);
  });
});
