/**
 * PlanDraftWizard — Workout Plan Draft Generator, Phase 1
 *
 * A 5-step wizard that collects all data required for the Workout Plan Draft Generator.
 * Phase 1: Steps 1 & 2 are functional. Steps 3–5 show "Dostępne w kolejnych etapach".
 *
 * Step 1 — Client & data summary  : read-only normalized view of survey data
 * Step 2 — Plan assumptions       : editable overrides (days, split, duration, etc.)
 * Step 3 — Objętość               : (Phase 2)
 * Step 4 — Dobór ćwiczeń          : (Phase 3)
 * Step 5 — Podgląd szkicu         : (Phase 4)
 */

import { useState, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetClientPlanDraftInput } from "@workspace/api-client-react";
import {
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
  getCompatibleSplits,
  type SplitType,
  type PlanDraftGenerationPreferencesType,
  type PlanDraftInputWarningType,
  type GetClientPlanDraftInputResponseType,
} from "@workspace/api-zod";
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
} from "lucide-react";

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
  { label: "Objętość", icon: Gauge, locked: true },
  { label: "Ćwiczenia", icon: Dumbbell, locked: true },
  { label: "Podgląd", icon: Sparkles, locked: true },
];

function Stepper({ current }: { current: number }) {
  return (
    <nav className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const isLocked = step.locked && !isDone;
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
  const labels = ["Objętość treningowa", "Dobór ćwiczeń", "Podgląd szkicu planu"];
  const phases = ["Faza 2", "Faza 3", "Faza 4"];
  const idx = step - 2;
  return (
    <Card className="border-dashed border-border/60 shadow-sm">
      <CardContent className="py-16 text-center">
        <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold text-muted-foreground mb-1">{labels[idx]}</h3>
        <p className="text-sm text-muted-foreground">
          Dostępne w kolejnych etapach ({phases[idx]}).
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Uzupełnij założenia planu, aby przygotować dane dla kolejnego etapu.
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
      {/* Warnings */}
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

      {/* Client info */}
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

      {/* Training profile */}
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

      {/* Location & equipment */}
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

      {/* Recovery */}
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

      {/* Priorities */}
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

  // Auto-adjust split if no longer compatible when days change
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

      {/* Training schedule */}
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

      {/* Split type */}
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

      {/* Block duration */}
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

      {/* Training goal & priorities */}
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

// ─── Main wizard component ────────────────────────────────────────────────────

export default function PlanDraftWizard() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();

  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<PlanDraftGenerationPreferencesType | null>(null);

  const { data, isLoading, isError } = useGetClientPlanDraftInput(clientId);

  // Initialize preferences from default when data first loads
  const effectivePrefs = useMemo<PlanDraftGenerationPreferencesType | null>(() => {
    if (prefs) return prefs;
    if (!data) return null;
    const d = data as unknown as GetClientPlanDraftInputResponseType;
    return d.defaultPreferences;
  }, [prefs, data]);

  function handlePrefsChange(p: PlanDraftGenerationPreferencesType) {
    setPrefs(p);
  }

  function handleNext() {
    if (step < 4) setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  const typedData = data as unknown as GetClientPlanDraftInputResponseType | undefined;
  const hasBlockingWarnings = typedData?.warnings.some((w: PlanDraftInputWarningType) => w.blocking) ?? false;

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
        <Stepper current={step} />
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
      {step >= 2 && <LockedStepPlaceholder step={step} />}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={step === 0 ? () => navigate(`/clients/${clientId}`) : handleBack}
          className="gap-2"
        >
          <ArrowLeft size={14} />
          {step === 0 ? "Anuluj" : "Wstecz"}
        </Button>

        <div className="flex gap-3">
          {step < 1 && (
            <Button onClick={handleNext} className="gap-2">
              Dalej
              <ArrowRight size={14} />
            </Button>
          )}
          {step === 1 && (
            <Button
              onClick={handleNext}
              disabled={step >= 1}
              className="gap-2"
              title="Dostępne w kolejnych etapach"
            >
              <Lock size={14} />
              Zapisz założenia
            </Button>
          )}
          {step >= 2 && (
            <Button disabled className="gap-2 opacity-50">
              <Lock size={14} />
              Dostępne w kolejnych etapach
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
