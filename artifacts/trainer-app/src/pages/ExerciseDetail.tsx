import { useParams, Link, useLocation } from "wouter";
import ExerciseMuscleAssignments from "./ExerciseMuscleAssignments";
import ExerciseRelations from "./ExerciseRelations";
import {
  useGetExercise,
  useUpdateExercise,
  getListExercisesQueryKey,
  getGetExerciseQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Pencil, Ban, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { EXECUTION_LABELS, getLocationDisplayLabel } from "@/lib/exercise-constants";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";

// ─── DetailBlock ──────────────────────────────────────────────────────────────

function DetailBlock({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0))
    return null;

  return (
    <div className={`bg-card border border-border/50 rounded-xl p-5 shadow-sm ${fullWidth ? "col-span-full" : ""}`}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</h4>
      {typeof value === "string" ? (
        <p className="text-foreground whitespace-pre-wrap">{value}</p>
      ) : (
        value
      )}
    </div>
  );
}

function RatingBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary text-sm font-semibold">
      {value}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="col-span-full text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 mt-2">
      {children}
    </h3>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const exerciseId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: exercise, isLoading, isError, error, refetch } = useGetExercise(exerciseId);
  const updateExercise = useUpdateExercise();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie danych...</div>;
  }

  // "Not found" only for a real 404 — other failures get an error with retry.
  if (isError && (error as { status?: number } | null)?.status !== 404) {
    return (
      <div className="p-6">
        <ErrorState
          title="Nie udało się wczytać ćwiczenia"
          message={humanizeError(error)}
          onRetry={() => void refetch()}
          backHref="/exercises"
          backLabel="Wróć do biblioteki"
        />
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Ćwiczenie nie znalezione.{" "}
        <Link href="/exercises" className="underline">Wróć do biblioteki</Link>
      </div>
    );
  }

  const toggleActive = () => {
    updateExercise.mutate(
      { id: exerciseId, data: { isActive: !exercise.isActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetExerciseQueryKey(exerciseId) });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/exercises" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft size={16} />
        Powrót do biblioteki
      </Link>

      {/* Completeness warning panel */}
      {!exercise.isComplete && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <p className="font-semibold text-amber-800 mb-2">
              Ćwiczenie jest niekompletne.
            </p>
            <p className="text-sm text-amber-700 mb-2">Brakujące informacje:</p>
            <ul className="space-y-1">
              {exercise.missingFields.map((field) => (
                <li key={field} className="flex items-center gap-2 text-sm text-amber-700">
                  <CheckCircle2 size={13} className="flex-shrink-0" />
                  {field}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => setLocation(`/exercises/${exerciseId}/edit`)}
            >
              <Pencil size={13} className="mr-1.5" />
              Uzupełnij dane
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            {exercise.name}
          </h1>
          <Badge
            variant="outline"
            className={exercise.isActive
              ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
              : "bg-muted text-muted-foreground"}
          >
            {exercise.isActive ? "Aktywne" : "Nieaktywne"}
          </Badge>
          {exercise.exerciseType && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
              {exercise.exerciseType}
            </Badge>
          )}
          {exercise.exercisePriority && (
            <Badge variant="outline" className="text-muted-foreground">
              Priorytet: {exercise.exercisePriority}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={toggleActive} disabled={updateExercise.isPending}>
            {exercise.isActive ? (
              <><Ban size={16} className="mr-2" />Oznacz jako nieaktywne</>
            ) : (
              <><RotateCcw size={16} className="mr-2" />Przywróć</>
            )}
          </Button>
          <Button onClick={() => setLocation(`/exercises/${exerciseId}/edit`)}>
            <Pencil size={16} className="mr-2" />
            Edytuj
          </Button>
        </div>
      </div>

      {/* ── Section 1: Basic Information ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionHeader>Podstawowe informacje</SectionHeader>

        <DetailBlock label="Główna partia mięśniowa" value={exercise.mainMuscleGroup} />
        <DetailBlock label="Poziom trudności" value={exercise.difficultyLevel} />
        <DetailBlock
          label="Drugoplanowe partie mięśniowe"
          value={exercise.secondaryMuscleGroups.length > 0 ? exercise.secondaryMuscleGroups.join(", ") : undefined}
        />
        <DetailBlock label="Wzorzec ruchowy" value={exercise.movementPattern} />
        <DetailBlock
          label="Sprzęt"
          value={
            exercise.equipment.length > 0
              ? `${exercise.equipment.join(", ")}${exercise.equipmentOther ? ` (${exercise.equipmentOther})` : ""}`
              : undefined
          }
        />
        <DetailBlock
          label="Miejsce treningu"
          value={exercise.trainingLocation.length > 0 ? exercise.trainingLocation.map(getLocationDisplayLabel).join(", ") : undefined}
        />
      </div>

      {/* ── Section 2: Coaching Information ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionHeader>Informacje trenerskie</SectionHeader>

        <DetailBlock label="Opis" value={exercise.description} fullWidth />
        <DetailBlock label="Instrukcje wykonania" value={exercise.executionInstructions} fullWidth />
        <DetailBlock label="Częste błędy" value={exercise.commonMistakes} fullWidth />
        <DetailBlock label="Wskazówki trenerskie" value={exercise.coachingTips} fullWidth />
        <DetailBlock label="Wskazówki oddechowe" value={exercise.breathingTips} fullWidth />
        <DetailBlock label="Uwagi dot. bezpieczeństwa" value={exercise.safetyNotes} fullWidth />
        <DetailBlock label="Tempo" value={exercise.tempo} />
        <DetailBlock label="Zalecany zakres ruchu" value={exercise.rangeOfMotion} />
        <DetailBlock
          label="Wideo"
          value={exercise.videoUrl ? (
            <a href={exercise.videoUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
              {exercise.videoUrl}
            </a>
          ) : undefined}
        />
        <DetailBlock
          label="Zdjęcie"
          value={exercise.imageUrl ? (
            <a href={exercise.imageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
              {exercise.imageUrl}
            </a>
          ) : undefined}
        />
      </div>

      {/* ── Section 3: Muscle Assignments ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionHeader>Precyzyjne przypisanie mięśni</SectionHeader>
        <ExerciseMuscleAssignments exerciseId={exerciseId} />
      </div>

      {/* ── Section 4: AI Exercise Intelligence ── */}
      {(
        (exercise.suitableExperienceLevels?.length ?? 0) > 0 ||
        (exercise.trainingGoals?.length ?? 0) > 0 ||
        exercise.movementCategory ||
        exercise.planeOfMotion ||
        exercise.execution ||
        exercise.resistanceType ||
        exercise.requiresSpotter != null ||
        exercise.canBePerformedToFailure ||
        exercise.jointStress ||
        exercise.learningDifficulty != null ||
        exercise.neurologicalFatigue != null ||
        exercise.domsPotential != null
      ) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionHeader>Inteligencja ćwiczenia</SectionHeader>

          <DetailBlock
            label="Odpowiedni poziom doświadczenia"
            value={
              (exercise.suitableExperienceLevels?.length ?? 0) > 0
                ? exercise.suitableExperienceLevels!.join(", ")
                : undefined
            }
            fullWidth
          />
          <DetailBlock
            label="Cel treningowy"
            value={
              (exercise.trainingGoals?.length ?? 0) > 0
                ? exercise.trainingGoals!.join(", ")
                : undefined
            }
            fullWidth
          />
          <DetailBlock label="Kategoria ruchu" value={exercise.movementCategory} />
          <DetailBlock label="Płaszczyzna ruchu" value={exercise.planeOfMotion} />
          <DetailBlock label="Wykonanie" value={exercise.execution ? (EXECUTION_LABELS[exercise.execution] ?? exercise.execution) : undefined} />
          <DetailBlock label="Typ oporu" value={exercise.resistanceType} />
          <DetailBlock
            label="Wymaga asekuracji"
            value={exercise.requiresSpotter != null ? (exercise.requiresSpotter ? "Tak" : "Nie") : undefined}
          />
          <DetailBlock label="Możliwość wykonania do upadku" value={exercise.canBePerformedToFailure} />
          <DetailBlock label="Obciążenie stawów" value={exercise.jointStress} />

          {(exercise.learningDifficulty != null || exercise.neurologicalFatigue != null || exercise.domsPotential != null) && (
            <div className="col-span-full bg-card border border-border/50 rounded-xl p-5 shadow-sm">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Oceny</h4>
              <div className="flex flex-wrap gap-6">
                {exercise.learningDifficulty != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Trudność nauki</span>
                    <RatingBadge value={exercise.learningDifficulty} />
                  </div>
                )}
                {exercise.neurologicalFatigue != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Zmęczenie neurologiczne</span>
                    <RatingBadge value={exercise.neurologicalFatigue} />
                  </div>
                )}
                {exercise.domsPotential != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Potencjał DOMS</span>
                    <RatingBadge value={exercise.domsPotential} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Related Exercises ── */}
      <div className="grid grid-cols-1 gap-4">
        <SectionHeader>Powiązane ćwiczenia</SectionHeader>
        <ExerciseRelations exerciseId={exerciseId} />
      </div>
    </div>
  );
}
