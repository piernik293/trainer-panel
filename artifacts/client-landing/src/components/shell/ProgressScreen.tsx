import type { ReactNode } from "react";
import { Award, Flame, Footprints, Medal, Sparkles, TrendingUp } from "lucide-react";
import { pluralPl } from "@/lib/plural";
import { ActivityMap } from "./ActivityMap";

export interface AchievementItem { id: number; kind: string; title: string; body: string | null; earnedAt: string; seen: boolean }

const ICON: Record<string, typeof Award> = { week_streak: Flame, record: TrendingUp, milestone: Medal, first_month: Sparkles, ladder_step: Award, steps_week: Footprints, month_challenge: Award };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long" });

/**
 * "Postępy" (Solo and trainees): weekly streak, map of the year, records, steps, achievements. Only what was earned is shown: no ranking, no
 * comparison with other people, and a streak that is over is simply not mentioned (docs/OSIAGNIECIA.md).
 */
export function ProgressScreen({ items, streakWeeks, activityDays, today, steps, showAchievements = true }: {
  items: readonly AchievementItem[];
  streakWeeks: number | null;
  activityDays: readonly string[];
  today: string;
  /** the existing "Kroki" tile */
  steps?: ReactNode;
  /** false while ACHIEVEMENTS_ENABLED is off (the shell then shows only what exists today) */
  showAchievements?: boolean;
}) {
  const records = items.filter((i) => i.kind === "record").slice(0, 5);
  const others = items.filter((i) => i.kind !== "record");
  return (
    <div className="space-y-6" data-testid="progress-screen">
      <h1 className="text-2xl font-bold tracking-tight">Postępy</h1>

      {showAchievements && (
        <>
          <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="streak-h">
            <h2 id="streak-h" className="section-label">Regularność</h2>
            {streakWeeks ? (
              <div className="mt-2 flex items-baseline gap-3">
                <span className="stat-number text-5xl" data-testid="streak-number">{streakWeeks}</span>
                <div>
                  <p className="font-semibold">{pluralPl(streakWeeks, "tydzień", "tygodnie", "tygodni")} z rzędu</p>
                  <p className="text-sm text-muted-foreground">Trenujesz regularnie — tak trzymaj.</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Seria zaczyna się od pierwszego tygodnia, w którym zrobisz cały plan.</p>
            )}
          </section>

          <section aria-labelledby="map-h" className="rounded-lg border border-border bg-card p-4">
            <h2 id="map-h" className="section-label mb-3">Mapa roku</h2>
            <ActivityMap days={activityDays} today={today} />
          </section>

          <section aria-labelledby="rec-h" className="space-y-2">
            <h2 id="rec-h" className="section-label">Rekordy</h2>
            {records.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Tu pojawią się Twoje rekordy ciężaru.</p>
            ) : (
              <ul className="space-y-2">
                {records.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                    <p className="font-semibold">{r.title.replace(/^Nowy rekord: /, "")}</p>
                    <p className="text-sm text-muted-foreground">{r.body} · {fmt(r.earnedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {steps}

      {showAchievements && (
        <section aria-labelledby="ach-h" className="space-y-2">
          <h2 id="ach-h" className="section-label">Osiągnięcia</h2>
          {others.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Pierwsze osiągnięcie pojawi się po Twoim pierwszym treningu.</p>
          ) : (
            <ul className="space-y-2">
              {others.map((a) => {
                const Icon = ICON[a.kind] ?? Award;
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0">
                      <p className="font-semibold">{a.title}{!a.seen && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-primary">Nowe</span>}</p>
                      {a.body && <p className="text-sm text-muted-foreground">{a.body}</p>}
                      <p className="text-xs text-muted-foreground">{fmt(a.earnedAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
