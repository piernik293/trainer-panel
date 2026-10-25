import { useMemo, useState } from "react";
import { ChevronLeft, ListChecks, HelpCircle, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExerciseInfo } from "@/lib/training/types";
import { formatSetResult, formatTarget, parseDecimal, parseIntStrict, startValues, type LoggedSet } from "@/lib/training/logic";
import { activeSetNumber } from "@/lib/training/run";
import { NumberField, RirPicker } from "./TrainingUi";

/** Per-set logging for one exercise: table (Seria / Poprzednio / Dziś / RIR) + editor of the active set. */
export function SetScreen({
  ex, index, total, sets, skipped, onSave, onPrev, onNext, onOpenList, onPain,
}: {
  ex: ExerciseInfo;
  index: number;
  total: number;
  sets: Record<number, LoggedSet> | undefined;
  skipped: boolean;
  onSave: (setNumber: number, value: LoggedSet) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenList: () => void;
  onPain: () => void;
}) {
  const nextNo = activeSetNumber(sets, ex.sets);
  const [editing, setEditing] = useState<number | null>(null);
  const current = editing ?? Math.min(nextNo, ex.sets);
  const allDone = nextNo > ex.sets && editing == null;
  const saved = sets?.[current];
  const init = useMemo(() => saved ?? startValues(ex, current, sets ?? {}), [ex, current, saved, sets]);
  const [draft, setDraft] = useState<{ key: string; v: LoggedSet }>({ key: "", v: init });
  const key = `${ex.planExerciseId}:${current}:${saved ? "s" : "n"}`;
  const v = draft.key === key ? draft.v : init;
  const set = (patch: Partial<LoggedSet>) => setDraft({ key, v: { ...v, ...patch } });
  const [extra, setExtra] = useState(false);

  const save = () => {
    onSave(current, { weightKg: ex.showWeight || extra ? v.weightKg : null, reps: v.reps, rir: v.rir });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={onPrev} disabled={index === 0} className="flex min-h-11 items-center gap-1 text-muted-foreground disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Poprzednie
          </button>
          <span className="font-semibold" aria-live="polite">Ćwiczenie {index + 1} z {total}</span>
          <button type="button" onClick={onOpenList} aria-label="Lista ćwiczeń" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border">
            <ListChecks className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Postęp ćwiczeń">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{ex.name}</h2>
        {ex.howTo && (
          <details className="mt-1">
            <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary"><HelpCircle className="h-4 w-4" aria-hidden /> Jak wykonać</summary>
            <p className="whitespace-pre-line pb-2 text-sm text-foreground/90">{ex.howTo}</p>
          </details>
        )}
        <p className="mt-1 text-sm font-medium text-foreground">{formatTarget(ex)}</p>
        {ex.note && <p className="mt-1 text-sm text-muted-foreground">{ex.note}</p>}
        {ex.record?.weightKg ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Trophy className="h-4 w-4 text-primary" aria-hidden /> Rekord: <b className="text-foreground">{formatSetResult(ex.record, ex.showWeight)}</b>
          </p>
        ) : null}
      </div>

      {skipped && (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium">Pominięte po zgłoszeniu bólu. Trener dostał wiadomość.</p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Serie ćwiczenia {ex.name}</caption>
          <thead>
            <tr className="bg-muted text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-semibold">Seria</th>
              <th scope="col" className="px-2 py-2 font-semibold">Poprzednio</th>
              <th scope="col" className="px-2 py-2 font-semibold">Dziś</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">RIR</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ex.sets }, (_, i) => i + 1).map((n) => {
              const s = sets?.[n];
              const prev = ex.previous.find((p) => p.setNumber === n);
              const active = !allDone && n === current && !skipped;
              return (
                <tr key={n} className={cn("border-t border-border", active && "bg-brand-soft font-semibold")} aria-current={active ? "step" : undefined}>
                  <td className="px-3 py-2.5">{n}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{prev ? formatSetResult(prev, ex.showWeight) : "–"}</td>
                  <td className="px-2 py-2.5">
                    {s && !s.skipped ? (
                      <button type="button" onClick={() => setEditing(n)} className="min-h-9 text-left underline decoration-dotted underline-offset-4" aria-label={`Popraw serię ${n}: ${formatSetResult(s, ex.showWeight)}`}>
                        {formatSetResult(s, ex.showWeight)}
                      </button>
                    ) : s?.skipped ? "pominięta" : "–"}
                  </td>
                  <td className="px-3 py-2.5 text-right">{s && !s.skipped && s.rir != null ? (s.rir === 4 ? "4+" : s.rir) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!skipped && !allDone && (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-card p-3">
          <p className="text-sm font-bold">{editing ? `Popraw serię ${current}` : `Seria ${current} z ${ex.sets}`}</p>
          {ex.showWeight ? (
            <NumberField label="Ciężar" unit="kg" decimal step={ex.weightStepKg ?? 2.5} value={v.weightKg} onChange={(w) => set({ weightKg: w })} parse={parseDecimal} format={(n) => (n == null ? "" : String(n).replace(".", ","))} />
          ) : extra ? (
            <NumberField label="Dodatkowe obciążenie" unit="kg" decimal step={1} value={v.weightKg} onChange={(w) => set({ weightKg: w })} parse={parseDecimal} format={(n) => (n == null ? "" : String(n).replace(".", ","))} />
          ) : (
            <button type="button" onClick={() => setExtra(true)} className="min-h-11 text-sm font-semibold text-primary">+ Dodatkowe obciążenie (opcjonalnie)</button>
          )}
          <NumberField label="Powtórzenia" decimal={false} step={1} value={v.reps} onChange={(r) => set({ reps: r })} parse={parseIntStrict} format={(n) => (n == null ? "" : String(n))} />
          <RirPicker value={v.rir} onChange={(r) => set({ rir: r })} />
          <button type="button" onClick={save} disabled={v.reps == null} className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50">
            {editing ? "Zapisz zmianę" : "Zapisz serię"}
          </button>
          {editing && <button type="button" onClick={() => setEditing(null)} className="h-11 w-full text-sm font-semibold text-muted-foreground">Anuluj poprawkę</button>}
        </div>
      )}

      {(allDone || skipped) && (
        <button type="button" onClick={onNext} className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground">
          {index + 1 >= total ? "Przejdź do podsumowania" : "Następne ćwiczenie"}
        </button>
      )}

      {!skipped && (
        <button type="button" onClick={onPain} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Coś boli? Zgłoś trenerowi
        </button>
      )}
      <p className="text-center text-xs text-muted-foreground">Przerwa jest tylko wskazówką — bez minutnika.</p>
    </div>
  );
}
