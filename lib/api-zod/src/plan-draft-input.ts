import * as z from "zod";

// ─── Canonical split types ─────────────────────────────────────────────────────

export const SPLIT_TYPES = [
  "full_body",
  "full_body_ab",
  "upper_lower",
  "upper_lower_full_body",
  "push_pull_legs",
  "push_pull_lower_full_body",
  "specialization",
  "custom",
] as const;

export type SplitType = typeof SPLIT_TYPES[number];

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  full_body: "Full Body",
  full_body_ab: "Full Body A/B",
  upper_lower: "Góra / Dół",
  upper_lower_full_body: "Góra / Dół / Full Body",
  push_pull_legs: "Push / Pull / Legs",
  push_pull_lower_full_body: "Push / Pull / Dół / Full Body",
  specialization: "Plan specjalizacyjny",
  custom: "Własny podział",
};

export const SplitTypeSchema = z.enum(SPLIT_TYPES);

// ─── Experience levels ────────────────────────────────────────────────────────

export const VALID_EXPERIENCE_LEVELS = [
  "Brak aktywności fizycznej",
  "Początkujący",
  "Średniozaawansowany",
  "Zaawansowany",
] as const;

export type ExperienceLevel = typeof VALID_EXPERIENCE_LEVELS[number];

export const ExperienceLevelSchema = z.enum(VALID_EXPERIENCE_LEVELS);

// ─── Input source ─────────────────────────────────────────────────────────────

/**
 * Where a field value came from:
 *  - "interview"  – loaded from the client's latest Training Interview (survey)
 *  - "trainer"    – set/overridden by the trainer in this wizard session
 *  - "missing"    – no data available
 *  - "derived"    – computed from other fields (e.g. recoveryQuality)
 */
export const INPUT_SOURCES = ["interview", "trainer", "missing", "derived"] as const;
export type PlanDraftInputSource = typeof INPUT_SOURCES[number];

// ─── Warning codes ────────────────────────────────────────────────────────────

export const DRAFT_INPUT_WARNING_CODES = [
  "MISSING_EXPERIENCE_LEVEL",
  "INVALID_EXPERIENCE_LEVEL",
  "MISSING_TRAINING_GOAL",
  "MISSING_AVAILABLE_DAYS",
  "MISSING_SESSION_DURATION",
  "MISSING_TRAINING_LOCATION",
  "MISSING_EQUIPMENT",
  "MISSING_RECOVERY_DATA",
  "INCOMPLETE_CLIENT_PROFILE",
  "MISSING_CLIENT_SURVEY",
] as const;

export type DraftInputWarningCode = typeof DRAFT_INPUT_WARNING_CODES[number];

export const PlanDraftInputWarning = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "notice", "info"]),
  message: z.string(),
  blocking: z.boolean(),
});

export type PlanDraftInputWarningType = z.infer<typeof PlanDraftInputWarning>;

// ─── Athlete recommendation ───────────────────────────────────────────────────

/**
 * Derived athlete / sport state returned by the API alongside the plan input.
 *
 * isAthlete    – the client declared any "Tak" athlete status
 * plyoRecommended – Plyo session type is appropriate for this client
 * plyoReason   – trainer-facing explanation of why Plyo was added
 * plyoSessionLabel – "Plyometria" when recommended, else null
 */
export const AthleteRecommendation = z.object({
  isAthlete: z.literal(true),
  athleteStatus: z.string(),
  sportDiscipline: z.string().nullable(),
  performanceNeeds: z.array(z.string()),
  plyoRecommended: z.boolean(),
  plyoReason: z.string().nullable(),
  plyoSessionLabel: z.string().nullable(),
});
export type AthleteRecommendationType = z.infer<typeof AthleteRecommendation>;

// ─── Safety alerts ────────────────────────────────────────────────────────────

/**
 * Derived safety state from the client's health fields.
 *   painDetected        – pain keywords found in health-related text
 *   hasHealthLimitation – any health limitation present (injuryStatus="Tak" or non-empty text)
 *   healthText          – the raw health limitation description, or null
 */
export const HealthAlertState = z.object({
  painDetected: z.boolean(),
  hasHealthLimitation: z.boolean(),
  healthText: z.string().nullable(),
});
export type HealthAlertStateType = z.infer<typeof HealthAlertState>;

// ─── Cardio / steps recommendation ───────────────────────────────────────────

export const CardioRecommendation = z.object({
  /** "cardio_day" = extra training day as cardio; "steps" = daily step target */
  type: z.enum(["cardio_day", "steps"]),
  /** Human-readable recommendation text for the trainer */
  text: z.string(),
  /**
   * experience_cap          – surplus days above the level-based strength cap (always fires first)
   * sedentary               – sedentary lifestyle, no fat-loss goal, no surplus days
   * fat_loss                – fat-loss goal, non-sedentary, no surplus days
   * sedentary_and_fat_loss  – both sedentary + fat-loss, no surplus days
   */
  reason: z.enum(["experience_cap", "sedentary", "fat_loss", "sedentary_and_fat_loss"]),
});
export type CardioRecommendationType = z.infer<typeof CardioRecommendation>;

// ─── Conditioning-goal recommendation ────────────────────────────────────────

export const ConditioningRecommendation = z.object({
  /** Human-readable note about required FBW + cardio structure */
  text: z.string(),
});
export type ConditioningRecommendationType = z.infer<typeof ConditioningRecommendation>;

// ─── Core input (normalized from survey) ─────────────────────────────────────

export const PlanDraftGenerationInput = z.object({
  clientId: z.number().int().positive(),

  // Experience level — required for generation
  experienceLevel: ExperienceLevelSchema.nullable(),

  // Training goal (free text, normalized)
  trainingGoal: z.string().nullable(),

  // Training availability
  availableDays: z.number().int().min(1).max(7).nullable(),
  sessionDurationMinutes: z.number().int().min(1).max(300).nullable(),

  // Location and equipment
  trainingLocation: z.string().nullable(),
  availableEquipment: z.array(z.string()),

  // Lifestyle factors
  dailyActivity: z.string().nullable(),
  physicalWork: z.boolean(),
  sleepHours: z.number().nullable(),
  stressLevel: z.number().int().min(1).max(10).nullable(),
  recoveryQuality: z.enum(["excellent", "good", "standard", "poor"]).nullable(),

  // Health — raw fields
  healthLimitations: z.string().nullable(),
  /**
   * Structured injury / health-limitation status captured in the survey.
   * "Brak" = no limitations, "Tak" = limitations present (see healthLimitations).
   * null = field not answered (legacy surveys before this field was added).
   */
  injuryStatus: z.enum(["Brak", "Tak"]).nullable(),

  // Athlete / sport fields (Feature: athlete-specific survey support)
  /**
   * "Nie" = not an athlete.
   * "Tak — amatorsko" / "Tak — półzawodowo" / "Tak — zawodowo" = active sport.
   * null = not answered (legacy surveys).
   */
  athleteStatus: z.string().nullable(),
  /** Sport discipline — free text; non-null when athleteStatus is any "Tak". */
  sportDiscipline: z.string().nullable(),
  /** Selected performance needs (skoczność, szybkość, koordynacja, …). */
  sportPerformanceNeeds: z.array(z.string()),

  // Priorities and preferences
  priorityMuscleGroups: z.array(z.string()),
  excludedMuscleGroups: z.array(z.string()),
  preferredExercises: z.string().nullable(),
  avoidedExerciseIds: z.array(z.number().int()),
  avoidedExerciseReasons: z.record(z.string()),
  avoidedExerciseOtherText: z.string().nullable(),
});

export type PlanDraftGenerationInputType = z.infer<typeof PlanDraftGenerationInput>;

// ─── Preferences (wizard step 2 overrides) ───────────────────────────────────

export const PlanDraftGenerationPreferences = z.object({
  // Core plan parameters
  trainingDays: z.number().int().min(1).max(7),
  sessionDurationMinutes: z.number().int().min(20).max(180),
  splitType: SplitTypeSchema,
  blockDurationWeeks: z.number().int().min(4).max(12).default(6),

  // Goal and style
  trainingGoal: z.string().nullable(),
  priorityMuscleGroups: z.array(z.string()),
  preferredTrainingStyle: z.string().nullable(),

  // Trainer notes
  trainerRestrictions: z.string().nullable(),
});

export type PlanDraftGenerationPreferencesType = z.infer<typeof PlanDraftGenerationPreferences>;

// ─── Source map ───────────────────────────────────────────────────────────────

export const PlanDraftInputSourceMap = z.object({
  experienceLevel: z.enum(INPUT_SOURCES),
  trainingGoal: z.enum(INPUT_SOURCES),
  availableDays: z.enum(INPUT_SOURCES),
  sessionDurationMinutes: z.enum(INPUT_SOURCES),
  trainingLocation: z.enum(INPUT_SOURCES),
  availableEquipment: z.enum(INPUT_SOURCES),
  dailyActivity: z.enum(INPUT_SOURCES),
  physicalWork: z.enum(INPUT_SOURCES),
  sleepHours: z.enum(INPUT_SOURCES),
  stressLevel: z.enum(INPUT_SOURCES),
  recoveryQuality: z.enum(INPUT_SOURCES),
  healthLimitations: z.enum(INPUT_SOURCES),
  priorityMuscleGroups: z.enum(INPUT_SOURCES),
  excludedMuscleGroups: z.enum(INPUT_SOURCES),
  preferredExercises: z.enum(INPUT_SOURCES),
  avoidedExercises: z.enum(INPUT_SOURCES),
});

export type PlanDraftInputSourceMapType = z.infer<typeof PlanDraftInputSourceMap>;

// ─── Compatible splits by day count ──────────────────────────────────────────

export function getCompatibleSplits(days: number | null): SplitType[] {
  if (!days || days < 1) return ["custom"];
  if (days <= 2) return ["full_body_ab", "custom"];
  // 3 days: classic Push / Pull / Legs is a natural fit alongside full-body variants
  if (days === 3) return ["full_body", "upper_lower_full_body", "push_pull_legs", "custom"];
  if (days === 4) return ["upper_lower", "push_pull_lower_full_body", "custom"];
  // 5 days: PPL repeats the first day → unbalanced; use upper/lower variants instead
  if (days === 5) return ["upper_lower_full_body", "specialization", "custom"];
  // 6-7 days: PPL divides evenly (Push/Pull/Legs × 2)
  return ["push_pull_legs", "specialization", "custom"];
}

// ─── Split recommendation ─────────────────────────────────────────────────────

export const SplitRecommendation = z.object({
  recommended: SplitTypeSchema,
  explanation: z.string(),
  alternatives: z.array(SplitTypeSchema),
  /** True when recovery downgraded the initial intermediate/advanced recommendation. */
  fallbackApplied: z.boolean(),
  /**
   * Set when the recommendation caps the frequency below what the user declared.
   * E.g. survey says 5 days but level is Początkujący → cappedTrainingDays = 3.
   * Null when no frequency cap was applied.
   */
  cappedTrainingDays: z.number().nullable(),
});

export type SplitRecommendationType = z.infer<typeof SplitRecommendation>;

// ─── API response ─────────────────────────────────────────────────────────────

export const GetClientPlanDraftInputParams = z.object({
  clientId: z.coerce.number().int().positive(),
});

export const GetClientPlanDraftInputResponse = z.object({
  client: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().nullable(),
  }),
  surveyId: z.number().nullable(),
  surveyCreatedAt: z.string().nullable(),
  input: PlanDraftGenerationInput,
  sources: PlanDraftInputSourceMap,
  warnings: z.array(PlanDraftInputWarning),
  defaultPreferences: PlanDraftGenerationPreferences,
  allowedSplitTypes: z.array(SplitTypeSchema),
  blockDurationRange: z.object({
    min: z.number(),
    max: z.number(),
    default: z.number(),
  }),
  splitRecommendation: SplitRecommendation.nullable(),
  /** Derived safety alert state from the client's health / injury fields (Feature 1 & 2) */
  safetyAlerts: HealthAlertState.nullable(),
  /** Mandatory cardio / steps recommendation for sedentary or fat-loss cases (Feature 3) */
  cardioRecommendation: CardioRecommendation.nullable(),
  /** Conditioning-goal planning note — present when goal is "Poprawa kondycji" (Feature 4) */
  conditioningRecommendation: ConditioningRecommendation.nullable(),
  /**
   * Athlete / sport recommendation — present when the client declared any "Tak" athlete status.
   * null for general-population non-athlete clients.
   */
  athleteRecommendation: AthleteRecommendation.nullable(),
});

export type GetClientPlanDraftInputResponseType = z.infer<typeof GetClientPlanDraftInputResponse>;

// ─── Validation endpoint ──────────────────────────────────────────────────────

export const ValidateDraftInputBody = z.object({
  clientId: z.number().int().positive(),
  preferences: PlanDraftGenerationPreferences,
});

export const ValidateDraftInputResponse = z.object({
  valid: z.boolean(),
  blocking: z.boolean(),
  warnings: z.array(PlanDraftInputWarning),
});

export type ValidateDraftInputResponseType = z.infer<typeof ValidateDraftInputResponse>;

// ─── Plan update extensions ───────────────────────────────────────────────────

export const PlanSplitTypeUpdate = z.object({
  splitType: SplitTypeSchema.nullable().optional(),
  blockDurationWeeks: z.number().int().min(4).max(12).nullable().optional(),
});
