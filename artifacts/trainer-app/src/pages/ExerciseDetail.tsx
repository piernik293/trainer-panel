import { useParams, Link, useLocation } from "wouter";
import {
  useGetExercise,
  useUpdateExercise,
  getListExercisesQueryKey,
  getGetExerciseQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Ban, RotateCcw } from "lucide-react";

function DetailBlock({ label, value, fullWidth = false }: { label: string; value: React.ReactNode; fullWidth?: boolean }) {
  if (!value) return null;

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

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const exerciseId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: exercise, isLoading } = useGetExercise(exerciseId);
  const updateExercise = useUpdateExercise();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie danych...</div>;
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={toggleActive} disabled={updateExercise.isPending}>
            {exercise.isActive ? (
              <>
                <Ban size={16} className="mr-2" />
                Oznacz jako nieaktywne
              </>
            ) : (
              <>
                <RotateCcw size={16} className="mr-2" />
                Przywróć
              </>
            )}
          </Button>
          <Button onClick={() => setLocation(`/exercises/${exerciseId}/edit`)}>
            <Pencil size={16} className="mr-2" />
            Edytuj
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          value={exercise.trainingLocation.length > 0 ? exercise.trainingLocation.join(", ") : undefined}
        />
        <DetailBlock label="Opis" value={exercise.description} fullWidth />
        <DetailBlock label="Instrukcje wykonania" value={exercise.executionInstructions} fullWidth />
        <DetailBlock label="Częste błędy" value={exercise.commonMistakes} fullWidth />
        <DetailBlock label="Wskazówki trenerskie" value={exercise.coachingTips} fullWidth />
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
    </div>
  );
}
