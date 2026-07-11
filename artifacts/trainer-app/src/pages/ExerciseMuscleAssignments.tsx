import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMuscles,
  useGetExerciseMuscles,
  useSetExerciseMuscles,
  getGetExerciseMusclesQueryKey,
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
import { Dumbbell, Pencil, Plus, X } from "lucide-react";

// Suggested coaching coefficients for secondary muscles.
const COEFFICIENT_OPTIONS = [
  { value: "0", label: "0,0 — nie liczone" },
  { value: "0.25", label: "0,25 — mały udział" },
  { value: "0.5", label: "0,5 — istotny udział" },
  { value: "0.75", label: "0,75 — duży udział" },
  { value: "1", label: "1,0 — pełny udział" },
] as const;

type SecondaryEntry = {
  key: string;
  muscleId: string; // "" while not yet chosen
  coefficient: string;
};

interface Props {
  exerciseId: number;
}

export default function ExerciseMuscleAssignments({ exerciseId }: Props) {
  const queryClient = useQueryClient();
  const keyRef = useRef(0);
  const nextKey = () => String(keyRef.current++);

  const [isEditing, setIsEditing] = useState(false);
  const [primaryMuscleId, setPrimaryMuscleId] = useState<string>("");
  const [secondaryEntries, setSecondaryEntries] = useState<SecondaryEntry[]>([]);

  const { data: allMuscles = [] } = useListMuscles();
  const { data: assignments = [], isLoading } = useGetExerciseMuscles(exerciseId);
  const setMuscles = useSetExerciseMuscles();

  // ─── Edit mode helpers ────────────────────────────────────────────────────

  const enterEditMode = () => {
    const primary = assignments.find((a) => a.isPrimary);
    const secondary = assignments.filter((a) => !a.isPrimary);
    setPrimaryMuscleId(primary ? String(primary.specificMuscleId) : "");
    setSecondaryEntries(
      secondary.map((a) => ({
        key: nextKey(),
        muscleId: String(a.specificMuscleId),
        coefficient: String(a.coefficient),
      })),
    );
    setIsEditing(true);
  };

  const addSecondary = () => {
    setSecondaryEntries((prev) => [
      ...prev,
      { key: nextKey(), muscleId: "", coefficient: "0.5" },
    ]);
  };

  const removeSecondary = (key: string) => {
    setSecondaryEntries((prev) => prev.filter((e) => e.key !== key));
  };

  const updateSecondary = (
    key: string,
    field: "muscleId" | "coefficient",
    value: string,
  ) => {
    setSecondaryEntries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)),
    );
  };

  const save = () => {
    const list: { specificMuscleId: number; isPrimary: boolean; coefficient: number }[] = [];

    if (primaryMuscleId) {
      list.push({ specificMuscleId: Number(primaryMuscleId), isPrimary: true, coefficient: 1.0 });
    }

    for (const entry of secondaryEntries) {
      if (entry.muscleId) {
        list.push({
          specificMuscleId: Number(entry.muscleId),
          isPrimary: false,
          coefficient: Number(entry.coefficient),
        });
      }
    }

    setMuscles.mutate(
      { id: exerciseId, data: { assignments: list } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExerciseMusclesQueryKey(exerciseId) });
          setIsEditing(false);
        },
      },
    );
  };

  // ─── Available muscle options (prevent duplicates across selects) ─────────

  // All muscle IDs currently committed to any slot.
  const usedIds = new Set([
    primaryMuscleId,
    ...secondaryEntries.map((e) => e.muscleId),
  ]);

  // For the primary select: exclude muscles already used as secondary.
  const availableForPrimary = allMuscles.filter(
    (m) =>
      !secondaryEntries.some((e) => e.muscleId === String(m.id)) ||
      String(m.id) === primaryMuscleId,
  );

  // For a given secondary entry: exclude the primary + other secondaries,
  // but keep this entry's own current value visible.
  const availableForSecondary = (ownMuscleId: string) =>
    allMuscles.filter(
      (m) => !usedIds.has(String(m.id)) || String(m.id) === ownMuscleId,
    );

  // Save is blocked when there are any entries (primary or secondary) but
  // no primary is selected, since the backend requires exactly one primary
  // if assignments are non-empty.
  const hasPendingSecondaryWithoutPrimary =
    secondaryEntries.some((e) => e.muscleId !== "") && !primaryMuscleId;

  // ─── View mode ─────────────────────────────────────────────────────────────

  if (!isEditing) {
    return (
      <div className="col-span-full bg-card border border-border/50 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Dumbbell size={16} className="text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Precyzyjne przypisanie mięśni
            </h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={enterEditMode}
            className="h-7 gap-1 text-xs"
          >
            <Pencil size={12} />
            Edytuj
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Ładowanie...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak przypisanych mięśni.{" "}
            <button
              onClick={enterEditMode}
              className="underline hover:text-foreground transition-colors"
            >
              Przypisz mięśnie
            </button>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      a.isPrimary
                        ? "bg-primary/10 text-primary border-primary/20 text-xs"
                        : "bg-muted text-muted-foreground text-xs"
                    }
                  >
                    {a.isPrimary ? "Główny" : "Pomocniczy"}
                  </Badge>
                  <span className="text-sm font-medium">{a.muscleName}</span>
                  <span className="text-xs text-muted-foreground">({a.broadCategory})</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  × {Number(a.coefficient).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Edit mode ─────────────────────────────────────────────────────────────

  return (
    <div className="col-span-full bg-card border border-border/50 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Dumbbell size={16} className="text-muted-foreground" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Precyzyjne przypisanie mięśni
        </h4>
      </div>

      {/* Primary muscle */}
      <div className="mb-5">
        <label className="text-sm font-medium mb-1.5 block">
          Mięsień główny{" "}
          <span className="text-destructive">*</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (współczynnik 1,0 — zawsze)
          </span>
        </label>
        <Select value={primaryMuscleId} onValueChange={setPrimaryMuscleId}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Wybierz mięsień główny..." />
          </SelectTrigger>
          <SelectContent>
            {availableForPrimary.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
                <span className="text-muted-foreground"> — {m.broadCategory}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Secondary muscles */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-1.5 block">Mięśnie pomocnicze</label>
        <div className="flex flex-col gap-2">
          {secondaryEntries.map((entry) => (
            <div key={entry.key} className="flex items-center gap-2">
              {/* Muscle select */}
              <div className="flex-1 min-w-0">
                <Select
                  value={entry.muscleId}
                  onValueChange={(v) => updateSecondary(entry.key, "muscleId", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Wybierz mięsień..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForSecondary(entry.muscleId).map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                        <span className="text-muted-foreground"> — {m.broadCategory}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Coefficient select */}
              <div className="w-52 shrink-0">
                <Select
                  value={entry.coefficient}
                  onValueChange={(v) => updateSecondary(entry.key, "coefficient", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COEFFICIENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeSecondary(entry.key)}
              >
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 gap-1 text-muted-foreground"
          onClick={addSecondary}
        >
          <Plus size={14} />
          Dodaj mięsień pomocniczy
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-4 italic">
        Współczynniki to szacunki trenerskie — nie są wartościami naukowymi.
      </p>

      {setMuscles.isError && (
        <p className="text-sm text-destructive mb-3">
          Nie udało się zapisać przypisania mięśni. Sprawdź dane i spróbuj ponownie.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsEditing(false)}
          disabled={setMuscles.isPending}
        >
          Anuluj
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={setMuscles.isPending || hasPendingSecondaryWithoutPrimary}
        >
          {setMuscles.isPending ? "Zapisywanie..." : "Zapisz mięśnie"}
        </Button>
      </div>
    </div>
  );
}
