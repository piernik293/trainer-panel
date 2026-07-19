/**
 * Sub-Target Bias Seed — Phase 1 (Chest / Back / Shoulders)
 *
 * Sets `sub_target_biases` on exercises for all three muscle groups.
 * Values are practical coaching-bias proportions, NOT scientific measurements.
 * Idempotent: safe to re-run on every startup.
 *
 * Bias convention:
 *   Chest:     upper_chest | mid_chest | lower_chest   (sum ≈ 1.0)
 *   Back:      lats | upper_back                       (sum ≈ 1.0)
 *   Shoulders: front_delt | lateral_delt | rear_delt   (sum ≈ 1.0)
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
