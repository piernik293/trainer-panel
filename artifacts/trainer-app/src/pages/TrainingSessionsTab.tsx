/**
 * TrainingSessionsTab — trainer view of a client's training (tor C):
 * pain reports ("Coś boli?"), records, sessions with per-set results.
 * Sessions from the older per-exercise flow are marked "Starszy zapis".
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PainReportRow { id: number; sessionId: number; exerciseNameSnapshot: string | null; area: string; severity: number; description: string | null; createdAt: string; readByTrainerAt: string | null }
interface SessionRow { id: number; status: "in_progress" | "completed" | "aborted" | null; date: string; startedAt: string | null; endedAt: string | null; completedAt: string | null; rating: string | null; note: string | null; dayName: string | null; sets: number; pain: number; legacy: boolean; isCompleted: boolean }
interface SessionDetail {
  session: SessionRow;
  sets: { exerciseId: number; name: string | null; setNumber: number; weightKg: number | null; reps: number | null; rir: number | null; skipped: boolean }[];
  pain: PainReportRow[];
  legacyLogs: { id: number; exerciseNameSnapshot: string | null; setsCompleted: number | null; repsCompleted: number | null; weightKg: string | null; rir: number | null; note: string | null }[];
}
interface RecordRow { exerciseId: number; name: string | null; weightKg: number; reps: number; at: string | null }

const RATING: Record<string, string> = { too_easy: "Za lekko", just_right: "W sam raz", too_hard: "Za ciężko" };
const STATUS: Record<string, string> = { completed: "Ukończony", aborted: "Przerwany", in_progress: "W trakcie" };
const kg = (n: number | null) => (n == null ? "–" : `${String(n).replace(".", ",")} kg`);
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }) : "–");

export const painReportsKey = (clientId: number) => ["pain-reports", clientId] as const;
export function usePainReports(clientId: number) {
  return useQuery<PainReportRow[]>({
    queryKey: painReportsKey(clientId),
    queryFn: ({ signal }) => customFetch<PainReportRow[]>(`/api/clients/${clientId}/pain-reports`, { signal }),
    enabled: Number.isFinite(clientId) && clientId > 0,
  });
}

function PainSection({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const { data = [] } = usePainReports(clientId);
  const markRead = useMutation({
    mutationFn: (id: number) => customFetch(`/api/clients/${clientId}/pain-reports/${id}/read`, { method: "PATCH" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: painReportsKey(clientId) }); void qc.invalidateQueries({ queryKey: ["dashboard-summary"] }); },
  });
  if (data.length === 0) return null;
  return (
    <Card className="border-warning/40" data-testid="pain-reports">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Zgłoszenia bólu</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data.map((r) => (
          <div key={r.id} className={cn("rounded-lg border p-3 text-sm", r.readByTrainerAt ? "border-border" : "border-warning/50 bg-warning-soft")}>
            <div className="flex flex-wrap items-center gap-2">
              <b>{r.area}</b><span>· siła {r.severity}/5</span>
              <span className="text-muted-foreground">· {r.exerciseNameSnapshot ?? "bez ćwiczenia"} · {dt(r.createdAt)}</span>
              <Badge variant={r.readByTrainerAt ? "outline" : "default"} className="ml-auto">{r.readByTrainerAt ? "Przeczytane" : "Nowe"}</Badge>
            </div>
            {r.description && <p className="mt-1">{r.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Klient pominął to ćwiczenie i dostał komunikat, żeby przy silnym bólu skonsultować się z lekarzem.</p>
            {!r.readByTrainerAt && (
              <Button size="sm" variant="outline" className="mt-2" disabled={markRead.isPending} onClick={() => markRead.mutate(r.id)}>Oznacz jako przeczytane</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecordsSection({ clientId }: { clientId: number }) {
  const { data = [] } = useQuery<RecordRow[]>({
    queryKey: ["training-records", clientId],
    queryFn: ({ signal }) => customFetch<RecordRow[]>(`/api/clients/${clientId}/training-records`, { signal }),
  });
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-primary" aria-hidden /> Rekordy</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">Rekord = najwyższy ciężar przy tej samej lub większej liczbie powtórzeń (tylko ukończone treningi).</p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {data.map((r) => <li key={r.exerciseId} className="flex justify-between rounded border border-border px-3 py-1.5"><span>{r.name}</span><b>{kg(r.weightKg)} × {r.reps}</b></li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

function SessionDetailView({ clientId, id }: { clientId: number; id: number }) {
  const { data, isLoading } = useQuery<SessionDetail>({
    queryKey: ["training-session", clientId, id],
    queryFn: ({ signal }) => customFetch<SessionDetail>(`/api/clients/${clientId}/training-sessions/${id}`, { signal }),
  });
  if (isLoading || !data) return <p className="px-3 py-2 text-sm text-muted-foreground">Ładowanie…</p>;
  const groups = new Map<number, { name: string | null; rows: SessionDetail["sets"] }>();
  for (const s of data.sets) { const g = groups.get(s.exerciseId) ?? { name: s.name, rows: [] }; g.rows.push(s); groups.set(s.exerciseId, g); }
  return (
    <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 text-sm">
      {data.session.note && <p><b>Notatka klienta:</b> {data.session.note}</p>}
      {data.session.legacy ? (
        <>
          <p className="text-xs text-muted-foreground">Starszy zapis: wynik całego ćwiczenia (bez podziału na serie).</p>
          <ul className="space-y-1">
            {data.legacyLogs.map((l) => (
              <li key={l.id}>{l.exerciseNameSnapshot ?? "Ćwiczenie"}: {l.setsCompleted ?? "–"} serii × {l.repsCompleted ?? "–"} pow.{l.weightKg ? `, ${kg(Number(l.weightKg))}` : ""}{l.rir != null ? `, RIR ${l.rir}` : ""}{l.note ? ` — ${l.note}` : ""}</li>
            ))}
            {data.legacyLogs.length === 0 && <li className="text-muted-foreground">Brak zapisanych wyników.</li>}
          </ul>
        </>
      ) : (
        [...groups.values()].map((g) => (
          <div key={g.name}>
            <p className="font-semibold">{g.name}</p>
            <ul className="text-muted-foreground">
              {g.rows.map((r) => (
                <li key={r.setNumber}>Seria {r.setNumber}: {r.skipped ? "pominięta" : `${r.weightKg ? `${kg(r.weightKg)} × ` : ""}${r.reps ?? "–"}${r.rir != null ? ` · RIR ${r.rir === 4 ? "4+" : r.rir}` : ""}`}</li>
              ))}
            </ul>
          </div>
        ))
      )}
      {data.pain.length > 0 && <p className="text-xs text-warning">W tej sesji: {data.pain.length} zgłoszenie bólu (szczegóły u góry).</p>}
    </div>
  );
}

export default function TrainingSessionsTab({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery<SessionRow[]>({
    queryKey: ["training-sessions", clientId],
    queryFn: ({ signal }) => customFetch<SessionRow[]>(`/api/clients/${clientId}/training-sessions`, { signal }),
  });
  const visible = data.filter((s) => s.status !== "in_progress" && (s.isCompleted || s.status != null));
  return (
    <div className="space-y-4">
      <PainSection clientId={clientId} />
      <RecordsSection clientId={clientId} />
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Treningi klienta</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-3">
          {isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
          {!isLoading && visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Klient nie wykonał jeszcze żadnego treningu.</p>}
          {visible.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-card" data-testid="training-session-row">
              <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm">
                {open === s.id ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                <span className="font-semibold">{dt(s.completedAt ?? s.date)}</span>
                <span className="text-muted-foreground">{s.dayName ?? "Trening"}</span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {s.legacy ? <Badge variant="outline">Starszy zapis</Badge> : <Badge variant={s.status === "completed" ? "default" : "outline"}>{STATUS[s.status ?? ""] ?? "—"}</Badge>}
                  {s.rating && <Badge variant="outline">{RATING[s.rating]}</Badge>}
                  {!s.legacy && <span className="text-xs text-muted-foreground">{s.sets} serii</span>}
                  {s.pain > 0 && <Badge variant="destructive">Ból ×{s.pain}</Badge>}
                </span>
              </button>
              {open === s.id && <SessionDetailView clientId={clientId} id={s.id} />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
