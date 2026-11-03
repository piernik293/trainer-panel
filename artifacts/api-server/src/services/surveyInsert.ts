/**
 * Wiersz ankiety (tabela surveys) z odpowiedzi wywiadu — wspólny dla wywiadu z zaproszenia trenera (routes/public.ts)
 * i wywiadu Solo (routes/solo.ts), żeby oba zapisywały dokładnie te same pola w ten sam sposób.
 */
import {
  EQUIPMENT_CONFLICT_MESSAGE, HEALTH_CONSENT_VERSION, PRIORITY_BEGINNER_MESSAGE, birthDateError, equipmentConflict, goalIsSport, heightError, isBeginnerLevel, parseEquipment,
  resolveEffectiveLevel, weightError,
} from "@workspace/survey-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function surveyInsertValues(clientId: number, d: any, ctx: { age: number | null; dobIso: string }) {
  return {
    clientId,
    trainingGoal: d.trainingGoal,
    trainingGoalOther: d.trainingGoalOther,
    experienceLevel: d.experienceLevel,
    trainingDuration: d.trainingDuration,
    healthLimitations: d.healthLimitations,
    injuryStatus: d.injuryStatus ?? null,
    healthConsentStatus: d.healthConsent === true ? "given" : d.healthConsent === false ? "declined" : null,
    healthConsentAt: d.healthConsent === undefined ? null : new Date(),
    healthConsentVersion: d.healthConsent === undefined ? null : HEALTH_CONSENT_VERSION,
    athleteStatus: d.athleteStatus ?? null,
    sportDiscipline: d.sportDiscipline ?? null,
    sportPerformanceNeeds: d.sportPerformanceNeeds ?? [],
    weeklyFrequency: d.weeklyFrequency,
    desiredWeeklyFrequency: d.desiredWeeklyFrequency,
    sessionDuration: d.sessionDuration,
    preferredMuscles: d.preferredMuscles,
    avoidedMuscles: d.avoidedMuscles,
    avoidedExercises: d.avoidedExercises,
    favoriteExercises: d.favoriteExercises,
    advancedMethodsToAvoid: d.advancedMethodsToAvoid ?? [],
    preferredMethods: d.preferredMethods ?? [],
    additionalInfo: d.additionalInfo,
    age: ctx.age,
    dateOfBirth: ctx.dobIso,
    gender: d.gender,
    heightCm: d.heightCm,
    weightKg: d.weightKg,
    activityLevel: d.activityLevel,
    sleepHours: d.sleepHours,
    stressLevel: d.stressLevel,
    planStylePreference: d.planStylePreference,
    priorityMuscle1: d.priorityMuscle1,
    priorityMuscle2: d.priorityMuscle2,
    priorityMuscle3: d.priorityMuscle3,
    trainingLocation: d.trainingLocation,
    equipment: d.equipment,
    cardioPreference: d.cardioPreference,
    cardioFrequency: d.cardioFrequency,
    preferredCardioType: d.preferredCardioType,
    jumpExperience: goalIsSport(d.trainingGoal) ? d.jumpExperience ?? null : null,
    trainingMotivation: d.trainingMotivation,
    sportsPriorities: d.sportsPriorities ?? [],
    avoidsAdvancedMethods: d.avoidsAdvancedMethods,
    avoidedExerciseIds: d.avoidedExerciseIds ?? [],
    avoidedExerciseReasons: d.avoidedExerciseReasons ?? {},
    avoidedExerciseOtherText: d.avoidedExerciseOtherText ?? null,
    avoidedExerciseOtherReason: d.avoidedExerciseOtherReason ?? null,
  };
}

/**
 * Te same sprawdzenia odpowiedzi wywiadu co w `POST /public/survey/:token` (wiek 16–90, wzrost i waga tylko gdy podane, jedna partia priorytetowa
 * dla początkującego, konflikt sprzętu, opis ograniczeń przy „Tak”). Zwraca komunikat błędu albo null. Zmienia `d` (brak zgody zdrowotnej = bez pytań o zdrowie).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateSurveyAnswers(d: any): { error: string | null; dobIso: string } {
  const none = { dobIso: "" };
  if (d.healthConsent === false) { d.injuryStatus = undefined; d.healthLimitations = ""; }
  if (d.healthConsent !== false && !d.injuryStatus) return { ...none, error: "Odpowiedz na pytanie o kontuzje i ograniczenia ruchowe." };
  if (d.injuryStatus === "Tak" && !d.healthLimitations?.trim()) return { ...none, error: "Opisz swoje ograniczenia zdrowotne, kontuzje lub dolegliwości bólowe." };
  if (d.trainingGoal === "Inny" && !d.trainingGoalOther?.trim()) return { ...none, error: "Opis celu treningowego jest wymagany, gdy wybrano \"Inny\"" };
  const dob = new Date(d.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return { ...none, error: "Podaj datę urodzenia." };
  if (dob.getTime() > Date.now()) return { ...none, error: "Data urodzenia nie może być w przyszłości" };
  const dobIso = dob.toISOString().slice(0, 10);
  const body = birthDateError(dobIso) ?? (d.heightCm != null ? heightError(d.heightCm) : null) ?? (d.weightKg != null ? weightError(d.weightKg) : null);
  if (body) return { dobIso, error: body };
  const priorities = [d.priorityMuscle1, d.priorityMuscle2, d.priorityMuscle3].filter((m: string | undefined) => !!m && m.trim());
  if (isBeginnerLevel(resolveEffectiveLevel(d.experienceLevel, d.trainingDuration).effective ?? undefined) && priorities.length > 1) return { dobIso, error: PRIORITY_BEGINNER_MESSAGE };
  if (equipmentConflict(parseEquipment(d.equipment).items, parseEquipment(d.equipment).other)) return { dobIso, error: EQUIPMENT_CONFLICT_MESSAGE };
  return { dobIso, error: null };
}
