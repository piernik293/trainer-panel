/**
 * Adds substitutions / progressions / regressions to docs/exercise-import-batch-01.json.
 * Run once: npx tsx scripts/add-relations-to-import.ts
 *
 * All targets are resolved by canonical exercise name — no hardcoded IDs.
 * Only exercises that appear in the batch OR in the original 5 may be referenced.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, "../docs/exercise-import-batch-01.json");
const raw = fs.readFileSync(filePath, "utf8");
const payload = JSON.parse(raw) as {
  rows: Array<{ name: string; [k: string]: unknown }>;
  [k: string]: unknown;
};

type Rel = { exerciseName: string };
type RelMap = Record<string, { substitutions?: Rel[]; progressions?: Rel[]; regressions?: Rel[] }>;

const r = (names: string[]): Rel[] => names.map((n) => ({ exerciseName: n }));

const relations: RelMap = {
  // ─── CHEST — Push bodyweight chain ─────────────────────────────────────────
  "Pompki na kolanach": {
    substitutions: r(["Pompki na podwyższeniu"]),
    progressions: r(["Pompki na podwyższeniu"]),
  },
  "Pompki na podwyższeniu": {
    regressions: r(["Pompki na kolanach"]),
    progressions: r(["Pompki klasyczne"]),
    substitutions: r(["Pompki klasyczne"]),
  },
  "Pompki klasyczne": {
    regressions: r(["Pompki na podwyższeniu"]),
    substitutions: r(["Pompki na kolanach", "Wyciskanie na maszynie siedząc"]),
  },
  // ─── CHEST — Machine / barbell ─────────────────────────────────────────────
  "Wyciskanie na maszynie siedząc": {
    substitutions: r(["Pompki klasyczne"]),
  },
  "Wyciskanie hantli na ławce skośnej dodatniej": {
    substitutions: r(["Wyciskanie sztangi na ławce skośnej dodatniej"]),
  },
  "Wyciskanie sztangi na ławce skośnej dodatniej": {
    substitutions: r(["Wyciskanie hantli na ławce skośnej dodatniej"]),
  },
  // ─── CHEST — Flies ─────────────────────────────────────────────────────────
  "Rozpiętki na maszynie Pec Deck": {
    substitutions: r([
      "Rozpiętki na bramie na wysokości klatki",
      "Rozpiętki na bramie z dołu do góry",
    ]),
  },
  "Rozpiętki na bramie na wysokości klatki": {
    substitutions: r([
      "Rozpiętki na maszynie Pec Deck",
      "Rozpiętki na bramie z dołu do góry",
    ]),
  },
  "Rozpiętki na bramie z dołu do góry": {
    substitutions: r([
      "Rozpiętki na bramie na wysokości klatki",
      "Rozpiętki na bramie z góry w dół",
    ]),
  },
  "Rozpiętki na bramie z góry w dół": {
    substitutions: r([
      "Rozpiętki na bramie z dołu do góry",
      "Rozpiętki na maszynie Pec Deck",
    ]),
  },
  // ─── BACK — Lat pulldowns ───────────────────────────────────────────────────
  "Ściąganie drążka wyciągu górnego chwytem neutralnym": {
    substitutions: r([
      "Ściąganie drążka wyciągu górnego szerokim nachwytem",
      "Podciąganie na maszynie wspomagającej",
    ]),
  },
  "Ściąganie drążka wyciągu górnego szerokim nachwytem": {
    substitutions: r([
      "Ściąganie drążka wyciągu górnego chwytem neutralnym",
      "Ściąganie drążka wyciągu górnego podchwytem",
    ]),
  },
  "Ściąganie drążka wyciągu górnego podchwytem": {
    substitutions: r([
      "Ściąganie drążka wyciągu górnego szerokim nachwytem",
      "Ściąganie drążka wyciągu górnego chwytem neutralnym",
    ]),
  },
  // ─── BACK — Pull-up chain ───────────────────────────────────────────────────
  "Podciąganie na maszynie wspomagającej": {
    progressions: r(["Podciąganie na drążku chwytem neutralnym"]),
    substitutions: r(["Ściąganie drążka wyciągu górnego chwytem neutralnym"]),
  },
  "Podciąganie na drążku chwytem neutralnym": {
    regressions: r(["Podciąganie na maszynie wspomagającej"]),
    substitutions: r([
      "Ściąganie drążka wyciągu górnego chwytem neutralnym",
      "Podciąganie na drążku",          // original exercise (id=2)
    ]),
  },
  // ─── BACK — Rows ────────────────────────────────────────────────────────────
  "Wiosłowanie siedząc na wyciągu chwytem neutralnym": {
    substitutions: r([
      "Wiosłowanie na maszynie",
      "Wiosłowanie hantlami z podparciem klatki",
    ]),
  },
  "Wiosłowanie hantlami z podparciem klatki": {
    substitutions: r([
      "Wiosłowanie siedząc na wyciągu chwytem neutralnym",
      "Wiosłowanie jednorącz hantlem",
    ]),
  },
  "Wiosłowanie na maszynie": {
    substitutions: r([
      "Wiosłowanie siedząc na wyciągu chwytem neutralnym",
      "Wiosłowanie gumą oporową",
    ]),
  },
  "Wiosłowanie jednorącz hantlem": {
    substitutions: r([
      "Wiosłowanie hantlami z podparciem klatki",
      "Wiosłowanie T-bar z podparciem klatki",
    ]),
  },
  "Wiosłowanie T-bar z podparciem klatki": {
    substitutions: r([
      "Wiosłowanie hantlami z podparciem klatki",
      "Wiosłowanie jednorącz hantlem",
    ]),
  },
  "Wiosłowanie na TRX": {
    substitutions: r([
      "Wiosłowanie gumą oporową",
      "Wiosłowanie siedząc na wyciągu chwytem neutralnym",
    ]),
  },
  "Wiosłowanie gumą oporową": {
    substitutions: r(["Wiosłowanie na TRX", "Wiosłowanie na maszynie"]),
  },
  // ─── BACK — Straight arm pulldown ───────────────────────────────────────────
  "Ściąganie prostych ramion na wyciągu": {
    substitutions: r(["Ściąganie drążka wyciągu górnego chwytem neutralnym"]),
  },
  // ─── SHOULDERS — Rear delt ─────────────────────────────────────────────────
  "Face pull": {
    substitutions: r([
      "Odwrotne rozpiętki na maszynie Pec Deck",
      "Odwrotne rozpiętki z hantlami",
    ]),
  },
  "Odwrotne rozpiętki na maszynie Pec Deck": {
    substitutions: r(["Face pull", "Odwrotne rozpiętki z hantlami"]),
  },
  "Odwrotne rozpiętki z hantlami": {
    substitutions: r(["Odwrotne rozpiętki na maszynie Pec Deck", "Face pull"]),
  },
  "Odwrotne rozpiętki na linkach": {
    substitutions: r(["Odwrotne rozpiętki z hantlami", "Face pull"]),
  },
  // ─── SHOULDERS — Press ─────────────────────────────────────────────────────
  "Wyciskanie na maszynie nad głowę": {
    substitutions: r(["Wyciskanie hantli siedząc", "Arnold press"]),
  },
  "Wyciskanie hantli siedząc": {
    substitutions: r(["Wyciskanie na maszynie nad głowę", "Arnold press"]),
  },
  "Arnold press": {
    substitutions: r(["Wyciskanie hantli siedząc", "Wyciskanie na maszynie nad głowę"]),
  },
  // ─── SHOULDERS — Lateral raise ──────────────────────────────────────────────
  "Unoszenie hantli bokiem": {
    substitutions: r([
      "Unoszenie ramion bokiem na maszynie",
      "Unoszenie ramienia bokiem na wyciągu",
    ]),
  },
  "Unoszenie ramienia bokiem na wyciągu": {
    substitutions: r([
      "Unoszenie hantli bokiem",
      "Unoszenie ramion bokiem na maszynie",
    ]),
  },
  "Unoszenie ramion bokiem na maszynie": {
    substitutions: r([
      "Unoszenie hantli bokiem",
      "Unoszenie ramienia bokiem na wyciągu",
    ]),
  },
  "Unoszenie hantli w przód": {
    substitutions: r(["Unoszenie ramion bokiem na maszynie"]),
  },
  // ─── LOWER BODY — Squat chain ───────────────────────────────────────────────
  "Przysiad do skrzyni z masą własnego ciała": {
    progressions: r(["Przysiad goblet z hantlem"]),
    substitutions: r(["Przysiad goblet z hantlem"]),
  },
  "Przysiad goblet z hantlem": {
    regressions: r(["Przysiad do skrzyni z masą własnego ciała"]),
    progressions: r(["Przysiad do skrzyni"]),
    substitutions: r(["Przysiad do skrzyni"]),
  },
  "Przysiad do skrzyni": {
    regressions: r(["Przysiad goblet z hantlem"]),
    substitutions: r(["Hack squat na maszynie", "Przysiad na suwnicy Smitha"]),
  },
  "Hack squat na maszynie": {
    substitutions: r(["Przysiad na suwnicy Smitha", "Wypychanie nóg na suwnicy 45°"]),
  },
  "Przysiad na suwnicy Smitha": {
    substitutions: r(["Hack squat na maszynie"]),
  },
  // ─── LOWER BODY — Bulgarian / lunge chain ───────────────────────────────────
  "Przysiad bułgarski": {
    regressions: r(["Przysiad wykroczny z podparciem"]),
    substitutions: r(["Wykrok w tył"]),
  },
  "Przysiad wykroczny z podparciem": {
    progressions: r(["Wykrok w tył"]),
    regressions: r(["Przysiad do skrzyni z masą własnego ciała"]),
  },
  "Wykrok w tył": {
    regressions: r(["Przysiad wykroczny z podparciem"]),
    progressions: r(["Wykroki chodzone"]),
    substitutions: r(["Wykroki chodzone"]),
  },
  "Wykroki chodzone": {
    regressions: r(["Wykrok w tył"]),
    substitutions: r(["Wykrok w tył"]),
  },
  "Wejście na podest": {
    substitutions: r(["Wykrok w tył"]),
  },
  // ─── LOWER BODY — Leg extension / press ─────────────────────────────────────
  "Prostowanie nóg na maszynie": {
    substitutions: r(["Wypychanie nóg na suwnicy 45°"]),
  },
  "Wypychanie nóg na suwnicy 45°": {
    substitutions: r(["Hack squat na maszynie", "Prostowanie nóg na maszynie"]),
  },
  // ─── LOWER BODY — Hinge chain ───────────────────────────────────────────────
  "Martwy ciąg z kettlebell": {
    progressions: r(["Martwy ciąg rumuński z hantlami"]),
    substitutions: r(["Martwy ciąg rumuński z hantlami"]),
  },
  "Martwy ciąg rumuński z hantlami": {
    regressions: r(["Martwy ciąg z kettlebell"]),
    progressions: r(["Martwy ciąg rumuński ze sztangą"]),
    substitutions: r(["Martwy ciąg rumuński ze sztangą"]),
  },
  "Martwy ciąg rumuński ze sztangą": {
    regressions: r(["Martwy ciąg rumuński z hantlami"]),
    substitutions: r(["Martwy ciąg z trap barem"]),
  },
  "Martwy ciąg z trap barem": {
    substitutions: r([
      "Martwy ciąg rumuński ze sztangą",
      "Martwy ciąg rumuński z hantlami",
    ]),
  },
  // ─── LOWER BODY — Hip posterior chain ──────────────────────────────────────
  "Glute bridge": {
    progressions: r(["Hip thrust"]),
    substitutions: r(["Hip thrust", "Pull-through na wyciągu"]),
  },
  "Hip thrust": {
    regressions: r(["Glute bridge"]),
    substitutions: r(["Glute bridge", "Pull-through na wyciągu"]),
  },
  "Pull-through na wyciągu": {
    substitutions: r(["Glute bridge", "Hip thrust"]),
  },
  // ─── LOWER BODY — Leg curl ─────────────────────────────────────────────────
  "Uginanie nóg siedząc na maszynie": {
    substitutions: r(["Uginanie nóg leżąc na maszynie"]),
  },
  "Uginanie nóg leżąc na maszynie": {
    substitutions: r(["Uginanie nóg siedząc na maszynie"]),
  },
  // ─── LOWER BODY — Calves ───────────────────────────────────────────────────
  "Wspięcia na palce stojąc": {
    substitutions: r(["Wspięcia na palce siedząc"]),
  },
  "Wspięcia na palce siedząc": {
    substitutions: r(["Wspięcia na palce stojąc"]),
  },
  // ─── ARMS — Biceps ─────────────────────────────────────────────────────────
  "Uginanie ramion ze sztangą": {
    substitutions: r(["Uginanie ramion ze sztangą EZ", "Uginanie ramion z hantlami"]),
  },
  "Uginanie ramion ze sztangą EZ": {
    substitutions: r(["Uginanie ramion ze sztangą", "Uginanie ramion z hantlami"]),
  },
  "Uginanie ramion z hantlami": {
    substitutions: r([
      "Uginanie ramion ze sztangą EZ",
      "Uginanie młotkowe z hantlami",
    ]),
  },
  "Uginanie młotkowe z hantlami": {
    substitutions: r(["Uginanie ramion z hantlami"]),
  },
  "Uginanie ramion z hantlami na ławce skośnej": {
    substitutions: r(["Uginanie ramion na modlitewniku"]),
  },
  "Uginanie ramion na modlitewniku": {
    substitutions: r(["Uginanie ramion z hantlami na ławce skośnej"]),
  },
  "Uginanie ramion na wyciągu": {
    substitutions: r([
      "Uginanie ramion z hantlami",
      "Uginanie ramion ze sztangą EZ",
    ]),
  },
  // ─── ARMS — Triceps ────────────────────────────────────────────────────────
  "Prostowanie ramion z liną na wyciągu": {
    substitutions: r(["Prostowanie ramion z drążkiem na wyciągu"]),
  },
  "Prostowanie ramion z drążkiem na wyciągu": {
    substitutions: r(["Prostowanie ramion z liną na wyciągu"]),
  },
  "Prostowanie ramion nad głową z liną": {
    substitutions: r(["Wyciskanie francuskie sztangą EZ"]),
  },
  "Wyciskanie francuskie sztangą EZ": {
    substitutions: r([
      "Prostowanie ramion nad głową z liną",
      "Wyciskanie sztangi wąskim chwytem",
    ]),
  },
  "Wyciskanie sztangi wąskim chwytem": {
    substitutions: r([
      "Wyciskanie francuskie sztangą EZ",
      "Prostowanie ramion z liną na wyciągu",
    ]),
  },
  // ─── CORE ──────────────────────────────────────────────────────────────────
  "Dead bug": {
    progressions: r(["Bird dog"]),
  },
  "Bird dog": {
    regressions: r(["Dead bug"]),
    substitutions: r(["Dead bug"]),
  },
  "Plank boczny": {
    substitutions: r(["Pallof press"]),
  },
  "Pallof press": {
    substitutions: r(["Plank boczny"]),
  },
  "Spięcia brzucha na wyciągu": {
    progressions: r(["Ab wheel rollout"]),
    substitutions: r(["Unoszenie kolan w zwisie"]),
  },
  "Odwrotne spięcia brzucha": {
    progressions: r(["Unoszenie kolan w zwisie"]),
  },
  "Unoszenie kolan w zwisie": {
    regressions: r(["Odwrotne spięcia brzucha"]),
    substitutions: r(["Spięcia brzucha na wyciągu"]),
  },
  "Ab wheel rollout": {
    regressions: r(["Spięcia brzucha na wyciągu"]),
  },
  // ─── CARRY ─────────────────────────────────────────────────────────────────
  "Spacer farmera": {
    substitutions: r(["Spacer walizkowy"]),
  },
  "Spacer walizkowy": {
    substitutions: r(["Spacer farmera"]),
  },
};

let matched = 0;
let unmatched: string[] = [];

for (const row of payload.rows) {
  const rel = relations[row.name];
  if (rel) {
    if (rel.substitutions) row.substitutions = rel.substitutions;
    if (rel.progressions)  row.progressions  = rel.progressions;
    if (rel.regressions)   row.regressions   = rel.regressions;
    matched++;
  }
}

// Report any relation keys that didn't find a matching exercise name
for (const name of Object.keys(relations)) {
  if (!payload.rows.find(r => r.name === name)) {
    unmatched.push(name);
  }
}

fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

console.log(`✓ Relations applied to ${matched} exercises`);
if (unmatched.length > 0) {
  console.warn(`⚠ No exercise found for relation keys: ${unmatched.join(", ")}`);
} else {
  console.log("✓ All relation keys matched exercises in the batch");
}

// Summarize
let totalSubs = 0, totalProgs = 0, totalRegs = 0;
for (const row of payload.rows) {
  totalSubs  += ((row.substitutions as unknown[]) ?? []).length;
  totalProgs += ((row.progressions  as unknown[]) ?? []).length;
  totalRegs  += ((row.regressions   as unknown[]) ?? []).length;
}
console.log(`  substitutions : ${totalSubs}`);
console.log(`  progressions  : ${totalProgs}`);
console.log(`  regressions   : ${totalRegs}`);
console.log(`  total relations: ${totalSubs + totalProgs + totalRegs}`);
