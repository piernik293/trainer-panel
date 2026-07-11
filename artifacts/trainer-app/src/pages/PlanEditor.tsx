import { useState } from "react";
import { useParams, Link } from "wouter";
import { useListExercises } from "@workspace/api-client-react";
import {
  useGetPlan,
  useUpdatePlan,
  useAddPlanDay,
  useUpdatePlanDay,
  useDeletePlanDay,
  useAddPlanExercise,
  useUpdatePlanExercise,
  useDeletePlanExercise,
  useActivatePlan,
  VOLUME_STATUS_LABEL,
  type PlanDay,
  type PlanExercise,
  type VolumeTargetResult,
  type WorkoutPlan,
} from "@/lib/planApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  WorkoutPlan["status"],
  { label: string; className: string }
> = {
  draft: { label: "Szkic", className: "bg-muted text-muted-foreground" },
  active: { label: "Aktywny", className: "bg-green-100 text-green-700 border-green-200" },
  archived: { label: "Zarchiwizowany", className: "bg-gray-100 text-gray-500" },
};

const VOLUME_STATUS_COLOR: Record<string, string> = {
  below_preferred: "bg-muted text-muted-foreground border-muted",
  within_preferred: "bg-green-100 text-green-700 border-green-200",
  above_preferred: "bg-amber-100 text-amber-700 border-amber-200",
  above_absolute: "bg-red-100 text-red-700 border-red-200",
};

// ─── ExercisePicker ───────────────────────────────────────────────────────────

function ExercisePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number, exerciseName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: exercises } = useListExercises({ isActive: true } as any);

  const filtered = (exercises ?? []).filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Wybierz ćwiczenie</DialogTitle>
        </DialogHeader>
        <div className="px-1 pb-2">
          <Input
            placeholder="Szukaj..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1 space-y-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Brak wyników</p>
          ) : (
            filtered.map((ex) => (
              <button
                key={ex.id}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                onClick={() => {
                  onSelect(ex.id, ex.name);
                  onClose();
                  setSearch("");
                }}
              >
                <span className="font-medium">{ex.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">{ex.mainMuscleGroup}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  planId,
  dayId,
}: {
  ex: PlanExercise;
  planId: number;
  dayId: number;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    workingSets: String(ex.workingSets),
    warmUpSets: String(ex.warmUpSets),
    repRangeMin: ex.repRangeMin != null ? String(ex.repRangeMin) : "",
    repRangeMax: ex.repRangeMax != null ? String(ex.repRangeMax) : "",
    rirOrRpe: ex.rirOrRpe ?? "",
    restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : "",
    notes: ex.notes ?? "",
  });

  const updateExercise = useUpdatePlanExercise(planId);
  const deleteExercise = useDeletePlanExercise(planId);

  const handleSave = () => {
    updateExercise.mutate(
      {
        dayId,
        planExerciseId: ex.id,
        workingSets: parseInt(form.workingSets) || 1,
        warmUpSets: parseInt(form.warmUpSets) || 0,
        repRangeMin: form.repRangeMin ? parseInt(form.repRangeMin) : null,
        repRangeMax: form.repRangeMax ? parseInt(form.repRangeMax) : null,
        rirOrRpe: form.rirOrRpe || null,
        restSeconds: form.restSeconds ? parseInt(form.restSeconds) : null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(`Usunąć "${ex.exerciseName}" z planu?`)) return;
    deleteExercise.mutate(
      { dayId, planExerciseId: ex.id },
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
        <p className="font-medium text-sm">{ex.exerciseName}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Serie robocze *</Label>
            <Input
              type="number"
              min={1}
              value={form.workingSets}
              onChange={(e) => setForm((f) => ({ ...f, workingSets: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Serie rozgrzewkowe</Label>
            <Input
              type="number"
              min={0}
              value={form.warmUpSets}
              onChange={(e) => setForm((f) => ({ ...f, warmUpSets: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Powtórzenia min</Label>
            <Input
              type="number"
              min={1}
              value={form.repRangeMin}
              onChange={(e) => setForm((f) => ({ ...f, repRangeMin: e.target.value }))}
              className="h-8 text-sm"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Powtórzenia max</Label>
            <Input
              type="number"
              min={1}
              value={form.repRangeMax}
              onChange={(e) => setForm((f) => ({ ...f, repRangeMax: e.target.value }))}
              className="h-8 text-sm"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RIR / RPE</Label>
            <Input
              value={form.rirOrRpe}
              onChange={(e) => setForm((f) => ({ ...f, rirOrRpe: e.target.value }))}
              className="h-8 text-sm"
              placeholder="np. RIR 2"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Przerwa (s)</Label>
            <Input
              type="number"
              min={1}
              value={form.restSeconds}
              onChange={(e) => setForm((f) => ({ ...f, restSeconds: e.target.value }))}
              className="h-8 text-sm"
              placeholder="—"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notatki trenera</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="h-8 text-sm"
              placeholder="opcjonalne"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateExercise.isPending}
          >
            <Check size={14} className="mr-1" />
            Zapisz
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X size={14} className="mr-1" />
            Anuluj
          </Button>
        </div>
      </div>
    );
  }

  const repInfo =
    ex.repRangeMin && ex.repRangeMax
      ? `${ex.repRangeMin}–${ex.repRangeMax} pow.`
      : ex.repRangeMin
      ? `${ex.repRangeMin}+ pow.`
      : "";

  return (
    <div className="flex items-center gap-2 py-2 px-1 rounded hover:bg-muted/30 transition-colors group">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{ex.exerciseName}</span>
        <span className="text-muted-foreground text-xs ml-2">
          {ex.workingSets} s. rob.
          {ex.warmUpSets > 0 ? ` + ${ex.warmUpSets} s. rozgr.` : ""}
          {repInfo ? ` × ${repInfo}` : ""}
          {ex.rirOrRpe ? ` · ${ex.rirOrRpe}` : ""}
          {ex.restSeconds ? ` · ${ex.restSeconds}s przerwa` : ""}
        </span>
        {ex.notes && (
          <p className="text-xs text-muted-foreground italic mt-0.5">{ex.notes}</p>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            setForm({
              workingSets: String(ex.workingSets),
              warmUpSets: String(ex.warmUpSets),
              repRangeMin: ex.repRangeMin != null ? String(ex.repRangeMin) : "",
              repRangeMax: ex.repRangeMax != null ? String(ex.repRangeMax) : "",
              rirOrRpe: ex.rirOrRpe ?? "",
              restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : "",
              notes: ex.notes ?? "",
            });
            setEditing(true);
          }}
        >
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

// ─── DaySection ───────────────────────────────────────────────────────────────

function DaySection({
  day,
  planId,
  onAddExercise,
}: {
  day: PlanDay;
  planId: number;
  onAddExercise: (dayId: number) => void;
}) {
  const { toast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(day.dayName ?? `Dzień ${day.dayOrder}`);

  const updateDay = useUpdatePlanDay(planId);
  const deleteDay = useDeletePlanDay(planId);

  const handleSaveName = () => {
    updateDay.mutate(
      { dayId: day.id, dayName: nameValue.trim() || `Dzień ${day.dayOrder}` },
      {
        onSuccess: () => setEditingName(false),
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleDeleteDay = () => {
    if (!window.confirm(`Usunąć "${day.dayName ?? `Dzień ${day.dayOrder}`}" wraz ze wszystkimi ćwiczeniami?`))
      return;
    deleteDay.mutate(day.id, {
      onError: (err) => toast({ title: err.message, variant: "destructive" }),
    });
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center gap-2 bg-muted/20 border-b border-border/50">
        <Dumbbell size={16} className="text-muted-foreground shrink-0" />
        {editingName ? (
          <div className="flex-1 flex gap-2 items-center">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="h-8 text-sm font-medium"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
              <Check size={14} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditingName(false)}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <>
            <CardTitle className="text-sm font-semibold flex-1">
              {day.dayName ?? `Dzień ${day.dayOrder}`}
            </CardTitle>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setNameValue(day.dayName ?? `Dzień ${day.dayOrder}`);
                setEditingName(true);
              }}
            >
              <Pencil size={13} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={handleDeleteDay}
            >
              <Trash2 size={13} />
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="pt-3 space-y-1">
        {day.exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            Brak ćwiczeń — dodaj pierwsze ćwiczenie.
          </p>
        ) : (
          day.exercises.map((ex) => (
            <ExerciseRow key={ex.id} ex={ex} planId={planId} dayId={day.id} />
          ))
        )}
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => onAddExercise(day.id)}
          >
            <Plus size={14} />
            Dodaj ćwiczenie
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── VolumeTargetCard ─────────────────────────────────────────────────────────

function VolumeTargetCard({ target }: { target: VolumeTargetResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusClass = VOLUME_STATUS_COLOR[target.status] ?? "";

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium leading-tight">{target.targetName}</span>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusClass}`}>
              {VOLUME_STATUS_LABEL[target.status]}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">
              {target.weeklyEffectiveSets.toFixed(1)}
            </span>{" "}
            eff. serii / tyg.
            {" · "}pref.{" "}
            <span>{target.weeklyPreferredCeiling}</span>
            {" · "}abs.{" "}
            <span>{target.weeklyAbsoluteCeiling}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-2">
          {target.sessionWarnings.length > 0 && (
            <div className="space-y-1">
              {target.sessionWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          {target.breakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Brak ćwiczeń trenujących tę partię.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-normal pb-1">Dzień</th>
                  <th className="text-left font-normal pb-1">Ćwiczenie</th>
                  <th className="text-right font-normal pb-1">Serie × wsp.</th>
                  <th className="text-right font-normal pb-1">Eff. s.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {target.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">
                      {b.dayName ?? `Dzień ${b.dayOrder}`}
                    </td>
                    <td className="py-0.5 pr-2">{b.exerciseName}</td>
                    <td className="py-0.5 pr-2 text-right text-muted-foreground whitespace-nowrap">
                      {b.workingSets} × {b.coefficientUsed}
                    </td>
                    <td className="py-0.5 text-right font-semibold">
                      {b.effectiveSets.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/50">
                  <td colSpan={3} className="pt-1 text-right text-muted-foreground">
                    Razem
                  </td>
                  <td className="pt-1 text-right font-bold">
                    {target.weeklyEffectiveSets.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main PlanEditor ──────────────────────────────────────────────────────────

export default function PlanEditor() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);
  const { toast } = useToast();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [pickerDayId, setPickerDayId] = useState<number | null>(null);

  const { data: plan, isLoading, error } = useGetPlan(planId);

  const updatePlan = useUpdatePlan(planId, plan?.clientId);
  const addDay = useAddPlanDay(planId, plan?.clientId);
  const addExercise = useAddPlanExercise(planId);
  const activatePlan = useActivatePlan(planId, plan?.clientId);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie planu...</div>;
  }

  if (error || !plan) {
    return <div className="p-8 text-center text-destructive">Nie znaleziono planu</div>;
  }

  const statusMeta = STATUS_BADGE[plan.status];
  const hasAbsoluteViolation = plan.volume.targets.some((t) => t.status === "above_absolute");
  const hasUnassignedExercises = plan.volume.exercisesWithoutAssignments.length > 0;
  const canActivate = plan.status === "draft" && !hasAbsoluteViolation && !hasUnassignedExercises;

  const handleSaveTitle = () => {
    updatePlan.mutate(
      { title: titleValue.trim() || plan.title },
      {
        onSuccess: () => setEditingTitle(false),
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleActivate = () => {
    if (!window.confirm("Aktywować plan? Po aktywacji nie będzie można zmieniać jego struktury."))
      return;
    activatePlan.mutate(undefined, {
      onSuccess: () => toast({ title: "Plan aktywowany!" }),
      onError: (err) => {
        const detail = (err as any)?.data;
        let msg = err.message;
        if (detail?.violations) {
          msg +=
            "\n" +
            detail.violations
              .map(
                (v: any) =>
                  `• ${v.targetName}: ${v.weeklyEffectiveSets} serii (limit: ${v.weeklyAbsoluteCeiling})`,
              )
              .join("\n");
        }
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const handleAddDay = () => {
    const nextOrder = (plan.days.length ?? 0) + 1;
    addDay.mutate(
      { dayName: `Dzień ${nextOrder}` },
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  const handleExerciseSelected = (exerciseId: number) => {
    if (!pickerDayId) return;
    addExercise.mutate(
      { dayId: pickerDayId, exerciseId, workingSets: 3 },
      {
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={`/clients/${plan.clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex gap-2 items-center">
                <Input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="text-xl font-display font-bold h-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                />
                <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
                  <Check size={16} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingTitle(false)}>
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
                  {plan.title}
                </h1>
                {plan.status === "draft" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      setTitleValue(plan.title);
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                )}
                <Badge variant="outline" className={`ml-1 ${statusMeta.className}`}>
                  {statusMeta.label}
                </Badge>
              </div>
            )}

            <p className="text-sm text-muted-foreground mt-1">
              Poziom objętości pobrany z wywiadu:{" "}
              <span className="font-medium text-foreground">{plan.experienceLevelUsed}</span>
            </p>
          </div>

          {plan.status === "draft" && (
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={handleActivate}
                disabled={!canActivate || activatePlan.isPending}
                className="gap-1"
                title={
                  hasAbsoluteViolation
                    ? "Przekroczono absolutny limit objętości"
                    : hasUnassignedExercises
                    ? "Ćwiczenia bez przypisanych mięśni"
                    : undefined
                }
              >
                {activatePlan.isPending ? "Aktywowanie..." : "Aktywuj plan"}
              </Button>
            </div>
          )}
        </div>

        {(hasAbsoluteViolation || hasUnassignedExercises) && plan.status === "draft" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
            {hasAbsoluteViolation && (
              <p className="text-sm text-destructive">
                ⛔ Aktywacja zablokowana — przekroczono absolutny limit tygodniowy dla co najmniej
                jednej grupy mięśniowej.
              </p>
            )}
            {hasUnassignedExercises && (
              <p className="text-sm text-destructive">
                ⛔ Aktywacja zablokowana — ćwiczenia bez przypisanych mięśni:{" "}
                {plan.volume.exercisesWithoutAssignments.map((e) => e.exerciseName).join(", ")}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Days */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Dumbbell size={18} className="text-primary" />
              Dni treningowe
            </h2>
            {plan.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleAddDay}
                disabled={addDay.isPending}
              >
                <Plus size={14} />
                Dodaj dzień
              </Button>
            )}
          </div>

          {plan.days.length === 0 ? (
            <Card className="border-dashed border-border/50 shadow-sm">
              <CardContent className="py-10 text-center text-muted-foreground">
                Brak dni treningowych — kliknij „Dodaj dzień" aby zacząć.
              </CardContent>
            </Card>
          ) : (
            plan.days.map((day) => (
              <DaySection
                key={day.id}
                day={day}
                planId={planId}
                onAddExercise={(id) => setPickerDayId(id)}
              />
            ))
          )}
        </div>

        {/* Right: Weekly volume */}
        <div className="space-y-4">
          <div className="xl:sticky xl:top-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <BarChart3 size={18} className="text-primary" />
              Tygodniowa objętość
            </h2>

            <div className="space-y-1.5">
              {plan.volume.targets.map((target) => (
                <VolumeTargetCard key={target.targetId} target={target} />
              ))}
            </div>

            {plan.volume.targets.length === 0 && (
              <Card className="border-dashed border-border/50 shadow-sm">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Dodaj ćwiczenia, aby zobaczyć wyliczoną objętość.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Exercise picker dialog */}
      <ExercisePicker
        open={pickerDayId !== null}
        onClose={() => setPickerDayId(null)}
        onSelect={handleExerciseSelected}
      />
    </div>
  );
}
