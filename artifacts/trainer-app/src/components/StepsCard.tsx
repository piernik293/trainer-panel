/**
 * Steps of a client (blok 6): week average, goal progress, last 7 days; the trainer can set the daily goal.
 * Steps are typed in by the client — information only, no health claims.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Footprints } from "lucide-react";

export interface StepsSummary {
  today: string; goal: number | null; todaySteps: number | null; todayPercent: number | null;
  days: { date: string; steps: number | null }[]; average: number | null; daysAtGoal: number | null; averagePercent: number | null;
}
const PRESETS = [6000, 8000, 10000];
const nf = (n: number) => n.toLocaleString("pl-PL");
const key = (clientId: number) => ["client-steps", clientId] as const;

export function StepsCard({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery<StepsSummary>({
    queryKey: key(clientId),
    queryFn: ({ signal }) => customFetch<StepsSummary>(`/api/clients/${clientId}/steps`, { signal }),
    enabled: Number.isFinite(clientId) && clientId > 0,
  });
  const setGoal = useMutation({
    mutationFn: (goal: number | null) => customFetch<StepsSummary>(`/api/clients/${clientId}/steps-goal`, { method: "PUT", body: JSON.stringify({ goal }), headers: { "Content-Type": "application/json" } }),
    onSuccess: (s) => { qc.setQueryData(key(clientId), s); setError(null); setCustom(""); },
    onError: () => setError("Nie udało się zapisać celu."),
  });
  if (!data) return null;

  const max = Math.max(1, data.goal ?? 0, ...data.days.map((d) => d.steps ?? 0));
  function submitCustom() {
    const n = Number(custom.replace(/\s/g, ""));
    if (!Number.isInteger(n) || n < 1000 || n > 100000) { setError("Cel: liczba od 1 000 do 100 000."); return; }
    setGoal.mutate(n);
  }

  return (
    <Card className="border-border/50 shadow-sm" data-testid="steps-card">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Footprints className="h-4 w-4" aria-hidden /> Kroki</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Średnia tygodnia: <b data-testid="steps-card-average">{data.average === null ? "brak wpisów" : `${nf(data.average)} dziennie`}</b></span>
          <span>Cel: <b data-testid="steps-card-goal">{data.goal ? nf(data.goal) : "nie ustawiono"}</b></span>
          {data.goal && data.averagePercent !== null && <span data-testid="steps-card-percent">Realizacja celu (średnia): <b>{data.averagePercent}%</b>{data.daysAtGoal !== null ? ` · ${data.daysAtGoal} z 7 dni z celem` : ""}</span>}
        </div>
        <div className="flex items-end gap-1.5" aria-label="Kroki z ostatnich 7 dni">
          {data.days.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={d.steps === null ? `${d.date}: brak wpisu` : `${d.date}: ${nf(d.steps)}`}>
              <div className="flex h-14 w-full items-end"><div className="w-full rounded-t bg-primary/60" style={{ height: d.steps ? `${Math.max(4, Math.round((d.steps / max) * 100))}%` : "2px" }} /></div>
              <span className="text-[11px] text-muted-foreground">{d.date.slice(8)}.{d.date.slice(5, 7)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Ustaw cel:</span>
          {PRESETS.map((g) => <button key={g} type="button" className={`h-8 rounded-md border px-2.5 text-xs font-semibold ${data.goal === g ? "border-primary bg-primary/10" : "border-border"}`} onClick={() => setGoal.mutate(g)}>{nf(g)}</button>)}
          <input aria-label="Własny cel kroków" inputMode="numeric" className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs" placeholder="własny" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); }} />
          <button type="button" className="h-8 rounded-md border border-border px-2.5 text-xs" onClick={submitCustom}>Zapisz</button>
          {data.goal && <button type="button" className="h-8 rounded-md border border-border px-2.5 text-xs" onClick={() => setGoal.mutate(null)}>Bez celu</button>}
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
