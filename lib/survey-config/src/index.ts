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

export * from "./effectiveLevel";

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
  "Kółka gimnastyczne",
  "Uchwyty do pompek",
  "Roller",
  "Brak sprzętu",
] as const;

// ─── Cardio ───────────────────────────────────────────────────────────────────

/**
 * Two answers only. Older interviews may hold "Chętnie uwzględnię cardio w planie",
 * "Cardio może być dodatkiem do planu" (both mean "include") or
 * "Wolę ograniczyć cardio do niezbędnego minimum" — see normalizeCardioPreference().
 */
export const CARDIO_PREFERENCE_OPTIONS = [
  "Tak, uwzględnij cardio w planie",
  "Tylko niezbędne minimum",
] as const;

export type CardioPreferenceKind = "include" | "minimum";

/** Maps any stored answer (current or earlier wording) to what the generator needs. */
export function normalizeCardioPreference(raw: string | null | undefined): CardioPreferenceKind | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t.includes("niezbędn") || t.includes("ograniczyć")) return "minimum";
  if (t.includes("uwzględn") || t.includes("dodatk")) return "include";
  return null;
}

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

// ─── Jump experience (only with the goal "Cel sportowy") ──────────────────────

export const JUMP_EXPERIENCE_QUESTION = "Czy masz doświadczenie ze skokami (np. skakanie na skrzynię, przeskoki)?";
export const JUMP_EXPERIENCE_OPTIONS = [
  "Nie — dopiero zaczynam",
  "Trochę — robiłem/am okazjonalnie",
  "Tak — robię regularnie",
] as const;
export type JumpExperienceCode = "nie" | "troche" | "tak";

/** The question is asked only with the goal "Cel sportowy". */
export function showJumpExperience(trainingGoal: string | undefined | null): boolean {
  return trainingGoal === "Cel sportowy";
}

/** Stored answer (one of JUMP_EXPERIENCE_OPTIONS) → code; anything else (including no answer) → null. */
export function jumpExperienceCode(value: string | undefined | null): JumpExperienceCode | null {
  const i = JUMP_EXPERIENCE_OPTIONS.findIndex((o) => o === value);
  return i === 0 ? "nie" : i === 1 ? "troche" : i === 2 ? "tak" : null;
}

// ─── Weekly volume: hard limit vs recommended range (owner's decision 26.10.2026) ──

export const VOLUME_IN_RANGE_TEXT = "Objętość: w zalecanym zakresie ✓";
export const VOLUME_ABOVE_RANGE_TEXT = "Objętość: powyżej zalecanego zakresu — sprawdź";

/**
 * "Brak aktywności fizycznej" and "Początkujący" keep the HARD upper limit of weekly sets per muscle group (activation is blocked above it);
 * for intermediate and advanced the same limit is only a recommended range (a warning). An unknown level is treated as hard (safe side).
 */
export function hasHardVolumeLimit(experienceLevel: string | null | undefined): boolean {
  return !experienceLevel || experienceLevel === "Brak aktywności fizycznej" || experienceLevel === "Początkujący";
}

// ─── Length of the training cycle (main exercises stay the same during it) ───

export interface BlockDurationRange { min: number; max: number; default: number }

/**
 * Recommended cycle length in weeks (owner's decision 26.10.2026): BA and P 8–12 (default 8), Ś 6–8 (default 6), Z 4–6 (default 4).
 * The trainer may choose any length from 4 to 12; outside this range only a notice is shown. Unknown level: 6 (4–12).
 */
export function blockDurationRange(experienceLevel: string | null | undefined): BlockDurationRange {
  switch (experienceLevel) {
    case "Brak aktywności fizycznej":
    case "Początkujący": return { min: 8, max: 12, default: 8 };
    case "Średniozaawansowany": return { min: 6, max: 8, default: 6 };
    case "Zaawansowany": return { min: 4, max: 6, default: 4 };
    default: return { min: 4, max: 12, default: 6 };
  }
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

/** Goals for which the interview offers the boxing bag and the sledgehammer-and-tyre set (owner's decision 25.10.2026). */
export const SPORT_EQUIPMENT_GOALS: readonly string[] = ["Poprawa sprawności", "Cel sportowy"];
export const BOXING_BAG = "Worek bokserski";
export const HAMMER_AND_TYRE = "Młot i opona";

const wantsSportEquipment = (goal: string | undefined) => !!goal && SPORT_EQUIPMENT_GOALS.includes(goal);

/**
 * The equipment screen is for home and the outdoor gym. A gym has everything, so there it appears only to tick the
 * hammer-and-tyre set, and only for the two sport goals.
 */
export function showEquipmentField(trainingLocation: string | undefined, trainingGoal?: string): boolean {
  if (trainingLocation === "Dom" || trainingLocation === "Siłownia plenerowa") return true;
  return trainingLocation === "Siłownia" && wantsSportEquipment(trainingGoal);
}

/**
 * Options of the equipment screen. The boxing bag only at home (a gym already has one by default) and the hammer-and-tyre set at
 * any place — both only for "Poprawa sprawności" and "Cel sportowy"; with other goals both are hidden.
 * At a gym only the hammer-and-tyre set is offered (the rest of the gym is assumed).
 */
export function equipmentOptionsFor(trainingGoal: string | undefined, trainingLocation: string | undefined): string[] {
  const base: string[] = [...EQUIPMENT_OPTIONS];
  if (!wantsSportEquipment(trainingGoal)) return base;
  if (trainingLocation === "Siłownia") return [HAMMER_AND_TYRE];
  const withoutNone = base.filter((o) => o !== "Brak sprzętu");
  const extra = trainingLocation === "Dom" ? [BOXING_BAG, HAMMER_AND_TYRE] : [HAMMER_AND_TYRE];
  return [...withoutNone, ...extra, "Brak sprzętu"];
}

// ─── Hints under the equipment list (short, for someone who is just starting) ─

export const NO_EQUIPMENT_HOME_HINT =
  "Bez sprzętu część ćwiczeń nie będzie możliwa, a efekty będą wolniejsze. Do pełnego treningu wystarczy guma oporowa, a para hantli przyspieszy postępy.";
export const BANDS_ONLY_HOME_HINT =
  "Guma wystarczy na start. Para hantli pozwoli bezpiecznie zwiększać obciążenie, gdy ćwiczenia staną się łatwe.";

/**
 * Neutral information under the equipment list (never blocks going on):
 *  - home and "Brak sprzętu" → NO_EQUIPMENT_HOME_HINT;
 *  - home, only a resistance band ticked, and the effective level is "Brak aktywności" or "Początkujący" → BANDS_ONLY_HOME_HINT.
 *    When the level is not known on this screen yet, everyone with only a band sees it.
 */
export function equipmentHint(opts: {
  trainingLocation: string | undefined;
  items: readonly string[];
  other?: string;
  effectiveLevel?: string | null;
}): string | null {
  if (opts.trainingLocation !== "Dom") return null;
  const hasOther = !!(opts.other ?? "").trim();
  if (opts.items.includes("Brak sprzętu") && opts.items.length === 1 && !hasOther) return NO_EQUIPMENT_HOME_HINT;
  const onlyBands = opts.items.length === 1 && opts.items[0] === "Gumy oporowe" && !hasOther;
  if (onlyBands && (!opts.effectiveLevel || isBeginnerLevel(opts.effectiveLevel))) return BANDS_ONLY_HOME_HINT;
  return null;
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
  const knownSet = new Set<string>([...EQUIPMENT_OPTIONS, BOXING_BAG, HAMMER_AND_TYRE]);
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
export function calculateAge(dateOfBirth: string | undefined, today: Date = new Date()): number | undefined {
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

// ─── Body data limits (one source for the wizard and the API) ────────────────

export const SURVEY_LIMITS = {
  ageMin: 16,
  ageMax: 90,
  heightMin: 120,
  heightMax: 230,
  weightMin: 35,
  weightMax: 250,
} as const;

export const BIRTH_REQUIRED_MESSAGE = "Data urodzenia jest wymagana";
export const BIRTH_INVALID_MESSAGE = "Podaj poprawną datę urodzenia w formacie DD.MM.RRRR.";
export const AGE_RANGE_MESSAGE = `Wiek musi mieścić się między ${SURVEY_LIMITS.ageMin} a ${SURVEY_LIMITS.ageMax} lat. Sprawdź datę urodzenia.`;
export const HEIGHT_RANGE_MESSAGE = `Wzrost musi być między ${SURVEY_LIMITS.heightMin} a ${SURVEY_LIMITS.heightMax} cm.`;
export const WEIGHT_RANGE_MESSAGE = `Waga musi być między ${SURVEY_LIMITS.weightMin} a ${SURVEY_LIMITS.weightMax} kg.`;

/** null = valid. `today` is injectable for tests. */
export function birthDateError(dateOfBirth: string | undefined | null, today: Date = new Date()): string | null {
  if (!dateOfBirth) return BIRTH_REQUIRED_MESSAGE;
  const age = calculateAge(dateOfBirth, today);
  if (age === undefined) return BIRTH_INVALID_MESSAGE;
  if (age < SURVEY_LIMITS.ageMin || age > SURVEY_LIMITS.ageMax) return AGE_RANGE_MESSAGE;
  return null;
}

export function heightError(heightCm: number | undefined | null): string | null {
  return typeof heightCm === "number" && Number.isFinite(heightCm) && heightCm >= SURVEY_LIMITS.heightMin && heightCm <= SURVEY_LIMITS.heightMax
    ? null
    : HEIGHT_RANGE_MESSAGE;
}

export function weightError(weightKg: number | undefined | null): string | null {
  return typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg >= SURVEY_LIMITS.weightMin && weightKg <= SURVEY_LIMITS.weightMax
    ? null
    : WEIGHT_RANGE_MESSAGE;
}

/** The calendar opens about this many years back and starts empty. */
export const DEFAULT_CALENDAR_YEARS_BACK = 30;

/** YYYY-MM-DD bounds of the date picker: oldest and youngest allowed birth date. */
export function birthDateBounds(today: Date = new Date()): { min: string; max: string; opensAt: string } {
  const on = (years: number) => getLocalDateString(new Date(today.getFullYear() - years, today.getMonth(), today.getDate()));
  return { min: on(SURVEY_LIMITS.ageMax + 1), max: on(SURVEY_LIMITS.ageMin), opensAt: on(DEFAULT_CALENDAR_YEARS_BACK) };
}

// ─── Equipment: "Brak sprzętu" excludes everything else ──────────────────────

export const NO_EQUIPMENT = "Brak sprzętu";

/** Toggling "Brak sprzętu" clears the rest; ticking anything else clears "Brak sprzętu". */
export function toggleEquipment(current: readonly string[], value: string): string[] {
  if (value === NO_EQUIPMENT) return current.includes(NO_EQUIPMENT) ? [] : [NO_EQUIPMENT];
  const without = current.filter((x) => x !== NO_EQUIPMENT);
  return without.includes(value) ? without.filter((x) => x !== value) : [...without, value];
}

export const EQUIPMENT_CONFLICT_MESSAGE = "„Brak sprzętu” nie może być zaznaczony razem z innym sprzętem.";

/** Server side: "Brak sprzętu" together with other items is a contradiction. */
export function equipmentConflict(items: readonly string[], other?: string | null): boolean {
  return items.includes(NO_EQUIPMENT) && (items.length > 1 || !!(other ?? "").trim());
}

// ─── Priority muscle groups by effective level ───────────────────────────────

export const PRIORITY_BEGINNER_TEXT = "Wybierz jedną partię, na której chcesz się skupić. Plan i tak rozwinie całe ciało.";
export const PRIORITY_BEGINNER_MESSAGE = "Przy tym poziomie możesz wskazać najwyżej jedną partię priorytetową.";

/** How many priority muscle groups the client may name at this (effective) level. */
export function maxPriorityMuscles(effectiveLevel: string | null | undefined): number {
  return isBeginnerLevel(effectiveLevel ?? undefined) ? 1 : 3;
}

// ─── Goal descriptions (shown behind an arrow next to each goal) ─────────────

export const TRAINING_GOAL_DESCRIPTIONS: Record<string, string> = {
  "Budowa sylwetki": "Więcej mięśni i lepsze proporcje ciała.",
  "Zwiększenie siły": "Podnosić więcej w głównych ćwiczeniach.",
  "Redukcja tkanki tłuszczowej": "Mniej tkanki tłuszczowej przy zachowaniu mięśni. Duże znaczenie ma też dieta.",
  "Poprawa kondycji": "Łatwiej znosić wysiłek i szybciej się regenerować.",
  "Poprawa sprawności": "Swobodniejszy ruch na co dzień — mobilność, stabilizacja, równowaga.",
  "Cel sportowy": "Przygotowanie do konkretnej dyscypliny lub startu.",
};

// ─── Recommended session length by EFFECTIVE level ───────────────────────────

export const SESSION_DURATION_RECOMMENDATIONS: Record<string, { option: string; why: string }> = {
  "Brak aktywności fizycznej": { option: "30–45 min", why: "Krótko na start, żeby zbudować nawyk i nie przeciążyć organizmu." },
  "Początkujący": { option: "45–60 min", why: "Wystarczy na rozgrzewkę i kilka ćwiczeń z dobrą techniką." },
  "Średniozaawansowany": { option: "60–90 min", why: "Więcej serii i dłuższe przerwy przy ćwiczeniach głównych." },
  "Zaawansowany": { option: "60–90 min", why: "Duża objętość i przerwy 3–5 min przy ciężkich seriach." },
};
export const SESSION_RECOMMENDED_BADGE = "Polecane dla Ciebie";

// ─── Earlier wording of the "methods" question ───────────────────────────────

/**
 * Until this moment the interview asked "Czy chcesz, aby w planie były metody intensyfikacji?" (Tak/Nie) and
 * stored the methods the client WANTED in `advancedMethodsToAvoid` (the meaning was reversed). Since the
 * "Metody do unikania" screen the list really holds methods to avoid. Answers older than this are treated
 * as "no data" (docs/WYWIAD-INWENTARZ.md).
 */
export const METHODS_QUESTION_FIXED_AT = "2026-10-23T20:55:00Z";

export function methodsAnswerUsable(surveyCreatedAt: string | Date | null | undefined): boolean {
  if (!surveyCreatedAt) return false;
  return new Date(surveyCreatedAt).getTime() >= Date.parse(METHODS_QUESTION_FIXED_AT);
}
