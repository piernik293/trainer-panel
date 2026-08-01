import { useState, useEffect, useRef, useCallback } from "react";
import { useUser, SignIn } from "@clerk/react";
import { Loader2, CheckCircle2, ChevronDown, ChevronRight, Dumbbell, Flame, Zap, Activity, Shield, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── API helpers ─────────────────────────────────────────────────────────────

// Absolute /api/... path — no BASE_URL prefix.
// The Replit proxy routes /api/* → API server for all artifacts on the same
// domain.  Using BASE_URL would produce /client-landing/api/..., which the
// proxy routes to the Vite dev server instead.
//
// credentials: "include" is required here: Clerk's __session cookie must be
// sent for the API to authenticate the client-portal caller.
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: number;
  dayId: number;
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  orderInDay: number;
  workingSets: number;
  warmUpSets: number;
  repType: string | null;
  repsExact: number | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  repTimeSeconds: number | null;
  repOpenInstruction: string | null;
  loadType: string | null;
  loadValue: string | null;
  loadInstruction: string | null;
  rir: number | null;
  rpe: string | null;
  tempo: string | null;
  restSeconds: number | null;
  clientInstructions: string | null;
}

interface PlanDay {
  id: number;
  planId: number;
  dayOrder: number;
  dayName: string | null;
  subtitle: string | null;
  description: string | null;
  estimatedDurationMinutes: number | null;
  exercises: PlanExercise[];
}

interface Plan {
  id: number;
  clientId: number;
  title: string;
  goal: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  updatedAt: string | null;
  /** Trainer-authored cardio prescription — JSON string or null (no cardio saved). */
  cardioRecommendation: string | null;
  days: PlanDay[];
}

/** Shape of the trainer-saved cardio JSON (mirrors trainer-app cardioGenerator). */
interface CardioData {
  activity: string;
  sessionsPerWeek: number;
  sessions: Array<{ durationMinutes: number; metric: string }>;
  progressionText: string;
  executionInstruction: string;
  preSessionNote: string;
  hasHealthLimitation: boolean;
}

function parseCardioData(raw: string | null): CardioData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<CardioData> | null;
    if (
      !data ||
      typeof data !== "object" ||
      typeof data.activity !== "string" ||
      typeof data.sessionsPerWeek !== "number" ||
      !Array.isArray(data.sessions)
    ) {
      return null;
    }
    // Every session must be a well-formed object — malformed persisted data
    // must degrade to the neutral empty state, never crash the plan view.
    const sessions = data.sessions.filter(
      (s): s is CardioData["sessions"][number] =>
        !!s && typeof s === "object" &&
        typeof s.durationMinutes === "number" &&
        typeof s.metric === "string",
    );
    if (sessions.length === 0) return null;
    return {
      activity: data.activity,
      sessionsPerWeek: data.sessionsPerWeek,
      sessions,
      progressionText: typeof data.progressionText === "string" ? data.progressionText : "",
      executionInstruction: typeof data.executionInstruction === "string" ? data.executionInstruction : "",
      preSessionNote: typeof data.preSessionNote === "string" ? data.preSessionNote : "",
      hasHealthLimitation: data.hasHealthLimitation === true,
    };
  } catch {
    return null;
  }
}

interface ClientInfo {
  id: number;
  firstName: string;
  lastName: string;
}

interface Session {
  id: number;
  clientId: number;
  planId: number;
  planDayId: number;
  sessionDate: string;
  isCompleted: boolean;
  notes: string | null;
  completedAt: string | null;
  difficultyRating: number | null;
  hadPain: boolean | null;
  energyLevel: "low" | "medium" | "high" | null;
  logs: ExerciseLog[];
}

interface ExerciseLog {
  id: number;
  sessionId: number;
  planExerciseId: number;
  setsCompleted: number | null;
  repsCompleted: number | null;
  weightKg: string | null;
  rir: number | null;
  note: string | null;
  isCompleted: boolean;
  /** Present on session-detail responses (snapshot or current name). */
  exerciseName?: string | null;
}

type ProgressionSuggestion = "increase" | "maintain" | "repeat_or_reduce";

interface PrevResult {
  weightKg: string | null;
  repsCompleted: number | null;
  setsCompleted: number | null;
  rir: number | null;
  completedAt: string | null;
  suggestion: ProgressionSuggestion | null;
}

interface OpenSessionResponse {
  session: Session;
  previous: Record<number, PrevResult>;
}

interface HistoryItem {
  id: number;
  planId: number;
  planDayId: number;
  sessionDate: string;
  completedAt: string | null;
  dayName: string | null;
  daySubtitle: string | null;
  dayOrder: number | null;
  planTitle: string | null;
  completedExercises: number;
  completedSets: number;
}

interface HistoryResponse {
  items: HistoryItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

const SUGGESTION_LABELS: Record<ProgressionSuggestion, string> = {
  increase: "Sugestia: zwiększ ciężar przy kolejnym treningu",
  maintain: "Sugestia: utrzymaj ciężar",
  repeat_or_reduce: "Sugestia: powtórz lub zmniejsz ciężar",
};

function formatPrevious(prev: PrevResult): string {
  const parts: string[] = [];
  if (prev.weightKg != null && prev.weightKg !== "") parts.push(`${parseFloat(prev.weightKg)} kg`);
  if (prev.repsCompleted != null) {
    const sets = prev.setsCompleted ?? 1;
    parts.push(Array.from({ length: Math.max(sets, 1) }, () => `${prev.repsCompleted}`).join(", "));
  } else if (prev.setsCompleted != null) {
    parts.push(`${prev.setsCompleted} serii`);
  }
  return parts.join(" × ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) +
    ", " + d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

interface RampItem {
  name: string;
  detail: string;
  description: string;
}

interface RampBlock {
  phase: string;
  label: string;
  goal: string;
  items: RampItem[];
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatPrescription(ex: PlanExercise): string {
  const sets = ex.workingSets;
  let reps = "";
  if (ex.repType === "exact" && ex.repsExact) reps = `${ex.repsExact} pow.`;
  else if (ex.repRangeMin && ex.repRangeMax) reps = `${ex.repRangeMin}–${ex.repRangeMax} pow.`;
  else if (ex.repRangeMin) reps = `${ex.repRangeMin}+ pow.`;
  else if (ex.repType === "time" && ex.repTimeSeconds) reps = `${ex.repTimeSeconds}s`;
  else if (ex.repType === "open") reps = ex.repOpenInstruction ?? "AMRAP";
  const rir = ex.rir != null ? ` · RIR ${ex.rir}` : "";
  const rest = ex.restSeconds ? ` · ${ex.restSeconds < 120 ? `${ex.restSeconds}s` : `${Math.round(ex.restSeconds / 60)} min`} przerwy` : "";
  return `${sets} serie${reps ? ` × ${reps}` : ""}${rir}${rest}`;
}


const PHASE_ICONS: Record<string, React.ReactNode> = {
  Raise: <Flame className="w-4 h-4 text-orange-400" />,
  Activate: <Zap className="w-4 h-4 text-yellow-400" />,
  Mobilize: <Activity className="w-4 h-4 text-blue-400" />,
  Potentiate: <Shield className="w-4 h-4 text-green-400" />,
};

// ─── SignInGate ────────────────────────────────────────────────────────────────
// Shown when the client is not signed in. Uses Clerk's embedded sign-in
// component so clients authenticate before their plan is fetched.

function SignInGate() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal klienta</h1>
          <p className="text-sm text-muted-foreground">Zaloguj się, aby zobaczyć swój plan treningowy.</p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}

// ─── RampWarmup ───────────────────────────────────────────────────────────────

function RampWarmup({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<RampBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (blocks) { setOpen(!open); return; }
    setLoading(true);
    try {
      const data = await apiFetch<{ dayType: string; blocks: RampBlock[] }>(`/client-portal/sessions/${sessionId}/warmup`);
      setBlocks(data.blocks);
      setOpen(true);
    } catch {
      setOpen(!open);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-white/10 bg-card/50 rounded-none mb-6">
      <button
        type="button"
        onClick={load}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Flame className="w-5 h-5 text-orange-400" />
          <div>
            <p className="font-semibold text-sm">Rozgrzewka RAMP</p>
            <p className="text-xs text-muted-foreground">Raise · Activate · Mobilize · Potentiate</p>
          </div>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && blocks && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
          {blocks.map((block) => (
            <div key={block.phase}>
              <div className="flex items-center gap-2 mb-2">
                {PHASE_ICONS[block.phase]}
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{block.phase} — {block.label}</span>
              </div>
              <p className="text-xs text-muted-foreground/70 mb-2 italic">{block.goal}</p>
              <div className="space-y-1.5">
                {block.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="text-primary font-bold text-xs mt-0.5 w-4 shrink-0">{i + 1}.</span>
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{item.detail}</span>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ExerciseLogRow ───────────────────────────────────────────────────────────

interface LogState {
  setsCompleted: string;
  repsCompleted: string;
  weightKg: string;
  rir: string;
  note: string;
  isCompleted: boolean;
}

function ExerciseLogRow({
  ex,
  sessionId,
  initialLog,
  previous,
  onLogSaved,
}: {
  ex: PlanExercise;
  sessionId: number;
  initialLog: ExerciseLog | null;
  previous: PrevResult | null;
  onLogSaved: (log: ExerciseLog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [log, setLog] = useState<LogState>({
    setsCompleted: initialLog?.setsCompleted?.toString() ?? "",
    repsCompleted: initialLog?.repsCompleted?.toString() ?? "",
    // Previous load is only a starting suggestion — prefilled in the input,
    // editable, never auto-saved and never marks anything as completed.
    weightKg: initialLog?.weightKg ?? (previous?.weightKg != null ? String(parseFloat(previous.weightKg)) : ""),
    rir: initialLog?.rir?.toString() ?? "",
    note: initialLog?.note ?? "",
    isCompleted: initialLog?.isCompleted ?? false,
  });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (data: LogState) => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await apiFetch<ExerciseLog>(
        `/client-portal/sessions/${sessionId}/exercises/${ex.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            setsCompleted: data.setsCompleted !== "" ? parseInt(data.setsCompleted) : null,
            repsCompleted: data.repsCompleted !== "" ? parseInt(data.repsCompleted) : null,
            weightKg: data.weightKg !== "" ? parseFloat(data.weightKg) : null,
            rir: data.rir !== "" ? parseInt(data.rir) : null,
            note: data.note || null,
            isCompleted: data.isCompleted,
          }),
        },
      );
      onLogSaved(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent — user can retry
    } finally {
      setSaving(false);
    }
  }, [sessionId, ex.id, onLogSaved]);

  const scheduleSave = (next: LogState) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => save(next), 800);
  };

  const update = (field: keyof LogState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...log, [field]: e.target.value };
    setLog(next);
    scheduleSave(next);
  };

  const toggleComplete = () => {
    const next = { ...log, isCompleted: !log.isCompleted };
    setLog(next);
    save(next);
  };

  const isLogged = log.setsCompleted !== "" || log.repsCompleted !== "" || log.weightKg !== "" || log.isCompleted;

  return (
    <div className={cn("border border-white/10 rounded-none transition-colors", log.isCompleted && "border-primary/30 bg-primary/5")}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <div
          className={cn(
            "w-5 h-5 shrink-0 rounded-none border flex items-center justify-center transition-colors",
            log.isCompleted ? "border-primary bg-primary" : "border-white/20 bg-transparent"
          )}
          onClick={(e) => { e.stopPropagation(); toggleComplete(); }}
        >
          {log.isCompleted && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-medium text-sm", log.isCompleted && "line-through text-muted-foreground")}>
            {ex.exerciseName}
          </p>
          <p className="text-xs text-muted-foreground">{formatPrescription(ex)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLogged && !log.isCompleted && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-yellow-500/30 text-yellow-500">w trakcie</Badge>
          )}
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {saved && <Save className="w-3.5 h-3.5 text-green-500" />}
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Log form */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-3">
          {ex.clientInstructions && (
            <p className="text-xs text-primary/80 bg-primary/5 px-3 py-2 border border-primary/10">{ex.clientInstructions}</p>
          )}
          {previous && (
            <div className="text-xs px-3 py-2 border border-white/10 bg-white/5 space-y-0.5">
              <p className="text-muted-foreground">Poprzednio: <span className="text-foreground font-medium">{formatPrevious(previous) || "—"}</span></p>
              {previous.suggestion && (
                <p className={cn(
                  previous.suggestion === "increase" && "text-green-400",
                  previous.suggestion === "maintain" && "text-muted-foreground",
                  previous.suggestion === "repeat_or_reduce" && "text-yellow-500",
                )}>
                  {SUGGESTION_LABELS[previous.suggestion]}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Serie wykonane</label>
              <Input
                type="number"
                min={0}
                placeholder={`z ${ex.workingSets}`}
                value={log.setsCompleted}
                onChange={update("setsCompleted")}
                className="h-9 text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Powtórzenia</label>
              <Input
                type="number"
                min={0}
                placeholder="np. 10"
                value={log.repsCompleted}
                onChange={update("repsCompleted")}
                className="h-9 text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Ciężar (kg)</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="np. 60"
                value={log.weightKg}
                onChange={update("weightKg")}
                className="h-9 text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">RIR</label>
              <Input
                type="number"
                min={0}
                max={10}
                placeholder={ex.rir != null ? String(ex.rir) : "0–5"}
                value={log.rir}
                onChange={update("rir")}
                className="h-9 text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notatka</label>
            <Textarea
              placeholder="np. zmęczony, zmniejszyłem ciężar..."
              value={log.note}
              onChange={update("note")}
              className="min-h-[60px] text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none resize-none"
            />
          </div>
          <Button
            size="sm"
            variant={log.isCompleted ? "outline" : "default"}
            onClick={toggleComplete}
            className="w-full rounded-none"
          >
            {log.isCompleted ? (
              <><RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Oznacz jako niewykonane</>
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Oznacz jako wykonane</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── SessionView ──────────────────────────────────────────────────────────────

function SessionView({
  day,
  planId,
  onBack,
}: {
  day: PlanDay;
  planId: number;
  onBack: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [previous, setPrevious] = useState<Record<number, PrevResult>>({});
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Server-side get-or-create: returns the single active (not completed)
        // session for this day, or creates a fresh one. Completed sessions are
        // never reopened — they stay in history untouched.
        const opened = await apiFetch<OpenSessionResponse>("/client-portal/sessions/open", {
          method: "POST",
          body: JSON.stringify({ planId, planDayId: day.id }),
        });
        setSession(opened.session);
        setPrevious(opened.previous ?? {});
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    })();
  }, [planId, day.id]);

  const handleLogSaved = (log: ExerciseLog) => {
    setSession((s) => {
      if (!s) return s;
      const logs = s.logs.filter((l) => l.planExerciseId !== log.planExerciseId);
      return { ...s, logs: [...logs, log] };
    });
  };

  const handleComplete = async () => {
    if (!session) return;
    setCompleting(true);
    try {
      const updated = await apiFetch<Session>(`/client-portal/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted: !session.isCompleted }),
      });
      setSession((s) => (s ? { ...s, isCompleted: updated.isCompleted, completedAt: updated.completedAt } : s));
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-destructive mb-4">Nie udało się załadować sesji.</p>
          <Button variant="outline" onClick={onBack} className="rounded-none">Powrót</Button>
        </div>
      </div>
    );
  }

  const completedCount = session.logs.filter((l) => l.isCompleted).length;
  const completedSets = session.logs.filter((l) => l.isCompleted).reduce((sum, l) => sum + (l.setsCompleted ?? 0), 0);
  const totalCount = day.exercises.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Powrót
          </button>
          <div className="text-center min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{day.dayName ?? `Dzień ${day.dayOrder}`}</p>
            {day.subtitle && <p className="text-xs text-muted-foreground">{day.subtitle}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{completedCount}/{totalCount}</p>
            <p className="text-xs font-bold text-primary">{pct}%</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="max-w-2xl mx-auto mt-2">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {/* Completion banner */}
        {session.isCompleted && (
          <div className="border border-primary/30 bg-primary/5 px-4 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Trening zakończony! Świetna robota.</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ukończono {completedCount} z {totalCount} ćwiczeń
                  {completedSets > 0 ? ` · ${completedSets} serii` : ""}
                </p>
                {session.completedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(session.completedAt)}</p>
                )}
              </div>
            </div>

            <SessionFeedbackForm session={session} onSaved={(s) => setSession((cur) => (cur ? { ...cur, ...s } : cur))} />

            <Button
              onClick={onBack}
              className="w-full h-11 rounded-none font-semibold uppercase tracking-wide"
            >
              Wróć do planu
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSummary(true)}
              className="w-full h-9 rounded-none text-sm"
            >
              Zobacz podsumowanie
            </Button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {completing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <><RotateCcw className="w-3.5 h-3.5" /> Cofnij zakończenie treningu</>
              )}
            </button>
          </div>
        )}

        {showSummary && (
          <SessionDetailReadOnly sessionId={session.id} onClose={() => setShowSummary(false)} />
        )}

        {/* RAMP Warm-up */}
        <RampWarmup sessionId={session.id} />

        {/* Exercise list */}
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Ćwiczenia</h2>
          {day.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Brak ćwiczeń w tym dniu.</p>
          ) : (
            day.exercises.map((ex) => (
              <ExerciseLogRow
                key={`${session.id}-${ex.id}`}
                ex={ex}
                sessionId={session.id}
                initialLog={session.logs.find((l) => l.planExerciseId === ex.id) ?? null}
                previous={previous[ex.id] ?? null}
                onLogSaved={handleLogSaved}
              />
            ))
          )}
        </div>

        {/* Complete session button */}
        {!session.isCompleted && (
          <div className="pt-4">
            <Button
              onClick={handleComplete}
              disabled={completing}
              className="w-full h-12 rounded-none font-semibold uppercase tracking-wide"
            >
              {completing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Zakończ trening</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SessionFeedbackForm ──────────────────────────────────────────────────────
// Optional post-workout feedback — auto-saved, never blocks completion.

function SessionFeedbackForm({
  session,
  onSaved,
}: {
  session: Session;
  onSaved: (patch: Partial<Session>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const updated = await apiFetch<Session>(`/client-portal/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved(updated);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-white/10 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Jak poszło? (opcjonalnie)</span>
        <span className="flex items-center gap-1.5">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/10 pt-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Trudność treningu (1–10)</p>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ difficultyRating: n })}
                  className={cn(
                    "w-7 h-7 text-xs border transition-colors",
                    session.difficultyRating === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/15 text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Czy pojawił się ból?</p>
            <div className="flex gap-1">
              {([["Tak", true], ["Nie", false]] as const).map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patch({ hadPain: val })}
                  className={cn(
                    "px-3 h-7 text-xs border transition-colors",
                    session.hadPain === val
                      ? val
                        ? "border-yellow-500 bg-yellow-500/15 text-yellow-500"
                        : "border-primary bg-primary text-primary-foreground"
                      : "border-white/15 text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Energia</p>
            <div className="flex gap-1">
              {([["Niska", "low"], ["Średnia", "medium"], ["Wysoka", "high"]] as const).map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => patch({ energyLevel: val })}
                  className={cn(
                    "px-3 h-7 text-xs border transition-colors",
                    session.energyLevel === val
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/15 text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Notatka do sesji</p>
            <SessionNoteInput initialValue={session.notes ?? ""} onSave={(notes) => patch({ notes: notes || null })} />
          </div>
        </div>
      )}
    </div>
  );
}

function SessionNoteInput({ initialValue, onSave }: { initialValue: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Textarea
      placeholder="np. dobre tempo, następnym razem więcej przerwy..."
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => onSave(e.target.value), 800);
      }}
      className="min-h-[52px] text-sm bg-background/50 border-white/10 focus-visible:border-primary rounded-none resize-none"
    />
  );
}

// ─── SessionDetailReadOnly ────────────────────────────────────────────────────
// Read-only view of a (usually completed) session — used by the post-workout
// summary and by history items. Editing happens only via the existing
// "Cofnij zakończenie treningu" action on the session itself.

function SessionDetailReadOnly({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setDetail(await apiFetch<Session>(`/client-portal/sessions/${sessionId}`));
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  return (
    <div className="border border-white/10 bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Podsumowanie treningu</p>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Zamknij
        </button>
      </div>
      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !detail ? (
        <p className="text-sm text-muted-foreground px-4 py-6">Nie udało się załadować podsumowania.</p>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {detail.completedAt && (
            <p className="text-xs text-muted-foreground">Ukończono: {formatDateTime(detail.completedAt)}</p>
          )}
          {detail.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanych ćwiczeń w tej sesji.</p>
          ) : (
            <div className="space-y-2">
              {detail.logs.map((log) => (
                <div key={log.id} className="border border-white/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm font-medium", log.isCompleted && "text-foreground")}>
                      {log.exerciseName ?? "Ćwiczenie"}
                    </p>
                    {log.isCompleted && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-primary shrink-0">Wykonane</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {[
                      log.weightKg != null && log.weightKg !== "" ? `${parseFloat(log.weightKg)} kg` : null,
                      log.repsCompleted != null ? `${log.repsCompleted} powt.` : null,
                      log.setsCompleted != null ? `${log.setsCompleted} serii` : null,
                      log.rir != null ? `RIR ${log.rir}` : null,
                    ].filter(Boolean).join(" × ") || "Brak danych"}
                  </p>
                  {log.note && <p className="text-xs text-muted-foreground/70 mt-1 italic">{log.note}</p>}
                </div>
              ))}
            </div>
          )}
          {detail.notes && (
            <p className="text-xs text-muted-foreground border border-white/10 px-3 py-2">Notatka: {detail.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HistorySection ───────────────────────────────────────────────────────────
// "Historia treningów" — completed sessions, newest first, 12 per page.

function HistorySection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async (offset: number) => {
    const res = await apiFetch<HistoryResponse>(`/client-portal/history?limit=12&offset=${offset}`);
    setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
    setHasMore(res.hasMore);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load(0); } catch { /* empty */ } finally { setLoading(false); }
    })();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Historia treningów</h2>
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Historia treningów</h2>
      {selectedId != null && (
        <SessionDetailReadOnly sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
            className={cn(
              "w-full text-left border bg-card hover:bg-white/5 transition-all px-4 py-3",
              item.id === selectedId ? "border-primary/40" : "border-white/10 hover:border-primary/30",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {item.dayName ?? (item.dayOrder != null ? `Dzień ${item.dayOrder}` : item.planTitle ?? "Trening")}
                  </span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-primary">Ukończony</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(item.completedAt)}
                  {` · ${item.completedExercises} ćwiczeń`}
                  {item.completedSets > 0 ? ` · ${item.completedSets} serii` : ""}
                </p>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", item.id === selectedId && "rotate-90")} />
            </div>
          </button>
        ))}
      </div>
      {hasMore && (
        <Button
          variant="outline"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            try { await load(items.length); } catch { /* empty */ } finally { setLoadingMore(false); }
          }}
          className="w-full h-9 rounded-none text-sm"
        >
          {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pokaż starsze"}
        </Button>
      )}
    </div>
  );
}

// ─── CardioSection (display-only) ────────────────────────────────────────────
// Renders the trainer-saved cardio prescription. Never generated client-side:
// null/invalid JSON → compact neutral state.

function CardioCard({ cardio }: { cardio: CardioData | null }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
        Cardio / aktywność dodatkowa
      </h2>
      {!cardio ? (
        <div className="border border-white/10 bg-card px-5 py-4 text-sm text-muted-foreground">
          Brak dodatkowego cardio w planie.
        </div>
      ) : (
        <div className="border border-white/10 bg-card px-5 py-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm">{cardio.activity}</span>
            <span className="text-sm text-muted-foreground">
              · {cardio.sessionsPerWeek} {cardio.sessionsPerWeek === 1 ? "sesja" : cardio.sessionsPerWeek <= 4 ? "sesje" : "sesji"} / tydzień
              {cardio.sessions[0] ? ` · ${cardio.sessions[0].durationMinutes} min` : ""}
            </span>
          </div>

          {cardio.preSessionNote && (
            <p className="text-xs text-muted-foreground">{cardio.preSessionNote}</p>
          )}

          <div className="space-y-2">
            {cardio.sessions.map((s, i) => (
              <div key={i} className="border border-white/10 bg-white/[0.02] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Sesja {i + 1}
                </p>
                <p className="text-sm">
                  {s.durationMinutes} minut{s.metric ? `. ${s.metric}` : "."}
                </p>
              </div>
            ))}
          </div>

          {cardio.executionInstruction && (
            <p className="text-sm text-muted-foreground">{cardio.executionInstruction}</p>
          )}

          {cardio.progressionText && (
            <div className="border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">
                Progresja cardio
              </p>
              <p className="text-sm text-foreground/90">{cardio.progressionText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Strength progression guidance ───────────────────────────────────────────
// Generic, plan-agnostic guidance — the frontend never invents exercise-specific
// load increases; the trainer's plan remains authoritative.

function StrengthProgressionCard() {
  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
        Jak progresować w treningu siłowym
      </h2>
      <div className="border border-white/10 bg-card px-5 py-4 space-y-3">
        <ul className="space-y-2 text-sm text-foreground/90 list-disc pl-4">
          <li>Gdy wykonasz wszystkie zaplanowane serie w górnym zakresie powtórzeń, zachowując założony zapas (RIR), zwiększ lekko ciężar na kolejnym treningu.</li>
          <li>Jeśli nie osiągasz dolnego zakresu powtórzeń, zostań przy obecnym ciężarze lub delikatnie go zmniejsz.</li>
          <li>Nie zwiększaj ciężaru kosztem techniki.</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Obowiązuje zawsze aktualny plan od trenera — te wskazówki go nie zastępują.
        </p>
      </div>
    </div>
  );
}

// ─── PlanView ─────────────────────────────────────────────────────────────────

function PlanView({
  client,
  plan,
  onSelectDay,
}: {
  client: ClientInfo;
  plan: Plan;
  onSelectDay: (day: PlanDay) => void;
}) {
  const cardio = parseCardioData(plan.cardioRecommendation);
  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <div className="max-w-2xl mx-auto px-4 pt-10 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Plan treningowy</p>
          <h1 className="text-2xl font-bold tracking-tight">{plan.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Cześć, {client.firstName}! Wybierz dzień treningowy, aby rozpocząć sesję.</p>
          {plan.goal && (
            <p className="text-sm text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 mt-3">
              Cel: {plan.goal}
            </p>
          )}
          {plan.updatedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Plan zaktualizowany: {formatDate(plan.updatedAt)}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Dni treningowe</h2>
          {plan.days.length === 0 ? (
            <div className="border border-white/10 px-5 py-10 text-center text-sm text-muted-foreground">
              <Dumbbell className="w-8 h-8 mx-auto mb-3 opacity-30" />
              Trener jeszcze nie dodał ćwiczeń do planu.
            </div>
          ) : (
            plan.days.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => onSelectDay(day)}
                className="w-full text-left border border-white/10 bg-card hover:bg-white/5 hover:border-primary/30 transition-all px-5 py-4 group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{day.dayName ?? `Dzień ${day.dayOrder}`}</span>
                      {day.subtitle && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-white/20 text-muted-foreground">
                          {day.subtitle}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {day.exercises.length} ćwiczeń
                      {day.estimatedDurationMinutes ? ` · ok. ${day.estimatedDurationMinutes} min` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </button>
            ))
          )}
        </div>

        <CardioCard cardio={cardio} />

        <StrengthProgressionCard />

        <HistorySection />
      </div>
    </div>
  );
}

// ─── Main Portal page ─────────────────────────────────────────────────────────

export default function PlanPortal() {
  const { isSignedIn, isLoaded } = useUser();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);

  // Once Clerk confirms the session, fetch the plan from the authenticated endpoint.
  // The route uses req.client.id — no email or clientId query param is needed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setPlanLoading(true);
    setPlanError(null);
    apiFetch<{ client: ClientInfo; plan: Plan }>("/client-portal/plan")
      .then(({ client: c, plan: p }) => {
        setClient(c);
        setPlan(p);
      })
      .catch((err: unknown) => setPlanError((err as Error).message))
      .finally(() => setPlanLoading(false));
  }, [isLoaded, isSignedIn]);

  // Clerk is still initializing.
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in — show Clerk sign-in form.
  if (!isSignedIn) {
    return <SignInGate />;
  }

  // Signed in but plan is still loading.
  if (planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Signed in but no active plan linked to this Clerk account.
  if (planError || !client || !plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-sm">
          <Dumbbell className="w-10 h-10 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-semibold">{planError ?? "Brak aktywnego planu"}</p>
          <p className="text-sm text-muted-foreground">
            Skontaktuj się ze swoim trenerem — musi aktywować Twój plan i powiązać konto z Twoim profilem.
          </p>
          {/* Wrong-login-page recovery: a trainer who signed in through the
              client entry has no linked client account — offer the way back.
              Full page load (separate artifact), deliberately not auto-redirect
              so an unlinked client is never silently sent into the trainer app. */}
          <p className="text-sm text-muted-foreground pt-2">
            Jesteś trenerem?{" "}
            <a
              href="/"
              className="inline-block py-2 font-medium text-primary underline underline-offset-2"
            >
              Przejdź do Panelu Trenera
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (selectedDay) {
    return (
      <SessionView
        day={selectedDay}
        planId={plan.id}
        onBack={() => setSelectedDay(null)}
      />
    );
  }

  return (
    <PlanView
      client={client}
      plan={plan}
      onSelectDay={setSelectedDay}
    />
  );
}
