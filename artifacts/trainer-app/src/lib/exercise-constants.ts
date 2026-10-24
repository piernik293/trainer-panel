// Wspólne słowniki dla biblioteki ćwiczeń. Wartości po polsku, zgodnie z
// konwencją używaną już w wywiadzie treningowym (SurveyForm).

export const MAIN_MUSCLE_GROUPS = [
  "Klatka piersiowa",
  "Plecy",
  "Barki",
  "Biceps",
  "Triceps",
  "Przedramiona",
  "Brzuch",
  "Pośladki",
  "Mięśnie czworogłowe uda",
  "Mięśnie dwugłowe uda",
  "Przywodziciele",
  "Odwodziciele",
  "Łydki",
  "Całe ciało",
  "Inne",
] as const;

export const EQUIPMENT_OPTIONS = [
  "Sztanga",
  "Hantle",
  "Kettlebell",
  "Maszyna",
  "Wyciąg",
  "Drążek",
  "Poręcze",
  "Ławka",
  "Gumy oporowe",
  "TRX",
  "Masa własnego ciała",
  "Piłka",
  "Piłka lekarska",
  "Brak sprzętu",
  "Inny",
] as const;

export const TRAINING_LOCATION_OPTIONS = [
  "Siłownia",
  "Dom",
  "Plener",
] as const;

/**
 * Movement complexity tiers — stored as `movementComplexity` on exercises.
 * Assigned from learningDifficulty (1→Prosta, 2–3→Umiarkowana, 4–5→Złożona).
 * All suitableForNoActivity exercises override to "Prosta".
 */
export const MOVEMENT_COMPLEXITY_OPTIONS = ["Prosta", "Umiarkowana", "Złożona"] as const;

/**
 * Maps canonical stored location values to their user-facing display labels.
 *
 * The database and API always use the canonical key ("Plener").
 * The trainer always sees the display label ("Siłownia plenerowa").
 * Use this map everywhere a location label is shown in the UI.
 */
export const LOCATION_DISPLAY_LABELS: Record<string, string> = {
  Plener: "Siłownia plenerowa",
};

/** Return the display label for a stored location value. Falls back to the value itself. */
export function getLocationDisplayLabel(value: string): string {
  return LOCATION_DISPLAY_LABELS[value] ?? value;
}

export const DIFFICULTY_LEVEL_OPTIONS = [
  "Początkujący",
  "Średniozaawansowany",
  "Zaawansowany",
] as const;

export const MOVEMENT_PATTERN_OPTIONS = [
  "Pchanie poziome",
  "Pchanie pionowe",
  "Przyciąganie poziome",
  "Przyciąganie pionowe",
  "Przysiad",
  "Zawias biodrowy",
  "Wykrok",
  "Zgięcie kolana",
  "Wyprost kolana",
  "Odwodzenie",
  "Przywodzenie",
  "Zgięcie łokcia",
  "Wyprost łokcia",
  "Stabilizacja tułowia",
  "Zgięcie tułowia",
  "Rotacja",
  "Lokomocja",
  "Inne",
] as const;

// ─── New fields ───────────────────────────────────────────────────────────────

export const EXERCISE_TYPE_OPTIONS = [
  "Złożone",
  "Izolowane",
] as const;

export const MOVEMENT_CATEGORY_OPTIONS = [
  "Pchanie",
  "Ciągnięcie",
  "Przysiad",
  "Zawiasowe",
  "Wykrok",
  "Dźwiganie",
  "Rotacja",
  "Core",
] as const;

export const PLANE_OF_MOTION_OPTIONS = [
  "Strzałkowa",
  "Czołowa",
  "Poprzeczna",
] as const;

export const EXECUTION_OPTIONS = [
  "Obustronne",
  "Jednostronne",
] as const;

/**
 * Maps canonical DB execution values to their user-facing display labels.
 * Database records always store the canonical value ("Obustronne" / "Jednostronne").
 * Use this map everywhere a label is shown to the trainer.
 */
export const EXECUTION_LABELS: Record<string, string> = {
  "Obustronne":   "Obustronne (bilateralne)",
  "Jednostronne": "Jednostronne (unilateralne)",
};

export const RESISTANCE_TYPE_OPTIONS = [
  "Sztanga",
  "Hantle",
  "Maszyna",
  "Wyciąg",
  "Masa własnego ciała",
  "Gumy oporowe",
  "Kettlebell",
  "TRX",
  "Landmine",
] as const;

export const CAN_PERFORM_TO_FAILURE_OPTIONS = [
  "Tak",
  "Nie",
  "Z ostrożnością",
] as const;

export const JOINT_STRESS_OPTIONS = [
  "Niskie",
  "Średnie",
  "Wysokie",
] as const;

export const EXERCISE_PRIORITY_OPTIONS = [
  "Bardzo wysoki",
  "Wysoki",
  "Średni",
  "Niski",
] as const;

export const TRAINING_GOAL_OPTIONS = [
  "Hipertrofia",
  "Siła",
  "Redukcja tłuszczu",
  "Zdrowie ogólne",
  "Wydajność sportowa",
] as const;

export const SUITABLE_EXPERIENCE_LEVEL_OPTIONS = [
  "Brak aktywności fizycznej",
  "Początkujący",
  "Średniozaawansowany",
  "Zaawansowany",
] as const;

/**
 * Canonical experience-level hierarchy — single frontend source of truth.
 *
 * Display order: introductory first ("Brak aktywności fizycznej"), advanced
 * last ("Zaawansowany").  Exactly four values — do NOT add more.
 *
 * Use this constant wherever experience levels are listed, filtered or
 * validated.  Do not maintain a separate hardcoded array elsewhere in the
 * frontend.
 */
export const CANONICAL_EXPERIENCE_LEVELS = SUITABLE_EXPERIENCE_LEVEL_OPTIONS;

export type ExperienceLevel = (typeof CANONICAL_EXPERIENCE_LEVELS)[number];

export const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
