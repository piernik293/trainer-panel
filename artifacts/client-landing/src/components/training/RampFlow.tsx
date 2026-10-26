import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { RampItem } from "@/lib/training/types";
import { updateRamp, type RampKind } from "@/lib/training/ramp";
import { MediaPlaceholder } from "./TrainingUi";

const TITLES: Record<RampKind, string> = { warmup: "Rozgrzewka", cooldown: "Schłodzenie" };

/** Warm-up / cool-down on its own (not part of the workout run): one item at a time, the amount is information (no timer). */
export function RampFlow({ kind, planDayId, items, onExit }: {
  kind: RampKind; planDayId: number; items: RampItem[]; onExit: (done: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => { topRef.current?.scrollIntoView({ block: "start" }); }, [index]);
  const title = TITLES[kind];
  const it = items[Math.min(index, items.length - 1)];

  const next = () => {
    if (index + 1 >= items.length) {
      updateRamp(planDayId, kind === "warmup" ? { warmupDone: true } : { cooldownDone: true });
      onExit(true);
    } else setIndex(index + 1);
  };
  if (!it) return null;
  const upcoming = items[index + 1]?.name ?? (kind === "warmup" ? "Koniec rozgrzewki" : "Koniec schłodzenia");

  return (
    <div className="min-h-[100dvh] bg-background pb-10 text-foreground">
      <div ref={topRef} />
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button type="button" onClick={() => onExit(false)} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Wyjdź
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-primary">{title}</p>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <p className="text-sm font-semibold text-muted-foreground">{title} · {index + 1} z {items.length}</p>
        <MediaPlaceholder label="Animacja pojawi się tutaj" />
        <div>
          <h2 className="text-2xl font-bold leading-tight tracking-tight">{it.name}</h2>
          <p className="mt-1 text-sm text-foreground/90">{it.description}</p>
          <p className="mt-3 inline-block rounded-lg bg-brand-soft px-3 py-2 text-lg font-bold text-primary">{it.detail}</p>
        </div>
        <p className="text-sm text-muted-foreground">Następne: <b className="text-foreground">{upcoming}</b></p>
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <button type="button" onClick={next} className="h-14 rounded-xl border border-border bg-card font-semibold">Pomiń</button>
          <button type="button" onClick={next} className="h-14 rounded-xl bg-primary text-base font-bold text-primary-foreground">Dalej</button>
        </div>
      </main>
    </div>
  );
}
