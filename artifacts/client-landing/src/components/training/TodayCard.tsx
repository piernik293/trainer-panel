import { useCallback, useEffect, useState } from "react";
import { Dumbbell, Loader2, Flame, Wind } from "lucide-react";
import type { TodayResponse, TrainingDay } from "@/lib/training/types";
import { formatTarget } from "@/lib/training/logic";
import { loadRun } from "@/lib/training/run";
import { cacheToday, readCachedToday } from "@/lib/training/sync";
import { SyncBadge } from "./TrainingUi";

async function fetchToday(): Promise<TodayResponse> {
  const res = await fetch("/api/client-portal/training/today", { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return res.json();
}

const approxMinutes = (items: number) => Math.max(3, Math.round(items * 1.5));

/** "Dziś" — the start of the portal when there is a workout today (works from cache without network). */
export function TodayCard({ reloadKey, onStart }: { reloadKey: number; onStart: (day: TrainingDay, ctx: Pick<TodayResponse, "client" | "week">) => void }) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchToday();
      cacheToday(d); setData(d); setFromCache(false); setState("ok");
    } catch (e) {
      if ((e as { status?: number }).status === 404) { setState("none"); return; }
      const cached = readCachedToday<TodayResponse>();
      if (cached) { setData(cached); setFromCache(true); setState("ok"); } else setState("none");
    }
  }, []);
  useEffect(() => { void load(); }, [load, reloadKey]);

  if (state === "loading") return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Ładowanie" /></div>;
  if (state === "none" || !data) return null;

  const day = data.today;
  const upcoming = data.next;
  if (!day) {
    return (
      <section aria-label="Dziś" className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Dziś</p>
        <h2 className="mt-1 text-lg font-bold">Dziś bez treningu</h2>
        {upcoming && <p className="mt-2 text-sm">Najbliższy trening: <b>{upcoming.name}</b> ({upcoming.exerciseCount} ćwiczeń{upcoming.estimatedMinutes ? `, ok. ${upcoming.estimatedMinutes} min` : ""}).</p>}
        {data.lastSession?.completedAt && <p className="mt-1 text-sm text-muted-foreground">Ostatni trening: {data.lastSession.dayName ?? "—"}, {new Date(data.lastSession.completedAt).toLocaleDateString("pl-PL")}.</p>}
      </section>
    );
  }

  const resume = !!day.activeSession || !!loadRun(day.planDayId);
  return (
    <section aria-label="Dziś" className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-primary">{day.weekday} · trening {day.position.index} z {day.position.total}</p>
        <SyncBadge />
      </div>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">{day.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {day.estimatedMinutes ? `ok. ${day.estimatedMinutes} min · ` : ""}{day.exerciseCount} ćwiczeń{day.equipment.length > 0 ? ` · ${day.equipment.join(", ")}` : ""}
      </p>
      {day.trainerNote && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm"><b>Od trenera:</b> {day.trainerNote}</p>}

      <ol className="mt-4 space-y-1.5 text-sm">
        <li className="flex items-center gap-2 text-muted-foreground"><Flame className="h-4 w-4 text-primary" aria-hidden /> Rozgrzewka · {day.warmup.length} ćwiczeń · ok. {approxMinutes(day.warmup.length)} min</li>
        {day.exercises.map((e, i) => (
          <li key={e.planExerciseId} className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
            <span><b>{e.name}</b><br /><span className="text-muted-foreground">{formatTarget(e).split(" · przerwa")[0]}</span></span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted-foreground"><Wind className="h-4 w-4 text-primary" aria-hidden /> Schłodzenie · {day.cooldown.length} ćwiczeń · ok. {approxMinutes(day.cooldown.length)} min</li>
      </ol>

      <button type="button" onClick={() => onStart(day, { client: data.client, week: data.week })} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground">
        <Dumbbell className="h-5 w-5" aria-hidden /> {resume ? "Wróć do treningu" : "Zacznij od rozgrzewki"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Działa bez internetu — zapisze się, gdy wróci zasięg.{fromCache ? " (Plan z pamięci telefonu.)" : ""}</p>
    </section>
  );
}
