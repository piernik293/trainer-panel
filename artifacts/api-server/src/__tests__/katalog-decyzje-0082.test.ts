/** Migracja danych 0082 (decyzje właściciela 52–54): strażnik struktury — addytywna, odwracalna, z kopią zapasową, ze zgodnością z decyzjami A–D. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(__dirname, "../../../../lib/db/migrations/0082_katalog_decyzje_52_54.sql"), "utf8");
const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const ids = (s: string) => s.match(/\d+/g)!.map(Number);
const updateSets = [...body.matchAll(/UPDATE exercises SET ([^;]*?)WHERE id IN \(([^)]*)\)/gs)].map((m) => ({ set: m[1]!, ids: ids(m[2]!) }));
const withSet = (needle: string) => updateSets.filter((u) => u.set.includes(needle)).flatMap((u) => u.ids);

describe("migracja 0082", () => {
  it("nic nie usuwa i niczego nie przemianowuje; nie dodaje ćwiczeń (kalistenika jest już w bazie)", () => {
    expect(body).not.toMatch(/\b(DROP|DELETE|TRUNCATE|RENAME)\b/i);
    expect(body).not.toMatch(/INSERT INTO exercises\b/i);
  });
  it("kopia zapasowa przed pierwszą zmianą, tylko dla id bez kopii „0082” (jednorazowość), z cofnięciem w scripts/", () => {
    expect(body.indexOf("INSERT INTO catalogue_decision_backup")).toBeGreaterThan(-1);
    expect(body.indexOf("INSERT INTO catalogue_decision_backup")).toBeLessThan(body.indexOf("UPDATE exercises"));
    expect(body).toContain("migration = '0082'");
    expect(readFileSync(resolve(__dirname, "../../../../scripts/katalog-decyzje-cofnij-0082.sql"), "utf8")).toContain("migration = '0082'");
  });
  it("A: 20 pozycji „zatwierdź” (w tym 89 Przysiad do skrzyni); zostają „tylko od P”: 227, 163, 164, 108", () => {
    const yes = withSet("suitable_for_no_activity = true");
    for (const id of [140, 190, 149, 189, 144, 146, 99, 106, 107, 150, 193, 89, 154, 143, 187, 141, 145, 147, 155, 153]) expect(yes, `A ${id}`).toContain(id);
    const no = withSet("suitable_for_no_activity = false");
    for (const id of [227, 163, 164, 108]) { expect(no, `P ${id}`).toContain(id); expect(yes).not.toContain(id); }
  });
  it("B: „tylko od P” (nie dla BA), pajacyki dla wszystkich; dipy z flagą Bark", () => {
    const no = withSet("suitable_for_no_activity = false"); const yes = withSet("suitable_for_no_activity = true");
    for (const id of [198, 1110, 1319, 1260, 200, 1281, 1094, 1093, 1629, 1180, 1314]) expect(no, `B ${id}`).toContain(id);
    expect(yes).toContain(1538);
    expect(body).toMatch(/array_append\([^)]*\), 'Bark'\)[\s\S]*?id IN \(1093, 1629\)/);
  });
  it("C: 197, 1092, 1099, 1252 → trudność Początkujący i brak dostępu dla BA; 218 i 1088 bez zmian", () => {
    const poczatkujacy = updateSets.filter((u) => u.set.includes("difficulty_level = 'Początkujący'")).flatMap((u) => u.ids);
    for (const id of [197, 1092, 1099, 1252]) expect(poczatkujacy, `C ${id}`).toContain(id);
    expect(body).not.toMatch(/\b(218|1088)\b/);
  });
  it("D: „Pistol z podparciem” → Ś po slugu (numery różnią się między bazami); „Unoszenie prostych nóg w zwisie” (1262) nietknięte", () => {
    expect(body).toMatch(/slug = 'pistol-z-podparciem'[\s\S]*Średniozaawansowany|Średniozaawansowany[\s\S]*slug = 'pistol-z-podparciem'/);
    expect(body).not.toMatch(/\b1262\b/);
  });
});
