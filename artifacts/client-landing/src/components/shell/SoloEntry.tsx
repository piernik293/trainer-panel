/** Osoba bez planu i bez trenera (Solo) widzi pełny portal z dolnym paskiem; z trenerem — dotychczasowy komunikat (fallback). */
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { PortalShell } from "./PortalShell";
import type { ShellTab } from "./BottomBar";
import { SoloToday } from "./SoloToday";
import { ProgressContainer, YouContainer } from "./ShellContainers";

import { IfBrand, Loading, ErrorState, EmptyState, PlanBuilding, Maskotka, LoginSequence } from "@workspace/design-tokens/brand";
interface Status { linked: boolean; firstName?: string; hasSurvey?: boolean; trainerName?: string | null; pendingTrainerName?: string | null }

export function SoloEntry({ achievementsOn, onPlanReady, fallback }: { achievementsOn: boolean; onPlanReady: () => void; fallback: ReactNode }) {
  // `fallback` (stary pełnoekranowy komunikat) zostaje tylko, gdy status konta jest nieczytelny.
  const [status, setStatus] = useState<Status | null | "loading">("loading");
  const [tab, setTab] = useState<ShellTab>("dzis");
  useEffect(() => { let alive = true; fetch("/api/account/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (alive) setStatus(s); }).catch(() => { if (alive) setStatus(null); }); return () => { alive = false; }; }, []);
  if (status === "loading") return <IfBrand fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Ładowanie" /></div>}><Loading fullScreen /></IfBrand>;
  if (!status) return <>{fallback}</>;
  const firstName = status.firstName ?? "Ty";
  // Podopieczny trenera bez aktywnego planu: ten sam portal z dolnym paskiem (żeby mógł wejść w „Ty”), a na „Dziś” jedno zdanie, na co czeka.
  const today = status.linked
    ? <div className="space-y-2" data-testid="linked-no-plan"><p className="section-label">Dziś</p><h1 className="text-2xl font-bold tracking-tight">Cześć, {firstName}!</h1><p className="text-muted-foreground">{status.trainerName ?? "Twój trener"} układa Twój plan. Gdy będzie gotowy, zobaczysz go tutaj.</p></div>
    : <SoloToday firstName={firstName} hasSurvey={!!status.hasSurvey} onPlanReady={onPlanReady} />;
  return (
    <PortalShell tab={tab} onTab={(t) => { setTab(t); window.scrollTo({ top: 0 }); }}>
      {tab === "dzis" && today}
      {tab === "plan" && <div className="space-y-4"><h1 className="text-2xl font-bold tracking-tight">Plan</h1><p className="text-sm text-muted-foreground">Nie masz jeszcze planu.</p>{today}</div>}
      {tab === "postepy" && <ProgressContainer achievementsOn={achievementsOn} />}
      {tab === "ty" && <YouContainer firstName={firstName} lastName="" />}
    </PortalShell>
  );
}
