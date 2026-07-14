/**
 * Volume Coverage UI for Step 4 — Plan Draft Wizard.
 *
 * Displays planned vs actual volume coverage for:
 *   • Weekly summary ("Pokrycie objętości tygodniowej") — top of Step 4
 *   • Daily session coverage — inside each workout-day card
 *   • Core / brzuch — separate from the 11 analytical targets
 *
 * Data sources:
 *   • Planned values: distributionResult (Step 3 output — never mutated)
 *   • Actual values: previewResult from POST /api/plans/volume-preview
 *   • Core actual: local draft (mainMuscleGroup === "Brzuch" — DB field, not name-matching)
 *
 * Statuses:
 *   • planned > 0 && actual = 0 → "Brak dobranego ćwiczenia" (amber warning)
 *   • actual < planned          → "Pozostało N pkt." (neutral/info)
 *   • |actual - planned| < 0.01 → "Pokryto zaplanowaną objętość" (green)
 *   • actual > planned          → "Przekroczono propozycję o N pkt." (orange, non-blocking)
 *
 * Never modifies sets, removes exercises, or changes Step 3 values.
 * "Podgląd" remains locked — this is informational only.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WeeklyVolumeDistributionResponseType } from "@workspace/api-zod";
import type { ExerciseDraftByDay } from "@/lib/exerciseDraftHelpers";
import type { DraftVolumePreviewResult } from "@/hooks/useVolumeCoverage";
import {
  countCoreActualSetsForDay,
  countCoreWeeklySets,
  getCorePlanForDay,
  pluralizeSets,
  formatCoreRemaining,
} from "@/lib/coreCoverageHelpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type CoverageStatus = "missing" | "below" | "exact" | "above";

function coverageStatus(planned: number, actual: number): CoverageStatus {
  if (planned > 0 && actual === 0) return "missing";
  if (Math.abs(actual - planned) < 0.01) return "exact";
  if (actual < planned) return "below";
  return "above";
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  planned: number;
  actual: number;
  unit?: string;
}

function StatusBadge({ planned, actual, unit = "pkt." }: StatusBadgeProps) {
  const s = coverageStatus(planned, actual);
  const diff = round2(Math.abs(actual - planned));

  if (s === "missing") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 border border-amber-300">
        Brak dobranego ćwiczenia
      </span>
    );
  }
  if (s === "exact") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 border border-emerald-300">
        Pokryto zaplanowaną objętość
      </span>
    );
  }
  if (s === "above") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800 border border-orange-300">
        Przekroczono propozycję o {diff} {unit}
      </span>
    );
  }
  // below
  return (
    <span className="text-[10px] text-muted-foreground">
      Pozostało {diff} {unit}
    </span>
  );
}

// ─── ExpandableContributions ──────────────────────────────────────────────────

interface Contribution {
  exerciseName: string;
  workingSets: number;
  coefficient: number;
  effectiveSets: number;
}

function ExpandableContributions({ contributions }: { contributions: Contribution[] }) {
  const [open, setOpen] = useState(false);

  if (contributions.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {open ? "Ukryj składowe" : "Pokaż składowe"}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-2 border-l border-border/30">
          {contributions.map((c, i) => (
            <li key={i} className="text-[10px] text-muted-foreground font-mono">
              {c.exerciseName}: {c.workingSets} × {c.coefficient.toFixed(2)} ={" "}
              {round2(c.effectiveSets).toFixed(2)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── CoverageRow ──────────────────────────────────────────────────────────────

interface CoverageRowProps {
  label: string;
  planned: number;
  actual: number;
  unit?: string;
  contributions?: Contribution[];
  isUnplanned?: boolean;
}

function CoverageRow({
  label,
  planned,
  actual,
  unit = "pkt.",
  contributions,
  isUnplanned = false,
}: CoverageRowProps) {
  return (
    <div className="py-1.5 border-b border-border/20 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium text-foreground leading-tight block truncate">
            {label}
          </span>
          {isUnplanned ? (
            <span className="text-[10px] text-orange-700 font-medium">
              Dodatkowa objętość: {round2(actual)} {unit}
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                Plan: <b className="text-foreground">{round2(planned)}</b> {unit}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Zrealizowano: <b className="text-foreground">{round2(actual)}</b> {unit}
              </span>
            </div>
          )}
        </div>
        {!isUnplanned && (
          <div className="shrink-0 mt-0.5">
            <StatusBadge planned={planned} actual={actual} unit={unit} />
          </div>
        )}
        {isUnplanned && (
          <Badge
            variant="outline"
            className="text-[9px] shrink-0 border-orange-300 text-orange-700 bg-orange-50"
          >
            Niezaplanowane
          </Badge>
        )}
      </div>
      {contributions && <ExpandableContributions contributions={contributions} />}
    </div>
  );
}

// ─── CoreCoverageRow ──────────────────────────────────────────────────────────

interface CoreCoverageRowProps {
  planned: number;
  actual: number;
}

function CoreCoverageRow({ planned, actual }: CoreCoverageRowProps) {
  const diff = planned - actual;

  return (
    <div className="py-1.5 border-t border-border/30 mt-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-[11px] font-medium">Core / brzuch</span>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              Plan: <b className="text-foreground">{pluralizeSets(planned)}</b>
            </span>
            <span className="text-[10px] text-muted-foreground">
              Zrealizowano: <b className="text-foreground">{pluralizeSets(actual)}</b>
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          {planned > 0 && actual === 0 && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 border border-amber-300">
              Brak dobranego ćwiczenia
            </span>
          )}
          {actual > 0 && Math.abs(actual - planned) < 0.5 && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 border border-emerald-300">
              Pokryto
            </span>
          )}
          {actual > 0 && diff > 0.5 && (
            <span className="text-[10px] text-muted-foreground">
              {formatCoreRemaining(diff)}
            </span>
          )}
          {actual > 0 && diff < -0.5 && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800 border border-orange-300">
              Przekroczono o {pluralizeSets(Math.abs(diff))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DayVolumeCoverage ────────────────────────────────────────────────────────

interface DayVolumeCoverageProps {
  day: WeeklyVolumeDistributionResponseType["days"][number];
  exerciseDraft: ExerciseDraftByDay;
  previewResult: DraftVolumePreviewResult | null;
  isLoading: boolean;
  auxiliaryCoreBlock: WeeklyVolumeDistributionResponseType["auxiliaryCoreBlock"];
}

export function DayVolumeCoverage({
  day,
  exerciseDraft,
  previewResult,
  isLoading,
  auxiliaryCoreBlock,
}: DayVolumeCoverageProps) {
  const syntheticDayId = day.dayIndex + 1;
  const dayPreview = previewResult?.days.find((d) => d.dayId === syntheticDayId);

  // Build actual-by-targetId map for this day
  const dayActualByTargetId = new Map(
    (dayPreview?.muscles ?? []).map((m) => [m.targetId, m]),
  );

  // Planned targets (allocatedVolume > 0)
  const nonZeroAllocs = day.targetAllocations.filter((a) => a.allocatedVolume > 0);
  const plannedTargetIds = new Set(nonZeroAllocs.map((a) => a.targetId));

  // Additional (unplanned) targets with actual > 0
  const additionalTargets = (dayPreview?.muscles ?? []).filter(
    (m) => !plannedTargetIds.has(m.targetId) && m.effectiveSets > 0,
  );

  // Core coverage for this day
  const dayExercises = exerciseDraft[day.dayIndex] ?? [];
  const coreActual = countCoreActualSetsForDay(dayExercises);
  const corePlanned = getCorePlanForDay(auxiliaryCoreBlock, day.dayIndex);

  const hasAnything =
    nonZeroAllocs.length > 0 || additionalTargets.length > 0 || corePlanned > 0 || coreActual > 0;

  if (!hasAnything) return null;

  return (
    <div className="border-t border-border/30 pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Pokrycie sesji
        </span>
        {isLoading && !previewResult && (
          <Loader2 size={10} className="animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="space-y-0">
        {/* Planned targets */}
        {nonZeroAllocs.map((alloc) => {
          const muscle = dayActualByTargetId.get(alloc.targetId);
          const actual = muscle?.effectiveSets ?? 0;
          const contributions = muscle?.contributions.map((c) => ({
            exerciseName: c.exerciseName,
            workingSets: c.workingSets,
            coefficient: c.coefficient,
            effectiveSets: c.effectiveSets,
          }));

          return (
            <CoverageRow
              key={alloc.targetId}
              label={alloc.targetName}
              planned={alloc.allocatedVolume}
              actual={actual}
              contributions={contributions}
            />
          );
        })}

        {/* Unplanned additional targets */}
        {additionalTargets.map((m) => (
          <CoverageRow
            key={m.targetId}
            label={m.muscleName}
            planned={0}
            actual={m.effectiveSets}
            isUnplanned
            contributions={m.contributions.map((c) => ({
              exerciseName: c.exerciseName,
              workingSets: c.workingSets,
              coefficient: c.coefficient,
              effectiveSets: c.effectiveSets,
            }))}
          />
        ))}

        {/* Core coverage */}
        {(corePlanned > 0 || coreActual > 0) && (
          <CoreCoverageRow planned={corePlanned} actual={coreActual} />
        )}
      </div>
    </div>
  );
}

// ─── WeeklyVolumeCoverage ─────────────────────────────────────────────────────

interface WeeklyVolumeCoverageProps {
  distributionResult: WeeklyVolumeDistributionResponseType;
  exerciseDraft: ExerciseDraftByDay;
  previewResult: DraftVolumePreviewResult | null;
  isLoading: boolean;
}

export function WeeklyVolumeCoverage({
  distributionResult,
  exerciseDraft,
  previewResult,
  isLoading,
}: WeeklyVolumeCoverageProps) {
  const weeklyActualByTargetId = new Map(
    (previewResult?.weekly ?? []).map((w) => [w.targetId, w]),
  );

  const plannedTargetIds = new Set(
    distributionResult.targetDecisions.map((d) => d.targetId),
  );

  // Unplanned targets with actual > 0 (exercises contributed to muscles outside Step 3 plan)
  const additionalWeeklyTargets = (previewResult?.weekly ?? []).filter(
    (w) => !plannedTargetIds.has(w.targetId) && w.effectiveSets > 0,
  );

  // Core
  const coreWeeklyPlanned = distributionResult.auxiliaryCoreBlock.weeklySelectedSets;
  const coreWeeklyActual = countCoreWeeklySets(exerciseDraft);

  const hasTargets = distributionResult.targetDecisions.length > 0;

  return (
    <div className="rounded-lg border border-border/50 bg-background shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Pokrycie objętości tygodniowej</span>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={11} className="animate-spin" />
            <span>Przeliczam…</span>
          </div>
        )}
      </div>

      <div className="px-4 py-2">
        {!hasTargets && (
          <p className="text-xs text-muted-foreground py-2">
            Brak zaplanowanych grup docelowych — uzupełnij Krok 2.
          </p>
        )}

        {/* Planned targets */}
        {distributionResult.targetDecisions.map((targetDecision) => {
          const weekly = weeklyActualByTargetId.get(targetDecision.targetId);
          const actual = weekly?.effectiveSets ?? 0;
          const planned = targetDecision.weeklySelectedVolume;
          const contributions = weekly?.contributions.map((c) => ({
            exerciseName: c.exerciseName,
            workingSets: c.workingSets,
            coefficient: c.coefficient,
            effectiveSets: c.effectiveSets,
          }));

          return (
            <CoverageRow
              key={targetDecision.targetId}
              label={targetDecision.targetName}
              planned={planned}
              actual={actual}
              contributions={contributions}
            />
          );
        })}

        {/* Unplanned additional weekly targets */}
        {additionalWeeklyTargets.map((w) => (
          <CoverageRow
            key={w.targetId}
            label={w.muscleName}
            planned={0}
            actual={w.effectiveSets}
            isUnplanned
            contributions={w.contributions.map((c) => ({
              exerciseName: c.exerciseName,
              workingSets: c.workingSets,
              coefficient: c.coefficient,
              effectiveSets: c.effectiveSets,
            }))}
          />
        ))}

        {/* Core weekly */}
        {(coreWeeklyPlanned > 0 || coreWeeklyActual > 0) && (
          <div className="border-t border-border/30 mt-1 pt-1">
            <div className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-[11px] font-medium">Core / brzuch — tygodniowo</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Plan tygodniowy:{" "}
                    <b className="text-foreground">{pluralizeSets(coreWeeklyPlanned)}</b>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Zrealizowano:{" "}
                    <b className="text-foreground">{pluralizeSets(coreWeeklyActual)}</b>
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                {coreWeeklyPlanned > 0 && coreWeeklyActual === 0 && (
                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 border border-amber-300">
                    Brak dobranego ćwiczenia
                  </span>
                )}
                {coreWeeklyActual > 0 && Math.abs(coreWeeklyActual - coreWeeklyPlanned) < 0.5 && (
                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Pokryto
                  </span>
                )}
                {coreWeeklyActual > 0 && coreWeeklyActual < coreWeeklyPlanned - 0.5 && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatCoreRemaining(coreWeeklyPlanned - coreWeeklyActual)}
                  </span>
                )}
                {coreWeeklyActual > coreWeeklyPlanned + 0.5 && (
                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800 border border-orange-300">
                    Przekroczono o {pluralizeSets(coreWeeklyActual - coreWeeklyPlanned)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No data yet */}
        {!previewResult && !isLoading && (
          <p className="text-xs text-muted-foreground py-1">
            Dodaj ćwiczenia, aby zobaczyć pokrycie.
          </p>
        )}
      </div>
    </div>
  );
}
