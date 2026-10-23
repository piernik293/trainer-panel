/**
 * Focused tests: mixed AND/OR equipment requirement model.
 *
 * Tests are split into three groups:
 *  A. Pure unit tests of isEquipmentCompatible (no DB).
 *  B. DB verification: required_equipment_all values are correct.
 *  C. Profile tests: home training scenarios from the spec (§8).
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isEquipmentCompatible } from "../services/planDraftDayRecommendationsService";

// ─── A. Unit tests — isEquipmentCompatible ────────────────────────────────────

describe("isEquipmentCompatible — OR behaviour preserved", () => {
  it("goblet squat: Hantle OR Kettlebell — Hantle accepted", () => {
    expect(isEquipmentCompatible(["Hantle", "Kettlebell"], [], "Hantle")).toBe(true);
  });
  it("goblet squat: Hantle OR Kettlebell — Kettlebell accepted", () => {
    expect(isEquipmentCompatible(["Hantle", "Kettlebell"], [], "Kettlebell")).toBe(true);
  });
  it("goblet squat: Hantle OR Kettlebell — Sztanga rejected", () => {
    expect(isEquipmentCompatible(["Hantle", "Kettlebell"], [], "Sztanga")).toBe(false);
  });
  it("pallof press: Wyciąg OR Gumy oporowe — Wyciąg accepted", () => {
    expect(isEquipmentCompatible(["Wyciąg", "Gumy oporowe"], [], "Wyciąg")).toBe(true);
  });
  it("pallof press: Wyciąg OR Gumy oporowe — Gumy oporowe accepted", () => {
    expect(isEquipmentCompatible(["Wyciąg", "Gumy oporowe"], [], "Gumy oporowe")).toBe(true);
  });
  it("farmer carry: Hantle OR Kettlebell — Hantle accepted", () => {
    expect(isEquipmentCompatible(["Hantle", "Kettlebell"], [], "Hantle")).toBe(true);
  });
  it("box squat: Sztanga OR Hantle OR Kettlebell OR BW — bodyweight accepted", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle", "Kettlebell", "Masa własnego ciała"], [], "Masa własnego ciała")).toBe(true);
  });
});

describe("isEquipmentCompatible — AND check: Hantle + Ławka", () => {
  it("Hantle alone does NOT satisfy Hantle AND Ławka", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], "Hantle")).toBe(false);
  });
  it("Ławka alone does NOT satisfy Hantle AND Ławka", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], "Ławka")).toBe(false);
  });
  it("Hantle + Ławka satisfies Hantle AND Ławka", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], "Hantle,Ławka")).toBe(true);
  });
});

describe("isEquipmentCompatible — AND check: Sztanga + Ławka", () => {
  it("Sztanga alone does NOT satisfy Sztanga AND Ławka", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], "Sztanga")).toBe(false);
  });
  it("Ławka alone does NOT satisfy Sztanga AND Ławka", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], "Ławka")).toBe(false);
  });
  it("Sztanga + Ławka satisfies Sztanga AND Ławka", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], "Sztanga,Ławka")).toBe(true);
  });
});

describe("isEquipmentCompatible — AND check: Hip thrust (Sztanga OR Hantle) AND Ławka", () => {
  it("Hantle + Ławka accepted", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], "Hantle,Ławka")).toBe(true);
  });
  it("Sztanga + Ławka accepted", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], "Sztanga,Ławka")).toBe(true);
  });
  it("Hantle only rejected (no bench)", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], "Hantle")).toBe(false);
  });
  it("Sztanga only rejected (no bench)", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], "Sztanga")).toBe(false);
  });
  it("Ławka only rejected (no load)", () => {
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], "Ławka")).toBe(false);
  });
});

describe("isEquipmentCompatible — bodyweight does NOT bypass required_equipment_all", () => {
  it("BW + required Ławka: BW-only client rejected", () => {
    // exercise: equipment=[BW], required_equipment_all=[Ławka]
    expect(isEquipmentCompatible(["Masa własnego ciała"], ["Ławka"], "Masa własnego ciała")).toBe(false);
  });
  it("BW + required Ławka: BW + Ławka client accepted", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], ["Ławka"], "Masa własnego ciała,Ławka")).toBe(true);
  });
});

// ─── B. DB verification ───────────────────────────────────────────────────────

type ExRow = {
  id: number;
  name: string;
  equipment: string[];
  requiredEquipmentAll: string[];
};

async function getEx(id: number): Promise<ExRow> {
  const res = await db.execute<ExRow>(
    sql`SELECT id, name, equipment, required_equipment_all AS "requiredEquipmentAll" FROM exercises WHERE id = ${id}`,
  );
  if (res.rows.length === 0) throw new Error(`Exercise id=${id} not found`);
  return res.rows[0];
}

describe("DB — barbell bench exercises: equipment={Sztanga}, required_equipment_all={Ławka}", () => {
  const BARBELL_IDS = [1, 114, 157, 158, 171, 213];
  for (const id of BARBELL_IDS) {
    it(`id=${id} equipment={Sztanga}, required_equipment_all={Ławka}`, async () => {
      const ex = await getEx(id);
      expect(ex.equipment).toEqual(["Sztanga"]);
      expect(ex.requiredEquipmentAll).toEqual(["Ławka"]);
    });
  }
});

describe("DB — dumbbell bench exercises: equipment={Hantle}, required_equipment_all={Ławka}", () => {
  const DB_IDS = [113, 129, 131, 139, 151, 170, 172, 178, 179, 185, 216];
  for (const id of DB_IDS) {
    it(`id=${id} equipment={Hantle}, required_equipment_all={Ławka}`, async () => {
      const ex = await getEx(id);
      expect(ex.equipment).toEqual(["Hantle"]);
      expect(ex.requiredEquipmentAll).toEqual(["Ławka"]);
    });
  }
});

describe("DB — machine+bench and mixed exercises", () => {
  it("id=173 Suwnica Smitha: equipment={Maszyna}, required_equipment_all={Ławka}", async () => {
    const ex = await getEx(173);
    expect(ex.equipment).toEqual(["Maszyna"]);
    expect(ex.requiredEquipmentAll).toEqual(["Ławka"]);
  });
  it("id=104 Hip thrust: equipment={Sztanga,Hantle}, required_equipment_all={Ławka}", async () => {
    const ex = await getEx(104);
    expect(ex.equipment).toContain("Sztanga");
    expect(ex.equipment).toContain("Hantle");
    expect(ex.equipment).not.toContain("Ławka");
    expect(ex.requiredEquipmentAll).toEqual(["Ławka"]);
  });
  it("id=206 Spider Curl: equipment contains Hantle+Sztanga, required_equipment_all={Ławka}", async () => {
    const ex = await getEx(206);
    expect(ex.equipment).toContain("Hantle");
    expect(ex.equipment).toContain("Sztanga");
    expect(ex.equipment).not.toContain("Ławka");
    expect(ex.requiredEquipmentAll).toEqual(["Ławka"]);
  });
});

// ─── C. Home training profile tests (§8) ─────────────────────────────────────
//
// These use isEquipmentCompatible directly with profile strings that mirror
// what the survey stores for each profile.

describe("Profile A — Dom + Masa własnego ciała only", () => {
  const profile = "Masa własnego ciała";
  it("pure BW exercise allowed", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], [], profile)).toBe(true);
  });
  it("dumbbell exercise rejected", () => {
    expect(isEquipmentCompatible(["Hantle"], [], profile)).toBe(false);
  });
  it("cable exercise rejected", () => {
    expect(isEquipmentCompatible(["Wyciąg"], [], profile)).toBe(false);
  });
  it("machine exercise rejected", () => {
    expect(isEquipmentCompatible(["Maszyna"], [], profile)).toBe(false);
  });
  it("bench exercise (Ławka AND Hantle) rejected — no dumbbells or bench", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(false);
  });
});

describe("Profile B — Dom + Hantle + Masa własnego ciała (no bench)", () => {
  const profile = "Hantle,Masa własnego ciała";
  it("dumbbell-only exercise (no AND) allowed", () => {
    expect(isEquipmentCompatible(["Hantle"], [], profile)).toBe(true);
  });
  it("BW exercise allowed", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], [], profile)).toBe(true);
  });
  it("id=185 chest-supported DB row rejected without Ławka", () => {
    // equipment={Hantle}, required_equipment_all={Ławka}
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(false);
  });
  it("barbell bench press rejected (no Sztanga, no Ławka)", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], profile)).toBe(false);
  });
});

describe("Profile C — Dom + Hantle + Ławka + Masa własnego ciała", () => {
  const profile = "Hantle,Ławka,Masa własnego ciała";
  it("id=185 chest-supported DB row allowed with Hantle + Ławka", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(true);
  });
  it("dumbbell bench exercises allowed", () => {
    // incline DB press: equipment={Hantle}, required_equipment_all={Ławka}
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(true);
  });
  it("machine exercise rejected (no Maszyna)", () => {
    expect(isEquipmentCompatible(["Maszyna"], [], profile)).toBe(false);
  });
  it("cable exercise rejected (no Wyciąg)", () => {
    expect(isEquipmentCompatible(["Wyciąg"], [], profile)).toBe(false);
  });
});

describe("Profile D — Dom + Kettlebell + Masa własnego ciała", () => {
  const profile = "Kettlebell,Masa własnego ciała";
  it("kettlebell deadlift allowed", () => {
    expect(isEquipmentCompatible(["Kettlebell"], [], profile)).toBe(true);
  });
  it("goblet squat allowed (Hantle OR Kettlebell)", () => {
    expect(isEquipmentCompatible(["Hantle", "Kettlebell"], [], profile)).toBe(true);
  });
  it("dumbbell-only exercise rejected (no Hantle)", () => {
    expect(isEquipmentCompatible(["Hantle"], [], profile)).toBe(false);
  });
});

describe("Profile E — Dom + Ławka + Masa własnego ciała (no external load)", () => {
  const profile = "Ławka,Masa własnego ciała";
  it("barbell bench press rejected (no Sztanga)", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], profile)).toBe(false);
  });
  it("dumbbell bench press rejected (no Hantle)", () => {
    expect(isEquipmentCompatible(["Hantle"], ["Ławka"], profile)).toBe(false);
  });
  it("pure BW exercise (Plank) still allowed", () => {
    expect(isEquipmentCompatible(["Masa własnego ciała"], [], profile)).toBe(true);
  });
  it("hip thrust rejected (no Sztanga or Hantle, even though Ławka present)", () => {
    // required_equipment_all={Ławka} passes; AnyOf={Sztanga,Hantle} — neither owned
    expect(isEquipmentCompatible(["Sztanga", "Hantle"], ["Ławka"], profile)).toBe(false);
  });
});

// ─── Survey option names vs catalogue names (regression) ──────────────────────
// The survey offers "Ławeczka treningowa" (lib/survey-config EQUIPMENT_OPTIONS)
// while the catalogue requires "Ławka". Both are the same canonical item in
// equipmentNormalizer — a client who ticked the bench must get bench exercises.

describe("isEquipmentCompatible — survey option names match catalogue names", () => {
  const surveyWithBench = "Hantle, Sztanga i talerze, Ławeczka treningowa";

  it("bench press (Sztanga + requires Ławka) accepted when the survey lists Ławeczka treningowa", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], surveyWithBench)).toBe(true);
  });

  it("still rejected when the survey has no bench", () => {
    expect(isEquipmentCompatible(["Sztanga"], ["Ławka"], "Hantle, Sztanga i talerze")).toBe(false);
  });

  it("every survey equipment option is recognised by at least its catalogue name", () => {
    const pairs: [string, string][] = [
      ["Ławka", "Ławeczka treningowa"],
      ["Sztanga", "Sztanga i talerze"],
      ["Drążek", "Drążek do podciągania"],
      ["TRX", "TRX / pasy treningowe"],
      ["Gumy oporowe", "Gumy oporowe"],
      ["Hantle", "Hantle"],
      ["Kettlebell", "Kettlebell"],
    ];
    for (const [catalogue, survey] of pairs) {
      expect(isEquipmentCompatible([catalogue], [], survey), `${catalogue} vs ${survey}`).toBe(true);
    }
  });
});
