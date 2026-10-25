/**
 * Audyt pokrycia: wzorzec ruchu × miejsce × poziom (BA, P, Ś, Z) — ile ćwiczeń (zweryfikowanych / wszystkich) jest dostępnych dla generatora.
 * Używa tych samych funkcji zgodności co generator (sprzęt, miejsce, isGeneratorSafe). Domyślnie wypisuje JSON na stdout; --md zapisuje docs/POKRYCIE.md.
 *   set -a; . ./.env; set +a; pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/pokrycie.ts [--md]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, exercisesTable } from "../../lib/db/src/index.ts";
import { buildCompatibilityFilter } from "../../artifacts/api-server/src/services/planDraftDayRecommendationsService.ts";
import { isGeneratorSafe, isMainPlanExercise } from "../../artifacts/api-server/src/lib/exerciseRoles.ts";

const LEVELS = [["BA", "Brak aktywności fizycznej"], ["P", "Początkujący"], ["Ś", "Średniozaawansowany"], ["Z", "Zaawansowany"]] as const;
const PLACES: Array<{ key: string; label: string; location: string; equipment: string }> = [
  { key: "dom0", label: "Dom bez sprzętu", location: "Dom", equipment: "" },
  { key: "dom1", label: "Dom z gumą i hantlami", location: "Dom", equipment: "Gumy oporowe, Hantle" },
  { key: "plener", label: "Plener (domyślnie: guma)", location: "Siłownia plenerowa", equipment: "" },
  { key: "plener2", label: "Plener + drążek i poręcze", location: "Siłownia plenerowa", equipment: "Drążek do podciągania, Poręcze" },
  { key: "silownia", label: "Siłownia (pełny katalog)", location: "Siłownia", equipment: "" },
];
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main() {
  const all = (await db.select().from(exercisesTable)).filter((e) => e.isActive && !e.hidden && isMainPlanExercise(e));
  const patterns = [...new Set(all.map((e) => e.movementPattern ?? "(brak)"))].sort();
  // cell[place][pattern][level] = { ok, all, ids: unreviewed-or-unsafe-but-compatible }
  const result: Record<string, Record<string, Record<string, { verified: number; total: number }>>> = {};
  for (const p of PLACES) {
    const compatible = buildCompatibilityFilter(p.location, p.equipment, new Set());
    result[p.key] = {};
    for (const pat of patterns) {
      result[p.key][pat] = {};
      for (const [short, level] of LEVELS) {
        const pool_ = all.filter((e) => (e.movementPattern ?? "(brak)") === pat && compatible({ id: e.id, trainingLocation: e.trainingLocation ?? [], equipment: e.equipment ?? [], requiredEquipmentAll: e.requiredEquipmentAll ?? [], jointStressAreas: e.jointStressAreas }));
        const levelOk = (e: (typeof all)[number]) => (short === "BA" ? e.suitableExperienceLevels.includes(level) || e.suitableForNoActivity === true : e.suitableExperienceLevels.includes(level) || e.difficultyLevel === level);
        const forLevel = pool_.filter(levelOk);
        const verified = forLevel.filter((e) => (short === "BA" ? e.suitableForNoActivity === true : true) && (short === "BA" || short === "P" ? e.learningDifficulty != null : true) && isGeneratorSafe(e, level) && e.reviewedByTrainer);
        result[p.key][pat][short] = { verified: verified.length, total: forLevel.length };
      }
    }
  }
  if (process.argv.includes("--dziury")) {
    // Dziury BA/P: komórki bez zweryfikowanego ćwiczenia. Kandydaci = zgodne z miejscem i sprzętem, niezweryfikowane, learningDifficulty <= 2 (BA: <= 2 i poziom początkujący).
    const lines = ["# Dziury w pokryciu dla BA i P — lista do przeglądu trenera", "",
      "Generator używa dla poziomów **Brak aktywności** i **Początkujący** wyłącznie ćwiczeń zweryfikowanych. Poniżej komórki (miejsce × wzorzec × poziom), w których takich ćwiczeń **nie ma**, i niezweryfikowani kandydaci do ewentualnego zatwierdzenia w panelu („Do weryfikacji”). Dla BA zatwierdzenie wymaga osobnej decyzji „nadaje się dla braku aktywności” — nie ustawiam jej automatycznie.", ""];
    const essential = ["Pchanie poziome", "Pchanie pionowe", "Przyciąganie poziome", "Przyciąganie pionowe", "Przysiad", "Zawias biodrowy", "Wykrok", "Odwodzenie", "Przywodzenie", "Zgięcie łokcia", "Wyprost łokcia", "Zgięcie kolana", "Wspięcie na palce", "Zgięcie tułowia", "Stabilizacja tułowia", "Anti-rotacja", "Rotacja"];
    for (const p of PLACES) {
      const compatible = buildCompatibilityFilter(p.location, p.equipment, new Set());
      const rows: string[] = [];
      for (const pat of essential) for (const [short, level] of LEVELS.slice(0, 2)) {
        const c = result[p.key][pat]?.[short];
        if (!c || c.verified > 0) continue;
        const cands = all.filter((e) => (e.movementPattern ?? "(brak)") === pat && !e.reviewedByTrainer && (e.learningDifficulty ?? 9) <= 2
          && compatible({ id: e.id, trainingLocation: e.trainingLocation ?? [], equipment: e.equipment ?? [], requiredEquipmentAll: e.requiredEquipmentAll ?? [], jointStressAreas: e.jointStressAreas })
          && (short === "BA" ? ["Brak aktywności fizycznej", "Początkujący"].includes(e.difficultyLevel ?? "") : e.suitableExperienceLevels.includes(level) || e.difficultyLevel === level));
        rows.push(`| ${pat} | ${short} | ${c.total} | ${cands.slice(0, 6).map((e) => `${e.name} (#${e.id})`).join("; ") || "— brak kandydata, potrzebne nowe ćwiczenie"} |`);
      }
      lines.push(`## ${p.label}`, "", "| Wzorzec | Poziom | Wszystkie (bez weryfikacji) | Kandydaci do zatwierdzenia |", "|---|---|---|---|", ...rows, "");
    }
    writeFileSync(`${ROOT}/docs/POKRYCIE-DZIURY-BA-P.md`, lines.join("\n"));
    console.log("zapisano docs/POKRYCIE-DZIURY-BA-P.md");
  }
  if (process.argv.includes("--md")) {
    const lines: string[] = ["# Pokrycie katalogu: wzorzec ruchu × miejsce × poziom", "",
      `Stan: ${new Date().toISOString().slice(0, 10)}. Komórka = **zweryfikowane / wszystkie** ćwiczenia dostępne dla generatora (sprzęt i miejsce jak w generatorze, bez rozgrzewki/rozciągania/techniki biegu). Poziomy: BA = brak aktywności, P = początkujący, Ś = średniozaawansowany, Z = zaawansowany. „Zweryfikowane” = zatwierdzone przez trenera (BA dodatkowo „suitableForNoActivity”); niezweryfikowane generator bierze tylko dla Ś i Z.`, ""];
    for (const p of PLACES) {
      lines.push(`## ${p.label}`, "", "| Wzorzec | BA | P | Ś | Z |", "|---|---|---|---|---|");
      for (const pat of patterns) {
        const c = result[p.key][pat];
        lines.push(`| ${pat} | ${LEVELS.map(([s]) => `${c[s].verified}/${c[s].total}`).join(" | ")} |`);
      }
      lines.push("");
    }
    writeFileSync(`${ROOT}/docs/POKRYCIE.md`, lines.join("\n"));
    console.log("zapisano docs/POKRYCIE.md");
  } else console.log(JSON.stringify(result));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
