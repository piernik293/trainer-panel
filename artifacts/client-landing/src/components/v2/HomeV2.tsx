import { useEffect, useState, type ReactNode } from "react";
import { Award, Check, Dumbbell, Flame, Footprints, Loader2, Play } from "lucide-react";
import type { RampItem, TodayResponse, TrainingDay } from "@/lib/training/types";
import { formatTarget } from "@/lib/training/logic";
import { loadRun } from "@/lib/training/run";
import { loadRamp, withoutPainJoints, type RampKind } from "@/lib/training/ramp";
import { RampTile, useTodayData } from "@/components/training/TodayCard";
import { SyncBadge } from "@/components/training/TrainingUi";
import { StepsTile } from "@/components/StepsTile";
import { pluralPl } from "@/lib/plural";
import { kgLabel as nf, longDate, shownName, weekCircles } from "@/lib/v2/helpers";
import { nextAchievement, type CatalogueItem } from "@/lib/v2/achievements";
import type { ProfileV2 } from "@/lib/v2/profile";
import { cacheSummary, fetchSummary, readCachedSummary } from "@/lib/steps/sync";
import { AvatarV2 } from "./Avatar";
import { clearCelebration, readCelebration, type Celebration } from "@/lib/v2/celebration";


import { IfBrand, Loading, EmptyState, MascotEvent, showMascot, useBrandV1, wasShown, markShown } from "@workspace/design-tokens/brand";
/** Streak card: weekly streak (never a loss message), "X z Y treningów w tym tygodniu" and one circle per planned training. */
export function StreakCard({ streakWeeks, done, target }: { streakWeeks: number | null; done: number; target: number }) {
  const circles = weekCircles(done, target);
  return (
    <section aria-label="Seria" className="space-y-3.5 rounded-[20px] border border-border bg-card p-4" data-testid="streak-card">
      <div className="flex items-center gap-3">
        <IfBrand fallback={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-brand-soft text-primary"><Flame className="h-6 w-6" aria-hidden /></span>}>
          <span className="flex h-16 w-14 shrink-0 items-center justify-center overflow-visible" data-testid="streak-mascot"><MascotEvent event={streakWeeks ? "streak_view" : "home_idle"} rozmiar="s" /></span>
        </IfBrand>
        <div className="min-w-0">
          <p className="text-[22px] font-extrabold leading-tight" data-testid="streak-title">
            {streakWeeks ? `${streakWeeks} ${pluralPl(streakWeeks, "tydzień", "tygodnie", "tygodni")} z rzędu` : "Zacznij swoją serię"}
          </p>
          <p className="text-[13px] text-muted-foreground" data-testid="streak-sub">W tym tygodniu: {done} z {target} {pluralPl(target, "treningu", "treningów", "treningów")}</p>
        </div>
      </div>
      {circles.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Treningi w tym tygodniu">
          {circles.map((c, i) => (
            <li key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">{i + 1}</span>
              {c === "done"
                ? <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Zrobiony"><Check className="h-4 w-4" strokeWidth={3} aria-hidden /></span>
                : <span className="h-[34px] w-[34px] rounded-full border-2 border-dashed border-border" aria-label="Do zrobienia" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextAchievement({ item }: { item: CatalogueItem }) {
  const p = item.progress!;
  const pct = Math.round((p.value / p.target) * 100);
  return (
    <section aria-label="Następne osiągnięcie" className="flex items-center gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5" data-testid="next-achievement">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary"><Award className="h-[22px] w-[22px]" aria-hidden /></span>
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex justify-between gap-2"><span className="truncate text-sm font-bold">Następne: {item.title}</span><span className="text-[13px] font-bold text-primary">{p.value}/{p.target}</span></div>
        <div className="h-2 rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Postęp: ${item.title}`}><div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} /></div>
      </div>
    </section>
  );
}

/** "Kroki: 5 400 / 8 000", a thin bar and "Wpisz" which opens the existing entry tile below. */
function StepsLine() {
  const [open, setOpen] = useState(false);
  const [sum, setSum] = useState(() => readCachedSummary());
  useEffect(() => {
    let alive = true;
    void fetchSummary().then((s) => { if (alive) { cacheSummary(s); setSum(s); } }).catch(() => {}); // offline / no steps module: keep the cached numbers
    return () => { alive = false; };
  }, [open]);
  const today = sum?.todaySteps ?? null;
  const goal = sum?.goal ?? null;
  const pct = goal && today != null ? Math.min(100, Math.round((today / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center gap-2.5 px-1" data-testid="steps-line">
        <Footprints className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold">Kroki: {today == null ? "—" : nf(today)}{goal ? ` / ${nf(goal)}` : ""}</span>
        <div className="h-1.5 grow rounded bg-muted" aria-hidden><div className="h-1.5 rounded bg-muted-foreground/60" style={{ width: `${pct}%` }} /></div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 items-center px-1 text-sm font-bold text-primary">{open ? "Zwiń" : "Wpisz"}</button>
      </div>
      {open && <div className="mt-2"><StepsTile compact /></div>}
    </div>
  );
}

export interface HomeV2Props {
  profile: ProfileV2;
  reloadKey: number;
  streakWeeks: number | null;
  /** the achievements answer has arrived (streakWeeks null then really means no streak) */
  streakLoaded?: boolean;
  /** „Złoty Byczek” number of this account (campaign) or null */
  goldenBull?: number | null;
  achievements: readonly CatalogueItem[];
  onStart: (day: TrainingDay, ctx: Pick<TodayResponse, "client" | "week">) => void;
  onRamp: (kind: RampKind, planDayId: number, items: RampItem[]) => void;
  onOpenYou: () => void;
  /** e.g. the "new plan" card of a Solo person whose plan has ended */
  top?: ReactNode;
}

/** "Dziś" in the new look (docs/screens/ux-v2). Data: the same "today" answer as the classic card (works offline from the cache). */
export function HomeV2({ profile, reloadKey, streakWeeks, streakLoaded = false, goldenBull = null, achievements, onStart, onRamp, onOpenYou, top }: HomeV2Props) {
  const { data, state, fromCache } = useTodayData(reloadKey);
  const [celebration, setCelebration] = useState<Celebration | null>(() => readCelebration());
  const brand = useBrandV1();
  const [starting, setStarting] = useState<{ day: TrainingDay; ctx: Pick<TodayResponse, "client" | "week"> } | null>(null);
  const [returned, setReturned] = useState(false);
  // Byczek (tylko z flagą marki): nowa seria (raz na serię), seria się skończyła (raz, po ochronie serii), Złoty Byczek (raz)
  useEffect(() => {
    if (!brand || !streakLoaded) return;
    try {
      const last = Number(window.localStorage.getItem("optimatren-streak-last:v1") ?? "0") || 0;
      const now = streakWeeks ?? 0;
      if (now === 1 && last < 1) showMascot("streak_started", `start-${isoWeek(new Date())}`);
      else if (now === 0 && last >= 2) showMascot("streak_ended", `end-${last}-${isoWeek(new Date())}`);
      window.localStorage.setItem("optimatren-streak-last:v1", String(now));
    } catch { /* bez pamięci: bez animacji */ }
  }, [brand, streakLoaded, streakWeeks]);
  useEffect(() => { if (brand && goldenBull != null) showMascot("gold_bull", String(goldenBull)); }, [brand, goldenBull]);
  const startNow = (day: TrainingDay, ctx: Pick<TodayResponse, "client" | "week">) => {
    const key = new Date().toISOString().slice(0, 10);
    if (brand && !wasShown("workout_start", key)) { markShown("workout_start", key); setStarting({ day, ctx }); } else onStart(day, ctx);
  };
  const name = shownName(profile);
  const next = nextAchievement(achievements);
  return (
    <div className="space-y-3.5" data-testid="home-v2">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground" data-testid="home-date">{longDate(new Date())}</p>
          <h1 className="truncate text-[26px] font-extrabold leading-tight" data-testid="home-greeting">Cześć, {name}!</h1>
        </div>
        <button type="button" onClick={onOpenYou} aria-label="Twój profil" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><AvatarV2 name={name} color={profile.avatarColor} /></button>
      </header>
      {top}
      {brand && state === "ok" && data && !returned && daysSince(data.lastSession?.completedAt) >= 14 && !wasShown("long_break_return", new Date().toISOString().slice(0, 10)) && (
        <section className="flex flex-col items-center gap-2 rounded-[20px] border border-border bg-card p-4 text-center" data-testid="long-break">
          <MascotEvent event="long_break_return" rozmiar="m" />
          <button type="button" onClick={() => { markShown("long_break_return", new Date().toISOString().slice(0, 10)); setReturned(true); }} className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground">Wracam</button>
        </section>
      )}
      {starting && (
        <StartOverlay onDone={() => { const s = starting; setStarting(null); onStart(s.day, s.ctx); }} />
      )}
      {celebration && (
        <section role="status" aria-label="Nowe osiągnięcie" className="flex items-start gap-3 rounded-[20px] border border-primary/40 bg-brand-soft p-4" data-testid="celebration">
          <IfBrand fallback={<Award className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />}><MascotEvent event="achievement_unlocked" rozmiar="s" /></IfBrand>
          <div className="min-w-0 grow"><p className="font-extrabold">{celebration.title}</p>{celebration.body && <p className="text-sm text-muted-foreground">{celebration.body}</p>}</div>
          <button type="button" onClick={() => { clearCelebration(); setCelebration(null); }} className="flex min-h-11 items-center px-1 text-sm font-bold text-primary">OK</button>
        </section>
      )}
      {state === "loading" && <IfBrand fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Ładowanie" /></div>}><Loading /></IfBrand>}
      {state === "none" && (
        <section className="rounded-[20px] border border-border bg-card p-4" data-testid="home-no-plan">
          <IfBrand fallback={<><p className="text-lg font-extrabold">Trener przygotowuje Twój plan</p>
          <p className="mt-1 text-sm text-muted-foreground">Gdy będzie gotowy, zobaczysz go tutaj.</p></>}>
            <EmptyState title="Trener przygotowuje Twój plan" message="Gdy będzie gotowy, zobaczysz go tutaj." />
          </IfBrand>
        </section>
      )}
      {state === "ok" && data && (
        <>
          <StreakCard streakWeeks={streakWeeks} done={data.week.done} target={data.week.target} />
          <TrainingBlock data={data} fromCache={fromCache} onStart={startNow} onRamp={onRamp} />
        </>
      )}
      {next && <NextAchievement item={next} />}
      <StepsLine />
    </div>
  );
}

function TrainingBlock({ data, fromCache, onStart, onRamp }: { data: TodayResponse; fromCache: boolean; onStart: HomeV2Props["onStart"]; onRamp: HomeV2Props["onRamp"] }) {
  const day = data.today;
  const upcoming = data.next;
  const ramp = loadRamp();
  if (!day) {
    const pending = ramp && !ramp.cooldownDone && ramp.cooldownItems && ramp.cooldownItems.length > 0 ? ramp : null;
    return (
      <>
        {pending && <RampTile kind="cooldown" count={pending.cooldownItems!.length} minutes={null} done={false} optional onOpen={() => onRamp("cooldown", pending.planDayId, pending.cooldownItems!)} />}
        <section aria-label="Dziś odpoczynek" className="space-y-1 rounded-[22px] border border-border bg-card p-[18px]" data-testid="home-rest">
          <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground">DZIŚ</p>
          <p className="text-2xl font-extrabold">Dziś odpoczynek</p>
          {upcoming && <p className="text-sm text-muted-foreground">Następny trening: <b className="text-foreground">{upcoming.name}</b>{upcoming.estimatedMinutes ? ` · ok. ${upcoming.estimatedMinutes} min` : ""}.</p>}
        </section>
      </>
    );
  }
  const resume = !!day.activeSession || !!loadRun(day.planDayId);
  const mine = ramp && ramp.planDayId === day.planDayId ? ramp : null;
  const cooldownItems = withoutPainJoints(day.cooldown, mine?.painAreas ?? loadRun(day.planDayId)?.painAreas ?? []);
  const shown = day.exercises.slice(0, 3);
  const more = day.exercises.length - shown.length;
  const warmMin = day.warmupMinutes ? Math.round(day.warmupMinutes) : Math.max(3, Math.round(day.warmup.length * 1.5));
  return (
    <>
      <section aria-label="Trening" className="space-y-3 rounded-[22px] bg-stone-900 p-[18px] text-white dark:border dark:border-white/10 dark:bg-[#2A221E]" data-testid="home-training">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.08em] text-orange-300">TRENING NA DZIŚ · {day.position.index} Z {day.position.total}</span>
          <span className="flex items-center gap-2 text-xs font-semibold text-stone-300">{day.estimatedMinutes ? `ok. ${day.estimatedMinutes} min` : ""}<SyncBadge /></span>
        </div>
        <h2 className="text-[26px] font-extrabold leading-[1.1]">{day.name}</h2>
        {day.trainerNote && <p className="rounded-lg bg-white/10 px-3 py-2 text-sm"><b>Od trenera:</b> {day.trainerNote}</p>}
        <ul className="space-y-2">
          {shown.map((e) => (
            <li key={e.planExerciseId} className="flex justify-between gap-3 text-sm"><span className="min-w-0">{e.name}</span><span className="shrink-0 text-stone-300">{formatTarget(e).split(" · ")[0]}</span></li>
          ))}
        </ul>
        {(more > 0 || day.warmup.length > 0) && (
          <p className="text-[13px] text-stone-400">{more > 0 ? `+ ${more} ${pluralPl(more, "ćwiczenie", "ćwiczenia", "ćwiczeń")}` : ""}{more > 0 && day.warmup.length > 0 ? " · " : ""}{day.warmup.length > 0 ? `najpierw rozgrzewka ${warmMin} min` : ""}</p>
        )}
        <button type="button" onClick={() => onStart(day, { client: data.client, week: data.week })} className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#C2410C] text-[17px] font-extrabold text-white">
          {resume ? <Dumbbell className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5 fill-white" aria-hidden />} {resume ? "Wróć do treningu" : "Zacznij trening"}
        </button>
        <p className="text-center text-xs text-stone-400">Działa bez internetu.{fromCache ? " (Plan z pamięci telefonu.)" : ""}</p>
      </section>
      {day.warmup.length > 0 && <RampTile kind="warmup" count={day.warmup.length} minutes={warmMin} done={!!mine?.warmupDone} onOpen={() => onRamp("warmup", day.planDayId, day.warmup)} />}
      {cooldownItems.length > 0 && (
        <RampTile kind="cooldown" count={cooldownItems.length} minutes={day.cooldownMinutes ? Math.round(day.cooldownMinutes) : Math.max(3, Math.round(cooldownItems.length * 1.5))}
          done={!!mine?.cooldownDone} optional onOpen={() => onRamp("cooldown", day.planDayId, cooldownItems)} />
      )}
    </>
  );
}

/** Numer tygodnia ISO jako tekst (klucz zdarzeń „raz”). */
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7)}`;
}
const daysSince = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0);

/** „Zaczynamy”: byczek podnosi sztangę ok. 1,5 s (raz dziennie), dotknięcie pomija; potem trening startuje. */
function StartOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1500); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" onClick={onDone} aria-label="Pomiń animację" data-testid="start-overlay" className="fixed inset-0 z-[60] flex items-center justify-center bg-background">
      <MascotEvent event="workout_start" rozmiar="l" />
    </button>
  );
}
