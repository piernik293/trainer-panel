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

// ─── Location-aware: gym without listed equipment = standard gym ──────────────
// Decision (22.10): a client training at "Siłownia" who left equipment empty
// gets the standard gym equipment in the generator AND in compatibility
// checks; home/outdoor clients without equipment stay bodyweight-only.

import {
  buildCompatibilityFilter,
  effectiveClientEquipment,
  getExerciseCompatibilityError,
} from "../services/planDraftDayRecommendationsService";

describe("Siłownia + empty equipment → standard gym", () => {
  const benchPress = { id: 1, name: "Wyciskanie sztangi leżąc", trainingLocation: ["Siłownia"], equipment: ["Sztanga"], requiredEquipmentAll: ["Ławka"] };
  const cableRow = { id: 2, name: "Wiosłowanie na wyciągu", trainingLocation: ["Siłownia"], equipment: ["Wyciąg"], requiredEquipmentAll: [] };
  const pushUp = { id: 3, name: "Pompki", trainingLocation: ["Siłownia", "Dom"], equipment: ["Masa własnego ciała"], requiredEquipmentAll: [] };

  for (const empty of [null, undefined, "", "   "]) {
    it(`effectiveClientEquipment(${JSON.stringify(empty)}, "Siłownia") lists standard gym equipment`, () => {
      const eq = effectiveClientEquipment(empty, "Siłownia");
      expect(eq).toContain("Wyciąg");
      expect(eq).toContain("Ławeczka treningowa");
    });
  }

  it("compatibility filter admits barbell, bench and cable exercises", () => {
    const keep = buildCompatibilityFilter("Siłownia", "", new Set());
    expect(keep(benchPress)).toBe(true);
    expect(keep(cableRow)).toBe(true);
    expect(keep(pushUp)).toBe(true);
  });

  it("manual plan save check reports no equipment error", () => {
    expect(getExerciseCompatibilityError(benchPress, { trainingLocation: "Siłownia", equipment: null })).toBeNull();
  });

  it("listed equipment is never overridden", () => {
    expect(effectiveClientEquipment("Hantle", "Siłownia")).toBe("Hantle");
    expect(buildCompatibilityFilter("Siłownia", "Hantle", new Set())(cableRow)).toBe(false);
  });

  it("Dom / Siłownia plenerowa / no location without equipment stay bodyweight-only", () => {
    for (const loc of ["Dom", "Siłownia plenerowa", null]) {
      expect(effectiveClientEquipment("", loc)).toBe("");
      const keep = buildCompatibilityFilter(loc, "", new Set());
      expect(keep({ ...cableRow, trainingLocation: [] }), String(loc)).toBe(false);
      expect(keep({ ...pushUp, trainingLocation: [] }), String(loc)).toBe(true);
    }
  });
});

// ─── Generator default (planDraftInput) matches the compatibility check ──────
// Decision (22.10): Dom / Siłownia plenerowa without equipment = bodyweight
// only, in the plan-draft generator too (not a home-gym equipment guess).

import { defaultEquipmentForLocation, FULL_GYM_EQUIPMENT } from "../services/equipmentNormalizer";

describe("defaultEquipmentForLocation — same rule as compatibility", () => {
  it("Dom and Siłownia plenerowa without equipment → bodyweight only", () => {
    expect(defaultEquipmentForLocation("Dom")).toEqual(["Masa własnego ciała"]);
    expect(defaultEquipmentForLocation("Siłownia plenerowa")).toEqual(["Masa własnego ciała"]);
  });

  it("Siłownia without equipment → standard gym", () => {
    expect(defaultEquipmentForLocation("Siłownia")).toEqual(FULL_GYM_EQUIPMENT);
  });
});
