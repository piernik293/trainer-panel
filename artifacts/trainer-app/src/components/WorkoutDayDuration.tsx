/**
 * WorkoutDayDuration — estimated session time summary for one workout day.
 *
 * Rendered inside each day card in Step4Exercises.
 * Recomputes from the exercise draft on every render — no internal state,
 * so every edit to sets / reps / tempo / rest triggers an immediate update.
 */

import { useMemo } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftExercise } from "@/lib/exerciseDraftHelpers";
import { estimateWorkoutDayDuration } from "@/lib/workoutDurationEstimator";

interface WorkoutDayDurationProps {
  exercises: DraftExercise[];
  sessionDurationMinutes: number | null | undefined;
  experienceLevel: string | null | undefined;
}

export function WorkoutDayDuration({
  exercises,
  sessionDurationMinutes,
  experienceLevel,
}: WorkoutDayDurationProps) {
  const result = useMemo(
    () => estimateWorkoutDayDuration(exercises, sessionDurationMinutes, experienceLevel),
    [exercises, sessionDurationMinutes, experienceLevel],
  );

  const containerClass = cn(
    "rounded-lg border p-3 text-xs space-y-1.5",
    result.status === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result.status === "orange"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : result.status === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-border/50 bg-muted/30 text-foreground",
  );

  const totalClass = cn(
    "font-bold",
    result.status === "green"
      ? "text-emerald-900"
      : result.status === "orange"
        ? "text-amber-900"
        : result.status === "red"
          ? "text-red-900"
          : "text-foreground",
  );

  const isBrakAktywnosci = experienceLevel === "Brak aktywności fizycznej";
  // Main workout duration = total minus the mandatory 10-min warmup
  const mainWorkoutMinutes = result.estimatedTotalMinutes - result.warmupMinutes;

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wide mb-0.5">
        <Clock size={12} />
        Szacowany czas treningu
      </div>

      {/* Breakdown grid */}
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        <span className="text-current/70">Rozgrzewka:</span>
        <span className="font-medium text-right">{result.warmupMinutes} min</span>

        <span className="text-current/70">Praca:</span>
        <span className="font-medium text-right">{result.workingMinutes} min</span>

        <span className="text-current/70">Przerwy:</span>
        <span className="font-medium text-right">{result.restingMinutes} min</span>

        <span className="text-current/70">Przygotowanie i przejścia:</span>
        <span className="font-medium text-right">{result.setupTransitionMinutes} min</span>

        <span className="font-semibold">Łącznie:</span>
        <span className={cn("text-right", totalClass)}>{result.estimatedTotalMinutes} min</span>

        {result.availableMinutes !== null && (
          <>
            <span className="text-current/70">Czas dostępny:</span>
            <span className="font-medium text-right">{result.availableMinutes} min</span>
          </>
        )}
      </div>

      {/* Over-duration warning */}
      {result.exceededByMinutes !== null && result.exceededByMinutes > 0 && (
        <div className="flex items-center gap-1 pt-0.5 font-semibold">
          <AlertTriangle size={11} className="shrink-0" />
          <span>Przekroczenie: około {result.exceededByMinutes} min</span>
        </div>
      )}

      {/* Brak aktywności fizycznej extra guidance */}
      {isBrakAktywnosci && (
        <div className="pt-1.5 border-t border-current/20 space-y-0.5 text-[10px]">
          <p>
            <span className="font-medium">Zalecany czas treningu głównego:</span>{" "}
            35–45 min
          </p>
          <p>
            <span className="font-medium">Maksymalny zalecany czas treningu głównego:</span>{" "}
            50 min
          </p>
          {mainWorkoutMinutes > 50 && (
            <div className="flex items-center gap-1 text-red-700 font-semibold pt-0.5">
              <AlertTriangle size={10} className="shrink-0" />
              <span>
                Trening główny ({mainWorkoutMinutes} min) przekracza zalecany limit 50 min
              </span>
            </div>
          )}
          {mainWorkoutMinutes > 35 && mainWorkoutMinutes <= 50 && (
            <p className="text-amber-700">
              Trening główny: {mainWorkoutMinutes} min (cel: 35–45 min)
            </p>
          )}
        </div>
      )}

      {/* Fallback tempo notice */}
      {result.hasFallbackTempo && (
        <p className="text-[10px] text-current/50 pt-0.5">
          * Szacunek używa wartości domyślnej 4 s/powt. dla ćwiczenia bez tempa.
        </p>
      )}
    </div>
  );
}
