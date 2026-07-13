/**
 * Plan Analysis Service — Workout Builder 2.0 Phase 3
 *
 * Computes structural movement analysis: movement-pattern coverage, Push/Pull
 * balance, Squat/Hinge balance, compound/isolation distribution, bilateral/
 * unilateral distribution, plane-of-motion coverage, weekly distribution and
 * advisory warnings.
 *
 * Architecture mirrors volumeCalculator.ts:
 *   - Pure core (calculatePlanAnalysisCore) is DB-free and unit-testable.
 *   - loadExerciseMetadata + normalizePlanAnalysisInput are the DB/IO layer.
 *   - analyseDraftPreview and analyseSavedPlan share exactly the same core.
 *
 * Classification uses existing DB fields.  Priority:
 *   movementCategory field (if parseable) → movementPattern normalization.
 * Missing metadata produces structured warnings; it never crashes analysis.
 *
 * IMPORTANT: this service does NOT touch volumeCalculator.ts or any volume
 * guideline data.  The two analyses are fully independent.
 */

import { db, exercisesTable, workoutPlanDaysTable, workoutPlanExercisesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ─── Movement category key type ───────────────────────────────────────────────

export type MovementCategoryKey =
  | "push"
  | "pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "carry"
  | "rotation";

export type SubPatternKey =
  | "vertical_push"
  | "horizontal_push"
  | "vertical_pull"
  | "horizontal_pull"
  | null;

// ─── Balance configuration (centralized, transparent, heuristic) ──────────────
//
// These are coaching signals — not medical rules.
// All thresholds live here so they can be adjusted without hunting through code.

export const BALANCE_CONFIG = {
  pushPull: {
    /** Push/pull ratio above this → "Push dominant" (advisory). */
    warningRatio: 1.5,
    /** Above this → "Strongly push dominant" (stronger advisory). */
    strongWarningRatio: 2.0,
    /** Skip comparison when push+pull sets < this (not enough data). */
    minimumCombinedSets: 6,
  },
  squatHinge: {
    warningRatio: 1.75,
    strongWarningRatio: 2.5,
    minimumCombinedSets: 4,
  },
  categoryDominance: {
    /** One category > this % of plan sets → advisory notice. */
    warningPercentage: 45,
    /** Above this % → stronger advisory. */
    strongWarningPercentage: 60,
  },
  unilateral: {
    /**
     * When the plan has ≥ this many days and zero unilateral exercises,
     * emit an informational note (not a warning — this may be intentional).
     */
    informationalMinimumDays: 3,
  },
  repeatedPattern: {
    /** ≥ this many entries with the same specific pattern in one day → advisory. */
    perDayThreshold: 3,
  },
} as const;

// ─── Polish labels (one canonical location) ───────────────────────────────────

export const MOVEMENT_CATEGORY_LABELS: Record<MovementCategoryKey, string> = {
  push:     "Push",
  pull:     "Pull",
  squat:    "Squat",
  hinge:    "Hinge",
  lunge:    "Lunge",
  core:     "Core",
  carry:    "Przenoszenie",
  rotation: "Rotacja",
};

export const ALL_CATEGORIES: MovementCategoryKey[] = [
  "push", "pull", "squat", "hinge", "lunge", "core", "carry", "rotation",
];

// ─── Normalization maps ────────────────────────────────────────────────────────
//
// Maps Polish movementPattern strings stored in the DB to canonical keys.
// Add new entries HERE — never in components or route handlers.
// Do not infer movement from exercise names.

const PATTERN_TO_CATEGORY: Record<string, MovementCategoryKey> = {
  // Push — horizontal
  "Pchanie poziome": "push",
  "Wypychanie poziome": "push",
  "Wyciskanie poziome": "push",
  // Push — vertical
  "Pchanie pionowe": "push",
  "Wypychanie pionowe": "push",
  "Wyciskanie pionowe": "push",
  // Pull — vertical
  "Przyciąganie pionowe": "pull",
  // Pull — horizontal
  "Przyciąganie poziome": "pull",
  "Wiosłowanie": "pull",
  // Squat
  "Przysiad": "squat",
  "Knee flexion": "squat",
  "Zgięcie kolana": "squat",
  "Knee extension": "squat",
  "Wyprost kolana": "squat",
  // Hinge
  "Zawiasowe": "hinge",
  "Hip hinge": "hinge",
  "Martwy ciąg": "hinge",
  "Wzorzec zawiasowy": "hinge",
  "Hip extension": "hinge",
  "Wyprost biodra": "hinge",
  "Calf raise": "hinge",
  "Wspięcie na palce": "hinge",
  // Lunge
  "Wykrok": "lunge",
  "Wypad": "lunge",
  "Lunge": "lunge",
  // Core
  "Stabilizacja tułowia": "core",
  "Anti-ekstensja": "core",
  "Anti-rotacja": "core",
  "Zgięcie tułowia": "core",
  "Stabilizacja": "core",
  "Core": "core",
  // Carry
  "Niosące": "carry",
  "Chód farmera": "carry",
  "Farmer's carry": "carry",
  "Farmer carry": "carry",
  // Rotation
  "Rotacja": "rotation",
  "Obrót": "rotation",
};

const PATTERN_TO_SUBPATTERN: Record<string, SubPatternKey> = {
  "Pchanie pionowe":      "vertical_push",
  "Pchanie poziome":      "horizontal_push",
  "Wypychanie pionowe":   "vertical_push",
  "Wypychanie poziome":   "horizontal_push",
  "Wyciskanie pionowe":   "vertical_push",
  "Wyciskanie poziome":   "horizontal_push",
  "Przyciąganie pionowe": "vertical_pull",
  "Przyciąganie poziome": "horizontal_pull",
};

/**
 * Normalize the movementCategory DB field to a canonical key.
 * Accepts both English keys (legacy) and Polish canonical values
 * (as stored by the Exercise Form / Bulk Import using MOVEMENT_CATEGORY_OPTIONS).
 */
const MOVCAT_FIELD_TO_KEY: Record<string, MovementCategoryKey> = {
  // English (legacy / analysis-internal)
  push: "push", Push: "push",
  pull: "pull", Pull: "pull",
  squat: "squat", Squat: "squat",
  hinge: "hinge", Hinge: "hinge",
  lunge: "lunge", Lunge: "lunge",
  core: "core", Core: "core",
  carry: "carry", Carry: "carry",
  rotation: "rotation", Rotation: "rotation",
  // Polish canonical (MOVEMENT_CATEGORY_OPTIONS in exercise-constants.ts)
  Pchanie: "push",
  Ciągnięcie: "pull",
  Przysiad: "squat",
  Zawiasowe: "hinge",
  Wykrok: "lunge",
  Dźwiganie: "carry",
  Rotacja: "rotation",
};

// ─── Normalization helpers (pure, exported for tests) ─────────────────────────

/**
 * Resolve the primary movement category from DB fields.
 * Priority: movementCategory field (if parseable) → movementPattern.
 */
export function normalizeMovementCategory(
  movementPattern: string | null,
  movementCategory: string | null,
): MovementCategoryKey | null {
  if (movementCategory) {
    const fromCat = MOVCAT_FIELD_TO_KEY[movementCategory];
    if (fromCat) return fromCat;
  }
  if (movementPattern) {
    const fromPat = PATTERN_TO_CATEGORY[movementPattern];
    if (fromPat) return fromPat;
  }
  return null;
}

/** Returns the sub-pattern (vertical_push, horizontal_pull, etc.) or null. */
export function normalizeSubPattern(movementPattern: string | null): SubPatternKey {
  if (!movementPattern) return null;
  return PATTERN_TO_SUBPATTERN[movementPattern] ?? null;
}

/**
 * Normalize exerciseType field to "compound" | "isolation" | null.
 * DB stores Polish: "Złożone" | "Izolowane".
 */
export function normalizeExerciseType(raw: string | null): "compound" | "isolation" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "złożone" || lower === "compound" || lower === "wielostawowe") return "compound";
  if (lower === "izolowane" || lower === "isolation" || lower === "izolacyjne") return "isolation";
  return null;
}

/**
 * Normalize execution field to "bilateral" | "unilateral" | null.
 * DB stores Polish: "Obustronne" | "Jednostronne".
 */
export function normalizeExecution(raw: string | null): "bilateral" | "unilateral" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "obustronne" || lower === "bilateral") return "bilateral";
  if (lower === "jednostronne" || lower === "unilateral") return "unilateral";
  return null;
}

/**
 * Normalize planeOfMotion field.
 * DB stores Polish: "Strzałkowa" | "Czołowa" | "Poprzeczna".
 */
export function normalizePlane(
  raw: string | null,
): "sagittal" | "frontal" | "transverse" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "strzałkowa" || lower === "sagittal") return "sagittal";
  if (lower === "czołowa" || lower === "frontal") return "frontal";
  if (lower === "poprzeczna" || lower === "transverse") return "transverse";
  return null;
}

// ─── Core types ────────────────────────────────────────────────────────────────

export interface NormalizedAnalysisEntry {
  entryId: number;
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  exerciseId: number;
  exerciseName: string;
  workingSets: number;
  // --- Raw DB fields ---
  movementPattern: string | null;
  movementCategory: string | null;
  // --- Resolved fields (null = field missing/unrecognised) ---
  resolvedCategory: MovementCategoryKey | null;
  resolvedSubPattern: SubPatternKey;
  resolvedExerciseType: "compound" | "isolation" | null;
  resolvedExecution: "bilateral" | "unilateral" | null;
  resolvedPlane: "sagittal" | "frontal" | "transverse" | null;
  exerciseFound: boolean;
  isActive: boolean;
}

export interface AnalysisWarning {
  code: string;
  severity: "info" | "notice" | "warning";
  scope: "plan" | "day" | "exercise";
  dayId?: number | null;
  exerciseEntryId?: number | null;
  exerciseId?: number | null;
  exerciseName?: string | null;
  message: string;
}

export interface CategoryDaySummary {
  dayId: number;
  dayName: string | null;
  workingSets: number;
  exerciseEntries: number;
}

export interface CategoryContributor {
  entryId: number;
  exerciseId: number;
  exerciseName: string;
  dayId: number;
  dayName: string | null;
  workingSets: number;
  subPattern: SubPatternKey;
}

export interface CategoryAnalysis {
  category: MovementCategoryKey;
  label: string;
  workingSets: number;
  exerciseEntries: number;
  percentageOfPlanSets: number;
  daysPresent: number;
  dayBreakdown: CategoryDaySummary[];
  exercises: CategoryContributor[];
}

export type BalanceStatus =
  | "balanced"
  | "push_dominant"
  | "strongly_push_dominant"
  | "pull_dominant"
  | "strongly_pull_dominant"
  | "insufficient_data";

export type SquatHingeStatus =
  | "balanced"
  | "squat_dominant"
  | "strongly_squat_dominant"
  | "hinge_dominant"
  | "strongly_hinge_dominant"
  | "insufficient_data";

export interface PushPullBalance {
  pushSets: number;
  pullSets: number;
  ratio: number | null;
  status: BalanceStatus;
  severity: "success" | "warning" | "error" | "info";
  message: string;
}

export interface SquatHingeBalance {
  squatSets: number;
  hingeSets: number;
  ratio: number | null;
  status: SquatHingeStatus;
  severity: "success" | "warning" | "error" | "info";
  message: string;
}

export interface DayAnalysis {
  dayId: number;
  dayName: string | null;
  dayOrder: number;
  totalWorkingSets: number;
  exerciseCount: number;
  categoryBreakdown: Array<{
    category: MovementCategoryKey;
    label: string;
    workingSets: number;
    exerciseEntries: number;
  }>;
  compoundSets: number;
  isolationSets: number;
  compoundEntries: number;
  isolationEntries: number;
  bilateralSets: number;
  unilateralSets: number;
  bilateralEntries: number;
  unilateralEntries: number;
  planesPresent: string[];
  repeatedPatterns: Array<{
    pattern: string;
    exerciseCount: number;
    workingSets: number;
    exerciseNames: string[];
  }>;
}

export interface WeeklyDistributionEntry {
  category: MovementCategoryKey;
  label: string;
  totalSets: number;
  daysCount: number;
  maxSetsInOneDay: number;
  maxSetsDayName: string | null;
  concentrationPercentage: number;
}

export interface PlanAnalysisResult {
  summary: {
    totalWorkingSets: number;
    totalExerciseEntries: number;
    analysedExerciseEntries: number;
    incompleteExerciseEntries: number;
  };
  balance: {
    pushPull: PushPullBalance;
    squatHinge: SquatHingeBalance;
  };
  movementCategories: CategoryAnalysis[];
  exerciseTypes: {
    compoundEntries: number;
    isolationEntries: number;
    compoundSets: number;
    isolationSets: number;
    compoundPercentage: number;
    isolationPercentage: number;
    unknownEntries: number;
    unknownSets: number;
  };
  executionTypes: {
    bilateralEntries: number;
    unilateralEntries: number;
    bilateralSets: number;
    unilateralSets: number;
    bilateralPercentage: number;
    unilateralPercentage: number;
    daysWithUnilateral: number;
    unknownEntries: number;
    unknownSets: number;
  };
  planesOfMotion: {
    sagittalSets: number;
    frontalSets: number;
    transverseSets: number;
    sagittalEntries: number;
    frontalEntries: number;
    transverseEntries: number;
    unknownSets: number;
    unknownEntries: number;
  };
  weeklyDistribution: WeeklyDistributionEntry[];
  days: DayAnalysis[];
  warnings: AnalysisWarning[];
}

// ─── Preview input types ───────────────────────────────────────────────────────

export interface AnalysisPreviewExercise {
  exerciseEntryId: number;
  exerciseId: number;
  workingSets: number;
  orderInDay?: number;
}

export interface AnalysisPreviewDay {
  dayId: number;
  dayName?: string | null;
  dayOrder?: number;
  exercises: AnalysisPreviewExercise[];
}

export interface AnalysisPreviewInput {
  clientId: number;
  planId?: number;
  goal?: string | null;
  days: AnalysisPreviewDay[];
}

// ─── Balance computation (pure, exported for tests) ───────────────────────────

export function computePushPullBalance(
  pushSets: number,
  pullSets: number,
): PushPullBalance {
  const combined = pushSets + pullSets;

  if (combined < BALANCE_CONFIG.pushPull.minimumCombinedSets) {
    return {
      pushSets, pullSets, ratio: null,
      status: "insufficient_data", severity: "info",
      message: `Za mało danych do oceny balansu Push/Pull (łącznie ${combined} serii, wymagane minimum: ${BALANCE_CONFIG.pushPull.minimumCombinedSets}).`,
    };
  }

  // Safe division — 0 pull sets means infinite push dominance
  const ratio = pullSets > 0 ? pushSets / pullSets : Infinity;
  const inverseRatio = pushSets > 0 ? pullSets / pushSets : Infinity;

  if (ratio > BALANCE_CONFIG.pushPull.strongWarningRatio) {
    return {
      pushSets, pullSets, ratio,
      status: "strongly_push_dominant", severity: "error",
      message: `Duża przewaga ruchów wypychających: ${pushSets} serii Push vs ${pullSets} serii Pull (stosunek ${ratio === Infinity ? "∞" : ratio.toFixed(2)}:1).`,
    };
  }
  if (inverseRatio > BALANCE_CONFIG.pushPull.strongWarningRatio) {
    return {
      pushSets, pullSets, ratio,
      status: "strongly_pull_dominant", severity: "error",
      message: `Duża przewaga ruchów przyciągających: ${pullSets} serii Pull vs ${pushSets} serii Push (stosunek ${inverseRatio.toFixed(2)}:1 na korzyść Pull).`,
    };
  }
  if (ratio > BALANCE_CONFIG.pushPull.warningRatio) {
    return {
      pushSets, pullSets, ratio,
      status: "push_dominant", severity: "warning",
      message: `Przewaga ruchów wypychających: ${pushSets} serii Push vs ${pullSets} serii Pull (stosunek ${ratio.toFixed(2)}:1).`,
    };
  }
  if (inverseRatio > BALANCE_CONFIG.pushPull.warningRatio) {
    return {
      pushSets, pullSets, ratio,
      status: "pull_dominant", severity: "warning",
      message: `Przewaga ruchów przyciągających: ${pullSets} serii Pull vs ${pushSets} serii Push (stosunek ${inverseRatio.toFixed(2)}:1 na korzyść Pull).`,
    };
  }
  return {
    pushSets, pullSets, ratio,
    status: "balanced", severity: "success",
    message: `Proporcja Push/Pull (${pushSets}:${pullSets}) jest zrównoważona.`,
  };
}

export function computeSquatHingeBalance(
  squatSets: number,
  hingeSets: number,
): SquatHingeBalance {
  const combined = squatSets + hingeSets;

  if (combined < BALANCE_CONFIG.squatHinge.minimumCombinedSets) {
    return {
      squatSets, hingeSets, ratio: null,
      status: "insufficient_data", severity: "info",
      message: `Za mało danych do oceny balansu Squat/Hinge (łącznie ${combined} serii, wymagane minimum: ${BALANCE_CONFIG.squatHinge.minimumCombinedSets}).`,
    };
  }

  const ratio = hingeSets > 0 ? squatSets / hingeSets : Infinity;
  const inverseRatio = squatSets > 0 ? hingeSets / squatSets : Infinity;

  if (ratio > BALANCE_CONFIG.squatHinge.strongWarningRatio) {
    return {
      squatSets, hingeSets, ratio,
      status: "strongly_squat_dominant", severity: "error",
      message: `Duża przewaga wzorca przysiadu: ${squatSets} serii Squat vs ${hingeSets} serii Hinge (stosunek ${ratio === Infinity ? "∞" : ratio.toFixed(2)}:1).`,
    };
  }
  if (inverseRatio > BALANCE_CONFIG.squatHinge.strongWarningRatio) {
    return {
      squatSets, hingeSets, ratio,
      status: "strongly_hinge_dominant", severity: "error",
      message: `Duża przewaga wzorca zawiasowego: ${hingeSets} serii Hinge vs ${squatSets} serii Squat (stosunek ${inverseRatio.toFixed(2)}:1 na korzyść Hinge).`,
    };
  }
  if (ratio > BALANCE_CONFIG.squatHinge.warningRatio) {
    return {
      squatSets, hingeSets, ratio,
      status: "squat_dominant", severity: "warning",
      message: `Przewaga wzorca przysiadu: ${squatSets} serii Squat vs ${hingeSets} serii Hinge (stosunek ${ratio.toFixed(2)}:1).`,
    };
  }
  if (inverseRatio > BALANCE_CONFIG.squatHinge.warningRatio) {
    return {
      squatSets, hingeSets, ratio,
      status: "hinge_dominant", severity: "warning",
      message: `Przewaga wzorca zawiasowego: ${hingeSets} serii Hinge vs ${squatSets} serii Squat (stosunek ${inverseRatio.toFixed(2)}:1 na korzyść Hinge).`,
    };
  }
  return {
    squatSets, hingeSets, ratio,
    status: "balanced", severity: "success",
    message: `Proporcja Squat/Hinge (${squatSets}:${hingeSets}) jest zrównoważona.`,
  };
}

// ─── Pure analysis core ────────────────────────────────────────────────────────

/**
 * Pure, DB-free core.  Accepts fully resolved entries plus any input-phase
 * warnings (metadata completeness etc.) gathered by the loader.
 * The core adds balance / distribution / pattern advisory warnings.
 */
export function calculatePlanAnalysisCore(
  entries: NormalizedAnalysisEntry[],
  inputWarnings: AnalysisWarning[] = [],
): PlanAnalysisResult {
  const totalWorkingSets = entries.reduce((s, e) => s + e.workingSets, 0);
  const totalExerciseEntries = entries.length;
  const analysedExerciseEntries = entries.filter((e) => e.resolvedCategory !== null).length;
  const incompleteExerciseEntries = totalExerciseEntries - analysedExerciseEntries;

  // ── Category totals ──────────────────────────────────────────────────────────
  const catSets   = new Map<MovementCategoryKey, number>(ALL_CATEGORIES.map((c) => [c, 0]));
  const catEnts   = new Map<MovementCategoryKey, number>(ALL_CATEGORIES.map((c) => [c, 0]));
  const catDays   = new Map<MovementCategoryKey, Set<number>>(ALL_CATEGORIES.map((c) => [c, new Set()]));
  const catDayMap = new Map<MovementCategoryKey, Map<number, { workingSets: number; exerciseEntries: number; dayName: string | null }>>(
    ALL_CATEGORIES.map((c) => [c, new Map()]),
  );
  const catContrib = new Map<MovementCategoryKey, CategoryContributor[]>(
    ALL_CATEGORIES.map((c) => [c, []]),
  );

  for (const entry of entries) {
    const cat = entry.resolvedCategory;
    if (!cat) continue;

    catSets.set(cat, catSets.get(cat)! + entry.workingSets);
    catEnts.set(cat, catEnts.get(cat)! + 1);
    catDays.get(cat)!.add(entry.dayId);

    const dm = catDayMap.get(cat)!;
    const existing = dm.get(entry.dayId);
    if (existing) {
      existing.workingSets += entry.workingSets;
      existing.exerciseEntries++;
    } else {
      dm.set(entry.dayId, { workingSets: entry.workingSets, exerciseEntries: 1, dayName: entry.dayName });
    }

    catContrib.get(cat)!.push({
      entryId: entry.entryId,
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      dayId: entry.dayId,
      dayName: entry.dayName,
      workingSets: entry.workingSets,
      subPattern: entry.resolvedSubPattern,
    });
  }

  // ── movementCategories array ─────────────────────────────────────────────────
  const movementCategories: CategoryAnalysis[] = ALL_CATEGORIES.map((cat) => {
    const sets = catSets.get(cat)!;
    const dm   = catDayMap.get(cat)!;
    const dayBreakdown: CategoryDaySummary[] = [...dm.entries()].map(
      ([dayId, { workingSets, exerciseEntries, dayName }]) => ({
        dayId, dayName, workingSets, exerciseEntries,
      }),
    );
    return {
      category: cat,
      label: MOVEMENT_CATEGORY_LABELS[cat],
      workingSets: sets,
      exerciseEntries: catEnts.get(cat)!,
      percentageOfPlanSets: totalWorkingSets > 0 ? (sets / totalWorkingSets) * 100 : 0,
      daysPresent: catDays.get(cat)!.size,
      dayBreakdown,
      exercises: catContrib.get(cat)!,
    };
  });

  // ── Push / Pull and Squat / Hinge ────────────────────────────────────────────
  const pushPull    = computePushPullBalance(catSets.get("push")!, catSets.get("pull")!);
  const squatHinge  = computeSquatHingeBalance(catSets.get("squat")!, catSets.get("hinge")!);

  // ── Exercise types ────────────────────────────────────────────────────────────
  let cmpEntries = 0, isoEntries = 0, unkTypeEntries = 0;
  let cmpSets = 0, isoSets = 0, unkTypeSets = 0;
  for (const e of entries) {
    if      (e.resolvedExerciseType === "compound")  { cmpEntries++; cmpSets += e.workingSets; }
    else if (e.resolvedExerciseType === "isolation") { isoEntries++; isoSets += e.workingSets; }
    else { unkTypeEntries++; unkTypeSets += e.workingSets; }
  }
  const knownTypeSets = cmpSets + isoSets;
  const exerciseTypes = {
    compoundEntries: cmpEntries,
    isolationEntries: isoEntries,
    compoundSets: cmpSets,
    isolationSets: isoSets,
    compoundPercentage:  knownTypeSets > 0 ? (cmpSets / knownTypeSets) * 100 : 0,
    isolationPercentage: knownTypeSets > 0 ? (isoSets / knownTypeSets) * 100 : 0,
    unknownEntries: unkTypeEntries,
    unknownSets: unkTypeSets,
  };

  // ── Execution types ───────────────────────────────────────────────────────────
  let bilEntries = 0, unilEntries = 0, unkExecEntries = 0;
  let bilSets = 0, unilSets = 0, unkExecSets = 0;
  const daysWithUnilateral = new Set<number>();
  for (const e of entries) {
    if      (e.resolvedExecution === "bilateral")  { bilEntries++;  bilSets  += e.workingSets; }
    else if (e.resolvedExecution === "unilateral") { unilEntries++; unilSets += e.workingSets; daysWithUnilateral.add(e.dayId); }
    else { unkExecEntries++; unkExecSets += e.workingSets; }
  }
  const knownExecSets = bilSets + unilSets;
  const executionTypes = {
    bilateralEntries: bilEntries,
    unilateralEntries: unilEntries,
    bilateralSets: bilSets,
    unilateralSets: unilSets,
    bilateralPercentage:  knownExecSets > 0 ? (bilSets  / knownExecSets) * 100 : 0,
    unilateralPercentage: knownExecSets > 0 ? (unilSets / knownExecSets) * 100 : 0,
    daysWithUnilateral: daysWithUnilateral.size,
    unknownEntries: unkExecEntries,
    unknownSets: unkExecSets,
  };

  // ── Planes of motion ─────────────────────────────────────────────────────────
  let sagSets = 0, froSets = 0, traSets = 0, unkPlaneSets = 0;
  let sagEnts = 0, froEnts = 0, traEnts = 0, unkPlaneEnts = 0;
  for (const e of entries) {
    if      (e.resolvedPlane === "sagittal")   { sagSets += e.workingSets; sagEnts++; }
    else if (e.resolvedPlane === "frontal")    { froSets += e.workingSets; froEnts++; }
    else if (e.resolvedPlane === "transverse") { traSets += e.workingSets; traEnts++; }
    else { unkPlaneSets += e.workingSets; unkPlaneEnts++; }
  }
  const planesOfMotion = {
    sagittalSets: sagSets,   frontalSets: froSets,   transverseSets: traSets,
    sagittalEntries: sagEnts, frontalEntries: froEnts, transverseEntries: traEnts,
    unknownSets: unkPlaneSets, unknownEntries: unkPlaneEnts,
  };

  // ── Per-day analysis ─────────────────────────────────────────────────────────
  const dayIds = [...new Set(entries.map((e) => e.dayId))].sort((a, b) => {
    const ao = entries.find((e) => e.dayId === a)?.dayOrder ?? 0;
    const bo = entries.find((e) => e.dayId === b)?.dayOrder ?? 0;
    return ao - bo;
  });

  const days: DayAnalysis[] = dayIds.map((dayId) => {
    const de = entries.filter((e) => e.dayId === dayId);
    const dayName  = de[0]?.dayName ?? null;
    const dayOrder = de[0]?.dayOrder ?? 0;
    const totalSets = de.reduce((s, e) => s + e.workingSets, 0);

    // Category breakdown
    const dayCatMap = new Map<MovementCategoryKey, { sets: number; entries: number }>();
    for (const e of de) {
      if (!e.resolvedCategory) continue;
      const ex = dayCatMap.get(e.resolvedCategory);
      if (ex) { ex.sets += e.workingSets; ex.entries++; }
      else dayCatMap.set(e.resolvedCategory, { sets: e.workingSets, entries: 1 });
    }
    const categoryBreakdown = [...dayCatMap.entries()]
      .sort(([, a], [, b]) => b.sets - a.sets)
      .map(([cat, { sets, entries: ents }]) => ({
        category: cat, label: MOVEMENT_CATEGORY_LABELS[cat],
        workingSets: sets, exerciseEntries: ents,
      }));

    // Compound / isolation
    let dayCmpS = 0, dayIsoS = 0, dayCmpE = 0, dayIsoE = 0;
    for (const e of de) {
      if (e.resolvedExerciseType === "compound")  { dayCmpS += e.workingSets; dayCmpE++; }
      if (e.resolvedExerciseType === "isolation") { dayIsoS += e.workingSets; dayIsoE++; }
    }

    // Bilateral / unilateral
    let dayBilS = 0, dayUnilS = 0, dayBilE = 0, dayUnilE = 0;
    for (const e of de) {
      if (e.resolvedExecution === "bilateral")  { dayBilS  += e.workingSets; dayBilE++;  }
      if (e.resolvedExecution === "unilateral") { dayUnilS += e.workingSets; dayUnilE++; }
    }

    // Planes present
    const planeSet = new Set<string>();
    for (const e of de) { if (e.resolvedPlane) planeSet.add(e.resolvedPlane); }

    // Repeated patterns — group by subPattern if available, else movementPattern
    const patGroups = new Map<string, { sets: number; names: string[] }>();
    for (const e of de) {
      const key = e.resolvedSubPattern ?? e.movementPattern;
      if (!key) continue;
      const ex = patGroups.get(key);
      if (ex) { ex.sets += e.workingSets; ex.names.push(e.exerciseName); }
      else patGroups.set(key, { sets: e.workingSets, names: [e.exerciseName] });
    }
    const repeatedPatterns = [...patGroups.entries()]
      .filter(([, { names }]) => names.length >= BALANCE_CONFIG.repeatedPattern.perDayThreshold)
      .map(([pattern, { sets, names }]) => ({
        pattern, exerciseCount: names.length, workingSets: sets, exerciseNames: names,
      }));

    return {
      dayId, dayName, dayOrder,
      totalWorkingSets: totalSets,
      exerciseCount: de.length,
      categoryBreakdown,
      compoundSets: dayCmpS, isolationSets: dayIsoS,
      compoundEntries: dayCmpE, isolationEntries: dayIsoE,
      bilateralSets: dayBilS, unilateralSets: dayUnilS,
      bilateralEntries: dayBilE, unilateralEntries: dayUnilE,
      planesPresent: [...planeSet],
      repeatedPatterns,
    };
  });

  // ── Weekly distribution ───────────────────────────────────────────────────────
  const weeklyDistribution: WeeklyDistributionEntry[] = ALL_CATEGORIES.map((cat) => {
    const sets = catSets.get(cat)!;
    if (sets === 0) return {
      category: cat, label: MOVEMENT_CATEGORY_LABELS[cat], totalSets: 0,
      daysCount: 0, maxSetsInOneDay: 0, maxSetsDayName: null, concentrationPercentage: 0,
    };
    const dm = catDayMap.get(cat)!;
    let maxSets = 0, maxDayName: string | null = null;
    for (const [, { workingSets, dayName }] of dm) {
      if (workingSets > maxSets) { maxSets = workingSets; maxDayName = dayName; }
    }
    return {
      category: cat, label: MOVEMENT_CATEGORY_LABELS[cat],
      totalSets: sets,
      daysCount: catDays.get(cat)!.size,
      maxSetsInOneDay: maxSets,
      maxSetsDayName: maxDayName,
      concentrationPercentage: (maxSets / sets) * 100,
    };
  });

  // ── Advisory warnings from core ───────────────────────────────────────────────
  const coreWarnings: AnalysisWarning[] = [];

  // Push/Pull imbalance
  if (pushPull.severity === "warning" || pushPull.severity === "error") {
    coreWarnings.push({
      code: "PUSH_PULL_IMBALANCE",
      severity: pushPull.severity === "error" ? "warning" : "notice",
      scope: "plan",
      message: pushPull.message,
    });
  }

  // Squat/Hinge imbalance
  if (squatHinge.severity === "warning" || squatHinge.severity === "error") {
    coreWarnings.push({
      code: "SQUAT_HINGE_IMBALANCE",
      severity: squatHinge.severity === "error" ? "warning" : "notice",
      scope: "plan",
      message: squatHinge.message,
    });
  }

  // Category dominance
  if (totalWorkingSets > 0) {
    for (const cat of ALL_CATEGORIES) {
      const sets = catSets.get(cat)!;
      const pct  = (sets / totalWorkingSets) * 100;
      if (pct >= BALANCE_CONFIG.categoryDominance.strongWarningPercentage) {
        coreWarnings.push({
          code: "CATEGORY_DOMINANCE",
          severity: "warning",
          scope: "plan",
          message: `Wzorzec „${MOVEMENT_CATEGORY_LABELS[cat]}" stanowi ${pct.toFixed(1)}% wszystkich serii planu (${sets} z ${totalWorkingSets}).`,
        });
      } else if (pct >= BALANCE_CONFIG.categoryDominance.warningPercentage) {
        coreWarnings.push({
          code: "CATEGORY_DOMINANCE",
          severity: "notice",
          scope: "plan",
          message: `Wzorzec „${MOVEMENT_CATEGORY_LABELS[cat]}" stanowi ${pct.toFixed(1)}% wszystkich serii planu (${sets} z ${totalWorkingSets}).`,
        });
      }
    }
  }

  // Unilateral absent
  const distinctDayCount = new Set(entries.map((e) => e.dayId)).size;
  if (
    unilEntries === 0 &&
    distinctDayCount >= BALANCE_CONFIG.unilateral.informationalMinimumDays &&
    knownExecSets > 0
  ) {
    coreWarnings.push({
      code: "UNILATERAL_ABSENT",
      severity: "info",
      scope: "plan",
      message: "Plan nie zawiera ćwiczeń jednostronnych (unilateralnych). Przy planie obejmującym więcej niż 2 dni treningowe warto rozważyć ich włączenie.",
    });
  }

  // All volume of a major category concentrated in one day
  for (const wd of weeklyDistribution) {
    if (
      wd.totalSets >= 6 &&
      wd.concentrationPercentage === 100 &&
      wd.daysCount === 1 &&
      (wd.category === "push" || wd.category === "pull" || wd.category === "squat" || wd.category === "hinge")
    ) {
      coreWarnings.push({
        code: "MOVEMENT_CONCENTRATED",
        severity: "info",
        scope: "plan",
        message: `Cała tygodniowa objętość wzorca „${wd.label}" (${wd.totalSets} serii) znajduje się w jednym dniu planu.`,
      });
    }
  }

  // Repeated patterns per day
  for (const day of days) {
    for (const rp of day.repeatedPatterns) {
      coreWarnings.push({
        code: "REPEATED_MOVEMENT_PATTERN",
        severity: "info",
        scope: "day",
        dayId: day.dayId,
        message: `W dniu „${day.dayName ?? `Dzień ${day.dayOrder + 1}`}" znajdują się ${rp.exerciseCount} ćwiczenia o wzorcu „${rp.pattern}" (${rp.workingSets} serii łącznie).`,
      });
    }
  }

  // All isolation
  if (knownTypeSets > 0 && isoSets === knownTypeSets) {
    coreWarnings.push({
      code: "ALL_ISOLATION",
      severity: "notice",
      scope: "plan",
      message: "Wszystkie sklasyfikowane ćwiczenia w planie to ćwiczenia izolowane. Warto rozważyć dodanie ćwiczeń wielostawowych.",
    });
  }

  return {
    summary: { totalWorkingSets, totalExerciseEntries, analysedExerciseEntries, incompleteExerciseEntries },
    balance: { pushPull, squatHinge },
    movementCategories,
    exerciseTypes,
    executionTypes,
    planesOfMotion,
    weeklyDistribution,
    days,
    warnings: [...inputWarnings, ...coreWarnings],
  };
}

// ─── DB loading ────────────────────────────────────────────────────────────────

interface ExerciseMeta {
  id: number;
  name: string;
  movementPattern: string | null;
  movementCategory: string | null;
  exerciseType: string | null;
  execution: string | null;
  planeOfMotion: string | null;
  isActive: boolean;
}

/** Batch-load exercise metadata for a list of IDs.  No N+1 queries. */
export async function loadExerciseMetadata(
  exerciseIds: number[],
): Promise<Map<number, ExerciseMeta>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db
    .select({
      id:              exercisesTable.id,
      name:            exercisesTable.name,
      movementPattern: exercisesTable.movementPattern,
      movementCategory:exercisesTable.movementCategory,
      exerciseType:    exercisesTable.exerciseType,
      execution:       exercisesTable.execution,
      planeOfMotion:   exercisesTable.planeOfMotion,
      isActive:        exercisesTable.isActive,
    })
    .from(exercisesTable)
    .where(inArray(exercisesTable.id, exerciseIds));
  return new Map(rows.map((r) => [r.id, r]));
}

// ─── Input normalization ───────────────────────────────────────────────────────

/**
 * Convert raw input days + pre-fetched exercise metadata into fully resolved
 * NormalizedAnalysisEntry[].  Emits all metadata-completeness warnings.
 * Does NOT hit the database.
 */
export function normalizePlanAnalysisInput(
  days: AnalysisPreviewDay[],
  metaMap: Map<number, ExerciseMeta>,
): { entries: NormalizedAnalysisEntry[]; warnings: AnalysisWarning[] } {
  const entries: NormalizedAnalysisEntry[] = [];
  const warnings: AnalysisWarning[] = [];
  // Track per-exercise warnings to avoid duplicating them across days
  const warnedInactive     = new Set<number>();
  const warnedMissingCat   = new Set<number>();
  const warnedMissingType  = new Set<number>();
  const warnedMissingExec  = new Set<number>();
  const warnedMissingPlane = new Set<number>();

  for (const day of days) {
    const dayOrder = day.dayOrder ?? 0;
    for (const ex of day.exercises) {
      const meta = metaMap.get(ex.exerciseId);

      if (!meta) {
        warnings.push({
          code: "EXERCISE_NOT_FOUND",
          severity: "notice",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          message: `Ćwiczenie ID ${ex.exerciseId} nie zostało znalezione w bibliotece — pominięte w analizie.`,
        });
        continue;
      }

      // Invalid working sets guard
      if (!ex.workingSets || ex.workingSets <= 0 || !Number.isInteger(ex.workingSets)) {
        warnings.push({
          code: "INVALID_WORKING_SETS",
          severity: "notice",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" ma nieprawidłową liczbę serii roboczych (${ex.workingSets}) — pominięte w analizie.`,
        });
        continue;
      }

      // Inactive exercise (warn once per exercise ID, still analyse)
      if (!meta.isActive && !warnedInactive.has(ex.exerciseId)) {
        warnedInactive.add(ex.exerciseId);
        warnings.push({
          code: "INACTIVE_EXERCISE",
          severity: "info",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" jest nieaktywne w bibliotece. Analiza wzorca ruchowego przeprowadzana na podstawie istniejących metadanych.`,
        });
      }

      const resolvedCategory    = normalizeMovementCategory(meta.movementPattern, meta.movementCategory);
      const resolvedSubPattern  = normalizeSubPattern(meta.movementPattern);
      const resolvedExerciseType = normalizeExerciseType(meta.exerciseType);
      const resolvedExecution   = normalizeExecution(meta.execution);
      const resolvedPlane       = normalizePlane(meta.planeOfMotion);

      // Missing movement pattern / category
      if (resolvedCategory === null && !warnedMissingCat.has(ex.exerciseId)) {
        warnedMissingCat.add(ex.exerciseId);
        warnings.push({
          code: "MISSING_MOVEMENT_PATTERN",
          severity: "info",
          scope: "exercise",
          dayId: day.dayId,
          exerciseEntryId: ex.exerciseEntryId,
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" nie ma przypisanego wzorca ruchowego — pominięte w analizie wzorców.`,
        });
      } else if (!meta.movementCategory && resolvedCategory !== null && !warnedMissingCat.has(ex.exerciseId)) {
        warnedMissingCat.add(ex.exerciseId);
        warnings.push({
          code: "MISSING_MOVEMENT_CATEGORY",
          severity: "info",
          scope: "exercise",
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" nie ma pola kategorii ruchowej — kategoria wywnioskowana z wzorca ruchowego.`,
        });
      }

      if (resolvedExerciseType === null && meta.exerciseType === null && !warnedMissingType.has(ex.exerciseId)) {
        warnedMissingType.add(ex.exerciseId);
        warnings.push({
          code: "MISSING_EXERCISE_TYPE",
          severity: "info",
          scope: "exercise",
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" nie ma określonego typu (wielostawowe/izolowane) — pominięte w analizie struktury ćwiczeń.`,
        });
      }

      if (resolvedExecution === null && meta.execution === null && !warnedMissingExec.has(ex.exerciseId)) {
        warnedMissingExec.add(ex.exerciseId);
        warnings.push({
          code: "MISSING_EXECUTION_TYPE",
          severity: "info",
          scope: "exercise",
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" nie ma określonego trybu wykonania (Obustronne (bilateralne) / Jednostronne (unilateralne)) — pominięte w analizie bilateralnej.`,
        });
      }

      if (resolvedPlane === null && meta.planeOfMotion === null && !warnedMissingPlane.has(ex.exerciseId)) {
        warnedMissingPlane.add(ex.exerciseId);
        warnings.push({
          code: "MISSING_PLANE_OF_MOTION",
          severity: "info",
          scope: "exercise",
          exerciseId: ex.exerciseId,
          exerciseName: meta.name,
          message: `Ćwiczenie „${meta.name}" nie ma określonej płaszczyzny ruchu — pominięte w analizie płaszczyzn.`,
        });
      }

      entries.push({
        entryId: ex.exerciseEntryId,
        dayId: day.dayId,
        dayName: day.dayName ?? null,
        dayOrder,
        exerciseId: ex.exerciseId,
        exerciseName: meta.name,
        workingSets: ex.workingSets,
        movementPattern: meta.movementPattern,
        movementCategory: meta.movementCategory,
        resolvedCategory,
        resolvedSubPattern,
        resolvedExerciseType,
        resolvedExecution,
        resolvedPlane,
        exerciseFound: true,
        isActive: meta.isActive,
      });
    }
  }

  return { entries, warnings };
}

// ─── Public entry points ───────────────────────────────────────────────────────

/** Analyse an unsaved draft plan snapshot (same core as analyseSavedPlan). */
export async function analyseDraftPreview(
  input: AnalysisPreviewInput,
): Promise<PlanAnalysisResult> {
  const exerciseIds = [
    ...new Set(input.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
  ];
  const metaMap = await loadExerciseMetadata(exerciseIds);
  const { entries, warnings } = normalizePlanAnalysisInput(input.days, metaMap);
  return calculatePlanAnalysisCore(entries, warnings);
}

/** Analyse a saved plan directly from the database. */
export async function analyseSavedPlan(planId: number): Promise<PlanAnalysisResult> {
  const rows = await db
    .select({
      dayId:           workoutPlanDaysTable.id,
      dayName:         workoutPlanDaysTable.dayName,
      dayOrder:        workoutPlanDaysTable.dayOrder,
      exerciseEntryId: workoutPlanExercisesTable.id,
      exerciseId:      workoutPlanExercisesTable.exerciseId,
      workingSets:     workoutPlanExercisesTable.workingSets,
      orderInDay:      workoutPlanExercisesTable.orderInDay,
    })
    .from(workoutPlanDaysTable)
    .leftJoin(
      workoutPlanExercisesTable,
      eq(workoutPlanExercisesTable.dayId, workoutPlanDaysTable.id),
    )
    .where(eq(workoutPlanDaysTable.planId, planId));

  // Group by day
  const dayMap = new Map<number, AnalysisPreviewDay>();
  for (const row of rows) {
    if (!dayMap.has(row.dayId)) {
      dayMap.set(row.dayId, {
        dayId: row.dayId,
        dayName: row.dayName,
        dayOrder: row.dayOrder,
        exercises: [],
      });
    }
    if (row.exerciseEntryId !== null && row.exerciseId !== null && row.workingSets !== null) {
      dayMap.get(row.dayId)!.exercises.push({
        exerciseEntryId: row.exerciseEntryId,
        exerciseId:      row.exerciseId,
        workingSets:     row.workingSets,
        orderInDay:      row.orderInDay ?? 0,
      });
    }
  }

  const days = [...dayMap.values()];
  const exerciseIds = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const metaMap = await loadExerciseMetadata(exerciseIds);
  const { entries, warnings } = normalizePlanAnalysisInput(days, metaMap);
  return calculatePlanAnalysisCore(entries, warnings);
}
