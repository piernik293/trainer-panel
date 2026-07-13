/**
 * Phase 3A — Weekly Volume Distribution Engine
 *
 * A deterministic, read-only service that:
 *   1. Recommends a split type from experience level + training days.
 *   2. Generates training day names/types for the selected split.
 *   3. Distributes Phase 2 selected weekly volumes across eligible days.
 *   4. Verifies that daily allocations sum exactly to the selected weekly volume.
 *
 * broadCategory → eligible day type mapping (canonical DB values):
 *   "Klatka piersiowa" → push, upper, full_body_a, full_body_b, full_body, custom
 *   "Barki"            → push, upper, full_body_a, full_body_b, full_body, custom
 *   "Triceps"          → push, upper, full_body_a, full_body_b, full_body, custom
 *   "Plecy"            → pull, upper, full_body_a, full_body_b, full_body, custom
 *   "Biceps"           → pull, upper, full_body_a, full_body_b, full_body, custom
 *   "Mięśnie czworogłowe uda" → lower, legs, full_body_a, full_body_b, full_body, custom
 *   "Pośladki"         → lower, legs, full_body_a, full_body_b, full_body, custom
 *   "Łydki"            → lower, legs, full_body_a, full_body_b, full_body, custom
 *   "Przywodziciele"   → lower, legs, full_body_a, full_body_b, full_body, custom
 *   "Mięśnie dwugłowe uda" → lower, legs, full_body_a, full_body_b, full_body, custom
 *   (unknown)          → all day types (with UNKNOWN_TARGET_CATEGORY warning)
 *
 * INVARIANTS:
 *   - No database rows are written.
 *   - No exercises are selected.
 *   - No plan, day, or prescription is created.
 *   - The same input always produces the same result (deterministic).
 *   - Daily allocations operate in 0.5-set increments.
 *   - Sum of allocations per target === selectedWeeklyVolume exactly.
 */

import { eq, and } from "drizzle-orm";
import {
  db,
  volumeTargetsTable,
  volumeGuidelinesTable,
  volumeGuidelineVersionsTable,
} from "@workspace/db";
import {
  type SplitType,
  VALID_EXPERIENCE_LEVELS,
} from "@workspace/api-zod";
import type {
  WeeklyVolumeDistributionResponseType,
  TargetDistributionDecisionType,
  TrainingDayDistributionType,
  TargetDayAllocationType,
  VolumeDistributionWarningType,
} from "@workspace/api-zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VolumeDistributionInput {
  clientId: number;
  experienceLevel: string | null;
  trainingDays: number;
  selectedSplitType: SplitType;
  selectedWeeklyVolumes: Array<{ targetId: number; selectedVolume: number }>;
  priorityTargetIds: number[];
}

interface GuidelineRow {
  targetId: number;
  targetName: string;
  broadCategory: string;
  sessionMin: number;
  sessionMax: number;
}

interface DayTemplate {
  dayIndex: number;
  dayName: string;
  dayType: string;
}

interface DistributeResult {
  allocations: Map<number, number>; // dayIndex → volume
  warnings: VolumeDistributionWarningType[];
}

// ─── Split recommendation ─────────────────────────────────────────────────────

const NO_ACTIVITY = "Brak aktywności fizycznej";
const BEGINNER = "Początkujący";
const INTERMEDIATE = "Średniozaawansowany";
const ADVANCED = "Zaawansowany";

/**
 * Pure function. Returns the engine-recommended split type for the given
 * experience level and training days.
 *
 * specialization and custom are never auto-recommended — they remain
 * trainer-only choices.
 *
 * Returns null (with a blocking warning) when experienceLevel is missing or invalid.
 */
export function recommendSplitType(
  experienceLevel: string | null,
  trainingDays: number,
): { recommended: SplitType | null; warnings: VolumeDistributionWarningType[] } {
  const warnings: VolumeDistributionWarningType[] = [];

  // Validate trainingDays: must be a finite integer in [1, 6]
  if (
    !Number.isFinite(trainingDays) ||
    !Number.isInteger(trainingDays) ||
    trainingDays < 1 ||
    trainingDays > 6
  ) {
    return {
      recommended: null,
      warnings: [
        {
          code: "INVALID_TRAINING_DAYS",
          severity: "error",
          message: `Liczba dni treningowych musi być liczbą całkowitą z zakresu 1–6. Otrzymano: ${trainingDays}.`,
          blocking: true,
        },
      ],
    };
  }

  // Validate experience level
  if (!experienceLevel) {
    return {
      recommended: null,
      warnings: [
        {
          code: "MISSING_EXPERIENCE_LEVEL",
          severity: "error",
          message: "Poziom doświadczenia jest wymagany do obliczenia dystrybucji objętości.",
          blocking: true,
        },
      ],
    };
  }

  if (!(VALID_EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) {
    return {
      recommended: null,
      warnings: [
        {
          code: "INVALID_EXPERIENCE_LEVEL",
          severity: "error",
          message: `Nieznany poziom doświadczenia: "${experienceLevel}". Oczekiwano: ${VALID_EXPERIENCE_LEVELS.join(", ")}.`,
          blocking: true,
        },
      ],
    };
  }

  // High-frequency warnings (non-blocking)
  if (
    (experienceLevel === NO_ACTIVITY) &&
    trainingDays > 3
  ) {
    warnings.push({
      code: "HIGH_FREQUENCY_FOR_NO_ACTIVITY",
      severity: "warning",
      message: `${trainingDays} dni treningowych może być zbyt dużą częstotliwością dla osoby z brakiem aktywności fizycznej. Zaleca się maksymalnie 3 dni.`,
      blocking: false,
    });
  }

  if (experienceLevel === BEGINNER && trainingDays > 4) {
    warnings.push({
      code: "HIGH_FREQUENCY_FOR_BEGINNER",
      severity: "warning",
      message: `${trainingDays} dni treningowych może być zbyt dużą częstotliwością dla osoby na poziomie Początkujący. Zaleca się maksymalnie 4 dni.`,
      blocking: false,
    });
  }

  // MVP recommendation rules
  let recommended: SplitType;

  if (trainingDays === 1) {
    recommended = "full_body";
  } else if (trainingDays === 2) {
    recommended = "full_body_ab";
  } else if (trainingDays === 3) {
    if (experienceLevel === NO_ACTIVITY || experienceLevel === BEGINNER) {
      recommended = "full_body_ab";
    } else {
      // Średniozaawansowany / Zaawansowany
      recommended = "upper_lower_full_body";
    }
  } else if (trainingDays === 4) {
    if (experienceLevel === NO_ACTIVITY || experienceLevel === BEGINNER) {
      recommended = "upper_lower";
    } else {
      recommended = "push_pull_lower_full_body";
    }
  } else if (trainingDays === 5) {
    recommended = "upper_lower_full_body";
  } else {
    // 6 or 7 days
    recommended = "push_pull_legs";
  }

  return { recommended, warnings };
}

// ─── Day templates ────────────────────────────────────────────────────────────

/**
 * Pure function. Returns an ordered list of day descriptors for the given
 * split type and training day count.
 *
 * The number of returned entries always equals trainingDays.
 */
export function getDayTemplate(
  splitType: SplitType,
  trainingDays: number,
): DayTemplate[] {
  const days: DayTemplate[] = [];

  for (let i = 0; i < trainingDays; i++) {
    days.push(makeDayEntry(splitType, i));
  }

  return days;
}

function makeDayEntry(splitType: SplitType, dayIndex: number): DayTemplate {
  switch (splitType) {
    case "full_body":
      return {
        dayIndex,
        dayName: `Full Body ${dayIndex + 1}`,
        dayType: "full_body",
      };

    case "full_body_ab": {
      const isA = dayIndex % 2 === 0;
      return {
        dayIndex,
        dayName: isA ? "Full Body A" : "Full Body B",
        dayType: isA ? "full_body_a" : "full_body_b",
      };
    }

    case "upper_lower": {
      const isUpper = dayIndex % 2 === 0;
      return {
        dayIndex,
        dayName: isUpper ? "Upper" : "Lower",
        dayType: isUpper ? "upper" : "lower",
      };
    }

    case "upper_lower_full_body": {
      const cycle = dayIndex % 3;
      if (cycle === 0) return { dayIndex, dayName: "Upper", dayType: "upper" };
      if (cycle === 1) return { dayIndex, dayName: "Lower", dayType: "lower" };
      return { dayIndex, dayName: "Full Body", dayType: "full_body" };
    }

    case "push_pull_legs": {
      const cycle = dayIndex % 3;
      if (cycle === 0) return { dayIndex, dayName: "Push", dayType: "push" };
      if (cycle === 1) return { dayIndex, dayName: "Pull", dayType: "pull" };
      return { dayIndex, dayName: "Legs", dayType: "legs" };
    }

    case "push_pull_lower_full_body": {
      const cycle = dayIndex % 4;
      if (cycle === 0) return { dayIndex, dayName: "Push", dayType: "push" };
      if (cycle === 1) return { dayIndex, dayName: "Pull", dayType: "pull" };
      if (cycle === 2) return { dayIndex, dayName: "Lower", dayType: "lower" };
      return { dayIndex, dayName: "Full Body", dayType: "full_body" };
    }

    case "specialization":
      // Day names show "Specialization Day N" but dayType stays "full_body"
      // so eligibility rules treat them as full-body days in Phase 3A.
      // (SPECIALIZATION_REQUIRES_EXERCISE_PHASE warning added separately)
      return {
        dayIndex,
        dayName: `Specialization Day ${dayIndex + 1}`,
        dayType: "full_body",
      };

    case "custom":
      return {
        dayIndex,
        dayName: `Custom Day ${dayIndex + 1}`,
        dayType: "custom",
      };
  }
}

// ─── broadCategory → eligible day types ──────────────────────────────────────

/**
 * The canonical eligible day-type sets per broadCategory (Polish DB values).
 *
 * "Push" categories: Klatka piersiowa, Barki, Triceps
 * "Pull" categories: Plecy, Biceps
 * "Lower" categories: Mięśnie czworogłowe uda, Pośladki, Łydki, Przywodziciele, Mięśnie dwugłowe uda
 *
 * Full body and A/B days are always eligible for all targets.
 * Custom days are always eligible for all targets.
 */
const PUSH_ELIGIBLE: ReadonlySet<string> = new Set([
  "push", "upper", "full_body_a", "full_body_b", "full_body", "custom",
]);

const PULL_ELIGIBLE: ReadonlySet<string> = new Set([
  "pull", "upper", "full_body_a", "full_body_b", "full_body", "custom",
]);

const LOWER_ELIGIBLE: ReadonlySet<string> = new Set([
  "lower", "legs", "full_body_a", "full_body_b", "full_body", "custom",
]);

const ALL_ELIGIBLE: ReadonlySet<string> = new Set([
  "push", "pull", "upper", "lower", "legs",
  "full_body_a", "full_body_b", "full_body", "custom",
]);

const PUSH_CATEGORIES = new Set(["Klatka piersiowa", "Barki", "Triceps"]);
const PULL_CATEGORIES = new Set(["Plecy", "Biceps"]);
const LOWER_CATEGORIES = new Set([
  "Mięśnie czworogłowe uda",
  "Pośladki",
  "Łydki",
  "Przywodziciele",
  "Mięśnie dwugłowe uda",
]);

/**
 * Pure function. Returns the set of eligible day types for a given broadCategory.
 * Returns ALL_ELIGIBLE for any unrecognised broadCategory.
 */
export function getEligibleDayTypes(broadCategory: string): ReadonlySet<string> {
  if (PUSH_CATEGORIES.has(broadCategory)) return PUSH_ELIGIBLE;
  if (PULL_CATEGORIES.has(broadCategory)) return PULL_ELIGIBLE;
  if (LOWER_CATEGORIES.has(broadCategory)) return LOWER_ELIGIBLE;
  return ALL_ELIGIBLE; // unknown → all days (UNKNOWN_TARGET_CATEGORY warning added by caller)
}

// ─── Distribution algorithm ───────────────────────────────────────────────────

/**
 * Pure function. Distributes `weeklyVolume` (in 0.5-set units) across
 * `eligibleDayIndices` using the largest-remainder algorithm operating
 * entirely in half-units to avoid floating-point sum errors.
 *
 * Guarantees:
 *   sum(allocations.values()) === weeklyVolume   (exact)
 *   Every allocation is a multiple of 0.5
 *   Deterministic: first `extra` eligible days (sorted by day index) receive +0.5
 *   sessionMax respected when mathematically possible
 *   sessionMin violations flagged (allocation is NOT inflated)
 *   If no eligible days → use allDayIndices + TARGET_WITHOUT_ELIGIBLE_DAY warning
 */
export function distributeTargetVolume(params: {
  weeklyVolume: number;
  eligibleDayIndices: number[];   // sorted ascending
  allDayIndices: number[];        // sorted ascending — fallback if eligible is empty
  sessionMax: number;
  sessionMin: number;
}): DistributeResult {
  const { weeklyVolume, allDayIndices, sessionMax, sessionMin } = params;
  const warnings: VolumeDistributionWarningType[] = [];

  // Determine effective day set
  let dayIndices = params.eligibleDayIndices;
  let noEligibleDay = false;
  if (dayIndices.length === 0) {
    dayIndices = allDayIndices;
    noEligibleDay = true;
  }

  const allocations = new Map<number, number>();
  for (const idx of dayIndices) allocations.set(idx, 0);

  if (weeklyVolume === 0) {
    if (noEligibleDay) {
      warnings.push({
        code: "TARGET_WITHOUT_ELIGIBLE_DAY",
        severity: "warning",
        message: "Brak dnia treningowego odpowiedniego dla tej partii mięśni. Objętość rozproszona po wszystkich dniach.",
        blocking: false,
      });
    }
    return { allocations, warnings };
  }

  if (noEligibleDay) {
    warnings.push({
      code: "TARGET_WITHOUT_ELIGIBLE_DAY",
      severity: "warning",
      message: "Brak dnia treningowego odpowiedniego dla tej partii mięśni. Objętość rozproszona po wszystkich dniach.",
      blocking: false,
    });
  }

  // Work in half-units (integers) to avoid floating-point accumulation errors
  const halfTotal = Math.round(weeklyVolume * 2);
  const N = dayIndices.length;
  const halfMax = Math.round(sessionMax * 2);
  const halfMin = Math.round(sessionMin * 2);

  // Check whether sessionMax can be respected
  const sessionMaxExceeded = N * halfMax < halfTotal;
  if (sessionMaxExceeded) {
    warnings.push({
      code: "TARGET_SESSION_MAX_EXCEEDED",
      severity: "warning",
      message: `Tygodniowa objętość ${weeklyVolume} nie mieści się w limicie sesji ${sessionMax} przy ${N} kwalifikowanych dniach. Dystrybucja równomierna bez limitu.`,
      blocking: false,
    });
  }

  // Largest-remainder distribution
  const base = Math.floor(halfTotal / N);
  const extra = halfTotal % N;

  let sessionBelowMin = false;

  for (let i = 0; i < N; i++) {
    const halfAlloc = base + (i < extra ? 1 : 0);
    const alloc = halfAlloc / 2;
    allocations.set(dayIndices[i]!, alloc);

    if (alloc > 0 && halfAlloc < halfMin) {
      sessionBelowMin = true;
    }
  }

  if (sessionBelowMin) {
    warnings.push({
      code: "TARGET_SESSION_BELOW_MIN",
      severity: "notice",
      message: `Przynajmniej jedna sesja ma przydział poniżej minimalnego ${sessionMin} serii. Wartość nie jest korygowana.`,
      blocking: false,
    });
  }

  return { allocations, warnings };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Async main entry point. Loads target metadata + session limits from the DB,
 * runs split recommendation, generates day templates, distributes volume.
 *
 * PERFORMS ZERO DATABASE WRITES.
 */
export async function calculateVolumeDistribution(
  input: VolumeDistributionInput,
): Promise<WeeklyVolumeDistributionResponseType> {
  const {
    experienceLevel,
    trainingDays,
    selectedSplitType,
    selectedWeeklyVolumes,
    priorityTargetIds,
  } = input;

  const globalWarnings: VolumeDistributionWarningType[] = [];

  // ── 1. Validate & recommend split ────────────────────────────────────────────

  const { recommended, warnings: splitWarnings } = recommendSplitType(
    experienceLevel,
    trainingDays,
  );

  globalWarnings.push(...splitWarnings);

  if (!recommended) {
    // Blocking: cannot proceed without valid experience level
    return {
      recommendedSplitType: "full_body", // placeholder
      selectedSplitType,
      trainingDays,
      days: [],
      targetDecisions: [],
      warnings: globalWarnings,
      hasBlockingIssues: true,
    };
  }

  // Warn if trainer-selected split differs from recommendation
  if (selectedSplitType !== recommended) {
    globalWarnings.push({
      code: "SPLIT_DIFFERS_FROM_RECOMMENDATION",
      severity: "notice",
      message: `Wybrany podział (${selectedSplitType}) różni się od zalecanego (${recommended}).`,
      blocking: false,
    });
  }

  // Specialization / custom split warnings
  if (selectedSplitType === "specialization") {
    globalWarnings.push({
      code: "SPECIALIZATION_REQUIRES_EXERCISE_PHASE",
      severity: "notice",
      message: "Plan specjalizacyjny w fazie 3A traktowany jest jak Full Body. Szczegółowy przydział ćwiczeń zostanie skonfigurowany w kolejnej fazie.",
      blocking: false,
    });
  }
  if (selectedSplitType === "custom") {
    globalWarnings.push({
      code: "CUSTOM_SPLIT_REQUIRES_TRAINER_REVIEW",
      severity: "notice",
      message: "Własny podział wymaga ręcznej weryfikacji przydziału ćwiczeń przez trenera.",
      blocking: false,
    });
  }

  // ── 2. Generate day templates ─────────────────────────────────────────────────

  const dayTemplates = getDayTemplate(selectedSplitType, trainingDays);
  const allDayIndices = dayTemplates.map((d) => d.dayIndex);

  // ── 3. Load guidelines from DB ────────────────────────────────────────────────

  const activeVersion = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .limit(1);

  if (activeVersion.length === 0) {
    return {
      recommendedSplitType: recommended,
      selectedSplitType,
      trainingDays,
      days: [],
      targetDecisions: [],
      warnings: [
        ...globalWarnings,
        {
          code: "MISSING_EXPERIENCE_LEVEL",
          severity: "error",
          message: "Brak aktywnej wersji wytycznych objętości.",
          blocking: true,
        },
      ],
      hasBlockingIssues: true,
    };
  }

  const versionId = activeVersion[0]!.id;

  const guidelineRows = await db
    .select({
      targetId: volumeTargetsTable.id,
      targetName: volumeTargetsTable.name,
      broadCategory: volumeTargetsTable.broadCategory,
      sessionMin: volumeGuidelinesTable.sessionMin,
      sessionMax: volumeGuidelinesTable.sessionMax,
    })
    .from(volumeGuidelinesTable)
    .innerJoin(
      volumeTargetsTable,
      eq(volumeGuidelinesTable.volumeTargetId, volumeTargetsTable.id),
    )
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, versionId),
        eq(volumeGuidelinesTable.experienceLevel, experienceLevel!),
        eq(volumeTargetsTable.isActive, true),
      ),
    );

  const guidelineByTargetId = new Map<number, GuidelineRow>(
    guidelineRows.map((r): [number, GuidelineRow] => [
      r.targetId,
      {
        targetId: r.targetId,
        targetName: r.targetName,
        broadCategory: r.broadCategory,
        sessionMin: Number(r.sessionMin),
        sessionMax: Number(r.sessionMax),
      },
    ]),
  );

  // ── 4. Build per-target distribution decisions ────────────────────────────────

  const targetDecisions: TargetDistributionDecisionType[] = [];

  // Build day-level buckets: dayIndex → list of allocations
  const dayAllocations = new Map<number, TargetDayAllocationType[]>();
  for (const t of dayTemplates) dayAllocations.set(t.dayIndex, []);

  for (const entry of selectedWeeklyVolumes) {
    const gl = guidelineByTargetId.get(entry.targetId);
    if (!gl) {
      // Unknown target — skip (route validates that all IDs are known)
      continue;
    }

    const targetWarnings: VolumeDistributionWarningType[] = [];
    const priorityOrder = getPriorityOrder(entry.targetId, priorityTargetIds);

    // Find eligible day indices
    const eligibleTypes = getEligibleDayTypes(gl.broadCategory);
    const isUnknownCategory =
      !PUSH_CATEGORIES.has(gl.broadCategory) &&
      !PULL_CATEGORIES.has(gl.broadCategory) &&
      !LOWER_CATEGORIES.has(gl.broadCategory);

    if (isUnknownCategory) {
      targetWarnings.push({
        code: "UNKNOWN_TARGET_CATEGORY",
        severity: "warning",
        message: `Nieznana kategoria partii mięśni "${gl.broadCategory}". Objętość rozproszona po wszystkich dniach.`,
        blocking: false,
      });
    }

    const eligibleDayIndices = allDayIndices.filter((idx) => {
      const dayType = dayTemplates[idx]!.dayType;
      return eligibleTypes.has(dayType);
    });

    // Distribute volume across eligible days
    const { allocations, warnings: distWarnings } = distributeTargetVolume({
      weeklyVolume: entry.selectedVolume,
      eligibleDayIndices,
      allDayIndices,
      sessionMax: gl.sessionMax,
      sessionMin: gl.sessionMin,
    });

    targetWarnings.push(...distWarnings);

    // Build allocation list
    const allocationList: TargetDayAllocationType[] = [];
    let allocatedWeeklyTotal = 0;

    for (const [dayIdx, vol] of allocations) {
      allocationList.push({
        targetId: gl.targetId,
        targetName: gl.targetName,
        dayIndex: dayIdx,
        allocatedVolume: vol,
      });
      allocatedWeeklyTotal = roundHalf(allocatedWeeklyTotal + vol);

      // Add to day bucket
      if (vol > 0) {
        dayAllocations.get(dayIdx)?.push({
          targetId: gl.targetId,
          targetName: gl.targetName,
          dayIndex: dayIdx,
          allocatedVolume: vol,
        });
      }
    }

    // Sort allocations by day index for consistency
    allocationList.sort((a, b) => a.dayIndex - b.dayIndex);

    targetDecisions.push({
      targetId: gl.targetId,
      targetName: gl.targetName,
      broadCategory: gl.broadCategory,
      weeklySelectedVolume: entry.selectedVolume,
      allocatedWeeklyTotal,
      allocations: allocationList,
      sessionMin: gl.sessionMin,
      sessionMax: gl.sessionMax,
      priorityOrder,
      warnings: targetWarnings,
    });
  }

  // ── 5. Build TrainingDayDistribution view ─────────────────────────────────────

  const days: TrainingDayDistributionType[] = dayTemplates.map((tmpl) => {
    const dayAllocs = dayAllocations.get(tmpl.dayIndex) ?? [];
    const totalEffectiveTargetVolume = roundHalf(
      dayAllocs.reduce((sum, a) => sum + a.allocatedVolume, 0),
    );
    return {
      dayIndex: tmpl.dayIndex,
      dayName: tmpl.dayName,
      dayType: tmpl.dayType,
      targetAllocations: dayAllocs,
      totalEffectiveTargetVolume,
    };
  });

  const hasBlockingIssues = globalWarnings.some((w) => w.blocking);

  return {
    recommendedSplitType: recommended,
    selectedSplitType,
    trainingDays,
    days,
    targetDecisions,
    warnings: globalWarnings,
    hasBlockingIssues,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriorityOrder(
  targetId: number,
  priorityTargetIds: number[],
): number | null {
  const idx = priorityTargetIds.indexOf(targetId);
  return idx === -1 ? null : idx + 1;
}

/**
 * Round to nearest 0.5 using integer arithmetic (avoids floating-point drift).
 */
function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
