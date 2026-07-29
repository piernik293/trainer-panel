/**
 * VolumePanel — live training volume analysis for the Plan Editor.
 *
 * Two tabs:
 *   • Tygodniowa  — weekly volume per muscle with progress bars and status
 *   • Na jednostkę — per-session breakdown with day selector
 *
 * Uses preview data from useVolumePreview (live, debounced) when available.
 * Falls back to plan.volume (saved) for the weekly view on initial load.
 */

import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  VOLUME_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_COLOR,
  type WorkoutPlan,
  type VolumePreviewResult,
  type WeeklyMuscleResult,
  type VolumeStatus,
} from "@/lib/planApi";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const WEEKLY_STATUS_COLOR: Record<VolumeStatus, string> = {
  below_total_minimum:   "bg-red-100 text-red-700 border-red-200",
  medium_minimum:        "bg-amber-100 text-amber-700 border-amber-200",
  recommended_volume:    "bg-green-100 text-green-700 border-green-200",
  above_max_recommended: "bg-amber-100 text-amber-700 border-amber-200",
  overtraining_warning:  "bg-red-100 text-red-700 border-red-200",
};

const BAR_COLOR: Record<VolumeStatus, string> = {
  below_total_minimum:   "bg-red-400",
  medium_minimum:        "bg-amber-500",
  recommended_volume:    "bg-green-500",
  above_max_recommended: "bg-amber-500",
  overtraining_warning:  "bg-red-500",
};

// ─── Display rounding (spec §5) ───────────────────────────────────────────────
// decimal ≤ 0.5 → floor; decimal > 0.5 → ceil.
// Example: 9.5 → 9, 9.6 → 10, 24.9 → 25.
function roundVolumeForDisplay(value: number): number {
  const lower = Math.floor(value);
  const decimalPart = value - lower;
  return decimalPart <= 0.5 ? lower : Math.ceil(value);
}

// ─── Status-clamped display ────────────────────────────────────────────────────
// Applies roundVolumeForDisplay, then clamps the integer into the display band
// that corresponds to the already-determined status so two adjacent raw values
// that land in different bands never show the same integer.
//
// Band boundaries (all derived from weeklyAbsoluteCeiling C):
//   b50  = floor(C × 0.50)   below_total_minimum  → [0,      b50−1]
//   b75  = floor(C × 0.75)   medium_minimum        → [b50,    b75  ]
//   b100 = C                 recommended_volume    → [b75+1,  b100 ]
//   b125 = floor(C × 1.25)   above_max_recommended → [b100+1, b125−1]
//                            overtraining_warning  → [b125,   ∞    ]
//
// For C=20: b50=10, b75=15, b100=20, b125=25
//   raw 9.9  → round 10 → below_total_minimum → min(10, 9)  = 9
//   raw 15.1 → round 15 → recommended_volume  → max(16, 15) = 16
//   raw 20.1 → round 20 → above_max_recommended → max(21,20) = 21
//   raw 24.9 → round 25 → above_max_recommended → min(25,24) = 24
//   raw 25   → round 25 → overtraining_warning  → max(25,25) = 25
function clampDisplayToStatus(
  rawValue: number,
  status: VolumeStatus,
  ceiling: number,
): number {
  const rounded = roundVolumeForDisplay(rawValue);
  if (ceiling <= 0) return rounded;

  const b50  = Math.floor(ceiling * 0.50);
  const b75  = Math.floor(ceiling * 0.75);
  const b100 = ceiling;
  const b125 = Math.floor(ceiling * 1.25);

  switch (status) {
    case "below_total_minimum":   return Math.min(rounded, b50 - 1);
    case "medium_minimum":        return Math.max(b50, Math.min(rounded, b75));
    case "recommended_volume":    return Math.max(b75 + 1, Math.min(rounded, b100));
    case "above_max_recommended": return Math.max(b100 + 1, Math.min(rounded, b125 - 1));
    case "overtraining_warning":  return Math.max(rounded, b125);
  }
}

// ─── Beginner level helpers ────────────────────────────────────────────────────
// Re-exported from a dependency-free module so they can be unit-tested without
// importing the React component tree.
export {
  BEGINNER_VOLUME_LEVELS,
  SMALLER_MUSCLE_KEYWORDS,
  isSmallerTarget,
} from "@/lib/volumePanelHelpers";
import { BEGINNER_VOLUME_LEVELS, isSmallerTarget } from "@/lib/volumePanelHelpers";

// ─── WeeklyMuscleCard ─────────────────────────────────────────────────────────

function WeeklyMuscleCard({ muscle }: { muscle: WeeklyMuscleResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusClass = WEEKLY_STATUS_COLOR[muscle.status];
  const barClass = BAR_COLOR[muscle.status];

  const absolute = muscle.weeklyAbsoluteCeiling;
  // Fill percentage capped at 100% of absolute ceiling.
  const fillPct =
    absolute > 0 ? Math.min((muscle.effectiveSets / absolute) * 100, 100) : 0;
  // Tick at 75% of absolute ceiling (recommended threshold boundary).
  const recommendedTickPct = 75; // always at 75% of the bar

  // Calculated thresholds for display (spec §6)
  const rawTotalMinimum        = absolute * 0.50;
  const rawRecommendedThreshold = absolute * 0.75;
  const rawOvertrainingThreshold = absolute * 1.25;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium leading-tight">{muscle.muscleName}</span>
            {muscle.hasGuideline ? (
              <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusClass}`}>
                {VOLUME_STATUS_LABEL[muscle.status]}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs px-1.5 py-0 bg-muted text-muted-foreground border-muted">
                Brak wytycznych
              </Badge>
            )}
          </div>

          {muscle.hasGuideline && (
            <>
              {/* Progress bar */}
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barClass}`}
                  style={{ width: `${fillPct}%` }}
                />
                {/* Recommended threshold tick at 75% */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-foreground/40"
                  style={{ left: `${recommendedTickPct}%` }}
                />
              </div>
              {/* Numbers */}
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {clampDisplayToStatus(muscle.effectiveSets, muscle.status, absolute)}
                  </span>
                  {" / "}
                  <span className="tabular-nums">{roundVolumeForDisplay(absolute)}</span>{" "}
                  <span className="text-muted-foreground/70">serii/tydz.</span>
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground/70">
                  zakres: {roundVolumeForDisplay(rawRecommendedThreshold)}–{roundVolumeForDisplay(absolute)}
                </span>
              </div>
            </>
          )}

          {!muscle.hasGuideline && muscle.effectiveSets > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {muscle.effectiveSets.toFixed(2)}
              </span>{" "}
              eff. serii
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-2">
          {/* Threshold reference (spec §6) */}
          {absolute > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground border border-border/30 rounded px-2 py-1.5 bg-background/60">
              <span>Totalne minimum:</span>
              <span className="tabular-nums text-right">{roundVolumeForDisplay(rawTotalMinimum)} serii/tydz.</span>
              <span>Średnie minimum:</span>
              <span className="tabular-nums text-right">{roundVolumeForDisplay(rawRecommendedThreshold)} serii/tydz.</span>
              <span>Zakres rekomendowany:</span>
              <span className="tabular-nums text-right">{roundVolumeForDisplay(rawRecommendedThreshold)}–{roundVolumeForDisplay(absolute)} serii/tydz.</span>
              <span>Maks. rekomendowana obj. tyg.:</span>
              <span className="tabular-nums text-right">{roundVolumeForDisplay(absolute)} serii/tydz.</span>
              <span>Próg ryzyka przetrenowania:</span>
              <span className="tabular-nums text-right">{roundVolumeForDisplay(rawOvertrainingThreshold)} serii/tydz.</span>
            </div>
          )}
          {/* Contributions table */}
          {muscle.contributions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Brak ćwiczeń trenujących tę partię.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-normal pb-1">Dzień</th>
                  <th className="text-left font-normal pb-1">Ćwiczenie</th>
                  <th className="text-right font-normal pb-1">Serie × wsp.</th>
                  <th className="text-right font-normal pb-1">Eff.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {muscle.contributions.map((c, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">
                      {c.dayName ?? `Dzień ${c.dayId}`}
                    </td>
                    <td className="py-0.5 pr-2">{c.exerciseName}</td>
                    <td className="py-0.5 pr-2 text-right text-muted-foreground whitespace-nowrap">
                      {c.workingSets} × {c.coefficient}
                    </td>
                    <td className="py-0.5 text-right font-semibold tabular-nums">
                      {c.effectiveSets.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/50">
                  <td colSpan={3} className="pt-1 text-right text-muted-foreground">Razem</td>
                  <td className="pt-1 text-right font-bold tabular-nums">
                    {clampDisplayToStatus(muscle.effectiveSets, muscle.status, absolute)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WeeklyTab ────────────────────────────────────────────────────────────────

function WeeklyTab({
  weekly,
  experienceLevel,
}: {
  weekly: WeeklyMuscleResult[];
  experienceLevel?: string | null;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const isBeginnerView = BEGINNER_VOLUME_LEVELS.has(experienceLevel ?? "");

  if (weekly.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Dodaj ćwiczenia, aby zobaczyć wyliczoną objętość.
        </CardContent>
      </Card>
    );
  }

  if (isBeginnerView) {
    const mainTargets   = weekly.filter((m) => !isSmallerTarget(m.muscleName));
    const smallerTargets = weekly.filter((m) => isSmallerTarget(m.muscleName));

    return (
      <div className="space-y-3">
        {/* Trainer information box */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-blue-800">
            Kontrola objętości dla rozwoju ogólnego
          </p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Na tym etapie priorytetem jest rozwój ogólny całego ciała, nauka podstawowych
            wzorców ruchowych oraz stopniowe budowanie tolerancji na wysiłek. Dlatego system
            eksponuje głównie większe grupy mięśniowe. Mniejsze partie nadal są uwzględniane
            poprzez pracę bezpośrednią i pośrednią, ale ich niższa objętość nie zawsze
            oznacza błąd planu.
          </p>
        </div>

        {/* Main visible section */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-0.5 pb-0.5">
            Główne obszary
          </p>
          <div className="space-y-1.5">
            {mainTargets.map((muscle) => (
              <WeeklyMuscleCard key={muscle.targetId} muscle={muscle} />
            ))}
          </div>
        </div>

        {/* Collapsed section for smaller muscles */}
        <div>
          <button
            type="button"
            className="w-full flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-0.5 py-1"
            onClick={() => setDetailsExpanded((v) => !v)}
          >
            {detailsExpanded ? (
              <ChevronDown size={12} className="shrink-0" />
            ) : (
              <ChevronRight size={12} className="shrink-0" />
            )}
            Szczegóły mniejszych partii
            <span className="ml-auto font-normal text-muted-foreground/50">
              {smallerTargets.length}
            </span>
          </button>

          {!detailsExpanded && (
            <p className="text-xs text-muted-foreground/70 px-0.5 pb-1 leading-relaxed">
              Mniejsze partie są nadal liczone. Ich niższy wynik na tym poziomie nie zawsze
              wymaga dodawania osobnego ćwiczenia izolowanego.
            </p>
          )}

          {detailsExpanded && (
            <div className="space-y-1.5 mt-1">
              {smallerTargets.map((muscle) => (
                <WeeklyMuscleCard key={muscle.targetId} muscle={muscle} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {weekly.map((muscle) => (
        <WeeklyMuscleCard key={muscle.targetId} muscle={muscle} />
      ))}
    </div>
  );
}

// ─── SessionTab ───────────────────────────────────────────────────────────────

function SessionTab({
  preview,
  plan,
}: {
  preview: VolumePreviewResult | null;
  plan: WorkoutPlan;
}) {
  const [selectedDayId, setSelectedDayId] = useState<number | null>(
    plan.days.length > 0 ? plan.days[0].id : null,
  );

  if (plan.days.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Brak dni treningowych — dodaj dzień, aby zobaczyć objętość na jednostkę.
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" />
        Ładowanie danych sesji…
      </div>
    );
  }

  const selectedPreviewDay = preview.days.find((d) => d.dayId === selectedDayId);
  const selectedPlanDay = plan.days.find((d) => d.id === selectedDayId);

  return (
    <div className="space-y-3">
      {/* Day selector */}
      <div className="flex flex-wrap gap-1.5">
        {plan.days.map((day) => (
          <button
            key={day.id}
            onClick={() => setSelectedDayId(day.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selectedDayId === day.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {day.dayName ?? `Dzień ${day.dayOrder}`}
          </button>
        ))}
      </div>

      {/* Day content */}
      {selectedPlanDay && (
        <div className="space-y-1.5">
          {!selectedPreviewDay || selectedPreviewDay.muscles.length === 0 ? (
            <Card className="border-dashed border-border/50">
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                {selectedPlanDay.exercises.length === 0
                  ? "Brak ćwiczeń w tym dniu."
                  : "Żadne z ćwiczeń w tym dniu nie ma przypisanych partii mięśniowych."}
              </CardContent>
            </Card>
          ) : (
            selectedPreviewDay.muscles.map((muscle) => (
              <SessionMuscleCard key={muscle.targetId} muscle={muscle} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SessionMuscleCard({
  muscle,
}: {
  muscle: {
    targetId: number;
    muscleName: string;
    effectiveSets: number;
    sessionMin: number;
    sessionMax: number;
    sessionStatus: string;
    contributions: Array<{
      exerciseEntryId: number;
      exerciseName: string;
      workingSets: number;
      coefficient: number;
      effectiveSets: number;
    }>;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const status = muscle.sessionStatus as keyof typeof SESSION_STATUS_LABEL;
  const statusClass = SESSION_STATUS_COLOR[status] ?? SESSION_STATUS_COLOR.no_guideline;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{muscle.muscleName}</span>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusClass}`}>
              {SESSION_STATUS_LABEL[status] ?? status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground tabular-nums">
              {muscle.effectiveSets.toFixed(2)}
            </span>{" "}
            eff. serii{" "}
            {muscle.sessionMin > 0 && (
              <span className="text-muted-foreground/70">
                · zakres na jednostkę: {muscle.sessionMin}–{muscle.sessionMax}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10">
          {muscle.contributions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Brak ćwiczeń.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-normal pb-1">Ćwiczenie</th>
                  <th className="text-right font-normal pb-1">Serie × wsp.</th>
                  <th className="text-right font-normal pb-1">Eff.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {muscle.contributions.map((c, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2">{c.exerciseName}</td>
                    <td className="py-0.5 pr-2 text-right text-muted-foreground whitespace-nowrap">
                      {c.workingSets} × {c.coefficient}
                    </td>
                    <td className="py-0.5 text-right font-semibold tabular-nums">
                      {c.effectiveSets.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WarningsPanel ────────────────────────────────────────────────────────────

function WarningsPanel({ warnings }: { warnings: VolumePreviewResult["warnings"] }) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <AlertCircle size={14} />
        {warnings.length} {warnings.length === 1 ? "ostrzeżenie" : "ostrzeżeń"}
        {expanded ? (
          <ChevronDown size={14} className="ml-auto" />
        ) : (
          <ChevronRight size={14} className="ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-amber-200/60">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VolumePanel (main export) ────────────────────────────────────────────────

interface VolumePanelProps {
  plan: WorkoutPlan;
  preview: VolumePreviewResult | null;
  isLoadingPreview: boolean;
  /** Client's experience level — controls simplified beginner presentation. */
  experienceLevel?: string | null;
}

export function VolumePanel({ plan, preview, isLoadingPreview, experienceLevel }: VolumePanelProps) {
  const [tab, setTab] = useState<"weekly" | "session">("weekly");

  // Use preview weekly when available; fall back to plan.volume.targets adapted
  // to the WeeklyMuscleResult shape so the UI is always populated.
  const weeklyData: WeeklyMuscleResult[] = preview
    ? preview.weekly
    : plan.volume.targets.map((t) => ({
        targetId: t.targetId,
        muscleName: t.targetName,
        effectiveSets: t.weeklyEffectiveSets,
        weeklyPreferredCeiling: t.weeklyPreferredCeiling,
        weeklyAbsoluteCeiling: t.weeklyAbsoluteCeiling,
        sessionMin: t.sessionMin,
        sessionMax: t.sessionMax,
        remainingToPreferred: Math.max(0, t.weeklyPreferredCeiling - t.weeklyEffectiveSets),
        remainingToAbsolute: Math.max(0, t.weeklyAbsoluteCeiling - t.weeklyEffectiveSets),
        status: t.status,
        hasGuideline: true,
        contributions: t.breakdown.map((b) => ({
          exerciseEntryId: b.planExerciseId,
          exerciseId: b.exerciseId,
          exerciseName: b.exerciseName,
          dayId: b.dayId,
          dayName: b.dayName,
          workingSets: b.workingSets,
          coefficient: b.coefficientUsed,
          effectiveSets: b.effectiveSets,
        })),
      }));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <BarChart3 size={16} className="text-primary" />
          Objętość treningowa
        </h2>
        {isLoadingPreview && (
          <Loader2 size={13} className="animate-spin text-muted-foreground ml-auto" />
        )}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/40">
        <button
          onClick={() => setTab("weekly")}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            tab === "weekly"
              ? "bg-background font-medium text-foreground shadow-sm border border-border/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 size={12} />
          Tygodniowa
        </button>
        <button
          onClick={() => setTab("session")}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            tab === "session"
              ? "bg-background font-medium text-foreground shadow-sm border border-border/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays size={12} />
          Na jednostkę
        </button>
      </div>

      {/* Tab content */}
      {tab === "weekly" && <WeeklyTab weekly={weeklyData} experienceLevel={experienceLevel} />}
      {tab === "session" && <SessionTab preview={preview} plan={plan} />}

      {/* Warnings (preview only) */}
      {preview && preview.warnings.length > 0 && (
        <WarningsPanel warnings={preview.warnings} />
      )}
    </div>
  );
}
