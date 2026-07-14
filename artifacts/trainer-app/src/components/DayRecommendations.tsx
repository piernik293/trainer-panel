/**
 * DayRecommendations — inline recommendation panel for one workout day.
 *
 * Fetches from the plan-draft day-recommendations endpoint (thin adapter over
 * the existing Exercise Recommendation Engine). All scoring comes from the
 * server; zero scoring logic lives here.
 *
 * Features:
 * - Compact loading / empty / error states with retry.
 * - Missing location/equipment data warning.
 * - Per-exercise: name, matching targets, equipment, score label, match/warn
 *   reasons, "Dodaj do dnia" button.
 * - Avoided exercise: shows warning, requires "Zastosuj mimo ostrzeżenia"
 *   confirmation before adding.
 * - Avoided status is a tie-breaker only — score is not modified here.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  Info,
} from "lucide-react";
import { DRAFT_EXERCISE_DEFAULTS } from "@/lib/exerciseDraftHelpers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayRecExercise {
  id: number;
  name: string;
  matchingTargets: string[];
  equipment: string[];
  trainingLocation: string[];
  score: number;
  matchReasons: string[];
  warnReasons: string[];
  isAvoided: boolean;
}

interface DayRecResponse {
  hasProfile: boolean;
  hasLocationData: boolean;
  exercises: DayRecExercise[];
}

export interface AddFromRecommendationPayload {
  id: number;
  name: string;
  mainMuscleGroup: string;
  equipment: string[];
}

// ─── Score label ──────────────────────────────────────────────────────────────

function scoreLabel(score: number): { text: string; className: string } {
  if (score >= 80) return { text: "Bardzo dopasowane", className: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 60) return { text: "Dobrze dopasowane", className: "text-blue-700 bg-blue-50 border-blue-200" };
  if (score >= 40) return { text: "Umiarkowanie", className: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Słabo dopasowane", className: "text-muted-foreground bg-muted border-border" };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useDayRecommendations(
  clientId: number,
  broadCategories: string[],
  alreadyAddedIds: number[],
  enabled: boolean,
) {
  const params = new URLSearchParams();
  params.set("broadCategories", broadCategories.join(","));
  if (alreadyAddedIds.length > 0) {
    params.set("alreadyAdded", alreadyAddedIds.join(","));
  }
  const url = `/api/clients/${clientId}/plan-draft/day-recommendations?${params}`;

  return useQuery<DayRecResponse>({
    queryKey: ["dayRec", clientId, broadCategories.join(","), alreadyAddedIds.join(",")],
    queryFn: async () => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Nie udało się pobrać rekomendacji.");
      return resp.json() as Promise<DayRecResponse>;
    },
    enabled: enabled && broadCategories.length > 0,
    staleTime: 60_000,
    retry: 1,
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DayRecommendationsProps {
  clientId: number;
  broadCategories: string[];
  alreadyAddedIds: number[];
  onAdd: (payload: AddFromRecommendationPayload) => void;
}

export default function DayRecommendations({
  clientId,
  broadCategories,
  alreadyAddedIds,
  onAdd,
}: DayRecommendationsProps) {
  const [pendingAvoided, setPendingAvoided] = useState<DayRecExercise | null>(null);

  const { data, isLoading, isError, refetch } = useDayRecommendations(
    clientId,
    broadCategories,
    alreadyAddedIds,
    true,
  );

  function handleAddClick(exercise: DayRecExercise) {
    if (exercise.isAvoided) {
      setPendingAvoided(exercise);
    } else {
      doAdd(exercise);
    }
  }

  function doAdd(exercise: DayRecExercise) {
    // mainMuscleGroup is not in the recommendation response — derive from
    // the first matching target (which is the broad category = mainMuscleGroup).
    const mainMuscleGroup = exercise.matchingTargets[0] ?? "";
    onAdd({
      id: exercise.id,
      name: exercise.name,
      mainMuscleGroup,
      equipment: exercise.equipment,
    });
    setPendingAvoided(null);
  }

  // ── No muscle targets for this day ─────────────────────────────────────────
  if (broadCategories.length === 0) {
    return (
      <div className="rounded-lg bg-muted/40 px-3 py-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>Ten dzień nie ma przypisanych grup mięśniowych.</span>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-1">
        <Loader2 size={13} className="animate-spin shrink-0" />
        <span>Wczytuję rekomendacje…</span>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle size={13} className="shrink-0" />
          <span>Nie udało się pobrać rekomendacji.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1.5"
          onClick={() => refetch()}
        >
          <RefreshCw size={11} />
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  // ── No profile ─────────────────────────────────────────────────────────────
  if (!data.hasProfile) {
    return (
      <div className="rounded-lg bg-muted/40 px-3 py-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>Brak wywiadu treningowego — rekomendacje niedostępne.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Missing location/equipment data warning */}
      {!data.hasLocationData && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            Brak informacji o miejscu treningu lub dostępnym sprzęcie. Uzupełnij
            wcześniejsze dane, aby otrzymać dokładne rekomendacje.
          </span>
        </div>
      )}

      {/* Avoided exercise confirmation */}
      {pendingAvoided && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-amber-800">{pendingAvoided.name}</p>
              <p className="text-xs text-amber-700">
                Klient wskazał, że chce unikać tego ćwiczenia.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => setPendingAvoided(null)}
            >
              Anuluj
            </Button>
            <Button
              size="sm"
              className="text-xs h-7 bg-amber-600 hover:bg-amber-700"
              onClick={() => doAdd(pendingAvoided)}
            >
              Zastosuj mimo ostrzeżenia
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.exercises.length === 0 && (
        <div className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground text-center">
          Brak ćwiczeń spełniających aktualne kryteria sprzętu, miejsca treningu i profilu klienta.
        </div>
      )}

      {/* Recommendation cards */}
      {data.exercises.map((ex) => {
        const label = scoreLabel(ex.score);
        return (
          <div
            key={ex.id}
            className="rounded-lg border border-border/50 bg-background shadow-sm px-3 py-2.5 space-y-1.5"
          >
            {/* Name + score label */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{ex.name}</p>
                {/* Matching targets */}
                {ex.matchingTargets.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ex.matchingTargets.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-primary/30 text-primary"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 shrink-0 border ${label.className}`}
              >
                {label.text}
              </Badge>
            </div>

            {/* Equipment */}
            {ex.equipment.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ex.equipment.map((eq) => (
                  <Badge key={eq} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    {eq}
                  </Badge>
                ))}
              </div>
            )}

            {/* Match reasons */}
            {ex.matchReasons.length > 0 && (
              <ul className="space-y-0.5">
                {ex.matchReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1 text-[11px] text-emerald-700">
                    <span className="shrink-0 mt-px">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Warn reasons (engine-provided + avoided) */}
            {(ex.warnReasons.length > 0 || ex.isAvoided) && (
              <div className="space-y-0.5">
                {ex.isAvoided && (
                  <div className="flex items-start gap-1 text-[11px] text-amber-700">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>Klient wskazał, że chce unikać tego ćwiczenia.</span>
                  </div>
                )}
                {ex.warnReasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-1 text-[11px] text-amber-700">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add button */}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1.5 border-dashed"
              onClick={() => handleAddClick(ex)}
            >
              <Plus size={12} />
              Dodaj do dnia
            </Button>
          </div>
        );
      })}

      {/* Score note */}
      {data.exercises.length > 0 && (
        <p className="text-[10px] text-muted-foreground px-1">
          Rekomendacje oparte na profilu klienta (poziom doświadczenia, sprzęt, cel
          treningowy). Wynik 0–100.
        </p>
      )}
    </div>
  );
}

// Re-export defaults for use in parent
export { DRAFT_EXERCISE_DEFAULTS };
