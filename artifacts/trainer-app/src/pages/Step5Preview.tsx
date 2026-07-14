/**
 * Step5Preview — "Podgląd" step of the Plan Draft Wizard (Phase 4C).
 *
 * Read-only view of the complete generator draft before saving.
 * Reads from the existing local wizard state — no new API calls, no DB writes.
 *
 * Sections:
 *   1. Klient — client profile summary
 *   2. Założenia planu — split, days, block duration
 *   3. Podsumowanie objętości — reused WeeklyVolumeCoverage result
 *   4. Dni treningowe — per-day read-only cards with exercise list + coverage
 *   5. Ostrzeżenia i informacje — grouped A (structural) / B (advisory) / C (info)
 *   6. Gotowość szkicu — final readiness card
 */

import { useState, useMemo } from "react";
import {
  useGetClientAvoidedExercises,
} from "@workspace/api-client-react";
import {
  SPLIT_TYPE_LABELS,
  type GetClientPlanDraftInputResponseType,
  type PlanDraftGenerationPreferencesType,
  type WeeklyVolumeDistributionResponseType,
} from "@workspace/api-zod";
import type { ExerciseDraftByDay, DraftExercise } from "@/lib/exerciseDraftHelpers";
import { validatePrescription } from "@/lib/exerciseDraftHelpers";
import { filterNonZeroAllocations } from "@/lib/distributionHelpers";
import type { DraftVolumePreviewResult } from "@/hooks/useVolumeCoverage";
import { WeeklyVolumeCoverage, DayVolumeCoverage } from "@/components/VolumeCoverageSection";
import {
  countCoreActualSetsForDay,
  getCorePlanForDay,
  pluralizeSets,
} from "@/lib/coreCoverageHelpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Lock,
  TrendingUp,
} from "lucide-react";

// ─── Polish helpers ────────────────────────────────────────────────────────────

function pluralizeExercises(n: number): string {
  if (n === 1) return "1 ćwiczenie";
  if (n >= 2 && n <= 4) return `${n} ćwiczenia`;
  return `${n} ćwiczeń`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const RECOVERY_LABELS: Record<string, string> = {
  low: "Słaba",
  medium: "Średnia",
  high: "Dobra",
  very_high: "Bardzo dobra",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Step5PreviewProps {
  typedData: GetClientPlanDraftInputResponseType;
  effectivePrefs: PlanDraftGenerationPreferencesType;
  distributionResult: WeeklyVolumeDistributionResponseType;
  exerciseDraft: ExerciseDraftByDay;
  previewResult: DraftVolumePreviewResult | null;
  coverageLoading: boolean;
  clientId: number;
  onBack: () => void;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
      {children}
    </h2>
  );
}

// ─── Read-only label / value row ──────────────────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right text-foreground font-medium">{value}</span>
    </div>
  );
}

// ─── Expandable section ───────────────────────────────────────────────────────

function ExpandableDetail({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label}
      </button>
      {open && <div className="mt-1 pl-3">{children}</div>}
    </div>
  );
}

// ─── Section 1: Client Summary ─────────────────────────────────────────────────

function ClientSummaryCard({
  typedData,
  effectivePrefs,
}: {
  typedData: GetClientPlanDraftInputResponseType;
  effectivePrefs: PlanDraftGenerationPreferencesType;
}) {
  const input = typedData.input;
  const client = typedData.client;

  const equipmentDisplay =
    input.availableEquipment.length === 0
      ? "Brak sprzętu"
      : input.availableEquipment.join(", ");

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className="text-base">👤</span> Klient
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 text-xs">
        <PreviewRow
          label="Imię i nazwisko"
          value={`${client.firstName} ${client.lastName}`}
        />
        {input.experienceLevel && (
          <PreviewRow label="Poziom doświadczenia" value={input.experienceLevel} />
        )}
        <PreviewRow
          label="Cel treningowy"
          value={effectivePrefs.trainingGoal ?? input.trainingGoal}
        />
        <PreviewRow label="Miejsce treningu" value={input.trainingLocation} />
        <PreviewRow label="Dostępny sprzęt" value={equipmentDisplay} />
        <PreviewRow
          label="Dni treningowe"
          value={`${effectivePrefs.trainingDays} dni/tydz.${input.availableDays && input.availableDays !== effectivePrefs.trainingDays ? ` (wywiad: ${input.availableDays})` : ""}`}
        />
        {effectivePrefs.sessionDurationMinutes && (
          <PreviewRow
            label="Czas sesji"
            value={`${effectivePrefs.sessionDurationMinutes} min`}
          />
        )}
        {input.recoveryQuality && (
          <PreviewRow
            label="Jakość regeneracji"
            value={RECOVERY_LABELS[input.recoveryQuality] ?? input.recoveryQuality}
          />
        )}
        {effectivePrefs.priorityMuscleGroups.length > 0 && (
          <PreviewRow
            label="Grupy priorytetowe"
            value={effectivePrefs.priorityMuscleGroups.join(", ")}
          />
        )}
        {input.healthLimitations && (
          <PreviewRow label="Ograniczenia zdrowotne" value={input.healthLimitations} />
        )}
        {input.avoidedExerciseIds.length > 0 && (
          <PreviewRow
            label="Ćwiczenia wykluczone"
            value={`${input.avoidedExerciseIds.length} pozycji (z wywiadu)`}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 2: Plan Assumptions ──────────────────────────────────────────────

function PlanAssumptionsCard({
  effectivePrefs,
  distributionResult,
}: {
  effectivePrefs: PlanDraftGenerationPreferencesType;
  distributionResult: WeeklyVolumeDistributionResponseType;
}) {
  const selectedLabel =
    SPLIT_TYPE_LABELS[effectivePrefs.splitType] ?? effectivePrefs.splitType;
  const recommendedLabel =
    SPLIT_TYPE_LABELS[distributionResult.recommendedSplitType] ??
    distributionResult.recommendedSplitType;
  const splitMatchesRecommendation =
    effectivePrefs.splitType === distributionResult.recommendedSplitType;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className="text-base">📋</span> Założenia planu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 text-xs">
        <PreviewRow
          label="Wybrany split"
          value={
            <span className="flex items-center gap-1.5">
              {selectedLabel}
              {splitMatchesRecommendation ? (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded">
                  = rekomendowany
                </span>
              ) : (
                <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1 rounded">
                  ≠ rekomendowany
                </span>
              )}
            </span>
          }
        />
        {!splitMatchesRecommendation && (
          <PreviewRow label="Rekomendowany split" value={recommendedLabel} />
        )}
        <PreviewRow
          label="Liczba dni treningowych"
          value={`${effectivePrefs.trainingDays} dni/tydz.`}
        />
        {effectivePrefs.blockDurationWeeks && (
          <PreviewRow
            label="Czas trwania bloku"
            value={`${effectivePrefs.blockDurationWeeks} tyg.`}
          />
        )}
        {effectivePrefs.sessionDurationMinutes && (
          <PreviewRow
            label="Czas sesji"
            value={`${effectivePrefs.sessionDurationMinutes} min`}
          />
        )}
        {effectivePrefs.trainingGoal && (
          <PreviewRow label="Cel treningowy" value={effectivePrefs.trainingGoal} />
        )}
        {effectivePrefs.priorityMuscleGroups.length > 0 && (
          <PreviewRow
            label="Grupy priorytetowe"
            value={effectivePrefs.priorityMuscleGroups.join(", ")}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exercise contribution details ─────────────────────────────────────────────

interface ExerciseContrib {
  muscleName: string;
  effectiveSets: number;
}

function ExerciseContributions({ contribs }: { contribs: ExerciseContrib[] }) {
  if (contribs.length === 0) return null;
  return (
    <ExpandableDetail label="Wpływ na objętość">
      <ul className="space-y-0.5">
        {contribs.map((c) => (
          <li key={c.muscleName} className="text-[10px] text-muted-foreground">
            {c.muscleName}:{" "}
            <span className="font-medium text-foreground">{round2(c.effectiveSets).toFixed(2)} pkt.</span>
          </li>
        ))}
      </ul>
    </ExpandableDetail>
  );
}

// ─── Read-only exercise item ──────────────────────────────────────────────────

interface ExercisePreviewItemProps {
  order: number;
  exercise: DraftExercise;
  contribs: ExerciseContrib[];
  isAvoided: boolean;
  previewWarning?: string | null;
}

function ExercisePreviewItem({
  order,
  exercise: ex,
  contribs,
  isAvoided,
  previewWarning,
}: ExercisePreviewItemProps) {
  return (
    <div className="py-2 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0 mt-0.5 w-5 text-right">
          {order}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-foreground">{ex.exerciseName}</span>
            {isAvoided && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                <AlertTriangle size={9} />
                Ćwiczenie wykluczone — zaakceptowane przez trenera
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-muted-foreground">
            <span className="text-foreground font-medium">
              {ex.sets} {pluralizeSets(ex.sets)} × {ex.repsMin}–{ex.repsMax} powtórzeń
            </span>
            <span>RIR {ex.rir}</span>
            <span>Przerwa: {ex.restSeconds} s</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[10px] text-muted-foreground">
            <span>{ex.mainMuscleGroup}</span>
            {ex.equipment.length > 0 && <span>· {ex.equipment.join(", ")}</span>}
          </div>
          {previewWarning && (
            <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
              <AlertTriangle size={9} />
              {previewWarning}
            </p>
          )}
          <ExerciseContributions contribs={contribs} />
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: Workout Day Preview card ──────────────────────────────────────

interface DayPreviewCardProps {
  day: WeeklyVolumeDistributionResponseType["days"][number];
  exerciseDraft: ExerciseDraftByDay;
  distributionResult: WeeklyVolumeDistributionResponseType;
  previewResult: DraftVolumePreviewResult | null;
  coverageLoading: boolean;
  exerciseContribMap: Map<number, ExerciseContrib[]>;
  avoidedExerciseIds: Set<number>;
  previewWarningsByEntryId: Map<string, string>;
}

function DayPreviewCard({
  day,
  exerciseDraft,
  distributionResult,
  previewResult,
  coverageLoading,
  exerciseContribMap,
  avoidedExerciseIds,
  previewWarningsByEntryId,
}: DayPreviewCardProps) {
  const dayExercises = exerciseDraft[day.dayIndex] ?? [];
  const nonZeroTargets = filterNonZeroAllocations(day.targetAllocations);
  const corePlanned = getCorePlanForDay(distributionResult.auxiliaryCoreBlock, day.dayIndex);
  const coreActual = countCoreActualSetsForDay(dayExercises);
  const totalSets = dayExercises.reduce((s, ex) => s + ex.sets, 0);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* Day header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              Dzień {day.dayIndex + 1} — {day.dayName}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {day.dayType}
            </Badge>
          </div>
          <div className="text-right shrink-0 text-xs text-muted-foreground">
            <p>
              Zaplanowana obj. efektywna:{" "}
              <span className="font-medium text-foreground">
                {day.totalEffectiveTargetVolume} pkt.
              </span>
            </p>
            <p>
              {pluralizeExercises(dayExercises.length)}
              {" · "}
              {totalSets} {pluralizeSets(totalSets).replace(/^\d+ /, "")} łącznie
            </p>
          </div>
        </div>

        {/* Planned targets quick view */}
        {nonZeroTargets.length > 0 && (
          <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border/20 pt-2">
            {nonZeroTargets.map((a) => (
              <span key={a.targetId}>
                {a.targetName}: <b className="text-foreground">{a.allocatedVolume} pkt.</b>
              </span>
            ))}
            {corePlanned > 0 && (
              <span>
                Core: <b className="text-foreground">{pluralizeSets(corePlanned)}</b>
              </span>
            )}
          </div>
        )}

        {/* Volume coverage for this day (reused component) */}
        <DayVolumeCoverage
          day={day}
          exerciseDraft={exerciseDraft}
          previewResult={previewResult}
          isLoading={coverageLoading}
          auxiliaryCoreBlock={distributionResult.auxiliaryCoreBlock}
        />

        {/* Helper text */}
        <p className="text-[10px] text-muted-foreground italic">
          Serie robocze są sumą serii przypisanych do ćwiczeń. Objętość efektywna uwzględnia
          współczynniki pracy mięśni.
        </p>

        {/* Read-only exercise list */}
        {dayExercises.length === 0 ? (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={12} className="text-amber-600 shrink-0" />
            <p className="text-[11px] text-amber-800">Brak wybranych ćwiczeń w tym dniu.</p>
          </div>
        ) : (
          <div className="border-t border-border/20 pt-2">
            {dayExercises.map((ex, idx) => {
              const contribs = exerciseContribMap.get(ex.exerciseId) ?? [];
              const isAvoided = avoidedExerciseIds.has(ex.exerciseId);
              const warning = previewWarningsByEntryId.get(ex.localId) ?? null;
              return (
                <ExercisePreviewItem
                  key={ex.localId}
                  order={idx + 1}
                  exercise={ex}
                  contribs={contribs}
                  isAvoided={isAvoided}
                  previewWarning={warning}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 5: Warnings and information ──────────────────────────────────────

interface WarningsSectionProps {
  prescriptionIssues: ReturnType<typeof validatePrescription>;
  previewResult: DraftVolumePreviewResult | null;
  distributionResult: WeeklyVolumeDistributionResponseType;
  exerciseDraft: ExerciseDraftByDay;
  effectivePrefs: PlanDraftGenerationPreferencesType;
  avoidedInDraftCount: number;
}

function WarningsSection({
  prescriptionIssues,
  previewResult,
  distributionResult,
  exerciseDraft,
  effectivePrefs,
  avoidedInDraftCount,
}: WarningsSectionProps) {
  // ── A: Structural issues (block Step 5) ──────────────────────────────────
  const structuralIssues = prescriptionIssues;

  // ── B: Advisory warnings ─────────────────────────────────────────────────
  // De-duplicate by code + exerciseId + dayId
  const seen = new Set<string>();
  const dedupedPreviewWarnings = (previewResult?.warnings ?? []).filter((w) => {
    const key = `${w.code}-${w.exerciseId ?? ""}-${w.dayId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Uncovered planned targets (actual = 0, plan > 0)
  const uncoveredTargets = distributionResult.targetDecisions.filter((d) => {
    const actual =
      previewResult?.weekly.find((w) => w.targetId === d.targetId)?.effectiveSets ?? 0;
    return d.weeklySelectedVolume > 0 && actual === 0;
  });

  // Exceeded proposed volume
  const exceededTargets = distributionResult.targetDecisions.filter((d) => {
    const actual =
      previewResult?.weekly.find((w) => w.targetId === d.targetId)?.effectiveSets ?? 0;
    return actual > d.weeklySelectedVolume + 0.01;
  });

  // ── C: Informational ─────────────────────────────────────────────────────
  const infoItems: string[] = [];
  if (effectivePrefs.splitType !== distributionResult.recommendedSplitType) {
    const selectedLabel = SPLIT_TYPE_LABELS[effectivePrefs.splitType] ?? effectivePrefs.splitType;
    const recLabel =
      SPLIT_TYPE_LABELS[distributionResult.recommendedSplitType] ??
      distributionResult.recommendedSplitType;
    infoItems.push(
      `Wybrany split (${selectedLabel}) różni się od rekomendowanego (${recLabel}), ale jest zgodny z dostępną liczbą dni treningowych.`,
    );
  }
  if (distributionResult.auxiliaryCoreBlock.weeklySelectedSets > 0) {
    infoItems.push(
      "Core / brzuch jest obsługiwany jako osobny blok bezpośrednich serii — nie jest uwzględniany w 11 analitycznych celach objętościowych.",
    );
  }
  // Check for any unplanned volume contributions across all days
  const hasUnplannedContribs =
    previewResult?.weekly.some(
      (w) =>
        w.effectiveSets > 0 &&
        !distributionResult.targetDecisions.some((d) => d.targetId === w.targetId),
    ) ?? false;
  if (hasUnplannedContribs) {
    infoItems.push(
      "Objętość efektywna zawiera pośrednie wkłady mięśni spoza planowanych grup docelowych.",
    );
  }

  const hasNothing =
    structuralIssues.length === 0 &&
    dedupedPreviewWarnings.length === 0 &&
    uncoveredTargets.length === 0 &&
    exceededTargets.length === 0 &&
    avoidedInDraftCount === 0 &&
    infoItems.length === 0;

  if (hasNothing) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600" />
            Ostrzeżenia i informacje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Brak ostrzeżeń i informacji.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertCircle size={14} className="text-muted-foreground" />
          Ostrzeżenia i informacje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* A — Structural issues */}
        {structuralIssues.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1">
              <AlertCircle size={11} />
              A. Wymaga poprawy
            </p>
            <ul className="space-y-1">
              {structuralIssues.map((issue, i) => (
                <li key={i} className="text-[11px] text-destructive flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>
                    Dzień {issue.dayIndex + 1} — {issue.exerciseName}:{" "}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* B — Advisory warnings */}
        {(dedupedPreviewWarnings.length > 0 ||
          uncoveredTargets.length > 0 ||
          exceededTargets.length > 0 ||
          avoidedInDraftCount > 0) && (
          <div>
            <p className="text-[11px] font-semibold text-amber-700 mb-1 flex items-center gap-1">
              <AlertTriangle size={11} />
              B. Ostrzeżenia trenera
            </p>
            <ul className="space-y-1">
              {avoidedInDraftCount > 0 && (
                <li className="text-[11px] text-amber-800 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>
                    {avoidedInDraftCount === 1
                      ? "1 ćwiczenie w planie figuruje na liście ćwiczeń wykluczonych klienta (zaakceptowane przez trenera)."
                      : `${avoidedInDraftCount} ćwiczenia w planie figurują na liście ćwiczeń wykluczonych klienta (zaakceptowane przez trenera).`}
                  </span>
                </li>
              )}
              {uncoveredTargets.map((d) => (
                <li key={d.targetId} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>
                    Brak dobranego ćwiczenia dla: <b>{d.targetName}</b> (plan: {d.weeklySelectedVolume}{" "}
                    pkt./tydz.)
                  </span>
                </li>
              ))}
              {exceededTargets.map((d) => {
                const actual =
                  previewResult?.weekly.find((w) => w.targetId === d.targetId)?.effectiveSets ?? 0;
                return (
                  <li key={d.targetId} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>
                      Przekroczono propozycję dla: <b>{d.targetName}</b> ({round2(actual)} /{" "}
                      {d.weeklySelectedVolume} pkt./tydz.) — nieblokujące.
                    </span>
                  </li>
                );
              })}
              {dedupedPreviewWarnings.map((w, i) => (
                <li key={i} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* C — Informational */}
        {infoItems.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Info size={11} />
              C. Informacje
            </p>
            <ul className="space-y-1">
              {infoItems.map((item, i) => (
                <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 6: Draft Readiness ───────────────────────────────────────────────

function DraftReadinessCard({
  prescriptionIssues,
}: {
  prescriptionIssues: ReturnType<typeof validatePrescription>;
}) {
  const isReady = prescriptionIssues.length === 0;

  return (
    <Card
      className={`shadow-sm ${isReady ? "border-emerald-300 bg-emerald-50/50" : "border-destructive/40 bg-destructive/5"}`}
    >
      <CardContent className="py-5 text-center">
        {isReady ? (
          <>
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-900 mb-1">
              Szkic gotowy do zapisania
            </h3>
            <p className="text-xs text-emerald-800 max-w-sm mx-auto">
              Plan został przygotowany do końcowej weryfikacji trenera. Ostrzeżenia objętościowe są
              informacyjne i nie blokują dalszej pracy.
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive mb-2">Szkic wymaga poprawy</h3>
            <ul className="text-xs text-destructive text-left max-w-sm mx-auto space-y-1">
              {prescriptionIssues.slice(0, 5).map((issue, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="shrink-0">•</span>
                  <span>
                    Dzień {issue.dayIndex + 1} — {issue.exerciseName}: {issue.message}
                  </span>
                </li>
              ))}
              {prescriptionIssues.length > 5 && (
                <li className="text-muted-foreground">
                  … i {prescriptionIssues.length - 5} więcej problemów.
                </li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Step5Preview ────────────────────────────────────────────────────────

export default function Step5Preview({
  typedData,
  effectivePrefs,
  distributionResult,
  exerciseDraft,
  previewResult,
  coverageLoading,
  clientId,
  onBack,
}: Step5PreviewProps) {
  const { data: avoidedExercises = [] } = useGetClientAvoidedExercises(clientId);

  // All exercise IDs in the avoided list
  const avoidedExerciseIds = useMemo(
    () => new Set(avoidedExercises.map((a) => a.id)),
    [avoidedExercises],
  );

  // Count how many draft exercises are in the avoided list
  const avoidedInDraftCount = useMemo(() => {
    return Object.values(exerciseDraft)
      .flat()
      .filter((ex) => avoidedExerciseIds.has(ex.exerciseId)).length;
  }, [exerciseDraft, avoidedExerciseIds]);

  // Build exerciseId → accumulated contributions per muscle target
  // Source: previewResult.weekly contributions — no recalculation
  const exerciseContribMap = useMemo(() => {
    const map = new Map<number, ExerciseContrib[]>();
    if (!previewResult) return map;

    for (const weekly of previewResult.weekly) {
      for (const c of weekly.contributions) {
        if (!map.has(c.exerciseId)) map.set(c.exerciseId, []);
        const arr = map.get(c.exerciseId)!;
        const existing = arr.find((x) => x.muscleName === weekly.muscleName);
        if (existing) {
          existing.effectiveSets += c.effectiveSets;
        } else {
          arr.push({ muscleName: weekly.muscleName, effectiveSets: c.effectiveSets });
        }
      }
    }

    return map;
  }, [previewResult]);

  // Map localId → preview warning message (for exercises without calculable assignments)
  const previewWarningsByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    // previewResult.warnings have exerciseEntryId — we used (dayIndex+1)*1000 + exIndex+1
    // For simplicity, surface exercise-level warnings by exerciseId
    for (const w of previewResult?.warnings ?? []) {
      if (w.exerciseId && w.message) {
        // Match to exercises in draft by exerciseId (first match per exerciseId)
        for (const exercises of Object.values(exerciseDraft)) {
          for (const ex of exercises) {
            if (ex.exerciseId === w.exerciseId && !map.has(ex.localId)) {
              map.set(ex.localId, w.message);
            }
          }
        }
      }
    }
    return map;
  }, [previewResult, exerciseDraft]);

  // Structural validation (does NOT include volume coverage)
  const prescriptionIssues = useMemo(
    () => validatePrescription(exerciseDraft),
    [exerciseDraft],
  );

  return (
    <div className="space-y-4">
      {/* Page heading */}
      <div className="space-y-1">
        <h2 className="text-xl font-display font-bold">Podgląd planu</h2>
        <p className="text-sm text-muted-foreground">
          Sprawdź strukturę planu, ćwiczenia, parametry treningowe oraz pokrycie objętości przed
          zapisaniem.
        </p>
      </div>

      {/* 1. Klient */}
      <ClientSummaryCard typedData={typedData} effectivePrefs={effectivePrefs} />

      {/* 2. Założenia planu */}
      <PlanAssumptionsCard
        effectivePrefs={effectivePrefs}
        distributionResult={distributionResult}
      />

      {/* 3. Podsumowanie objętości tygodniowej — reused component, no recalculation */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp size={13} className="text-muted-foreground" />
          <SectionHeading>Podsumowanie objętości</SectionHeading>
        </div>
        {previewResult === null && coverageLoading && (
          <div className="rounded-lg border border-border/50 bg-background shadow-sm px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">Ładowanie analizy objętości…</p>
          </div>
        )}
        {previewResult === null && !coverageLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-xs text-amber-800">
              Nie udało się odświeżyć analizy objętości. Ćwiczenia pozostają zapisane w lokalnym
              szkicu.
            </p>
          </div>
        )}
        {previewResult !== null && (
          <WeeklyVolumeCoverage
            distributionResult={distributionResult}
            exerciseDraft={exerciseDraft}
            previewResult={previewResult}
            isLoading={coverageLoading}
          />
        )}
      </div>

      {/* 4. Dni treningowe */}
      <div>
        <div className="mb-2">
          <SectionHeading>Dni treningowe</SectionHeading>
        </div>
        <div className="space-y-3">
          {distributionResult.days.map((day) => (
            <DayPreviewCard
              key={day.dayIndex}
              day={day}
              exerciseDraft={exerciseDraft}
              distributionResult={distributionResult}
              previewResult={previewResult}
              coverageLoading={coverageLoading}
              exerciseContribMap={exerciseContribMap}
              avoidedExerciseIds={avoidedExerciseIds}
              previewWarningsByEntryId={previewWarningsByEntryId}
            />
          ))}
        </div>
      </div>

      {/* 5. Ostrzeżenia i informacje */}
      <WarningsSection
        prescriptionIssues={prescriptionIssues}
        previewResult={previewResult}
        distributionResult={distributionResult}
        exerciseDraft={exerciseDraft}
        effectivePrefs={effectivePrefs}
        avoidedInDraftCount={avoidedInDraftCount}
      />

      {/* 6. Gotowość szkicu */}
      <DraftReadinessCard prescriptionIssues={prescriptionIssues} />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft size={13} />
          Wróć do ćwiczeń
        </Button>
        <Button disabled className="gap-2 opacity-50 cursor-not-allowed" size="sm">
          <Lock size={13} />
          Zapis planu — kolejny etap
        </Button>
      </div>
    </div>
  );
}
