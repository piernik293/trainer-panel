/**
 * Sub-Target Bias Seed — Phase 1 (Chest / Back / Shoulders)
 *                        Phase 2 (Biceps / Triceps / Core / Legs / Glutes / Calves / Full-body)
 *
 * Sets `sub_target_biases` on exercises for all major muscle groups.
 * Values are practical coaching-bias proportions, NOT scientific measurements.
 * Idempotent: safe to re-run on every startup.
 *
 * Bias convention:
 *   Phase 1 — Chest:     upper_chest | mid_chest | lower_chest   (sum ≈ 1.0)
 *              Back:      lats | upper_back                       (sum ≈ 1.0)
 *              Shoulders: front_delt | lateral_delt | rear_delt   (sum ≈ 1.0)
 *
 *   Phase 2 — Keys are chosen as substrings of the canonical Polish muscle-group
 *              names used in the survey combobox (e.g. "czworogłowe" ⊂ "Mięśnie
 *              czworogłowe uda") so that scoreSubTargetBias() substring-matching
 *              fires correctly for clients who set those priority muscles.
 *
 *              Canonical names (MuscleGroupCombobox options):
 *                Biceps | Triceps | Brzuch | Pośladki | Plecy | Barki | Łydki
 *                Mięśnie czworogłowe uda  → key fragment: "czworogłowe"
 *                Mięśnie dwugłowe uda     → key fragment: "dwugłowe"
 *                Klatka piersiowa         → key fragment: "klatka"
 *                Przedramiona
 *
 * Exercise IDs come from the live DB — verified against name/slug.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Bias tables ──────────────────────────────────────────────────────────────

/**
 * Each entry: [exerciseId, biasObject]
 *
 * ID  | Name (Polish)
 * ────+────────────────────────────────────────────────────────────────
 * CHEST — Flat pressing (mid_chest dominant)
 *   1 | Wyciskanie sztangi leżąc
 * 115 | Wyciskanie na maszynie siedząc
 * 117 | Pompki klasyczne
 * 118 | Pompki na kolanach
 * 170 | Wyciskanie hantli leżąc
 * 173 | Wyciskanie na suwnicy Smitha leżąc
 * 174 | Pompki z obciążeniem
 * 215 | Wyciskanie jednorącz na wyciągu
 * 216 | Wyciskanie hantli z dociskiem (Squeeze Press)
 * 217 | Wyciskanie na maszynie zbieżnej
 * 218 | Pompki z gumą oporową
 * 219 | Pompki na uchwytach
 * 220 | Pompki na kółkach gimnastycznych
 *
 * CHEST — Incline pressing (upper_chest dominant)
 * 113 | Wyciskanie hantli na ławce skośnej dodatniej
 * 114 | Wyciskanie sztangi na ławce skośnej dodatniej
 * 121 | Rozpiętki na bramie z dołu do góry
 * 179 | Rozpiętki z hantlami na ławce skośnej
 * 221 | Pompki z nogami na podwyższeniu
 *
 * CHEST — Decline pressing (lower_chest dominant)
 * 116 | Pompki na podwyższeniu (feet elevated)
 * 122 | Rozpiętki na bramie z góry w dół
 * 171 | Wyciskanie sztangi na ławce skośnej ujemnej
 * 172 | Wyciskanie hantli na ławce skośnej ujemnej
 * 175 | Dipy na poręczach
 * 176 | Dipy wspomagane na maszynie
 *
 * CHEST — Flies mid-plane (mid_chest dominant)
 * 119 | Rozpiętki na maszynie Pec Deck
 * 120 | Rozpiętki na bramie na wysokości klatki
 * 177 | Svend Press
 * 178 | Rozpiętki z hantlami leżąc
 *
 * BACK — Vertical pull (lats dominant)
 *   2 | Podciąganie na drążku
 * 123 | Ściąganie drążka wyciągu górnego chwytem neutralnym
 * 124 | Ściąganie drążka wyciągu górnego szerokim nachwytem
 * 125 | Ściąganie drążka wyciągu górnego podchwytem
 * 126 | Podciąganie na maszynie wspomagającej
 * 127 | Podciąganie na drążku chwytem neutralnym
 * 135 | Ściąganie prostych ramion na wyciągu
 * 205 | Ściąganie jednorącz wyciągu górnego
 * 224 | High Pull
 *
 * BACK — Horizontal pull (upper_back dominant)
 * 128 | Wiosłowanie siedząc na wyciągu chwytem neutralnym
 * 129 | Wiosłowanie hantlami z podparciem klatki
 * 130 | Wiosłowanie na maszynie
 * 131 | Wiosłowanie jednorącz hantlem
 * 132 | Wiosłowanie T-bar z podparciem klatki
 * 133 | Wiosłowanie na TRX
 * 134 | Wiosłowanie gumą oporową
 * 180 | Wiosłowanie sztangą w opadzie
 * 181 | Wiosłowanie podchwytem ze sztangą
 * 185 | Wiosłowanie leżąc przodem z hantlami
 *
 * SHOULDERS — Overhead pressing (front_delt dominant)
 *   4 | Wyciskanie hantli nad głowę
 * 137 | Wyciskanie na maszynie nad głowę
 * 138 | Arnold press
 * 139 | Wyciskanie hantli siedząc
 * 186 | Wyciskanie sztangą nad głowę
 *
 * SHOULDERS — Lateral raises (lateral_delt dominant)
 * 140 | Unoszenie hantli bokiem
 * 141 | Unoszenie ramienia bokiem na wyciągu
 * 142 | Unoszenie ramion bokiem na maszynie
 *
 * SHOULDERS — Rear delt / face pull (rear_delt dominant)
 * 136 | Face pull
 * 143 | Odwrotne rozpiętki na maszynie Pec Deck
 * 144 | Odwrotne rozpiętki z hantlami
 * 145 | Odwrotne rozpiętki na linkach
 * 208 | Jednorącz odwodzenie ramienia w tył na wyciągu
 * 209 | Rozciąganie gumy przed klatką (Band Pull-Apart)
 *
 * SHOULDERS — Front raises (front_delt dominant)
 * 146 | Unoszenie hantli w przód
 */
const BIAS_MAP: Array<[id: number, biases: Record<string, number>]> = [
  // ── Chest: flat pressing ───────────────────────────────────────────────────
  [1,   { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [115, { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [117, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],
  [118, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],
  [170, { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [173, { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [174, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],
  [215, { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [216, { upper_chest: 0.2, mid_chest: 0.65, lower_chest: 0.15 }],
  [217, { upper_chest: 0.2, mid_chest: 0.6, lower_chest: 0.2 }],
  [218, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],
  [219, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],
  [220, { upper_chest: 0.2, mid_chest: 0.55, lower_chest: 0.25 }],

  // ── Chest: incline pressing ────────────────────────────────────────────────
  [113, { upper_chest: 0.6, mid_chest: 0.3, lower_chest: 0.1 }],
  [114, { upper_chest: 0.6, mid_chest: 0.3, lower_chest: 0.1 }],
  [121, { upper_chest: 0.65, mid_chest: 0.25, lower_chest: 0.1 }],
  [179, { upper_chest: 0.6, mid_chest: 0.3, lower_chest: 0.1 }],
  [221, { upper_chest: 0.55, mid_chest: 0.35, lower_chest: 0.1 }],

  // ── Chest: decline pressing ────────────────────────────────────────────────
  [116, { upper_chest: 0.1, mid_chest: 0.35, lower_chest: 0.55 }],
  [122, { upper_chest: 0.1, mid_chest: 0.25, lower_chest: 0.65 }],
  [171, { upper_chest: 0.1, mid_chest: 0.3, lower_chest: 0.6 }],
  [172, { upper_chest: 0.1, mid_chest: 0.3, lower_chest: 0.6 }],
  [175, { upper_chest: 0.1, mid_chest: 0.3, lower_chest: 0.6 }],
  [176, { upper_chest: 0.1, mid_chest: 0.3, lower_chest: 0.6 }],

  // ── Chest: mid-plane flies ─────────────────────────────────────────────────
  [119, { upper_chest: 0.25, mid_chest: 0.6, lower_chest: 0.15 }],
  [120, { upper_chest: 0.25, mid_chest: 0.6, lower_chest: 0.15 }],
  [177, { upper_chest: 0.2, mid_chest: 0.65, lower_chest: 0.15 }],
  [178, { upper_chest: 0.25, mid_chest: 0.6, lower_chest: 0.15 }],

  // ── Back: vertical pull (lats dominant) ───────────────────────────────────
  [2,   { lats: 0.7, upper_back: 0.3 }],
  [123, { lats: 0.65, upper_back: 0.35 }],
  [124, { lats: 0.7, upper_back: 0.3 }],
  [125, { lats: 0.65, upper_back: 0.35 }],
  [126, { lats: 0.7, upper_back: 0.3 }],
  [127, { lats: 0.65, upper_back: 0.35 }],
  [135, { lats: 0.8, upper_back: 0.2 }],
  [205, { lats: 0.7, upper_back: 0.3 }],
  [224, { lats: 0.4, upper_back: 0.6 }],

  // ── Back: horizontal pull (upper_back dominant) ───────────────────────────
  [128, { lats: 0.35, upper_back: 0.65 }],
  [129, { lats: 0.3, upper_back: 0.7 }],
  [130, { lats: 0.3, upper_back: 0.7 }],
  [131, { lats: 0.35, upper_back: 0.65 }],
  [132, { lats: 0.35, upper_back: 0.65 }],
  [133, { lats: 0.3, upper_back: 0.7 }],
  [134, { lats: 0.3, upper_back: 0.7 }],
  [180, { lats: 0.3, upper_back: 0.7 }],
  [181, { lats: 0.4, upper_back: 0.6 }],
  [185, { lats: 0.3, upper_back: 0.7 }],

  // ── Shoulders: overhead pressing (front_delt dominant) ────────────────────
  [4,   { front_delt: 0.55, lateral_delt: 0.35, rear_delt: 0.1 }],
  [137, { front_delt: 0.55, lateral_delt: 0.35, rear_delt: 0.1 }],
  [138, { front_delt: 0.5, lateral_delt: 0.4, rear_delt: 0.1 }],
  [139, { front_delt: 0.55, lateral_delt: 0.35, rear_delt: 0.1 }],
  [186, { front_delt: 0.6, lateral_delt: 0.3, rear_delt: 0.1 }],

  // ── Shoulders: lateral raises (lateral_delt dominant) ─────────────────────
  [140, { front_delt: 0.1, lateral_delt: 0.8, rear_delt: 0.1 }],
  [141, { front_delt: 0.1, lateral_delt: 0.8, rear_delt: 0.1 }],
  [142, { front_delt: 0.1, lateral_delt: 0.8, rear_delt: 0.1 }],

  // ── Shoulders: rear delt / face pull (rear_delt dominant) ─────────────────
  [136, { rear_delt: 0.7, lateral_delt: 0.2, upper_back: 0.1 }],
  [143, { rear_delt: 0.8, lateral_delt: 0.2 }],
  [144, { rear_delt: 0.7, lateral_delt: 0.2, upper_back: 0.1 }],
  [145, { rear_delt: 0.7, lateral_delt: 0.2, upper_back: 0.1 }],
  [208, { lateral_delt: 0.5, rear_delt: 0.5 }],
  [209, { rear_delt: 0.6, lateral_delt: 0.3, upper_back: 0.1 }],

  // ── Shoulders: front raises (front_delt dominant) ─────────────────────────
  [146, { front_delt: 0.8, lateral_delt: 0.15, rear_delt: 0.05 }],

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Biceps / Triceps / Core / Quads / Hamstrings / Glutes /
  //           Back (lower) / Full-body carries / Calves
  //
  // Key naming convention: use substrings of canonical Polish survey-combobox
  // muscle-group names so scoreSubTargetBias() substring-matching fires.
  //   "biceps"        ← "Biceps"
  //   "triceps"       ← "Triceps"
  //   "brzuch"        ← "Brzuch"
  //   "czworogłowe"   ← "Mięśnie czworogłowe uda"
  //   "dwugłowe"      ← "Mięśnie dwugłowe uda"
  //   "pośladki"      ← "Pośladki"
  //   "plecy"         ← "Plecy"
  //   "barki"         ← "Barki"
  //   "klatka"        ← "Klatka piersiowa"
  //   "przedramiona"  ← "Przedramiona"
  //   "łydki"         ← "Łydki"
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Biceps — elbow flexion isolation ──────────────────────────────────────
  // ID  | Name
  // 147 | Uginanie ramion ze sztangą
  // 148 | Uginanie ramion ze sztangą EZ
  // 149 | Uginanie ramion z hantlami
  // 150 | Uginanie młotkowe z hantlami          (brachialis / long head)
  // 151 | Uginanie ramion z hantlami na ławce skośnej  (long-head stretch)
  // 152 | Uginanie ramion na modlitewniku        (short head / peak)
  // 153 | Uginanie ramion na wyciągu
  [147, { biceps: 1.0 }],
  [148, { biceps: 1.0 }],
  [149, { biceps: 1.0 }],
  [150, { biceps: 0.65, przedramiona: 0.35 }],
  [151, { biceps: 1.0 }],
  [152, { biceps: 1.0 }],
  [153, { biceps: 1.0 }],

  // ── Triceps — elbow extension isolation / pressing ────────────────────────
  // 154 | Prostowanie ramion z liną na wyciągu      (lateral / medial head)
  // 155 | Prostowanie ramion z drążkiem na wyciągu  (lateral / medial head)
  // 156 | Prostowanie ramion nad głową z liną        (long head dominant)
  // 157 | Wyciskanie francuskie sztangą EZ           (long head dominant)
  // 158 | Wyciskanie sztangi wąskim chwytem          (all heads + pecs)
  // 190 | Prostowanie ramion nad głową z hantlem     (long head dominant)
  [154, { triceps: 1.0 }],
  [155, { triceps: 1.0 }],
  [156, { triceps: 1.0 }],
  [157, { triceps: 1.0 }],
  [158, { triceps: 0.7, klatka: 0.3 }],
  [190, { triceps: 1.0 }],

  // ── Core / Brzuch — anti-extension, stabilisation, flexion ───────────────
  //   5 | Plank                    (deep core / anti-extension)
  // 159 | Dead bug                 (deep core / anti-extension)
  // 160 | Bird dog                 (lumbar stabilisation)
  // 161 | Plank boczny             (lateral chain / obliques)
  // 162 | Pallof press             (anti-rotation / obliques)
  // 165 | Unoszenie kolan w zwisie (lower abs / hip flexors)
  // 166 | Ab wheel rollout         (rectus abdominis / anti-extension)
  // 197 | Hollow body hold         (rectus abdominis / deep core)
  [5,   { brzuch: 1.0 }],
  [159, { brzuch: 1.0 }],
  [160, { brzuch: 1.0 }],
  [161, { brzuch: 1.0 }],
  [162, { brzuch: 1.0 }],
  [165, { brzuch: 1.0 }],
  [166, { brzuch: 1.0 }],
  [197, { brzuch: 1.0 }],

  // ── Full-body carries / locomotion ────────────────────────────────────────
  // 167 | Spacer farmera    (grip, traps, core)
  // 168 | Spacer walizkowy  (obliques, lateral core, grip)
  // 169 | Bear crawl        (core, shoulders, thoracic)
  [167, { plecy: 0.4, brzuch: 0.3, przedramiona: 0.3 }],
  [168, { brzuch: 0.5, plecy: 0.3, przedramiona: 0.2 }],
  [169, { brzuch: 0.5, barki: 0.3, plecy: 0.2 }],

  // ── Quads — squat patterns (czworogłowe dominant) ─────────────────────────
  //   3 | Przysiad ze sztangą                     (quad + glute + hamstring)
  //  88 | Przysiad goblet z hantlem               (quad + glute)
  //  89 | Przysiad do skrzyni                     (quad + glute)
  //  90 | Przysiad do skrzyni z masą własnego c.  (quad + glute)
  //  91 | Hack squat na maszynie                  (quad dominant, VMO)
  //  92 | Wypychanie nóg na suwnicy 45°           (quad + glute)
  //  93 | Przysiad na suwnicy Smitha              (quad + glute)
  //  94 | Przysiad bułgarski                      (quad + glute, unilateral)
  //  95 | Przysiad wykroczny z podparciem         (quad + glute, unilateral)
  //  96 | Wykrok w tył                            (quad + glute, unilateral)
  //  97 | Wykroki chodzone                        (quad + glute, unilateral)
  // 102 | Martwy ciąg z trap barem                (quad + glute + back)
  // 191 | Przysiad ze sztangą z przodu            (quad dominant, VMO)
  [3,   { czworogłowe: 0.55, pośladki: 0.3, dwugłowe: 0.15 }],
  [88,  { czworogłowe: 0.6, pośladki: 0.4 }],
  [89,  { czworogłowe: 0.6, pośladki: 0.4 }],
  [90,  { czworogłowe: 0.6, pośladki: 0.4 }],
  [91,  { czworogłowe: 0.75, pośladki: 0.25 }],
  [92,  { czworogłowe: 0.65, pośladki: 0.35 }],
  [93,  { czworogłowe: 0.6, pośladki: 0.4 }],
  [94,  { czworogłowe: 0.55, pośladki: 0.45 }],
  [95,  { czworogłowe: 0.6, pośladki: 0.4 }],
  [96,  { czworogłowe: 0.55, pośladki: 0.45 }],
  [97,  { czworogłowe: 0.55, pośladki: 0.45 }],
  [102, { czworogłowe: 0.5, pośladki: 0.3, dwugłowe: 0.2 }],
  [191, { czworogłowe: 0.75, pośladki: 0.25 }],

  // ── Quads — plyometric / explosive patterns ───────────────────────────────
  // 250 | Skok z zamachem              (explosive quad + glute)
  // 251 | Skok w dal z miejsca         (horizontal power, quad + glute)
  // 252 | Zeskok z natychmiastowym wyb.(reactive SSC, quad + glute)
  // 254 | Skoki boczne jednonóż        (lateral power, glute med + quad)
  // 255 | Skok jednonóż                (unilateral power, quad + glute)
  // 256 | Nauka lądowania              (eccentric quad emphasis)
  // 258 | Przeskoki boczne z nogi      (lateral bounds, quad + glute)
  [250, { czworogłowe: 0.55, pośladki: 0.45 }],
  [251, { czworogłowe: 0.5, pośladki: 0.5 }],
  [252, { czworogłowe: 0.55, pośladki: 0.45 }],
  [254, { pośladki: 0.55, czworogłowe: 0.45 }],
  [255, { czworogłowe: 0.5, pośladki: 0.5 }],
  [256, { czworogłowe: 0.65, pośladki: 0.35 }],
  [258, { czworogłowe: 0.5, pośladki: 0.5 }],

  // ── Hamstrings — hip-hinge patterns (dwugłowe dominant) ──────────────────
  // 100 | Martwy ciąg rumuński ze sztangą  (hamstring + glute)
  // 101 | Martwy ciąg rumuński z hantlami  (hamstring + glute)
  // 103 | Martwy ciąg z kettlebell         (hamstring + glute)
  // 192 | Martwy ciąg sumo                 (glute + hamstring + quad)
  [100, { dwugłowe: 0.55, pośladki: 0.45 }],
  [101, { dwugłowe: 0.55, pośladki: 0.45 }],
  [103, { dwugłowe: 0.5, pośladki: 0.5 }],
  [192, { pośladki: 0.45, dwugłowe: 0.35, czworogłowe: 0.2 }],

  // ── Back (lower) — hip-hinge strength ─────────────────────────────────────
  // 182 | Martwy ciąg konwencjonalny  (lower back + glute + hamstring)
  // 183 | Wznosy tułowia              (lower back + glute)
  [182, { plecy: 0.4, pośladki: 0.3, dwugłowe: 0.3 }],
  [183, { plecy: 0.6, pośladki: 0.4 }],

  // ── Glutes — hip-extension & abduction patterns ───────────────────────────
  // 104 | Hip thrust          (glute max dominant)
  // 105 | Glute bridge        (glute max dominant)
  // 253 | Wskok na podwyższenie        (explosive glute + quad)
  // 257 | Skok boczny z zatrzymaniem   (glute med + quad, lateral decel)
  [104, { pośladki: 0.85, dwugłowe: 0.15 }],
  [105, { pośladki: 0.9, dwugłowe: 0.1 }],
  [253, { pośladki: 0.5, czworogłowe: 0.5 }],
  [257, { pośladki: 0.6, czworogłowe: 0.4 }],

  // ── Calves ─────────────────────────────────────────────────────────────────
  // 249 | Skoki pogo  (calf / ankle stiffness, SSC)
  [249, { łydki: 1.0 }],
];

export async function seedSubTargetBiases(): Promise<void> {
  let applied = 0;
  let skipped = 0;

  for (const [id, biases] of BIAS_MAP) {
    const biasJson = JSON.stringify(biases);
    const result = await db.execute(sql`
      UPDATE exercises
      SET sub_target_biases = ${biasJson}::jsonb
      WHERE id = ${id}
        AND (
          sub_target_biases IS DISTINCT FROM ${biasJson}::jsonb
        )
    `);
    const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 0;
    if (rowCount > 0) {
      applied++;
    } else {
      skipped++;
    }
  }

  logger.info(
    { applied, skipped, total: BIAS_MAP.length },
    "Sub-target bias seed complete",
  );
}
