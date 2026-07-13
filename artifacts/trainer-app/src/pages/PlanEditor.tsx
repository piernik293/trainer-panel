import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useListExercises,
  useListExerciseRecommendations,
  getListExerciseRecommendationsQueryKey,
} from "@workspace/api-client-react";
import {
  useGetPlan,
  useUpdatePlan,
  useAddPlanDay,
  useUpdatePlanDay,
  useDeletePlanDay,
  useDuplicatePlanDay,
  useReorderPlanDays,
  useAddPlanExercise,
  useUpdatePlanExercise,
  useDeletePlanExercise,
  useDuplicatePlanExercise,
  useReorderPlanExercises,
  useActivatePlan,
  useVolumePreview,
  useAnalysisPreview,
  VOLUME_STATUS_LABEL,
  type PlanDay,
  type PlanExercise,
  type VolumeTargetResult,
  type VolumePreviewResult,
  type WorkoutPlan,
} from "@/lib/planApi";
import { VolumePanel } from "@/components/VolumePanel";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Sparkles,
  AlertCircle,
  GripVertical,
  ChevronUp,
  Copy,
  ArrowRight,
  Info,
  Clock,
  CalendarDays,
  Save,
  Archive,
  LayoutList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<WorkoutPlan["status"], { label: string; className: string }> = {
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

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatRep(ex: PlanExercise): string {
  const t = ex.repType;
  if (t === "exact" && ex.repsExact) return `${ex.repsExact} pow.`;
  if (t === "range" || (!t && (ex.repRangeMin || ex.repRangeMax))) {
    if (ex.repRangeMin && ex.repRangeMax) return `${ex.repRangeMin}–${ex.repRangeMax} pow.`;
    if (ex.repRangeMin) return `${ex.repRangeMin}+ pow.`;
  }
  if (t === "time" && ex.repTimeSeconds) return `${ex.repTimeSeconds}s`;
  if (t === "distance" && ex.repDistanceMeters) return `${ex.repDistanceMeters}m`;
  if (t === "open") return ex.repOpenInstruction || "AMRAP";
  return "";
}

function formatLoad(ex: PlanExercise): string {
  const t = ex.loadType;
  if (!t) return "";
  if (t === "bodyweight") return "Ciężar ciała";
  if (t === "assisted") return "Wspomagane";
  if (t === "fixed") return ex.loadValue ? `${ex.loadValue} kg` : "Stały ciężar";
  if (t === "percent_1rm") return ex.loadValue ? `${ex.loadValue}% 1RM` : "% 1RM";
  if (t === "bw_plus") return ex.loadValue ? `BW+${ex.loadValue}kg` : "BW+ciężar";
  if (t === "custom") return ex.loadInstruction || "Niestandardowe";
  return "";
}

function formatIntensity(ex: PlanExercise): string {
  const parts: string[] = [];
  if (ex.rir != null) parts.push(`RIR ${ex.rir}`);
  if (ex.rpe) parts.push(`RPE ${ex.rpe}`);
  if (!parts.length && ex.rirOrRpe) parts.push(ex.rirOrRpe);
  return parts.join(" / ");
}

function formatRest(sec: number): string {
  if (sec >= 120) return `${Math.round(sec / 60)} min`;
  return `${sec}s`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pl-PL");
  } catch {
    return iso;
  }
}

// ─── ScoreChip ────────────────────────────────────────────────────────────────

function ScoreChip({ score }: { score: number }) {
  const cls =
    score >= 75
      ? "text-emerald-700 bg-emerald-500/10"
      : score >= 45
      ? "text-amber-700 bg-amber-500/10"
      : "text-muted-foreground bg-muted/50";
  return (
    <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 tabular-nums ${cls}`}>
      {score}
    </span>
  );
}

// ─── ExercisePicker ───────────────────────────────────────────────────────────

function ExercisePicker({
  open,
  onClose,
  onSelect,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number, exerciseName: string) => void;
  clientId?: number | null;
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "recommended">("all");

  const { data: allExercises } = useListExercises({ isActive: true } as any);
  const { data: recommendations } = useListExerciseRecommendations(
    clientId ?? 0,
    {},
    {
      query: {
        enabled: !!clientId && tab === "recommended",
        queryKey: getListExerciseRecommendationsQueryKey(clientId ?? 0, {}),
      },
    },
  );

  const showTabs = !!clientId;
  const filtered = (allExercises ?? []).filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (id: number, name: string) => {
    onSelect(id, name);
    onClose();
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Wybierz ćwiczenie</DialogTitle>
        </DialogHeader>

        {showTabs && (
          <div className="flex gap-1 px-1 pb-1 border-b border-border/50">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                tab === "all" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Wszystkie
            </button>
            <button
              type="button"
              onClick={() => setTab("recommended")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                tab === "recommended" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles size={13} />
              Rekomendowane
            </button>
          </div>
        )}

        {tab === "all" && (
          <div className="px-1 pb-2">
            <Input
              placeholder="Szukaj..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="overflow-y-auto flex-1 space-y-0.5 px-1">
          {tab === "all" ? (
            filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Brak wyników</p>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                  onClick={() => handleSelect(ex.id, ex.name)}
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{ex.mainMuscleGroup}</span>
                </button>
              ))
            )
          ) : !recommendations ? (
            <div className="py-8 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-muted/30 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !recommendations.hasProfile ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Brak wywiadu treningowego klienta.</p>
              <p className="text-xs mt-1">Wypełnij wywiad, aby zobaczyć rekomendacje.</p>
            </div>
          ) : recommendations.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Brak kompletnych ćwiczeń dopasowanych do profilu klienta.
            </p>
          ) : (
            recommendations.exercises.map((ex) => (
              <button
                key={ex.id}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                onClick={() => handleSelect(ex.id, ex.name)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{ex.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{ex.mainMuscleGroup}</span>
                  </div>
                  <ScoreChip score={ex.score} />
                </div>
                {ex.warnReasons.length > 0 && (
                  <div className="flex items-center gap-1 mt-0.5 text-red-500">
                    <AlertCircle size={11} />
                    <span className="text-xs">{ex.warnReasons[0]}</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExerciseEditForm ─────────────────────────────────────────────────────────

function ExerciseEditForm({
  ex,
  planId,
  dayId,
  onCancel,
  onSaved,
}: {
  ex: PlanExercise;
  planId: number;
  dayId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const updateExercise = useUpdatePlanExercise(planId);

  const [form, setForm] = useState({
    workingSets: String(ex.workingSets),
    warmUpSets: String(ex.warmUpSets),
    repType: ex.repType ?? "",
    repsExact: ex.repsExact != null ? String(ex.repsExact) : "",
    repRangeMin: ex.repRangeMin != null ? String(ex.repRangeMin) : "",
    repRangeMax: ex.repRangeMax != null ? String(ex.repRangeMax) : "",
    repTimeSeconds: ex.repTimeSeconds != null ? String(ex.repTimeSeconds) : "",
    repDistanceMeters: ex.repDistanceMeters != null ? String(ex.repDistanceMeters) : "",
    repOpenInstruction: ex.repOpenInstruction ?? "",
    loadType: ex.loadType ?? "",
    loadValue: ex.loadValue ?? "",
    loadInstruction: ex.loadInstruction ?? "",
    rir: ex.rir != null ? String(ex.rir) : "",
    rpe: ex.rpe ?? "",
    tempo: ex.tempo ?? "",
    restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : "",
    notes: ex.notes ?? "",
    clientInstructions: ex.clientInstructions ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    const repType = (form.repType || null) as PlanExercise["repType"];
    updateExercise.mutate(
      {
        dayId,
        planExerciseId: ex.id,
        workingSets: parseInt(form.workingSets) || 1,
        warmUpSets: parseInt(form.warmUpSets) || 0,
        repType,
        repsExact: repType === "exact" ? (parseInt(form.repsExact) || null) : null,
        repRangeMin:
          repType === "range" || !repType ? (parseInt(form.repRangeMin) || null) : null,
        repRangeMax:
          repType === "range" || !repType ? (parseInt(form.repRangeMax) || null) : null,
        repTimeSeconds: repType === "time" ? (parseInt(form.repTimeSeconds) || null) : null,
        repDistanceMeters:
          repType === "distance" ? (parseInt(form.repDistanceMeters) || null) : null,
        repOpenInstruction: repType === "open" ? (form.repOpenInstruction || null) : null,
        loadType: form.loadType || null,
        loadValue: form.loadValue || null,
        loadInstruction: form.loadInstruction || null,
        rir: form.rir !== "" ? parseInt(form.rir) : null,
        rpe: form.rpe || null,
        tempo: form.tempo || null,
        restSeconds: form.restSeconds ? parseInt(form.restSeconds) : null,
        notes: form.notes || null,
        clientInstructions: form.clientInstructions || null,
      },
      {
        onSuccess: onSaved,
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const needsLoadValue = ["fixed", "percent_1rm", "bw_plus"].includes(form.loadType);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
      <p className="font-medium text-sm">{ex.exerciseName}</p>

      {/* Sets */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Serie robocze *</Label>
          <Input type="number" min={1} value={form.workingSets} onChange={set("workingSets")} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Serie rozgrzewkowe</Label>
          <Input type="number" min={0} value={form.warmUpSets} onChange={set("warmUpSets")} className="h-8 text-sm" />
        </div>
      </div>

      {/* Rep prescription */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Powtórzenia</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Typ</Label>
            <Select value={form.repType} onValueChange={(v) => setForm((f) => ({ ...f, repType: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— brak —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— brak —</SelectItem>
                <SelectItem value="exact">Dokładnie</SelectItem>
                <SelectItem value="range">Zakres</SelectItem>
                <SelectItem value="time">Czas (s)</SelectItem>
                <SelectItem value="distance">Dystans (m)</SelectItem>
                <SelectItem value="open">Otwarta (AMRAP)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.repType === "exact" && (
            <div className="space-y-1">
              <Label className="text-xs">Liczba powtórzeń</Label>
              <Input type="number" min={1} value={form.repsExact} onChange={set("repsExact")} className="h-8 text-sm" placeholder="np. 10" />
            </div>
          )}
          {(form.repType === "range" || !form.repType) && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Pow. min</Label>
                <Input type="number" min={1} value={form.repRangeMin} onChange={set("repRangeMin")} className="h-8 text-sm" placeholder="—" />
              </div>
              {(form.repType === "range" || !form.repType) && (
                <div className="space-y-1">
                  <Label className="text-xs">Pow. max</Label>
                  <Input type="number" min={1} value={form.repRangeMax} onChange={set("repRangeMax")} className="h-8 text-sm" placeholder="—" />
                </div>
              )}
            </>
          )}
          {form.repType === "time" && (
            <div className="space-y-1">
              <Label className="text-xs">Czas (sek.)</Label>
              <Input type="number" min={1} value={form.repTimeSeconds} onChange={set("repTimeSeconds")} className="h-8 text-sm" placeholder="np. 30" />
            </div>
          )}
          {form.repType === "distance" && (
            <div className="space-y-1">
              <Label className="text-xs">Dystans (m)</Label>
              <Input type="number" min={1} value={form.repDistanceMeters} onChange={set("repDistanceMeters")} className="h-8 text-sm" placeholder="np. 20" />
            </div>
          )}
          {form.repType === "open" && (
            <div className="space-y-1">
              <Label className="text-xs">Instrukcja</Label>
              <Input value={form.repOpenInstruction} onChange={set("repOpenInstruction")} className="h-8 text-sm" placeholder="np. AMRAP" />
            </div>
          )}
        </div>
      </div>

      {/* Load + Intensity */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Obciążenie i intensywność</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Typ obciążenia</Label>
            <Select value={form.loadType} onValueChange={(v) => setForm((f) => ({ ...f, loadType: v, loadValue: "", loadInstruction: "" }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— brak —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— brak —</SelectItem>
                <SelectItem value="bodyweight">Ciężar ciała</SelectItem>
                <SelectItem value="assisted">Wspomagane</SelectItem>
                <SelectItem value="fixed">Stały ciężar (kg)</SelectItem>
                <SelectItem value="percent_1rm">% 1RM</SelectItem>
                <SelectItem value="bw_plus">BW + obciążenie (kg)</SelectItem>
                <SelectItem value="custom">Własna instrukcja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsLoadValue && (
            <div className="space-y-1">
              <Label className="text-xs">
                {form.loadType === "percent_1rm" ? "Procent (%)" : "Ciężar (kg)"}
              </Label>
              <Input type="number" min={0} value={form.loadValue} onChange={set("loadValue")} className="h-8 text-sm" placeholder="0" />
            </div>
          )}
          {form.loadType === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">Instrukcja</Label>
              <Input value={form.loadInstruction} onChange={set("loadInstruction")} className="h-8 text-sm" placeholder="np. taśma oporu" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">RIR (0–5)</Label>
            <Select value={form.rir} onValueChange={(v) => setForm((f) => ({ ...f, rir: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— brak —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— brak —</SelectItem>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>RIR {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RPE (1–10)</Label>
            <Select value={form.rpe} onValueChange={(v) => setForm((f) => ({ ...f, rpe: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— brak —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— brak —</SelectItem>
                {["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"].map((n) => (
                  <SelectItem key={n} value={n}>RPE {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Technique + Rest */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">
            Tempo <span className="text-muted-foreground font-normal">(eks–pauza–kon–pauza)</span>
          </Label>
          <Input value={form.tempo} onChange={set("tempo")} className="h-8 text-sm" placeholder="np. 3-1-1-0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Przerwa (sek.)</Label>
          <Input type="number" min={1} value={form.restSeconds} onChange={set("restSeconds")} className="h-8 text-sm" placeholder="np. 90" />
        </div>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Notatki trenera (prywatne)</Label>
          <Input value={form.notes} onChange={set("notes")} className="h-8 text-sm" placeholder="opcjonalne" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instrukcja dla klienta</Label>
          <Input value={form.clientInstructions} onChange={set("clientInstructions")} className="h-8 text-sm" placeholder="opcjonalne" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={updateExercise.isPending}>
          <Check size={14} className="mr-1" />
          {updateExercise.isPending ? "Zapisywanie..." : "Zapisz"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X size={14} className="mr-1" />
          Anuluj
        </Button>
      </div>
    </div>
  );
}

// ─── MoveExerciseDialog ───────────────────────────────────────────────────────

function MoveExerciseDialog({
  open,
  onClose,
  days,
  currentDayId,
  planExerciseId,
  planId,
}: {
  open: boolean;
  onClose: () => void;
  days: PlanDay[];
  currentDayId: number;
  planExerciseId: number;
  planId: number;
}) {
  const [targetDayId, setTargetDayId] = useState("");
  const updateExercise = useUpdatePlanExercise(planId);
  const { toast } = useToast();

  const otherDays = days.filter((d) => d.id !== currentDayId);

  const handleMove = () => {
    if (!targetDayId) return;
    const targetDay = days.find((d) => d.id === Number(targetDayId));
    const newOrder = Math.max(0, ...(targetDay?.exercises.map((e) => e.orderInDay) ?? [0])) + 1;
    updateExercise.mutate(
      { dayId: currentDayId, planExerciseId, dayId_target: Number(targetDayId), orderInDay: newOrder },
      {
        onSuccess: () => { onClose(); setTargetDayId(""); },
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Przenieś ćwiczenie do innego dnia</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {otherDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak innych dni w tym planie.</p>
          ) : (
            <Select value={targetDayId} onValueChange={setTargetDayId}>
              <SelectTrigger><SelectValue placeholder="Wybierz dzień docelowy" /></SelectTrigger>
              <SelectContent>
                {otherDays.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.dayName ?? `Dzień ${d.dayOrder}`}
                    {d.subtitle ? ` — ${d.subtitle}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleMove} disabled={!targetDayId || updateExercise.isPending || otherDays.length === 0}>
            <ArrowRight size={14} className="mr-1" />
            {updateExercise.isPending ? "Przenoszenie..." : "Przenieś"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  planId,
  dayId,
  allDays,
  index,
  total,
  onMoveUp,
  onMoveDown,
  volumeImpact,
  dragHandleListeners,
  dragHandleAttributes,
}: {
  ex: PlanExercise;
  planId: number;
  dayId: number;
  allDays: PlanDay[];
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  volumeImpact?: Array<{ muscleName: string; effectiveSets: number }>;
  dragHandleListeners?: Record<string, unknown>;
  dragHandleAttributes?: Record<string, unknown>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  const deleteExercise = useDeletePlanExercise(planId);
  const duplicateExercise = useDuplicatePlanExercise(planId);

  const handleDelete = () => {
    if (!window.confirm(`Usunąć "${ex.exerciseName}" z planu?`)) return;
    deleteExercise.mutate(
      { dayId, planExerciseId: ex.id },
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  const handleDuplicate = () => {
    duplicateExercise.mutate(
      { dayId, planExerciseId: ex.id },
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  const [showImpact, setShowImpact] = useState(false);
  const hasImpact = volumeImpact && volumeImpact.length > 0;

  if (editing) {
    return (
      <ExerciseEditForm
        ex={ex}
        planId={planId}
        dayId={dayId}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  const repInfo = formatRep(ex);
  const loadInfo = formatLoad(ex);
  const intensityInfo = formatIntensity(ex);
  const summaryParts = [
    `${ex.workingSets} s. rob.${ex.warmUpSets > 0 ? ` + ${ex.warmUpSets} rozgr.` : ""}`,
    repInfo,
    loadInfo,
    intensityInfo,
    ex.tempo ? `Tempo ${ex.tempo}` : "",
    ex.restSeconds ? `Przerwa ${formatRest(ex.restSeconds)}` : "",
  ].filter(Boolean);

  return (
    <>
      <div className="py-2 px-1 rounded hover:bg-muted/30 transition-colors group">
        <div className="flex items-start gap-1.5">
          {/* Drag handle */}
          <button
            className="mt-0.5 p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
            aria-label="Przeciągnij aby zmienić kolejność"
            {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical size={14} />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm">{ex.exerciseName}</span>
            <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
              {summaryParts.join(" · ")}
            </p>
            {ex.notes && (
              <p className="text-xs text-muted-foreground italic mt-0.5">🔒 {ex.notes}</p>
            )}
            {ex.clientInstructions && (
              <p className="text-xs text-blue-600/70 mt-0.5">👤 {ex.clientInstructions}</p>
            )}
            {/* Volume impact toggle */}
            {volumeImpact !== undefined && (
              <button
                onClick={() => setShowImpact((v) => !v)}
                className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showImpact ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span>Wpływ na objętość</span>
                {hasImpact && !showImpact && (
                  <span className="text-muted-foreground/60">
                    ({volumeImpact.map((m) => `${m.muscleName.split(" ").slice(-1)[0]}: ${m.effectiveSets.toFixed(1)}`).join(", ")})
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveUp} disabled={index === 0} title="Przesuń wyżej">
              <ChevronUp size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveDown} disabled={index === total - 1} title="Przesuń niżej">
              <ChevronDown size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)} title="Edytuj">
              <Pencil size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDuplicate} disabled={duplicateExercise.isPending} title="Duplikuj">
              <Copy size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMoving(true)} title="Przenieś do innego dnia">
              <ArrowRight size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={handleDelete} title="Usuń">
              <Trash2 size={12} />
            </Button>
          </div>
        </div>

        {/* Expanded volume impact */}
        {showImpact && volumeImpact !== undefined && (
          <div className="ml-5 mt-1.5 pl-2 border-l-2 border-primary/20 space-y-0.5">
            {hasImpact ? (
              volumeImpact.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{m.muscleName}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {m.effectiveSets.toFixed(2)} eff.
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Brak przypisanych partii mięśniowych.
              </p>
            )}
          </div>
        )}
      </div>

      <MoveExerciseDialog
        open={moving}
        onClose={() => setMoving(false)}
        days={allDays}
        currentDayId={dayId}
        planExerciseId={ex.id}
        planId={planId}
      />
    </>
  );
}

// ─── SortableExerciseRow ──────────────────────────────────────────────────────

function SortableExerciseRow(
  props: Omit<React.ComponentProps<typeof ExerciseRow>, "dragHandleListeners" | "dragHandleAttributes">,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.ex.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
    >
      <ExerciseRow
        {...props}
        dragHandleListeners={listeners as unknown as Record<string, unknown>}
        dragHandleAttributes={attributes as unknown as Record<string, unknown>}
      />
    </div>
  );
}

// ─── DaySection ───────────────────────────────────────────────────────────────

function DaySection({
  day,
  planId,
  allDays,
  onAddExercise,
  dayIndex,
  daysTotal,
  onMoveUp,
  onMoveDown,
  preview,
  dragHandleListeners,
  dragHandleAttributes,
}: {
  day: PlanDay;
  planId: number;
  allDays: PlanDay[];
  onAddExercise: (dayId: number) => void;
  dayIndex: number;
  daysTotal: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  preview?: VolumePreviewResult;
  dragHandleListeners?: Record<string, unknown>;
  dragHandleAttributes?: Record<string, unknown>;
}) {
  const { toast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(day.dayName ?? `Dzień ${day.dayOrder}`);
  const [showDetails, setShowDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({
    subtitle: day.subtitle ?? "",
    description: day.description ?? "",
    estimatedDurationMinutes: day.estimatedDurationMinutes != null ? String(day.estimatedDurationMinutes) : "",
    trainerNotes: day.trainerNotes ?? "",
  });

  const updateDay = useUpdatePlanDay(planId);
  const deleteDay = useDeletePlanDay(planId);
  const duplicateDay = useDuplicatePlanDay(planId);
  const reorderExercises = useReorderPlanExercises(planId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSaveName = () => {
    updateDay.mutate(
      { dayId: day.id, dayName: nameValue.trim() || `Dzień ${day.dayOrder}` },
      {
        onSuccess: () => setEditingName(false),
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleSaveDetails = () => {
    updateDay.mutate(
      {
        dayId: day.id,
        subtitle: detailForm.subtitle || null,
        description: detailForm.description || null,
        estimatedDurationMinutes: detailForm.estimatedDurationMinutes
          ? parseInt(detailForm.estimatedDurationMinutes)
          : null,
        trainerNotes: detailForm.trainerNotes || null,
      },
      {
        onSuccess: () => { setShowDetails(false); toast({ title: "Szczegóły dnia zapisane" }); },
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleDeleteDay = () => {
    if (!window.confirm(`Usunąć "${day.dayName ?? `Dzień ${day.dayOrder}`}" wraz ze wszystkimi ćwiczeniami?`)) return;
    deleteDay.mutate(day.id, {
      onError: (err) => toast({ title: err.message, variant: "destructive" }),
    });
  };

  const handleDuplicateDay = () => {
    duplicateDay.mutate(day.id, {
      onError: (err) => toast({ title: err.message, variant: "destructive" }),
    });
  };

  const handleExerciseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = day.exercises.findIndex((e) => e.id === active.id);
    const newIndex = day.exercises.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(day.exercises, oldIndex, newIndex);
    reorderExercises.mutate({
      dayId: day.id,
      order: reordered.map((ex, i) => ({ id: ex.id, orderInDay: i + 1 })),
    }, {
      onError: (err) => toast({ title: err.message, variant: "destructive" }),
    });
  };

  const handleExerciseMoveUp = (idx: number) => {
    if (idx === 0) return;
    const reordered = [...day.exercises];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    reorderExercises.mutate({
      dayId: day.id,
      order: reordered.map((ex, i) => ({ id: ex.id, orderInDay: i + 1 })),
    });
  };

  const handleExerciseMoveDown = (idx: number) => {
    if (idx === day.exercises.length - 1) return;
    const reordered = [...day.exercises];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    reorderExercises.mutate({
      dayId: day.id,
      order: reordered.map((ex, i) => ({ id: ex.id, orderInDay: i + 1 })),
    });
  };

  return (
    <Card className="border-border/50 shadow-sm">
      {/* Day header */}
      <CardHeader className="pb-3 flex flex-row items-start gap-2 bg-muted/20 border-b border-border/50">
        {/* Drag handle for day */}
        <button
          className="mt-1 p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
          aria-label="Przeciągnij aby zmienić kolejność dnia"
          {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
          {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
        >
          <GripVertical size={15} />
        </button>

        <Dumbbell size={16} className="text-muted-foreground shrink-0 mt-0.5" />

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
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName} disabled={updateDay.isPending}>
              <Check size={14} />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}>
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CardTitle className="text-sm font-semibold">
                {day.dayName ?? `Dzień ${day.dayOrder}`}
              </CardTitle>
              {day.subtitle && (
                <span className="text-xs text-muted-foreground">— {day.subtitle}</span>
              )}
              {day.estimatedDurationMinutes && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <Clock size={11} />
                  {day.estimatedDurationMinutes} min
                </span>
              )}
            </div>
          </div>
        )}

        {!editingName && (
          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={dayIndex === 0} title="Dzień wyżej">
              <ChevronUp size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={dayIndex === daysTotal - 1} title="Dzień niżej">
              <ChevronDown size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setNameValue(day.dayName ?? `Dzień ${day.dayOrder}`); setEditingName(true); }} title="Zmień nazwę">
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDetailForm({ subtitle: day.subtitle ?? "", description: day.description ?? "", estimatedDurationMinutes: day.estimatedDurationMinutes != null ? String(day.estimatedDurationMinutes) : "", trainerNotes: day.trainerNotes ?? "" }); setShowDetails((v) => !v); }} title="Szczegóły dnia">
              <Info size={13} className={showDetails ? "text-primary" : ""} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDuplicateDay} disabled={duplicateDay.isPending} title="Duplikuj dzień">
              <Copy size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleDeleteDay} title="Usuń dzień">
              <Trash2 size={13} />
            </Button>
          </div>
        )}
      </CardHeader>

      {/* Day details edit form */}
      {showDetails && (
        <div className="px-4 py-3 border-b border-border/40 bg-blue-50/30 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Podtytuł dnia</Label>
              <Input value={detailForm.subtitle} onChange={(e) => setDetailForm((f) => ({ ...f, subtitle: e.target.value }))} className="h-8 text-sm" placeholder="np. Góra ciała" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Szacowany czas (min)</Label>
              <Input type="number" min={1} value={detailForm.estimatedDurationMinutes} onChange={(e) => setDetailForm((f) => ({ ...f, estimatedDurationMinutes: e.target.value }))} className="h-8 text-sm" placeholder="np. 60" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Opis dnia</Label>
            <Textarea value={detailForm.description} onChange={(e) => setDetailForm((f) => ({ ...f, description: e.target.value }))} className="text-sm min-h-[60px]" placeholder="opcjonalny opis sesji..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notatki trenera (prywatne)</Label>
            <Textarea value={detailForm.trainerNotes} onChange={(e) => setDetailForm((f) => ({ ...f, trainerNotes: e.target.value }))} className="text-sm min-h-[50px]" placeholder="opcjonalne" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveDetails} disabled={updateDay.isPending}>
              <Check size={13} className="mr-1" />
              Zapisz szczegóły
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowDetails(false)}>Anuluj</Button>
          </div>
        </div>
      )}

      {/* Exercise list */}
      <CardContent className="pt-3 space-y-0.5">
        {day.exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            Brak ćwiczeń — dodaj pierwsze ćwiczenie.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
            <SortableContext items={day.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {day.exercises.map((ex, idx) => {
                  // Build per-exercise volume impact from preview data.
                  const volumeImpact: Array<{ muscleName: string; effectiveSets: number }> | undefined =
                    preview
                      ? (() => {
                          const impact: Array<{ muscleName: string; effectiveSets: number }> = [];
                          const previewDay = preview.days.find((d) => d.dayId === day.id);
                          if (previewDay) {
                            for (const m of previewDay.muscles) {
                              for (const c of m.contributions) {
                                if (c.exerciseEntryId === ex.id) {
                                  impact.push({ muscleName: m.muscleName, effectiveSets: c.effectiveSets });
                                }
                              }
                            }
                          }
                          return impact;
                        })()
                      : undefined;

                  return (
                    <SortableExerciseRow
                      key={ex.id}
                      ex={ex}
                      planId={planId}
                      dayId={day.id}
                      allDays={allDays}
                      index={idx}
                      total={day.exercises.length}
                      onMoveUp={() => handleExerciseMoveUp(idx)}
                      onMoveDown={() => handleExerciseMoveDown(idx)}
                      volumeImpact={volumeImpact}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="pt-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => onAddExercise(day.id)}>
            <Plus size={14} />
            Dodaj ćwiczenie
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SortableDaySection ───────────────────────────────────────────────────────

function SortableDaySection(
  props: Omit<React.ComponentProps<typeof DaySection>, "dragHandleListeners" | "dragHandleAttributes">,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.day.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
    >
      <DaySection
        {...props}
        dragHandleListeners={listeners as unknown as Record<string, unknown>}
        dragHandleAttributes={attributes as unknown as Record<string, unknown>}
      />
    </div>
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
            eff. serii / tyg.{" · "}pref.{" "}
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
                <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
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
                    <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">{b.dayName ?? `Dzień ${b.dayOrder}`}</td>
                    <td className="py-0.5 pr-2">{b.exerciseName}</td>
                    <td className="py-0.5 pr-2 text-right text-muted-foreground whitespace-nowrap">{b.workingSets} × {b.coefficientUsed}</td>
                    <td className="py-0.5 text-right font-semibold">{b.effectiveSets.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/50">
                  <td colSpan={3} className="pt-1 text-right text-muted-foreground">Razem</td>
                  <td className="pt-1 text-right font-bold">{target.weeklyEffectiveSets.toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PlanSummaryCard ──────────────────────────────────────────────────────────

function PlanSummaryCard({ plan }: { plan: WorkoutPlan }) {
  const totalExercises = plan.days.reduce((s, d) => s + d.exercises.length, 0);
  const totalSets = plan.days.reduce((s, d) => d.exercises.reduce((ss, e) => ss + e.workingSets, 0) + s, 0);
  const statusMeta = STATUS_BADGE[plan.status];

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <LayoutList size={16} className="text-primary" />
          Podsumowanie planu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Dni treningowe</span>
          <span className="font-medium">{plan.days.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Wpisy ćwiczeń</span>
          <span className="font-medium">{totalExercises}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Łącznie serii rob.</span>
          <span className="font-medium">{totalSets}</span>
        </div>
        {plan.goal && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Cel</span>
            <span className="font-medium text-right text-xs">{plan.goal}</span>
          </div>
        )}
        {plan.startDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Od</span>
            <span className="font-medium">{formatDate(plan.startDate)}</span>
          </div>
        )}
        {plan.endDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Do</span>
            <span className="font-medium">{formatDate(plan.endDate)}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Ostatnia zmiana</span>
          <span className="text-xs text-muted-foreground text-right">
            {new Date(plan.updatedAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Przypisany klient</span>
          <span className="font-medium text-right text-xs">
            {plan.clientName ?? "Nie znaleziono klienta"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Poziom doświadczenia</span>
          <span className="text-xs font-medium text-right">{plan.experienceLevelUsed}</span>
        </div>
        {plan.experienceLevelUsed === "Brak aktywności fizycznej" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 leading-snug">
            Etap wprowadzający — priorytetem jest technika, kontrola ruchu i przygotowanie motoryczne.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PlanInfoForm ─────────────────────────────────────────────────────────────

function PlanInfoForm({ plan, planId }: { plan: WorkoutPlan; planId: number }) {
  const { toast } = useToast();

  const makeFormFromPlan = (p: WorkoutPlan) => ({
    goal: p.goal ?? "",
    description: p.description ?? "",
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    trainerNotes: p.trainerNotes ?? "",
  });

  const [expanded, setExpanded] = useState(
    !!(plan.goal || plan.description || plan.startDate || plan.endDate || plan.trainerNotes),
  );
  const [form, setForm] = useState(() => makeFormFromPlan(plan));
  const [savedForm, setSavedForm] = useState(() => makeFormFromPlan(plan));
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const updatePlan = useUpdatePlan(planId, plan.clientId);

  // Warn before browser close/navigate when unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    updatePlan.mutate(
      {
        goal: form.goal || null,
        description: form.description || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        trainerNotes: form.trainerNotes || null,
      },
      {
        onSuccess: (updated) => {
          setSavedForm(makeFormFromPlan(updated));
          toast({ title: "Informacje planu zapisane" });
        },
        onError: (err) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const handleDiscard = () => {
    setForm(savedForm);
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-semibold hover:text-foreground transition-colors text-left w-full"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Info size={15} className="text-primary" />
          Informacje planu
          {isDirty && (
            <Badge variant="outline" className="ml-auto text-xs text-amber-600 border-amber-300">
              Niezapisane zmiany
            </Badge>
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-goal">Cel planu</Label>
              <Input
                id="plan-goal"
                value={form.goal}
                onChange={set("goal")}
                placeholder="np. Hipertrofia, Siła, Redukcja"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="plan-start">Data rozpoczęcia</Label>
                <Input id="plan-start" type="date" value={form.startDate} onChange={set("startDate")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-end">Data zakończenia</Label>
                <Input id="plan-end" type="date" value={form.endDate} onChange={set("endDate")} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-desc">Opis planu</Label>
            <Textarea
              id="plan-desc"
              value={form.description}
              onChange={set("description")}
              className="min-h-[70px]"
              placeholder="Krótki opis planu, założenia, uwagi dla klienta..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-notes">Notatki trenera (prywatne)</Label>
            <Textarea
              id="plan-notes"
              value={form.trainerNotes}
              onChange={set("trainerNotes")}
              className="min-h-[60px]"
              placeholder="Prywatne uwagi widoczne tylko dla trenera..."
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={!isDirty || updatePlan.isPending}>
              <Save size={13} className="mr-1" />
              {updatePlan.isPending ? "Zapisywanie..." : "Zapisz informacje"}
            </Button>
            {isDirty && (
              <Button size="sm" variant="ghost" onClick={handleDiscard}>
                <X size={13} className="mr-1" />
                Odrzuć zmiany
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
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
  const { preview, isLoadingPreview } = useVolumePreview(plan);
  const { analysisResult, isLoadingAnalysis } = useAnalysisPreview(plan);
  const updatePlan = useUpdatePlan(planId, plan?.clientId);
  const addDay = useAddPlanDay(planId, plan?.clientId);
  const addExercise = useAddPlanExercise(planId);
  const activatePlan = useActivatePlan(planId, plan?.clientId);
  const reorderDays = useReorderPlanDays(planId);

  const daySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  const canEdit = plan.status === "draft";

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
    if (!window.confirm("Aktywować plan? Po aktywacji nie będzie można zmieniać jego struktury.")) return;
    activatePlan.mutate(undefined, {
      onSuccess: () => toast({ title: "Plan aktywowany!" }),
      onError: (err) => {
        const detail = (err as any)?.data;
        if (detail?.error === "PLAN_ACTIVATION_VALIDATION_FAILED" && Array.isArray(detail?.missingFields) && detail.missingFields.length > 0) {
          const items = (detail.missingFields as Array<{ label: string; message: string }>)
            .map((f) => `• ${f.label}: ${f.message}`)
            .join("\n");
          toast({
            title: "Nie można aktywować niekompletnego planu",
            description: items,
            variant: "destructive",
          });
        } else if (detail?.violations) {
          const items = (detail.violations as Array<{ targetName: string; weeklyEffectiveSets: number; weeklyAbsoluteCeiling: number }>)
            .map((v) => `• ${v.targetName}: ${v.weeklyEffectiveSets} serii (limit: ${v.weeklyAbsoluteCeiling})`)
            .join("\n");
          toast({ title: err.message, description: items, variant: "destructive" });
        } else {
          toast({ title: err.message, variant: "destructive" });
        }
      },
    });
  };

  const handleArchive = () => {
    if (!window.confirm("Zarchiwizować plan?")) return;
    updatePlan.mutate({ status: "archived" }, {
      onSuccess: () => toast({ title: "Plan zarchiwizowany" }),
      onError: (err) => toast({ title: err.message, variant: "destructive" }),
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
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  const handleDayDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = plan.days.findIndex((d) => d.id === active.id);
    const newIndex = plan.days.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(plan.days, oldIndex, newIndex);
    reorderDays.mutate(
      reordered.map((d, i) => ({ id: d.id, dayOrder: i + 1 })),
      { onError: (err) => toast({ title: err.message, variant: "destructive" }) },
    );
  };

  const handleDayMoveUp = (idx: number) => {
    if (idx === 0) return;
    const reordered = [...plan.days];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    reorderDays.mutate(reordered.map((d, i) => ({ id: d.id, dayOrder: i + 1 })));
  };

  const handleDayMoveDown = (idx: number) => {
    if (idx === plan.days.length - 1) return;
    const reordered = [...plan.days];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    reorderDays.mutate(reordered.map((d, i) => ({ id: d.id, dayOrder: i + 1 })));
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
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setTitleValue(plan.title); setEditingTitle(true); }}
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
              Poziom objętości:{" "}
              <span className="font-medium text-foreground">{plan.experienceLevelUsed}</span>
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            {plan.status === "draft" && (
              <>
                <Button
                  onClick={handleActivate}
                  disabled={!canActivate || activatePlan.isPending}
                  className="gap-1"
                  title={
                    hasAbsoluteViolation ? "Przekroczono absolutny limit objętości"
                      : hasUnassignedExercises ? "Ćwiczenia bez przypisanych mięśni"
                      : undefined
                  }
                >
                  {activatePlan.isPending ? "Aktywowanie..." : "Aktywuj plan"}
                </Button>
                <Button variant="outline" onClick={handleArchive} disabled={updatePlan.isPending} className="gap-1">
                  <Archive size={14} />
                  Archiwizuj
                </Button>
              </>
            )}
            {plan.status === "active" && (
              <Button variant="outline" onClick={handleArchive} disabled={updatePlan.isPending} className="gap-1">
                <Archive size={14} />
                Archiwizuj
              </Button>
            )}
          </div>
        </div>

        {(hasAbsoluteViolation || hasUnassignedExercises) && plan.status === "draft" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
            {hasAbsoluteViolation && (
              <p className="text-sm text-destructive">
                ⛔ Aktywacja zablokowana — przekroczono absolutny limit tygodniowy dla co najmniej jednej grupy mięśniowej.
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

      {/* Plan info form */}
      <PlanInfoForm plan={plan} planId={planId} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Training days */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Dumbbell size={18} className="text-primary" />
              Dni treningowe
            </h2>
            {canEdit && (
              <Button size="sm" variant="outline" className="gap-1" onClick={handleAddDay} disabled={addDay.isPending}>
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
            <DndContext sensors={daySensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
              <SortableContext items={plan.days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {plan.days.map((day, idx) => (
                    <SortableDaySection
                      key={day.id}
                      day={day}
                      planId={planId}
                      allDays={plan.days}
                      onAddExercise={(id) => setPickerDayId(id)}
                      dayIndex={idx}
                      daysTotal={plan.days.length}
                      onMoveUp={() => handleDayMoveUp(idx)}
                      onMoveDown={() => handleDayMoveDown(idx)}
                      preview={preview ?? undefined}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Right: Summary + Volume */}
        <div className="space-y-4">
          <div className="xl:sticky xl:top-6 space-y-4">
            {/* Plan summary */}
            <PlanSummaryCard plan={plan} />

            {/* Live volume analysis panel */}
            <VolumePanel
              plan={plan}
              preview={preview}
              isLoadingPreview={isLoadingPreview}
            />

            {/* Live movement analysis panel */}
            <AnalysisPanel
              analysis={analysisResult}
              isLoading={isLoadingAnalysis}
            />
          </div>
        </div>
      </div>

      {/* Exercise picker dialog */}
      <ExercisePicker
        open={pickerDayId !== null}
        onClose={() => setPickerDayId(null)}
        onSelect={handleExerciseSelected}
        clientId={plan?.clientId}
      />
    </div>
  );
}
