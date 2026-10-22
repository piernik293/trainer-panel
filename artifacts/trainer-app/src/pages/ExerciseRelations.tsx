import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListExercises,
  useGetExerciseSubstitutions,
  useAddExerciseSubstitution,
  useRemoveExerciseSubstitution,
  useGetExerciseProgressions,
  useAddExerciseProgression,
  useRemoveExerciseProgression,
  getGetExerciseSubstitutionsQueryKey,
  getGetExerciseProgressionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownUp, GitBranch, Plus, X } from "lucide-react";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";

interface Props {
  exerciseId: number;
}

// ─── Substitutions ────────────────────────────────────────────────────────────

function SubstitutionsSection({ exerciseId }: Props) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const { data: allExercises = [] } = useListExercises({ isActive: true });
  const { data: substitutions = [], isLoading, isError, error, refetch } = useGetExerciseSubstitutions(exerciseId);
  const addSub = useAddExerciseSubstitution();
  const removeSub = useRemoveExerciseSubstitution();

  const usedIds = new Set([
    exerciseId,
    ...substitutions.map((s) => s.substituteExerciseId),
  ]);

  const available = allExercises.filter((e) => !usedIds.has(e.id));

  const handleAdd = () => {
    if (!selectedId) return;
    addSub.mutate(
      { id: exerciseId, data: { substituteExerciseId: Number(selectedId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExerciseSubstitutionsQueryKey(exerciseId) });
          setSelectedId("");
          setIsAdding(false);
        },
      },
    );
  };

  const handleRemove = (substituteId: number) => {
    removeSub.mutate(
      { id: exerciseId, substituteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExerciseSubstitutionsQueryKey(exerciseId) });
        },
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ArrowDownUp size={14} className="text-muted-foreground" />
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Zamienniki
          </h5>
        </div>
        {!isAdding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={12} />
            Dodaj
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Ładowanie...</p>
      ) : isError ? (
        <ErrorState title="Nie udało się wczytać zamienników" message={humanizeError(error)} onRetry={() => void refetch()} />
      ) : substitutions.length === 0 && !isAdding ? (
        <p className="text-sm text-muted-foreground">
          Brak zamienników.{" "}
          <button
            onClick={() => setIsAdding(true)}
            className="underline hover:text-foreground transition-colors"
          >
            Dodaj zamiennik
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {substitutions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
            >
              <span className="text-sm">{s.substituteName}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(s.substituteExerciseId)}
                disabled={removeSub.isPending}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isAdding && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-background h-8 text-sm">
                <SelectValue placeholder="Wybierz zamiennik..." />
              </SelectTrigger>
              <SelectContent>
                {available.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={!selectedId || addSub.isPending}
          >
            {addSub.isPending ? "..." : "Dodaj"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => { setIsAdding(false); setSelectedId(""); }}
          >
            Anuluj
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Progressions ─────────────────────────────────────────────────────────────

function ProgressionsSection({
  exerciseId,
  direction,
  label,
}: Props & { direction: "progression" | "regression"; label: string }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const { data: allExercises = [] } = useListExercises({ isActive: true });
  const { data: allProgressions = [], isLoading, isError, error, refetch } = useGetExerciseProgressions(exerciseId);
  const addProg = useAddExerciseProgression();
  const removeProg = useRemoveExerciseProgression();

  const items = allProgressions.filter((p) => p.direction === direction);
  const usedIds = new Set([
    exerciseId,
    ...items.map((p) => p.linkedExerciseId),
  ]);
  const available = allExercises.filter((e) => !usedIds.has(e.id));

  const handleAdd = () => {
    if (!selectedId) return;
    addProg.mutate(
      { id: exerciseId, data: { linkedExerciseId: Number(selectedId), direction } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExerciseProgressionsQueryKey(exerciseId) });
          setSelectedId("");
          setIsAdding(false);
        },
      },
    );
  };

  const handleRemove = (progressionId: number) => {
    removeProg.mutate(
      { id: exerciseId, progressionId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExerciseProgressionsQueryKey(exerciseId) });
        },
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-muted-foreground" />
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </h5>
        </div>
        {!isAdding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={12} />
            Dodaj
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Ładowanie...</p>
      ) : isError ? (
        <ErrorState title="Nie udało się wczytać powiązań" message={humanizeError(error)} onRetry={() => void refetch()} />
      ) : items.length === 0 && !isAdding ? (
        <p className="text-sm text-muted-foreground">
          Brak powiązań.{" "}
          <button
            onClick={() => setIsAdding(true)}
            className="underline hover:text-foreground transition-colors"
          >
            Dodaj
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {idx > 0 && <span className="text-xs text-muted-foreground">↓</span>}
                <span className="text-sm">{p.linkedExerciseName}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(p.id)}
                disabled={removeProg.isPending}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isAdding && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-background h-8 text-sm">
                <SelectValue placeholder="Wybierz ćwiczenie..." />
              </SelectTrigger>
              <SelectContent>
                {available.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={!selectedId || addProg.isPending}
          >
            {addProg.isPending ? "..." : "Dodaj"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => { setIsAdding(false); setSelectedId(""); }}
          >
            Anuluj
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Combined section ─────────────────────────────────────────────────────────

export default function ExerciseRelations({ exerciseId }: Props) {
  return (
    <div className="col-span-full bg-card border border-border/50 rounded-xl p-5 shadow-sm space-y-6">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Powiązane ćwiczenia
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-border/50">
        <div className="pt-4 md:pt-0 md:pr-6">
          <SubstitutionsSection exerciseId={exerciseId} />
        </div>
        <div className="pt-4 md:pt-0 md:px-6">
          <ProgressionsSection exerciseId={exerciseId} direction="regression" label="Regresja (łatwiejsze)" />
        </div>
        <div className="pt-4 md:pt-0 md:pl-6">
          <ProgressionsSection exerciseId={exerciseId} direction="progression" label="Progresja (trudniejsze)" />
        </div>
      </div>
    </div>
  );
}
