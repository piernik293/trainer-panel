/**
 * „Dziś” osoby bez planu (Solo): jedna wyraźna karta „Ułóż swój plan (ok. 3 min)” → wywiad dopiero po kliknięciu → serwer układa plan
 * (POST /api/solo/plan) → po sukcesie portal pokazuje normalne „Dziś”. Opcje rang (trener, wniosek) są wyłącznie w „Ty”.
 * Miejsce na przyszłą maskotkę: `data-slot="maskotka"` (bez grafiki).
 */
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import SurveyWizard from "@/components/SurveyWizard";
import { OwnPlanEntry } from "@/components/ownplan/OwnPlanEditor";
import { StepsTile } from "@/components/StepsTile";
import { Button } from "@/components/ui/button";

import { IfBrand, Loading, ErrorState, EmptyState, PlanBuilding, Maskotka, LoginSequence } from "@workspace/design-tokens/brand";
type Phase = "start" | "interview" | "building";

export function SoloToday({ firstName, hasSurvey, onPlanReady }: { firstName: string; hasSurvey: boolean; onPlanReady: () => void }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    setPhase("building"); setError(null);
    try {
      const r = await fetch("/api/solo/plan", { method: "POST", credentials: "include" });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) { onPlanReady(); return; }
      setError(typeof b.error === "string" ? b.error : "Nie udało się ułożyć planu. Spróbuj ponownie za chwilę.");
    } catch { setError("Nie udało się ułożyć planu. Sprawdź połączenie i spróbuj ponownie."); }
    setPhase("start");
  };

  if (phase === "interview") {
    return <SurveyWizard inviteToken="solo" prefill={{ existingClient: true, firstName, lastName: "", email: "" }} submitUrl="/api/solo/survey" onSubmitted={() => void build()} />;
  }
  if (phase === "building") {
    return (
      <IfBrand fallback={<div className="flex flex-col items-center gap-3 py-16 text-center" role="status" data-testid="solo-building">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="font-semibold">Układamy Twój plan…</p>
      </div>}><PlanBuilding /></IfBrand>
    );
  }
  return (
    <div className="space-y-6" data-testid="solo-today">
      <div>
        <p className="section-label">Dziś</p>
        <h1 className="break-words text-2xl font-bold tracking-tight">Cześć, {firstName}!</h1>
      </div>
      <div data-slot="maskotka" aria-hidden="true" />
      <section className="space-y-3 rounded-xl border border-border bg-card p-5" data-testid="solo-plan-card">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-primary"><Sparkles className="h-5 w-5" aria-hidden /></span>
        <h2 className="text-xl font-bold tracking-tight">Ułóż swój plan (ok. 3 min)</h2>
        <p className="text-sm text-muted-foreground">{hasSurvey ? "Masz już odpowiedzi na pytania — plan ułożymy od razu." : "Odpowiesz na kilka pytań, a my ułożymy bezpieczny plan treningowy."}</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" onClick={() => (hasSurvey ? void build() : setPhase("interview"))}>{hasSurvey ? "Ułóż plan" : "Zaczynamy"}</Button>
        <OwnPlanEntry compact onSaved={onPlanReady} />
      </section>
      <StepsTile compact />
    </div>
  );
}

/** „Ułóż nowy plan” dla osoby bez trenera po cyklu (inne ćwiczenia). Widoczne tylko dla Solo; limit pilnuje serwer. */
export function SoloNewPlan({ endDate, onPlanReady }: { endDate: string | null | undefined; onPlanReady: () => void }) {
  const [solo, setSolo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/account/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((s: { linked?: boolean } | null) => setSolo(!!s && s.linked === false)).catch(() => setSolo(false)); }, []);
  if (!solo) return null;
  const ended = !!endDate && endDate < new Date().toISOString().slice(0, 10);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/solo/plan", { method: "POST", credentials: "include" });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) { onPlanReady(); return; }
      setError(typeof b.error === "string" ? b.error : "Nie udało się ułożyć planu. Spróbuj ponownie za chwilę.");
    } catch { setError("Nie udało się ułożyć planu. Sprawdź połączenie."); }
    setBusy(false);
  };
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4" data-testid="solo-new-plan">
      <p className="font-semibold">{ended ? "Ten plan już się skończył" : "Chcesz zmienić plan?"}</p>
      <p className="text-sm text-muted-foreground">{ended ? "Ułożymy nowy, z innymi ćwiczeniami." : "Możesz ułożyć nowy plan z innymi ćwiczeniami. Obecny trafi do archiwum."}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button className="w-full" variant={ended ? "default" : "outline"} onClick={() => void go()} disabled={busy}>{busy ? "Układamy…" : "Ułóż nowy plan"}</Button>
    </section>
  );
}
