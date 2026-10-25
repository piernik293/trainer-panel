/**
 * Wywiad 2.0 — pure logic of the step-by-step interview (no React).
 *
 * The questions, option lists, validation and conditional rules are the ones of
 * the former single-page form (lib/survey-config is still the source of truth);
 * only the way they are presented changed. docs/WYWIAD-INWENTARZ.md lists every
 * question and where it lands.
 *
 * Differences from the old payload (approved 23.10.2026):
 *   • answers of questions that are hidden by the current answers are cleared,
 *     not sent (equipment at "Siłownia", training time at "Brak aktywności",
 *     avoided exercises / methods below intermediate, health description at "Nie",
 *     sport answers without sport goal);
 *   • "Czy jest coś jeszcze?" + text are one optional text field (`additionalInfo`);
 *   • stress has no default — unanswered means the field is not sent (stored as null);
 *   • `hasAdditionalInfo` is no longer sent (the API never stored it).
 */

import {
  EQUIPMENT_OPTIONS,
  BOXING_BAG,
  HAMMER_AND_TYRE,
  equipmentOptionsFor,
  NO_EQUIPMENT,
  birthDateError,
  buildEquipmentString,
  calculateAge,
  heightError,
  weightError,
  maxPriorityMuscles,
  normalizeCardioPreference,
  resolveEffectiveLevel,
  CARDIO_PREFERENCE_OPTIONS,
  PRIORITY_BEGINNER_MESSAGE,
  calculateBmi,
  goalIsSport,
  isBeginnerLevel,
  isIntermediateOrAdvancedLevel,
  showEquipmentField,
  showTrainingDurationField,
} from "@workspace/survey-config";

export interface PickedExercise {
  id: number;
  name: string;
  reason: string;
}
export interface FavoriteExercise {
  id: number;
  name: string;
}

export interface Answers {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO YYYY-MM-DD ("" until a full valid date is typed). */
  dateOfBirth: string;
  gender: string;
  heightCm?: number;
  /** Dot-normalised text while typing ("75.5"). */
  weightKg: string;
  trainingGoal: string;
  athleteStatus: string;
  sportPerformanceNeeds: string[];
  trainingMotivation: string;
  experienceLevel: string;
  trainingDuration: string;
  trainingLocation: string;
  equipmentItems: string[];
  equipmentOther: string;
  desiredWeeklyFrequency?: number;
  sessionDuration: string;
  injuryStatus: "" | "Tak" | "Nie";
  healthLimitations: string;
  activityLevel: string;
  sleepHours: string;
  stressLevel?: number;
  cardioPreference: string;
  cardioFrequency: string;
  preferredCardioType: string;
  planStylePreference: string;
  avoidedExercises: PickedExercise[];
  avoidedOtherText: string;
  avoidedOtherReason: string;
  favoriteExercises: FavoriteExercise[];
  priorityMuscle1: string;
  priorityMuscle2: string;
  priorityMuscle3: string;
  avoidsAdvancedMethods: "" | "Tak" | "Nie";
  advancedMethodsToAvoid: string[];
  additionalInfo: string;
}

export const EMPTY_ANSWERS: Answers = {
  firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "",
  heightCm: undefined, weightKg: "",
  trainingGoal: "", athleteStatus: "", sportPerformanceNeeds: [], trainingMotivation: "",
  experienceLevel: "", trainingDuration: "",
  trainingLocation: "", equipmentItems: [], equipmentOther: "",
  desiredWeeklyFrequency: undefined, sessionDuration: "",
  injuryStatus: "", healthLimitations: "",
  activityLevel: "", sleepHours: "", stressLevel: undefined,
  cardioPreference: "", cardioFrequency: "", preferredCardioType: "",
  planStylePreference: "",
  avoidedExercises: [], avoidedOtherText: "", avoidedOtherReason: "",
  favoriteExercises: [],
  priorityMuscle1: "", priorityMuscle2: "", priorityMuscle3: "",
  avoidsAdvancedMethods: "", advancedMethodsToAvoid: [],
  additionalInfo: "",
};

// ─── Steps ────────────────────────────────────────────────────────────────────

export type StepId =
  | "name" | "contact" | "birth" | "body"
  | "goal" | "sportStatus" | "sportNeeds" | "motivation"
  | "level" | "duration"
  | "location" | "equipment"
  | "frequency" | "session"
  | "injury" | "healthDesc"
  | "activity" | "sleep" | "stress"
  | "cardioPref" | "cardioFreq" | "cardioType"
  | "planStyle" | "avoided" | "favorite" | "priority" | "methodsList" | "additional";

export interface Stage {
  id: string;
  name: string;
  steps: StepId[];
}

/** Order matters: a dependent question always comes after the one it depends on. */
export const STAGES: Stage[] = [
  { id: "about", name: "O Tobie", steps: ["name", "contact", "birth", "body"] },
  { id: "goal", name: "Cel", steps: ["goal", "sportStatus", "sportNeeds", "motivation"] },
  { id: "experience", name: "Doświadczenie", steps: ["level", "duration"] },
  { id: "place", name: "Miejsce i sprzęt", steps: ["location", "equipment"] },
  { id: "time", name: "Czas i częstotliwość", steps: ["frequency", "session"] },
  { id: "health", name: "Zdrowie i ograniczenia", steps: ["injury", "healthDesc"] },
  { id: "life", name: "Styl życia", steps: ["activity", "sleep", "stress"] },
  { id: "cardio", name: "Cardio", steps: ["cardioFreq", "cardioPref", "cardioType"] },
  { id: "prefs", name: "Preferencje planu", steps: ["planStyle", "avoided", "favorite", "priority", "methodsList", "additional"] },
];

export interface Prefill {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  /** Existing client: personal data comes from the client record and the screens are skipped. */
  existingClient?: boolean;
}

/** Whether a screen is shown for the current answers (the old form's conditions, verbatim). */
export function isStepVisible(id: StepId, a: Answers, prefill: Prefill = {}): boolean {
  switch (id) {
    case "name":
    case "contact":
      return !prefill.existingClient;
    case "sportStatus":
    case "sportNeeds":
      return goalIsSport(a.trainingGoal);
    case "duration":
      return showTrainingDurationField(a.experienceLevel);
    // The cardio form is asked only when the client wants cardio in the plan ("Tak"); "minimum" skips it.
    case "cardioType":
      return normalizeCardioPreference(a.cardioPreference) === "include";
    case "equipment":
      return showEquipmentField(a.trainingLocation, a.trainingGoal);
    case "healthDesc":
      return a.injuryStatus === "Tak";
    // Intermediate / advanced by the EFFECTIVE level (the choice capped by training time).
    case "avoided":
    case "methodsList":
      return isIntermediateOrAdvancedLevel(resolveEffectiveLevel(a.experienceLevel, a.trainingDuration).effective ?? undefined);
    default:
      return true;
  }
}

export function visibleSteps(a: Answers, prefill: Prefill = {}): StepId[] {
  return STAGES.flatMap((s) => s.steps).filter((id) => isStepVisible(id, a, prefill));
}

export function visibleStages(a: Answers, prefill: Prefill = {}): Array<Stage & { visible: StepId[] }> {
  return STAGES.map((s) => ({ ...s, visible: s.steps.filter((id) => isStepVisible(id, a, prefill)) })).filter(
    (s) => s.visible.length > 0,
  );
}

/**
 * Clears answers of questions that are not shown any more (and resets the
 * "Brak aktywności" level when the sport goal is chosen — the old form did the same).
 */
export function normalizeAnswers(input: Answers, prefill: Prefill = {}): Answers {
  const a: Answers = { ...input };
  if (goalIsSport(a.trainingGoal) && a.experienceLevel === "Brak aktywności fizycznej") a.experienceLevel = "";
  if (!isStepVisible("sportStatus", a, prefill)) {
    a.athleteStatus = "";
    a.sportPerformanceNeeds = [];
  }
  // "Brak sprzętu" excludes the rest (the UI keeps it that way; a draft from an older version is repaired here).
  if (a.equipmentItems.includes(NO_EQUIPMENT) && a.equipmentItems.length > 1) a.equipmentItems = [NO_EQUIPMENT];
  if (a.equipmentItems.includes(NO_EQUIPMENT)) a.equipmentOther = "";
  if (!isStepVisible("duration", a, prefill)) a.trainingDuration = "";
  if (!isStepVisible("cardioType", a, prefill)) a.preferredCardioType = "";
  if (!isStepVisible("equipment", a, prefill)) {
    a.equipmentItems = [];
    a.equipmentOther = "";
  } else {
    // Only what the screen offers for this goal and place (the boxing bag / hammer set disappear when the goal or place changes).
    const offered = equipmentOptionsFor(a.trainingGoal, a.trainingLocation);
    a.equipmentItems = a.equipmentItems.filter((x) => offered.includes(x));
    if (a.trainingLocation === "Siłownia") a.equipmentOther = "";
  }
  if (!isStepVisible("healthDesc", a, prefill)) a.healthLimitations = "";
  if (!isStepVisible("avoided", a, prefill)) {
    a.avoidedExercises = [];
    a.avoidedOtherText = "";
    a.avoidedOtherReason = "";
  }
  // Priority muscle groups: one for beginners (EFFECTIVE level — chosen level capped by training time).
  const effective = resolveEffectiveLevel(a.experienceLevel, a.trainingDuration).effective;
  if (maxPriorityMuscles(effective) === 1) {
    a.priorityMuscle2 = "";
    a.priorityMuscle3 = "";
  }
  // The removed answer "Cardio może być dodatkiem do planu" (and earlier wordings) map to the two current ones.
  const cardio = normalizeCardioPreference(a.cardioPreference);
  if (cardio === "include") a.cardioPreference = CARDIO_PREFERENCE_OPTIONS[0];
  else if (cardio === "minimum") a.cardioPreference = CARDIO_PREFERENCE_OPTIONS[1];
  a.avoidsAdvancedMethods = ""; // legacy draft field — derived from the methods list in the payload
  if (!isStepVisible("methodsList", a, prefill)) a.advancedMethodsToAvoid = [];
  return a;
}

// ─── Validation (messages and limits as in the old zod schema) ───────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MSG =
  "E-mail jest wymagany, aby trener mógł skontaktować się z Tobą oraz przesłać plan treningowy.";

export function parseWeight(raw: string): number | undefined {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Error message for a screen, or null when the answer is acceptable. */
export function validateStep(id: StepId, a: Answers): string | null {
  switch (id) {
    case "name":
      if (!a.firstName.trim()) return "Imię jest wymagane";
      if (!a.lastName.trim()) return "Nazwisko jest wymagane";
      return null;
    case "contact":
      return EMAIL_RE.test(a.email.trim()) ? null : EMAIL_MSG;
    case "birth": {
      const dobErr = birthDateError(a.dateOfBirth);
      if (dobErr) return dobErr;
      if (!a.gender) return "Płeć jest wymagana";
      return null;
    }
    case "body": {
      const hErr = heightError(a.heightCm);
      if (hErr) return hErr;
      return weightError(parseWeight(a.weightKg));
    }
    case "priority": {
      const n = [a.priorityMuscle1, a.priorityMuscle2, a.priorityMuscle3].filter((m) => m.trim()).length;
      return n > maxPriorityMuscles(resolveEffectiveLevel(a.experienceLevel, a.trainingDuration).effective) ? PRIORITY_BEGINNER_MESSAGE : null;
    }
    case "goal":
      return a.trainingGoal ? null : "To pole jest wymagane";
    case "sportStatus":
      return a.athleteStatus ? null : "Wybierz poziom sportowy.";
    case "level":
      return a.experienceLevel ? null : "Poziom doświadczenia jest wymagany";
    case "location":
      return a.trainingLocation ? null : "To pole jest wymagane";
    case "equipment":
      // At a gym the screen only offers the optional hammer-and-tyre set.
      if (a.trainingLocation === "Siłownia" && showEquipmentField(a.trainingLocation, a.trainingGoal)) return null;
      return buildEquipmentString(a.equipmentItems, a.equipmentOther).trim() ? null : "To pole jest wymagane.";
    case "frequency":
      return a.desiredWeeklyFrequency && a.desiredWeeklyFrequency >= 1 && a.desiredWeeklyFrequency <= 7
        ? null
        : "Podaj liczbę treningów od 1 do 7";
    case "session":
      return a.sessionDuration ? null : "To pole jest wymagane";
    case "injury":
      return a.injuryStatus ? null : "Odpowiedz na to pytanie — jest ważne dla Twojego bezpieczeństwa.";
    case "healthDesc":
      return a.healthLimitations.trim() ? null : "Opisz swoje ograniczenia zdrowotne, kontuzje lub dolegliwości bólowe.";
    case "activity":
      return a.activityLevel ? null : "Poziom aktywności jest wymagany";
    case "sleep":
      return a.sleepHours ? null : "To pole jest wymagane";
    case "planStyle":
      return a.planStylePreference ? null : "Wybierz styl planu";
    default:
      return null; // optional screens
  }
}

// ─── Payload ──────────────────────────────────────────────────────────────────

const SPORT_NEED_KEY: Record<string, string> = {
  Dynamika: "dynamika",
  Szybkość: "szybkosc",
  Stabilizacja: "stabilizacja",
};
const ATHLETE_TO_API: Record<string, string> = {
  Hobbystycznie: "Tak — amatorsko",
  Zawodowo: "Tak — zawodowo",
};

/**
 * Body of POST /api/public/survey/:token. For the same answers it equals the old
 * form's payload (tested against a frozen copy of the old builder), apart from the
 * documented differences at the top of this file.
 */
/**
 * What the client still has to fill in on a screen — shown next to the disabled "Dalej".
 * null when the screen is complete. Out-of-range values keep their own message.
 */
export function missingHint(id: StepId, a: Answers): string | null {
  const err = validateStep(id, a);
  if (!err) return null;
  const missing = (what: string) => `Uzupełnij: ${what}.`;
  switch (id) {
    case "name": return missing(!a.firstName.trim() ? "imię" : "nazwisko");
    case "contact": return missing("poprawny adres e-mail");
    // Out-of-range values: the message sits under the field, the hint only points to it.
    case "birth": return a.dateOfBirth && birthDateError(a.dateOfBirth) ? "Popraw datę urodzenia." : missing(!a.dateOfBirth ? "datę urodzenia" : "płeć");
    case "body":
      if (a.heightCm === undefined) return missing("wzrost");
      if (heightError(a.heightCm)) return "Popraw wzrost.";
      if (parseWeight(a.weightKg) === undefined) return missing("wagę");
      return "Popraw wagę.";
    case "goal": return missing("cel treningowy");
    case "sportStatus": return missing("jak uprawiasz sport");
    case "level": return missing("poziom doświadczenia");
    case "location": return missing("miejsce treningu");
    case "equipment": return missing("sprzęt (zaznacz coś albo „Brak sprzętu”)");
    case "frequency": return a.desiredWeeklyFrequency === undefined ? missing("liczbę treningów w tygodniu") : err;
    case "session": return missing("czas jednego treningu");
    case "injury": return missing("odpowiedź Tak lub Nie");
    case "healthDesc": return missing("opis ograniczeń");
    case "activity": return missing("codzienną aktywność");
    case "sleep": return missing("liczbę godzin snu");
    default: return err;
  }
}

export function buildSurveyPayload(raw: Answers, prefill: Prefill = {}): Record<string, unknown> {
  const a = normalizeAnswers(raw, prefill);
  const isSport = goalIsSport(a.trainingGoal);
  // "Metody do unikania": the list IS the answer (non-empty → the client avoids methods); not asked → undefined.
  const avoids = isStepVisible("methodsList", a, prefill) ? a.advancedMethodsToAvoid.length > 0 : undefined;
  const reasons = Object.fromEntries(
    a.avoidedExercises.filter((e) => e.reason.trim()).map((e) => [String(e.id), e.reason.trim()]),
  );
  return {
    firstName: (prefill.existingClient ? prefill.firstName : a.firstName) ?? a.firstName,
    lastName: (prefill.existingClient ? prefill.lastName : a.lastName) ?? a.lastName,
    email: ((prefill.existingClient ? prefill.email : a.email) ?? a.email).trim(),
    phone: (prefill.existingClient ? prefill.phone : a.phone) ?? a.phone,
    dateOfBirth: a.dateOfBirth,
    gender: a.gender,
    heightCm: a.heightCm,
    weightKg: parseWeight(a.weightKg),
    trainingGoal: a.trainingGoal,
    experienceLevel: a.experienceLevel,
    trainingDuration: a.trainingDuration,
    healthLimitations: a.injuryStatus === "Nie" ? "" : a.healthLimitations,
    sessionDuration: a.sessionDuration,
    avoidedExercises: "",
    desiredWeeklyFrequency: a.desiredWeeklyFrequency,
    activityLevel: a.activityLevel,
    sleepHours: a.sleepHours,
    ...(a.stressLevel !== undefined ? { stressLevel: a.stressLevel } : {}),
    planStylePreference: a.planStylePreference,
    additionalInfo: a.additionalInfo,
    priorityMuscle1: a.priorityMuscle1,
    priorityMuscle2: a.priorityMuscle2,
    priorityMuscle3: a.priorityMuscle3,
    trainingLocation: a.trainingLocation,
    equipment: buildEquipmentString(a.equipmentItems, a.equipmentOther),
    cardioPreference: a.cardioPreference,
    cardioFrequency: a.cardioFrequency,
    preferredCardioType: a.preferredCardioType,
    trainingMotivation: a.trainingMotivation,
    age: calculateAge(a.dateOfBirth) ?? undefined,
    injuryStatus: a.injuryStatus === "Nie" ? "Brak" : a.injuryStatus || undefined,
    favoriteExercises: a.favoriteExercises.length > 0 ? a.favoriteExercises.map((e) => e.name).join(", ") : undefined,
    athleteStatus: isSport && a.athleteStatus ? (ATHLETE_TO_API[a.athleteStatus] ?? "Nie") : "Nie",
    sportDiscipline: undefined,
    sportPerformanceNeeds: isSport ? a.sportPerformanceNeeds : [],
    sportsPriorities: isSport ? a.sportPerformanceNeeds.map((n) => SPORT_NEED_KEY[n]).filter(Boolean) : [],
    avoidsAdvancedMethods: avoids,
    advancedMethodsToAvoid: avoids === true ? a.advancedMethodsToAvoid : [],
    avoidedExerciseIds: a.avoidedExercises.map((e) => e.id),
    avoidedExerciseReasons: reasons,
    avoidedExerciseOtherText: a.avoidedOtherText.trim() || undefined,
    avoidedExerciseOtherReason: a.avoidedOtherReason.trim() || undefined,
  };
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

export function bmiOf(a: Answers): number | undefined {
  return calculateBmi(a.heightCm, parseWeight(a.weightKg));
}

/** Rough remaining time, ~10 s per screen. */
export function remainingMinutes(stepsLeft: number): number {
  return Math.max(1, Math.round((stepsLeft * 10) / 60));
}

export const KNOWN_EQUIPMENT: readonly string[] = [...EQUIPMENT_OPTIONS, BOXING_BAG, HAMMER_AND_TYRE];
export { isBeginnerLevel };

// ─── Draft (autosave) ─────────────────────────────────────────────────────────

export interface Draft {
  v: 1;
  answers: Answers;
  stepId: StepId | "summary";
}

export function draftKey(token: string): string {
  return `optimatren-wywiad:${token.slice(0, 16)}`;
}

export function loadDraft(token: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(token));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (d?.v !== 1 || typeof d.answers !== "object" || !d.answers) return null;
    return { v: 1, answers: { ...EMPTY_ANSWERS, ...d.answers }, stepId: d.stepId };
  } catch {
    return null;
  }
}

export function saveDraft(token: string, draft: Draft): void {
  try {
    window.localStorage.setItem(draftKey(token), JSON.stringify(draft));
  } catch {
    // storage unavailable (private mode, quota) — the interview still works
  }
}

export function clearDraft(token: string): void {
  try {
    window.localStorage.removeItem(draftKey(token));
  } catch {
    // ignore
  }
}
