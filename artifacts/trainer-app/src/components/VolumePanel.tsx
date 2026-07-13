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
  below_preferred: "bg-muted text-muted-foreground border-muted",
  within_preferred: "bg-green-100 text-green-700 border-green-200",
  above_preferred: "bg-amber-100 text-amber-700 border-amber-200",
  above_absolute: "bg-red-100 text-red-700 border-red-200",
};

const BAR_COLOR: Record<VolumeStatus, string> = {
  below_preferred: "bg-muted-foreground/30",
  within_preferred: "bg-green-500",
  above_preferred: "bg-amber-500",
  above_absolute: "bg-red-500",
};

// ─── WeeklyMuscleCard ─────────────────────────────────────────────────────────

function WeeklyMuscleCard({ muscle }: { muscle: WeeklyMuscleResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusClass = WEEKLY_STATUS_COLOR[muscle.status];
  const barClass = BAR_COLOR[muscle.status];

  const absolute = muscle.weeklyAbsoluteCeiling;
  const preferred = muscle.weeklyPreferredCeiling;
  // Fill percentage capped at 100% of absolute ceiling.
  const fillPct =
    absolute > 0 ? Math.min((muscle.effectiveSets / absolute) * 100, 100) : 0;
  // Tick at preferred ceiling position.
  const preferredTickPct =
    absolute > 0 ? Math.min((preferred / absolute) * 100, 100) : 0;

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
                {/* Preferred ceiling tick */}
                {preferredTickPct > 0 && preferredTickPct < 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-foreground/40"
                    style={{ left: `${preferredTickPct}%` }}
                  />
                )}
              </div>
              {/* Numbers */}
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {muscle.effectiveSets.toFixed(2)}
                  </span>
                  {" / "}
                  <span className="tabular-nums">{preferred}</span>{" "}
                  <span className="text-muted-foreground/70">pref.</span>
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span>
                  <span className="tabular-nums">{absolute}</span>{" "}
                  <span className="text-muted-foreground/70">abs.</span>
                </span>
                {muscle.remainingToPreferred > 0 && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-green-600 tabular-nums">
                      +{muscle.remainingToPreferred.toFixed(1)} do pref.
                    </span>
                  </>
                )}
                {muscle.effectiveSets > preferred && muscle.remainingToAbsolute > 0 && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-amber-600 tabular-nums">
                      +{muscle.remainingToAbsolute.toFixed(1)} do abs.
                    </span>
                  </>
                )}
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
        <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10">
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
                    {muscle.effectiveSets.toFixed(2)}
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

function WeeklyTab({ weekly }: { weekly: WeeklyMuscleResult[] }) {
  if (weekly.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Dodaj ćwiczenia, aby zobaczyć wyliczoną objętość.
        </CardContent>
      </Card>
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
}

export function VolumePanel({ plan, preview, isLoadingPreview }: VolumePanelProps) {
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
      {tab === "weekly" && <WeeklyTab weekly={weeklyData} />}
      {tab === "session" && <SessionTab preview={preview} plan={plan} />}

      {/* Warnings (preview only) */}
      {preview && preview.warnings.length > 0 && (
        <WarningsPanel warnings={preview.warnings} />
      )}
    </div>
  );
}
