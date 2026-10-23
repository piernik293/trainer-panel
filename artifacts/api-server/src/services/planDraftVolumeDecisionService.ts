/**
 * Phase 2 — Weekly Volume Target Decision Engine
 *
 * A deterministic service that, given Phase 1 inputs and trainer preferences,
 * recommends a starting weekly effective volume for all 11 existing targets.
 *
 * Volume thresholds (three distinct boundaries per target per level):
 *   preferredMin  = roundToHalf(max(1, weeklyPreferredCeiling × 0.50))
 *                   MVP computed floor — not stored in the DB, derived from existing data.
 *   preferredMax  = weeklyPreferredCeiling   (upper bound of the preferred zone)
 *   absoluteMax   = weeklyAbsoluteCeiling    (hard safety ceiling)
 *
 * Unified initial proposal rule: recommendedValue = weeklyAbsoluteCeiling
 * for all four experience levels. Recovery, availability, priority and
 * old preferred-range position are informational only; none reduce the value.
 * Trainer overrides in Zone D (above absoluteMax) are accepted with a
 * non-blocking warning. Zone A (below preferredMin) is the only rejection.
 *
 * Calculation order per target:
 *  1. Derive preferredMin / preferredMax / absoluteMax
 *  2. Base value = absoluteMax (unified rule, all levels)
 *  3. Priority — informational only
 *  4. Excluded-group rule — set to preferredMin
 *  5. Recovery — informational only (no numerical reduction)
 *  6. Availability — informational only (no numerical reduction)
 *  7. Clamp to [preferredMin, absoluteMax]
 *  8. Round to whole integer → recommendedValue
 *  9. Apply trainer override per four-zone policy
 * 10. Final assembly
 *
 * INVARIANTS:
 *  - No database rows are written.
 *  - No volume is distributed across training days.
 *  - No exercises are selected.
 *  - No plan is created or activated.
 *  - The same input always produces the same result (no randomness).
 *  - The existing Volume Calculator (computeVolumeCore) is not modified.
 */

import { eq, and } from "drizzle-orm";
import {
  db,
  volumeTargetsTable,
  volumeGuidelinesTable,
  volumeGuidelineVersionsTable,
} from "@workspace/db";
import {
  PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_RANGE_POSITIONS,
  type WeeklyVolumeTargetDecisionType,
  type WeeklyVolumeDecisionResponseType,
  type RecoveryProfile,
} from "@workspace/api-zod";
import { mapToGuidelineLevel } from "./volumeCalculator";

// ─── Target display order ─────────────────────────────────────────────────────

const TARGET_ORDER: string[] = [
  "Mięsień czworogłowy uda",
  "Mięśnie pośladkowe",
  "Mięsień trójgłowy łydki",
  "Przywodziciele",
  "Grupa kulszowo-goleniowa",
  "Mięśnie naramienne",
  "Mięsień trójgłowy ramienia",
  "Mięsień piersiowy większy",
  "Mięsień najszerszy grzbietu",
  "Mięsień czworoboczny grzbietu",
  "Mięsień dwugłowy ramienia",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TargetRecord {
  id: number;
  name: string;
  broadCategory: string;
  isActive: boolean;
}

/**
 * Three distinct volume thresholds loaded from the DB and the MVP computed floor.
 *
 *   preferredMin  — MVP computed floor: roundToHalf(max(1, weeklyPreferredCeiling × 0.50))
 *                   Rationale: no weeklyPreferredFloor exists in the schema.
 *                   This deterministic formula produces a safe lower anchor from the existing data.
 *                   It is a product rule, not a new database guideline row.
 *
 *   preferredMax  — weeklyPreferredCeiling from the DB.
 *                   Automatic recommendations are bounded by this value.
 *
 *   absoluteMax   — weeklyAbsoluteCeiling from the DB.
 *                   Hard safety ceiling. Trainer overrides above this are rejected.
 */
export interface GuidelineRecord {
  targetId: number;
  preferredMin: number;
  preferredMax: number;
  absoluteMax: number;
}

export interface DecisionInput {
  clientId: number;
  experienceLevel: string | null;
  priorityMuscleGroups: string[];
  excludedMuscleGroups: string[];
  sleep: number | null;
  stress: number | null;
  physicalWork: boolean;
  dailyActivity: string | null;
  recoveryQuality: string | null;
  trainingDays: number;
  sessionDuration: number;
  trainerOverrides: Record<string, number>;
}

// ─── Round to 0.5 precision ───────────────────────────────────────────────────

export function round05(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Round to nearest whole integer for planned volume values shown to the trainer.
 * Internal effective-volume (effectiveSets, coefficients) may remain decimal.
 */
export function roundInt(value: number): number {
  return Math.round(value);
}

// ─── Preferred floor formula ──────────────────────────────────────────────────

/**
 * MVP computed preferred floor.
 *
 * Formula: roundToHalf(max(1, weeklyPreferredCeiling × 0.50))
 *
 * This derives a lower bound from existing DB data without a schema change.
 * It is a deterministic product rule applied uniformly to all targets and levels.
 *
 * Examples:
 *   ceiling  4 → floor  2
 *   ceiling  8 → floor  4
 *   ceiling 12 → floor  6
 *   ceiling 16 → floor  8
 *   ceiling 20 → floor 10
 */
export function computePreferredFloor(weeklyPreferredCeiling: number): number {
  return roundInt(Math.max(1, weeklyPreferredCeiling * 0.50));
}

// ─── Text normalization ───────────────────────────────────────────────────────

/**
 * Normalize a muscle group name for robust matching.
 *
 * Steps applied in order:
 *  1. Unicode NFD decomposition (separates diacritics from base letters)
 *  2. Strip combining diacritic marks (removes Polish accents)
 *  3. Lowercase
 *  4. Trim leading/trailing whitespace
 *  5. Collapse repeated internal whitespace to a single space
 *
 * Examples:
 *   "Mięśnie naramienne"  → "miesnie naramienne"
 *   "MIĘŚNIE NARAMIENNE"  → "miesnie naramienne"
 *   "mięśnie   naramienne" → "miesnie naramienne"
 *   "Miesnie naramienne"  → "miesnie naramienne"  (already ASCII)
 */
export function normalizeText(s: string): string {
  return (
    s
      // Ł/ł does not decompose via Unicode NFD (it is a full letter, not base + combining mark).
      // Pre-replace before the NFD strip so "Lydki" and "Łydki" normalize identically.
      .replace(/[Łł]/g, "l")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
  );
}

// ─── Group resolution ─────────────────────────────────────────────────────────

type ResolveStatus = "found" | "ambiguous" | "unknown";

/**
 * Resolve a muscle group name to matching target IDs using a strict hierarchy:
 *
 *  1. Exact normalized broadCategory match → any number of IDs (e.g. "Plecy" → [9,10])
 *  2. Exact normalized target-name match
 *  3. Controlled partial match — only when EXACTLY ONE target matches; 2+ → ambiguous
 *  4. Ambiguous (multiple partial matches) → no IDs, status='ambiguous'
 *  5. Unknown (no matches at any level) → no IDs, status='unknown'
 *
 * Duplicate broadCategory matches (step 1) are legitimate and intentional.
 */
function resolveGroup(
  muscleGroup: string,
  targets: TargetRecord[],
): { ids: number[]; status: ResolveStatus } {
  if (!muscleGroup?.trim()) return { ids: [], status: "unknown" };

  const q = normalizeText(muscleGroup);

  // Step 1: exact normalized broadCategory
  const exactBroad = targets.filter((t) => normalizeText(t.broadCategory) === q);
  if (exactBroad.length > 0) return { ids: exactBroad.map((t) => t.id), status: "found" };

  // Step 2: exact normalized target name
  const exactName = targets.filter((t) => normalizeText(t.name) === q);
  if (exactName.length > 0) return { ids: exactName.map((t) => t.id), status: "found" };

  // Step 3: controlled partial match
  const partial = targets.filter((t) => {
    const nb = normalizeText(t.broadCategory);
    const nn = normalizeText(t.name);
    return nb.includes(q) || q.includes(nb) || nn.includes(q) || q.includes(nn);
  });
  if (partial.length === 1) return { ids: [partial[0]!.id], status: "found" };
  if (partial.length > 1) return { ids: [], status: "ambiguous" };

  return { ids: [], status: "unknown" };
}

// ─── Muscle group → target matching ──────────────────────────────────────────

/**
 * Match a muscle group name to volume target IDs.
 *
 * Uses the five-step resolution hierarchy with diacritic normalization.
 * Returns empty array for ambiguous and unknown inputs (no silent assignment).
 */
export function matchMuscleGroupToTargetIds(
  muscleGroup: string,
  targets: TargetRecord[],
): number[] {
  return resolveGroup(muscleGroup, targets).ids;
}

// ─── Priority order for a target ─────────────────────────────────────────────

/**
 * Returns 1, 2, 3, or null indicating whether this target is a priority target
 * and at what priority position. First occurrence wins for duplicates.
 */
export function getPriorityOrder(
  targetId: number,
  priorityMuscleGroups: string[],
  targets: TargetRecord[],
): 1 | 2 | 3 | null {
  for (let i = 0; i < Math.min(priorityMuscleGroups.length, 3); i++) {
    const matched = matchMuscleGroupToTargetIds(priorityMuscleGroups[i]!, targets);
    if (matched.includes(targetId)) return (i + 1) as 1 | 2 | 3;
  }
  return null;
}

/**
 * Returns true if this target is in the excluded muscle groups.
 */
export function isExcludedTarget(
  targetId: number,
  excludedMuscleGroups: string[],
  targets: TargetRecord[],
): boolean {
  for (const group of excludedMuscleGroups) {
    if (matchMuscleGroupToTargetIds(group, targets).includes(targetId)) return true;
  }
  return false;
}

// ─── Availability classification ──────────────────────────────────────────────

export type AvailabilityLevel = "short" | "standard" | "high";

export function classifyAvailability(
  trainingDays: number,
  sessionDuration: number,
): AvailabilityLevel {
  if (trainingDays <= 2 || sessionDuration < 45) return "short";
  if (trainingDays >= 5 && sessionDuration >= 60) return "high";
  return "standard";
}

// ─── Single-target decision ───────────────────────────────────────────────────

export interface RecoveryProfileResult {
  profile: RecoveryProfile;
  hasData: boolean;
  factors: string[];
}

export interface SingleTargetDecisionInput {
  target: TargetRecord;
  guideline: GuidelineRecord | null;
  experienceLevel: string | null;
  priorityOrder: 1 | 2 | 3 | null;
  /**
   * How many targets share this priority slot via a broad category match.
   * When "Plecy" → [latissimus, trapezius], both share the same slot (size=2).
   * The priority bonus is divided by this value so the total bonus applied per
   * category equals one full bonus, not N independent bonuses.
   * Defaults to 1 (single-target priority — no change to existing behaviour).
   */
  priorityGroupSize?: number;
  isExcluded: boolean;
  recoveryResult: RecoveryProfileResult;
  availability: AvailabilityLevel;
  trainerOverride: number | null;
}

/**
 * Compute the weekly volume decision for a single target.
 * Pure function — no DB access.
 *
 * Trainer override zones:
 *   A. ov < preferredMin              → rejected, VOLUME_OVERRIDE_BELOW_MIN
 *   B. preferredMin ≤ ov ≤ preferredMax → accepted, no warning
 *   C. preferredMax < ov ≤ absoluteMax → accepted, VOLUME_OVERRIDE_ABOVE_PREFERRED (non-blocking)
 *   D. ov > absoluteMax               → accepted, VOLUME_OVERRIDE_ABOVE_ABSOLUTE_MAX (non-blocking)
 *
 * Never silently clamps — rejected values keep selectedValue = recommendedValue.
 */
export function computeTargetDecision(
  inp: SingleTargetDecisionInput,
): WeeklyVolumeTargetDecisionType {
  const warnings: WeeklyVolumeTargetDecisionType["warnings"] = [];
  const reasons: string[] = [];

  // ── 1. Load thresholds ────────────────────────────────────────────────────
  const preferredMin = inp.guideline?.preferredMin ?? 0;
  const preferredMax = inp.guideline?.preferredMax ?? 0;
  const absoluteMax = inp.guideline?.absoluteMax ?? 0;

  // ── 2. Base position — unified rule ──────────────────────────────────────
  //
  // All experience levels (including "Brak aktywności fizycznej") start from
  // weeklyAbsoluteCeiling. Recovery and availability are informational only;
  // they do not numerically reduce the initial proposal in this pass.
  reasons.push(`poziom doświadczenia: ${inp.experienceLevel ?? "brak"}`);
  reasons.push(
    `propozycja startuje od maksymalnej rekomendowanej objętości tygodniowej (${absoluteMax} pkt.)`,
  );
  const baseValue = absoluteMax;

  // ── 3. Priority — informational only ─────────────────────────────────────
  // The proposal already starts at absoluteMax; no upward bonus is added.
  // Priority badges and tier labels remain visible for trainer reference.
  const isPriorityEligible =
    inp.experienceLevel !== null &&
    inp.experienceLevel !== undefined &&
    PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS.has(inp.experienceLevel);

  if (isPriorityEligible && inp.priorityOrder !== null && !inp.isExcluded) {
    const tierLabel = inp.priorityOrder === 1 ? "A" : "B";
    const priorityOrdinal =
      inp.priorityOrder === 1 ? "pierwszy" : inp.priorityOrder === 2 ? "drugi" : "trzeci";
    reasons.push(`Tier ${tierLabel}: ${priorityOrdinal} priorytet klienta`);
  } else if (!isPriorityEligible && inp.priorityOrder !== null && !inp.isExcluded) {
    reasons.push(
      `preferencja mięśniowa zapisana, lecz niezastosowana — poziom "${inp.experienceLevel ?? "brak"}" → ogólny rozwój (Tier C)`,
    );
  }

  // ── 4. Excluded adjustment ────────────────────────────────────────────────
  let afterExcluded = baseValue;
  if (inp.isExcluded) {
    afterExcluded = preferredMin;
    reasons.push("partia zdepriorytetowana przez trenera");
    warnings.push({
      code: "TARGET_DEPRIORITIZED_BY_TRAINER",
      severity: "notice",
      message: `"${inp.target.name}" zostaje ustawiony na dolną granicę zakresu zalecanego.`,
      blocking: false,
    });
  }

  // ── 5. Recovery — informational only ─────────────────────────────────────
  // Recovery profile is recorded for trainer reference but does not reduce
  // the initial proposal numerically.
  if (inp.recoveryResult.profile === "reduced") {
    reasons.push(
      `regeneracja wymaga monitorowania podczas realizacji planu (${inp.recoveryResult.factors.slice(0, 2).join(", ")})`,
    );
  } else if (inp.recoveryResult.profile === "good") {
    reasons.push("dobra regeneracja");
  } else if (!inp.recoveryResult.hasData) {
    reasons.push("brak danych regeneracji");
  }

  // ── 6. Availability — informational only ─────────────────────────────────
  // Availability is recorded for trainer reference but does not reduce the
  // initial proposal numerically.
  if (inp.availability === "short" && inp.priorityOrder === null && !inp.isExcluded) {
    reasons.push("ograniczona dostępność treningowa — do uwzględnienia w harmonogramie");
  } else if (inp.availability === "high") {
    reasons.push("dobra dostępność treningowa");
  } else if (inp.availability === "standard") {
    reasons.push("standardowa dostępność treningowa");
  }

  // ── 7. Clamp ──────────────────────────────────────────────────────────────
  // All levels: clamp to [preferredMin, absoluteMax].
  // With no reductions applied, non-excluded targets clamp to absoluteMax.
  const clampMax = absoluteMax;
  const preClamp = afterExcluded;
  let clamped = Math.max(preferredMin, Math.min(clampMax, preClamp));
  if (clamped !== preClamp && !inp.isExcluded) {
    warnings.push({
      code: "VOLUME_TARGET_CLAMPED",
      severity: "info",
      message: `Wartość dla "${inp.target.name}" przycięta do zakresu [${preferredMin}–${clampMax}].`,
      blocking: false,
    });
  }

  // ── 8. Round to whole integer ─────────────────────────────────────────────
  let recommendedValue = roundInt(clamped);
  // Edge case: rounding pushed outside range — re-clamp
  if (recommendedValue < preferredMin) recommendedValue = preferredMin;
  if (recommendedValue > clampMax)      recommendedValue = clampMax;

  const reasonLower = Math.floor(absoluteMax * 0.75) + 1;
  reasons.push(`propozycja: ${recommendedValue} pkt. (zakres ${reasonLower}–${absoluteMax})`);

  // ── 9. Trainer override — four-zone policy ────────────────────────────────
  //
  //   A. ov < preferredMin              → rejected
  //   B. preferredMin ≤ ov ≤ preferredMax → accepted, no warning
  //   C. preferredMax < ov ≤ absoluteMax  → accepted, non-blocking warning
  //   D. ov > absoluteMax               → rejected
  //
  // Never silently clamp. Rejected values keep selectedValue = recommendedValue.
  let selectedValue = recommendedValue;
  let trainerOverrideClean: number | null = null;
  let isOverridden = false;

  if (inp.trainerOverride !== null) {
    const ov = inp.trainerOverride;

    if (!Number.isInteger(ov)) {
      // Non-integer — rejected; trainer must supply a whole number
      warnings.push({
        code: "VOLUME_OVERRIDE_NOT_INTEGER",
        severity: "warning",
        message: `Ustawienie trenera (${ov}) musi być liczbą całkowitą. Wartość nie została zastosowana.`,
        blocking: false,
        suggestedAction: `Wprowadź pełną liczbę całkowitą.`,
      });
      trainerOverrideClean = ov;

    } else if (ov < preferredMin) {
      // Zone A — rejected
      warnings.push({
        code: "VOLUME_OVERRIDE_BELOW_MIN",
        severity: "warning",
        message: `Ustawienie trenera (${ov}) jest poniżej minimalnego zakresu zalecanego (${preferredMin}). Wartość nie została zastosowana.`,
        blocking: false,
        suggestedAction: `Ustaw wartość w zakresie zalecanym ${preferredMin}–${preferredMax} lub poniżej limitu absolutnego ${absoluteMax}.`,
      });
      trainerOverrideClean = ov;

    } else if (ov <= preferredMax) {
      // Zone B — accepted, no warning (already integer)
      selectedValue = ov;
      trainerOverrideClean = ov;
      isOverridden = true;

    } else if (ov <= absoluteMax) {
      // Zone C — accepted, non-blocking warning (already integer)
      selectedValue = ov;
      trainerOverrideClean = ov;
      isOverridden = true;
      warnings.push({
        code: "VOLUME_OVERRIDE_ABOVE_PREFERRED",
        severity: "warning",
        message: `Ustawienie trenera (${ov}) przekracza zakres zalecany (${preferredMax}), ale pozostaje poniżej limitu absolutnego (${absoluteMax}). Wartość została zastosowana.`,
        blocking: false,
        suggestedAction: `Zakres zalecany to ${preferredMin}–${preferredMax} serii/tydz.`,
      });

    } else {
      // Zone D — accepted with non-blocking overtraining warning.
      // weeklyAbsoluteCeiling is not a hard input maximum; percentage-based
      // status (overtraining_warning) informs the trainer visually.
      selectedValue = ov;
      trainerOverrideClean = ov;
      isOverridden = true;
      warnings.push({
        code: "VOLUME_OVERRIDE_ABOVE_ABSOLUTE_MAX",
        severity: "warning",
        message: `Ustawienie trenera (${ov}) przekracza limit absolutny (${absoluteMax}). Wartość została zastosowana — ryzyko przetrenowania.`,
        blocking: false,
        suggestedAction: `Maks. rekomendowana objętość tygodniowa to ${absoluteMax} serii/tydz.`,
      });
    }
  }

  // ── 10. Final assembly ────────────────────────────────────────────────────
  return {
    targetId: inp.target.id,
    targetName: inp.target.name,
    experienceLevel: inp.experienceLevel,
    preferredMin,
    preferredMax,
    absoluteMax,
    rangePosition: 1.0,
    baseValue: roundInt(baseValue),
    priorityAdjustment: 0,
    recoveryAdjustment: 0,
    availabilityAdjustment: 0,
    recommendedValue,
    selectedValue,
    trainerOverride: trainerOverrideClean,
    source: isOverridden ? "trainer_override" : "calculated",
    priorityOrder: inp.priorityOrder,
    isExcluded: inp.isExcluded,
    isOverridden,
    reasons,
    warnings,
  };
}

// ─── Recovery profile ─────────────────────────────────────────────────────────

/**
 * Compute a recovery profile from lifestyle survey data.
 *
 * Rules:
 *  - recoveryQuality is the strongest signal (weight: 2)
 *  - sleep, stress, physicalWork, dailyActivity each contribute weight: 1
 *  - Missing data → no adjustment, non-blocking MISSING_RECOVERY_DATA warning
 *  - "reduced" only when negativeCount >= 2 OR (negativeCount=1 && positiveCount=0)
 */
export function computeRecoveryProfile(input: {
  recoveryQuality: string | null;
  sleepHours: number | null;
  stressLevel: number | null;
  physicalWork: boolean;
  dailyActivity: string | null;
}): RecoveryProfileResult {
  const factors: string[] = [];
  let positiveCount = 0;
  let negativeCount = 0;
  let dataPoints = 0;

  if (input.recoveryQuality) {
    dataPoints++;
    if (input.recoveryQuality === "excellent" || input.recoveryQuality === "good") {
      positiveCount += 2;
      factors.push("dobra jakość regeneracji");
    } else if (input.recoveryQuality === "poor") {
      negativeCount += 2;
      factors.push("słaba jakość regeneracji");
    }
  }

  if (input.sleepHours !== null) {
    dataPoints++;
    if (input.sleepHours < 6) {
      negativeCount++;
      factors.push(`niewystarczający sen (${input.sleepHours} h)`);
    } else if (input.sleepHours >= 8) {
      positiveCount++;
      factors.push(`dobry sen (${input.sleepHours} h)`);
    }
  }

  if (input.stressLevel !== null) {
    dataPoints++;
    if (input.stressLevel >= 7) {
      negativeCount += 2;
      factors.push(`wysoki poziom stresu (${input.stressLevel}/10)`);
    } else if (input.stressLevel >= 4) {
      negativeCount++;
      factors.push(`umiarkowany poziom stresu (${input.stressLevel}/10)`);
    } else {
      positiveCount++;
    }
  }

  if (input.dailyActivity !== null || input.physicalWork) {
    dataPoints++;
    if (input.physicalWork) {
      negativeCount++;
      factors.push("praca wymagająca wysiłku fizycznego");
    }
  }

  if (input.dailyActivity !== null) {
    const actLower = input.dailyActivity.toLowerCase();
    const isDemanding = ["aktywna praca", "praca stojąca", "bardzo aktywny", "ciężka"].some(
      (kw) => actLower.includes(kw),
    );
    if (isDemanding) {
      negativeCount++;
      factors.push("wysoka aktywność codzienna");
    }
  }

  const hasData = dataPoints > 0;
  let profile: RecoveryProfile;
  if (negativeCount >= 2 || (negativeCount >= 1 && positiveCount === 0)) {
    profile = "reduced";
  } else if (positiveCount > negativeCount) {
    profile = "good";
  } else {
    profile = "neutral";
  }

  return { profile, hasData, factors };
}

// ─── Base range position ──────────────────────────────────────────────────────

export function computeBaseRangePosition(experienceLevel: string): number | null {
  return EXPERIENCE_LEVEL_RANGE_POSITIONS[experienceLevel] ?? null;
}

// ─── DB loaders ───────────────────────────────────────────────────────────────

/** Load all active targets ordered by canonical TARGET_ORDER. */
async function loadTargets(): Promise<TargetRecord[]> {
  const rows = await db
    .select({
      id: volumeTargetsTable.id,
      name: volumeTargetsTable.name,
      broadCategory: volumeTargetsTable.broadCategory,
      isActive: volumeTargetsTable.isActive,
    })
    .from(volumeTargetsTable)
    .where(eq(volumeTargetsTable.isActive, true));

  return rows.sort((a, b) => {
    const ia = TARGET_ORDER.indexOf(a.name);
    const ib = TARGET_ORDER.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

/** Load guidelines and compute the three thresholds for the given level. */
async function loadGuidelines(
  guidelineVersionId: number,
  guidelineLevel: string,
): Promise<GuidelineRecord[]> {
  const rows = await db
    .select({
      volumeTargetId: volumeGuidelinesTable.volumeTargetId,
      weeklyPreferredCeiling: volumeGuidelinesTable.weeklyPreferredCeiling,
      weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling,
    })
    .from(volumeGuidelinesTable)
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, guidelineVersionId),
        eq(volumeGuidelinesTable.experienceLevel, guidelineLevel),
      ),
    );

  return rows.map((r) => {
    const preferredMax = Number(r.weeklyPreferredCeiling);
    const absoluteMax = Number(r.weeklyAbsoluteCeiling);
    const preferredMin = computePreferredFloor(preferredMax);
    return { targetId: r.volumeTargetId, preferredMin, preferredMax, absoluteMax };
  });
}

/** Return the latest guideline version ID. */
async function getLatestGuidelineVersionId(): Promise<number | null> {
  const rows = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .orderBy(volumeGuidelineVersionsTable.id);

  if (rows.length === 0) return null;
  return rows[rows.length - 1]!.id;
}

// ─── Main public function ─────────────────────────────────────────────────────

/**
 * Calculate weekly volume decisions for all 11 targets.
 *
 * Guarantees:
 *  - Exactly one decision per active target (11 for a healthy DB).
 *  - No database writes.
 *  - No exercise selection.
 *  - No plan creation.
 *  - Same input → same output (deterministic).
 */
export async function calculateVolumeDecisions(
  input: DecisionInput,
): Promise<WeeklyVolumeDecisionResponseType> {
  const now = new Date().toISOString();
  const globalWarnings: WeeklyVolumeDecisionResponseType["warnings"] = [];

  // ── Validate experience level ──────────────────────────────────────────────
  const guidelineLevel = input.experienceLevel
    ? mapToGuidelineLevel(input.experienceLevel)
    : null;

  if (!input.experienceLevel) {
    globalWarnings.push({
      code: "MISSING_EXPERIENCE_LEVEL",
      severity: "error",
      message: "Brak poziomu doświadczenia. Obliczenie objętości jest niemożliwe.",
      blocking: true,
    });
    return buildBlockedResponse(globalWarnings, now, null, null);
  }

  if (guidelineLevel === null) {
    globalWarnings.push({
      code: "INVALID_EXPERIENCE_LEVEL",
      severity: "error",
      message: `Poziom doświadczenia "${input.experienceLevel}" nie jest obsługiwany.`,
      blocking: true,
    });
    return buildBlockedResponse(globalWarnings, now, input.experienceLevel, null);
  }

  // ── Load DB data ───────────────────────────────────────────────────────────
  const guidelineVersionId = await getLatestGuidelineVersionId();
  if (guidelineVersionId === null) {
    globalWarnings.push({
      code: "MISSING_VOLUME_GUIDELINES",
      severity: "error",
      message: "Brak wersji wytycznych objętości w bazie danych.",
      blocking: true,
    });
    return buildBlockedResponse(globalWarnings, now, input.experienceLevel, null);
  }

  const [targets, guidelineRows] = await Promise.all([
    loadTargets(),
    loadGuidelines(guidelineVersionId, guidelineLevel),
  ]);

  if (targets.length === 0) {
    globalWarnings.push({
      code: "NO_VOLUME_DECISIONS_AVAILABLE",
      severity: "error",
      message: "Brak aktywnych celów objętości treningowej.",
      blocking: true,
    });
    return buildBlockedResponse(globalWarnings, now, input.experienceLevel, guidelineVersionId);
  }

  if (guidelineRows.length === 0) {
    globalWarnings.push({
      code: "MISSING_VOLUME_GUIDELINES",
      severity: "error",
      message: `Brak wytycznych objętości dla poziomu "${input.experienceLevel}".`,
      blocking: true,
    });
    return buildBlockedResponse(globalWarnings, now, input.experienceLevel, guidelineVersionId);
  }

  const guidelineMap = new Map<number, GuidelineRecord>(
    guidelineRows.map((g) => [g.targetId, g]),
  );

  // ── Priority group resolution with warnings ───────────────────────────────
  const assignedPriorityIds = new Set<number>();
  for (let i = 0; i < Math.min(input.priorityMuscleGroups.length, 3); i++) {
    const group = input.priorityMuscleGroups[i]!;
    if (!group) continue;
    const { ids, status } = resolveGroup(group, targets);
    if (status === "unknown") {
      globalWarnings.push({
        code: "UNKNOWN_PRIORITY_TARGET",
        severity: "notice",
        message: `Priorytetowa partia "${group}" nie pasuje do żadnego celu objętości po normalizacji tekstu.`,
        blocking: false,
      });
    } else if (status === "ambiguous") {
      globalWarnings.push({
        code: "AMBIGUOUS_PRIORITY_TARGET",
        severity: "notice",
        message: `Priorytetowa partia "${group}" pasuje do więcej niż jednego celu (niejednoznaczne dopasowanie). Priorytet nie został przypisany.`,
        blocking: false,
      });
    } else {
      for (const id of ids) {
        if (assignedPriorityIds.has(id)) {
          const target = targets.find((t) => t.id === id);
          globalWarnings.push({
            code: "DUPLICATED_PRIORITY_TARGET",
            severity: "notice",
            message: `Cel "${target?.name ?? id}" pojawia się w kilku pozycjach priorytetowych. Brana pod uwagę jest pierwsza pozycja.`,
            blocking: false,
          });
        } else {
          assignedPriorityIds.add(id);
        }
      }
    }
  }

  // ── Warn about unmatched excluded groups ──────────────────────────────────
  for (const group of input.excludedMuscleGroups) {
    if (group && matchMuscleGroupToTargetIds(group, targets).length === 0) {
      globalWarnings.push({
        code: "EXCLUDED_TARGET_NOT_FOUND",
        severity: "notice",
        message: `Wykluczona partia "${group}" nie pasuje do żadnego celu objętości.`,
        blocking: false,
      });
    }
  }

  // ── Recovery profile ───────────────────────────────────────────────────────
  const recoveryResult = computeRecoveryProfile({
    recoveryQuality: input.recoveryQuality,
    sleepHours: input.sleep,
    stressLevel: input.stress,
    physicalWork: input.physicalWork,
    dailyActivity: input.dailyActivity,
  });

  if (!recoveryResult.hasData) {
    globalWarnings.push({
      code: "MISSING_RECOVERY_DATA",
      severity: "notice",
      message: "Brak danych regeneracji (aktywność, sen, stres). Zastosowano standardowy profil.",
      blocking: false,
    });
  }

  // ── Availability ───────────────────────────────────────────────────────────
  const availability = classifyAvailability(input.trainingDays, input.sessionDuration);
  if (availability === "short") {
    globalWarnings.push({
      code: "LIMITED_TRAINING_AVAILABILITY",
      severity: "notice",
      message: "Ograniczona dostępność treningowa (≤2 dni lub <45 min sesja). Objętość nie-priorytetowych partii zostanie obniżona.",
      blocking: false,
    });
  }

  // ── Priority group-size map ────────────────────────────────────────────────
  // For each broad-category priority slot, record how many targets it matched.
  // A slot "Plecy" → [latissimus, trapezius] has size 2; each target receives
  // 1/2 of the full bonus so the total uplift per category equals ONE bonus.
  const priorityGroupSizeMap = new Map<number, number>(); // targetId → group size
  for (let i = 0; i < Math.min(input.priorityMuscleGroups.length, 3); i++) {
    const group = input.priorityMuscleGroups[i]!;
    if (!group) continue;
    const { ids, status } = resolveGroup(group, targets);
    if (status === "found" && ids.length > 0) {
      for (const id of ids) {
        if (!priorityGroupSizeMap.has(id)) {
          // Only first matching priority slot wins; record its group size.
          priorityGroupSizeMap.set(id, ids.length);
        }
      }
    }
  }

  // ── Compute decisions ──────────────────────────────────────────────────────
  const decisions: WeeklyVolumeTargetDecisionType[] = [];
  let targetsWithWarnings = 0;
  let targetsOverridden = 0;

  for (const target of targets) {
    const guideline = guidelineMap.get(target.id) ?? null;
    const priorityOrder = getPriorityOrder(target.id, input.priorityMuscleGroups, targets);
    const priorityGroupSize = priorityGroupSizeMap.get(target.id) ?? 1;
    const excluded = isExcludedTarget(target.id, input.excludedMuscleGroups, targets);
    const trainerOverride = input.trainerOverrides[String(target.id)] ?? null;

    const decision = computeTargetDecision({
      target,
      guideline,
      experienceLevel: input.experienceLevel,
      priorityOrder,
      priorityGroupSize,
      isExcluded: excluded,
      recoveryResult,
      availability,
      trainerOverride,
    });

    decisions.push(decision);
    if (decision.warnings.length > 0) targetsWithWarnings++;
    if (decision.isOverridden) targetsOverridden++;
  }

  // ── Build summary ──────────────────────────────────────────────────────────
  const summary: WeeklyVolumeDecisionResponseType["summary"] = {
    totalTargets: targets.length,
    targetsWithDecisions: decisions.length,
    targetsWithWarnings,
    targetsOverridden,
    experienceLevelUsed: input.experienceLevel,
    recoveryProfile: recoveryResult.profile,
    blockingIssues: globalWarnings.some((w) => w.blocking),
  };

  return {
    decisions,
    summary,
    warnings: globalWarnings,
    metadata: {
      calculatedAt: now,
      experienceLevel: input.experienceLevel,
      guidelineVersionId,
      recoveryProfile: recoveryResult.profile,
    },
  };
}

// ─── Blocked response helper ──────────────────────────────────────────────────

function buildBlockedResponse(
  warnings: WeeklyVolumeDecisionResponseType["warnings"],
  calculatedAt: string,
  experienceLevel: string | null,
  guidelineVersionId: number | null,
): WeeklyVolumeDecisionResponseType {
  return {
    decisions: [],
    summary: {
      totalTargets: 0,
      targetsWithDecisions: 0,
      targetsWithWarnings: 0,
      targetsOverridden: 0,
      experienceLevelUsed: experienceLevel,
      recoveryProfile: null,
      blockingIssues: true,
    },
    warnings,
    metadata: {
      calculatedAt,
      experienceLevel,
      guidelineVersionId: guidelineVersionId ?? 0,
      recoveryProfile: null,
    },
  };
}
