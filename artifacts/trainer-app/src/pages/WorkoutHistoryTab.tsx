/**
 * WorkoutHistoryTab — trainer view of a client's workout sessions.
 * Shows a list of past sessions (newest first) with drill-down to
 * prescribed vs. actual exercise detail.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ChevronRight, ChevronDown, Dumbbell } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummary {
  id: number;
  planId: number;
  planDayId: number;
  sessionDate: string;
  isCompleted: boolean;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  planTitle: string;
  dayName: string | null;
  daySubtitle: string | null;
  performedBy: "client" | "trainer";
  sessionMode: "self_directed" | "in_person";
}

interface ExerciseDetail {
  planExerciseId: number;
  exerciseName: string;
  orderInDay: number;
  // Prescription
  workingSets: number;
  repType: string | null;
  repsExact: number | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  rir: number | null;
  loadType: string | null;
  loadValue: string | null;
  restSeconds: number | null;
  // Actual
  actual: {
    setsCompleted: number | null;
    repsCompleted: number | null;
    weightKg: string | null;
    rir: number | null;
    note: string | null;
    isCompleted: boolean;
  } | null;
}

interface SessionDetail extends SessionSummary {
  exercises: ExerciseDetail[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrescription(ex: ExerciseDetail): string {
  const sets = ex.workingSets;
  let reps = "";
  if (ex.repType === "exact" && ex.repsExact) reps = `${ex.repsExact} pow.`;
  else if (ex.repRangeMin && ex.repRangeMax) reps = `${ex.repRangeMin}–${ex.repRangeMax} pow.`;
  else if (ex.repRangeMin) reps = `${ex.repRangeMin}+ pow.`;
  const rir = ex.rir != null ? ` · RIR ${ex.rir}` : "";
  return `${sets} × ${reps}${rir}`;
}

function formatActual(ex: ExerciseDetail): string {
  const a = ex.actual;
  if (!a) return "—";
  const parts: string[] = [];
  if (a.setsCompleted != null) parts.push(`${a.setsCompleted} serii`);
  if (a.repsCompleted != null) parts.push(`${a.repsCompleted} pow.`);
  if (a.weightKg) parts.push(`${a.weightKg} kg`);
  if (a.rir != null) parts.push(`RIR ${a.rir}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useClientSessions(clientId: number) {
  return useQuery({
    queryKey: ["client-workout-sessions", clientId] as const,
    queryFn: () => apiFetch<SessionSummary[]>(`/api/clients/${clientId}/workout-sessions`),
    staleTime: 30_000,
  });
}

function useSessionDetail(clientId: number, sessionId: number | null) {
  return useQuery({
    queryKey: ["client-workout-session-detail", clientId, sessionId] as const,
    queryFn: () =>
      apiFetch<SessionDetail>(`/api/clients/${clientId}/workout-sessions/${sessionId}`),
    enabled: sessionId != null,
    staleTime: 30_000,
  });
}

// ─── SessionDetailPanel ───────────────────────────────────────────────────────

function SessionDetailPanel({
  clientId,
  session,
  onClose,
}: {
  clientId: number;
  session: SessionSummary;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useSessionDetail(clientId, session.id);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">
            {session.dayName ?? "Sesja treningowa"}
            {session.daySubtitle && <span className="text-muted-foreground font-normal ml-2 text-sm">— {session.daySubtitle}</span>}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.planTitle} · {new Date(session.sessionDate).toLocaleDateString("pl-PL")}
            {session.performedBy === "trainer" && " · Wyniki zapisane przez trenera"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Zamknij</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !detail ? (
        <p className="text-sm text-muted-foreground py-4">Nie udało się załadować szczegółów sesji.</p>
      ) : (
        <div className="space-y-3">
          {/* Session notes */}
          {detail.notes && (
            <div className="bg-muted/30 border border-border/50 rounded px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">Notatka klienta</p>
              <p>{detail.notes}</p>
            </div>
          )}

          {/* Exercises table */}
          <div className="border border-border/50 rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 bg-muted/30 px-4 py-2 text-xs text-muted-foreground font-medium uppercase tracking-wide border-b border-border/50">
              <span>Ćwiczenie</span>
              <span className="text-right">Przepis</span>
              <span className="text-right">Wykonane</span>
              <span className="text-right">Status</span>
            </div>
            {detail.exercises.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Brak ćwiczeń w tym dniu.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {detail.exercises.map((ex) => (
                  <div
                    key={ex.planExerciseId}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-start px-4 py-3 hover:bg-muted/10"
                  >
                    <div>
                      <p className="text-sm font-medium">{ex.exerciseName}</p>
                      {ex.actual?.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">"{ex.actual.note}"</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground text-right pt-0.5 whitespace-nowrap">
                      {formatPrescription(ex)}
                    </span>
                    <span
                      className={cn(
                        "text-sm text-right whitespace-nowrap",
                        ex.actual ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {formatActual(ex)}
                    </span>
                    <div className="flex justify-end pt-0.5">
                      {ex.actual?.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-white/20 shrink-0 block" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

export default function WorkoutHistoryTab({ clientId }: { clientId: number }) {
  const { data: sessions, isLoading } = useClientSessions(clientId);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="bg-muted/20 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <Dumbbell className="w-4 h-4" />
          Historia sesji treningowych
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!sessions || sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground space-y-2">
            <Dumbbell className="w-8 h-8 mx-auto opacity-20" />
            <p className="text-sm">Klient nie zarejestrował jeszcze żadnej sesji treningowej.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sessions.map((s) => {
              const isOpen = expandedId === s.id;
              return (
                <div key={s.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
                    className="w-full flex items-start gap-3 text-left hover:bg-muted/10 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div className="shrink-0 pt-0.5">
                      {s.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-yellow-500/50 block mt-0.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.dayName ?? "Sesja"}</span>
                        {s.daySubtitle && (
                          <span className="text-xs text-muted-foreground">— {s.daySubtitle}</span>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs px-1.5 py-0",
                            s.isCompleted
                              ? "border-green-500/30 text-green-600"
                              : "border-yellow-500/30 text-yellow-600",
                          )}
                        >
                          {s.isCompleted ? "Ukończona" : "W trakcie"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs px-1.5 py-0",
                            s.performedBy === "trainer"
                              ? "border-blue-500/30 text-blue-600"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {s.performedBy === "trainer"
                            ? "Trening stacjonarny z trenerem"
                            : "Trening samodzielny"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.planTitle} · {new Date(s.sessionDate).toLocaleDateString("pl-PL")}
                        {s.completedAt && (
                          <> · zakończono {new Date(s.completedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <SessionDetailPanel
                      clientId={clientId}
                      session={s}
                      onClose={() => setExpandedId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
