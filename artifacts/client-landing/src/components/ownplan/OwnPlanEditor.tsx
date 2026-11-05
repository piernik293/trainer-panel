import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { emptyPlan, fromImport, fromServer, move, newExercise, toPayload, validate, LIMITS, type AnalyzedDay, type EdDay, type EdExercise, type EdPlan } from "@/lib/ownplan/model";

interface SearchHit { id: number; name: string; muscleGroup: string | null; warning: string | null }
const j = async <T,>(r: Response): Promise<T | null> => (r.ok ? ((await r.json().catch(() => null)) as T) : null);
const fileToBase64 = (f: File) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] ?? ""); fr.onerror = () => rej(fr.error); fr.readAsDataURL(f); });

const field = "h-11 w-full rounded-lg border border-input bg-background px-2 text-base tabular-nums";
const iconBtn = "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card disabled:opacity-30";

/** Wyszukiwarka ćwiczeń: katalog + „dodaj własne”. */
function AddExercise({ onPick, onCustom, onClose }: { onPick: (h: SearchHit) => void; onCustom: (name: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let alive = true; setBusy(true);
    const t = setTimeout(() => {
      void fetch(`/api/own-plan/search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" })
        .then((r) => j<{ results: SearchHit[] }>(r)).then((b) => { if (alive) { setHits(b?.results ?? []); setBusy(false); } }).catch(() => { if (alive) setBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Dodaj ćwiczenie" className="fixed inset-0 z-[70] flex flex-col bg-background" data-testid="add-exercise">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj ćwiczenia, np. przysiad" aria-label="Szukaj ćwiczenia" className="h-11 min-w-0 grow bg-transparent text-base outline-none" />
        <button type="button" onClick={onClose} aria-label="Zamknij" className={iconBtn}><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <ul className="grow divide-y divide-border overflow-y-auto">
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => onPick(h)} className="flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left" data-testid="hit">
              <span className="font-semibold">{h.name}</span>
              <span className="text-xs text-muted-foreground">{h.muscleGroup ?? ""}</span>
              {h.warning && <span className="mt-1 text-xs text-warning">{h.warning}</span>}
            </button>
          </li>
        ))}
        {!busy && q.trim().length >= 2 && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nie ma takiego ćwiczenia w katalogu.</li>}
        {q.trim().length >= 2 && (
          <li><button type="button" onClick={() => onCustom(q.trim())} className="flex min-h-14 w-full items-center gap-2 px-4 text-left font-semibold text-primary" data-testid="custom-add"><Plus className="h-4 w-4" aria-hidden /> Dodaj własne: „{q.trim()}”</button></li>
        )}
      </ul>
    </div>
  );
}

function ExerciseRow({ e, first, last, onChange, onMove, onRemove }: { e: EdExercise; first: boolean; last: boolean; onChange: (p: Partial<EdExercise>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const num = (v: string): number | null => { const n = Number(v.replace(",", ".")); return v.trim() === "" || !Number.isFinite(n) ? null : n; };
  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-3" data-testid="ex-row">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold leading-tight">{e.name}{(e.custom || e.exerciseId == null) && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">własne</span>}</p>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Przesuń wyżej: ${e.name}`} className={iconBtn}><ArrowUp className="h-4 w-4" aria-hidden /></button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Przesuń niżej: ${e.name}`} className={iconBtn}><ArrowDown className="h-4 w-4" aria-hidden /></button>
          <button type="button" onClick={onRemove} aria-label={`Usuń: ${e.name}`} className={iconBtn}><Trash2 className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      {e.warning && <p role="note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm" data-testid="ex-warning">{e.warning}</p>}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-semibold text-muted-foreground">Serie<input inputMode="numeric" className={field} value={e.sets} onChange={(ev) => onChange({ sets: Math.round(num(ev.target.value) ?? 0) })} aria-label={`Serie: ${e.name}`} /></label>
        <label className="text-xs font-semibold text-muted-foreground">Powt. od<input inputMode="numeric" className={field} value={e.repMin} onChange={(ev) => { const v = Math.round(num(ev.target.value) ?? 0); onChange({ repMin: v, repMax: Math.max(v, e.repMax) }); }} aria-label={`Powtórzenia od: ${e.name}`} /></label>
        <label className="text-xs font-semibold text-muted-foreground">do<input inputMode="numeric" className={field} value={e.repMax} onChange={(ev) => onChange({ repMax: Math.round(num(ev.target.value) ?? 0) })} aria-label={`Powtórzenia do: ${e.name}`} /></label>
        <label className="text-xs font-semibold text-muted-foreground">Ciężar kg<input inputMode="decimal" className={field} value={e.weightKg ?? ""} onChange={(ev) => onChange({ weightKg: num(ev.target.value) })} aria-label={`Ciężar: ${e.name}`} /></label>
        <label className="text-xs font-semibold text-muted-foreground">RIR (0–4)<input inputMode="numeric" className={field} value={e.rir ?? ""} onChange={(ev) => { const n = num(ev.target.value); onChange({ rir: n == null ? null : Math.min(4, Math.max(0, Math.round(n))) }); }} aria-label={`RIR: ${e.name}`} /></label>
        <label className="text-xs font-semibold text-muted-foreground">Przerwa s<input inputMode="numeric" className={field} value={e.restSeconds ?? ""} onChange={(ev) => { const n = num(ev.target.value); onChange({ restSeconds: n == null ? null : Math.min(600, Math.max(0, Math.round(n))) }); }} aria-label={`Przerwa: ${e.name}`} /></label>
      </div>
      <input className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" value={e.note} maxLength={300} placeholder="Notatka (opcjonalnie)" onChange={(ev) => onChange({ note: ev.target.value })} aria-label={`Notatka: ${e.name}`} />
    </li>
  );
}

/**
 * Edytor własnego planu (Solo): dni → ćwiczenia (wyszukiwarka z katalogu albo „własne”) → serie × powtórzenia, ciężar, RIR, przerwa, notatka;
 * zmiana kolejności i usuwanie; wczytanie z pliku Excel/CSV. Nic nie jest blokowane — przy ćwiczeniu na zgłoszony staw jest spokojne ostrzeżenie.
 */
export function OwnPlanEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<EdPlan | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/own-plan", { credentials: "include" }).then((r) => j<{ plan: Parameters<typeof fromServer>[0] }>(r)).then((b) => { if (alive) setPlan(fromServer(b?.plan ?? null)); }).catch(() => { if (alive) setPlan(emptyPlan()); });
    return () => { alive = false; };
  }, []);
  if (!plan) return <div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-background text-muted-foreground">Wczytuję plan…</div>;

  const setDay = (di: number, patch: Partial<EdDay>) => setPlan({ ...plan, days: plan.days.map((d, i) => (i === di ? { ...d, ...patch } : d)) });
  const setEx = (di: number, ei: number, patch: Partial<EdExercise>) => setDay(di, { exercises: plan.days[di]!.exercises.map((e, i) => (i === ei ? { ...e, ...patch } : e)) });
  const addEx = (di: number, e: EdExercise) => { setDay(di, { exercises: [...plan.days[di]!.exercises, e] }); setAdding(null); };
  const problem = validate(plan);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/own-plan", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(plan)) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; warnings?: { message: string; name: string }[] };
      if (!r.ok) { setError(typeof b.error === "string" ? b.error : "Nie udało się zapisać planu. Spróbuj ponownie."); setSaving(false); return; }
      if (b.warnings?.length) { setNotes(b.warnings.map((w) => `${w.name}: ${w.message}`)); setSaving(false); onSaved(); return; }
      onSaved(); onClose();
    } catch { setError("Brak połączenia. Spróbuj ponownie."); setSaving(false); }
  };

  const importFile = async (f: File) => {
    setError(null); setInfo(null);
    try {
      const contentBase64 = await fileToBase64(f);
      const pre = await fetch("/api/own-plan/import/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: f.name, contentBase64 }) });
      const p = (await pre.json().catch(() => ({}))) as { error?: string; mapping?: unknown; hasHeader?: boolean };
      if (!pre.ok) { setError(p.error ?? "Nie udało się odczytać pliku."); return; }
      const an = await fetch("/api/own-plan/import/analyze", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: f.name, contentBase64, mapping: p.mapping, hasHeader: p.hasHeader }) });
      const a = (await an.json().catch(() => ({}))) as { error?: string; days?: AnalyzedDay[] };
      if (!an.ok || !a.days?.length) { setError(a.error ?? "Nie rozpoznano ćwiczeń w pliku. Użyj szablonu poniżej."); return; }
      setPlan({ ...plan, days: fromImport(a.days) });
      setInfo("Wczytano plan z pliku. Sprawdź ćwiczenia (te bez dopasowania są oznaczone jako „własne”) i zapisz.");
    } catch { setError("Nie udało się wczytać pliku."); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Mój własny plan" className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground" data-testid="own-plan-editor">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-lg font-extrabold">Mój własny plan</h2>
        <button type="button" onClick={onClose} aria-label="Zamknij edytor" className={iconBtn}><X className="h-5 w-5" aria-hidden /></button>
      </header>
      <div className="grow space-y-4 overflow-y-auto px-4 pb-28 pt-4">
        <label className="block text-xs font-semibold text-muted-foreground">Nazwa planu<input className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base" value={plan.title} maxLength={80} onChange={(e) => setPlan({ ...plan, title: e.target.value })} aria-label="Nazwa planu" /></label>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={file} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Plik z planem" data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <button type="button" onClick={() => file.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><FileUp className="h-4 w-4" aria-hidden /> Wczytaj z pliku (Excel, CSV)</button>
          <a href="/api/own-plan/template.csv" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Szablon pliku</a>
        </div>
        {info && <p role="status" className="rounded-lg bg-brand-soft px-3 py-2 text-sm" data-testid="import-info">{info}</p>}
        {plan.days.map((d, di) => (
          <section key={di} aria-label={`Dzień ${di + 1}`} className="space-y-2" data-testid="day">
            <div className="flex items-center gap-2">
              <input className="h-11 min-w-0 grow rounded-lg border border-input bg-background px-3 text-base font-bold" value={d.name} maxLength={60} onChange={(e) => setDay(di, { name: e.target.value })} aria-label={`Nazwa dnia ${di + 1}`} />
              <button type="button" onClick={() => setPlan({ ...plan, days: move(plan.days, di, di - 1) })} disabled={di === 0} aria-label={`Przesuń dzień ${di + 1} wyżej`} className={iconBtn}><ArrowUp className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={() => setPlan({ ...plan, days: move(plan.days, di, di + 1) })} disabled={di === plan.days.length - 1} aria-label={`Przesuń dzień ${di + 1} niżej`} className={iconBtn}><ArrowDown className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={() => setPlan({ ...plan, days: plan.days.filter((_, i) => i !== di) })} disabled={plan.days.length === 1} aria-label={`Usuń dzień ${di + 1}`} className={iconBtn}><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>
            <ul className="space-y-2">
              {d.exercises.map((e, ei) => (
                <ExerciseRow key={`${e.id ?? "n"}-${ei}-${e.name}`} e={e} first={ei === 0} last={ei === d.exercises.length - 1}
                  onChange={(p) => setEx(di, ei, p)} onMove={(dir) => setDay(di, { exercises: move(d.exercises, ei, ei + dir) })} onRemove={() => setDay(di, { exercises: d.exercises.filter((_, i) => i !== ei) })} />
              ))}
            </ul>
            <button type="button" disabled={d.exercises.length >= LIMITS.exercisesPerDay} onClick={() => setAdding(di)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border font-semibold text-primary disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden /> Dodaj ćwiczenie</button>
          </section>
        ))}
        <button type="button" disabled={plan.days.length >= LIMITS.days} onClick={() => setPlan({ ...plan, days: [...plan.days, { name: `Dzień ${plan.days.length + 1}`, exercises: [] }] })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border font-semibold disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden /> Dodaj dzień</button>
        {notes.length > 0 && (
          <section role="note" className="space-y-1 rounded-xl border border-border bg-card p-3" data-testid="save-notes">
            <p className="font-bold">Plan zapisany. Zwróć uwagę:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <button type="button" onClick={onClose} className="mt-2 min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground">Rozumiem</button>
          </section>
        )}
      </div>
      <footer className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-3 backdrop-blur" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {(error || problem) && <p role="alert" className={cn("mb-2 text-sm", problem ? "text-muted-foreground" : "text-destructive")}>{problem ?? error}</p>}
        <button type="button" onClick={() => void save()} disabled={!!problem || saving || notes.length > 0} className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50">{saving ? "Zapisuję…" : "Zapisz plan"}</button>
      </footer>
      {adding != null && <AddExercise onClose={() => setAdding(null)} onPick={(h) => addEx(adding, newExercise({ id: h.id, name: h.name, warning: h.warning }))} onCustom={(name) => addEx(adding, newExercise({ customName: name }))} />}
    </div>
  );
}

/** Wejście: karta „Mam własny plan” (tylko osoba bez trenera i tylko z flagą OWN_PLAN_ENABLED) + edytor. */
export function OwnPlanEntry({ onSaved, compact = false }: { onSaved: () => void; compact?: boolean }) {
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/own-plan/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/account/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, a]: [{ enabled?: boolean } | null, { linked?: boolean } | null]) => { if (alive) setOk(s?.enabled === true && !!a && a.linked === false); });
    return () => { alive = false; };
  }, []);
  if (!ok) return null;
  return (
    <>
      {compact
        ? <button type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-xl border border-border bg-background text-base font-semibold" data-testid="own-plan-entry">Mam własny plan</button>
        : (
          <section className="space-y-2 rounded-lg border border-border bg-card p-4" data-testid="own-plan-card">
            <p className="font-semibold">Masz już swój plan?</p>
            <p className="text-sm text-muted-foreground">Wpisz go albo wczytaj z pliku Excel lub CSV — zostanie taki, jaki jest, i dalej możesz go zmieniać.</p>
            <button type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-xl border border-border bg-background text-base font-semibold" data-testid="own-plan-entry">Mam własny plan</button>
          </section>
        )}
      {open && <OwnPlanEditor onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}
