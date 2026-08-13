/**
 * CardioSection — compact, editable cardio recommendation card for PlanEditor.
 *
 * Reads plan.cardioRecommendation (stored JSON) if present; falls back to
 * a freshly generated recommendation from plan.surveyCardio + experience level.
 * Trainer can edit all fields and save via PATCH /plans/:id.
 */

import { useState, useMemo } from "react";
import { humanizeError } from "@/lib/userError";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUpdatePlan, type WorkoutPlan } from "@/lib/planApi";
import {
  generateCardioRecommendation,
  type CardioRecommendationData,
  type CardioSession,
} from "@/lib/cardioGenerator";
import { DevStatusBadge } from "@/components/DevStatusBadge";

// ─── Constants ────────────────────────────────────────────────────────────────

const CARDIO_ACTIVITIES = [
  "Marsz",
  "Szybki marsz",
  "Bieganie",
  "Rower",
  "Pływanie",
  "Orbitrek",
  "Wioślarz",
  "Schody",
  "Sport rekreacyjny",
];

// ─── Edit form ────────────────────────────────────────────────────────────────

function CardioEditForm({
  form,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: {
  form: CardioRecommendationData;
  onChange: (updated: CardioRecommendationData) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const handleSessionCountChange = (count: number) => {
    const clamped = Math.max(1, Math.min(5, count));
    const template: CardioSession = form.sessions[0] ?? {
      durationMinutes: 25,
      metric: "",
    };
    const newSessions: CardioSession[] = Array.from(
      { length: clamped },
      (_, i) => form.sessions[i] ?? { ...template },
    );
    onChange({ ...form, sessionsPerWeek: clamped, sessions: newSessions });
  };

  const handleSessionChange = (
    idx: number,
    field: keyof CardioSession,
    value: string | number,
  ) => {
    const newSessions = form.sessions.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s,
    );
    onChange({ ...form, sessions: newSessions });
  };

  return (
    <div className="space-y-4">
      {/* Activity + sessions count */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Aktywność</Label>
          <Select
            value={form.activity}
            onValueChange={(v) => onChange({ ...form, activity: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARDIO_ACTIVITIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sesje w tygodniu</Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={form.sessionsPerWeek}
            onChange={(e) =>
              handleSessionCountChange(Number(e.target.value) || 1)
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Per-session fields */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Sesje
        </p>
        {form.sessions.map((session, idx) => (
          <div
            key={idx}
            className="rounded-md bg-blue-50/40 border border-blue-100 px-3 py-2 space-y-2"
          >
            <p className="text-xs font-semibold text-blue-800">
              Sesja {idx + 1}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Czas (min)</Label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={session.durationMinutes}
                  onChange={(e) =>
                    handleSessionChange(
                      idx,
                      "durationMinutes",
                      Number(e.target.value) || 20,
                    )
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tempo / intensywność</Label>
                <Input
                  value={session.metric}
                  onChange={(e) =>
                    handleSessionChange(idx, "metric", e.target.value)
                  }
                  className="h-8 text-sm"
                  placeholder="np. 6:40 min/km"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progression */}
      <div className="space-y-1">
        <Label className="text-xs">Progresja</Label>
        <Textarea
          value={form.progressionText}
          onChange={(e) =>
            onChange({ ...form, progressionText: e.target.value })
          }
          className="text-sm min-h-[70px]"
          placeholder="Opisz jak i kiedy zwiększyć obciążenie..."
        />
      </div>

      {/* Execution instruction */}
      <div className="space-y-1">
        <Label className="text-xs">Jak wykonać tę sesję?</Label>
        <Textarea
          value={form.executionInstruction}
          onChange={(e) =>
            onChange({ ...form, executionInstruction: e.target.value })
          }
          className="text-sm min-h-[60px]"
          placeholder="Instrukcja wykonania..."
        />
      </div>

      {/* Pre-session note */}
      <div className="space-y-1">
        <Label className="text-xs">Przed sesją</Label>
        <Textarea
          value={form.preSessionNote}
          onChange={(e) =>
            onChange({ ...form, preSessionNote: e.target.value })
          }
          className="text-sm min-h-[50px]"
          placeholder="Wskazówki przed treningiem..."
        />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          <Check size={14} className="mr-1" />
          {isSaving ? "Zapisywanie..." : "Zapisz"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X size={14} className="mr-1" />
          Anuluj
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CardioSection({
  plan,
  planId,
}: {
  plan: WorkoutPlan;
  planId: number;
}) {
  const { toast } = useToast();
  const updatePlan = useUpdatePlan(planId, plan.clientId);

  // Parse stored recommendation
  const storedRec = useMemo<CardioRecommendationData | null>(() => {
    if (!plan.cardioRecommendation) return null;
    try {
      return JSON.parse(plan.cardioRecommendation) as CardioRecommendationData;
    } catch {
      return null;
    }
  }, [plan.cardioRecommendation]);

  // Generate fresh recommendation from survey data
  const generatedRec = useMemo<CardioRecommendationData | null>(() => {
    if (!plan.surveyCardio) return null;
    const sc = plan.surveyCardio;
    return generateCardioRecommendation({
      cardioPreference: sc.cardioPreference,
      cardioFrequency: sc.cardioFrequency,
      preferredCardioType: sc.preferredCardioType,
      activityLevel: sc.activityLevel,
      trainingGoal: sc.trainingGoal,
      experienceLevel: plan.experienceLevelUsed,
      trainingDays: plan.days.length,
      hasHealthLimitation:
        !!sc.healthLimitations || sc.injuryStatus === "Tak",
    });
  }, [plan.surveyCardio, plan.experienceLevelUsed, plan.days.length]);

  const rec = storedRec ?? generatedRec;
  const isGenerated = !storedRec && !!generatedRec;

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<CardioRecommendationData | null>(null);

  // Expandable sections in display mode
  const [execOpen, setExecOpen] = useState(false);
  const [preOpen, setPreOpen] = useState(false);

  const handleStartEdit = () => {
    if (!rec) return;
    setEditForm({ ...rec, sessions: rec.sessions.map((s) => ({ ...s })) });
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm(null);
  };

  const handleSave = () => {
    if (!editForm) return;
    updatePlan.mutate(
      { cardioRecommendation: JSON.stringify(editForm) },
      {
        onSuccess: () => {
          setEditing(false);
          setEditForm(null);
          toast({ title: "Rekomendacja cardio zapisana" });
        },
        onError: (err) =>
          toast({ title: humanizeError(err), variant: "destructive" }),
      },
    );
  };

  // Polish plural for sessions badge
  function sessionsLabel(n: number) {
    if (n === 1) return "1 sesja / tydzień";
    if (n <= 4) return `${n} sesje / tydzień`;
    return `${n} sesji / tydzień`;
  }

  // No survey data at all
  if (!rec) {
    return (
      <Card className="border-dashed border-border/50 shadow-sm">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Brak danych wywiadu — nie można wygenerować rekomendacji cardio.
        </CardContent>
      </Card>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  if (editing && editForm) {
    return (
      <Card className="border-blue-200 shadow-sm overflow-hidden">
        <div className="border-l-4 border-blue-400 rounded-l-sm">
          <CardHeader className="pb-3 bg-blue-50/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-blue-900 flex items-center gap-2">
                <Activity size={15} className="text-blue-500" />
                Edytuj: Cardio / aktywność dodatkowa
              </span>
              <DevStatusBadge feature="cardio_section" />
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <CardioEditForm
              form={editForm}
              onChange={setEditForm}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              isSaving={updatePlan.isPending}
            />
          </CardContent>
        </div>
      </Card>
    );
  }

  // ── DISPLAY MODE ───────────────────────────────────────────────────────────
  return (
    <Card className="border-blue-200 shadow-sm overflow-hidden">
      <div className="border-l-4 border-blue-400">
        {/* Header */}
        <CardHeader className="pb-3 bg-blue-50/50">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-blue-900 flex items-center gap-1.5">
                  <Activity size={15} className="text-blue-500 shrink-0" />
                  Cardio / aktywność dodatkowa
                </span>
                <DevStatusBadge feature="cardio_section" />
                {isGenerated && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300"
                  >
                    z wywiadu
                  </Badge>
                )}
              </div>
              {/* Compact summary badges */}
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 bg-white border-blue-200 text-blue-800 font-normal"
                >
                  {sessionsLabel(rec.sessionsPerWeek)}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 bg-white border-blue-200 text-blue-800 font-normal"
                >
                  {rec.activity}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 bg-white border-blue-200 text-blue-800 font-normal"
                >
                  {rec.sessions[0]?.durationMinutes} min
                </Badge>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 h-7 gap-1 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              onClick={handleStartEdit}
            >
              <Pencil size={12} />
              Edytuj
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-3 space-y-3">
          {/* Session rows */}
          <div className="space-y-2">
            {rec.sessions.map((session, idx) => (
              <div
                key={idx}
                className="rounded-md bg-blue-50/40 border border-blue-100 px-3 py-2"
              >
                <p className="text-xs font-semibold text-blue-800 mb-0.5">
                  Sesja {idx + 1} · {rec.activity}
                </p>
                <p className="text-xs text-foreground/80">
                  {session.durationMinutes} minut
                  {session.metric ? ` · ${session.metric}` : ""}
                </p>
              </div>
            ))}
          </div>

          {/* Progression */}
          <div className="pt-1 border-t border-blue-100/80">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">
              Progresja
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {rec.progressionText}
            </p>
          </div>

          {/* Expandable: execution instruction */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-900 transition-colors"
              onClick={() => setExecOpen((o) => !o)}
            >
              {execOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Jak wykonać tę sesję?
            </button>
            {execOpen && (
              <p className="mt-1.5 ml-4 text-xs text-muted-foreground leading-relaxed">
                {rec.executionInstruction}
              </p>
            )}
          </div>

          {/* Expandable: pre-session note */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-900 transition-colors"
              onClick={() => setPreOpen((o) => !o)}
            >
              {preOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Przed sesją
            </button>
            {preOpen && (
              <p className="mt-1.5 ml-4 text-xs text-muted-foreground leading-relaxed">
                {rec.preSessionNote}
              </p>
            )}
          </div>

          {/* Health limitation notice */}
          {rec.hasHealthLimitation && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <span className="shrink-0 mt-px">⚠</span>
              <span>
                Klient zgłasza ograniczenia zdrowotne. Zweryfikuj tę
                rekomendację przed przekazaniem jej klientowi.
              </span>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
