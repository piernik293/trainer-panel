import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Footprints, Loader2 } from "lucide-react";
import { cacheSummary, fetchSummary, readCachedSummary, saveGoal, stepsQueue, type StepsSummary } from "@/lib/steps/sync";

const PRESET_GOALS = [6000, 8000, 10000];
const nf = (n: number) => n.toLocaleString("pl-PL");
const WEEKDAY = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00`).getDay()]!;

/** Parses the typed value: digits only, 0–100000; null when not valid. */
export function parseSteps(raw: string): number | null {
  const t = raw.replace(/[\s ]/g, "");
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 100_000 ? n : null;
}

/** "Kroki dziś" — manual entry, goal bar, 7 days and the weekly average. Works offline (queue like the workout sets). */
export function StepsTile({ compact = false }: { compact?: boolean } = {}) {
  const q = stepsQueue();
  const pending = useSyncExternalStore((cb) => q.subscribe(cb), () => q.count());
  const [data, setData] = useState<StepsSummary | null>(() => readCachedSummary());
  const [state, setState] = useState<"loading" | "ok" | "none">(data ? "ok" : "loading");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);

  const load = useCallback(async () => {
    try { const s = await fetchSummary(); cacheSummary(s); setData(s); setState("ok"); }
    catch (e) { if ((e as { status?: number }).status === 404) setState("none"); else setState((p) => (p === "loading" ? "none" : p)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // After the queue empties, fetch the confirmed numbers.
  useEffect(() => { if (pending === 0) void load(); }, [pending, load]);

  if (state === "loading") return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Ładowanie" /></div>;
  if (state === "none" || !data) return null;

  const todayPending = q.peek(data.today);
  const shown = todayPending ?? data.todaySteps;
  const pct = data.goal && shown !== null ? Math.min(100, Math.round((shown / data.goal) * 100)) : null;
  const maxBar = Math.max(1, data.goal ?? 0, ...data.days.map((d) => d.steps ?? 0));

  function submit() {
    const n = parseSteps(value);
    if (n === null) { setError("Wpisz liczbę kroków od 0 do 100 000."); return; }
    setError(null); setValue("");
    q.set(data!.today, n);
    setData((d) => d && { ...d, todaySteps: n, days: d.days.map((x) => (x.date === d.today ? { ...x, steps: n } : x)) });
    void q.flush();
  }
  async function pickGoal(goal: number | null) {
    try { const s = await saveGoal(goal); cacheSummary(s); setData(s); setEditingGoal(false); } catch { setError("Nie udało się zapisać celu. Spróbuj, gdy wróci sieć."); }
  }

  // "Dziś" (new shell): just a small row with the entry field; the 7-day chart, average and goal live in "Postępy".
  if (compact) {
    return (
      <section aria-label="Kroki dziś" data-testid="steps-tile" className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Footprints className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Kroki dziś</p>
          <p className="ml-auto text-lg font-bold tabular-nums" data-testid="steps-today">{shown === null ? "—" : nf(shown)}{data.goal ? <span className="ml-1 text-sm font-medium text-muted-foreground">/ {nf(data.goal)}</span> : null}</p>
        </div>
        {pending > 0 && <p className="mt-1 text-xs text-muted-foreground" data-testid="steps-pending">Zapisane w telefonie — wyślę po odzyskaniu sieci</p>}
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)}
            aria-label="Liczba kroków" placeholder="Wpisz kroki, np. 7500" data-testid="steps-input"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
          />
          <button type="submit" className="h-11 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground">Zapisz</button>
        </form>
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-label="Kroki dziś" data-testid="steps-tile" className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground"><Footprints className="h-4 w-4 text-primary" aria-hidden /> Kroki dziś</p>
        {pending > 0 && <span className="text-xs text-muted-foreground" data-testid="steps-pending">Zapisane w telefonie — wyślę po odzyskaniu sieci</span>}
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums" data-testid="steps-today">{shown === null ? "—" : nf(shown)}{data.goal ? <span className="ml-2 text-base font-medium text-muted-foreground">/ {nf(data.goal)}</span> : null}</p>
      {pct !== null && (
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp do celu kroków">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-sm text-muted-foreground">Wpisz kroki z telefonu lub zegarka.</p>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)}
          aria-label="Liczba kroków" placeholder="np. 7500" data-testid="steps-input"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
        />
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground">Zapisz</button>
      </form>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex items-end gap-1.5" aria-label="Kroki z ostatnich 7 dni" data-testid="steps-week">
        {data.days.map((d) => {
          const steps = q.peek(d.date) ?? d.steps;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end"><div className={`w-full rounded-t ${d.date === data.today ? "bg-primary" : "bg-primary/40"}`} style={{ height: steps ? `${Math.max(4, Math.round((steps / maxBar) * 100))}%` : "2px" }} title={steps === null ? "brak wpisu" : `${nf(steps)} kroków`} /></div>
              <span className="text-[11px] text-muted-foreground">{weekday(d.date)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-sm" data-testid="steps-average">
        {data.average === null ? "Średnia tygodnia pojawi się po pierwszym wpisie." : <>Średnia tygodnia: <b>{nf(data.average)}</b> kroków dziennie{data.daysAtGoal !== null ? ` · cel osiągnięty w ${data.daysAtGoal} z 7 dni` : ""}.</>}
      </p>

      <div className="mt-3">
        {!editingGoal ? (
          <button type="button" className="text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => setEditingGoal(true)}>{data.goal ? "Zmień cel" : "Ustaw cel kroków"}</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="steps-goal-picker">
            {PRESET_GOALS.map((g) => <button key={g} type="button" onClick={() => void pickGoal(g)} className={`h-10 rounded-lg border px-3 text-sm font-semibold ${data.goal === g ? "border-primary bg-brand-soft" : "border-border"}`}>{nf(g)}</button>)}
            {data.goal && <button type="button" onClick={() => void pickGoal(null)} className="h-10 rounded-lg border border-border px-3 text-sm">Bez celu</button>}
            <button type="button" onClick={() => setEditingGoal(false)} className="h-10 px-2 text-sm text-muted-foreground">Anuluj</button>
          </div>
        )}
      </div>
    </section>
  );
}
