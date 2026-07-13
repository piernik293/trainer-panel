/**
 * ExerciseRecommendationsTab
 *
 * Displays scored exercise recommendations for a client based on their
 * survey profile. Rendered inside the ClientDetail page as a tab.
 *
 * Architecture note
 * -----------------
 * This component is read-only — it surfaces the recommendation engine's output
 * to the trainer for manual review. No exercises are added to plans from here.
 * The trainer uses these recommendations as guidance when building plans in the
 * Plan Editor (where the ExercisePicker also shows a Recommended tab).
 *
 * FUTURE: When an AI plan-generation feature is added, it will consume the
 * same /clients/:id/exercise-recommendations endpoint, not this component.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useListExerciseRecommendations, getListExerciseRecommendationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, AlertCircle, Info, ChevronRight, Dumbbell } from "lucide-react";
import { MAIN_MUSCLE_GROUPS } from "@/lib/exercise-constants";

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
      : score >= 45
      ? "bg-amber-500/10 text-amber-700 border-amber-200"
      : "bg-muted/50 text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-bold text-xs px-2 py-0.5 tabular-nums ${color}`}
      title="Wynik dopasowania (0–100)"
    >
      {score}
    </span>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-muted-foreground/40";

  return (
    <div className="h-1 w-full rounded-full bg-border/30 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoProfile() {
  return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Info className="w-6 h-6 text-muted-foreground/60" />
      </div>
      <p className="font-medium">Brak profilu klienta</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Wypełnij wywiad treningowy, aby zobaczyć dopasowane ćwiczenia.
      </p>
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Dumbbell className="w-6 h-6 text-muted-foreground/60" />
      </div>
      <p className="font-medium">Brak wyników</p>
      <p className="text-sm text-muted-foreground">Brak kompletnych ćwiczeń dla tej partii mięśniowej.</p>
      <Button variant="outline" size="sm" onClick={onClear}>Wyczyść filtr</Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  clientId: number;
  hasSurvey: boolean;
}

export default function ExerciseRecommendationsTab({ clientId, hasSurvey }: Props) {
  const [muscleFilter, setMuscleFilter] = useState<string>("all");

  const params = muscleFilter !== "all" ? { mainMuscleGroup: muscleFilter } : {};
  const { data, isLoading } = useListExerciseRecommendations(
    clientId,
    params,
    { query: { enabled: hasSurvey, queryKey: getListExerciseRecommendationsQueryKey(clientId, params) } },
  );

  if (!hasSurvey) return <NoProfile />;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.hasProfile) return <NoProfile />;

  const exercises = data.exercises;

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Rekomendowane ćwiczenia
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Posortowane według dopasowania do profilu klienta. Tylko kompletne ćwiczenia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={muscleFilter} onValueChange={setMuscleFilter}>
            <SelectTrigger className="w-[180px] h-8 text-sm bg-background">
              <SelectValue placeholder="Wszystkie partie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie partie</SelectItem>
              {MAIN_MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Score legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          Świetne dopasowanie (75+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          Dobre dopasowanie (45–74)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />
          Neutralne (0–44)
        </span>
      </div>

      {/* List */}
      {exercises.length === 0 ? (
        <NoResults onClear={() => setMuscleFilter("all")} />
      ) : (
        <div className="space-y-2">
          {exercises.map((ex, idx) => (
            <Card
              key={ex.id}
              className="border-border/50 shadow-sm hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Rank */}
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center text-xs font-medium">
                    {idx + 1}
                  </span>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/exercises/${ex.id}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline truncate"
                      >
                        {ex.name}
                      </Link>
                      <ScoreBadge score={ex.score} />
                    </div>

                    {/* Score bar */}
                    <ScoreBar score={ex.score} />

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">{ex.mainMuscleGroup}</span>
                      {ex.difficultyLevel && (
                        <>
                          <span className="text-border">·</span>
                          <span className="text-muted-foreground">{ex.difficultyLevel}</span>
                        </>
                      )}
                      {ex.exerciseType && (
                        <>
                          <span className="text-border">·</span>
                          <span className="text-muted-foreground">{ex.exerciseType}</span>
                        </>
                      )}
                      {ex.movementPattern && (
                        <>
                          <span className="text-border">·</span>
                          <span className="text-muted-foreground">{ex.movementPattern}</span>
                        </>
                      )}
                    </div>

                    {/* Match reasons */}
                    {ex.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ex.matchReasons.map((reason) => (
                          <Badge
                            key={reason}
                            variant="outline"
                            className="text-xs py-0 bg-emerald-500/5 text-emerald-700 border-emerald-200"
                          >
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Warn reasons */}
                    {ex.warnReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ex.warnReasons.map((reason) => (
                          <Badge
                            key={reason}
                            variant="outline"
                            className="text-xs py-0 bg-red-500/5 text-red-600 border-red-200 flex items-center gap-1"
                          >
                            <AlertCircle size={10} />
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <Link href={`/exercises/${ex.id}`} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Wyświetlono {exercises.length} ćwiczeń · Tylko kompletne ćwiczenia są uwzględniane w rekomendacjach
      </p>
    </div>
  );
}
