/**
 * Equipment Normalizer
 *
 * Maps free-text survey equipment strings to canonical Exercise Library values.
 * The canonical values are the exact strings used in exercises.equipment[].
 *
 * Rules:
 *  - Input is the survey `equipment` text field (comma-separated or single value).
 *  - Matching is case-insensitive and trims whitespace.
 *  - Unknown tokens are preserved as-is (trainer may have entered valid custom equipment).
 *  - This module NEVER modifies the Exercise Library.
 */

// ─── Canonical equipment values ───────────────────────────────────────────────
// Derived from the Exercise Library (exercises.equipment[]).

export const CANONICAL_EQUIPMENT = [
  "Hantle",
  "Sztanga",
  "Sztanga i talerze",
  "Sztanga łamana (EZ)",
  "Ławeczka treningowa",
  "Maszyna",
  "Wyciąg",
  "Klatka / Power rack",
  "Kettlebell",
  "Gumy oporowe",
  "Drążek do podciągania",
  "Poręcze",
  "TRX / pasy treningowe",
  "Rower stacjonarny / orbitrek",
  "Piłka lekarska",
  "Piłka stabilizacyjna (bosu/fit)",
  "Brak sprzętu",
  "Masa własnego ciała",
] as const;

export type CanonicalEquipment = typeof CANONICAL_EQUIPMENT[number];

// ─── Alias map ────────────────────────────────────────────────────────────────
// Keys: lower-cased aliases / common misspellings / abbreviations.
// Values: canonical strings from CANONICAL_EQUIPMENT.

const ALIAS_MAP: Record<string, string> = {
  // Hantle
  "hantle": "Hantle",
  "hantel": "Hantle",
  "hantels": "Hantle",
  "dumbbell": "Hantle",
  "dumbbells": "Hantle",

  // Sztanga
  "sztanga": "Sztanga i talerze",
  "sztanga olimpijska": "Sztanga i talerze",
  "sztanga z talerze": "Sztanga i talerze",
  "sztanga i talerze": "Sztanga i talerze",
  "barbell": "Sztanga i talerze",

  // Sztanga łamana
  "sztanga ez": "Sztanga łamana (EZ)",
  "sztanga łamana": "Sztanga łamana (EZ)",
  "ez bar": "Sztanga łamana (EZ)",

  // Ławeczka
  "ławeczka": "Ławeczka treningowa",
  "ławeczka treningowa": "Ławeczka treningowa",
  "ławka": "Ławeczka treningowa",
  "bench": "Ławeczka treningowa",

  // Maszyna
  "maszyna": "Maszyna",
  "maszyny": "Maszyna",
  "machine": "Maszyna",
  "machines": "Maszyna",

  // Wyciąg
  "wyciąg": "Wyciąg",
  "wyciagi": "Wyciąg",
  "wyciągi": "Wyciąg",
  "cable": "Wyciąg",
  "kabel": "Wyciąg",

  // Klatka
  "klatka": "Klatka / Power rack",
  "power rack": "Klatka / Power rack",
  "rack": "Klatka / Power rack",
  "klatka treningowa": "Klatka / Power rack",

  // Kettlebell
  "kettlebell": "Kettlebell",
  "kettlebells": "Kettlebell",
  "kettleball": "Kettlebell",
  "kettle": "Kettlebell",

  // Gumy oporowe
  "gumy": "Gumy oporowe",
  "gumy oporowe": "Gumy oporowe",
  "guma": "Gumy oporowe",
  "resistance bands": "Gumy oporowe",
  "bands": "Gumy oporowe",

  // Drążek
  "drążek": "Drążek do podciągania",
  "drążek do podciągania": "Drążek do podciągania",
  "drązek": "Drążek do podciągania",
  "pull-up bar": "Drążek do podciągania",

  // Poręcze
  "poręcze": "Poręcze",
  "dips": "Poręcze",
  "dip bars": "Poręcze",

  // TRX
  "trx": "TRX / pasy treningowe",
  "trx / pasy treningowe": "TRX / pasy treningowe",
  "pasy treningowe": "TRX / pasy treningowe",
  "suspension trainer": "TRX / pasy treningowe",

  // Cardio
  "rower": "Rower stacjonarny / orbitrek",
  "orbitrek": "Rower stacjonarny / orbitrek",
  "rower stacjonarny": "Rower stacjonarny / orbitrek",
  "rower stacjonarny / orbitrek": "Rower stacjonarny / orbitrek",
  "cardio machine": "Rower stacjonarny / orbitrek",

  // Piłka lekarska
  "piłka lekarska": "Piłka lekarska",
  "med ball": "Piłka lekarska",
  "medicine ball": "Piłka lekarska",

  // Piłka stabilizacyjna
  "piłka": "Piłka stabilizacyjna (bosu/fit)",
  "bosu": "Piłka stabilizacyjna (bosu/fit)",
  "fitball": "Piłka stabilizacyjna (bosu/fit)",
  "piłka stabilizacyjna": "Piłka stabilizacyjna (bosu/fit)",

  // Brak sprzętu / masa własna
  "brak sprzętu": "Brak sprzętu",
  "brak": "Brak sprzętu",
  "masa własna": "Masa własnego ciała",
  "masa własnego ciała": "Masa własnego ciała",
  "bodyweight": "Masa własnego ciała",
  "bw": "Masa własnego ciała",
  "ciężar ciała": "Masa własnego ciała",
};

// ─── Full gym equipment (assumed when no equipment data available) ─────────────

export const FULL_GYM_EQUIPMENT: string[] = [
  "Hantle",
  "Sztanga i talerze",
  "Ławeczka treningowa",
  "Maszyna",
  "Wyciąg",
  "Klatka / Power rack",
  "Kettlebell",
  "Gumy oporowe",
  "Drążek do podciągania",
  "Poręcze",
  "TRX / pasy treningowe",
];

// ─── Home gym equipment (Siłownia plenerowa or Dom fallback) ──────────────────

export const HOME_GYM_EQUIPMENT: string[] = [
  "Hantle",
  "Gumy oporowe",
  "Drążek do podciągania",
  "Poręcze",
  "TRX / pasy treningowe",
  "Brak sprzętu",
  "Masa własnego ciała",
];

// ─── Core normalization function ──────────────────────────────────────────────

/**
 * Parse and normalize a free-text equipment string (from survey.equipment)
 * into an array of canonical Exercise Library equipment values.
 *
 * @param raw  The raw survey equipment text (may be comma-separated).
 * @returns    Array of canonical equipment strings (deduped, preserves unknown tokens).
 */
export function normalizeEquipmentList(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];

  // Split on common separators: comma, semicolon, newline
  const tokens = raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const canonical = ALIAS_MAP[lower];

    const resolved = canonical ?? token; // Preserve unknown tokens as-is
    if (!seen.has(resolved)) {
      seen.add(resolved);
      result.push(resolved);
    }
  }

  return result;
}

/**
 * Check whether a given equipment string maps to a canonical value.
 */
export function isCanonicalEquipment(value: string): value is CanonicalEquipment {
  return (CANONICAL_EQUIPMENT as readonly string[]).includes(value);
}

/**
 * Determine the default equipment list to use when no equipment data is available.
 * Falls back to FULL_GYM_EQUIPMENT for gym context, HOME_GYM_EQUIPMENT otherwise.
 */
export function defaultEquipmentForLocation(location: string | null | undefined): string[] {
  if (!location) return FULL_GYM_EQUIPMENT;
  const loc = location.toLowerCase();
  if (loc.includes("dom") || loc.includes("plener")) return HOME_GYM_EQUIPMENT;
  return FULL_GYM_EQUIPMENT;
}
