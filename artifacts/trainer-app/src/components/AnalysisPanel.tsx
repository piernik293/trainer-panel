/**
 * AnalysisPanel — live structural analysis for the Plan Editor.
 *
 * Five tabs:
 *   1. Balans ruchowy  — Push/Pull + Squat/Hinge
 *   2. Wzorce ruchowe  — all 8 categories with expandable exercise lists
 *   3. Struktura ćwiczeń — compound/isolation, bilateral/unilateral, planes
 *   4. Rozkład tygodniowy — per-day breakdown + distribution
 *   5. Ostrzeżenia — grouped by severity
 *
 * Advisory only — never blocks saving or editing.
 */

import React, { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  PlanAnalysisResult,
  CategoryAnalysis,
  AnalysisWarning,
  PushPullBalance,
  SquatHingeBalance,
} from "@/lib/planApi";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const SEVERITY_CLASS = {
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  error:   "bg-red-100 text-red-700 border-red-200",
  info:    "bg-muted text-muted-foreground border-muted",
} as const;

const SEVERITY_BAR = {
  success: "bg-green-500",
  warning: "bg-amber-500",
  error:   "bg-red-500",
  info:    "bg-muted-foreground/30",
} as const;

// ─── Small helpers ────────────────────────────────────────────────────────────

function pct(value: number, total: number): number {
  return total > 0 ? Math.min((value / total) * 100, 100) : 0;
}

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals);
}

// ─── BalanceBar ───────────────────────────────────────────────────────────────

function BalanceBar({
  leftLabel,
  rightLabel,
  leftSets,
  rightSets,
  severity,
}: {
  leftLabel: string;
  rightLabel: string;
  leftSets: number;
  rightSets: number;
  severity: "success" | "warning" | "error" | "info";
}) {
  const total = leftSets + rightSets;
  const leftPct = pct(leftSets, total);
  const rightPct = pct(rightSets, total);
  const barColor = SEVERITY_BAR[severity];

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-muted">
        <div className={`${barColor} transition-all`} style={{ width: `${leftPct}%` }} />
        <div className="bg-muted-foreground/20 transition-all" style={{ width: `${rightPct}%` }} />
      </div>
      <div className="flex justify-between text-xs font-semibold tabular-nums">
        <span>{leftSets} serii</span>
        <span>{rightSets} serii</span>
      </div>
    </div>
  );
}

// ─── BalanceCard ──────────────────────────────────────────────────────────────

function BalanceCard({
  title,
  balance,
}: {
  title: string;
  balance: PushPullBalance | SquatHingeBalance;
}) {
  const isSufficient = balance.status !== "insufficient_data";
  const leftSets = "pushSets" in balance ? balance.pushSets : balance.squatSets;
  const rightSets = "pullSets" in balance ? balance.pullSets : balance.hingeSets;
  const leftLabel = "pushSets" in balance ? "Push" : "Squat";
  const rightLabel = "pullSets" in balance ? "Pull" : "Hinge";

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <Badge
          variant="outline"
          className={`text-xs px-1.5 py-0 ${SEVERITY_CLASS[balance.severity]}`}
        >
          {balance.ratio != null
            ? `${fmt(balance.ratio, 2)}:1`
            : "—"}
        </Badge>
      </div>
      {isSufficient ? (
        <BalanceBar
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          leftSets={leftSets}
          rightSets={rightSets}
          severity={balance.severity}
        />
      ) : (
        <p className="text-xs text-muted-foreground">{balance.message}</p>
      )}
      <p className="text-xs text-muted-foreground leading-snug">{balance.message}</p>
    </div>
  );
}

// ─── Tab 1: Balans ruchowy ────────────────────────────────────────────────────

function BalanceTab({ analysis }: { analysis: PlanAnalysisResult }) {
  return (
    <div className="space-y-3">
      <BalanceCard title="Push / Pull" balance={analysis.balance.pushPull} />
      <BalanceCard title="Squat / Hinge" balance={analysis.balance.squatHinge} />
    </div>
  );
}

// ─── Tab 2: Wzorce ruchowe ────────────────────────────────────────────────────

function CategoryCard({ cat, totalPlanSets }: { cat: CategoryAnalysis; totalPlanSets: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = cat.workingSets > 0;
  const fillPct = pct(cat.workingSets, totalPlanSets);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          : <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        }
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{cat.label}</span>
            {!hasData && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 bg-muted text-muted-foreground border-muted">
                Brak w planie
              </Badge>
            )}
          </div>
          {hasData && (
            <div className="space-y-1">
              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${fillPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground flex gap-3">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">{cat.workingSets}</span>{" "}
                  serii ({fmt(cat.percentageOfPlanSets, 1)}%)
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span>{cat.exerciseEntries} ćwiczeń</span>
                <span className="text-muted-foreground/50">·</span>
                <span>{cat.daysPresent} {cat.daysPresent === 1 ? "dzień" : "dni"}</span>
              </div>
            </div>
          )}
        </div>
      </button>
      {expanded && hasData && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-1">
          {cat.exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-foreground/80 truncate pr-2">{ex.exerciseName}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {ex.workingSets} serii
                {ex.subPattern && (
                  <span className="ml-1 text-muted-foreground/60">({ex.subPattern.replace("_", " ")})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MovementPatternsTab({ analysis }: { analysis: PlanAnalysisResult }) {
  return (
    <div className="space-y-1.5">
      {analysis.movementCategories.map((cat) => (
        <CategoryCard key={cat.category} cat={cat} totalPlanSets={analysis.summary.totalWorkingSets} />
      ))}
    </div>
  );
}

// ─── MiniStat ─────────────────────────────────────────────────────────────────

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

function TwoColBar({
  leftLabel, rightLabel, leftValue, rightValue, unknownValue,
}: {
  leftLabel: string; rightLabel: string;
  leftValue: number; rightValue: number; unknownValue: number;
}) {
  const total = leftValue + rightValue + unknownValue;
  return (
    <div className="space-y-1">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 bg-muted">
        {leftValue > 0 && (
          <div className="bg-primary/70 transition-all" style={{ width: `${pct(leftValue, total)}%` }} title={`${leftLabel}: ${leftValue}`} />
        )}
        {rightValue > 0 && (
          <div className="bg-primary/30 transition-all" style={{ width: `${pct(rightValue, total)}%` }} title={`${rightLabel}: ${rightValue}`} />
        )}
        {unknownValue > 0 && (
          <div className="bg-muted-foreground/10 transition-all" style={{ width: `${pct(unknownValue, total)}%` }} title={`Nieznane: ${unknownValue}`} />
        )}
      </div>
      <div className="flex text-xs gap-4">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-primary/70 mr-1" />{leftLabel}: <strong>{leftValue}</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-primary/30 mr-1" />{rightLabel}: <strong>{rightValue}</strong></span>
        {unknownValue > 0 && (
          <span className="text-muted-foreground/70">Nieznane: {unknownValue}</span>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Struktura ćwiczeń ─────────────────────────────────────────────────

function StructureTab({ analysis }: { analysis: PlanAnalysisResult }) {
  const et = analysis.exerciseTypes;
  const ex = analysis.executionTypes;
  const pl = analysis.planesOfMotion;

  return (
    <div className="space-y-4">
      {/* Compound / Isolation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typ ćwiczenia</h3>
        <TwoColBar
          leftLabel="Wielostawowe"
          rightLabel="Izolowane"
          leftValue={et.compoundSets}
          rightValue={et.isolationSets}
          unknownValue={et.unknownSets}
        />
        <div className="grid grid-cols-3 gap-2 mt-1">
          <MiniStat label="Wielostawowe" value={et.compoundEntries} sub={`${et.compoundSets} serii`} />
          <MiniStat label="Izolowane" value={et.isolationEntries} sub={`${et.isolationSets} serii`} />
          <MiniStat label="Bez klasyfikacji" value={et.unknownEntries} sub={`${et.unknownSets} serii`} />
        </div>
      </div>

      <div className="border-t border-border/40" />

      {/* Bilateral / Unilateral */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tryb wykonania</h3>
        <TwoColBar
          leftLabel="Obustronne (bilateralne)"
          rightLabel="Jednostronne (unilateralne)"
          leftValue={ex.bilateralSets}
          rightValue={ex.unilateralSets}
          unknownValue={ex.unknownSets}
        />
        <div className="grid grid-cols-3 gap-2 mt-1">
          <MiniStat label="Obustronne (bilateralne)" value={ex.bilateralEntries} sub={`${ex.bilateralSets} serii`} />
          <MiniStat label="Jednostronne (unilateralne)" value={ex.unilateralEntries} sub={`${ex.unilateralSets} serii`} />
          <MiniStat label="Bez klasyfikacji" value={ex.unknownEntries} sub={`${ex.unknownSets} serii`} />
        </div>
        {ex.daysWithUnilateral > 0 && (
          <p className="text-xs text-muted-foreground">Ćwiczenia jednostronne obecne w {ex.daysWithUnilateral} {ex.daysWithUnilateral === 1 ? "dniu" : "dniach"} planu.</p>
        )}
      </div>

      <div className="border-t border-border/40" />

      {/* Planes of motion */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Płaszczyzna ruchu</h3>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Strzałkowa" value={pl.sagittalEntries} sub={`${pl.sagittalSets} serii`} />
          <MiniStat label="Czołowa" value={pl.frontalEntries} sub={`${pl.frontalSets} serii`} />
          <MiniStat label="Poprzeczna" value={pl.transverseEntries} sub={`${pl.transverseSets} serii`} />
        </div>
        {pl.unknownEntries > 0 && (
          <p className="text-xs text-muted-foreground">{pl.unknownEntries} {pl.unknownEntries === 1 ? "ćwiczenie bez" : "ćwiczeń bez"} określonej płaszczyzny ruchu.</p>
        )}
      </div>

      <div className="border-t border-border/40" />

      {/* Coverage summary */}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Pokrycie analizy</p>
        <p>Przeanalizowane: <strong className="text-foreground">{analysis.summary.analysedExerciseEntries}</strong> z {analysis.summary.totalExerciseEntries} wpisów ćwiczeń.</p>
        {analysis.summary.incompleteExerciseEntries > 0 && (
          <p className="text-amber-600">{analysis.summary.incompleteExerciseEntries} {analysis.summary.incompleteExerciseEntries === 1 ? "wpis bez" : "wpisów bez"} kompletnego wzorca ruchowego.</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Rozkład tygodniowy ────────────────────────────────────────────────

function WeeklyTab({ analysis }: { analysis: PlanAnalysisResult }) {
  const activeCategories = analysis.weeklyDistribution.filter((w) => w.totalSets > 0);

  return (
    <div className="space-y-4">
      {/* Per-day summary */}
      {analysis.days.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dni treningowe</h3>
          {analysis.days.map((day) => (
            <div key={day.dayId} className="border border-border/50 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{day.dayName ?? `Dzień ${day.dayOrder + 1}`}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{day.totalWorkingSets} serii · {day.exerciseCount} ćw.</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {day.categoryBreakdown.slice(0, 4).map((cb) => (
                  <span key={cb.category} className="text-xs bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5">
                    {cb.label} {cb.workingSets}
                  </span>
                ))}
                {day.categoryBreakdown.length > 4 && (
                  <span className="text-xs text-muted-foreground/60">+{day.categoryBreakdown.length - 4}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Distribution across days */}
      {activeCategories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rozkład wzorców</h3>
          {activeCategories.map((wd) => (
            <div key={wd.category} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{wd.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {wd.totalSets} serii · {wd.daysCount} {wd.daysCount === 1 ? "dzień" : "dni"}
                </span>
              </div>
              {wd.daysCount > 0 && (
                <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                  {/* Max-day concentration indicator */}
                  <div
                    className="h-full rounded-full bg-primary/50 transition-all"
                    style={{ width: `${wd.concentrationPercentage}%` }}
                    title={`${fmt(wd.concentrationPercentage, 1)}% w jednym dniu (${wd.maxSetsDayName ?? "?"})`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {analysis.days.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Brak dni treningowych.</p>
      )}
    </div>
  );
}

// ─── Tab 5: Ostrzeżenia ───────────────────────────────────────────────────────

const WARN_SEVERITY_LABEL: Record<AnalysisWarning["severity"], string> = {
  warning: "Istotne ostrzeżenie",
  notice:  "Warto sprawdzić",
  info:    "Informacja",
};

const WARN_SEVERITY_CLASS: Record<AnalysisWarning["severity"], string> = {
  warning: "border-red-200 bg-red-50/50",
  notice:  "border-amber-200 bg-amber-50/50",
  info:    "border-border/50 bg-muted/20",
};

const WARN_TEXT_CLASS: Record<AnalysisWarning["severity"], string> = {
  warning: "text-red-700",
  notice:  "text-amber-700",
  info:    "text-muted-foreground",
};

const WARN_ICON: Record<AnalysisWarning["severity"], React.FC<{ size: number; className?: string }>> = {
  warning: AlertCircle,
  notice:  AlertTriangle,
  info:    Info,
};

function WarningsTab({ warnings }: { warnings: AnalysisWarning[] }) {
  const order: AnalysisWarning["severity"][] = ["warning", "notice", "info"];
  const groups = order
    .map((sev) => ({ sev, items: warnings.filter((w) => w.severity === sev) }))
    .filter(({ items }) => items.length > 0);

  if (warnings.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Brak ostrzeżeń — plan wygląda dobrze z perspektywy wzorców ruchowych.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ sev, items }) => {
        const Icon = WARN_ICON[sev];
        return (
          <div key={sev} className={`rounded-lg border ${WARN_SEVERITY_CLASS[sev]} overflow-hidden`}>
            <div className={`px-3 py-1.5 text-xs font-semibold ${WARN_TEXT_CLASS[sev]} flex items-center gap-1.5`}>
              <Icon size={13} />
              {WARN_SEVERITY_LABEL[sev]} ({items.length})
            </div>
            <div className="divide-y divide-border/30">
              {items.map((w, i) => (
                <p key={i} className={`px-3 py-2 text-xs ${WARN_TEXT_CLASS[sev]} leading-snug`}>
                  {w.message}
                </p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AnalysisPanel (main export) ──────────────────────────────────────────────

type AnalysisTab = "balance" | "patterns" | "structure" | "weekly" | "warnings";

const TABS: { id: AnalysisTab; label: string }[] = [
  { id: "balance",   label: "Balans"    },
  { id: "patterns",  label: "Wzorce"    },
  { id: "structure", label: "Struktura" },
  { id: "weekly",    label: "Tygodniowy"},
  { id: "warnings",  label: "Ostrzeżenia"},
];

interface AnalysisPanelProps {
  analysis: PlanAnalysisResult | null;
  isLoading: boolean;
}

export function AnalysisPanel({ analysis, isLoading }: AnalysisPanelProps) {
  const [tab, setTab] = useState<AnalysisTab>("balance");
  const warningCount = analysis?.warnings.length ?? 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          Analiza planu
        </h2>
        {isLoading && <Loader2 size={13} className="animate-spin text-muted-foreground ml-auto" />}
      </div>

      {!analysis && !isLoading && (
        <Card className="border-dashed border-border/50">
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Dodaj ćwiczenia, aby zobaczyć analizę wzorców ruchowych.
          </CardContent>
        </Card>
      )}

      {(analysis || isLoading) && (
        <>
          {/* Tab bar */}
          <div className="flex gap-0.5 p-1 rounded-lg bg-muted/50 border border-border/40 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-none text-xs py-1.5 px-2 rounded-md transition-colors whitespace-nowrap flex items-center gap-1 ${
                  tab === t.id
                    ? "bg-background font-medium text-foreground shadow-sm border border-border/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.id === "warnings" && warningCount > 0 && (
                  <span className={`rounded-full text-xs px-1 py-0 font-bold ${
                    analysis?.warnings.some((w) => w.severity === "warning")
                      ? "bg-red-100 text-red-700"
                      : analysis?.warnings.some((w) => w.severity === "notice")
                      ? "bg-amber-100 text-amber-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {warningCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content — shown even during refresh with stale data */}
          {analysis && (
            <div className={isLoading ? "opacity-60 pointer-events-none" : ""}>
              {tab === "balance"   && <BalanceTab   analysis={analysis} />}
              {tab === "patterns"  && <MovementPatternsTab analysis={analysis} />}
              {tab === "structure" && <StructureTab analysis={analysis} />}
              {tab === "weekly"    && <WeeklyTab    analysis={analysis} />}
              {tab === "warnings"  && <WarningsTab  warnings={analysis.warnings} />}
            </div>
          )}

          {!analysis && isLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 size={16} className="animate-spin" />
              Obliczanie analizy wzorców…
            </div>
          )}
        </>
      )}
    </div>
  );
}
