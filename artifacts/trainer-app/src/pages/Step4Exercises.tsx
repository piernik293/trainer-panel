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

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { pluralizeSets, computeEligibleTargetNeeds } from "@/lib/coreCoverageHelpers";
import {
  runAutoFill,
  type AutoFillSummary,
  type AutoFillVolumeSnapshot,
  type RunAutoFillDayInput,
  type TrialPreviewBody,
} from "@/lib/autoFill";
import { CheckCircle2, Sparkles, X } from "lucide-react";

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

  type AutoFillState = "idle" | "loading" | "success" | "error";
  const [autoFillState, setAutoFillState] = useState<AutoFillState>("idle");
  const [autoFillSummary, setAutoFillSummary] = useState<AutoFillSummary | null>(null);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);

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

  const handleAutoFill = useCallback(async () => {
    if (!previewResult || coverageLoading) return;
    setAutoFillState("loading");
    setAutoFillSummary(null);
    setAutoFillError(null);

    const daysToProcess: RunAutoFillDayInput[] = [];
    let skippedDayCount = 0;

    for (const day of distributionResult.days) {
      const coverageNeeds = computeEligibleTargetNeeds(day, distributionResult, previewResult, exerciseDraft);
      if (coverageNeeds.allDaysCovered) {
        skippedDayCount++;
        continue;
      }

      const existingExercises = exerciseDraft[day.dayIndex] ?? [];
      const nonZeroTargets = filterNonZeroAllocations(day.targetAllocations);
      const broadCats = nonZeroTargets
        .map((alloc) => distributionResult.targetDecisions.find((d) => d.targetId === alloc.targetId)?.broadCategory)
        .filter((c): c is string => Boolean(c));

      daysToProcess.push({
        dayIndex: day.dayIndex,
        broadCategories: broadCats,
        orderedTargets: coverageNeeds.normalNeeds.map((n) => ({
          targetId: n.targetId,
          targetName: n.targetName,
        })),
        coreEligible: coverageNeeds.coreEligible,
        existingExerciseCount: existingExercises.length,
        existingSetCount: existingExercises.reduce((sum, e) => sum + e.sets, 0),
        alreadyAddedExerciseIds: existingExercises.map((e) => e.exerciseId),
      });
    }

    if (daysToProcess.length === 0) {
      setAutoFillState("success");
      setAutoFillSummary({
        totalAdded: 0,
        daysUpdated: 0,
        daysCovered: skippedDayCount,
        resolvedTargets: [],
        unresolvedTargets: [],
        coreAddedCount: 0,
        limitWarnings: [],
      });
      return;
    }

    const avoidedIds = new Set(avoidedExercises.map((a) => a.id));

    // Convert previewResult to the minimal AutoFillVolumeSnapshot format
    const volumeSnapshot: AutoFillVolumeSnapshot = {
      weekly: previewResult.weekly.map((w) => ({
        targetId: w.targetId,
        effectiveSets: w.effectiveSets,
        weeklyPreferredCeiling: w.weeklyPreferredCeiling,
        hasGuideline: w.hasGuideline,
        isManuallyOvershot:
          w.hasGuideline &&
          (w.status === "above_preferred" || w.status === "above_absolute"),
      })),
      days: previewResult.days.map((d) => ({
        dayId: d.dayId,
        muscles: d.muscles.map((m) => ({
          targetId: m.targetId,
          effectiveSets: m.effectiveSets,
          sessionMax: m.sessionMax,
          isDailyOvershot: m.sessionStatus === "above_max",
          contributions: m.contributions.map((c) => ({
            exerciseId: c.exerciseId,
            coefficient: c.coefficient,
          })),
        })),
      })),
    };

    const result = await runAutoFill(
      {
        clientId,
        daysToProcess,
        skippedDayCount,
        avoidedExerciseIds: avoidedIds,
        allDistributionDays: distributionResult.days.map((d) => ({
          dayIndex: d.dayIndex,
          dayName: d.dayName ?? null,
        })),
        currentDraft: exerciseDraft,
        currentPreviewResult: volumeSnapshot,
      },
      async (url) => {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as { exercises: unknown[] };
        return data.exercises as Parameters<typeof runAutoFill>[1] extends (url: string) => Promise<infer T> ? T : never;
      },
      async (body: TrialPreviewBody) => {
        const resp = await fetch("/api/plans/volume-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(`Trial preview HTTP ${resp.status}`);
        // Transform DraftVolumePreviewResult → AutoFillVolumeSnapshot
        const raw = await resp.json() as {
          weekly: Array<{ targetId: number; effectiveSets: number; weeklyPreferredCeiling: number; hasGuideline: boolean; status: string }>;
          days: Array<{ dayId: number; muscles: Array<{ targetId: number; effectiveSets: number; sessionMax: number; sessionStatus: string; contributions: Array<{ exerciseId: number; coefficient: number }> }> }>;
        };
        return {
          weekly: raw.weekly.map((w) => ({
            targetId: w.targetId,
            effectiveSets: w.effectiveSets,
            weeklyPreferredCeiling: w.weeklyPreferredCeiling,
            hasGuideline: w.hasGuideline,
            isManuallyOvershot:
              w.hasGuideline &&
              (w.status === "above_preferred" || w.status === "above_absolute"),
          })),
          days: raw.days.map((d) => ({
            dayId: d.dayId,
            muscles: d.muscles.map((m) => ({
              targetId: m.targetId,
              effectiveSets: m.effectiveSets,
              sessionMax: m.sessionMax,
              isDailyOvershot: m.sessionStatus === "above_max",
              contributions: m.contributions,
            })),
          })),
        } satisfies AutoFillVolumeSnapshot;
      },
    );

    if (!result.ok) {
      setAutoFillState("error");
      setAutoFillError(result.error);
      return;
    }

    // Atomic draft application — only runs after ALL requests succeed
    let newDraft = { ...exerciseDraft };
    for (const dayResult of result.dayResults) {
      for (const toAdd of dayResult.toAdd) {
        newDraft = addExerciseToDay(newDraft, dayResult.dayIndex, {
          exerciseId: toAdd.exerciseId,
          exerciseName: toAdd.exerciseName,
          mainMuscleGroup: toAdd.mainMuscleGroup,
          equipment: toAdd.equipment,
          isCore: toAdd.isCore,
          sets: toAdd.sets,
          repsMin: DRAFT_EXERCISE_DEFAULTS.repsMin,
          repsMax: DRAFT_EXERCISE_DEFAULTS.repsMax,
          rir: DRAFT_EXERCISE_DEFAULTS.rir,
          restSeconds: DRAFT_EXERCISE_DEFAULTS.restSeconds,
        });
      }
    }

    onDraftChange(newDraft);
    setAutoFillState("success");
    setAutoFillSummary(result.summary);
  }, [distributionResult, exerciseDraft, previewResult, coverageLoading, clientId, avoidedExercises, onDraftChange]);

  const hasAnyExercise = Object.values(exerciseDraft).some((day) => day.length > 0);

  return (
    <div className="space-y-4">
      {/* Helper note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          To wartość analityczna. Rzeczywiste serie robocze wynikają z dobranych ćwiczeń.
        </span>
      </div>

      {/* Auto-fill button */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={handleAutoFill}
          disabled={autoFillState === "loading" || !previewResult || coverageLoading}
        >
          {autoFillState === "loading" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {autoFillState === "loading"
            ? "Przygotowuję propozycję…"
            : hasAnyExercise
            ? "Uzupełnij brakujące ćwiczenia"
            : "Ułóż wstępną propozycję całego planu"}
        </Button>
        {(autoFillState === "success" || autoFillState === "error") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => {
              setAutoFillState("idle");
              setAutoFillSummary(null);
              setAutoFillError(null);
            }}
          >
            <X size={14} />
          </Button>
        )}
      </div>

      {/* Auto-fill error */}
      {autoFillState === "error" && autoFillError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{autoFillError}</span>
        </div>
      )}

      {/* Auto-fill success summary */}
      {autoFillState === "success" && autoFillSummary && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">
              Wstępna propozycja planu została przygotowana
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-emerald-700">
            <span>Dodano ćwiczeń: <span className="font-medium text-emerald-900">{autoFillSummary.totalAdded}</span></span>
            <span>Dni zaktualizowanych: <span className="font-medium text-emerald-900">{autoFillSummary.daysUpdated}</span></span>
            {autoFillSummary.daysCovered > 0 && (
              <span>Dni już pokrytych: <span className="font-medium text-emerald-900">{autoFillSummary.daysCovered}</span></span>
            )}
            {autoFillSummary.coreAddedCount > 0 && (
              <span>Core / brzuch dodano: <span className="font-medium text-emerald-900">{autoFillSummary.coreAddedCount}×</span></span>
            )}
            {autoFillSummary.resolvedTargets.length > 0 && (
              <span className="col-span-2">
                Pokryte cele: <span className="font-medium text-emerald-900">{autoFillSummary.resolvedTargets.map((t) => t.targetName).join(", ")}</span>
              </span>
            )}
            {autoFillSummary.unresolvedTargets.length > 0 && (
              <span className="col-span-2 text-amber-700">
                Nierozwiązane cele: <span className="font-medium">{autoFillSummary.unresolvedTargets.map((t) => t.targetName).join(", ")}</span>
              </span>
            )}
          </div>
          {autoFillSummary.limitWarnings.length > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-emerald-200">
              {autoFillSummary.limitWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1 text-[11px] text-amber-700">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-emerald-600 pt-0.5">
            To wstępna propozycja — możesz edytować wszystkie ćwiczenia.
          </p>
        </div>
      )}

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

        // Phase 4B3: compute uncovered targets for this day (null when coverage not yet loaded)
        const coverageNeeds =
          previewResult !== null
            ? computeEligibleTargetNeeds(day, distributionResult, previewResult, exerciseDraft)
            : null;

        return (
          <Card key={day.dayIndex} className="border-border/50 shadow-sm">
            <CardContent className="p-4 space-y-3">
              {/* Day header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    Dzień {day.dayIndex + 1} — {day.dayName}
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
                    <div className="text-xs text-muted-foreground italic">
                      Core / brzuch{" "}—{" "}<span className="not-italic">{pluralizeSets(coreAlloc.sets)}</span>
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
                    eligibleNeeds={coverageNeeds?.normalNeeds ?? null}
                    coreEligible={coverageNeeds?.coreEligible ?? false}
                    coreDailyPlanned={coverageNeeds?.coreDailyPlanned ?? 0}
                    coreDailyActual={coverageNeeds?.coreDailyActual ?? 0}
                    coverageLoading={coverageLoading}
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

  // Controlled display value for the sets input.
  // Allows the user to type freely (e.g. "10" as two keystrokes) while the
  // draft is only updated on blur. Syncs back to the authoritative draft
  // value whenever exercise.sets changes from an external source (e.g. auto-fill).
  const [setsDisplayValue, setSetsDisplayValue] = useState(String(exercise.sets));
  useEffect(() => {
    setSetsDisplayValue(String(exercise.sets));
  }, [exercise.sets]);

  // Immediately commit valid set counts to the draft so Core coverage and the
  // normal-target coverage key both update without requiring a blur.
  function handleSetsChange(raw: string) {
    setSetsDisplayValue(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n)) {
      const err = validateSets(n);
      setSetsError(err);
      if (!err) {
        onFieldChange("sets", n); // live draft update → coverage refreshes immediately
      }
    }
  }

  // On blur: revert the display to the authoritative draft value if the field
  // holds an incomplete or out-of-range entry.  The draft itself is already up
  // to date via handleSetsChange, so we never call onFieldChange here.
  function handleSetsBlur(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || validateSets(n)) {
      setSetsError(validateSets(n) ?? "Wpisz liczbę całkowitą.");
      setSetsDisplayValue(String(exercise.sets)); // revert display to draft value
    }
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
            value={setsDisplayValue}
            onChange={(e) => handleSetsChange(e.target.value)}
            onBlur={(e) => handleSetsBlur(e.target.value)}
            className="h-7 text-xs"
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
