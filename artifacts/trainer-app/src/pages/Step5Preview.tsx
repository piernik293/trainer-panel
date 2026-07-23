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
import { Link } from "wouter";
import {
  useGetClientAvoidedExercises,
} from "@workspace/api-client-react";
import {
  SPLIT_TYPE_LABELS,
  type GetClientPlanDraftInputResponseType,
  type PlanDraftGenerationPreferencesType,
  type WeeklyVolumeDistributionResponseType,
} from "@workspace/api-zod";
import type { ExerciseDraftByDay, DraftExercise, ExerciseClass, GeneratedDayExplanation } from "@/lib/exerciseDraftHelpers";
import { validatePrescription } from "@/lib/exerciseDraftHelpers";
import type { DraftVolumePreviewResult } from "@/hooks/useVolumeCoverage";
import { WeeklyVolumeCoverage } from "@/components/VolumeCoverageSection";
import { pluralizeSets } from "@/lib/coreCoverageHelpers";
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
  Loader2,
  Lock,
  Save,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Exercise class display config ────────────────────────────────────────────

const EXERCISE_CLASS_CONFIG: Record<ExerciseClass, {
  label: string;
  color: string;
  tierRank: number;
  sectionLabel: string;
}> = {
  plyometric_power:    { label: "Eksplozywne",  color: "text-amber-700 bg-amber-50 border-amber-200",    tierRank: 0, sectionLabel: "Eksplozywne" },
  main_compound:       { label: "Główne",        color: "text-blue-700 bg-blue-50 border-blue-200",       tierRank: 1, sectionLabel: "Ćwiczenia główne" },
  secondary_compound:  { label: "Wspomagające",  color: "text-teal-700 bg-teal-50 border-teal-200",       tierRank: 2, sectionLabel: "Wspomagające" },
  isolation:           { label: "Akcesoria",     color: "text-slate-600 bg-slate-50 border-slate-200",    tierRank: 3, sectionLabel: "Akcesoria" },
  regression_beginner: { label: "Regresja",      color: "text-violet-700 bg-violet-50 border-violet-200", tierRank: 3, sectionLabel: "Akcesoria / regresja" },
  core:                { label: "Core",           color: "text-emerald-700 bg-emerald-50 border-emerald-200", tierRank: 5, sectionLabel: "Core" },
};

// ─── Display-order grouping ────────────────────────────────────────────────────

/**
 * Groups exercises by tier (plyometric → main → secondary → accessory → core)
 * and within each tier by muscle group (first-appearance order).
 * This is purely visual — it does NOT change the stored order in the draft.
 */
function buildDisplayGroups(
  exercises: DraftExercise[],
): Array<{ tierRank: number; sectionLabel: string; exercises: DraftExercise[] }> {
  const getTierRank = (ex: DraftExercise): number => {
    if (ex.exerciseClass && EXERCISE_CLASS_CONFIG[ex.exerciseClass]) {
      return EXERCISE_CLASS_CONFIG[ex.exerciseClass].tierRank;
    }
    return ex.isCore ? 5 : 3;
  };
  const getSectionLabel = (ex: DraftExercise): string => {
    if (ex.exerciseClass && EXERCISE_CLASS_CONFIG[ex.exerciseClass]) {
      return EXERCISE_CLASS_CONFIG[ex.exerciseClass].sectionLabel;
    }
    return ex.isCore ? "Core" : "Akcesoria";
  };

  // Build per-tier muscle group order (stable: first appearance wins)
  const tierMuscleOrder: Record<number, string[]> = {};
  for (const ex of exercises) {
    const rank = getTierRank(ex);
    if (!tierMuscleOrder[rank]) tierMuscleOrder[rank] = [];
    if (!tierMuscleOrder[rank].includes(ex.mainMuscleGroup)) {
      tierMuscleOrder[rank].push(ex.mainMuscleGroup);
    }
  }

  const sorted = [...exercises].sort((a, b) => {
    const rankDiff = getTierRank(a) - getTierRank(b);
    if (rankDiff !== 0) return rankDiff;
    const rank = getTierRank(a);
    const order = tierMuscleOrder[rank] ?? [];
    return order.indexOf(a.mainMuscleGroup) - order.indexOf(b.mainMuscleGroup);
  });

  const groups: Array<{ tierRank: number; sectionLabel: string; exercises: DraftExercise[] }> = [];
  for (const ex of sorted) {
    const rank = getTierRank(ex);
    const label = getSectionLabel(ex);
    const last = groups[groups.length - 1];
    if (!last || last.tierRank !== rank) {
      groups.push({ tierRank: rank, sectionLabel: label, exercises: [ex] });
    } else {
      last.exercises.push(ex);
    }
  }
  return groups;
}

// ─── Explanation aggregation ───────────────────────────────────────────────────

interface AggregatedExplanation {
  rationale: string[];
  preferredExercises: Array<{
    keyword: string;
    status: "used" | "not_used";
    usedInDays: number[];
    note: string;
  }>;
  excludedExercises: Array<{
    name: string;
    scope: "exact" | "family";
    label?: string;
  }>;
  notes: string[];
}

function aggregateExplanations(
  generatedExplanations: Record<number, GeneratedDayExplanation>,
): AggregatedExplanation | null {
  const entries = Object.entries(generatedExplanations) as [string, GeneratedDayExplanation][];
  if (entries.length === 0) return null;

  // Rationale: unique lines, skip per-session "Typ sesji:" lines
  const rationaleSet = new Set<string>();
  for (const [, exp] of entries) {
    exp.rationale
      .filter((r) => !r.startsWith("Typ sesji:"))
      .forEach((r) => rationaleSet.add(r));
  }

  // Preferred exercises: aggregate by keyword; track days where it was used
  const prefMap = new Map<string, { keyword: string; usedInDays: number[]; note: string }>();
  for (const [dayIdxStr, exp] of entries) {
    const dayIdx = parseInt(dayIdxStr, 10);
    for (const pe of exp.preferredExercises) {
      if (!prefMap.has(pe.keyword)) {
        prefMap.set(pe.keyword, { keyword: pe.keyword, usedInDays: [], note: pe.note });
      }
      const entry = prefMap.get(pe.keyword)!;
      if (pe.status === "used") {
        entry.usedInDays.push(dayIdx);
        entry.note = pe.note;
      }
    }
  }

  // Excluded exercises: deduplicate by name
  const exclMap = new Map<string, { name: string; scope: "exact" | "family"; label?: string }>();
  for (const [, exp] of entries) {
    for (const ee of exp.excludedExercises) {
      if (!exclMap.has(ee.name)) {
        exclMap.set(ee.name, { name: ee.name, scope: ee.scope, label: ee.label });
      }
    }
  }

  // Notes: unique across all days
  const notesSet = new Set<string>();
  for (const [, exp] of entries) exp.notes.forEach((n) => notesSet.add(n));

  return {
    rationale: [...rationaleSet],
    preferredExercises: [...prefMap.values()].map((pe) => ({
      keyword: pe.keyword,
      status: pe.usedInDays.length > 0 ? "used" : "not_used",
      usedInDays: pe.usedInDays,
      note: pe.note,
    })),
    excludedExercises: [...exclMap.values()],
    notes: [...notesSet],
  };
}

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
  /** Per-day explanation blocks from the generator. Empty when exercises were added manually. */
  generatedExplanations?: Record<number, GeneratedDayExplanation>;
  /** Called when the trainer clicks "Zapisz plan". */
  onSave?: () => void;
  /** True while the save mutation is in-flight. */
  isSaving?: boolean;
  /** Set to the saved plan ID after a successful save. */
  savedPlanId?: number | null;
}

// ─── Sport coaching note ──────────────────────────────────────────────────────

/**
 * Trainer-facing coaching note for sport-goal ("Cel sportowy") profiles.
 *
 * Shown when the effective training goal is athletic. Highlights that clients
 * with dynamic / speed / stability priorities may benefit from one dedicated
 * athletic or plyometric session rather than a pure strength split.
 *
 * Parts 2 & 4 of the spec.
 */
function SportCoachingNote({
  typedData,
  effectivePrefs,
}: {
  typedData: GetClientPlanDraftInputResponseType;
  effectivePrefs: PlanDraftGenerationPreferencesType;
}) {
  const effectiveGoal = effectivePrefs.trainingGoal ?? typedData.input.trainingGoal ?? "";
  if (effectiveGoal !== "Cel sportowy") return null;

  // Pull performanceNeeds from athleteRecommendation when available
  const athleteRec = (typedData as unknown as {
    athleteRecommendation?: {
      isAthlete?: boolean;
      performanceNeeds?: string[];
    } | null;
  }).athleteRecommendation;
  const performanceNeeds: string[] = athleteRec?.performanceNeeds ?? [];

  // Keywords that strongly justify a dedicated athletic session
  const ATHLETIC_KEYWORDS = new Set([
    "dynamika", "szybkość", "skoczność", "zmiana kierunku", "koordynacja", "stabilizacja",
  ]);
  const relevantNeeds = performanceNeeds.filter((n) =>
    ATHLETIC_KEYWORDS.has(n.toLowerCase()),
  );

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-indigo-600 shrink-0" />
        <span className="font-semibold text-indigo-800 text-sm">
          Wskazówka trenerska — profil sportowy
        </span>
      </div>
      <p className="text-xs text-indigo-700 leading-relaxed">
        Ten klient deklaruje <span className="font-medium">Cel sportowy</span>. Standardowy plan
        siłowy może nie oddawać w pełni wymagań sportowych. Warto rozważyć, czy jedna z sesji
        tygodniowych powinna mieć wyraźny akcent{" "}
        <span className="font-medium">dynamiczny lub plyometryczny</span> — zamiast kolejnej
        sesji siłowej w tym samym schemacie.
      </p>
      {relevantNeeds.length > 0 && (
        <p className="text-xs text-indigo-700 leading-relaxed">
          Priorytety wskazane w wywiadzie:{" "}
          <span className="font-medium">
            {relevantNeeds
              .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
              .join(", ")}
          </span>
          {" "}— to cechy motoryczne typowe dla treningu atletycznego.
        </p>
      )}
      <p className="text-xs text-indigo-600 leading-relaxed">
        Rekomendacja: sesja z ćwiczeniami eksplozywno-reaktywnymi (skoki, zmiany kierunku,
        rzuty) zastępuje powtarzającą się sesję siłową i lepiej odzwierciedla wymagania sportowe
        profilu Dynamika / Szybkość / Stabilizacja.
      </p>
    </div>
  );
}

// ─── Generator insights card ───────────────────────────────────────────────────

function GeneratorInsightsCard({
  aggregated,
  effectivePrefs,
  distributionResult,
  typedData,
}: {
  aggregated: AggregatedExplanation | null;
  effectivePrefs: PlanDraftGenerationPreferencesType;
  distributionResult: WeeklyVolumeDistributionResponseType;
  typedData: GetClientPlanDraftInputResponseType;
}) {
  const splitMatchesRec =
    effectivePrefs.splitType === distributionResult.recommendedSplitType;
  const selectedLabel =
    SPLIT_TYPE_LABELS[effectivePrefs.splitType] ?? effectivePrefs.splitType;
  const recLabel =
    SPLIT_TYPE_LABELS[distributionResult.recommendedSplitType] ??
    distributionResult.recommendedSplitType;

  // "Dlaczego taki plan?" bullets — built from effectivePrefs + generator rationale
  const whyBullets: string[] = [];
  if (typedData.input.experienceLevel) {
    whyBullets.push(`Poziom: ${typedData.input.experienceLevel}`);
  }
  if (effectivePrefs.trainingGoal) {
    whyBullets.push(`Cel: ${effectivePrefs.trainingGoal}`);
  }
  whyBullets.push(
    splitMatchesRec
      ? `Struktura: ${selectedLabel} — zgodna z rekomendacją generatora`
      : `Struktura: ${selectedLabel} — wybrana ręcznie (rekomendacja: ${recLabel})`,
  );
  if (effectivePrefs.priorityMuscleGroups.length > 0) {
    whyBullets.push(
      `Priorytety mięśniowe: ${effectivePrefs.priorityMuscleGroups.join(", ")}`,
    );
  }
  const locDur: string[] = [];
  if (typedData.input.trainingLocation) locDur.push(typedData.input.trainingLocation);
  if (effectivePrefs.sessionDurationMinutes) {
    locDur.push(`${effectivePrefs.sessionDurationMinutes} min/sesja`);
  }
  if (locDur.length > 0) whyBullets.push(locDur.join(" · "));
  // Extra rationale from generator (skip level/goal — already shown above)
  if (aggregated) {
    aggregated.rationale
      .filter(
        (r) =>
          !r.startsWith("Poziom zaawansowania:") &&
          !r.startsWith("Cel treningowy:"),
      )
      .forEach((r) => whyBullets.push(r));
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className="text-base">🔍</span> Dlaczego taki plan?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* A — Plan context */}
        <ul className="space-y-1">
          {whyBullets.map((b, i) => (
            <li key={i} className="text-xs text-foreground flex items-start gap-2">
              <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        {/* B — Preferred exercises */}
        {aggregated && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Preferowane ćwiczenia
            </p>
            {aggregated.preferredExercises.length > 0 ? (
              <ul className="space-y-1.5">
                {aggregated.preferredExercises.map((pe, i) => (
                  <li key={i} className="text-xs flex items-start gap-2">
                    {pe.status === "used" ? (
                      <>
                        <span className="text-emerald-600 shrink-0 font-bold mt-0.5">✓</span>
                        <span className="leading-snug">
                          <span className="font-medium text-foreground">{pe.keyword}</span>
                          {" — "}
                          <span className="text-emerald-700">
                            użyte w {pe.usedInDays.map((d) => `Dniu ${d + 1}`).join(", ")}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-500 shrink-0 font-bold mt-0.5">–</span>
                        <span className="leading-snug">
                          <span className="font-medium text-foreground">{pe.keyword}</span>
                          {" — "}
                          <span className="text-muted-foreground">
                            nie użyto w żadnej sesji
                          </span>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Brak wskazanych preferowanych ćwiczeń.
              </p>
            )}
          </div>
        )}

        {/* C — Excluded exercises */}
        {aggregated && aggregated.excludedExercises.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Ćwiczenia wykluczone
            </p>
            <ul className="space-y-1.5">
              {aggregated.excludedExercises.map((ee, i) => (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className="text-destructive/60 shrink-0 mt-0.5">⊘</span>
                  <span className="leading-snug">
                    <span className="font-medium text-foreground line-through decoration-destructive/40">
                      {ee.name}
                    </span>
                    {" — "}
                    <span className="text-muted-foreground">
                      {ee.scope === "family"
                        ? `cała rodzina ruchowa${ee.label ? ` (${ee.label})` : ""}`
                        : "dokładnie to ćwiczenie"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* D — Generator notes */}
        {aggregated && aggregated.notes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Uwagi generatora
            </p>
            <ul className="space-y-1.5">
              {aggregated.notes.map((note, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <span className="shrink-0 mt-0.5">·</span>
                  <span className="leading-snug">{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!aggregated && (
          <p className="text-xs text-muted-foreground italic">
            Ćwiczenia zostały dobrane ręcznie — dane kontekstowe generatora niedostępne.
          </p>
        )}
      </CardContent>
    </Card>
  );
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
  const classConfig =
    ex.exerciseClass && EXERCISE_CLASS_CONFIG[ex.exerciseClass]
      ? EXERCISE_CLASS_CONFIG[ex.exerciseClass]
      : null;

  return (
    <div className="py-3 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5 w-5 text-right">
          {order}.
        </span>
        <div className="flex-1 min-w-0">
          {/* Name + tier badge + avoided flag */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground leading-snug">
              {ex.exerciseName}
            </span>
            {classConfig && (
              <span
                className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border font-normal ${classConfig.color}`}
              >
                {classConfig.label}
              </span>
            )}
            {isAvoided && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                <AlertTriangle size={9} />
                wykluczone — zaakceptowane
              </span>
            )}
          </div>
          {/* Prescription */}
          <div className="flex items-center gap-3 flex-wrap mt-1 text-xs">
            <span className="text-foreground font-medium">
              {ex.sets} serie × {ex.repsMin}–{ex.repsMax} pow.
            </span>
            <span className="text-muted-foreground">Przerwa {ex.restSeconds} s</span>
            <span className="text-muted-foreground">RIR {ex.rir}</span>
          </div>
          {/* Muscle group + equipment */}
          <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-muted-foreground">
            <span>{ex.mainMuscleGroup}</span>
            {ex.equipment.length > 0 && (
              <span>· {ex.equipment.join(", ")}</span>
            )}
          </div>
          {previewWarning && (
            <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
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
  exerciseContribMap: Map<number, ExerciseContrib[]>;
  avoidedExerciseIds: Set<number>;
  previewWarningsByEntryId: Map<string, string>;
}

function DayPreviewCard({
  day,
  exerciseDraft,
  exerciseContribMap,
  avoidedExerciseIds,
  previewWarningsByEntryId,
}: DayPreviewCardProps) {
  const dayExercises = exerciseDraft[day.dayIndex] ?? [];
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
              {pluralizeExercises(dayExercises.length)}
              {" · "}
              {totalSets} {pluralizeSets(totalSets).replace(/^\d+ /, "")} łącznie
            </p>
          </div>
        </div>

        {/* Read-only exercise list — grouped by tier, within-tier by muscle group */}
        {dayExercises.length === 0 ? (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-center gap-2">
            <AlertTriangle size={12} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800">Brak wybranych ćwiczeń w tym dniu.</p>
          </div>
        ) : (
          <div className="border-t border-border/20 pt-1">
            {(() => {
              const displayGroups = buildDisplayGroups(dayExercises);
              const showTierHeaders = displayGroups.length > 1;
              let globalIdx = 0;
              return displayGroups.map((group, groupIdx) => (
                <div key={group.tierRank}>
                  {showTierHeaders && (
                    <div
                      className={`flex items-center gap-2 ${groupIdx > 0 ? "mt-3" : "mt-2"} mb-1`}
                    >
                      <div className="h-px flex-1 bg-border/40" />
                      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium px-1">
                        {group.sectionLabel}
                      </span>
                      <div className="h-px flex-1 bg-border/40" />
                    </div>
                  )}
                  {group.exercises.map((ex) => {
                    const currentIdx = globalIdx++;
                    const contribs = exerciseContribMap.get(ex.exerciseId) ?? [];
                    const isAvoided = avoidedExerciseIds.has(ex.exerciseId);
                    const warning = previewWarningsByEntryId.get(ex.localId) ?? null;
                    return (
                      <ExercisePreviewItem
                        key={ex.localId}
                        order={currentIdx + 1}
                        exercise={ex}
                        contribs={contribs}
                        isAvoided={isAvoided}
                        previewWarning={warning}
                      />
                    );
                  })}
                </div>
              ));
            })()}
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
  generatedExplanations = {},
  onSave,
  isSaving = false,
  savedPlanId = null,
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

  // Aggregate per-day generator explanations for the insights card
  const aggregated = useMemo(
    () => aggregateExplanations(generatedExplanations),
    [generatedExplanations],
  );

  return (
    <div className="space-y-6">
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

      {/* Sport coaching note — Parts 2 & 4: shown for Cel sportowy profiles */}
      <SportCoachingNote typedData={typedData} effectivePrefs={effectivePrefs} />

      {/* 3. Kontekst generatora — dlaczego taki plan + preferred/excluded/notes */}
      <GeneratorInsightsCard
        aggregated={aggregated}
        effectivePrefs={effectivePrefs}
        distributionResult={distributionResult}
        typedData={typedData}
      />

      {/* 4. Podsumowanie objętości tygodniowej — reused component, no recalculation */}
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

      {/* Save success banner */}
      {savedPlanId !== null && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-4 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900">Plan zapisany pomyślnie!</p>
          </div>
          <Link
            href={`/plans/${savedPlanId}`}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 shrink-0"
          >
            Otwórz plan →
          </Link>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2" disabled={isSaving}>
          <ArrowLeft size={13} />
          Wróć do ćwiczeń
        </Button>
        {savedPlanId !== null ? (
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href={`/plans/${savedPlanId}`}>
              Otwórz zapisany plan
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-2"
            onClick={onSave}
            disabled={isSaving || !onSave}
          >
            {isSaving ? (
              <><Loader2 size={13} className="animate-spin" />Zapisywanie…</>
            ) : (
              <><Save size={13} />Zapisz plan</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
