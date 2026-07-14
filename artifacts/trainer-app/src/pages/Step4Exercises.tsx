/**
 * Step4Exercises — "Ćwiczenia" step of the Plan Draft Wizard (Phase 4A).
 *
 * Manual exercise selection per workout day. Local draft only — nothing is
 * persisted until Phase 5.
 *
 * Rules implemented here:
 * - Shows each workout day from the current distribution.
 * - Trainer adds exercises via a compact selector (search + muscle-group filter).
 * - Avoided exercises show a warning and require manual confirmation.
 * - Exercise cards are editable (sets, reps, RIR, rest).
 * - Exercises are reorderable via DnD within the same day only.
 * - Core exercises always remain at the bottom of a day.
 */

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useListExercises,
  useGetClientAvoidedExercises,
  type Exercise,
  type ClientAvoidedExercise,
} from "@workspace/api-client-react";
import type { WeeklyVolumeDistributionResponseType } from "@workspace/api-zod";
import {
  type DraftExercise,
  type ExerciseDraftByDay,
  DRAFT_EXERCISE_DEFAULTS,
  addExerciseToDay,
  removeExerciseFromDay,
  updateDraftExerciseField,
  reorderExercisesInDay,
  validateSets,
  validateReps,
  validateRir,
} from "@/lib/exerciseDraftHelpers";
import { MAIN_MUSCLE_GROUPS, EQUIPMENT_OPTIONS } from "@/lib/exercise-constants";
import { filterNonZeroAllocations } from "@/lib/distributionHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  GripVertical,
  Lightbulb,
  Plus,
  Trash2,
  Loader2,
  Info,
} from "lucide-react";
import DayRecommendations, { type AddFromRecommendationPayload } from "@/components/DayRecommendations";
import { WeeklyVolumeCoverage, DayVolumeCoverage } from "@/components/VolumeCoverageSection";
import type { DraftVolumePreviewResult } from "@/hooks/useVolumeCoverage";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Step4ExercisesProps {
  distributionResult: WeeklyVolumeDistributionResponseType;
  exerciseDraft: ExerciseDraftByDay;
  onDraftChange: (draft: ExerciseDraftByDay) => void;
  clientId: number;
  /** Coverage result lifted from PlanDraftWizard (shared with Step 5). */
  previewResult: DraftVolumePreviewResult | null;
  coverageLoading: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Step4Exercises({
  distributionResult,
  exerciseDraft,
  onDraftChange,
  clientId,
  previewResult,
  coverageLoading,
}: Step4ExercisesProps) {
  const [selectorForDay, setSelectorForDay] = useState<number | null>(null);
  const [recOpenForDay, setRecOpenForDay] = useState<number | null>(null);

  const { data: avoidedExercises = [] } = useGetClientAvoidedExercises(clientId);

  /** Add an exercise chosen from the recommendation panel (no full Exercise type needed). */
  const handleAddFromRecommendation = useCallback(
    (dayIndex: number, payload: AddFromRecommendationPayload) => {
      const next = addExerciseToDay(exerciseDraft, dayIndex, {
        exerciseId: payload.id,
        exerciseName: payload.name,
        mainMuscleGroup: payload.mainMuscleGroup,
        equipment: payload.equipment,
        isCore: false,
        sets: DRAFT_EXERCISE_DEFAULTS.sets,
        repsMin: DRAFT_EXERCISE_DEFAULTS.repsMin,
        repsMax: DRAFT_EXERCISE_DEFAULTS.repsMax,
        rir: DRAFT_EXERCISE_DEFAULTS.rir,
        restSeconds: DRAFT_EXERCISE_DEFAULTS.restSeconds,
      });
      onDraftChange(next);
    },
    [exerciseDraft, onDraftChange],
  );

  function handleAdd(dayIndex: number, exercise: Exercise) {
    const next = addExerciseToDay(exerciseDraft, dayIndex, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      mainMuscleGroup: exercise.mainMuscleGroup,
      equipment: exercise.equipment,
      isCore: false,
      sets: DRAFT_EXERCISE_DEFAULTS.sets,
      repsMin: DRAFT_EXERCISE_DEFAULTS.repsMin,
      repsMax: DRAFT_EXERCISE_DEFAULTS.repsMax,
      rir: DRAFT_EXERCISE_DEFAULTS.rir,
      restSeconds: DRAFT_EXERCISE_DEFAULTS.restSeconds,
    });
    onDraftChange(next);
    setSelectorForDay(null);
  }

  function handleRemove(dayIndex: number, localId: string) {
    onDraftChange(removeExerciseFromDay(exerciseDraft, dayIndex, localId));
  }

  function handleFieldChange<K extends keyof DraftExercise>(
    dayIndex: number,
    localId: string,
    field: K,
    value: DraftExercise[K],
  ) {
    onDraftChange(updateDraftExerciseField(exerciseDraft, dayIndex, localId, field, value));
  }

  function handleReorder(dayIndex: number, oldIndex: number, newIndex: number) {
    onDraftChange(reorderExercisesInDay(exerciseDraft, dayIndex, oldIndex, newIndex));
  }

  return (
    <div className="space-y-4">
      {/* Helper note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          To wartość analityczna. Rzeczywiste serie robocze wynikają z dobranych ćwiczeń.
        </span>
      </div>

      {/* Weekly volume coverage summary */}
      <WeeklyVolumeCoverage
        distributionResult={distributionResult}
        exerciseDraft={exerciseDraft}
        previewResult={previewResult}
        isLoading={coverageLoading}
      />

      {/* One card per day */}
      {distributionResult.days.map((day) => {
        const dayExercises = exerciseDraft[day.dayIndex] ?? [];
        const nonZeroTargets = filterNonZeroAllocations(day.targetAllocations);
        const coreAlloc = distributionResult.auxiliaryCoreBlock.dayAllocations.find(
          (a) => a.dayIndex === day.dayIndex,
        );

        // Broad categories for this day — maps targetId → broadCategory via targetDecisions
        const broadCategories = nonZeroTargets
          .map((alloc) =>
            distributionResult.targetDecisions.find((d) => d.targetId === alloc.targetId)
              ?.broadCategory,
          )
          .filter((c): c is string => Boolean(c));

        // IDs of exercises already in this day (excluded from recommendations)
        const alreadyAddedIds = dayExercises.map((e) => e.exerciseId);

        const isRecOpen = recOpenForDay === day.dayIndex;

        return (
          <Card key={day.dayIndex} className="border-border/50 shadow-sm">
            <CardContent className="p-4 space-y-3">
              {/* Day header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    Dzień {day.dayIndex + 1}: {day.dayName}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {day.dayType}
                  </Badge>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    Objętość efektywna targetów:{" "}
                    <span className="font-medium text-foreground">
                      {day.totalEffectiveTargetVolume} pkt.
                    </span>
                  </p>
                </div>
              </div>

              {/* Target allocations */}
              {nonZeroTargets.length > 0 && (
                <div className="space-y-0.5 border-t border-border/30 pt-2">
                  {nonZeroTargets.map((alloc) => (
                    <div key={alloc.targetId} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{alloc.targetName}</span>
                      <span className="text-muted-foreground">{alloc.allocatedVolume} pkt. obj. efektywnej</span>
                    </div>
                  ))}
                  {coreAlloc && coreAlloc.sets > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground italic">Core / brzuch (pomocnicze)</span>
                      <span className="text-muted-foreground">{coreAlloc.sets} serie</span>
                    </div>
                  )}
                </div>
              )}

              {/* Per-day volume coverage (planned vs actual) */}
              <DayVolumeCoverage
                day={day}
                exerciseDraft={exerciseDraft}
                previewResult={previewResult}
                isLoading={coverageLoading}
                auxiliaryCoreBlock={distributionResult.auxiliaryCoreBlock}
              />

              {/* Exercise list */}
              <DayExerciseList
                dayIndex={day.dayIndex}
                exercises={dayExercises}
                avoidedExercises={avoidedExercises}
                onRemove={handleRemove}
                onFieldChange={handleFieldChange}
                onReorder={handleReorder}
              />

              {/* Action buttons row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Manual exercise selector */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-dashed"
                  onClick={() => setSelectorForDay(day.dayIndex)}
                >
                  <Plus size={14} />
                  Dodaj ćwiczenie
                </Button>

                {/* Recommendation toggle */}
                <Button
                  variant={isRecOpen ? "secondary" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setRecOpenForDay(isRecOpen ? null : day.dayIndex)
                  }
                >
                  <Lightbulb size={14} />
                  {isRecOpen ? "Ukryj rekomendacje" : "Pokaż rekomendacje"}
                </Button>
              </div>

              {/* Inline recommendations panel */}
              {isRecOpen && (
                <div className="border-t border-border/30 pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Rekomendacje dla tego dnia
                  </p>
                  <DayRecommendations
                    clientId={clientId}
                    broadCategories={broadCategories}
                    alreadyAddedIds={alreadyAddedIds}
                    onAdd={(payload) =>
                      handleAddFromRecommendation(day.dayIndex, payload)
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Exercise selector dialog */}
      {selectorForDay !== null && (
        <ExerciseSelectorDialog
          open={selectorForDay !== null}
          onOpenChange={(open) => { if (!open) setSelectorForDay(null); }}
          avoidedExercises={avoidedExercises}
          onSelect={(exercise) => handleAdd(selectorForDay!, exercise)}
        />
      )}
    </div>
  );
}

// ─── Day exercise list (with DnD) ─────────────────────────────────────────────

interface DayExerciseListProps {
  dayIndex: number;
  exercises: DraftExercise[];
  avoidedExercises: ClientAvoidedExercise[];
  onRemove: (dayIndex: number, localId: string) => void;
  onFieldChange: <K extends keyof DraftExercise>(dayIndex: number, localId: string, field: K, value: DraftExercise[K]) => void;
  onReorder: (dayIndex: number, oldIndex: number, newIndex: number) => void;
}

function DayExerciseList({
  dayIndex,
  exercises,
  avoidedExercises,
  onRemove,
  onFieldChange,
  onReorder,
}: DayExerciseListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = exercises.findIndex((e) => e.localId === active.id);
    const newIdx = exercises.findIndex((e) => e.localId === over.id);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(dayIndex, oldIdx, newIdx);
    }
  }

  if (exercises.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3 italic">
        Brak ćwiczeń — kliknij „Dodaj ćwiczenie".
      </p>
    );
  }

  const localIds = exercises.map((e) => e.localId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {exercises.map((ex) => {
            const avoided = avoidedExercises.find((a) => a.id === ex.exerciseId);
            return (
              <SortableDraftExerciseCard
                key={ex.localId}
                exercise={ex}
                avoidedReason={avoided?.reason ?? null}
                onRemove={() => onRemove(dayIndex, ex.localId)}
                onFieldChange={(field, value) => onFieldChange(dayIndex, ex.localId, field, value)}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── Sortable exercise card ───────────────────────────────────────────────────

interface SortableDraftExerciseCardProps {
  exercise: DraftExercise;
  avoidedReason: string | null;
  onRemove: () => void;
  onFieldChange: <K extends keyof DraftExercise>(field: K, value: DraftExercise[K]) => void;
}

function SortableDraftExerciseCard({
  exercise,
  avoidedReason,
  onRemove,
  onFieldChange,
}: SortableDraftExerciseCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.localId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [setsError, setSetsError] = useState<string | null>(null);
  const [repsError, setRepsError] = useState<string | null>(null);
  const [rirError, setRirError] = useState<string | null>(null);

  function handleSetsBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) {
      setSetsError("Wpisz liczbę całkowitą.");
      return;
    }
    const err = validateSets(n);
    setSetsError(err);
    if (!err) onFieldChange("sets", n);
  }

  function handleRepsMinBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) { setRepsError("Wpisz liczbę całkowitą."); return; }
    const err = validateReps(n, exercise.repsMax);
    setRepsError(err);
    if (!err) onFieldChange("repsMin", n);
  }

  function handleRepsMaxBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) { setRepsError("Wpisz liczbę całkowitą."); return; }
    const err = validateReps(exercise.repsMin, n);
    setRepsError(err);
    if (!err) onFieldChange("repsMax", n);
  }

  function handleRirBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) { setRirError("Wpisz liczbę całkowitą."); return; }
    const err = validateRir(n);
    setRirError(err);
    if (!err) onFieldChange("rir", n);
  }

  function handleRestBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) onFieldChange("restSeconds", n);
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border/50 bg-background shadow-sm">
      {/* Card header */}
      <div className="flex items-start gap-2 p-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
          tabIndex={-1}
          aria-label="Przeciągnij, aby zmienić kolejność"
        >
          <GripVertical size={16} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{exercise.exerciseName}</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {exercise.mainMuscleGroup}
            </Badge>
            {exercise.equipment.slice(0, 2).map((eq) => (
              <Badge key={eq} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                {eq}
              </Badge>
            ))}
            {exercise.isCore && (
              <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-700 border-slate-200 border">
                Core
              </Badge>
            )}
          </div>

          {/* Avoided warning */}
          {avoidedReason !== null && (
            <div className="flex items-start gap-1 mt-1 text-[11px] text-amber-700">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span>Klient wskazał, że chce unikać tego ćwiczenia.</span>
            </div>
          )}
        </div>

        <button
          onClick={onRemove}
          className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
          aria-label="Usuń ćwiczenie"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Editable fields */}
      <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {/* Sets */}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Serie</Label>
          <Input
            type="number"
            min={1}
            max={6}
            step={1}
            defaultValue={exercise.sets}
            className="h-7 text-xs"
            onBlur={(e) => handleSetsBlur(e.target.value)}
          />
        </div>

        {/* Reps min */}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Min powt.</Label>
          <Input
            type="number"
            min={1}
            step={1}
            defaultValue={exercise.repsMin}
            className="h-7 text-xs"
            onBlur={(e) => handleRepsMinBlur(e.target.value)}
          />
        </div>

        {/* Reps max */}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Max powt.</Label>
          <Input
            type="number"
            min={1}
            step={1}
            defaultValue={exercise.repsMax}
            className="h-7 text-xs"
            onBlur={(e) => handleRepsMaxBlur(e.target.value)}
          />
        </div>

        {/* RIR */}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">RIR</Label>
          <Input
            type="number"
            min={0}
            max={5}
            step={1}
            defaultValue={exercise.rir}
            className="h-7 text-xs"
            onBlur={(e) => handleRirBlur(e.target.value)}
          />
        </div>

        {/* Rest */}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Przerwa (s)</Label>
          <Input
            type="number"
            min={1}
            step={1}
            defaultValue={exercise.restSeconds}
            className="h-7 text-xs"
            onBlur={(e) => handleRestBlur(e.target.value)}
          />
        </div>
      </div>

      {/* Field validation errors */}
      {(setsError || repsError || rirError) && (
        <div className="px-3 pb-2 space-y-0.5">
          {setsError && <p className="text-[10px] text-destructive">{setsError}</p>}
          {repsError && <p className="text-[10px] text-destructive">{repsError}</p>}
          {rirError && <p className="text-[10px] text-destructive">{rirError}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Exercise selector dialog ─────────────────────────────────────────────────

interface ExerciseSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avoidedExercises: ClientAvoidedExercise[];
  onSelect: (exercise: Exercise) => void;
}

function ExerciseSelectorDialog({
  open,
  onOpenChange,
  avoidedExercises,
  onSelect,
}: ExerciseSelectorDialogProps) {
  const [search, setSearch] = useState("");
  const [filterMuscle, setFilterMuscle] = useState<string>("__all__");
  const [filterEquipment, setFilterEquipment] = useState<string>("__all__");
  const [pendingAvoided, setPendingAvoided] = useState<Exercise | null>(null);

  const queryParams = useMemo(() => ({
    isActive: true,
    ...(filterMuscle !== "__all__" ? { mainMuscleGroup: filterMuscle } : {}),
    ...(filterEquipment !== "__all__" ? { equipment: filterEquipment } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [search, filterMuscle, filterEquipment]);

  const { data: exercises = [], isLoading } = useListExercises(queryParams);

  const avoidedIds = useMemo(
    () => new Set(avoidedExercises.map((a) => a.id)),
    [avoidedExercises],
  );

  function handleRowClick(exercise: Exercise) {
    if (avoidedIds.has(exercise.id)) {
      setPendingAvoided(exercise);
    } else {
      onSelect(exercise);
    }
  }

  function handleConfirmAvoided() {
    if (pendingAvoided) {
      onSelect(pendingAvoided);
      setPendingAvoided(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj ćwiczenie</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Avoided exercise confirmation */}
          {pendingAvoided && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
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
                  className="text-xs"
                  onClick={() => setPendingAvoided(null)}
                >
                  Anuluj
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-amber-600 hover:bg-amber-700"
                  onClick={handleConfirmAvoided}
                >
                  Zastosuj mimo ostrzeżenia
                </Button>
              </div>
            </div>
          )}

          {/* Search */}
          <Input
            placeholder="Szukaj ćwiczenia…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm"
          />

          {/* Filters row */}
          <div className="grid grid-cols-2 gap-2">
            <Select value={filterMuscle} onValueChange={setFilterMuscle}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Partia mięśniowa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Wszystkie partie</SelectItem>
                {MAIN_MUSCLE_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterEquipment} onValueChange={setFilterEquipment}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Sprzęt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Cały sprzęt</SelectItem>
                {EQUIPMENT_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results */}
          <ScrollArea className="h-72 rounded-md border border-border/50">
            {isLoading ? (
              <div className="flex items-center justify-center h-full py-8">
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              </div>
            ) : exercises.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8 text-sm text-muted-foreground">
                Brak wyników
              </div>
            ) : (
              <div className="p-1">
                {exercises.map((ex) => {
                  const isAvoided = avoidedIds.has(ex.id);
                  return (
                    <button
                      key={ex.id}
                      onClick={() => handleRowClick(ex)}
                      className="w-full text-left flex items-start gap-3 px-2 py-2 rounded-md hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{ex.name}</span>
                          {isAvoided && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200 border shrink-0">
                              unikane
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground">{ex.mainMuscleGroup}</span>
                          {ex.equipment.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              · {ex.equipment.slice(0, 2).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <p className="text-[11px] text-muted-foreground">
            Pokazuje tylko aktywne ćwiczenia. Ćwiczenia oznaczone „unikane" wymagają potwierdzenia.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
