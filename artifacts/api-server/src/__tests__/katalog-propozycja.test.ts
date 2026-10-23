/** Guard for docs/KATALOG-PROPOZYCJA.csv: a proposal only — never sets suitableForNoActivity to true. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const text = readFileSync(join(__dirname, "../../../../docs/KATALOG-PROPOZYCJA.csv"), "utf8").replace(/^﻿/, "");
function parse(src: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ";") { cur.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; cur.push(cell); cell = ""; if (cur.length > 1 || cur[0] !== "") rows.push(cur); cur = []; }
    else cell += c;
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  return rows;
}
const [head, ...body] = parse(text);
const col = (r: string[], name: string) => r[head!.indexOf(name)] ?? "";

describe("katalog propozycja (CSV)", () => {
  it("one row per exercise: 126 unique ids, packs of about 25", () => {
    expect(body).toHaveLength(126);
    expect(new Set(body.map((r) => col(r, "id"))).size).toBe(126);
    const sizes = Object.values(body.reduce<Record<string, number>>((a, r) => ({ ...a, [col(r, "paczka")]: (a[col(r, "paczka")] ?? 0) + 1 }), {}));
    for (const s of sizes) { expect(s).toBeGreaterThanOrEqual(20); expect(s).toBeLessThanOrEqual(26); }
  });
  it("suitableForNoActivity is never proposed as true; only 'brak (bez zmian)' or false", () => {
    for (const r of body) {
      expect(["brak (bez zmian)", "false"], `id ${col(r, "id")}`).toContain(col(r, "suitable_propozycja"));
      if (col(r, "suitable_obecnie") !== "true") expect(col(r, "suitable_propozycja")).not.toBe("true");
    }
  });
  it("every low-confidence row explains itself", () => {
    for (const r of body) {
      expect(["wysoka", "niska"]).toContain(col(r, "pewnosc"));
      if (col(r, "pewnosc") === "niska") expect(col(r, "uzasadnienie_przy_niskiej").length, `id ${col(r, "id")}`).toBeGreaterThan(5);
    }
  });
  it("owner decisions of 23.10: new equipment values replace 'Inny', new movement patterns used", () => {
    const byName = (needle: string) => body.find((r) => col(r, "nazwa").includes(needle))!;
    expect(col(byName("Svend"), "sprzet_propozycja")).toBe("Talerz obciążeniowy");
    expect(col(byName("Pompki na uchwytach"), "sprzet_propozycja")).toBe("Uchwyty do pompek");
    expect(col(byName("Pompki na kółkach"), "sprzet_propozycja")).toBe("Kółka gimnastyczne");
    for (const r of body) expect(col(r, "sprzet_propozycja").split("; ")).not.toContain("Inny");
    expect(col(byName("Szrugsy z hantlami"), "wzorzec_propozycja")).toBe("Wzruszanie ramion");
    expect(col(byName("Uginanie nadgarstków"), "wzorzec_propozycja")).toBe("Zgięcie/wyprost nadgarstka");
    expect(head).not.toContain("sprzet_inny_propozycja");
  });
  it("proposals come from the closed lists", () => {
    const joints = new Set(["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"]);
    const locs = new Set(["Siłownia", "Dom", "Plener"]);
    for (const r of body) {
      for (const j of col(r, "stawy_propozycja").split("; ").filter(Boolean)) expect(joints.has(j), j).toBe(true);
      for (const l of col(r, "miejsce_propozycja").split("; ").filter(Boolean)) expect(locs.has(l), l).toBe(true);
      expect(["Jednostronne", "Obustronne"]).toContain(col(r, "wykonanie_propozycja"));
    }
  });
});
