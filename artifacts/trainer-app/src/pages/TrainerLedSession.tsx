/**
 * TrainerLedSession — trainer runs an in-person workout with the client.
 *
 * Available only for clients with cooperation mode `in_person` or `hybrid`
 * (the server enforces this too). The trainer picks a training day, the
 * server safely gets-or-creates ONE active trainer-led session (409 if the
 * client already has an active self-directed session for that day), the
 * trainer records results per exercise and completes the session. Results
 * land in the same workout history the client portal uses, tagged
 * performedBy='trainer' / sessionMode='in_person'.
 */

import { useState } from "react";
import { clientFullName } from "@/lib/clientName";
import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Dumbbell, Loader2, CheckCircle2, Play, UserCheck } from "lucide-react";
import { usePortalPreview, formatReps, type PortalPreviewData } from "./ClientPortalPreview";
import { NETWORK_ERROR_MESSAGE, statusMessage, humanizeError } from "@/lib/userError";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    console.error("trainer-session network error:", cause);
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { cause });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const serverMsg = (data as { error?: string }).error;
    const err = new Error(serverMsg && res.status < 500 ? serverMsg : statusMessage(res.status));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

interface SessionLog {
  id: number;
  planExerciseId: number | null;
  setsCompleted: number | null;
  repsCompleted: number | null;
  weightKg: string | null;
  rir: number | null;
  note: string | null;
  isCompleted: boolean;
}

interface OpenSessionResponse {
  session: {
    id: number;
    planDayId: number;
    sessionDate: string;
    isCompleted: boolean;
    notes: string | null;
    logs: SessionLog[];
  };
  previous: Record<
    number,
    {
      weightKg: string | null;
      repsCompleted: number | null;
      setsCompleted: number | null;
      rir: number | null;
      completedAt: string | null;
      suggestion: "increase" | "maintain" | "repeat_or_reduce" | null;
    }
  >;
}

// ─── Per-exercise row state ───────────────────────────────────────────────────

interface RowState {
  setsCompleted: string;
  repsCompleted: string;
  weightKg: string;
  rir: string;
  note: string;
  isCompleted: boolean;
}

interface OpenSessionVariables {
  dayId: number;
  planId: number;
  exerciseIds: number[];
}

interface SaveExerciseVariables {
  planExerciseId: number;
  row: RowState;
  sessionId: number;
}

interface CompleteSessionVariables {
  clientId: number;
  sessionId: number;
  notes: string | null;
}

function rowFromLog(log: SessionLog | undefined): RowState {
  return {
    setsCompleted: log?.setsCompleted != null ? String(log.setsCompleted) : "",
    repsCompleted: log?.repsCompleted != null ? String(log.repsCompleted) : "",
    weightKg: log?.weightKg ?? "",
    rir: log?.rir != null ? String(log.rir) : "",
    note: log?.note ?? "",
    isCompleted: log?.isCompleted ?? false,
  };
}

function rowToBody(row: RowState) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    setsCompleted: num(row.setsCompleted),
    repsCompleted: num(row.repsCompleted),
    weightKg: num(row.weightKg),
    rir: num(row.rir),
    note: row.note.trim() === "" ? null : row.note.trim(),
    isCompleted: row.isCompleted,
  };
}

const SUGGESTION_LABEL: Record<string, string> = {
  increase: "Sugestia: zwiększ obciążenie",
  maintain: "Sugestia: utrzymaj obciążenie",
  repeat_or_reduce: "Sugestia: powtórz lub zmniejsz",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrainerLedSession() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preview, isLoading, isError, error } = usePortalPreview(clientId);

  const [opened, setOpened] = useState<OpenSessionResponse | null>(null);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [sessionNotes, setSessionNotes] = useState("");
  const [finished, setFinished] = useState(false);

  const openSession = useMutation({
    mutationFn: ({ dayId, planId }: OpenSessionVariables) =>
      apiSend<OpenSessionResponse>("POST", `/api/clients/${clientId}/trainer-sessions/open`, {
        planId,
        planDayId: dayId,
      }),
    onSuccess: (data, { dayId, exerciseIds }) => {
      setOpened(data);
      setActiveDayId(dayId);
      setSessionNotes(data.session.notes ?? "");
      const logByExercise = new Map(data.session.logs.map((l) => [l.planExerciseId, l]));
      const next: Record<number, RowState> = {};
      for (const exerciseId of exerciseIds) {
        next[exerciseId] = rowFromLog(logByExercise.get(exerciseId));
      }
      setRows(next);
    },
    onError: (err) => {
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const saveExercise = useMutation({
    mutationFn: ({ planExerciseId, row, sessionId }: SaveExerciseVariables) =>
      apiSend<SessionLog>(
        "PUT",
        `/api/clients/${clientId}/trainer-sessions/${sessionId}/exercises/${planExerciseId}`,
        rowToBody(row),
      ),
    onError: (err) => {
      // Entered values stay on screen — state is local; only the save failed.
      toast({
        title: "Nie udało się zapisać treningu. Wprowadzone dane pozostają na ekranie — spróbuj ponownie.",
        variant: "destructive",
      });
    },
  });

  const completeSession = useMutation({
    mutationFn: ({ clientId: mutationClientId, sessionId, notes }: CompleteSessionVariables) =>
      apiSend("PATCH", `/api/clients/${mutationClientId}/trainer-sessions/${sessionId}`, {
        isCompleted: true,
        notes,
      }),
    onSuccess: (_, { clientId: mutationClientId }) => {
      setFinished(true);
      queryClient.invalidateQueries({ queryKey: ["client-workout-sessions", mutationClientId] });
      toast({ title: "Sesja zakończona i zapisana w historii klienta" });
    },
    onError: (err) => {
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const updateRow = (planExerciseId: number, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [planExerciseId]: { ...prev[planExerciseId]!, ...patch } }));
  };

  const saveRow = (planExerciseId: number) => {
    const row = rows[planExerciseId];
    if (!row || !opened) return;
    saveExercise.mutate({ planExerciseId, row, sessionId: opened.session.id });
  };

  const finishSession = () => {
    if (!opened) return;
    completeSession.mutate({
      clientId,
      sessionId: opened.session.id,
      notes: sessionNotes.trim() === "" ? null : sessionNotes.trim(),
    });
  };

  const backLink = (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/clients/${clientId}`}>
        <ArrowLeft size={14} />
        Wróć do profilu klienta
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !preview) {
    return (
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {humanizeError(error, "Nie udało się pobrać planu treningowego. Spróbuj ponownie.")}
        </p>
        {backLink}
      </div>
    );
  }

  const activeDay = activeDayId != null ? preview.plan.days.find((d) => d.id === activeDayId) : null;

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <UserCheck size={14} />
            Trening stacjonarny z trenerem
          </p>
          <h1 className="text-2xl font-display font-bold tracking-tight mt-1">
            {clientFullName(preview.client)} — {preview.plan.title}
          </h1>
        </div>
        {backLink}
      </div>

      {finished ? (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <p className="font-medium">Sesja zakończona.</p>
            <p className="text-sm text-muted-foreground">
              Wyniki zostały zapisane w historii treningów klienta jako trening stacjonarny z trenerem.
            </p>
            {backLink}
          </CardContent>
        </Card>
      ) : !opened || !activeDay ? (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              Wybierz dzień treningowy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {preview.plan.days.map((day) => (
              <div
                key={day.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {day.dayName ?? `Dzień ${day.dayOrder}`}
                    {day.subtitle && (
                      <span className="text-muted-foreground font-normal"> — {day.subtitle}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {day.exercises.length} ćwiczeń
                    {day.estimatedDurationMinutes != null && ` · ok. ${day.estimatedDurationMinutes} min`}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={openSession.isPending}
                  onClick={() =>
                    openSession.mutate({
                      dayId: day.id,
                      planId: preview.plan.id,
                      exerciseIds: day.exercises.map((exercise) => exercise.id),
                    })
                  }
                >
                  <Play size={14} />
                  Rozpocznij
                </Button>
              </div>
            ))}
            {preview.plan.days.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Plan nie ma dni treningowych.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50 py-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Dumbbell className="w-4 h-4" />
                {activeDay.dayName ?? `Dzień ${activeDay.dayOrder}`}
                {activeDay.subtitle && (
                  <span className="text-sm text-muted-foreground font-normal">— {activeDay.subtitle}</span>
                )}
                <Badge variant="outline" className="text-xs ml-auto border-blue-300 text-blue-700">
                  Sesja prowadzona przez trenera
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Wyniki zapisują się przy opuszczeniu pola. Zakończ sesję przyciskiem na dole.
              </p>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/30">
              {activeDay.exercises.map((ex) => {
                const row = rows[ex.id];
                const prev = opened.previous[ex.id];
                if (!row) return null;
                return (
                  <div key={ex.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{ex.exerciseName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Cel: {ex.workingSets} × {formatReps(ex)}
                          {ex.rir != null && ` · RIR ${ex.rir}`}
                        </p>
                        {prev && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Poprzednio:{" "}
                            {[
                              prev.setsCompleted != null ? `${prev.setsCompleted} serii` : null,
                              prev.repsCompleted != null ? `${prev.repsCompleted} powt.` : null,
                              prev.weightKg ? `${prev.weightKg} kg` : null,
                              prev.rir != null ? `RIR ${prev.rir}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            {prev.suggestion && (
                              <span className="text-blue-600"> · {SUGGESTION_LABEL[prev.suggestion]}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={row.isCompleted}
                          onChange={(e) => {
                            updateRow(ex.id, { isCompleted: e.target.checked });
                            const updated = { ...row, isCompleted: e.target.checked };
                            if (opened) {
                              saveExercise.mutate({
                                planExerciseId: ex.id,
                                row: updated,
                                sessionId: opened.session.id,
                              });
                            }
                          }}
                          className="h-4 w-4 accent-primary"
                        />
                        Wykonane
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Serie</label>
                        <Input
                          type="number"
                          min={0}
                          value={row.setsCompleted}
                          onChange={(e) => updateRow(ex.id, { setsCompleted: e.target.value })}
                          onBlur={() => saveRow(ex.id)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Powtórzenia</label>
                        <Input
                          type="number"
                          min={0}
                          value={row.repsCompleted}
                          onChange={(e) => updateRow(ex.id, { repsCompleted: e.target.value })}
                          onBlur={() => saveRow(ex.id)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Ciężar (kg)</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={row.weightKg}
                          onChange={(e) => updateRow(ex.id, { weightKg: e.target.value })}
                          onBlur={() => saveRow(ex.id)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">RIR</label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={row.rir}
                          onChange={(e) => updateRow(ex.id, { rir: e.target.value })}
                          onBlur={() => saveRow(ex.id)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <Input
                      placeholder="Notatka do ćwiczenia (opcjonalnie)"
                      value={row.note}
                      onChange={(e) => updateRow(ex.id, { note: e.target.value })}
                      onBlur={() => saveRow(ex.id)}
                      className="h-8 text-sm"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Notatka do sesji (opcjonalnie)</label>
                <Textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Uwagi z treningu..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/clients/${clientId}`)}
                  disabled={completeSession.isPending}
                >
                  Dokończ później
                </Button>
                <Button
                  className="gap-1.5"
                  disabled={completeSession.isPending}
                  onClick={finishSession}
                >
                  {completeSession.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  Zakończ sesję
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
