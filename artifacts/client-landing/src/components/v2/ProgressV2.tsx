import { useState, type ReactNode } from "react";
import { BodyLogCard } from "./BodyLogCard";
import { Award, Flame, Footprints, Lock, Medal, Sparkles, TrendingUp } from "lucide-react";
import { pluralPl } from "@/lib/plural";
import type { CatalogueItem, Overview } from "@/lib/v2/achievements";
import { ActivityMap } from "@/components/shell/ActivityMap";
import type { AchievementItem } from "@/components/shell/ProgressScreen";

import { IfBrand, MascotEvent } from "@workspace/design-tokens/brand";
const ICON: Record<string, typeof Award> = { week_streak: Flame, record: TrendingUp, milestone: Medal, first_month: Sparkles, ladder_step: Award, steps_week: Footprints, month_challenge: Award };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
const SHOWN = 9;

function Tile({ value, label }: { value: number; label: string }) {
  return <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-card p-3"><dd className="text-2xl font-extrabold tabular-nums">{value}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>;
}

/** One cell of the 3-column grid: earned (colour), in progress (grey + bar + "8/10"), locked (dashed frame, padlock, visible name). */
function Cell({ item }: { item: CatalogueItem }) {
  const Icon = ICON[item.kind] ?? Award;
  if (item.state === "earned") {
    return (
      <li className="flex min-h-[112px] flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-2.5 text-center" data-state="earned">
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-primary"><Icon className="h-6 w-6" aria-hidden />{!item.seen && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">Nowe</span>}</span>
        <span className="text-xs font-bold leading-tight">{item.title}</span>
      </li>
    );
  }
  if (item.state === "progress" && item.progress) {
    const pct = Math.round((item.progress.value / item.progress.target) * 100);
    return (
      <li className="flex min-h-[112px] flex-col items-center gap-1.5 rounded-2xl border border-border bg-muted/50 p-2.5 text-center" data-state="progress">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-extrabold text-muted-foreground">{item.progress.target}</span>
        <span className="text-xs font-bold leading-tight">{item.title}</span>
        <span className="h-1.5 w-full rounded bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Postęp: ${item.title}`}><span className="block h-1.5 rounded bg-primary" style={{ width: `${pct}%` }} /></span>
        <span className="text-[11px] font-bold text-muted-foreground">{item.progress.value}/{item.progress.target}</span>
      </li>
    );
  }
  return (
    <li className="flex min-h-[112px] flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-border p-2.5 text-center" data-state="locked">
      <span className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"><Lock className="h-5 w-5" aria-hidden /></span>
      <span className="text-xs font-bold leading-tight text-muted-foreground">{item.title}</span>
    </li>
  );
}

/**
 * "Postępy" in the new look. No ranking, no comparison with other people; a streak that ended is simply not mentioned.
 * `overview` null = ACHIEVEMENTS_ENABLED off (the achievement parts are left out, the rest stays).
 */
export function ProgressV2({ overview, records, activityDays, today, steps }: {
  overview: Overview | null; records: readonly AchievementItem[]; activityDays: readonly string[]; today: string; steps?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const items = overview?.items ?? [];
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="space-y-4" data-testid="progress-v2">
      <h1 className="text-[26px] font-extrabold tracking-tight">Postępy</h1>
      {overview && (
        <>
          <IfBrand fallback={null}>{overview.streakWeeks ? <div className="flex justify-center" data-testid="streak-view"><MascotEvent event="streak_view" rozmiar="m" /></div> : null}</IfBrand>
          <dl className="grid grid-cols-3 gap-2" data-testid="progress-tiles">
            <Tile value={overview.sessionCount} label={pluralPl(overview.sessionCount, "trening", "treningi", "treningów")} />
            <Tile value={overview.streakWeeks ?? 0} label="tyg. z rzędu" />
            <Tile value={overview.recordCount} label={pluralPl(overview.recordCount, "rekord", "rekordy", "rekordów")} />
          </dl>
          <section aria-labelledby="ach-h" className="space-y-3">
            <div className="flex items-baseline justify-between"><h2 id="ach-h" className="text-lg font-extrabold">Osiągnięcia</h2><span className="text-sm font-bold text-muted-foreground" data-testid="ach-count">{overview.earnedCount} z {overview.total}</span></div>
            {all ? (
              <ul className="space-y-2" data-testid="ach-list">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3" data-state={i.state}>
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${i.state === "earned" ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}>{i.state === "locked" ? <Lock className="h-4 w-4" aria-hidden /> : (() => { const I = ICON[i.kind] ?? Award; return <I className="h-5 w-5" aria-hidden />; })()}</span>
                    <div className="min-w-0">
                      <p className="font-bold">{i.title}{i.state === "earned" && !i.seen && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-primary">Nowe</span>}</p>
                      <p className="text-sm text-muted-foreground">{i.state === "earned" && i.earnedAt ? `Zdobyte ${fmt(i.earnedAt)}` : i.hint}{i.state === "progress" && i.progress ? ` (${i.progress.value}/${i.progress.target})` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="grid grid-cols-3 gap-2" data-testid="ach-grid">{shown.map((i) => <Cell key={i.id} item={i} />)}</ul>
            )}
            {items.length > SHOWN && (
              <button type="button" onClick={() => setAll((a) => !a)} className="flex min-h-11 w-full items-center justify-center text-sm font-bold text-primary">{all ? "Pokaż mniej" : `Zobacz wszystkie (${items.length})`}</button>
            )}
          </section>
          <section aria-labelledby="map-h" className="rounded-2xl border border-border bg-card p-4">
            <h2 id="map-h" className="section-label mb-3">Mapa roku</h2>
            <ActivityMap days={activityDays} today={today} />
          </section>
          <section aria-labelledby="rec-h" className="space-y-2">
            <h2 id="rec-h" className="section-label">Rekordy</h2>
            {records.length === 0
              ? <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Tu pojawią się Twoje rekordy ciężaru.</p>
              : <ul className="space-y-2">{records.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-border bg-card p-3"><p className="font-semibold">{r.title.replace(/^Nowy rekord: /, "")}</p><p className="text-sm text-muted-foreground">{r.body} · {fmt(r.earnedAt)}</p></li>
                ))}</ul>}
          </section>
        </>
      )}
      {steps}
      <BodyLogCard />
    </div>
  );
}
