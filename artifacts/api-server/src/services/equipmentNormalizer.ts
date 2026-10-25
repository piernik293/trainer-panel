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
  "Uchwyty do pompek",
  "Kółka gimnastyczne",
  "Roller",
  "Landmine",
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

  // Talerz obciążeniowy — talerze są częścią „Sztanga i talerze” z wywiadu
  "talerz": "Sztanga i talerze",
  "talerze": "Sztanga i talerze",
  "talerz obciążeniowy": "Sztanga i talerze",
  "weight plate": "Sztanga i talerze",

  // Uchwyty do pompek
  "uchwyty do pompek": "Uchwyty do pompek",
  "push-up handles": "Uchwyty do pompek",

  // Kółka gimnastyczne
  "kółka gimnastyczne": "Kółka gimnastyczne",
  "kółka": "Kółka gimnastyczne",
  "gymnastic rings": "Kółka gimnastyczne",
  "rings": "Kółka gimnastyczne",

  // Roller (wałek do rolowania) — opcja w wywiadzie
  "roller": "Roller",
  "wałek": "Roller",
  "wałek do rolowania": "Roller",
  "foam roller": "Roller",

  // Landmine — tylko siłownia (uchwyt na sztangę), brak opcji w wywiadzie
  "landmine": "Landmine",

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
  // Decyzja właściciela 25.10.2026: siłownia = pełny katalog sprzętu (nie tylko pozycje zaznaczone w wywiadzie).
  "Sztanga łamana (EZ)",
  "Piłka lekarska",
  "Piłka stabilizacyjna (bosu/fit)",
  "Roller",
  "Landmine",
  "Rower stacjonarny / orbitrek",
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
 * Gym (or unknown location) → FULL_GYM_EQUIPMENT. Home / outdoor → bodyweight
 * only — the same rule the compatibility check uses (effectiveClientEquipment);
 * guessing home equipment would admit exercises the client may not be able to do.
 */
export function defaultEquipmentForLocation(location: string | null | undefined): string[] {
  if (!location) return FULL_GYM_EQUIPMENT;
  const loc = location.toLowerCase();
  if (loc.includes("dom") || loc.includes("plener")) return ["Masa własnego ciała"];
  return FULL_GYM_EQUIPMENT;
}

/** Lowercased location → 'siłownia' | 'plener' | 'dom' | null (same rules as the compatibility check). */
export function locationKind(location: string | null | undefined): "siłownia" | "plener" | "dom" | null {
  const l = location?.trim().toLowerCase();
  if (!l) return null;
  if (l === "siłownia") return "siłownia";
  if (l === "siłownia plenerowa" || l.includes("plener")) return "plener";
  if (l.includes("dom")) return "dom";
  return null;
}

/**
 * Equipment the generator may use (owner's decision 25.10.2026):
 *  - Siłownia: the FULL gym catalogue plus anything ticked in the interview (e.g. rings, push-up handles, roller);
 *  - Siłownia plenerowa: what is ticked, plus resistance bands (portable);
 *  - Dom and unknown location: what is ticked (bodyweight is always allowed by the compatibility check).
 */
export function expandEquipmentForLocation(listed: readonly string[], location: string | null | undefined): string[] {
  const kind = locationKind(location);
  const extra = kind === "siłownia" ? FULL_GYM_EQUIPMENT : kind === "plener" ? ["Gumy oporowe"] : [];
  return [...new Set([...listed, ...extra])];
}
