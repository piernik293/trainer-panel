/**
 * „Zobacz, jak to działa” — tryb podglądu bez konta (flaga GUEST_DEMO_ENABLED).
 * Dziś → trening → seria → koniec, na danych przykładowych w przeglądarce. NIC nie jest zapisywane i nie ma żadnych zapytań zapisujących:
 * ten ekran używa tylko ekranu serii (czysty komponent) i jednego odczytu stanu flagi. Bez wywiadu, bez pytań o zdrowie.
 */
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SetScreen } from "@/components/training/SetScreen";
import { DEMO_DAY, DEMO_EXERCISES } from "@/lib/demoData";
import type { LoggedSet } from "@/lib/training/logic";

type Stage = "today" | "train" | "end";

export default function DemoPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>("today");
  const [index, setIndex] = useState(0);
  const [sets, setSets] = useState<Record<number, Record<number, LoggedSet>>>({});
  const [painNote, setPainNote] = useState(false);

  useEffect(() => {
    fetch("/api/guest-demo/status").then((r) => (r.ok ? r.json() : { enabled: false })).then((b: { enabled?: boolean }) => setEnabled(!!b.enabled)).catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return <div className="min-h-screen bg-background" aria-busy="true" />;
  if (!enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="space-y-3">
          <p className="font-semibold">Podgląd jest niedostępny</p>
          <a className="inline-flex min-h-11 items-center font-semibold text-primary underline" href="/sign-in">Zaloguj się</a>
        </div>
      </div>
    );
  }

  const ex = DEMO_EXERCISES[index]!;
  const mine = sets[ex.planExerciseId];
  const saveSet = (n: number, v: LoggedSet) => setSets((s) => ({ ...s, [ex.planExerciseId]: { ...(s[ex.planExerciseId] ?? {}), [n]: v } }));
  const next = () => (index + 1 >= DEMO_EXERCISES.length ? setStage("end") : setIndex(index + 1));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div role="status" className="sticky top-0 z-20 bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning" data-testid="demo-banner">
        Tryb podglądu — nic nie jest zapisywane
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-6">
        {stage === "today" && (
          <section className="space-y-4" data-testid="demo-today">
            <div>
              <p className="section-label">{DEMO_DAY.weekday}</p>
              <h1 className="text-3xl font-extrabold tracking-tight">{DEMO_DAY.name}</h1>
              <p className="text-sm text-muted-foreground">{DEMO_EXERCISES.length} ćwiczenia · ok. {DEMO_DAY.estimatedMinutes} min</p>
            </div>
            <ol className="space-y-2">
              {DEMO_EXERCISES.map((e, i) => (
                <li key={e.planExerciseId} className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="font-semibold">{i + 1}. {e.name}</p>
                  <p className="text-sm text-muted-foreground">{e.sets} × {e.reps}</p>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setStage("train")} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground">
              Zacznij trening <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </section>
        )}
        {stage === "train" && (
          <>
            <SetScreen animation={false} key={ex.planExerciseId} ex={ex} index={index} total={DEMO_EXERCISES.length} sets={mine} skipped={false}
              onSave={saveSet} onPrev={() => setIndex(Math.max(0, index - 1))} onNext={next} onOpenList={() => setStage("today")} onPain={() => setPainNote(true)} />
            {painNote && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">W trybie podglądu to zgłoszenie nic nie zapisuje. W prawdziwej aplikacji trener dostaje wiadomość.</p>}
          </>
        )}
        {stage === "end" && (
          <section className="space-y-4 text-center" data-testid="demo-end">
            <h1 className="text-3xl font-extrabold tracking-tight">Trening ukończony</h1>
            <p className="text-muted-foreground">Tak wygląda jeden trening. Podoba Ci się? Załóż konto, żeby zapisywać postępy.</p>
            <a href="/sign-up" className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">Załóż konto</a>
            <button type="button" onClick={() => { setStage("today"); setIndex(0); setSets({}); }} className="min-h-11 text-sm font-semibold text-muted-foreground underline">Zobacz jeszcze raz</button>
          </section>
        )}
      </main>
    </div>
  );
}
