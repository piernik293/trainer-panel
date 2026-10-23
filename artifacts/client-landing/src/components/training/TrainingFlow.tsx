import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RATING_LABELS, type Rating, type RampItem, type TrainingDay } from "@/lib/training/types";
import { countDoneSets, loadRun, newRun, runReducer, saveRun, clearRun, type RunState, type Stage } from "@/lib/training/run";
import { recordGain } from "@/lib/training/logic";
import { trainingQueue } from "@/lib/training/sync";
import { SetScreen } from "./SetScreen";
import { PainSheet, type PainInput } from "./PainSheet";
import { MediaPlaceholder, SyncBadge } from "./TrainingUi";

const newUuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`.padEnd(36, "0").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5"));

const STAGES: { id: Stage; label: string }[] = [
  { id: "warmup", label: "Rozgrzewka" },
  { id: "exercises", label: "Ćwiczenia" },
  { id: "cooldown", label: "Schłodzenie" },
];

function StageBar({ stage }: { stage: Stage }) {
  const idx = stage === "finish" || stage === "done" ? 3 : STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex gap-1.5" aria-label="Etapy treningu">
      {STAGES.map((s, i) => (
        <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex-1">
          <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
          <span className={cn("mt-1 block text-center text-[11px] font-semibold uppercase tracking-[0.04em]", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Warm-up / cool-down: one item at a time, amount shown as information (no timer). */
function StepScreen({ title, items, index, nextLabel, onSkip, onNext }: {
  title: string; items: RampItem[]; index: number; nextLabel: string; onSkip: () => void; onNext: () => void;
}) {
  const it = items[index]!;
  const upcoming = items[index + 1]?.name ?? nextLabel;
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-muted-foreground">{title} · {index + 1} z {items.length}</p>
      <MediaPlaceholder label="Animacja pojawi się tutaj" />
      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{it.name}</h2>
        <p className="mt-1 text-sm text-foreground/90">{it.description}</p>
        <p className="mt-3 inline-block rounded-lg bg-brand-soft px-3 py-2 text-lg font-bold text-primary">{it.detail}</p>
      </div>
      <p className="text-sm text-muted-foreground">Następne: <b className="text-foreground">{upcoming}</b></p>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <button type="button" onClick={onSkip} className="h-14 rounded-xl border border-border bg-card font-semibold">Pomiń</button>
        <button type="button" onClick={onNext} className="h-14 rounded-xl bg-primary text-base font-bold text-primary-foreground">Dalej</button>
      </div>
    </div>
  );
}

function ExerciseList({ day, run, onPick, onClose }: { day: TrainingDay; run: RunState; onPick: (i: number) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Lista ćwiczeń" onClick={(e) => e.stopPropagation()} className="mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 pb-6">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">Ćwiczenia</h2>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="flex h-11 w-11 items-center justify-center"><X className="h-5 w-5" aria-hidden /></button></div>
        <ol className="divide-y divide-border">
          {day.exercises.map((e, i) => {
            const done = Object.values(run.sets[e.planExerciseId] ?? {}).filter((s) => !s.skipped).length;
            return (
              <li key={e.planExerciseId}>
                <button type="button" onClick={() => onPick(i)} className={cn("flex min-h-12 w-full items-center gap-3 py-2 text-left", i === run.exerciseIndex && "font-bold")}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                  <span className="flex-1">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{run.skippedExercises.includes(e.planExerciseId) ? "pominięte" : `${done}/${e.sets}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

interface Summary { minutes: number; sets: number; weekDone: number; weekTarget: number; records: { name: string; weightKg: number; reps: number; gainKg: number }[] }

function summarize(day: TrainingDay, run: RunState, week: { done: number; target: number }, end: Date): Summary {
  const minutes = Math.max(1, Math.round((end.getTime() - new Date(run.startedAt).getTime()) / 60000));
  const records: Summary["records"] = [];
  for (const ex of day.exercises) {
    let top: Summary["records"][number] | null = null;
    for (const s of Object.values(run.sets[ex.planExerciseId] ?? {})) {
      if (s.skipped) continue;
      const gain = recordGain(ex.history, s);
      if (gain != null && (!top || gain > top.gainKg)) top = { name: ex.name, weightKg: s.weightKg!, reps: s.reps!, gainKg: gain };
    }
    if (top) records.push(top);
  }
  return { minutes, sets: countDoneSets(run), weekDone: week.done + 1, weekTarget: week.target, records };
}

function FinishScreen({ firstName, day, run, week, onFeedback, onFinish }: {
  firstName: string; day: TrainingDay; run: RunState; week: { done: number; target: number };
  onFeedback: (rating: Rating | null, note: string) => void; onFinish: () => void;
}) {
  const sum = useMemo(() => summarize(day, run, week, new Date()), [day, run, week]);
  const [rating, setRating] = useState<Rating | null>(run.rating);
  const [note, setNote] = useState(run.note);
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  return (
    <div className="space-y-5">
      <div className="text-center">
        {/* Mascot slot: a victory gesture will go here (later). */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-border bg-muted text-xs text-muted-foreground" aria-hidden>maskotka</div>
        <h2 ref={h} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none">Trening ukończony</h2>
        <p className="text-muted-foreground">Dobra robota{firstName ? `, ${firstName}` : ""}!</p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[[`${sum.minutes}`, "minut"], [`${sum.sets}`, "serii"], [`${sum.weekDone} z ${sum.weekTarget}`, "w tym tygodniu"]].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-border bg-card px-2 py-3"><dd className="text-xl font-bold tabular-nums">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
        ))}
      </dl>
      {sum.records.length > 0 && (
        <section aria-label="Nowy rekord" className="rounded-xl border border-primary/40 bg-brand-soft p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-primary"><Trophy className="h-4 w-4" aria-hidden /> Nowy rekord</p>
          <ul className="mt-1 space-y-1 text-sm">
            {sum.records.map((r) => (
              <li key={r.name}><b>{r.name}</b>: {String(r.weightKg).replace(".", ",")} kg × {r.reps} <span className="text-muted-foreground">(+{String(r.gainKg).replace(".", ",")} kg)</span></li>
            ))}
          </ul>
        </section>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Jak było?</legend>
        <div role="radiogroup" aria-label="Jak było?" className="grid grid-cols-3 gap-2">
          {(Object.keys(RATING_LABELS) as Rating[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={rating === r} onClick={() => { const v = rating === r ? null : r; setRating(v); onFeedback(v, note); }}
              className={cn("min-h-12 rounded-lg border text-sm font-semibold", rating === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
              {RATING_LABELS[r]}
            </button>
          ))}
        </div>
        <label htmlFor="session-note" className="mb-1 mt-3 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Notatka dla trenera (opcjonalnie)</label>
        <textarea id="session-note" rows={3} maxLength={1000} value={note} onChange={(e) => { setNote(e.target.value); onFeedback(rating, e.target.value); }} className="w-full rounded-lg border border-input bg-background p-3 text-base" />
      </fieldset>
      <button type="button" onClick={onFinish} className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground">Zakończ</button>
    </div>
  );
}

export function TrainingFlow({ day, firstName, week, onExit }: {
  day: TrainingDay; firstName: string; week: { done: number; target: number }; onExit: (finished: boolean) => void;
}) {
  const queue = trainingQueue();
  const [run, dispatch] = useReducer(runReducer, undefined, () => {
    const saved = loadRun(day.planDayId);
    if (saved && saved.stage !== "done") return saved;
    const fresh = newRun(day, newUuid());
    queue.enqueue({ id: fresh.sessionUuid, kind: "start", sessionUuid: fresh.sessionUuid, body: { clientUuid: fresh.sessionUuid, planDayId: day.planDayId } });
    return fresh;
  });
  useEffect(() => { saveRun(run); void queue.flush(); }, [run, queue]);
  const [list, setList] = useState(false);
  const [pain, setPain] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => { topRef.current?.scrollIntoView({ block: "start" }); }, [run.stage, run.exerciseIndex, run.warmupIndex, run.cooldownIndex]);

  const ex = day.exercises[run.exerciseIndex];
  const dayOf = useCallback((a: Parameters<typeof dispatch>[0]) => dispatch(a), []);

  const saveSet = (planExerciseId: number, setNumber: number, value: { weightKg: number | null; reps: number | null; rir: number | null }) => {
    dayOf({ type: "saveSet", planExerciseId, setNumber, value });
    const id = newUuid();
    queue.enqueue({ id, kind: "set", sessionUuid: run.sessionUuid, slot: `${planExerciseId}:${setNumber}`,
      body: { clientUuid: id, planExerciseId, setNumber, weightKg: value.weightKg, reps: value.reps, rir: value.rir, skipped: false } });
  };

  const submitPain = (p: PainInput) => {
    if (!ex) return;
    const id = newUuid();
    queue.enqueue({ id, kind: "pain", sessionUuid: run.sessionUuid, body: { clientUuid: id, planExerciseId: ex.planExerciseId, area: p.area, severity: p.severity, description: p.description || null } });
    dayOf({ type: "skipExercise", planExerciseId: ex.planExerciseId });
    for (let n = 1; n <= ex.sets; n++) if (!run.sets[ex.planExerciseId]?.[n]) dayOf({ type: "saveSet", planExerciseId: ex.planExerciseId, setNumber: n, value: { weightKg: null, reps: null, rir: null, skipped: true } });
    setPain(false);
    dayOf({ type: "nextExercise", total: day.exercises.length });
  };

  const finish = (status: "completed" | "aborted") => {
    const endedAt = new Date().toISOString();
    const id = newUuid();
    queue.enqueue({ id, kind: "finish", sessionUuid: run.sessionUuid, body: { status, rating: run.rating, note: run.note || null, endedAt } });
    dayOf({ type: "end", at: endedAt });
    clearRun(day.planDayId);
    onExit(status === "completed");
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-10 text-foreground">
      <div ref={topRef} />
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between pb-2">
          <button type="button" onClick={() => onExit(false)} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Wyjdź (trening zostaje zapisany)
          </button>
        </div>
        <div className="mx-auto max-w-lg space-y-2"><StageBar stage={run.stage} /><div className="min-h-6"><SyncBadge /></div></div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-4">
        {run.stage === "warmup" && day.warmup.length > 0 && (
          <StepScreen title="Rozgrzewka" items={day.warmup} index={Math.min(run.warmupIndex, day.warmup.length - 1)} nextLabel="Pierwsze ćwiczenie"
            onSkip={() => dayOf({ type: "warmupNext", total: day.warmup.length })} onNext={() => dayOf({ type: "warmupNext", total: day.warmup.length })} />
        )}
        {run.stage === "warmup" && day.warmup.length === 0 && (
          <button type="button" onClick={() => dayOf({ type: "stage", stage: "exercises" })} className="h-14 w-full rounded-xl bg-primary font-bold text-primary-foreground">Zacznij ćwiczenia</button>
        )}
        {run.stage === "exercises" && ex && (
          <SetScreen key={ex.planExerciseId} ex={ex} index={run.exerciseIndex} total={day.exercises.length}
            sets={run.sets[ex.planExerciseId]} skipped={run.skippedExercises.includes(ex.planExerciseId)}
            onSave={(n, v) => saveSet(ex.planExerciseId, n, v)}
            onPrev={() => dayOf({ type: "prevExercise" })} onNext={() => dayOf({ type: "nextExercise", total: day.exercises.length })}
            onOpenList={() => setList(true)} onPain={() => setPain(true)} />
        )}
        {run.stage === "cooldown" && day.cooldown.length > 0 && (
          <StepScreen title="Schłodzenie" items={day.cooldown} index={Math.min(run.cooldownIndex, day.cooldown.length - 1)} nextLabel="Podsumowanie"
            onSkip={() => dayOf({ type: "cooldownNext", total: day.cooldown.length })} onNext={() => dayOf({ type: "cooldownNext", total: day.cooldown.length })} />
        )}
        {run.stage === "cooldown" && day.cooldown.length === 0 && (
          <button type="button" onClick={() => dayOf({ type: "stage", stage: "finish" })} className="h-14 w-full rounded-xl bg-primary font-bold text-primary-foreground">Przejdź do podsumowania</button>
        )}
        {run.stage === "finish" && (
          <FinishScreen firstName={firstName} day={day} run={run} week={week} onFeedback={(rating, note) => dayOf({ type: "feedback", rating, note })} onFinish={() => finish("completed")} />
        )}
        {run.stage !== "finish" && (
          <p className="mt-6 text-center">
            <button type="button" onClick={() => { if (window.confirm("Zakończyć trening teraz? Zapisane serie zostaną u trenera.")) finish("aborted"); }}
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4">Zakończ trening wcześniej</button>
          </p>
        )}
      </main>

      {list && <ExerciseList day={day} run={run} onClose={() => setList(false)} onPick={(i) => { dayOf({ type: "goToExercise", index: i }); setList(false); }} />}
      {pain && ex && <PainSheet exerciseName={ex.name} onCancel={() => setPain(false)} onSubmit={submitPain} />}
    </div>
  );
}
