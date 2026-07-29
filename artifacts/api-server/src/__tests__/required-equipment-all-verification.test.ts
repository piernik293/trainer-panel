/**
 * Live verification: required_equipment_all for all 20 bench-gated exercises.
 *
 * Groups (from seed):
 *   Sztanga AND Ławka  : 1, 114, 157, 158, 171, 213
 *   Hantle AND Ławka   : 113, 129, 131, 139, 151, 170, 172, 178, 179, 185, 216
 *   Maszyna AND Ławka  : 173
 *   (Szt|Han) AND Ławka: 104, 206
 *
 * Profiles tested:
 *   1. Hantle only           → reject every Hantle-AND-Ławka exercise
 *   2. Hantle + Ławka        → allow  Hantle-AND-Ławka exercises
 *   3. Sztanga only          → reject every Sztanga-AND-Ławka exercise
 *   4. Sztanga + Ławka       → allow  Sztanga-AND-Ławka exercises
 *   5. Ławka only            → reject all exercises requiring external load
 *   6. Maszyna only          → reject id=173
 *   7. Maszyna + Ławka       → allow  id=173
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db, exercisesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { isEquipmentCompatible } from "../services/planDraftDayRecommendationsService";

const TARGET_IDS = [1,104,113,114,129,131,139,151,157,158,170,171,172,173,178,179,185,206,213,216];

// Expected required_equipment_all per exercise (from seed)
const EXPECTED_REQ_ALL: Record<number, string[]> = {
  1:   ["Ławka"],  114: ["Ławka"],  157: ["Ławka"],  158: ["Ławka"],
  171: ["Ławka"],  213: ["Ławka"],
  113: ["Ławka"],  129: ["Ławka"],  131: ["Ławka"],  139: ["Ławka"],
  151: ["Ławka"],  170: ["Ławka"],  172: ["Ławka"],  178: ["Ławka"],
  179: ["Ławka"],  185: ["Ławka"],  216: ["Ławka"],
  173: ["Ławka"],
  104: ["Ławka"],  206: ["Ławka"],
};

type ExRow = { id: number; name: string; equipment: string[]; requiredEquipmentAll: string[] };
let rows: ExRow[] = [];

beforeAll(async () => {
  rows = await db
    .select({
      id: exercisesTable.id,
      name: exercisesTable.name,
      equipment: exercisesTable.equipment,
      requiredEquipmentAll: exercisesTable.requiredEquipmentAll,
    })
    .from(exercisesTable)
    .where(inArray(exercisesTable.id, TARGET_IDS));
});

// ─── DB → engine value verification ──────────────────────────────────────────

describe("DB → engine: required_equipment_all matches expected seed value", () => {
  for (const id of TARGET_IDS) {
    it(`id=${id} has required_equipment_all=["Ławka"]`, () => {
      const row = rows.find((r) => r.id === id);
      expect(row, `id=${id} not found in DB`).toBeDefined();
      expect(row!.requiredEquipmentAll).toEqual(EXPECTED_REQ_ALL[id]);
    });
  }
});

// ─── Profile 1: Hantle only → reject every Hantle-AND-Ławka exercise ─────────

describe("Profile 1 — Hantle only: rejects Hantle+Ławka exercises", () => {
  const HANTLE_AND_LAWKA = [113,129,131,139,151,170,172,178,179,185,216];
  for (const id of HANTLE_AND_LAWKA) {
    it(`id=${id} rejected`, () => {
      const row = rows.find((r) => r.id === id)!;
      expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle")).toBe(false);
    });
  }
  it("id=104 (Szt|Han AND Ławka) rejected with Hantle only", () => {
    const row = rows.find((r) => r.id === 104)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle")).toBe(false);
  });
  it("id=206 (Szt|Han AND Ławka) rejected with Hantle only", () => {
    const row = rows.find((r) => r.id === 206)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle")).toBe(false);
  });
});

// ─── Profile 2: Hantle + Ławka → allow Hantle-AND-Ławka exercises ────────────

describe("Profile 2 — Hantle + Ławka: allows Hantle+Ławka exercises", () => {
  const HANTLE_AND_LAWKA = [113,129,131,139,151,170,172,178,179,185,216];
  for (const id of HANTLE_AND_LAWKA) {
    it(`id=${id} allowed`, () => {
      const row = rows.find((r) => r.id === id)!;
      expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle,Ławka")).toBe(true);
    });
  }
  it("id=104 (Szt|Han AND Ławka) allowed with Hantle + Ławka", () => {
    const row = rows.find((r) => r.id === 104)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle,Ławka")).toBe(true);
  });
  it("id=206 (Szt|Han AND Ławka) allowed with Hantle + Ławka", () => {
    const row = rows.find((r) => r.id === 206)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Hantle,Ławka")).toBe(true);
  });
});

// ─── Profile 3: Sztanga only → reject every Sztanga-AND-Ławka exercise ───────

describe("Profile 3 — Sztanga only: rejects Sztanga+Ławka exercises", () => {
  const SZTANGA_AND_LAWKA = [1,114,157,158,171,213];
  for (const id of SZTANGA_AND_LAWKA) {
    it(`id=${id} rejected`, () => {
      const row = rows.find((r) => r.id === id)!;
      expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga")).toBe(false);
    });
  }
  it("id=104 (Szt|Han AND Ławka) rejected with Sztanga only", () => {
    const row = rows.find((r) => r.id === 104)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga")).toBe(false);
  });
  it("id=206 (Szt|Han AND Ławka) rejected with Sztanga only", () => {
    const row = rows.find((r) => r.id === 206)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga")).toBe(false);
  });
});

// ─── Profile 4: Sztanga + Ławka → allow Sztanga-AND-Ławka exercises ──────────

describe("Profile 4 — Sztanga + Ławka: allows Sztanga+Ławka exercises", () => {
  const SZTANGA_AND_LAWKA = [1,114,157,158,171,213];
  for (const id of SZTANGA_AND_LAWKA) {
    it(`id=${id} allowed`, () => {
      const row = rows.find((r) => r.id === id)!;
      expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga,Ławka")).toBe(true);
    });
  }
  it("id=104 (Szt|Han AND Ławka) allowed with Sztanga + Ławka", () => {
    const row = rows.find((r) => r.id === 104)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga,Ławka")).toBe(true);
  });
  it("id=206 (Szt|Han AND Ławka) allowed with Sztanga + Ławka", () => {
    const row = rows.find((r) => r.id === 206)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Sztanga,Ławka")).toBe(true);
  });
});

// ─── Profile 5: Ławka only → reject all (no external load) ──────────────────

describe("Profile 5 — Ławka only: rejects all 20 exercises (all need external load)", () => {
  for (const id of TARGET_IDS) {
    it(`id=${id} rejected with Ławka only`, () => {
      const row = rows.find((r) => r.id === id)!;
      expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Ławka")).toBe(false);
    });
  }
});

// ─── Profile 6: Maszyna only → reject id=173 ─────────────────────────────────

describe("Profile 6 — Maszyna only: rejects id=173 (AND Ławka unsatisfied)", () => {
  it("id=173 rejected with Maszyna only", () => {
    const row = rows.find((r) => r.id === 173)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Maszyna")).toBe(false);
  });
});

// ─── Profile 7: Maszyna + Ławka → allow id=173 ───────────────────────────────

describe("Profile 7 — Maszyna + Ławka: allows id=173", () => {
  it("id=173 allowed with Maszyna + Ławka", () => {
    const row = rows.find((r) => r.id === 173)!;
    expect(isEquipmentCompatible(row.equipment, row.requiredEquipmentAll, "Maszyna,Ławka")).toBe(true);
  });
});
