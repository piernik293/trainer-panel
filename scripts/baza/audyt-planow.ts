/**
 * Audyt istniejących planów (TYLKO ODCZYT): ćwiczenia obciążające staw zgłoszony przez klienta
 * (wywiad lub „Coś boli?” z ostatnich 30 dni), z proponowanym zamiennikiem z niższego szczebla tej samej drabinki.
 * Nic nie zmienia w planach. Wynik: docs/AUDYT-PLANOW.md.
 *   set -a; . ./.env; set +a
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/audyt-planow.ts
 * Logika: artifacts/api-server/src/services/jointPlanAudit.ts (ta sama co ostrzeżenie w panelu trenera).
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findJointConflicts, listCurrentPlanIds, pool } from "../../artifacts/api-server/src/services/jointPlanAudit.ts";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cell = (s: string) => s.replace(/\|/g, "\\|");

async function main() {
  const now = new Date();
  const planIds = await listCurrentPlanIds();
  const conflicts = await findJointConflicts(planIds, now);
  const lines = [
    "# Audyt planów — ćwiczenia na zgłoszony staw",
    "",
    `Wygenerowano: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC, baza aplikacji (dane deweloperskie). Tylko odczyt — w planach nic nie zmieniono.`,
    `Skrypt: \`scripts/baza/audyt-planow.ts\`; reguły: \`artifacts/api-server/src/services/jointPlanAudit.ts\`.`,
    "",
    "Zgłoszony staw = z opisu zdrowia w wywiadzie albo ze zgłoszenia „Coś boli?” z ostatnich 30 dni. Sprawdzone plany: wszystkie poza zarchiwizowanymi " +
      `(${planIds.length}). Zamiennik = najbliższy niższy szczebel tej samej drabinki, który nie obciąża zgłoszonego stawu, pasuje do sprzętu i miejsca klienta ` +
      "i spełnia reguły bezpieczeństwa poziomu; ćwiczenia spoza drabinek nie mają propozycji. Ten sam problem trener widzi w panelu przy ćwiczeniu " +
      "(„To ćwiczenie obciąża zgłoszony staw”) z przyciskiem „Zamień na: …”.",
    "",
    `**Znalezione: ${conflicts.length}** (z propozycją zamiennika: ${conflicts.filter((c) => c.replacement).length}).`,
    "",
  ];
  if (conflicts.length > 0) {
    lines.push("| Klient | Plan | Dzień | Ćwiczenie | Staw | Proponowany zamiennik (drabinka niżej) | Uwagi |", "|---|---|---|---|---|---|---|");
    for (const c of conflicts) {
      const repl = c.replacement ? `${c.replacement.name} (id ${c.replacement.id}; ${c.replacement.pattern}, szczebel ${c.replacement.stepOrder})` : "brak — wybór ręczny";
      const notes = [c.planStatus === "active" ? "plan aktywny" : `plan: ${c.planStatus}`, c.trainerDecisionAt ? "trener dodał świadomie" : ""].filter(Boolean).join("; ");
      lines.push(`| ${cell(c.clientLabel)} | ${cell(c.planTitle)} (#${c.planId}) | ${cell(c.dayName)} | ${cell(c.exerciseName)} (id ${c.exerciseId}) | ${c.joints.join(", ")} | ${cell(repl)} | ${notes} |`);
    }
  } else {
    lines.push("Brak ćwiczeń obciążających zgłoszony staw w obecnych planach.");
  }
  writeFileSync(join(ROOT, "docs", "AUDYT-PLANOW.md"), lines.join("\n") + "\n");
  console.log(`Plany: ${planIds.length}, znalezione: ${conflicts.length}. Zapisano docs/AUDYT-PLANOW.md`);
}

main().catch((e) => { console.error("BŁĄD:", e.message); process.exitCode = 1; }).finally(() => pool.end());
