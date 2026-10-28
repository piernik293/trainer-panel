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

import { blockDurationRange } from "@workspace/survey-config";
import { clientFullName } from "@/lib/clientName";
import { StepHint } from "@/components/dashboard/StepHint";
import { useState, useMemo, useEffect, useRef } from "react";
import { humanizeError } from "@/lib/userError";
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
  type SplitRecommendationType,
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
  HeartPulse,
  Activity,
  Trophy,
  Zap,
} from "lucide-react";
import Step4Exercises from "./Step4Exercises";
import Step5Preview from "./Step5Preview";
import { PlanReadySummary } from "@/components/PlanReadySummary";
import {
  type ExerciseDraftByDay,
  validatePrescription,
  getExerciseStepValidation,
  EXERCISE_SELECTION_VALID,
  type GeneratedDayExplanation,
} from "@/lib/exerciseDraftHelpers";
import { useVolumeCoverage } from "@/hooks/useVolumeCoverage";
import { useSaveDraftPlan } from "@/lib/planApi";
import { useToast } from "@/hooks/use-toast";

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
          !(i === 2 && exerciseStepUnlocked) &&
          !(i === 3 && previewStepUnlocked);
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
        <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
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

// ─── Safety alert banners (Features 1, 2, 3, 4) ──────────────────────────────

/**
 * RED — pain keywords detected in health-related text.
 * Trainer warning only — no diagnosis, no automatic exercise blocking.
 */
function PainAlertBanner({ healthText }: { healthText: string | null }) {
  return (
    <div className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <HeartPulse size={18} className="text-red-600 shrink-0" />
        <span className="font-semibold text-red-700 text-sm">
          Zwróć uwagę: klient zgłasza ból
        </span>
      </div>
      {healthText && (
        <p className="text-sm text-red-700 bg-red-100 rounded px-3 py-2 leading-snug">
          &ldquo;{healthText}&rdquo;
        </p>
      )}
      <ul className="text-sm text-red-700 space-y-1 pl-1 list-disc list-inside">
        <li>Zwróć uwagę na ćwiczenia, które mogą pogłębić ból.</li>
        <li>Zwróć uwagę na ćwiczenia, które mogą poprawić samopoczucie lub zmniejszyć dolegliwości, jeśli są dobrze tolerowane.</li>
        <li>W przypadku utrzymującego się bólu skieruj klienta do fizjoterapeuty.</li>
      </ul>
    </div>
  );
}

/**
 * YELLOW — health limitation declared without pain keywords.
 * Less severe than RED — shows the client's description prominently.
 */
function HealthLimitationBanner({ healthText }: { healthText: string | null }) {
  return (
    <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <span className="font-semibold text-amber-700 text-sm">
          Uwaga: zgłoszono zdrowie / ograniczenia
        </span>
      </div>
      {healthText && (
        <p className="text-sm text-amber-800 bg-amber-100 rounded px-3 py-2 leading-snug">
          &ldquo;{healthText}&rdquo;
        </p>
      )}
      <p className="text-xs text-amber-700">
        Uwzględnij te informacje przy doborze ćwiczeń i obciążeń.
      </p>
    </div>
  );
}

/**
 * INDIGO — athlete / sport info + Plyo recommendation (athlete-specific survey support).
 */
function AthletePlyoBanner({ athleteRec }: {
  athleteRec: {
    athleteStatus: string;
    sportDiscipline: string | null;
    performanceNeeds: string[];
    plyoRecommended: boolean;
    plyoReason: string | null;
  };
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <Trophy size={15} className="text-indigo-600 shrink-0" />
        <span className="font-semibold text-indigo-700 text-sm">Klient uprawia sport</span>
      </div>
      <div className="text-sm text-indigo-700 space-y-0.5">
        {athleteRec.sportDiscipline && (
          <p>Sport: <span className="font-medium">{athleteRec.sportDiscipline}</span></p>
        )}
        <p>Status: <span className="font-medium">{athleteRec.athleteStatus}</span></p>
        {athleteRec.performanceNeeds.length > 0 && (
          <p>Cele sportowe: <span className="font-medium">{athleteRec.performanceNeeds.join(", ")}</span></p>
        )}
      </div>
      {athleteRec.plyoRecommended && athleteRec.plyoReason && (
        <div className="text-sm text-indigo-700 bg-indigo-100 rounded px-3 py-2 leading-snug">
          {athleteRec.plyoReason}
        </div>
      )}
    </div>
  );
}

/**
 * INFO — cardio / steps recommendation (Feature 3) and conditioning note (Feature 4).
 */
function CardioConditioningBanner({
  cardioText,
  conditioningText,
}: {
  cardioText: string | null;
  conditioningText: string | null;
}) {
  if (!cardioText && !conditioningText) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-blue-600 shrink-0" />
        <span className="font-semibold text-blue-700 text-sm">
          Rekomendacje aktywności
        </span>
      </div>
      {cardioText && (
        <p className="text-sm text-blue-700 leading-snug">{cardioText}</p>
      )}
      {conditioningText && (
        <p className="text-sm text-blue-700 leading-snug">{conditioningText}</p>
      )}
    </div>
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

  // Safety alerts and recommendations from the API (new fields — cast for TS compatibility)
  const d = data as unknown as {
    safetyAlerts?: { painDetected: boolean; hasHealthLimitation: boolean; healthText: string | null } | null;
    cardioRecommendation?: { type: string; text: string; reason: string } | null;
    conditioningRecommendation?: { text: string } | null;
    athleteRecommendation?: {
      isAthlete: true;
      athleteStatus: string;
      sportDiscipline: string | null;
      performanceNeeds: string[];
      plyoRecommended: boolean;
      plyoReason: string | null;
      plyoSessionLabel: string | null;
    } | null;
    /** null = trainer has not yet made a decision (pending), "accepted" | "declined" = decided */
    adaptiveStartDecision?: string | null;
    adaptiveStartMode?: boolean;
  };
  const safetyAlerts = d.safetyAlerts ?? null;
  const cardioRecommendation = d.cardioRecommendation ?? null;
  const conditioningRecommendation = d.conditioningRecommendation ?? null;
  const athleteRecommendation = d.athleteRecommendation ?? null;
  const adaptiveStartDecision = d.adaptiveStartDecision ?? null;
  const adaptiveStartMode = d.adaptiveStartMode ?? false;
  const isBeginnerCandidate =
    input.experienceLevel === "Brak aktywności fizycznej" ||
    input.experienceLevel === "Początkujący";

  const showPainAlert = safetyAlerts?.painDetected === true;
  const showHealthAlert = safetyAlerts?.hasHealthLimitation === true && !showPainAlert;
  const showCardioNote = !!(cardioRecommendation?.text || conditioningRecommendation?.text);

  const recoveryLabels: Record<string, string> = {
    excellent: "Doskonała",
    good: "Dobra",
    standard: "Standardowa",
    poor: "Słaba",
  };

  // Two-column layout is active whenever at least one warning or recommendation exists.
  // When neither exists the outer div has no class and behaves as a plain block.
  const hasRightPanel = showPainAlert || showHealthAlert || showCardioNote;

  return (
    <div
      className={hasRightPanel ? "lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start" : ""}
    >
      {/* Left column — main data sections + mobile-only warning cards */}
      <div className="space-y-4 min-w-0">
        {/* Mobile: warning / recommendation cards sit ABOVE the data sections.
            On desktop (lg+) they are hidden here — the sticky right panel shows them. */}
        {hasRightPanel && (
          <div
            className="lg:hidden space-y-3"
            role="region"
            aria-label="Ostrzeżenia i rekomendacje"
            data-testid="mobile-cards"
          >
            {showPainAlert && (
              <PainAlertBanner healthText={safetyAlerts?.healthText ?? null} />
            )}
            {showHealthAlert && (
              <HealthLimitationBanner healthText={safetyAlerts?.healthText ?? null} />
            )}
            {showCardioNote && (
              <CardioConditioningBanner
                cardioText={cardioRecommendation?.text ?? null}
                conditioningText={conditioningRecommendation?.text ?? null}
              />
            )}
          </div>
        )}

        {/* Athlete / sport info + Plyo recommendation — always in the main column */}
        {athleteRecommendation?.isAthlete && (
          <AthletePlyoBanner athleteRec={athleteRecommendation} />
        )}

        {/* Adaptive-start status — shown for beginner / no-activity candidates */}
        {isBeginnerCandidate && (
          <Card
            className={
              adaptiveStartDecision === "accepted"
                ? "border-emerald-200 bg-emerald-50/60 shadow-sm"
                : adaptiveStartDecision === "declined"
                ? "border-border/50 bg-muted/30 shadow-sm"
                : "border-sky-200 bg-sky-50/60 shadow-sm"
            }
          >
            <CardContent className="px-4 py-3 flex items-start gap-3">
              {adaptiveStartDecision === "accepted" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : adaptiveStartDecision === "declined" ? (
                <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    adaptiveStartDecision === "accepted"
                      ? "text-emerald-800"
                      : adaptiveStartDecision === "declined"
                      ? "text-muted-foreground"
                      : "text-sky-800"
                  }`}
                >
                  {adaptiveStartDecision === "accepted"
                    ? "Start adaptacyjny aktywny"
                    : adaptiveStartDecision === "declined"
                    ? "Start adaptacyjny pominięty"
                    : "Oczekuje na decyzję w sprawie startu adaptacyjnego"}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    adaptiveStartDecision === "accepted"
                      ? "text-emerald-700"
                      : adaptiveStartDecision === "declined"
                      ? "text-muted-foreground"
                      : "text-sky-700"
                  }`}
                >
                  {adaptiveStartDecision === "accepted"
                    ? "Wybór ćwiczeń zostanie dostosowany do etapu adaptacyjnego — łatwe do nauczenia, z progresją obciążenia."
                    : adaptiveStartDecision === "declined"
                    ? "Zostanie zastosowany standardowy dobór ćwiczeń z zachowaniem ograniczeń bezpieczeństwa."
                    : "Przejdź do profilu klienta i zdecyduj, czy zastosować start adaptacyjny przed wygenerowaniem planu."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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

      {/* Single interview-summary panel: flat internal sections separated by
          dividers instead of independent elevated cards. */}
      <Card className="border-border/50 shadow-sm divide-y divide-border/40">
        <section>
          <div className="pb-1 pt-4 px-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <User size={14} />
              Dane klienta
            </h3>
          </div>
          <div className="px-4 py-2">
          <div className="flex items-start justify-between gap-2 py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground w-44 shrink-0">Klient</span>
            <span className="text-sm font-medium text-right">{clientFullName(data.client)}</span>
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
          </div>
        </section>

        <section>
          <div className="pb-1 pt-3 px-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Dumbbell size={14} />
              Profil treningowy
            </h3>
          </div>
          <div className="px-4 py-1">
          <InfoRow label="Poziom doświadczenia" value={input.experienceLevel} source={sources.experienceLevel} />
          <InfoRow label="Cel treningowy" value={input.trainingGoal} source={sources.trainingGoal} />
          <InfoRow label="Dni treningowe / tydz." value={input.availableDays ? `${input.availableDays} dni` : null} source={sources.availableDays} />
          <InfoRow label="Czas sesji" value={input.sessionDurationMinutes ? `${input.sessionDurationMinutes} min` : null} source={sources.sessionDurationMinutes} />
          </div>
        </section>

        <section>
          <div className="pb-1 pt-3 px-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MapPin size={14} />
              Miejsce i sprzęt
            </h3>
          </div>
          <div className="px-4 py-1">
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
          </div>
        </section>

        <section>
          <div className="pb-1 pt-3 px-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield size={14} />
              Regeneracja i styl życia
            </h3>
          </div>
          <div className="px-4 py-1">
          <InfoRow label="Aktywność codzienna" value={input.dailyActivity} source={sources.dailyActivity} />
          <InfoRow label="Praca fizyczna" value={input.physicalWork ? "Tak" : input.dailyActivity ? "Nie" : null} source={sources.physicalWork} />
          <InfoRow label="Sen (godz.)" value={input.sleepHours ? `${input.sleepHours} h` : null} source={sources.sleepHours} />
          <InfoRow label="Poziom stresu" value={input.stressLevel != null ? `${input.stressLevel}/10` : null} source={sources.stressLevel} />
          <InfoRow
            label="Jakość regeneracji"
            value={input.recoveryQuality ? recoveryLabels[input.recoveryQuality] ?? input.recoveryQuality : null}
            source={sources.recoveryQuality}
          />
          </div>
        </section>

        <section>
          <div className="pb-1 pt-3 px-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Gauge size={14} />
              Preferencje i priorytety
            </h3>
          </div>
          <div className="px-4 py-1 pb-3">
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
          </div>
        </section>
      </Card>
      </div>{/* end left column */}

      {/* Desktop right-side panel — sits at the top of the right column and
          scrolls away naturally with the page (no sticky behavior). */}
      {hasRightPanel && (
        <aside
          className="hidden lg:block space-y-3"
          aria-label="Ostrzeżenia i rekomendacje"
          data-testid="right-panel"
        >
          {showPainAlert && (
            <PainAlertBanner healthText={safetyAlerts?.healthText ?? null} />
          )}
          {showHealthAlert && (
            <HealthLimitationBanner healthText={safetyAlerts?.healthText ?? null} />
          )}
          {showCardioNote && (
            <CardioConditioningBanner
              cardioText={cardioRecommendation?.text ?? null}
              conditioningText={conditioningRecommendation?.text ?? null}
            />
          )}
        </aside>
      )}
    </div>
  );
}

// ─── Split subtext descriptions (Part 3 — specialization vs custom) ──────────

/**
 * Short explanatory copy shown beneath the split option label for the two
 * choices trainers most often confuse. Keeps the rest of the split list lean.
 */
const SPLIT_SUBTEXTS: Partial<Record<SplitType, string>> = {
  specialization:
    "Układ ukierunkowany na mocniejsze rozwinięcie partii priorytetowych. " +
    "Struktura pozostaje systemowa — dobra, gdy trener chce bias priorytetowy bez ręcznego budowania dni.",
  custom:
    "Ręcznie dobierany układ dni dla większej swobody trenera. " +
    "System nadal podpowiada, czy układ jest spójny i praktyczny dla wybranego celu i liczby dni.",
};

/** Performance needs that justify surfacing the plyo-oriented split suggestion. */
const PLYO_JUSTIFYING_NEEDS_LOWER = new Set([
  "dynamika",
  "szybkość",
  "stabilizacja",
  "skoczność",
  "zmiana kierunku",
  "koordynacja",
]);

// ─── Step 2 — Plan assumptions ────────────────────────────────────────────────

function Step2Preferences({
  data,
  prefs,
  onPrefsChange,
  cardioRecommendation,
  conditioningRecommendation,
}: {
  data: GetClientPlanDraftInputResponseType;
  prefs: PlanDraftGenerationPreferencesType;
  onPrefsChange: (p: PlanDraftGenerationPreferencesType) => void;
  cardioRecommendation: { type: string; text: string; reason: string } | null;
  conditioningRecommendation: { text: string } | null;
}) {
  const compatibleSplits = useMemo(
    () => getCompatibleSplits(prefs.trainingDays),
    [prefs.trainingDays],
  );

  // Derive the live recommendation from the API data.
  // The recommendation reflects the survey data (days × level × recovery × goal).
  const rec = (data as unknown as { splitRecommendation?: SplitRecommendationType | null }).splitRecommendation ?? null;

  // ── Plyo-oriented split suggestion (Parts 1 & 2) ─────────────────────────
  // Extract athlete data from the already-typed response field.
  const athleteRec = data.athleteRecommendation ?? null;
  const isSportGoal =
    prefs.trainingGoal === "Cel sportowy" ||
    data.input.trainingGoal === "Cel sportowy";
  const hasPlyoNeeds =
    (athleteRec?.performanceNeeds ?? []).some((n) =>
      PLYO_JUSTIFYING_NEEDS_LOWER.has(n.toLowerCase()),
    );
  // Show the targeted Plyo banner when:
  //   • the goal is "Cel sportowy"
  //   • the athlete has plyo-justifying needs OR plyo is already recommended
  //   • ≥ 3 days are available (minimum for upper_lower_full_body)
  //   • upper_lower_full_body is a compatible option for the current day count
  const showPlyoBanner =
    isSportGoal &&
    (hasPlyoNeeds || athleteRec?.plyoRecommended === true) &&
    prefs.trainingDays >= 3 &&
    compatibleSplits.includes("upper_lower_full_body");

  const splitOptions = SPLIT_TYPES.map((s) => ({
    value: s,
    label: SPLIT_TYPE_LABELS[s],
    compatible: compatibleSplits.includes(s),
    recommended: rec?.recommended === s,
  }));

  function set<K extends keyof PlanDraftGenerationPreferencesType>(
    key: K,
    value: PlanDraftGenerationPreferencesType[K],
  ) {
    onPrefsChange({ ...prefs, [key]: value });
  }

  // Cycle length: recommended range by level (BA/P 8–12, Ś 6–8, Z 4–6); the trainer may pick any length from 4 to 12.
  const durationRange = blockDurationRange(data.input.experienceLevel);

  function handleDaysChange(days: number) {
    const newCompatible = getCompatibleSplits(days);
    const currentOk = newCompatible.includes(prefs.splitType);
    const newSplit = currentOk ? prefs.splitType : newCompatible[0] ?? "custom";
    onPrefsChange({ ...prefs, trainingDays: days, splitType: newSplit });
  }

  const hasSurveyLevel = !!data.input.experienceLevel;

  const hasCardioNote = !!(cardioRecommendation?.text || conditioningRecommendation?.text);

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

      {/* Cardio / conditioning guidance pulled directly from survey logic */}
      {hasCardioNote && (
        <CardioConditioningBanner
          cardioText={cardioRecommendation?.text ?? null}
          conditioningText={conditioningRecommendation?.text ?? null}
        />
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
          {/* Recommendation explanation banner */}
          {rec && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
              <Sparkles size={13} className="text-primary mt-0.5 shrink-0" />
              <div className="text-[11px] text-muted-foreground leading-snug space-y-1">
                <p>{rec.explanation}</p>
                {rec.cappedTrainingDays != null && (
                  <p className="font-medium text-amber-700">
                    Wywiad wskazuje {prefs.trainingDays} dni —
                    rekomendowana częstotliwość to maksymalnie {rec.cappedTrainingDays} dni/tydz.
                    na tym poziomie.
                  </p>
                )}
                {rec.fallbackApplied && !rec.cappedTrainingDays && (
                  <p className="font-medium text-amber-700">
                    Podział obniżony ze względu na słabszą regenerację.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {splitOptions.map(({ value, label, compatible, recommended }) => (
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
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="block">{label}</span>
                    {/* Part 1 — Sport / Plyo badge on upper_lower_full_body for eligible profiles */}
                    {value === "upper_lower_full_body" && showPlyoBanner && (
                      <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-semibold shrink-0">
                        Athletic / Plyo
                      </span>
                    )}
                  </span>
                  {value === "upper_lower_full_body" && showPlyoBanner ? (
                    <span className={`block text-[10px] font-normal leading-snug ${
                      prefs.splitType === value ? "text-primary" : "text-indigo-600"
                    }`}>
                      Ostatni dzień jako sesja FBW z akcentem plyometrycznym — dla profilu sportowego z priorytetem dynamiki / szybkości.
                    </span>
                  ) : SPLIT_SUBTEXTS[value as SplitType] ? (
                    <span className={`block text-[10px] font-normal leading-snug ${
                      prefs.splitType === value
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}>
                      {SPLIT_SUBTEXTS[value as SplitType]}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1.5 shrink-0 ml-2">
                  {recommended && prefs.splitType !== value && (
                    <span className="text-[10px] font-medium text-primary border border-primary/40 bg-primary/10 rounded px-1.5 py-0.5">
                      Rekomendowane
                    </span>
                  )}
                  {!compatible && value !== "custom" && (
                    <span className="text-[10px] text-muted-foreground border rounded px-1">
                      {prefs.trainingDays} dni
                    </span>
                  )}
                  {prefs.splitType === value && <CheckCircle2 size={14} className="text-primary" />}
                </span>
              </button>
            ))}

            {/* Part 2 — Disabled roadmap options: visible, not selectable, clearly marked */}
            {[
              {
                key: "kalistenika",
                label: "Kalistenika",
                subtext:
                  "Plan oparty o ćwiczenia z masą ciała i progresje kalisteniczne. Funkcja w przygotowaniu.",
              },
              {
                key: "bieganie",
                label: "Bieganie",
                subtext:
                  "Plan z ukierunkowaniem na bieganie / kondycję tlenową / pracę biegową. Funkcja w przygotowaniu.",
              },
            ].map(({ key, label, subtext }) => (
              <div
                key={key}
                aria-disabled="true"
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-border/40 bg-muted/20 text-sm opacity-55 cursor-not-allowed select-none"
              >
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="block text-muted-foreground font-medium">{label}</span>
                    <span className="text-[9px] bg-muted text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 font-semibold shrink-0">
                      W trakcie
                    </span>
                  </span>
                  <span className="block text-[10px] text-muted-foreground font-normal leading-snug">
                    {subtext}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {rec?.alternatives && rec.alternatives.length > 0 && (
            <p className="text-xs text-muted-foreground pt-0.5">
              Alternatywny podział:{" "}
              {rec.alternatives.map((a) => SPLIT_TYPE_LABELS[a]).join(", ")}.
              Możesz wybrać dowolny podział poniżej.
            </p>
          )}
          {!rec && (
            <p className="text-xs text-muted-foreground pt-1">
              Uzupełnij wywiad klienta, aby uzyskać rekomendację podziału.
            </p>
          )}

          {/* Plyo-oriented split suggestion — Parts 1 & 2.
              Only shown for sport profiles with explicit plyo-justifying needs
              (Dynamika / Szybkość / Stabilizacja / etc.) AND ≥ 3 training days.
              General sport-goal profiles without those needs do NOT see this. */}
          {showPlyoBanner && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-3 flex items-start gap-2 mt-1">
              <Zap size={13} className="text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-[11px] text-indigo-700 leading-snug space-y-1.5">
                <p className="font-semibold text-indigo-800">
                  Opcja: podział z dniem atletyczno-plyometrycznym
                </p>
                <p>
                  Dla tego profilu warto rozważyć jedną sesję z dominującym akcentem
                  dynamicznym lub plyometrycznym zamiast kolejnej powtarzającej się
                  sesji siłowej — inaczej niż w klasycznym układzie 1:1.
                </p>
                <p>
                  <span className="font-medium">Upper / Lower / Full Body</span>{" "}
                  — ostatni dzień może pełnić rolę sesji FBW z komponentem plyometrycznym
                  (skoki, ćwiczenia reaktywne, zmiany kierunku) zamiast drugiej sesji dolnych
                  partii.
                </p>
                <p className="text-indigo-600">
                  Rekomendacja wynika z celu sportowego
                  {hasPlyoNeeds && athleteRec?.performanceNeeds?.length
                    ? ` i priorytetów: ${athleteRec.performanceNeeds.join(" / ")}`
                    : ""}
                  . Opcja ta lepiej odzwierciedla wymagania motoryczne klienta niż
                  standardowy układ siłowy.
                </p>
              </div>
            </div>
          )}
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
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => {
                const recommended = w >= durationRange.min && w <= durationRange.max;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => set("blockDurationWeeks", w)}
                    aria-label={`${w} tygodni${recommended ? " (zalecane)" : ""}`}
                    className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors
                      ${prefs.blockDurationWeeks === w
                        ? "bg-primary text-primary-foreground border-primary"
                        : recommended ? "border-primary/60 hover:bg-muted" : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="block-duration-hint">
              Zalecane dla tego poziomu: {durationRange.min}–{durationRange.max} tygodni (domyślnie {durationRange.default}). Ćwiczenia główne zostają te same w całym cyklu; możesz wybrać inną długość.
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
              Ograniczenia / uwagi trenera
              {data.input.healthLimitations && (
                <span className="text-muted-foreground ml-1 text-xs">(wywiad: zdrowotne — wstępnie wypełnione)</span>
              )}
            </Label>
            <Textarea
              id="trainerRestrictions"
              value={prefs.trainerRestrictions ?? ""}
              onChange={(e) => set("trainerRestrictions", e.target.value || null)}
              placeholder="Ograniczenia zdrowotne, wyjątkowe wskazówki lub inne uwagi dla generatora..."
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
}: {
  result: WeeklyVolumeDistributionResponseType | null;
  isLoading: boolean;
  error: string | null;
  trainingDays: number;
}) {
  const consistencyCheck = result ? checkDistributionConsistency(result, trainingDays) : null;

  return (
    <div className="space-y-3 pt-4">
      {/* Header + auto-status indicator */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays size={14} />
          Rozkład objętości na dni
        </h3>
        {isLoading && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" />
            Przeliczam…
          </span>
        )}
        {!isLoading && result && (
          <span className="text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 size={11} />
            Rozkład zaktualizowany
          </span>
        )}
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

// ─── Proposal card — percentage-based volume status (spec §2) ─────────────────

type VolumeProposalStatus =
  | "below_total_minimum"
  | "medium_minimum"
  | "recommended_volume"
  | "above_max_recommended"
  | "overtraining_warning";

export function getVolumeProposalStatus(ratio: number): VolumeProposalStatus {
  if (ratio < 0.50)  return "below_total_minimum";
  if (ratio <= 0.75) return "medium_minimum";
  if (ratio <= 1.00) return "recommended_volume";
  if (ratio < 1.25)  return "above_max_recommended";
  return "overtraining_warning";
}

const VOLUME_PROPOSAL_LABEL: Record<VolumeProposalStatus, string | null> = {
  below_total_minimum:   "Poniżej totalnego minimum",
  medium_minimum:        "Średnie minimum do spełnienia",
  recommended_volume:    null,
  above_max_recommended: "Powyżej maks. rekomendowanej objętości",
  overtraining_warning:  "Ryzyko przetrenowania",
};

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

  // Percentage-based status (spec §2)
  const volumeRatio = decision.absoluteMax > 0 ? selectedValue / decision.absoluteMax : 0;
  const volumeStatus = getVolumeProposalStatus(volumeRatio);
  const isAmberStatus = volumeStatus === "medium_minimum" || volumeStatus === "above_max_recommended";
  const isRedStatus   = volumeStatus === "below_total_minimum" || volumeStatus === "overtraining_warning";
  // Recommended range: [floor(absoluteMax × 0.75) + 1, absoluteMax]
  const recommendedLowerBound = Math.floor(decision.absoluteMax * 0.75) + 1;

  // Local state for text input: tracks raw input string and validation error.
  // We do NOT silently clamp — invalid values show an error and are not applied.
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // Displayed value in the input box: raw typing takes priority; otherwise the current selectedValue.
  const displayValue = rawInput !== null ? rawInput : String(selectedValue);

  function adjust(delta: number) {
    // Stepper buttons: whole integer steps.
    // − stops at preferredMin; + is uncapped (trainer may go above absoluteMax).
    const next = Math.round(selectedValue + delta);
    const bounded = Math.max(decision.preferredMin, next);
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
        isAmberStatus ? "border-amber-300 bg-amber-50/30" : isRedStatus ? "border-red-300 bg-red-50/30" : "",
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
                  className={`text-[10px] px-1.5 py-0 ${isAmberStatus ? "text-amber-700 border-amber-300 bg-amber-50" : isRedStatus ? "text-red-700 border-red-200 bg-red-50" : "text-blue-600 border-blue-200 bg-blue-50"}`}
                >
                  ustawione ręcznie
                </Badge>
              )}
            </div>
            {/* Recommended range and ceiling — percentage-based (spec §1) */}
            <p className="text-xs text-muted-foreground mt-0.5">
              Zakres rekomendowany:{" "}
              <span className="font-medium text-foreground">
                {recommendedLowerBound}–{decision.absoluteMax}
              </span>{" "}
              serii/tydz.
            </p>
            <p className="text-xs text-muted-foreground">
              Maks. rekomendowana obj. tyg.:{" "}
              <span className="font-medium">{decision.absoluteMax}</span> serii/tydz.
            </p>
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
                      : isAmberStatus
                        ? "border-amber-400 focus-visible:ring-amber-400"
                        : isRedStatus
                          ? "border-red-400 focus-visible:ring-red-400"
                          : ""
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={() => adjust(step)}
                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {inputError && (
              <span className="text-[10px] text-red-500 leading-none">{inputError}</span>
            )}
            {!inputError && volumeStatus !== "recommended_volume" && VOLUME_PROPOSAL_LABEL[volumeStatus] !== null && (
              <span className={`text-[10px] leading-none ${isAmberStatus ? "text-amber-600" : "text-red-600"}`}>
                {VOLUME_PROPOSAL_LABEL[volumeStatus]}
              </span>
            )}
          </div>
        </div>

        {/* Manual override indicator */}
        {isOverridden && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Wartość zmieniona ręcznie</span>
            <button
              type="button"
              onClick={() => onReset(decision.targetId)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw size={10} />
              Przywróć rekomendowaną
            </button>
          </div>
        )}

        {/* Reasoning — separate list items, not concatenated */}
        {decision.reasons.length > 0 && (
          <ul className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
            {decision.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <span className="mt-px shrink-0 text-muted-foreground">·</span>
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
  trainingDays,
}: {
  decisions: WeeklyVolumeDecisionResponseType;
  overrides: Record<number, number>;
  onOverride: (targetId: number, value: number) => void;
  onReset: (targetId: number) => void;
  distributionResult: WeeklyVolumeDistributionResponseType | null;
  distributionLoading: boolean;
  distributionError: string | null;
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

      {/* Phase 3B — Daily volume distribution (auto-recalculates) */}
      <DistributionSection
        result={distributionResult}
        isLoading={distributionLoading}
        error={distributionError}
        trainingDays={trainingDays}
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
  const [showPlanReadySummary, setShowPlanReadySummary] = useState(false);
  const [prefs, setPrefs] = useState<PlanDraftGenerationPreferencesType | null>(null);
  const [volumeDecisions, setVolumeDecisions] = useState<WeeklyVolumeDecisionResponseType | null>(null);
  const [volumeOverrides, setVolumeOverrides] = useState<Record<number, number>>({});
  const [distributionResult, setDistributionResult] = useState<WeeklyVolumeDistributionResponseType | null>(null);
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraftByDay>({});
  const [generatedExplanations, setGeneratedExplanations] = useState<Record<number, GeneratedDayExplanation>>({});

  // Live volume coverage — lifted here so Step 5 reuses the same result without recalculation
  const { previewResult, isLoading: coverageLoading, failed: coverageFailed } = useVolumeCoverage(
    clientId,
    exerciseDraft,
    distributionResult,
  );
  const lastDistributionKeyRef = useRef<string | null>(null);

  const { data, isLoading, isError } = useGetClientPlanDraftInput(clientId);
  const volumeMutation = useDraftVolumePreview();
  const distributionMutation = useDraftDistributionPreview();
  const saveDraftPlan = useSaveDraftPlan(clientId);
  const { toast } = useToast();

  // Initialize preferences from default when data first loads
  const effectivePrefs = useMemo<PlanDraftGenerationPreferencesType | null>(() => {
    if (prefs) return prefs;
    if (!data) return null;
    const d = data as unknown as GetClientPlanDraftInputResponseType;
    return d.defaultPreferences;
  }, [prefs, data]);

  const typedData = data as unknown as GetClientPlanDraftInputResponseType | undefined;
  const hasBlockingWarnings = typedData?.warnings.some((w: PlanDraftInputWarningType) => w.blocking) ?? false;

  // Volume auto-trigger refs
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVolumePrefsRef = useRef<string | null>(null);

  function handlePrefsChange(p: PlanDraftGenerationPreferencesType) {
    // Clear stale volume + distribution when structural inputs change
    if (
      effectivePrefs &&
      (p.trainingDays !== effectivePrefs.trainingDays ||
        p.splitType !== effectivePrefs.splitType ||
        p.sessionDurationMinutes !== effectivePrefs.sessionDurationMinutes)
    ) {
      setVolumeDecisions(null);
      setDistributionResult(null);
      setVolumeOverrides({});
      setGeneratedExplanations({});
      lastVolumePrefsRef.current = null;
    }
    setPrefs(p);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
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

  function handleSavePlan() {
    if (!effectivePrefs || !distributionResult || !typedData) return;
    if (!typedData.surveyId) {
      toast({
        title: "Brak wywiadu treningowego",
        description: "Plan wymaga powiązanego wywiadu treningowego. Uzupełnij wywiad przed zapisem.",
        variant: "destructive",
      });
      return;
    }

    const splitLabel = (SPLIT_TYPE_LABELS as Record<string, string>)[effectivePrefs.splitType] ?? effectivePrefs.splitType;
    const clientName = `${typedData.client.firstName} ${typedData.client.lastName}`;
    const title = `${splitLabel} — ${clientName}`;

    const descParts: string[] = [];
    if ((effectivePrefs.priorityMuscleGroups ?? []).length > 0) {
      descParts.push(`Priorytety mięśniowe: ${effectivePrefs.priorityMuscleGroups.join(", ")}`);
    }
    if (effectivePrefs.trainingGoal) {
      descParts.push(`Cel treningowy: ${effectivePrefs.trainingGoal}`);
    }

    const days = distributionResult.days.map((day) => ({
      dayIndex: day.dayIndex,
      dayName: day.dayName,
      dayType: day.dayType,
      exercises: exerciseDraft[day.dayIndex] ?? [],
    }));

    saveDraftPlan.mutate(
      {
        surveyId: typedData.surveyId,
        title,
        goal: effectivePrefs.trainingGoal ?? null,
        description: descParts.length > 0 ? descParts.join("\n") : null,
        splitType: effectivePrefs.splitType ?? null,
        blockDurationWeeks: effectivePrefs.blockDurationWeeks ?? null,
        sessionDurationMinutes: effectivePrefs.sessionDurationMinutes ?? null,
        days,
      },
      {
        onError: (err) => {
          toast({ title: "Nie udało się zapisać planu", description: humanizeError(err), variant: "destructive" });
        },
      },
    );
  }

  // ── Distribution (Phase 3B) ────────────────────────────────────────────────

  /** Build distribution request from current wizard state; null when preconditions unmet. */
  const distributionRequest = useMemo(() => {
    if (!volumeDecisions || !effectivePrefs) return null;
    return buildDistributionRequest({
      clientId,
      experienceLevel: typedData?.input.experienceLevel ?? volumeDecisions.metadata.experienceLevel ?? null,
      trainingDays: effectivePrefs.trainingDays,
      selectedSplitType: effectivePrefs.splitType,
      volumeDecisions,
      volumeOverrides,
    });
  }, [clientId, typedData, effectivePrefs, volumeDecisions, volumeOverrides]);

  /**
   * Auto-calculate volume whenever the trainer is on step 1 and prefs change.
   * Debounced 800 ms so rapid field changes (e.g. typing in the goal input)
   * don't fire the expensive API call on every keystroke.
   */
  useEffect(() => {
    if (step !== 1 || !effectivePrefs || !typedData) return;

    const key = JSON.stringify({
      trainingDays: effectivePrefs.trainingDays,
      sessionDurationMinutes: effectivePrefs.sessionDurationMinutes,
      splitType: effectivePrefs.splitType,
      blockDurationWeeks: effectivePrefs.blockDurationWeeks,
      trainingGoal: effectivePrefs.trainingGoal,
      priorityMuscleGroups: effectivePrefs.priorityMuscleGroups,
      preferredTrainingStyle: effectivePrefs.preferredTrainingStyle,
      trainerRestrictions: effectivePrefs.trainerRestrictions,
    });

    if (key === lastVolumePrefsRef.current) return;

    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      lastVolumePrefsRef.current = key;
      volumeMutation.mutate(
        {
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
        },
        {
          onSuccess: (result: WeeklyVolumeDecisionResponseType) => setVolumeDecisions(result),
          onError: () => setVolumeDecisions(null),
        },
      );
    }, 800);

    return () => {
      if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    };
  }, [step, effectivePrefs]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Auto-recalculate distribution whenever volume decisions or overrides
   * change while on the merged step 1 (Założenia planu).
   * Duplicate-identical requests are suppressed via a ref.
   */
  useEffect(() => {
    if (step !== 1 || !distributionRequest) return;
    const key = JSON.stringify(distributionRequest);
    if (key === lastDistributionKeyRef.current) return;
    lastDistributionKeyRef.current = key;
    distributionMutation.mutate(distributionRequest, {
      onSuccess: (result: WeeklyVolumeDistributionResponseType) => setDistributionResult(result),
      onError: () => setDistributionResult(null),
    });
  }, [step, distributionRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Success state — evaluated BEFORE showPlanReadySummary so saving from either
  // path (Step 5 preview or PlanReadySummary screen) shows the confirmation card.
  if (saveDraftPlan.data && effectivePrefs) {
    const splitLabel = (SPLIT_TYPE_LABELS as Record<string, string>)[effectivePrefs.splitType] ?? effectivePrefs.splitType;
    return (
      <div className="space-y-6 max-w-3xl pb-12 animate-in fade-in duration-300">
        <Link
          href={`/clients/${clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>
        <Card className="border-emerald-300 bg-emerald-50/50 shadow-sm">
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-600" />
            <h3 className="text-base font-semibold text-emerald-900 mb-1">Plan zapisany!</h3>
            <p className="text-sm text-emerald-700 mb-1">{saveDraftPlan.data.title}</p>
            <p className="text-xs text-emerald-600 mb-6">{splitLabel} · {effectivePrefs.trainingDays} dni/tydz.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button asChild>
                <Link href={`/plans/${saveDraftPlan.data.id}`}>Otwórz plan</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/clients/${clientId}`}>Powrót do klienta</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── MVP result screen ────────────────────────────────────────────────────────
  if (showPlanReadySummary && effectivePrefs) {
    const splitLabel = (SPLIT_TYPE_LABELS as Record<string, string>)[effectivePrefs.splitType] ?? effectivePrefs.splitType;
    const weeklyLayout = distributionResult
      ? distributionResult.days.map((d, i) => {
          const dayExercises = exerciseDraft[d.dayIndex] ?? [];
          return {
            name: `Dzień ${i + 1}`,
            type: d.dayType,
            note: dayExercises.length > 0
              ? dayExercises.slice(0, 4).map((e) => e.exerciseName).join(", ")
              : d.targetAllocations.slice(0, 3).map((a) => a.targetName).join(", ") || "—",
            exercises: dayExercises.map(
              (e) => `${e.exerciseName} — ${e.sets}×${e.repsMin}–${e.repsMax}`,
            ),
          };
        })
      : Array.from({ length: effectivePrefs.trainingDays }, (_, i) => ({
          name: `Dzień ${i + 1}`,
          type: effectivePrefs.splitType,
          note: "—",
          exercises: [] as string[],
        }));

    return (
      <div className="space-y-6 max-w-3xl pb-12 animate-in fade-in duration-300">
        <Link
          href={`/clients/${clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>
        <PlanReadySummary
          split={splitLabel}
          trainingDays={effectivePrefs.trainingDays}
          sessionDurationMinutes={effectivePrefs.sessionDurationMinutes}
          priority={(effectivePrefs.priorityMuscleGroups ?? [])[0] ?? "—"}
          status={distributionResult ? "Rozkład obliczony" : volumeDecisions ? "Wolumin obliczony" : "Dane wstępne"}
          whyThisPlan={
            typedData?.warnings?.filter((w: PlanDraftInputWarningType) => !w.blocking).slice(0, 5).map((w: PlanDraftInputWarningType) => w.message) ??
            [`Split: ${splitLabel}`, `Liczba dni: ${effectivePrefs.trainingDays}`, `Czas sesji: ${effectivePrefs.sessionDurationMinutes} min`]
          }
          warnings={distributionResult?.hasBlockingIssues ? ["Plan zawiera problemy blokujące — przejrzyj ustawienia."] : []}
          suggestions={distributionResult?.hasBlockingIssues ? ["Wróć do kroku 1 i zmodyfikuj założenia."] : []}
          weeklyLayout={weeklyLayout}
          clientProfile={{
            level: typedData?.input?.experienceLevel ?? "—",
            goal: effectivePrefs.trainingGoal ?? "—",
            days: effectivePrefs.trainingDays,
            duration: effectivePrefs.sessionDurationMinutes,
            priorities: effectivePrefs.priorityMuscleGroups ?? [],
            preferredExercises: typedData?.input?.preferredExercises
              ? [typedData.input.preferredExercises as string].filter(Boolean)
              : [],
            restrictions: effectivePrefs.trainerRestrictions
              ? [effectivePrefs.trainerRestrictions as string].filter(Boolean)
              : [],
          }}
          onEditAssumptions={() => { setShowPlanReadySummary(false); setStep(1); }}
          onRegenerate={() => { setShowPlanReadySummary(false); setStep(1); }}
          onSavePlan={handleSavePlan}
          isSaving={saveDraftPlan.isPending}
        />
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
        <StepHint step={4}>
          Przejdź przez kroki kreatora i kliknij „Generuj szkic planu”. Generator zaproponuje szkic — Ty decydujesz, co zostaje.
        </StepHint>
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

      {/* Step 1 — Założenia planu: preferences + volume + distribution (merged) */}
      {step === 1 && effectivePrefs && (
        <>
          <Step2Preferences
            data={typedData}
            prefs={effectivePrefs}
            onPrefsChange={handlePrefsChange}
            cardioRecommendation={
              (typedData as unknown as { cardioRecommendation?: { type: string; text: string; reason: string } | null })
                .cardioRecommendation ?? null
            }
            conditioningRecommendation={
              (typedData as unknown as { conditioningRecommendation?: { text: string } | null })
                .conditioningRecommendation ?? null
            }
          />

          {/* Volume section — auto-computed inline */}
          {volumeMutation.isPending && !volumeDecisions && (
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-6 flex items-center justify-center gap-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Obliczam objętość treningową…</span>
            </div>
          )}

          {volumeMutation.isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Nie udało się obliczyć objętości. Sprawdź dane klienta i spróbuj ponownie.
              </p>
            </div>
          )}

          {volumeDecisions && (
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
              trainingDays={effectivePrefs.trainingDays}
            />
          )}

        </>
      )}

      {coverageFailed && !coverageLoading && (step === 2 || step === 3) && (
        <p role="alert" className="text-sm text-amber-700">
          Nie udało się przeliczyć pokrycia objętości — pokazane dane mogą być nieaktualne.
          Kolejna zmiana ćwiczeń spróbuje ponownie.
        </p>
      )}

      {/* Step 2 — Ćwiczenia */}
      {step === 2 && isExerciseStepUnlocked && distributionResult && (
        <Step4Exercises
          clientId={clientId}
          distributionResult={distributionResult}
          exerciseDraft={exerciseDraft}
          onDraftChange={setExerciseDraft}
          previewResult={previewResult}
          coverageLoading={coverageLoading}
          experienceLevel={typedData?.input?.experienceLevel ?? null}
          onExplanationsUpdate={setGeneratedExplanations}
          sessionDurationMinutes={effectivePrefs?.sessionDurationMinutes ?? null}
        />
      )}
      {step === 2 && !isExerciseStepUnlocked && (
        <LockedStepPlaceholder step={2} />
      )}

      {/* Step 3 — Podgląd (was step 4) */}
      {step === 3 && distributionResult && effectivePrefs && (
        <Step5Preview
          typedData={typedData}
          effectivePrefs={effectivePrefs}
          distributionResult={distributionResult}
          exerciseDraft={exerciseDraft}
          previewResult={previewResult}
          coverageLoading={coverageLoading}
          clientId={clientId}
          onBack={() => setStep(2)}
          generatedExplanations={generatedExplanations}
          onSave={handleSavePlan}
          isSaving={saveDraftPlan.isPending}
          savedPlanId={saveDraftPlan.data?.id ?? null}
        />
      )}
      {step > 3 && <LockedStepPlaceholder step={step} />}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={step === 0 ? () => navigate(`/clients/${clientId}`) : handleBack}
          className="gap-2"
          disabled={volumeMutation.isPending && step === 0}
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
            <>
              {volumeMutation.isPending && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground self-center">
                  <Loader2 size={13} className="animate-spin" />
                  Przeliczam…
                </span>
              )}
              <Button
                onClick={() => setStep(2)}
                disabled={!isExerciseStepUnlocked}
                className="gap-2"
              >
                Dalej
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(3)}
                disabled={!isPreviewStepUnlocked}
                className="gap-2"
              >
                Podgląd
                <ArrowRight size={14} />
              </Button>
              {Object.keys(exerciseDraft).length > 0 && (
                <Button className="gap-2" onClick={() => setShowPlanReadySummary(true)}>
                  <Sparkles size={14} />
                  Generuj plan
                </Button>
              )}
            </>
          )}
          {step >= 3 && (
            <Button className="gap-2" onClick={() => setShowPlanReadySummary(true)}>
              <Sparkles size={14} />
              Generuj plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
