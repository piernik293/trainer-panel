/**
 * PlanDraftWizard — Workout Plan Draft Generator
 *
 * Phase 2: Step 3 (Objętość) is now fully functional.
 * Steps 4–5 remain locked.
 *
 * Step 1 — Client & data summary  : read-only normalized view of survey data
 * Step 2 — Plan assumptions       : editable overrides (days, split, duration, etc.)
 * Step 3 — Objętość               : 11-target volume recommendation with overrides
 * Step 4 — Dobór ćwiczeń          : (Phase 3)
 * Step 5 — Podgląd szkicu         : (Phase 4C — read-only preview, frontend-only)
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetClientPlanDraftInput,
  useDraftVolumePreview,
  useDraftDistributionPreview,
} from "@workspace/api-client-react";
import {
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
  getCompatibleSplits,
  type SplitType,
  type PlanDraftGenerationPreferencesType,
  type PlanDraftInputWarningType,
  type GetClientPlanDraftInputResponseType,
  type WeeklyVolumeTargetDecisionType,
  type WeeklyVolumeDecisionResponseType,
  type WeeklyVolumeDistributionResponseType,
} from "@workspace/api-zod";
import {
  buildDistributionRequest,
  checkDistributionConsistency,
} from "@/lib/distributionHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  Sparkles,
  Clock,
  CalendarDays,
  MapPin,
  Gauge,
  Shield,
  Lock,
  User,
  ClipboardList,
  Minus,
  Plus,
  RotateCcw,
  Loader2,
} from "lucide-react";
import Step4Exercises from "./Step4Exercises";
import Step5Preview from "./Step5Preview";
import {
  type ExerciseDraftByDay,
  validatePrescription,
  getExerciseStepValidation,
  EXERCISE_SELECTION_VALID,
} from "@/lib/exerciseDraftHelpers";
import { useVolumeCoverage } from "@/hooks/useVolumeCoverage";

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "interview") {
    return (
      <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-200 bg-blue-50">
        wywiad
      </Badge>
    );
  }
  if (source === "derived") {
    return (
      <Badge variant="outline" className="text-[10px] px-1 py-0 text-purple-600 border-purple-200 bg-purple-50">
        obliczone
      </Badge>
    );
  }
  if (source === "missing") {
    return (
      <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground border-border">
        brak
      </Badge>
    );
  }
  return null;
}

// ─── Warning item ─────────────────────────────────────────────────────────────

function WarningItem({ w }: { w: PlanDraftInputWarningType }) {
  const icon =
    w.severity === "error" ? (
      <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
    ) : w.severity === "warning" ? (
      <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
    ) : (
      <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
    );

  return (
    <div className="flex items-start gap-2 text-sm">
      {icon}
      <span className={w.severity === "error" ? "text-destructive" : w.severity === "warning" ? "text-amber-700" : "text-muted-foreground"}>
        {w.message}
        {w.blocking && (
          <span className="ml-1 text-xs font-semibold text-destructive">[blokuje generowanie]</span>
        )}
      </span>
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  source,
  missing,
}: {
  label: string;
  value: string | null | undefined;
  source: string;
  missing?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {missing || !value ? (
          <span className="text-sm text-muted-foreground italic">—</span>
        ) : (
          <span className="text-sm font-medium text-right">{value}</span>
        )}
        <SourceBadge source={source} />
      </div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Profil klienta", icon: User },
  { label: "Założenia planu", icon: ClipboardList },
  { label: "Objętość", icon: Gauge },
  { label: "Ćwiczenia", icon: Dumbbell, locked: true },
  { label: "Podgląd", icon: Sparkles, locked: true },
];

function Stepper({
  current,
  exerciseStepUnlocked,
  previewStepUnlocked,
}: {
  current: number;
  exerciseStepUnlocked: boolean;
  previewStepUnlocked: boolean;
}) {
  return (
    <nav className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const effectiveLocked =
          step.locked &&
          !(i === 3 && exerciseStepUnlocked) &&
          !(i === 4 && previewStepUnlocked);
        const isLocked = effectiveLocked && !isDone;
        const Icon = step.icon;

        return (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive ? "bg-primary text-primary-foreground" : ""}
                ${isDone ? "text-primary" : ""}
                ${isLocked ? "text-muted-foreground" : ""}
              `}
            >
              {isLocked ? <Lock size={13} /> : isDone ? <CheckCircle2 size={13} /> : <Icon size={13} />}

              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-muted-foreground mx-1" />}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Locked step placeholder ──────────────────────────────────────────────────

function LockedStepPlaceholder({ step }: { step: number }) {
  const labels = ["Dobór ćwiczeń", "Podgląd szkicu planu"];
  const phases = ["Faza 3", "Faza 4"];
  const idx = step - 3;
  return (
    <Card className="border-dashed border-border/60 shadow-sm">
      <CardContent className="py-16 text-center">
        <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold text-muted-foreground mb-1">{labels[idx]}</h3>
        <p className="text-sm text-muted-foreground">
          Dostępne w kolejnych etapach ({phases[idx]}).
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Uzupełnij objętość treningową, aby przygotować dane dla kolejnego etapu.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Step 1 — Client & data summary ──────────────────────────────────────────

function Step1Summary({
  data,
}: {
  data: GetClientPlanDraftInputResponseType;
}) {
  const { input, sources, warnings } = data;
  const hasBlockingWarnings = warnings.some((w) => w.blocking);

  const recoveryLabels: Record<string, string> = {
    excellent: "Doskonała",
    good: "Dobra",
    standard: "Standardowa",
    poor: "Słaba",
  };

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <Card className={`border-border/50 shadow-sm ${hasBlockingWarnings ? "border-destructive/40 bg-destructive/5" : "bg-amber-50/50 border-amber-200"}`}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle size={14} className={hasBlockingWarnings ? "text-destructive" : "text-amber-600"} />
              {hasBlockingWarnings ? "Dane wymagają uzupełnienia" : "Informacje o danych"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {warnings.map((w, i) => (
              <WarningItem key={i} w={w} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <User size={14} />
            Dane klienta
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 divide-y divide-border/40">
          <div className="flex items-start justify-between gap-2 py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground w-44 shrink-0">Klient</span>
            <span className="text-sm font-medium text-right">{data.client.firstName} {data.client.lastName}</span>
          </div>
          {data.surveyId && (
            <div className="flex items-start justify-between gap-2 py-2">
              <span className="text-sm text-muted-foreground w-44 shrink-0">Wywiad</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">#{data.surveyId}</span>
                {data.surveyCreatedAt && (
                  <span className="text-xs text-muted-foreground">
                    ({new Date(data.surveyCreatedAt).toLocaleDateString("pl-PL")})
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <Dumbbell size={14} />
            Profil treningowy
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-1">
          <InfoRow label="Poziom doświadczenia" value={input.experienceLevel} source={sources.experienceLevel} />
          <InfoRow label="Cel treningowy" value={input.trainingGoal} source={sources.trainingGoal} />
          <InfoRow label="Dni treningowe / tydz." value={input.availableDays ? `${input.availableDays} dni` : null} source={sources.availableDays} />
          <InfoRow label="Czas sesji" value={input.sessionDurationMinutes ? `${input.sessionDurationMinutes} min` : null} source={sources.sessionDurationMinutes} />
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin size={14} />
            Miejsce i sprzęt
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-1">
          <InfoRow label="Miejsce treningu" value={input.trainingLocation} source={sources.trainingLocation} />
          <div className="flex items-start justify-between gap-2 py-2">
            <span className="text-sm text-muted-foreground w-44 shrink-0">Dostępny sprzęt</span>
            <div className="flex flex-wrap gap-1 justify-end flex-1">
              {input.availableEquipment.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">—</span>
              ) : (
                input.availableEquipment.map((eq) => (
                  <Badge key={eq} variant="secondary" className="text-xs px-1.5">
                    {eq}
                  </Badge>
                ))
              )}
              <SourceBadge source={sources.availableEquipment} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield size={14} />
            Regeneracja i styl życia
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-1">
          <InfoRow label="Aktywność codzienna" value={input.dailyActivity} source={sources.dailyActivity} />
          <InfoRow label="Praca fizyczna" value={input.physicalWork ? "Tak" : input.dailyActivity ? "Nie" : null} source={sources.physicalWork} />
          <InfoRow label="Sen (godz.)" value={input.sleepHours ? `${input.sleepHours} h` : null} source={sources.sleepHours} />
          <InfoRow label="Poziom stresu" value={input.stressLevel != null ? `${input.stressLevel}/10` : null} source={sources.stressLevel} />
          <InfoRow
            label="Jakość regeneracji"
            value={input.recoveryQuality ? recoveryLabels[input.recoveryQuality] ?? input.recoveryQuality : null}
            source={sources.recoveryQuality}
          />
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge size={14} />
            Preferencje i priorytety
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-1">
          <div className="flex items-start justify-between gap-2 py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground w-44 shrink-0">Priorytetowe partie</span>
            <div className="flex flex-wrap gap-1 justify-end flex-1">
              {input.priorityMuscleGroups.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">—</span>
              ) : (
                input.priorityMuscleGroups.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-xs px-1.5">
                    {m}
                  </Badge>
                ))
              )}
              <SourceBadge source={sources.priorityMuscleGroups} />
            </div>
          </div>
          <InfoRow label="Ćwiczenia preferowane" value={input.preferredExercises} source={sources.preferredExercises} />
          <InfoRow label="Ograniczenia zdrowotne" value={input.healthLimitations} source={sources.healthLimitations} />
          {input.avoidedExerciseIds.length > 0 && (
            <div className="flex items-start justify-between gap-2 py-2">
              <span className="text-sm text-muted-foreground w-44 shrink-0">Ćwiczenia do unikania</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{input.avoidedExerciseIds.length} pozycji</span>
                <SourceBadge source={sources.avoidedExercises} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 2 — Plan assumptions ────────────────────────────────────────────────

function Step2Preferences({
  data,
  prefs,
  onPrefsChange,
}: {
  data: GetClientPlanDraftInputResponseType;
  prefs: PlanDraftGenerationPreferencesType;
  onPrefsChange: (p: PlanDraftGenerationPreferencesType) => void;
}) {
  const compatibleSplits = useMemo(
    () => getCompatibleSplits(prefs.trainingDays),
    [prefs.trainingDays],
  );

  const splitOptions = SPLIT_TYPES.map((s) => ({
    value: s,
    label: SPLIT_TYPE_LABELS[s],
    compatible: compatibleSplits.includes(s),
  }));

  function set<K extends keyof PlanDraftGenerationPreferencesType>(
    key: K,
    value: PlanDraftGenerationPreferencesType[K],
  ) {
    onPrefsChange({ ...prefs, [key]: value });
  }

  function handleDaysChange(days: number) {
    const newCompatible = getCompatibleSplits(days);
    const currentOk = newCompatible.includes(prefs.splitType);
    const newSplit = currentOk ? prefs.splitType : newCompatible[0] ?? "custom";
    onPrefsChange({ ...prefs, trainingDays: days, splitType: newSplit });
  }

  const hasSurveyLevel = !!data.input.experienceLevel;

  return (
    <div className="space-y-4">
      {!hasSurveyLevel && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            Brak poziomu doświadczenia w wywiadzie. Uzupełnij wywiad treningowy przed generowaniem.
            Dane poniżej zostaną zapisane, ale generator będzie zablokowany.
          </p>
        </div>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays size={14} />
            Harmonogram treningu
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="trainingDays" className="text-sm">
              Liczba dni treningowych / tydzień
              {data.input.availableDays && (
                <span className="text-muted-foreground ml-1 text-xs">(wywiad: {data.input.availableDays})</span>
              )}
            </Label>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDaysChange(d)}
                  className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors
                    ${prefs.trainingDays === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionDuration" className="text-sm">
              Czas sesji (minuty)
              {data.input.sessionDurationMinutes && (
                <span className="text-muted-foreground ml-1 text-xs">(wywiad: {data.input.sessionDurationMinutes} min)</span>
              )}
            </Label>
            <div className="flex items-center gap-2 max-w-[200px]">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <Input
                id="sessionDuration"
                type="number"
                min={20}
                max={180}
                value={prefs.sessionDurationMinutes}
                onChange={(e) => set("sessionDurationMinutes", Math.max(20, Math.min(180, Number(e.target.value))))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground shrink-0">min</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <Dumbbell size={14} />
            Podział treningowy (split)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {splitOptions.map(({ value, label, compatible }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("splitType", value as SplitType)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors text-left
                  ${prefs.splitType === value
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : compatible
                    ? "border-border hover:bg-muted"
                    : "border-border/50 text-muted-foreground hover:bg-muted/50"
                  }`}
              >
                <span>{label}</span>
                {!compatible && value !== "custom" && (
                  <span className="text-[10px] text-muted-foreground ml-2 border rounded px-1">
                    {prefs.trainingDays} dni
                  </span>
                )}
                {prefs.splitType === value && <CheckCircle2 size={14} className="shrink-0 ml-2" />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Podziały rekomendowane dla {prefs.trainingDays} dni treningowych są wyróżnione.
            Możesz wybrać dowolny, w tym niestandarowe konfiguracje.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays size={14} />
            Długość bloku treningowego
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4 space-y-3">
          <div className="space-y-2">
            <Label className="text-sm">Liczba tygodni (4–12)</Label>
            <div className="flex items-center gap-3 flex-wrap">
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => set("blockDurationWeeks", w)}
                  className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors
                    ${prefs.blockDurationWeeks === w
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                    }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Standardowy mezocykl: 6 tygodni. Dla zaawansowanych można stosować 8–12 tygodni.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-muted/20 border-b border-border/40">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge size={14} />
            Cel i priorytety
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="trainingGoal" className="text-sm">
              Cel treningowy
              {data.input.trainingGoal && (
                <span className="text-muted-foreground ml-1 text-xs">(wywiad: {data.input.trainingGoal})</span>
              )}
            </Label>
            <Input
              id="trainingGoal"
              value={prefs.trainingGoal ?? ""}
              onChange={(e) => set("trainingGoal", e.target.value || null)}
              placeholder="np. Hipertrofia, Siła, Redukcja..."
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trainerRestrictions" className="text-sm">
              Uwagi trenera (opcjonalnie)
            </Label>
            <Textarea
              id="trainerRestrictions"
              value={prefs.trainerRestrictions ?? ""}
              onChange={(e) => set("trainerRestrictions", e.target.value || null)}
              placeholder="Wyjątkowe wskazówki lub ograniczenia dla generatora..."
              className="resize-none text-sm"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Polish set pluralization ─────────────────────────────────────────────────

/**
 * Returns the correct Polish noun form for a set count.
 *   1        → "seria"
 *   2, 3, 4  → "serie"
 *   5+       → "serii"
 *
 * Handles teens (11–14) correctly — they take "serii".
 */
function pluralizeSets(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 1) return "seria";
  const lastTwo = abs % 100;
  const lastOne = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "serii";
  if (lastOne >= 2 && lastOne <= 4) return "serie";
  return "serii";
}

// ─── Split recommendation reason texts ───────────────────────────────────────

const SPLIT_RECOMMENDATION_REASONS: Partial<Record<string, string>> = {
  upper_lower:
    "Rekomendacja wynika z 4 dni treningowych, możliwości trenowania każdej głównej partii 2 razy w tygodniu oraz prostego rozłożenia objętości.",
};

// ─── Phase 3B — Daily distribution section ────────────────────────────────────

function DistributionSection({
  result,
  isLoading,
  error,
  trainingDays,
  onRecalculate,
}: {
  result: WeeklyVolumeDistributionResponseType | null;
  isLoading: boolean;
  error: string | null;
  trainingDays: number;
  onRecalculate: () => void;
}) {
  const consistencyCheck = result ? checkDistributionConsistency(result, trainingDays) : null;

  return (
    <div className="space-y-3 pt-4">
      {/* Header + button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays size={14} />
          Rozkład objętości na dni
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={onRecalculate}
          disabled={isLoading}
          className="gap-1.5 text-xs h-7"
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RotateCcw size={12} />
          )}
          Przelicz rozkład
        </Button>
      </div>

      {/* API error */}
      {error && !isLoading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Result */}
      {result && !isLoading && (
        <>
          {/* Inconsistency warning — shown instead of data, not silently repaired */}
          {consistencyCheck && !consistencyCheck.isConsistent && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Dane rozkładu są niespójne. Spróbuj przeliczyć ponownie.
              </p>
            </div>
          )}

          {consistencyCheck?.isConsistent && (
            <>
              {/* Summary */}
              <Card className="border-border/50 shadow-sm">
                <CardContent className="px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Rekomendowany podział</span>
                    <span className="font-medium">
                      {SPLIT_TYPE_LABELS[result.recommendedSplitType] ?? result.recommendedSplitType}
                    </span>
                  </div>
                  {SPLIT_RECOMMENDATION_REASONS[result.recommendedSplitType] && (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {SPLIT_RECOMMENDATION_REASONS[result.recommendedSplitType]}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Wybrany podział</span>
                    <span className="font-medium">
                      {SPLIT_TYPE_LABELS[result.selectedSplitType] ?? result.selectedSplitType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Liczba dni</span>
                    <span className="font-medium">{result.trainingDays}</span>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Ostrzeżenia</span>
                      <span className="font-medium text-amber-700">{result.warnings.length}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Global distribution warnings */}
              {result.warnings
                .filter((w) => w.severity === "error" || w.severity === "warning")
                .map((w, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-start gap-2"
                  >
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700">{w.message}</p>
                  </div>
                ))}

              {/* Day cards */}
              <div className="space-y-2">
                {result.days.map((day) => (
                  <Card key={day.dayIndex} className="border-border/50 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          Dzień {day.dayIndex + 1}: {day.dayName}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {day.dayType}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Step 3 — Volume decisions ────────────────────────────────────────────────

const RECOVERY_LABEL: Record<string, string> = {
  good: "Dobra",
  neutral: "Standardowa",
  reduced: "Ograniczona",
};

const RECOVERY_COLOR: Record<string, string> = {
  good: "text-emerald-600",
  neutral: "text-muted-foreground",
  reduced: "text-amber-600",
};

function TargetDecisionCard({
  decision,
  overrideValue,
  onOverride,
  onReset,
}: {
  decision: WeeklyVolumeTargetDecisionType;
  overrideValue: number | undefined;
  onOverride: (targetId: number, value: number) => void;
  onReset: (targetId: number) => void;
}) {
  const selectedValue = overrideValue !== undefined ? overrideValue : decision.selectedValue;
  const isOverridden = overrideValue !== undefined;
  const step = 1;

  // Zone detection for visual states
  // Zone B: preferredMin ≤ v ≤ preferredMax   → normal
  // Zone C: preferredMax < v ≤ absoluteMax    → amber (accepted, non-blocking warning)
  const isAbovePreferred =
    selectedValue > decision.preferredMax && selectedValue <= decision.absoluteMax;

  // Local state for text input: tracks raw input string and validation error.
  // We do NOT silently clamp — invalid values show an error and are not applied.
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // Displayed value in the input box: raw typing takes priority; otherwise the current selectedValue.
  const displayValue = rawInput !== null ? rawInput : String(selectedValue);

  function adjust(delta: number) {
    // Stepper buttons: whole integer steps.
    // − stops at preferredMin; + goes up to absoluteMax (Zone C allowed).
    const next = Math.round(selectedValue + delta);
    const bounded = Math.max(decision.preferredMin, Math.min(decision.absoluteMax, next));
    setRawInput(null);
    setInputError(null);
    onOverride(decision.targetId, bounded);
  }

  function handleInputChange(raw: string) {
    setRawInput(raw);
    const v = parseFloat(raw);
    if (isNaN(v) || raw.trim() === "") {
      setInputError("Nieprawidłowa wartość");
      return;
    }
    // Zone A: below preferredMin → reject
    if (v < decision.preferredMin) {
      setInputError(`Minimum: ${decision.preferredMin} serii`);
      return;
    }
    // Zone D: above absoluteMax → reject
    if (v > decision.absoluteMax) {
      setInputError(`Limit absolutny: ${decision.absoluteMax} serii`);
      return;
    }
    // Non-integer — reject; do not silently round
    if (!Number.isInteger(v)) {
      setInputError("Wartość musi być liczbą całkowitą");
      return;
    }
    // Zone B or C — valid integer, apply
    setInputError(null);
    onOverride(decision.targetId, v);
  }

  function handleInputBlur() {
    // If the field was left with an error, restore the last valid value.
    if (inputError !== null) {
      setRawInput(null);
      setInputError(null);
    }
  }

  return (
    <Card
      className={[
        "border-border/50 shadow-sm transition-colors",
        decision.isExcluded ? "opacity-60" : "",
        isAbovePreferred ? "border-amber-300 bg-amber-50/30" : "",
      ].join(" ")}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{decision.targetName}</span>
              {decision.priorityOrder === 1 && (
                <Badge className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-800 border-yellow-200 border">
                  priorytet 1
                </Badge>
              )}
              {decision.priorityOrder === 2 && (
                <Badge className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 border">
                  priorytet 2
                </Badge>
              )}
              {decision.priorityOrder === 3 && (
                <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border">
                  priorytet 3
                </Badge>
              )}
              {decision.isExcluded && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  zdepriorytetowana
                </Badge>
              )}
              {isOverridden && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${isAbovePreferred ? "text-amber-700 border-amber-300 bg-amber-50" : "text-blue-600 border-blue-200 bg-blue-50"}`}
                >
                  ustawione ręcznie
                </Badge>
              )}
            </div>
            {/* Three-threshold display */}
            <p className="text-xs text-muted-foreground mt-0.5">
              Zakres zalecany:{" "}
              <span className="font-medium text-foreground">
                {decision.preferredMin}–{decision.preferredMax}
              </span>{" "}
              serii/tydz.
            </p>
            {decision.absoluteMax > decision.preferredMax && (
              <p className="text-xs text-muted-foreground">
                Limit absolutny:{" "}
                <span className="font-medium">{decision.absoluteMax}</span> serii/tydz.
              </p>
            )}
          </div>

          {/* Stepper control */}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjust(-step)}
                disabled={selectedValue <= decision.preferredMin}
                className="w-7 h-7 rounded border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <Minus size={12} />
              </button>
              <div className="w-16">
                <Input
                  type="number"
                  value={displayValue}
                  step={step}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onBlur={handleInputBlur}
                  className={`h-7 text-center text-sm font-medium px-1 ${
                    inputError
                      ? "border-red-400 focus-visible:ring-red-400"
                      : isAbovePreferred
                        ? "border-amber-400 focus-visible:ring-amber-400"
                        : ""
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={() => adjust(step)}
                disabled={selectedValue >= decision.absoluteMax}
                className="w-7 h-7 rounded border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {inputError && (
              <span className="text-[10px] text-red-500 leading-none">{inputError}</span>
            )}
            {!inputError && isAbovePreferred && (
              <span className="text-[10px] text-amber-600 leading-none">powyżej zalecanego</span>
            )}
          </div>
        </div>

        {/* Proposal vs. override indicator */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Propozycja systemu:{" "}
            <span className="font-medium text-foreground">{decision.recommendedValue} {pluralizeSets(decision.recommendedValue)}</span>
            {isOverridden && (
              <>
                {" → "}
                <span className={`font-medium ${isAbovePreferred ? "text-amber-700" : "text-blue-600"}`}>
                  {selectedValue} {pluralizeSets(selectedValue)} (ręcznie)
                </span>
              </>
            )}
          </div>
          {isOverridden && (
            <button
              type="button"
              onClick={() => onReset(decision.targetId)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw size={10} />
              Przywróć propozycję
            </button>
          )}
        </div>

        {/* Reasoning — separate list items, not concatenated */}
        {decision.reasons.length > 0 && (
          <ul className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
            {decision.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <span className="mt-px shrink-0 text-muted-foreground/40">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Warnings */}
        {decision.warnings.filter(w => w.severity !== "info").map((w, i) => (
          <div key={i} className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border/30">
            <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
            <span className="text-[11px] text-amber-700">{w.message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Step3Volume({
  decisions,
  overrides,
  onOverride,
  onReset,
  distributionResult,
  distributionLoading,
  distributionError,
  onRecalculate,
  trainingDays,
}: {
  decisions: WeeklyVolumeDecisionResponseType;
  overrides: Record<number, number>;
  onOverride: (targetId: number, value: number) => void;
  onReset: (targetId: number) => void;
  distributionResult: WeeklyVolumeDistributionResponseType | null;
  distributionLoading: boolean;
  distributionError: string | null;
  onRecalculate: () => void;
  trainingDays: number;
}) {
  const overrideCount = Object.keys(overrides).length;
  const recoveryProfile = decisions.metadata.recoveryProfile;
  const warningCount = decisions.summary.targetsWithWarnings;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-muted-foreground">
                {decisions.decisions.length} celów obliczonych
              </span>
            </div>
            {overrideCount > 0 && (
              <div className="flex items-center gap-2">
                <Gauge size={14} className="text-blue-600" />
                <span className="text-blue-600 font-medium">
                  {overrideCount} ustawionych ręcznie
                </span>
              </div>
            )}
            {recoveryProfile && (
              <div className={`flex items-center gap-1.5 ${RECOVERY_COLOR[recoveryProfile] ?? ""}`}>
                <Shield size={13} />
                <span className="text-xs">
                  Regeneracja: {RECOVERY_LABEL[recoveryProfile] ?? recoveryProfile}
                </span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle size={13} />
                <span className="text-xs">{warningCount} ostrzeżeń</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Global warnings */}
      {decisions.warnings.filter((w) => w.severity === "error" || w.severity === "warning").map((w, i) => (
        <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">{w.message}</p>
        </div>
      ))}

      {/* Target decision cards */}
      <div className="space-y-2">
        {decisions.decisions.map((d) => (
          <TargetDecisionCard
            key={d.targetId}
            decision={d}
            overrideValue={overrides[d.targetId]}
            onOverride={onOverride}
            onReset={onReset}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Wartości w punktach objętości efektywnej na tydzień. Zakres oparty o wytyczne objętości dla poziomu{" "}
        <span className="font-medium">{decisions.metadata.experienceLevel}</span>.
      </p>

      {/* Core / brzuch auxiliary block card */}
      {distributionResult && (
        <Card className="border-slate-200 bg-slate-50/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">Core / brzuch</span>
                  {distributionResult.auxiliaryCoreBlock.isPriority && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-800 border-yellow-200 border">
                      priorytet
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bezpośrednie serie na mięśnie brzucha i stabilizację tułowia.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-semibold">
                  {distributionResult.auxiliaryCoreBlock.weeklySelectedSets}{" "}{pluralizeSets(distributionResult.auxiliaryCoreBlock.weeklySelectedSets)}/tydz.
                </span>
              </div>
            </div>
            {distributionResult.auxiliaryCoreBlock.dayAllocations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-1">
                {distributionResult.auxiliaryCoreBlock.dayAllocations.map((a) => (
                  <div key={a.dayIndex} className="text-xs text-muted-foreground">
                    Dzień {a.dayIndex + 1}{" "}—{" "}<span className="font-medium text-foreground">{a.sets} {pluralizeSets(a.sets)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 3B — Daily volume distribution */}
      <DistributionSection
        result={distributionResult}
        isLoading={distributionLoading}
        error={distributionError}
        trainingDays={trainingDays}
        onRecalculate={onRecalculate}
      />
    </div>
  );
}

// ─── Main wizard component ────────────────────────────────────────────────────

export default function PlanDraftWizard() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();

  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<PlanDraftGenerationPreferencesType | null>(null);
  const [volumeDecisions, setVolumeDecisions] = useState<WeeklyVolumeDecisionResponseType | null>(null);
  const [volumeOverrides, setVolumeOverrides] = useState<Record<number, number>>({});
  const [distributionResult, setDistributionResult] = useState<WeeklyVolumeDistributionResponseType | null>(null);
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraftByDay>({});

  // Live volume coverage — lifted here so Step 5 reuses the same result without recalculation
  const { previewResult, isLoading: coverageLoading } = useVolumeCoverage(
    clientId,
    exerciseDraft,
    distributionResult,
  );
  const lastDistributionKeyRef = useRef<string | null>(null);

  const { data, isLoading, isError } = useGetClientPlanDraftInput(clientId);
  const volumeMutation = useDraftVolumePreview();
  const distributionMutation = useDraftDistributionPreview();

  // Initialize preferences from default when data first loads
  const effectivePrefs = useMemo<PlanDraftGenerationPreferencesType | null>(() => {
    if (prefs) return prefs;
    if (!data) return null;
    const d = data as unknown as GetClientPlanDraftInputResponseType;
    return d.defaultPreferences;
  }, [prefs, data]);

  const typedData = data as unknown as GetClientPlanDraftInputResponseType | undefined;
  const hasBlockingWarnings = typedData?.warnings.some((w: PlanDraftInputWarningType) => w.blocking) ?? false;

  function handlePrefsChange(p: PlanDraftGenerationPreferencesType) {
    setPrefs(p);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  // Advance from Step 2 → Step 3: call volume preview API
  async function handleAdvanceToVolume() {
    if (!effectivePrefs || !typedData) return;
    try {
      const result = await volumeMutation.mutateAsync({
        clientId,
        preferences: {
          trainingDays: effectivePrefs.trainingDays,
          sessionDurationMinutes: effectivePrefs.sessionDurationMinutes,
          splitType: effectivePrefs.splitType,
          blockDurationWeeks: effectivePrefs.blockDurationWeeks,
          trainingGoal: effectivePrefs.trainingGoal,
          priorityMuscleGroups: effectivePrefs.priorityMuscleGroups,
          preferredTrainingStyle: effectivePrefs.preferredTrainingStyle,
          trainerRestrictions: effectivePrefs.trainerRestrictions,
        },
        trainerVolumeOverrides: Object.fromEntries(
          Object.entries(volumeOverrides).map(([k, v]) => [k, v]),
        ),
      });
      setVolumeDecisions(result);
      setStep(2);
    } catch (e) {
      // volumeMutation.error will display the error
    }
  }

  function handleVolumeOverride(targetId: number, value: number) {
    setVolumeOverrides((prev) => ({ ...prev, [targetId]: value }));
  }

  function handleVolumeReset(targetId: number) {
    setVolumeOverrides((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  }

  // ── Distribution (Phase 3B) ────────────────────────────────────────────────

  /** Build distribution request from current wizard state; null when preconditions unmet. */
  const distributionRequest = useMemo(() => {
    if (!volumeDecisions || !effectivePrefs || !typedData) return null;
    return buildDistributionRequest({
      clientId,
      experienceLevel: typedData.input.experienceLevel ?? null,
      trainingDays: effectivePrefs.trainingDays,
      selectedSplitType: effectivePrefs.splitType,
      volumeDecisions,
      volumeOverrides,
    });
  }, [clientId, typedData, effectivePrefs, volumeDecisions, volumeOverrides]);

  /**
   * Auto-recalculate distribution when any trigger input changes while on
   * the Objętość step. Duplicate-identical requests are suppressed via a ref.
   *
   * Triggers: trainingDays, splitType, priorities, any override change or reset
   * (all of these change distributionRequest, which drives the effect).
   */
  useEffect(() => {
    if (step !== 2 || !distributionRequest) return;
    const key = JSON.stringify(distributionRequest);
    if (key === lastDistributionKeyRef.current) return;
    lastDistributionKeyRef.current = key;
    distributionMutation.mutate(distributionRequest, {
      onSuccess: (result: WeeklyVolumeDistributionResponseType) => setDistributionResult(result),
      onError: () => setDistributionResult(null),
    });
  }, [step, distributionRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Manual "Przelicz rozkład" button handler — forces a re-fire. */
  const handleRecalculate = useCallback(() => {
    if (!distributionRequest) return;
    const key = JSON.stringify(distributionRequest);
    lastDistributionKeyRef.current = key;
    distributionMutation.mutate(distributionRequest, {
      onSuccess: (result: WeeklyVolumeDistributionResponseType) => setDistributionResult(result),
      onError: () => setDistributionResult(null),
    });
  }, [distributionRequest, distributionMutation]);

  // ── Exercise step unlock ───────────────────────────────────────────────────

  /**
   * "Ćwiczenia" unlocks when:
   *   - volume decisions exist
   *   - distribution result is present and has no blocking issues
   *   - distribution is internally consistent
   * If any earlier step becomes invalid, this returns false and the step locks again.
   */
  const isExerciseStepUnlocked = useMemo(() => {
    if (!volumeDecisions || !distributionResult || !effectivePrefs) return false;
    if (distributionResult.hasBlockingIssues) return false;
    // Require the separate Core block to be present
    if (!distributionResult.auxiliaryCoreBlock) return false;
    const consistency = checkDistributionConsistency(distributionResult, effectivePrefs.trainingDays);
    return consistency.isConsistent;
  }, [volumeDecisions, distributionResult, effectivePrefs]);

  /**
   * "Podgląd" unlocks when the exercise step is valid AND every exercise
   * prescription is structurally correct.
   *
   * Volume coverage warnings are advisory-only — they must never block Step 5.
   */
  const isPreviewStepUnlocked = useMemo(() => {
    if (!isExerciseStepUnlocked || !distributionResult) return false;
    const validation = getExerciseStepValidation(distributionResult.days, exerciseDraft);
    if (validation.code !== EXERCISE_SELECTION_VALID) return false;
    return validatePrescription(exerciseDraft).length === 0;
  }, [isExerciseStepUnlocked, distributionResult, exerciseDraft]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl pb-12 animate-in fade-in duration-300">
        <div className="space-y-2">
          <Link
            href={`/clients/${clientId}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowLeft size={16} />
            Powrót do klienta
          </Link>
          <h1 className="text-3xl font-display font-bold tracking-tight">Generuj szkic planu</h1>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError || !typedData) {
    return (
      <div className="space-y-6 max-w-3xl pb-12 animate-in fade-in duration-300">
        <Link
          href={`/clients/${clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />
          <p className="text-sm text-destructive font-medium">Nie udało się załadować danych klienta.</p>
          <p className="text-xs text-muted-foreground mt-1">Sprawdź połączenie i odśwież stronę.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-2">
        <Link
          href={`/clients/${clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-3">
              <Sparkles className="w-7 h-7 text-primary" />
              Generuj szkic planu
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {typedData.client.firstName} {typedData.client.lastName}
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="overflow-x-auto">
        <Stepper
          current={step}
          exerciseStepUnlocked={isExerciseStepUnlocked}
          previewStepUnlocked={isPreviewStepUnlocked}
        />
      </div>

      {/* Step content */}
      {step === 0 && <Step1Summary data={typedData} />}
      {step === 1 && effectivePrefs && (
        <Step2Preferences
          data={typedData}
          prefs={effectivePrefs}
          onPrefsChange={handlePrefsChange}
        />
      )}
      {step === 2 && volumeDecisions && effectivePrefs && (
        <Step3Volume
          decisions={volumeDecisions}
          overrides={volumeOverrides}
          onOverride={handleVolumeOverride}
          onReset={handleVolumeReset}
          distributionResult={distributionResult}
          distributionLoading={distributionMutation.isPending}
          distributionError={
            distributionMutation.isError
              ? "Nie udało się obliczyć rozkładu. Sprawdź dane i spróbuj ponownie."
              : null
          }
          onRecalculate={handleRecalculate}
          trainingDays={effectivePrefs.trainingDays}
        />
      )}
      {step === 3 && isExerciseStepUnlocked && distributionResult && (
        <Step4Exercises
          distributionResult={distributionResult}
          exerciseDraft={exerciseDraft}
          onDraftChange={setExerciseDraft}
          clientId={clientId}
          previewResult={previewResult}
          coverageLoading={coverageLoading}
          experienceLevel={typedData?.input.experienceLevel ?? null}
        />
      )}
      {step === 3 && !isExerciseStepUnlocked && (
        <Card className="border-dashed border-border/60 shadow-sm">
          <CardContent className="py-10 text-center">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Uzupełnij lub popraw wcześniejsze etapy, aby kontynuować dobór ćwiczeń.
            </p>
          </CardContent>
        </Card>
      )}
      {step === 4 && distributionResult && effectivePrefs && (
        <Step5Preview
          typedData={typedData}
          effectivePrefs={effectivePrefs}
          distributionResult={distributionResult}
          exerciseDraft={exerciseDraft}
          previewResult={previewResult}
          coverageLoading={coverageLoading}
          clientId={clientId}
          onBack={() => setStep(3)}
        />
      )}
      {step > 4 && <LockedStepPlaceholder step={step} />}

      {/* Mutation error for volume fetch */}
      {volumeMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            Nie udało się obliczyć objętości. Sprawdź dane klienta i spróbuj ponownie.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={step === 0 ? () => navigate(`/clients/${clientId}`) : handleBack}
          className="gap-2"
          disabled={volumeMutation.isPending}
        >
          <ArrowLeft size={14} />
          {step === 0 ? "Anuluj" : "Wstecz"}
        </Button>

        <div className="flex gap-3">
          {step === 0 && (
            <Button onClick={() => setStep(1)} className="gap-2">
              Dalej
              <ArrowRight size={14} />
            </Button>
          )}
          {step === 1 && (
            <Button
              onClick={handleAdvanceToVolume}
              disabled={hasBlockingWarnings || volumeMutation.isPending}
              className="gap-2"
            >
              {volumeMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Obliczanie…
                </>
              ) : (
                <>
                  Oblicz objętość
                  <ArrowRight size={14} />
                </>
              )}
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={() => { if (isExerciseStepUnlocked) setStep(3); }}
              disabled={!isExerciseStepUnlocked}
              className="gap-2"
              title={!isExerciseStepUnlocked ? "Przelicz rozkład, aby przejść do doboru ćwiczeń" : ""}
            >
              {isExerciseStepUnlocked ? (
                <>
                  Dobierz ćwiczenia
                  <ArrowRight size={14} />
                </>
              ) : (
                <>
                  <Lock size={14} />
                  Przelicz rozkład, aby kontynuować
                </>
              )}
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => { if (isPreviewStepUnlocked) setStep(4); }}
              disabled={!isPreviewStepUnlocked}
              className="gap-2"
              title={
                !isPreviewStepUnlocked
                  ? "Uzupełnij wszystkie dni treningowe i popraw nieprawidłowe parametry ćwiczeń, aby przejść do podglądu."
                  : undefined
              }
            >
              {isPreviewStepUnlocked ? (
                <>
                  Podgląd
                  <ArrowRight size={14} />
                </>
              ) : (
                <>
                  <Lock size={14} />
                  Uzupełnij ćwiczenia, aby przejść do podglądu
                </>
              )}
            </Button>
          )}
          {step >= 4 && (
            <Button disabled className="gap-2 opacity-50 cursor-not-allowed">
              <Lock size={14} />
              Zapis planu — kolejny etap
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
