/**
 * Focused tests: equipment-metadata corrections that remove incorrect
 * "Masa własnego ciała" bypasses from exercises requiring bench,
 * resistance band, handles or gymnastic rings.
 *
 * Covers ids: 94, 164, 218, 219, 220, 221
 *
 * DB-level only — no engine invocation needed; the correction is entirely
 * in the equipment array. isEquipmentCompatible is unchanged.
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Helper — query a single exercise row by id
// ---------------------------------------------------------------------------

interface ExRow {
  id: number;
  name: string;
  equipment: string[];
}

async function getEquipment(id: number): Promise<string[]> {
  const res = await db.execute<ExRow>(
    sql`SELECT id, name, equipment FROM exercises WHERE id = ${id}`,
  );
  if (res.rows.length === 0) throw new Error(`Exercise id=${id} not found`);
  return res.rows[0].equipment;
}

/** Mirrors the BODYWEIGHT_EQUIPMENT bypass in isEquipmentCompatible. */
function passesBWFilter(equipment: string[]): boolean {
  return equipment.some(
    (e) =>
      e.toLowerCase() === "masa własnego ciała" ||
      e.toLowerCase() === "brak sprzętu",
  );
}

// ---------------------------------------------------------------------------
// 1. BW bypass removed — bodyweight-only clients must NOT receive these
// ---------------------------------------------------------------------------

describe("equipment-bw-bypass-fixes — BW bypass removed", () => {
  it("id=164 Odwrotne spięcia brzucha: equipment={Ławka}, no BW element", async () => {
    const eq = await getEquipment(164);
    expect(eq).toEqual(["Ławka"]);
    expect(passesBWFilter(eq)).toBe(false);
  });

  it("id=221 Pompki z nogami na podwyższeniu: equipment={Ławka}, no BW element", async () => {
    const eq = await getEquipment(221);
    expect(eq).toEqual(["Ławka"]);
    expect(passesBWFilter(eq)).toBe(false);
  });

  it("id=218 Pompki z gumą oporową: equipment={Gumy oporowe}, no BW element", async () => {
    const eq = await getEquipment(218);
    expect(eq).toEqual(["Gumy oporowe"]);
    expect(passesBWFilter(eq)).toBe(false);
  });

  it("id=219 Pompki na uchwytach: equipment={Inny}, no BW element", async () => {
    const eq = await getEquipment(219);
    expect(eq).toEqual(["Inny"]);
    expect(passesBWFilter(eq)).toBe(false);
  });

  it("id=220 Pompki na kółkach gimnastycznych: equipment={Inny}, no BW element", async () => {
    const eq = await getEquipment(220);
    expect(eq).toEqual(["Inny"]);
    expect(passesBWFilter(eq)).toBe(false);
  });

  it("id=94 Przysiad bułgarski: equipment={Ławka}, no BW element", async () => {
    const eq = await getEquipment(94);
    expect(eq).toEqual(["Ławka"]);
    expect(passesBWFilter(eq)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Required equipment is present — clients with the right gear can access
// ---------------------------------------------------------------------------

describe("equipment-bw-bypass-fixes — required equipment present", () => {
  it("id=164 contains Ławka", async () => {
    expect(await getEquipment(164)).toContain("Ławka");
  });

  it("id=221 contains Ławka", async () => {
    expect(await getEquipment(221)).toContain("Ławka");
  });

  it("id=94 contains Ławka", async () => {
    expect(await getEquipment(94)).toContain("Ławka");
  });

  it("id=218 contains Gumy oporowe", async () => {
    expect(await getEquipment(218)).toContain("Gumy oporowe");
  });

  it("id=219 contains Inny", async () => {
    expect(await getEquipment(219)).toContain("Inny");
  });

  it("id=220 contains Inny", async () => {
    expect(await getEquipment(220)).toContain("Inny");
  });
});

// ---------------------------------------------------------------------------
// 3. Pure-bodyweight exercises remain eligible (regression guard)
// ---------------------------------------------------------------------------

describe("equipment-bw-bypass-fixes — pure BW exercises untouched", () => {
  const SAFE_BW: Array<[number, string]> = [
    [118, "Pompki na kolanach"],
    [117, "Pompki klasyczne"],
    [105, "Glute bridge"],
    [5,   "Plank"],
    [160, "Bird dog"],
  ];

  for (const [id, label] of SAFE_BW) {
    it(`id=${id} ${label} still passes BW filter`, async () => {
      const eq = await getEquipment(id);
      expect(passesBWFilter(eq)).toBe(true);
    });
  }
});
