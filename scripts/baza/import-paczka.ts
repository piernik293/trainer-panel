/**
 * Import paczki ćwiczeń (CSV po przeglądzie właściciela). Domyślnie --dry-run (nic nie zapisuje).
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/import-paczka.ts <plik> [--apply] [--batch NAZWA] [--source free-exercise-db]
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/import-paczka.ts --rollback NAZWA
 * <plik>: ścieżka, albo nazwa pliku szukana w ~/ i w docs/. Baza z DATABASE_URL (.env: `set -a; . ./.env; set +a`).
 * --apply robi najpierw pg_dump do ~/backups/ i dopisuje raport do docs/IMPORT-LOG.md.
 * Logika: artifacts/api-server/src/services/paczkaImport.ts (testy: src/__tests__/paczka-import*.test.ts).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyImport, planImport, pool, rollbackBatch, type ImportPlan, type PlanItem } from "../../artifacts/api-server/src/services/paczkaImport.ts";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const source = opt("--source") ?? "free-exercise-db";

function findFile(name: string): string {
  for (const c of [resolve(name), join(homedir(), name), join(ROOT, "docs", name), join(ROOT, "docs", basename(name))]) if (existsSync(c)) return c;
  throw new Error(`Nie znaleziono pliku: ${name} (szukano jako ścieżka, w ~/ i w docs/)`);
}
const list = (title: string, items: PlanItem[]) => {
  console.log(`\n${title}: ${items.length}`);
  for (const i of items) console.log(`  - wiersz ${i.line}: ${i.name}${i.detail ? " — " + i.detail : ""}`);
};
function printPlan(p: ImportPlan) {
  if (p.missingColumns.length) console.log(`UWAGA: brak kolumn w pliku: ${p.missingColumns.join(", ")}`);
  console.log(`\nZAIMPORTUJĘ: ${p.toImport.length}`);
  for (const i of p.toImport) console.log(`  + wiersz ${i.line}: ${i.name} [${i.value.level}, ${i.value.role}, ${i.value.equipment.join("/")}, trudność ${i.value.learningDifficulty}, nieaktywni: ${i.value.suitableForNoActivity ? "TAK" : "nie"}; mięśnie: ${i.value.primaryMuscles.join("/")}${i.value.secondaryMuscles.length ? " + " + i.value.secondaryMuscles.join("/") : ""}]`);
  list("POMINĘ (decyzja „nie”)", p.skippedNo);
  list("POMINĘ (pusta decyzja)", p.skippedEmpty);
  list("DO POPRAWY (uwaga trenera)", p.toFix);
  list("ODRZUCONE (walidacja)", p.rejected);
  list("PODEJRZENIE DUPLIKATU (nie importuję)", p.duplicates);
  list("JUŻ ZAIMPORTOWANE (idempotencja)", p.alreadyImported);
}

async function main() {
  const rb = opt("--rollback");
  if (rb) {
    const r = await rollbackBatch(rb);
    console.log(`Cofnięcie paczki „${rb}”: usunięto ${r.removed.length}, zostawiono ${r.kept.length}`);
    for (const k of r.kept) console.log(`  zostawiono: ${k.name} (id ${k.id}) — ${k.why}`);
    appendFileSync(join(ROOT, "docs/IMPORT-LOG.md"), `\n## ${new Date().toISOString().slice(0, 16)} — cofnięcie paczki „${rb}”\nUsunięto ${r.removed.length}: ${r.removed.map((x) => x.name).join(", ") || "—"}. Zostawiono (użyte): ${r.kept.map((x) => x.name).join(", ") || "—"}.\n`);
    return;
  }
  const file = args.find((a) => !a.startsWith("--") && a !== opt("--batch") && a !== opt("--source"));
  if (!file) throw new Error("Podaj plik paczki (np. BAZA-PACZKA-01.csv)");
  const path = findFile(file);
  const batch = opt("--batch") ?? basename(path).replace(/\.csv$/i, "");
  const plan = await planImport(readFileSync(path), source);
  console.log(`Plik: ${path}\nPaczka: ${batch} | źródło: ${source} | tryb: ${flag("--apply") ? "ZAPIS (--apply)" : "dry-run (nic nie zapisuję)"}`);
  printPlan(plan);
  if (!flag("--apply")) { console.log("\nDry-run zakończony. Zapis: dodaj --apply (po zgodzie właściciela)."); return; }
  if (plan.missingColumns.length) throw new Error("Brak wymaganych kolumn — nie zapisuję.");
  const dumpDir = join(homedir(), "backups"); mkdirSync(dumpDir, { recursive: true });
  const dump = join(dumpDir, `trainer_panel_przed_importem_${batch}_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}.sql`);
  writeFileSync(dump, execFileSync("pg_dump", [process.env.DATABASE_URL!], { maxBuffer: 1 << 30 }));
  const ids = await applyImport(plan, source, batch);
  console.log(`\nZapisano ${ids.length} ćwiczeń (kopia bazy: ${dump}).`);
  appendFileSync(join(ROOT, "docs/IMPORT-LOG.md"),
    `\n## ${new Date().toISOString().slice(0, 16)} — import paczki „${batch}” (${basename(path)})\n- zaimportowano: ${ids.length} (id: ${ids.join(", ") || "—"})\n- pominięto „nie”: ${plan.skippedNo.length}, pusta decyzja: ${plan.skippedEmpty.length}, do poprawy: ${plan.toFix.length}, odrzucone: ${plan.rejected.length}, duplikaty: ${plan.duplicates.length}, już były: ${plan.alreadyImported.length}\n- kopia bazy: ${dump}\n`
    + [...plan.toFix.map((i) => `- do poprawy: ${i.name} — ${i.detail}`), ...plan.rejected.map((i) => `- odrzucone: ${i.name} — ${i.detail}`), ...plan.duplicates.map((i) => `- duplikat: ${i.name} — ${i.detail}`)].join("\n") + "\n");
}
main().catch((e) => { console.error("BŁĄD:", e.message); process.exitCode = 1; }).finally(() => pool.end());
