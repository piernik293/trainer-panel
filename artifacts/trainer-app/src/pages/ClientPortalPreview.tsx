/**
 * ClientPortalPreview — safe, read-only "preview as client" mode.
 *
 * Shows the client's ACTIVE plan exactly as the client portal presents it,
 * fetched through the trainer-authenticated, read-only
 * GET /api/clients/:id/portal-preview endpoint. Nothing here can create,
 * edit or complete sessions — there are no write controls at all.
 */

import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Loader2, Dumbbell, HeartPulse } from "lucide-react";
import { NETWORK_ERROR_MESSAGE, statusMessage, humanizeError } from "@/lib/userError";

// ─── Types (mirror of the client portal plan payload) ─────────────────────────

interface PreviewExercise {
  id: number;
  exerciseName: string;
  mainMuscleGroup: string | null;
  orderInDay: number;
  workingSets: number;
  warmUpSets: number;
  repType: string | null;
  repsExact: number | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  repTimeSeconds: number | null;
  repOpenInstruction: string | null;
  loadType: string | null;
  loadValue: string | null;
  loadInstruction: string | null;
  rir: number | null;
  rpe: string | null;
  tempo: string | null;
  restSeconds: number | null;
  clientInstructions: string | null;
}

interface PreviewDay {
  id: number;
  dayOrder: number;
  dayName: string | null;
  subtitle: string | null;
  description: string | null;
  estimatedDurationMinutes: number | null;
  exercises: PreviewExercise[];
}

export interface PortalPreviewData {
  client: { id: number; firstName: string; lastName: string; cooperationMode: string };
  plan: {
    id: number;
    title: string;
    goal: string | null;
    description: string | null;
    updatedAt: string | null;
    cardioRecommendation: string | null;
    days: PreviewDay[];
  };
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    console.error("portal-preview network error:", cause);
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { cause });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMsg = (body as { error?: string }).error;
    const err = new Error(serverMsg && res.status < 500 ? serverMsg : statusMessage(res.status));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function usePortalPreview(clientId: number) {
  return useQuery({
    queryKey: ["client-portal-preview", clientId] as const,
    queryFn: ({ signal }) =>
      apiFetch<PortalPreviewData>(`/api/clients/${clientId}/portal-preview`, signal),
    enabled: Number.isFinite(clientId) && clientId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ─── Formatting (matches the client portal conventions) ───────────────────────

export function formatReps(ex: PreviewExercise): string {
  if (ex.repType === "exact" && ex.repsExact != null) return `${ex.repsExact} powt.`;
  if (ex.repRangeMin != null && ex.repRangeMax != null) return `${ex.repRangeMin}–${ex.repRangeMax} powt.`;
  if (ex.repRangeMin != null) return `${ex.repRangeMin}+ powt.`;
  if (ex.repTimeSeconds != null) return `${ex.repTimeSeconds} s`;
  if (ex.repOpenInstruction) return ex.repOpenInstruction;
  return "—";
}

function formatRest(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds} s przerwy`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${min} min przerwy` : `${min}:${String(rest).padStart(2, "0")} min przerwy`;
}

// ─── Cardio (display-only, same parse rules as the client portal) ─────────────

interface CardioSession {
  type?: string;
  durationMinutes?: number;
  intensity?: string;
  notes?: string;
}
interface CardioData {
  weeklySessions?: CardioSession[];
  progressionNote?: string;
  generalNote?: string;
}

function parseCardio(raw: string | null): CardioData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== "object" || data === null) return null;
    return data as CardioData;
  } catch {
    return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortalPreview() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const { data, isLoading, isError, error } = usePortalPreview(clientId);

  const backLink = (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/clients/${clientId}`}>
        <ArrowLeft size={14} />
        Wróć do profilu klienta
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      {/* Preview banner — always visible */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <Eye className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-amber-800 text-sm">Tryb podglądu klienta</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Widzisz plan tak, jak zobaczy go klient. W tym trybie nie można zapisywać wyników.
          </p>
        </div>
        <div className="shrink-0">{backLink}</div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !data ? (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center space-y-3" role="alert">
            <p className="text-sm text-muted-foreground">
              {humanizeError(error, "Nie udało się pobrać planu treningowego. Spróbuj ponownie.")}
            </p>
            {backLink}
          </CardContent>
        </Card>
      ) : (
        <>
          <div>
            <p className="text-sm text-muted-foreground">
              Podgląd portalu klienta — {data.client.firstName} {data.client.lastName}
            </p>
            <h1 className="text-2xl font-display font-bold tracking-tight mt-1">{data.plan.title}</h1>
            {data.plan.goal && <p className="text-sm text-muted-foreground mt-1">Cel: {data.plan.goal}</p>}
            {data.plan.description && (
              <p className="text-sm text-muted-foreground mt-1">{data.plan.description}</p>
            )}
          </div>

          {/* Training days — read-only, mirrors the client's day cards */}
          <div className="space-y-4">
            {data.plan.days.map((day) => (
              <Card key={day.id} className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b border-border/50 py-3">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <Dumbbell className="w-4 h-4" />
                    {day.dayName ?? `Dzień ${day.dayOrder}`}
                    {day.subtitle && (
                      <span className="text-sm text-muted-foreground font-normal">— {day.subtitle}</span>
                    )}
                    {day.estimatedDurationMinutes != null && (
                      <Badge variant="outline" className="text-xs ml-auto">
                        ok. {day.estimatedDurationMinutes} min
                      </Badge>
                    )}
                  </CardTitle>
                  {day.description && (
                    <p className="text-xs text-muted-foreground mt-1">{day.description}</p>
                  )}
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border/30">
                  {day.exercises.map((ex) => (
                    <div key={ex.id} className="px-4 py-3">
                      <p className="text-sm font-medium">{ex.exerciseName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ex.workingSets} × {formatReps(ex)}
                        {ex.rir != null && ` · RIR ${ex.rir}`}
                        {ex.tempo && ` · tempo ${ex.tempo}`}
                        {formatRest(ex.restSeconds) && ` · ${formatRest(ex.restSeconds)}`}
                      </p>
                      {ex.loadInstruction && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ex.loadInstruction}</p>
                      )}
                      {ex.clientInstructions && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{ex.clientInstructions}</p>
                      )}
                    </div>
                  ))}
                  {day.exercises.length === 0 && (
                    <p className="px-4 py-4 text-sm text-muted-foreground">Brak ćwiczeń w tym dniu.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cardio — display-only, as in the client portal */}
          {(() => {
            const cardio = parseCardio(data.plan.cardioRecommendation);
            if (!cardio) return null;
            return (
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b border-border/50 py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HeartPulse className="w-4 h-4" />
                    Cardio / aktywność dodatkowa
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-2 text-sm">
                  {cardio.weeklySessions?.map((s, i) => (
                    <p key={i}>
                      {s.type ?? "Cardio"}
                      {s.durationMinutes != null && ` · ${s.durationMinutes} min`}
                      {s.intensity && ` · ${s.intensity}`}
                      {s.notes && <span className="text-muted-foreground"> — {s.notes}</span>}
                    </p>
                  ))}
                  {cardio.generalNote && <p className="text-muted-foreground">{cardio.generalNote}</p>}
                  {cardio.progressionNote && (
                    <p className="text-muted-foreground">Progresja: {cardio.progressionNote}</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <div>{backLink}</div>
        </>
      )}
    </div>
  );
}
