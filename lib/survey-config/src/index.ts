// ─── Survey Config — single source of truth for both client and trainer forms ──
//
// This module owns every option array, helper text, and conditional-logic
// predicate that must remain in sync across client-landing and trainer-app.
//
// Rules:
//  • Option VALUES here are what land in the database — never change spellings.
//  • UI descriptions may differ between client (2nd person) and trainer (3rd
//    person) forms; keep values identical, adapt prose in each form component.
//  • Conditional logic helpers live here so both forms branch identically.

// ─── Training goal ────────────────────────────────────────────────────────────

export const TRAINING_GOAL_OPTIONS = [
  "Budowa sylwetki",
  "Zwiększenie siły",
  "Redukcja tkanki tłuszczowej",
  "Poprawa kondycji",
  "Poprawa sprawności",
  "Cel sportowy",
] as const;

export type TrainingGoal = (typeof TRAINING_GOAL_OPTIONS)[number];

// ─── Athlete / sport level ────────────────────────────────────────────────────

/** UI display values — mapped to legacy API format on submit. */
export const ATHLETE_STATUS_OPTIONS = ["Hobbystycznie", "Zawodowo"] as const;
export type AthleteStatus = (typeof ATHLETE_STATUS_OPTIONS)[number];

/** Map UI value → API/DB stored value. */
export const ATHLETE_STATUS_TO_API: Record<AthleteStatus, string> = {
  Hobbystycznie: "Tak — amatorsko",
  Zawodowo: "Tak — zawodowo",
};

/** Reverse map — DB/API value → UI select value. */
export const API_TO_ATHLETE_STATUS: Record<string, AthleteStatus> = {
  "Tak — amatorsko": "Hobbystycznie",
  "Tak — zawodowo": "Zawodowo",
};

export const SPORT_PERFORMANCE_NEEDS = [
  {
    value: "Dynamika",
    desc: "Moc, skoczność, eksplozywność i szybkie generowanie siły.",
  },
  {
    value: "Szybkość",
    desc: "Przyspieszenie, tempo ruchu i szybkie poruszanie się w akcji sportowej.",
  },
  {
    value: "Stabilizacja",
    desc: "Kontrola ruchu, równowaga, lądowanie i utrzymanie pozycji pod obciążeniem.",
  },
] as const;

// ─── Experience level ─────────────────────────────────────────────────────────

export const EXPERIENCE_LEVEL_OPTIONS = [
  {
    level: "Brak aktywności fizycznej",
    desc: "Nie podejmuje regularnej aktywności fizycznej lub wraca po długiej przerwie. Chce spokojnie zacząć i stopniowo przygotować organizm do regularnego wysiłku.",
  },
  {
    level: "Początkujący",
    desc: "Małe doświadczenie treningowe. Nadal uczy się podstawowych ćwiczeń i poprawnej techniki.",
  },
  {
    level: "Średniozaawansowany",
    desc: "Trenuje regularnie i swobodnie wykonuje większość podstawowych ćwiczeń. Świadomie realizuje plan treningowy.",
  },
  {
    level: "Zaawansowany",
    desc: "Duże doświadczenie treningowe. Bardzo dobrze zna swoje możliwości i świadomie wykorzystuje różne metody treningowe.",
  },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVEL_OPTIONS)[number]["level"];

// ─── Session duration ─────────────────────────────────────────────────────────

export const SESSION_DURATION_OPTIONS = [
  "30–45 min",
  "45–60 min",
  "60–90 min",
  "90+ min",
] as const;

// ─── Training location & equipment ───────────────────────────────────────────

export const TRAINING_LOCATION_OPTIONS = [
  {
    loc: "Siłownia",
    desc: "Dostęp do pełnego wyposażenia siłowni.",
  },
  {
    loc: "Dom",
    desc: "Trenuje w domu.",
  },
  {
    loc: "Siłownia plenerowa",
    desc: "Trenuje głównie na drążkach, poręczach oraz sprzęcie dostępnym na świeżym powietrzu.",
  },
] as const;

export const EQUIPMENT_OPTIONS = [
  "Hantle",
  "Sztanga i talerze",
  "Ławeczka treningowa",
  "Kettlebell",
  "Gumy oporowe",
  "Drążek do podciągania",
  "TRX / pasy treningowe",
  "Rower stacjonarny / orbitrek",
  "Brak sprzętu",
] as const;

// ─── Cardio ───────────────────────────────────────────────────────────────────

export const CARDIO_PREFERENCE_OPTIONS = [
  "Chętnie uwzględnię cardio w planie",
  "Cardio może być dodatkiem do planu",
  "Wolę ograniczyć cardio do niezbędnego minimum",
] as const;

export const CARDIO_FREQUENCY_OPTIONS = [
  "Nie wykonuję cardio",
  "1 raz w tygodniu",
  "2–3 razy w tygodniu",
  "4 lub więcej razy w tygodniu",
] as const;

export const PREFERRED_CARDIO_TYPE_OPTIONS = [
  "Marsz",
  "Szybki marsz",
  "Sport rekreacyjny",
  "Bieganie",
  "Rower",
  "Orbitrek",
  "Pływanie",
  "Wioślarz",
  "Stepper / schody",
] as const;

// ─── Lifestyle ────────────────────────────────────────────────────────────────

export const ACTIVITY_LEVEL_OPTIONS = [
  {
    level: "Siedzący",
    clientDesc:
      "Większość dnia spędzam siedząc (np. praca biurowa, nauka lub praca przy komputerze).",
    trainerDesc:
      "Większość dnia spędza siedząc (np. praca biurowa, nauka lub praca przy komputerze).",
  },
  {
    level: "Lekko aktywny",
    clientDesc:
      "W ciągu dnia sporo chodzę lub wykonuję lekką aktywność, jednak nie jest to ciężka praca fizyczna.",
    trainerDesc:
      "W ciągu dnia sporo chodzi lub wykonuje lekką aktywność, jednak nie jest to ciężka praca fizyczna.",
  },
  {
    level: "Praca fizyczna",
    clientDesc:
      "Moja praca wymaga regularnego wysiłku fizycznego, przenoszenia ciężarów lub długotrwałego ruchu.",
    trainerDesc:
      "Praca wymaga regularnego wysiłku fizycznego, przenoszenia ciężarów lub długotrwałego ruchu.",
  },
  {
    level: "Bardzo aktywny",
    clientDesc:
      "Na co dzień wykonuję ciężką pracę fizyczną lub jestem aktywny przez większość dnia.",
    trainerDesc:
      "Na co dzień wykonuje ciężką pracę fizyczną lub jest aktywny przez większość dnia.",
  },
] as const;

export const SLEEP_HOURS_OPTIONS = [
  "Poniżej 5 godzin",
  "5–6 godzin",
  "6–7 godzin",
  "7–8 godzin",
  "Powyżej 8 godzin",
] as const;

// ─── Plan style ───────────────────────────────────────────────────────────────

export const PLAN_STYLE_OPTIONS = [
  {
    style: "Maksymalna efektywność",
    desc: "Najważniejsze są jak najlepsze efekty.",
  },
  {
    style: "Balans efektywności i wygody",
    desc: "Dobre efekty przy zachowaniu komfortu treningów.",
  },
  {
    style: "Prosty i łatwy do utrzymania",
    desc: "Prosty, przejrzysty plan, który będzie łatwy do realizacji nawet w gorsze dni.",
  },
] as const;

// ─── Advanced methods ─────────────────────────────────────────────────────────

export const ADVANCED_METHODS = [
  "Superserie",
  "Serie złożone (Compound Set)",
  "Drop sety",
  "Serie do upadku mięśniowego",
  "Serie wymuszone",
  "Rest-Pause",
] as const;

// ─── Muscle groups ────────────────────────────────────────────────────────────

export const MUSCLE_GROUPS = [
  "klatka piersiowa",
  "plecy",
  "barki",
  "biceps",
  "triceps",
  "brzuch",
  "uda",
  "pośladki",
  "łydki",
] as const;

// ─── Helper texts ─────────────────────────────────────────────────────────────

export const TRAINING_FREQUENCY_RECOMMENDATIONS: Record<string, string> = {
  "Brak aktywności fizycznej":
    "Najczęściej zaleca się rozpoczęcie od 1–3 treningów tygodniowo, aby organizm mógł stopniowo przyzwyczaić się do regularnej aktywności.",
  Początkujący:
    "Najczęściej sprawdza się 2–3 treningi tygodniowo, co pozwala rozwijać technikę oraz zapewnia odpowiednią regenerację.",
  Średniozaawansowany:
    "Najczęściej wybierane jest 3–5 treningów tygodniowo. Ostateczna liczba zależy od celu treningowego oraz możliwości regeneracji.",
  Zaawansowany:
    "Najczęściej sprawdza się 4–6 treningów tygodniowo. Liczbę treningów należy dopasować do objętości, celu oraz regeneracji.",
};

export const BMI_RECOMMENDATION_TEXT =
  "BMI jest powyżej 25. To wartość orientacyjna — nie rozróżnia tkanki tłuszczowej od mięśniowej, więc traktuj ją razem z resztą wywiadu.";

export const CARDIO_RECOMMENDATION_TEXT =
  "💡 Przy tym celu treningi cardio często wspierają osiąganie lepszych efektów. Ostateczna ilość zostanie indywidualnie dopasowana do możliwości, preferencji oraz planu treningowego.";

export const CARDIO_AVOID_REASSURANCE_TEXT =
  "👍 To nie problem. W miarę możliwości plan zostanie przygotowany tak, aby ograniczyć ilość cardio lub zastąpić je innymi formami aktywności, jeśli będzie to zgodne z celem treningowym.";

export const CARDIO_FREQUENCY_HELPER_TEXT =
  "💡 Ta informacja pomoże lepiej dopasować plan treningowy do celu oraz preferencji. Cardio nie jest obowiązkowym elementem każdego planu.";

// ─── Conditional logic predicates (source of truth for both forms) ────────────

export function goalIsSport(trainingGoal: string | undefined): boolean {
  return trainingGoal === "Cel sportowy";
}

export function isBeginnerLevel(experienceLevel: string | undefined): boolean {
  return (
    experienceLevel === "Brak aktywności fizycznej" ||
    experienceLevel === "Początkujący"
  );
}

export function isIntermediateOrAdvancedLevel(
  experienceLevel: string | undefined
): boolean {
  return (
    experienceLevel === "Średniozaawansowany" ||
    experienceLevel === "Zaawansowany"
  );
}

export function showTrainingDurationField(
  experienceLevel: string | undefined
): boolean {
  return (
    experienceLevel === "Początkujący" ||
    experienceLevel === "Średniozaawansowany" ||
    experienceLevel === "Zaawansowany"
  );
}

export function showEquipmentField(trainingLocation: string | undefined): boolean {
  return trainingLocation === "Dom" || trainingLocation === "Siłownia plenerowa";
}

export function showCardioRecommendation(trainingGoal: string | undefined): boolean {
  return (
    trainingGoal === "Redukcja tkanki tłuszczowej" ||
    trainingGoal === "Poprawa kondycji" ||
    trainingGoal === "Cel sportowy"
  );
}

export function isCardioRelevant(
  trainingGoal: string | undefined,
  activityLevel: string | undefined
): boolean {
  return showCardioRecommendation(trainingGoal) || activityLevel === "Siedzący";
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

export function buildEquipmentString(items: string[], other: string): string {
  const parts = [...items];
  if (other.trim()) parts.push(other.trim());
  return parts.join(", ");
}

export function parseEquipment(raw: string | undefined | null): {
  items: string[];
  other: string;
} {
  if (!raw) return { items: [], other: "" };
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const knownSet = new Set<string>(EQUIPMENT_OPTIONS);
  const items = parts.filter((p) => knownSet.has(p));
  const other = parts
    .filter((p) => !knownSet.has(p))
    .join(", ");
  return { items, other };
}

export function calculateBmi(
  heightCm: number | undefined,
  weightKg: number | undefined
): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const heightM = heightCm / 100;
  if (heightM <= 0) return undefined;
  return weightKg / (heightM * heightM);
}

/**
 * Parse YYYY-MM-DD as local calendar date (avoids UTC-midnight shift bug
 * that `new Date(str)` causes on date-only strings).
 */
export function calculateAge(dateOfBirth: string | undefined): number | undefined {
  if (!dateOfBirth) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return undefined;
  const dobYear = Number(match[1]);
  const dobMonth = Number(match[2]) - 1;
  const dobDay = Number(match[3]);
  const dob = new Date(dobYear, dobMonth, dobDay);
  if (
    isNaN(dob.getTime()) ||
    dob.getFullYear() !== dobYear ||
    dob.getMonth() !== dobMonth ||
    dob.getDate() !== dobDay
  ) {
    return undefined;
  }
  const today = new Date();
  let age = today.getFullYear() - dobYear;
  const monthDiff = today.getMonth() - dobMonth;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDay)) {
    age--;
  }
  return age;
}

export function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
