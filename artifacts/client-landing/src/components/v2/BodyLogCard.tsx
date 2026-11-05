/** „Masa i obwody” w Postępach (BODY_LOG_ENABLED): szybki wpis i prosty wykres. Bez ocen, celów i „normy” — tylko Twoje liczby. */
import { useCallback, useEffect, useState } from "react";

interface Entry { id: number; measuredOn: string; weightKg: number | null; waistCm: number | null; hipsCm: number | null; chestCm: number | null; armCm: number | null; thighCm: number | null }
const EXTRA = [["waistCm", "Talia"], ["hipsCm", "Biodra"], ["chestCm", "Klatka"], ["armCm", "Ramię"], ["thighCm", "Udo"]] as const;
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
const toNum = (s: string): number | null => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) ? n : null; };

/** Wykres masy: linia po punktach, skala dopasowana do danych (bez linii „celu”). */
export function WeightChart({ points }: { points: { day: string; v: number }[] }) {
  if (points.length < 2) return null;
  const W = 300, H = 90, P = 8;
  const vs = points.map((p) => p.v); const min = Math.min(...vs), max = Math.max(...vs); const span = max - min || 1;
  const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((p.v - min) / span) * (H - 2 * P)] as const);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`Wykres masy ciała: od ${points[0]!.v} do ${points[points.length - 1]!.v} kg`} data-testid="weight-chart">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-primary" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" className="fill-primary" />)}
    </svg>
  );
}

export function BodyLogCard() {
  const [on, setOn] = useState(false);
  const [items, setItems] = useState<Entry[]>([]);
  const [weight, setWeight] = useState("");
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/client-portal/body", { credentials: "include" }); if (r.ok) setItems(((await r.json()) as { items: Entry[] }).items); } catch { /* bez listy */ }
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const st = await fetch("/api/body-log/status", { credentials: "include" });
        if (!st.ok || ((await st.json()) as { enabled?: boolean }).enabled !== true) return;
        if (alive) { setOn(true); await load(); }
      } catch { /* bez karty */ }
    })();
    return () => { alive = false; };
  }, [load]);
  if (!on) return null;

  const save = async () => {
    const body: Record<string, number> = {};
    const w = toNum(weight); if (w != null) body["weightKg"] = w;
    for (const [k] of EXTRA) { const v = toNum(extra[k] ?? ""); if (v != null) body[k] = v; }
    if (Object.keys(body).length === 0) { setMsg("Wpisz co najmniej jedną wartość."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/client-portal/body", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { setMsg("Sprawdź wpisane liczby."); return; }
      setWeight(""); setExtra({}); setMsg("Zapisano."); await load();
    } catch { setMsg("Brak połączenia. Spróbuj ponownie."); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    try { const r = await fetch(`/api/client-portal/body/${id}`, { method: "DELETE", credentials: "include" }); if (r.ok) await load(); } catch { /* zostaje */ }
  };
  const points = items.filter((i) => i.weightKg != null).slice(-30).map((i) => ({ day: i.measuredOn, v: i.weightKg as number }));
  const recent = [...items].reverse().slice(0, 5);
  return (
    <section aria-labelledby="body-h" className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="body-log">
      <h2 id="body-h" className="text-lg font-extrabold">Masa i obwody</h2>
      <p className="text-sm text-muted-foreground">Dla Ciebie — trener tych liczb nie widzi. Wpisuj, kiedy chcesz.</p>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-sm font-semibold">Masa (kg)
          <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-base" data-testid="body-weight" />
        </label>
        <button type="button" onClick={() => void save()} disabled={busy} className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60" data-testid="body-save">Zapisz</button>
      </div>
      <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="min-h-11 text-sm font-semibold text-primary">{more ? "Ukryj obwody" : "Dodaj obwody (cm)"}</button>
      {more && (
        <div className="grid grid-cols-2 gap-2">
          {EXTRA.map(([k, label]) => (
            <label key={k} className="text-sm font-semibold">{label}
              <input inputMode="decimal" value={extra[k] ?? ""} onChange={(e) => setExtra((x) => ({ ...x, [k]: e.target.value }))} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-base" />
            </label>
          ))}
        </div>
      )}
      {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      <WeightChart points={points} />
      {recent.length > 0 && (
        <ul className="divide-y divide-border text-sm" data-testid="body-recent">
          {recent.map((e) => (
            <li key={e.id} className="flex min-h-11 items-center justify-between gap-2">
              <span>{fmtDay(e.measuredOn)} · {[e.weightKg != null ? `${e.weightKg} kg` : null, ...EXTRA.map(([k, l]) => (e[k] != null ? `${l} ${e[k]} cm` : null))].filter(Boolean).join(" · ")}</span>
              <button type="button" onClick={() => void remove(e.id)} aria-label={`Usuń wpis z ${fmtDay(e.measuredOn)}`} className="min-h-11 min-w-11 text-muted-foreground">Usuń</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
