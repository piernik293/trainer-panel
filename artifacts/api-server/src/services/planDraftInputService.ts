/**
 * Plan Draft Input Service
 *
 * Loads and normalizes all data required by the Workout Plan Draft Generator.
 * Returns normalized input values, their sources (interview / trainer / missing),
 * and structured warnings for missing or invalid data.
 *
 * This service NEVER generates exercises, allocates volume, or saves plans.
 */

import { eq, desc } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
import {
  normalizeEquipmentList,
  defaultEquipmentForLocation,
} from "./equipmentNormalizer";
import { recommendSplit } from "./splitRecommendationService";
import {
  VALID_EXPERIENCE_LEVELS,
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
  getCompatibleSplits,
  type PlanDraftGenerationInputType,
  type PlanDraftGenerationPreferencesType,
  type PlanDraftInputSourceMapType,
  type PlanDraftInputWarningType,
  type SplitType,
  type GetClientPlanDraftInputResponseType,
  type SplitRecommendationType,
} from "@workspace/api-zod";

// ─── Experience level validation ──────────────────────────────────────────────

function isValidExperienceLevel(level: string | null | undefined): level is typeof VALID_EXPERIENCE_LEVELS[number] {
  if (!level) return false;
  return (VALID_EXPERIENCE_LEVELS as readonly string[]).includes(level);
}

// ─── Recovery quality composite ───────────────────────────────────────────────

function deriveRecoveryQuality(
  sleepHours: number | null,
  stressLevel: number | null,
  physicalWork: boolean,
): "excellent" | "good" | "standard" | "poor" | null {
  if (sleepHours === null && stressLevel === null) return null;

  const sleep = sleepHours ?? 7;
  const stress = stressLevel ?? 5;

  if (sleep >= 8 && stress <= 3 && !physicalWork) return "excellent";
  if (sleep >= 7 && stress <= 5) return "good";
  if (sleep >= 6 && stress <= 7) return "standard";
  return "poor";
}

// ─── Session duration parsing ─────────────────────────────────────────────────

function parseSessionDuration(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 300) return null;
  return parsed;
}

// ─── Stress level clamping ────────────────────────────────────────────────────

function clampStress(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  return Math.min(10, Math.max(1, raw));
}

// ─── Priority muscle groups extraction ────────────────────────────────────────

function extractPriorityMuscles(
  m1: string | null | undefined,
  m2: string | null | undefined,
  m3: string | null | undefined,
): string[] {
  return [m1, m2, m3].filter((m): m is string => !!m && m.trim().length > 0);
}

// ─── Excluded muscle groups parsing ──────────────────────────────────────────

function parseExcludedMuscles(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(/[,;\n]+/)
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

// ─── Default split for day count ─────────────────────────────────────────────

function defaultSplitForDays(days: number | null): SplitType {
  if (!days) return "custom";
  if (days <= 2) return "full_body_ab";
  if (days === 3) return "full_body";
  if (days === 4) return "upper_lower";
  if (days === 5) return "push_pull_legs";
  return "specialization";
}

// ─── Main service function ────────────────────────────────────────────────────

export interface PlanDraftInputResult {
  client: { id: number; firstName: string; lastName: string; email: string | null };
  surveyId: number | null;
  surveyCreatedAt: string | null;
  input: PlanDraftGenerationInputType;
  sources: PlanDraftInputSourceMapType;
  warnings: PlanDraftInputWarningType[];
  defaultPreferences: PlanDraftGenerationPreferencesType;
  allowedSplitTypes: SplitType[];
  blockDurationRange: { min: number; max: number; default: number };
  splitRecommendation: SplitRecommendationType | null;
}

export async function loadPlanDraftInput(clientId: number): Promise<PlanDraftInputResult | null> {
  // ── Load client ─────────────────────────────────────────────────────────────
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) return null;

  const warnings: PlanDraftInputWarningType[] = [];

  // ── Load latest survey ──────────────────────────────────────────────────────
  const [survey] = await db
    .select()
    .from(surveysTable)
    .where(eq(surveysTable.clientId, clientId))
    .orderBy(desc(surveysTable.createdAt))
    .limit(1);

  if (!survey) {
    warnings.push({
      code: "MISSING_CLIENT_SURVEY",
      severity: "warning",
      message: "Klient nie ma uzupełnionego wywiadu treningowego.",
      blocking: false,
    });
  }

  // ── Sources ─────────────────────────────────────────────────────────────────
  const sources: PlanDraftInputSourceMapType = {
    experienceLevel: survey?.experienceLevel ? "interview" : "missing",
    trainingGoal: survey?.trainingGoal ? "interview" : "missing",
    availableDays: survey?.desiredWeeklyFrequency != null ? "interview" : "missing",
    sessionDurationMinutes: survey?.sessionDuration ? "interview" : "missing",
    trainingLocation: survey?.trainingLocation ? "interview" : "missing",
    availableEquipment: survey?.equipment ? "interview" : "missing",
    dailyActivity: survey?.activityLevel ? "interview" : "missing",
    physicalWork: survey?.activityLevel ? "derived" : "missing",
    sleepHours: survey?.sleepHours ? "interview" : "missing",
    stressLevel: survey?.stressLevel != null ? "interview" : "missing",
    recoveryQuality: "derived",
    healthLimitations: survey?.healthLimitations ? "interview" : "missing",
    priorityMuscleGroups:
      survey?.priorityMuscle1 || survey?.priorityMuscle2 || survey?.priorityMuscle3
        ? "interview"
        : "missing",
    excludedMuscleGroups: survey?.avoidedMuscles ? "interview" : "missing",
    preferredExercises: survey?.favoriteExercises ? "interview" : "missing",
    avoidedExercises:
      survey && (survey.avoidedExerciseIds?.length > 0 || survey.avoidedExercises)
        ? "interview"
        : "missing",
  };

  // ── Experience level ────────────────────────────────────────────────────────
  const rawLevel = survey?.experienceLevel ?? null;
  let experienceLevel: typeof VALID_EXPERIENCE_LEVELS[number] | null = null;

  if (!rawLevel) {
    warnings.push({
      code: "MISSING_EXPERIENCE_LEVEL",
      severity: "error",
      message:
        "Brak poziomu doświadczenia klienta. Uzupełnij wywiad treningowy przed generowaniem szkicu.",
      blocking: true,
    });
  } else if (!isValidExperienceLevel(rawLevel)) {
    warnings.push({
      code: "INVALID_EXPERIENCE_LEVEL",
      severity: "error",
      message: `Poziom doświadczenia "${rawLevel}" jest nieprawidłowy. Dozwolone: Brak aktywności fizycznej, Początkujący, Średniozaawansowany, Zaawansowany.`,
      blocking: true,
    });
  } else {
    experienceLevel = rawLevel;
  }

  // ── Training goal ───────────────────────────────────────────────────────────
  const trainingGoal = survey?.trainingGoal ?? null;
  if (!trainingGoal) {
    warnings.push({
      code: "MISSING_TRAINING_GOAL",
      severity: "notice",
      message: "Brak celu treningowego w wywiadzie. Generator przyjmie domyślne parametry dla hipertrofii.",
      blocking: false,
    });
  }

  // ── Available days ──────────────────────────────────────────────────────────
  const availableDays = survey?.desiredWeeklyFrequency ?? null;
  if (!availableDays) {
    warnings.push({
      code: "MISSING_AVAILABLE_DAYS",
      severity: "warning",
      message: "Brak informacji o dostępnych dniach treningowych. Podaj tę wartość w założeniach planu.",
      blocking: false,
    });
  }

  // ── Session duration ────────────────────────────────────────────────────────
  const sessionDurationMinutes = parseSessionDuration(survey?.sessionDuration);
  if (!sessionDurationMinutes) {
    warnings.push({
      code: "MISSING_SESSION_DURATION",
      severity: "notice",
      message: "Brak czasu sesji w wywiadzie. Generator przyjmie domyślnie 60 minut.",
      blocking: false,
    });
  }

  // ── Training location ───────────────────────────────────────────────────────
  const trainingLocation = survey?.trainingLocation ?? null;
  if (!trainingLocation) {
    warnings.push({
      code: "MISSING_TRAINING_LOCATION",
      severity: "notice",
      message: "Brak miejsca treningu. Generator przyjmie Siłownię jako domyślne środowisko.",
      blocking: false,
    });
  }

  // ── Equipment ───────────────────────────────────────────────────────────────
  const rawEquipment = survey?.equipment ?? null;
  let availableEquipment = normalizeEquipmentList(rawEquipment);
  if (availableEquipment.length === 0) {
    availableEquipment = defaultEquipmentForLocation(trainingLocation);
    warnings.push({
      code: "MISSING_EQUIPMENT",
      severity: "notice",
      message: "Brak informacji o sprzęcie. Generator przyjął domyślny sprzęt dla wybranego miejsca.",
      blocking: false,
    });
  }

  // ── Lifestyle ───────────────────────────────────────────────────────────────
  const dailyActivity = survey?.activityLevel ?? null;
  const physicalWork = survey?.activityLevel === "Praca fizyczna";
  const sleepHours = survey?.sleepHours ? parseInt(survey.sleepHours, 10) || null : null;
  const stressLevel = clampStress(survey?.stressLevel);

  if (!dailyActivity && sleepHours === null && stressLevel === null) {
    warnings.push({
      code: "MISSING_RECOVERY_DATA",
      severity: "info",
      message:
        "Brak danych regeneracji (aktywność, sen, stres). Generator użyje standardowych ustawień.",
      blocking: false,
    });
  }

  const recoveryQuality = deriveRecoveryQuality(sleepHours, stressLevel, physicalWork);

  // ── Priority and exclusions ─────────────────────────────────────────────────
  const priorityMuscleGroups = extractPriorityMuscles(
    survey?.priorityMuscle1,
    survey?.priorityMuscle2,
    survey?.priorityMuscle3,
  );
  const excludedMuscleGroups = parseExcludedMuscles(survey?.avoidedMuscles);

  // ── Avoided exercises ───────────────────────────────────────────────────────
  const avoidedExerciseIds = survey?.avoidedExerciseIds ?? [];
  const avoidedExerciseReasons: Record<string, string> =
    (survey?.avoidedExerciseReasons as Record<string, string> | null) ?? {};
  const avoidedExerciseOtherText = survey?.avoidedExerciseOtherText ?? null;

  // ── Client profile completeness check ─────────────────────────────────────
  const hasMinimalProfile = !!(rawLevel || trainingGoal || availableDays);
  if (!hasMinimalProfile) {
    warnings.push({
      code: "INCOMPLETE_CLIENT_PROFILE",
      severity: "warning",
      message:
        "Profil klienta jest niekompletny. Uzupełnij wywiad treningowy, aby generator mógł dobrać optymalne parametry.",
      blocking: false,
    });
  }

  // ── Compose input ────────────────────────────────────────────────────────────
  const input: PlanDraftGenerationInputType = {
    clientId,
    experienceLevel,
    trainingGoal,
    availableDays,
    sessionDurationMinutes,
    trainingLocation,
    availableEquipment,
    dailyActivity,
    physicalWork,
    sleepHours,
    stressLevel,
    recoveryQuality,
    healthLimitations: survey?.healthLimitations ?? null,
    priorityMuscleGroups,
    excludedMuscleGroups,
    preferredExercises: survey?.favoriteExercises ?? null,
    avoidedExerciseIds,
    avoidedExerciseReasons,
    avoidedExerciseOtherText,
  };

  // ── Default preferences ──────────────────────────────────────────────────────
  const trainingDays = availableDays ?? 3;

  // Build the rich split recommendation first so defaultPreferences uses it.
  const splitRecommendation: SplitRecommendationType | null = experienceLevel
    ? recommendSplit({
        trainingDays,
        experienceLevel,
        recoveryQuality,
        trainingGoal,
        priorityMuscleGroups,
      })
    : null;

  // Use the recommendation's split as the default; fall back to the simple rule
  // when recommendation is unavailable (e.g. missing experience level).
  const splitType = splitRecommendation?.recommended ?? defaultSplitForDays(trainingDays);

  const defaultPreferences: PlanDraftGenerationPreferencesType = {
    trainingDays,
    sessionDurationMinutes: sessionDurationMinutes ?? 60,
    splitType,
    blockDurationWeeks: 6,
    trainingGoal: trainingGoal ?? null,
    priorityMuscleGroups,
    preferredTrainingStyle: survey?.planStylePreference ?? null,
    trainerRestrictions: null,
  };

  const allowedSplitTypes = getCompatibleSplits(trainingDays);

  return {
    client: {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email ?? null,
    },
    surveyId: survey?.id ?? null,
    surveyCreatedAt: survey?.createdAt ? survey.createdAt.toISOString() : null,
    input,
    sources,
    warnings,
    defaultPreferences,
    allowedSplitTypes,
    blockDurationRange: { min: 4, max: 12, default: 6 },
    splitRecommendation,
  };
}
