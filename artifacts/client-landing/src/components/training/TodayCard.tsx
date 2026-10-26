import { useCallback, useEffect, useState } from "react";
import { Check, Dumbbell, Loader2, Flame, Wind } from "lucide-react";
import type { RampItem, TodayResponse, TrainingDay } from "@/lib/training/types";
import { formatTarget } from "@/lib/training/logic";
import { loadRun } from "@/lib/training/run";
import { loadRamp, withoutPainJoints, type RampKind } from "@/lib/training/ramp";
import { cacheToday, readCachedToday } from "@/lib/training/sync";
import { SyncBadge } from "./TrainingUi";

async function fetchToday(): Promise<TodayResponse> {
  const res = await fetch("/api/client-portal/training/today", { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return res.json();
}

const approxMinutes = (items: number) => Math.max(3, Math.round(items * 1.5));

/** "Dziś" — the start of the portal when there is a workout today (works from cache without network). */
export function TodayCard({ reloadKey, onStart, onRamp }: {
  reloadKey: number;
  onStart: (day: TrainingDay, ctx: Pick<TodayResponse, "client" | "week">) => void;
  /** warm-up / cool-down opened on its own */
  onRamp: (kind: RampKind, planDayId: number, items: RampItem[]) => void;
}) {
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
  const ramp = loadRamp();
  if (!day) {
    // The workout is done; the cool-down stays available (and optional) until it is done or the day ends.
    const pending = ramp && !ramp.cooldownDone && ramp.cooldownItems && ramp.cooldownItems.length > 0 ? ramp : null;
    return (
      <>
      {pending && (
        <RampTile kind="cooldown" count={pending.cooldownItems!.length} minutes={null} done={false} optional
          onOpen={() => onRamp("cooldown", pending.planDayId, pending.cooldownItems!)} />
      )}
      <section aria-label="Dziś" className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Dziś</p>
        <h2 className="mt-1 text-lg font-bold">Dziś bez treningu</h2>
        {upcoming && <p className="mt-2 text-sm">Najbliższy trening: <b>{upcoming.name}</b> ({upcoming.exerciseCount} ćwiczeń{upcoming.estimatedMinutes ? `, ok. ${upcoming.estimatedMinutes} min` : ""}).</p>}
        {data.lastSession?.completedAt && <p className="mt-1 text-sm text-muted-foreground">Ostatni trening: {data.lastSession.dayName ?? "—"}, {new Date(data.lastSession.completedAt).toLocaleDateString("pl-PL")}.</p>}
      </section>
      </>
    );
  }

  const resume = !!day.activeSession || !!loadRun(day.planDayId);
  const mine = ramp && ramp.planDayId === day.planDayId ? ramp : null;
  const cooldownItems = withoutPainJoints(day.cooldown, mine?.painAreas ?? loadRun(day.planDayId)?.painAreas ?? []);
  return (
    <div className="space-y-3">
      <RampTile kind="warmup" count={day.warmup.length} minutes={day.warmupMinutes ? Math.round(day.warmupMinutes) : approxMinutes(day.warmup.length)}
        done={!!mine?.warmupDone} onOpen={() => onRamp("warmup", day.planDayId, day.warmup)} />

      <section aria-label="Trening" className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-primary">Trening · {day.weekday} · {day.position.index} z {day.position.total}</p>
          <SyncBadge />
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{day.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {day.estimatedMinutes ? `ok. ${day.estimatedMinutes} min · ` : ""}{day.exerciseCount} ćwiczeń{day.equipment.length > 0 ? ` · ${day.equipment.join(", ")}` : ""}
        </p>
        {day.trainerNote && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm"><b>Od trenera:</b> {day.trainerNote}</p>}

        <ol className="mt-4 space-y-1.5 text-sm">
          {day.exercises.map((e, i) => (
            <li key={e.planExerciseId} className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
              <span><b>{e.name}</b><br /><span className="text-muted-foreground">{formatTarget(e).split(" · przerwa")[0]}</span></span>
            </li>
          ))}
        </ol>

        <button type="button" onClick={() => onStart(day, { client: data.client, week: data.week })} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground">
          <Dumbbell className="h-5 w-5" aria-hidden /> {resume ? "Wróć do treningu" : "Zacznij trening"}
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Działa bez internetu — zapisze się, gdy wróci zasięg.{fromCache ? " (Plan z pamięci telefonu.)" : ""}</p>
      </section>

      {cooldownItems.length > 0 && (
        <RampTile kind="cooldown" count={cooldownItems.length} minutes={day.cooldownMinutes ? Math.round(day.cooldownMinutes) : approxMinutes(cooldownItems.length)}
          done={!!mine?.cooldownDone} optional onOpen={() => onRamp("cooldown", day.planDayId, cooldownItems)} />
      )}
    </div>
  );
}

/** Warm-up or cool-down as its own tile with its own button (the cool-down can be skipped). */
function RampTile({ kind, count, minutes, done, optional, onOpen }: {
  kind: RampKind; count: number; minutes: number | null; done: boolean; optional?: boolean; onOpen: () => void;
}) {
  const warm = kind === "warmup";
  const title = warm ? "Rozgrzewka" : "Schłodzenie";
  const Icon = warm ? Flame : Wind;
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-primary"><Icon className="h-4 w-4" aria-hidden /> {title}{optional ? " · można pominąć" : ""}</p>
        {done && <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Check className="h-4 w-4" aria-hidden /> Zrobione</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{count} ćwiczeń{minutes != null ? ` · ok. ${minutes} min` : ""}</p>
      <button type="button" onClick={onOpen} className="mt-3 h-12 w-full rounded-xl border border-border bg-background text-base font-semibold">
        {done ? `${title}: zrób jeszcze raz` : warm ? "Zacznij rozgrzewkę" : "Zacznij schłodzenie"}
      </button>
    </section>
  );
}
