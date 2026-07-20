import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, ChevronDown, ChevronRight, Dumbbell, Flame, Zap, Activity, Shield, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── API helpers ─────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
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
  days: PlanDay[];
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

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PHASE_ICONS: Record<string, React.ReactNode> = {
  Raise: <Flame className="w-4 h-4 text-orange-400" />,
  Activate: <Zap className="w-4 h-4 text-yellow-400" />,
  Mobilize: <Activity className="w-4 h-4 text-blue-400" />,
  Potentiate: <Shield className="w-4 h-4 text-green-400" />,
};

// ─── EmailGate ────────────────────────────────────────────────────────────────

function EmailGate({ onSuccess }: { onSuccess: (client: ClientInfo, plan: Plan, email: string) => void }) {
  const queryEmail = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "";

  const [email, setEmail] = useState(() => queryEmail || (sessionStorage.getItem("portal_email") ?? ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (emailValue: string) => {
    if (!emailValue) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ client: ClientInfo; plan: Plan }>(`/client-portal/plan?email=${encodeURIComponent(emailValue)}`);
      sessionStorage.setItem("portal_email", emailValue);
      onSuccess(data.client, data.plan, emailValue);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when email is pre-filled via query param
  useEffect(() => {
    if (queryEmail) {
      submit(queryEmail);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Podaj adres e-mail."); return; }
    await submit(trimmed);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-none flex items-center justify-center mx-auto mb-6">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal klienta</h1>
          <p className="text-sm text-muted-foreground">Podaj swój adres e-mail, aby zobaczyć przypisany plan treningowy.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="twój@email.pl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 bg-background/50 border-white/10 focus-visible:border-primary rounded-none text-base"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full h-12 rounded-none font-semibold uppercase tracking-wide">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pokaż mój plan"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── RampWarmup ───────────────────────────────────────────────────────────────

function RampWarmup({ sessionId, clientId }: { sessionId: number; clientId: number }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<RampBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (blocks) { setOpen(!open); return; }
    setLoading(true);
    try {
      const data = await apiFetch<{ dayType: string; blocks: RampBlock[] }>(`/client-portal/sessions/${sessionId}/warmup?clientId=${clientId}`);
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
  clientId,
  initialLog,
  onLogSaved,
}: {
  ex: PlanExercise;
  sessionId: number;
  clientId: number;
  initialLog: ExerciseLog | null;
  onLogSaved: (log: ExerciseLog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [log, setLog] = useState<LogState>({
    setsCompleted: initialLog?.setsCompleted?.toString() ?? "",
    repsCompleted: initialLog?.repsCompleted?.toString() ?? "",
    weightKg: initialLog?.weightKg ?? "",
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
            clientId,
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
  }, [sessionId, clientId, ex.id, onLogSaved]);

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
  clientId,
  planId,
  onBack,
}: {
  day: PlanDay;
  clientId: number;
  planId: number;
  onBack: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Look for existing session today.
        const sessions = await apiFetch<Session[]>(
          `/client-portal/sessions?clientId=${clientId}&planDayId=${day.id}`
        );
        const today = getTodayDate();
        const todaySession = sessions.find((s) => s.sessionDate === today);

        if (todaySession) {
          // Load full session with logs.
          const full = await apiFetch<Session>(`/client-portal/sessions/${todaySession.id}?clientId=${clientId}`);
          setSession(full);
        } else {
          // Create new session for today.
          const created = await apiFetch<Session>("/client-portal/sessions", {
            method: "POST",
            body: JSON.stringify({ clientId, planId, planDayId: day.id, sessionDate: today }),
          });
          setSession({ ...created, logs: [] });
        }
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, planId, day.id]);

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
        body: JSON.stringify({ clientId, isCompleted: !session.isCompleted }),
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
          <div className="border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm font-medium">Trening zakończony! Świetna robota.</p>
          </div>
        )}

        {/* RAMP Warm-up */}
        <RampWarmup sessionId={session.id} clientId={clientId} />

        {/* Exercise list */}
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Ćwiczenia</h2>
          {day.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Brak ćwiczeń w tym dniu.</p>
          ) : (
            day.exercises.map((ex) => (
              <ExerciseLogRow
                key={ex.id}
                ex={ex}
                sessionId={session.id}
                clientId={clientId}
                initialLog={session.logs.find((l) => l.planExerciseId === ex.id) ?? null}
                onLogSaved={handleLogSaved}
              />
            ))
          )}
        </div>

        {/* Complete session button */}
        <div className="pt-4">
          <Button
            onClick={handleComplete}
            disabled={completing}
            variant={session.isCompleted ? "outline" : "default"}
            className="w-full h-12 rounded-none font-semibold uppercase tracking-wide"
          >
            {completing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : session.isCompleted ? (
              <><RotateCcw className="w-4 h-4 mr-2" /> Cofnij zakończenie treningu</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-2" /> Zakończ trening</>
            )}
          </Button>
        </div>
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
      </div>
    </div>
  );
}

// ─── Main Portal page ─────────────────────────────────────────────────────────

export default function PlanPortal() {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);

  // Auto-try with stored email on mount.
  useEffect(() => {
    const storedEmail = sessionStorage.getItem("portal_email");
    if (!storedEmail) return;
    apiFetch<{ client: ClientInfo; plan: Plan }>(`/client-portal/plan?email=${encodeURIComponent(storedEmail)}`)
      .then(({ client: c, plan: p }) => { setClient(c); setPlan(p); })
      .catch(() => sessionStorage.removeItem("portal_email"));
  }, []);

  if (!client || !plan) {
    return (
      <EmailGate
        onSuccess={(c, p, _email) => { setClient(c); setPlan(p); }}
      />
    );
  }

  if (selectedDay) {
    return (
      <SessionView
        day={selectedDay}
        clientId={client.id}
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
