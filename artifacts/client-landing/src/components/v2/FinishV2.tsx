import { useEffect, useRef, useState } from "react";
import { Check, Share2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { pluralPl } from "@/lib/plural";
import { RATING_LABELS, type Rating, type TrainingDay } from "@/lib/training/types";
import type { RunState } from "@/lib/training/run";
import { kgLabel } from "@/lib/v2/helpers";
import { shareStory, type StoryData } from "@/lib/v2/story";
import type { Summary } from "@/components/training/TrainingFlow";

import { IfBrand, Loading, ErrorState, EmptyState, PlanBuilding, Maskotka, LoginSequence } from "@workspace/design-tokens/brand";
const WEEKDAY_UP = ["NIEDZIELA", "PONIEDZIAŁEK", "WTOREK", "ŚRODA", "CZWARTEK", "PIĄTEK", "SOBOTA"];

/** What goes on the story: never pain, health data, body weight or a name (only the nick). Exported for the privacy test. */
export function storyDataFor(day: TrainingDay, sum: Summary, v2: { streakWeeks: number | null; nick: string | null; goldenBull?: boolean }, now = new Date()): StoryData {
  const top = sum.hadPain ? null : sum.records[0] ?? null; // after a pain report: no record on the picture
  return {
    weekday: WEEKDAY_UP[now.getDay()]!, title: day.name, minutes: sum.minutes, kg: sum.kg > 0 ? sum.kg : null, reps: sum.reps, sets: sum.sets,
    record: top ? { name: top.name, weightKg: top.weightKg, reps: top.reps } : null,
    streakWeeks: v2.streakWeeks, weekDone: Math.min(sum.weekDone, sum.weekTarget), weekTarget: sum.weekTarget, nick: v2.nick?.trim() || null, goldenBull: v2.goldenBull === true,
  };
}

/** End of a workout in the new look. After a reported pain: the plain summary only (no record, no celebration). */
export function FinishV2({ day, run, sum, v2, onFeedback, onFinish }: {
  day: TrainingDay; run: RunState; sum: Summary; v2: { streakWeeks: number | null; nick: string | null; goldenBull?: boolean };
  onFeedback: (rating: Rating | null, note: string) => void; onFinish: () => void;
}) {
  const [rating, setRating] = useState<Rating | null>(run.rating);
  const [note, setNote] = useState(run.note);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  const record = sum.hadPain ? null : sum.records[0] ?? null;
  const tiles: [string, string][] = [
    [`${sum.minutes} min`, "czas"],
    [`${sum.sets}`, pluralPl(sum.sets, "seria", "serie", "serii")],
    sum.kg > 0 ? [kgLabel(sum.kg), "kg łącznie"] : [`${sum.reps}`, pluralPl(sum.reps, "powtórzenie", "powtórzenia", "powtórzeń")],
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="finish-v2">
      <div className="flex flex-col items-center gap-2.5 pt-2 text-center">
        <IfBrand fallback={<span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-soft"><span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-[34px] w-[34px]" strokeWidth={3} aria-hidden /></span></span>}>
          <Maskotka stan="success" rozmiar="m" decorative />
        </IfBrand>
        <h2 ref={h} tabIndex={-1} className="text-[28px] font-extrabold outline-none">Trening zrobiony!</h2>
        <p className="text-[15px] text-muted-foreground">{day.name} · {sum.weekDone} z {sum.weekTarget} w tym tygodniu</p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map(([v, l]) => (
          <div key={l} className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-card p-3"><dd className="text-[22px] font-extrabold tabular-nums">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
        ))}
      </dl>
      {record && (
        <section aria-label="Nowy rekord" className="flex items-center gap-3.5 rounded-[20px] bg-stone-900 p-4 text-white dark:border dark:border-white/10 dark:bg-[#2A221E]">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#C2410C]"><Trophy className="h-7 w-7" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.08em] text-orange-300">NOWY REKORD</p>
            <p className="text-[17px] font-extrabold">{record.name}</p>
            <p className="text-sm text-stone-300">{String(record.weightKg).replace(".", ",")} kg × {record.reps} · o {String(record.gainKg).replace(".", ",")} kg więcej niż dotąd</p>
          </div>
        </section>
      )}
      <fieldset className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4">
        <legend className="sr-only">Jak było?</legend>
        <p className="text-[15px] font-extrabold" aria-hidden>Jak było?</p>
        <div role="radiogroup" aria-label="Jak było?" className="grid grid-cols-3 gap-2">
          {(Object.keys(RATING_LABELS) as Rating[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={rating === r} onClick={() => { const v = rating === r ? null : r; setRating(v); onFeedback(v, note); }}
              className={cn("h-11 rounded-xl border text-sm", rating === r ? "border-2 border-primary bg-brand-soft font-extrabold text-primary" : "border-border bg-background font-bold")}>
              {RATING_LABELS[r]}
            </button>
          ))}
        </div>
        <label htmlFor="session-note" className="text-xs font-semibold text-muted-foreground">Notatka dla trenera (opcjonalnie)</label>
        <textarea id="session-note" rows={2} maxLength={1000} value={note} onChange={(e) => { setNote(e.target.value); onFeedback(rating, e.target.value); }} className="w-full rounded-xl border border-input bg-background p-3 text-base" />
      </fieldset>
      {day.cooldown.length > 0 && <p className="text-center text-sm text-muted-foreground">Schłodzenie znajdziesz potem na ekranie „Dziś”. Możesz je zrobić albo pominąć.</p>}
      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={async () => {
          const r = await shareStory(storyDataFor(day, sum, v2));
          setShareMsg(r === "downloaded" ? "Obraz zapisany na telefonie." : r === "failed" ? "Nie udało się przygotować obrazu." : null);
        }} className="flex h-[54px] items-center justify-center gap-2.5 rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground">
          <Share2 className="h-5 w-5" aria-hidden /> Udostępnij na story
        </button>
        {shareMsg && <p role="status" className="text-center text-sm text-muted-foreground">{shareMsg}</p>}
        <button type="button" onClick={onFinish} className="flex h-[54px] items-center justify-center rounded-2xl border border-border bg-card text-[17px] font-extrabold">Gotowe</button>
      </div>
    </div>
  );
}
