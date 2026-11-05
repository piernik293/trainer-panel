/** Samouczek trenera (flaga ONBOARDING_ENABLED): powitanie z 4 krokami, klient przykładowy, „spotlight” z dymkiem „Krok X z 4”, zakończenie. */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { MascotEvent } from "@workspace/design-tokens/brand";
import { Button } from "@/components/ui/button";
import { useOnboarding, useOnboardingActions, useOnboardingStatus, type OnboardingView } from "@/lib/onboardingApi";

const HINTS: Record<string, string> = {
  client: "Zacznij od dodania osoby, którą będziesz prowadzić. Możesz też wypróbować wszystko na kliencie przykładowym.",
  invite: "Wyślij link do wywiadu — osoba odpowie na kilka pytań, a Ty zobaczysz wynik w jej karcie.",
  plan: "Kliknij „Generuj plan”, a generator ułoży plan. Jeśli osoba zgłosiła ból stawu, w planie nie będzie ćwiczeń, które go obciążają. Zobaczysz, co pominięto i dlaczego.",
  activate: "Aktywuj plan i wyślij dostęp. Od tej chwili osoba trenuje w aplikacji, a Ty widzisz postępy.",
};

/** Przyciemnienie + wyróżniony element + dymek „Krok X z 4” (Dalej / Pomiń); Esc pomija, fokus na „Dalej”, przyciski 44 px. */
export function Spotlight({ step, total, text, targetId, onNext, onSkip }: { step: number; total: number; text: string; targetId: string | null; onNext: () => void; onSkip: () => void }) {
  useEffect(() => {
    const el = targetId ? document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`) : null;
    if (!el) return;
    const prev = el.style.cssText;
    el.style.position = el.style.position || "relative"; el.style.zIndex = "60"; el.style.outline = "3px solid #fff"; el.style.outlineOffset = "3px"; el.style.borderRadius = "12px";
    return () => { el.style.cssText = prev; };
  }, [targetId, step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);
  return (
    <div className="fixed inset-0 z-50 bg-black/60" role="dialog" aria-modal="true" aria-label={`Krok ${step} z ${total}`} data-testid="spotlight">
      <div className="fixed inset-x-4 bottom-6 mx-auto max-w-md rounded-2xl bg-white p-4 text-[#1C1917] shadow-xl">
        <p className="text-xs font-bold tracking-wide text-[#C2410C]">KROK {step} Z {total}</p>
        <p className="mt-1 text-sm">{text}</p>
        <div className="mt-3 flex justify-between gap-2">
          <button type="button" onClick={onSkip} className="min-h-11 px-3 text-sm font-semibold underline underline-offset-2" data-testid="spotlight-skip">Pomiń samouczek</button>
          <button type="button" autoFocus onClick={onNext} className="min-h-11 rounded-xl bg-[#C2410C] px-5 text-sm font-bold text-white" data-testid="spotlight-next">{step === total ? "Gotowe" : "Dalej ›"}</button>
        </div>
      </div>
    </div>
  );
}

function hrefFor(id: string, v: OnboardingView): string {
  if (id === "client") return "/clients/new";
  if (id === "invite") return "/survey-invite";
  if (id === "plan") return v.exampleClientId ? `/clients/${v.exampleClientId}/plans/generate` : "/clients";
  return v.exampleClientId ? `/clients/${v.exampleClientId}` : "/clients";
}

export function TutorialCard() {
  const status = useOnboardingStatus();
  const on = status.data?.enabled === true;
  const { data: v } = useOnboarding(on);
  const act = useOnboardingActions();
  const [tour, setTour] = useState<number | null>(null);
  if (!on || !v) return null;

  if (v.completed && !v.dismissed) {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="tutorial-done">
        <div className="flex items-center gap-3"><MascotEvent event="plan_ready" rozmiar="s" /><h2 className="text-lg font-extrabold">Pierwszy plan gotowy!{v.completedMinutes ? ` Zajęło Ci to ${v.completedMinutes} min` : ""}</h2></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11"><Link href="/survey-invite">Zaproś prawdziwego klienta</Link></Button>
          {v.exampleClientId && <Button variant="outline" className="min-h-11" disabled={act.removeExample.isPending} onClick={() => act.removeExample.mutate()} data-testid="remove-example">Usuń klienta przykładowego</Button>}
          <Button variant="ghost" className="min-h-11" onClick={() => act.dismiss.mutate()}>Zamknij</Button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>„Wymaga uwagi” na Pulpicie pokazuje, kto od tygodnia nie trenował.</li><li>Własne ćwiczenia dodasz w „Biblioteka ćwiczeń”.</li><li>Plan możesz skopiować do innej osoby przyciskiem „Kopiuj plan”.</li></ul>
      </section>
    );
  }
  if (v.dismissed || v.completed) return null;

  const firstOpen = v.steps.findIndex((s) => !s.done);
  return (
    <>
      <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="tutorial-card">
        <div className="flex items-center gap-3"><MascotEvent event="home_idle" rozmiar="s" /><div><h2 className="text-lg font-extrabold">Pierwszy plan w 10 minut</h2><p className="text-sm text-muted-foreground">4 kroki. Postęp zapisuje się na koncie.</p></div></div>
        <ol className="space-y-2">
          {v.steps.map((s, i) => (
            <li key={s.id} data-tour={s.id} className={`flex items-center gap-3 rounded-xl border p-2 ${i === firstOpen ? "border-primary" : ""}`}>
              <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s.done ? "✓" : i + 1}</span>
              <span className={`flex-1 text-sm ${s.done ? "text-muted-foreground line-through" : "font-semibold"}`}>{s.label}</span>
              {!s.done && <Button asChild size="sm" variant={i === firstOpen ? "default" : "outline"} className="min-h-11"><Link href={hrefFor(s.id, v)}>Zacznij</Link></Button>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {!v.exampleClientId && <Button variant="outline" className="min-h-11" disabled={act.createExample.isPending} onClick={() => act.createExample.mutate()} data-testid="create-example">Najpierw wypróbuj na kliencie przykładowym</Button>}
          <Button variant="ghost" className="min-h-11" onClick={() => setTour(Math.max(0, firstOpen))} data-testid="start-tour">Pokaż krok po kroku</Button>
          <Button variant="ghost" className="min-h-11" onClick={() => act.dismiss.mutate()} data-testid="tutorial-dismiss">Pomiń samouczek</Button>
        </div>
        {!v.exampleClientId && <p className="text-xs text-muted-foreground">Przykładowy klient nie liczy się do limitu i nie dostaje maili. Usuniesz go jednym kliknięciem.</p>}
      </section>
      {tour != null && (
        <Spotlight step={tour + 1} total={v.steps.length} text={HINTS[v.steps[tour]!.id]!} targetId={v.steps[tour]!.id}
          onNext={() => (tour + 1 >= v.steps.length ? setTour(null) : setTour(tour + 1))} onSkip={() => { setTour(null); act.dismiss.mutate(); }} />
      )}
    </>
  );
}

/** Pozycja menu „Pokaż samouczek” (widoczna tylko przy włączonej fladze). */
export function useShowTutorialItem() {
  const status = useOnboardingStatus();
  const act = useOnboardingActions();
  return status.data?.enabled === true ? { show: () => act.show.mutate() } : null;
}
