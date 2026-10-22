import { useState, useId } from "react";
import { humanizeError } from "@/lib/userError";
import { useParams, Link } from "wouter";
import {
  useGetClient,
  getGetClientQueryKey,
  useGetClientSurvey,
  useListClientSurveys,
  useGetClientSurveyById,
  useUpdateClient,
  useListClientNotes,
  useCreateClientNote,
  useUpdateClientNote,
  useDeleteClientNote,
  getListClientNotesQueryKey,
  getListClientsQueryKey,
  useGetClientAvoidedExercises,
  useUpsertClientSurvey,
  getClientAvoidedExercisesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { AvoidedExercisesPicker, type AvoidedExercise } from "@/components/AvoidedExercisesPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Printer, FileEdit, Phone, Mail, Calendar, ClipboardList, History, StickyNote, Trash2, Pencil, Dumbbell, Sparkles, Link2, Moon, Activity, Copy, Send, UserCheck, ShieldOff, RefreshCw, Eye, Play } from "lucide-react";
import { CollapsibleSurveySection, DetailRow } from "@/components/CollapsibleSurveySection";
import ExerciseRecommendationsTab from "./ExerciseRecommendationsTab";
import WorkoutHistoryTab from "./WorkoutHistoryTab";
import { formatDate } from "@/lib/utils";
import { clientStatusLabel, surveyStatusLabel } from "@/lib/client-status";
import { useToast } from "@/hooks/use-toast";
import { useListClientPlans, useDeletePlan, type WorkoutPlanSummary } from "@/lib/planApi";

function calculateAgeFromSurvey(dateOfBirth: string | null | undefined, legacyAge: number | null | undefined): number | undefined {
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    }
  }
  return legacyAge ?? undefined;
}

function formatDateOfBirth(dateOfBirth: string | null | undefined): string | undefined {
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return undefined;
  return dob.toLocaleDateString("pl-PL");
}

function formatGender(gender: string | null | undefined): string | undefined {
  if (!gender) return undefined;
  if (gender === "Mężczyzna" || gender === "Kobieta") return gender;
  return "Nieokreślono";
}

function calculateBmi(heightCm: number | null | undefined, weightKg: number | null | undefined): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const heightM = heightCm / 100;
  if (heightM <= 0) return undefined;
  return weightKg / (heightM * heightM);
}

const BMI_RECOMMENDATION_TEXT =
  "Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj jednak, że BMI nie rozróżnia tkanki tłuszczowej od masy mięśniowej. W wielu przypadkach dobrym rozwiązaniem może być redukcja tkanki tłuszczowej lub rekompozycja sylwetki.";

// ─── Recovery quality — client-side derivation (mirrors server logic) ─────────

function deriveRecoveryQualityClient(
  sleepHoursRaw: string | number | null | undefined,
  stressLevel: number | null | undefined,
  activityLevel: string | null | undefined,
): "excellent" | "good" | "standard" | "poor" | null {
  const parsed =
    sleepHoursRaw == null
      ? null
      : typeof sleepHoursRaw === "number"
        ? sleepHoursRaw
        : parseInt(String(sleepHoursRaw), 10);
  const sleep = parsed != null && !isNaN(parsed) ? parsed : null;
  const stress = stressLevel ?? null;
  if (sleep === null && stress === null) return null;
  const s = sleep ?? 7;
  const st = stress ?? 5;
  const physicalWork = activityLevel === "Praca fizyczna";
  if (s >= 8 && st <= 3 && !physicalWork) return "excellent";
  if (s >= 7 && st <= 5) return "good";
  if (s >= 6 && st <= 7) return "standard";
  return "poor";
}

const RECOVERY_LABEL: Record<string, string> = {
  excellent: "Doskonała",
  good: "Dobra",
  standard: "Umiarkowana",
  poor: "Słaba",
};

const RECOVERY_BADGE_CLASS: Record<string, string> = {
  excellent: "bg-green-50 text-green-700 border-green-200",
  good: "bg-blue-50 text-blue-700 border-blue-200",
  standard: "bg-amber-50 text-amber-700 border-amber-200",
  poor: "bg-red-50 text-red-700 border-red-200",
};

// ─── Cooperation mode (Forma współpracy) ─────────────────────────────────────

type CooperationMode = "online" | "in_person" | "hybrid";

const COOPERATION_OPTIONS: { value: CooperationMode; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "Stacjonarnie" },
  { value: "hybrid", label: "Hybrydowo" },
];

const COOPERATION_EXPLANATION: Record<CooperationMode, string> = {
  online: "Klient realizuje plan samodzielnie i zapisuje wyniki w portalu.",
  in_person: "Klient trenuje z trenerem. Trener może prowadzić sesję i zapisywać wyniki.",
  hybrid: "Klient łączy treningi samodzielne z treningami prowadzonymi przez trenera.",
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "Szkic",
  active: "Aktywny",
  archived: "Zarchiwizowany",
};
const PLAN_STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-700 border-green-200",
  archived: "bg-gray-100 text-gray-500",
};

function PlansTab({
  clientId,
  cooperationMode,
}: {
  clientId: number;
  cooperationMode: CooperationMode;
}) {
  const { toast } = useToast();
  const { data: plans, isLoading } = useListClientPlans(clientId);
  const deletePlan = useDeletePlan(clientId);
  const trainerLed = cooperationMode === "in_person" || cooperationMode === "hybrid";
  const hasActivePlan = !!plans?.some((p) => p.status === "active");

  const handleDelete = (plan: WorkoutPlanSummary) => {
    if (!window.confirm(`Usunąć plan "${plan.title}"?`)) return;
    deletePlan.mutate(plan.id, {
      onError: (err) => toast({ title: humanizeError(err), variant: "destructive" }),
    });
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="bg-muted/20 border-b border-border/50 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Dumbbell className="w-4 h-4" />
          Plany treningowe
        </CardTitle>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link href={`/clients/${clientId}/plans/new`}>
              <ClipboardList size={14} />
              Nowy plan
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link href={`/clients/${clientId}/plans/generate`}>
              <Sparkles size={14} />
              Generuj szkic
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {hasActivePlan && (
          <div className="flex gap-2 flex-wrap mb-4">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/clients/${clientId}/portal-preview`}>
                <Eye size={14} />
                Podejrzyj jako klient
              </Link>
            </Button>
            {trainerLed && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={`/clients/${clientId}/trainer-session`}>
                  <Play size={14} />
                  Rozpocznij trening z klientem
                </Link>
              </Button>
            )}
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : !plans || plans.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Brak planów treningowych.</p>
            <p className="text-xs mt-1">
              Utwórz plan na podstawie wywiadu treningowego klienta.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/20 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{plan.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 ${PLAN_STATUS_CLASS[plan.status] ?? ""}`}
                    >
                      {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Poziom: {plan.experienceLevelUsed} · Utworzony {formatDate(plan.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/plans/${plan.id}`}>Edytuj</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(plan)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  const { data: client, isLoading: clientLoading, isError: clientIsError, error: clientError } = useGetClient(id, {
    query: {
      enabled: !!id,
      queryKey: getGetClientQueryKey(id),
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 404) return false;
        return failureCount < 2;
      },
    }
  });

  const { data: survey, isLoading: surveyLoading } = useGetClientSurvey(id, {
    query: { enabled: !!client?.hasSurvey, queryKey: ['client-survey', id] as any }
  });

  const { data: surveyHistory } = useListClientSurveys(id, {
    query: { enabled: !!client?.hasSurvey, queryKey: ['client-surveys-history', id] as any }
  });

  const { data: selectedSurvey } = useGetClientSurveyById(id, selectedSurveyId as number, {
    query: { enabled: !!selectedSurveyId, queryKey: ['client-survey-by-id', id, selectedSurveyId] as any }
  });

  const { data: notes } = useListClientNotes(id, {
    query: { enabled: !!id, queryKey: getListClientNotesQueryKey(id) }
  });

  const updateClient = useUpdateClient();
  const createNote = useCreateClientNote();
  const updateNote = useUpdateClientNote();
  const deleteNote = useDeleteClientNote();

  const bmi = calculateBmi(survey?.heightCm, survey?.weightKg);
  const showBmiRecommendation = (survey?.experienceLevel === "Brak aktywności fizycznej" || survey?.experienceLevel === "Początkujący") && bmi !== undefined && bmi >= 25;

  const handlePrint = () => {
    window.print();
  };

  const handleCooperationModeChange = (mode: CooperationMode) => {
    updateClient.mutate(
      { id, data: { cooperationMode: mode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          toast({ title: "Forma współpracy zaktualizowana" });
        },
        onError: () => {
          toast({ title: "Nie udało się zmienić formy współpracy", variant: "destructive" });
        },
      }
    );
  };

  const handleStatusChange = (status: string) => {
    updateClient.mutate(
      { id, data: { status: status as "active" | "paused" | "finished" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          toast({ title: "Status klienta zaktualizowany" });
        },
        onError: () => {
          toast({ title: "Nie udało się zmienić statusu", variant: "destructive" });
        },
      }
    );
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    createNote.mutate(
      { clientId: id, data: { content: noteContent.trim() } },
      {
        onSuccess: () => {
          setNoteContent("");
          queryClient.invalidateQueries({ queryKey: getListClientNotesQueryKey(id) });
        },
        onError: () => toast({ title: "Nie udało się zapisać notatki", variant: "destructive" }),
      }
    );
  };

  const handleSaveNoteEdit = () => {
    if (editingNoteId === null || !editingNoteContent.trim()) return;
    updateNote.mutate(
      { clientId: id, noteId: editingNoteId, data: { content: editingNoteContent.trim() } },
      {
        onSuccess: () => {
          setEditingNoteId(null);
          setEditingNoteContent("");
          queryClient.invalidateQueries({ queryKey: getListClientNotesQueryKey(id) });
        },
        onError: () => toast({ title: "Nie udało się zapisać zmian", variant: "destructive" }),
      }
    );
  };

  const handleDeleteNote = (noteId: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć tę notatkę?")) return;
    deleteNote.mutate(
      { clientId: id, noteId },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListClientNotesQueryKey(id) }),
        onError: () => toast({ title: "Nie udało się usunąć notatki", variant: "destructive" }),
      }
    );
  };

  if (clientLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie profilu...</div>;
  }

  if (clientIsError) {
    const status = (clientError as { status?: number })?.status;
    if (status === 401) {
      return (
        <div className="p-8 text-center space-y-3">
          <p className="text-destructive font-medium">Sesja wygasła lub brak dostępu.</p>
          <Link href="/sign-in" className="text-primary hover:underline text-sm inline-block">
            Zaloguj się ponownie
          </Link>
        </div>
      );
    }
    if (status === 404) {
      return (
        <div className="p-8 text-center space-y-3">
          <p className="text-muted-foreground">Klient nie istnieje lub nie masz do niego dostępu.</p>
          <Link href="/clients" className="text-primary hover:underline text-sm inline-block">
            Powrót do listy klientów
          </Link>
        </div>
      );
    }
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">Błąd połączenia z serwerem.</p>
        <button
          onClick={() => window.location.reload()}
          className="text-primary hover:underline text-sm inline-block"
        >
          Spróbuj odświeżyć stronę
        </button>
      </div>
    );
  }

  if (!client) {
    return <div className="p-8 text-center text-destructive">Nie znaleziono klienta</div>;
  }

  const displayedSurvey = selectedSurveyId ? selectedSurvey : survey;
  const isViewingArchival = !!selectedSurveyId && surveyHistory && surveyHistory.length > 0 && selectedSurveyId !== surveyHistory[0]?.id;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 no-print">
        <div className="space-y-2">
          <Link href="/clients" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ArrowLeft size={16} />
            Powrót do listy
          </Link>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3 flex-wrap">
            {client.firstName} {client.lastName}
            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent text-xs font-medium py-1">
              {surveyStatusLabel(client.surveyStatus)}
            </Badge>
          </h1>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm text-muted-foreground">Status klienta:</span>
            <Select value={client.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktywny</SelectItem>
                <SelectItem value="paused">Wstrzymany</SelectItem>
                <SelectItem value="finished">Zakończony</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Forma współpracy:</span>
              <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
                {COOPERATION_OPTIONS.map((opt) => {
                  const selected = (client.cooperationMode ?? "online") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={updateClient.isPending}
                      onClick={() => handleCooperationModeChange(opt.value)}
                      className={
                        "px-3 py-1.5 text-sm transition-colors border-r border-border/60 last:border-r-0 " +
                        (selected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "bg-background text-muted-foreground hover:bg-muted/40")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              {COOPERATION_EXPLANATION[(client.cooperationMode ?? "online") as CooperationMode] ??
                COOPERATION_EXPLANATION.online}
            </p>
            {(client.cooperationMode === "in_person" || client.cooperationMode === "hybrid") && (
              <p className="text-xs text-muted-foreground/70 italic flex items-center gap-1.5">
                <Calendar size={12} />
                Rezerwacje treningów — wkrótce
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!client.email}
            onClick={() => {
              const portalUrl = `${window.location.origin}/client-landing/plan`;
              navigator.clipboard.writeText(portalUrl).then(() => {
                toast({ title: "Link skopiowany do schowka" });
              }).catch(() => {
                toast({ title: "Nie udało się skopiować linku", variant: "destructive" });
              });
            }}
          >
            <Link2 size={16} />
            Kopiuj link do portalu
          </Button>
          {client.hasSurvey && (
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer size={16} />
              Drukuj / Eksportuj PDF
            </Button>
          )}
          <Button asChild className="gap-2">
            <Link href={`/clients/${id}/survey`}>
              <FileEdit size={16} />
              {client.hasSurvey ? "Nowa wersja wywiadu treningowego" : "Wypełnij Wywiad Treningowy"}
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="no-print">
        <TabsList>
          <TabsTrigger value="overview">Przegląd</TabsTrigger>
          <TabsTrigger value="survey">Wywiad treningowy</TabsTrigger>
          <TabsTrigger value="history">Historia wywiadów</TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-1.5">
            <Sparkles size={13} />
            Rekomendacje
          </TabsTrigger>
          <TabsTrigger value="notes">Notatki</TabsTrigger>
          <TabsTrigger value="plans">Plany treningowe</TabsTrigger>
          <TabsTrigger value="workout-history" className="gap-1.5">
            <Dumbbell size={13} />
            Historia treningów
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab client={client} survey={survey} />
        </TabsContent>

        <TabsContent value="survey" className="pt-4">
          <SurveyTab
            client={client}
            survey={survey}
            surveyLoading={surveyLoading}
            id={id}
            bmi={bmi}
            showBmiRecommendation={showBmiRecommendation}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" />
                Historia wypełnionych wywiadów treningowych
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!surveyHistory || surveyHistory.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Brak historii wywiadów treningowych.</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {surveyHistory.map((s, index) => (
                    <div key={s.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant={index === 0 ? "default" : "outline"} className={index === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}>
                          {index === 0 ? "Aktualna" : "Archiwalna"}
                        </Badge>
                        <span className="text-sm text-foreground">{formatDate(s.createdAt)}</span>
                        <span className="text-sm text-muted-foreground">{s.trainingGoal || "Bez celu treningowego"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedSurveyId(s.id)}
                        className="text-primary"
                      >
                        Zobacz wywiad treningowy
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedSurveyId && displayedSurvey && (
            <div className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  Podgląd wywiadu treningowego
                  <Badge variant={isViewingArchival ? "outline" : "default"} className={isViewingArchival ? "text-muted-foreground" : "bg-primary/10 text-primary"}>
                    {isViewingArchival ? "Archiwalna" : "Aktualna"}
                  </Badge>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSurveyId(null)}>Zamknij podgląd</Button>
              </div>
              <SurveyDetails survey={displayedSurvey} bmi={calculateBmi(displayedSurvey.heightCm, displayedSurvey.weightKg)} showBmiRecommendation={false} clientEmail={client.email} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="pt-4">
          <ExerciseRecommendationsTab clientId={id} hasSurvey={!!client?.hasSurvey} />
        </TabsContent>

        <TabsContent value="plans" className="pt-4">
          <PlansTab
            clientId={id}
            cooperationMode={(client.cooperationMode ?? "online") as CooperationMode}
          />
        </TabsContent>

        <TabsContent value="workout-history" className="pt-4">
          <WorkoutHistoryTab clientId={id} />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="w-4 h-4" />
                Prywatne notatki trenera
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder="Dodaj notatkę widoczną tylko dla Ciebie..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button onClick={handleAddNote} disabled={!noteContent.trim() || createNote.isPending} className="self-end">
                  Dodaj notatkę
                </Button>
              </div>

              <div className="divide-y divide-border/50 border-t border-border/50">
                {!notes || notes.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">Brak notatek.</div>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="py-4 space-y-2">
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <Textarea value={editingNoteContent} onChange={(e) => setEditingNoteContent(e.target.value)} className="min-h-[70px]" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setEditingNoteId(null)}>Anuluj</Button>
                            <Button size="sm" onClick={handleSaveNoteEdit}>Zapisz</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-foreground whitespace-pre-wrap text-sm">{note.content}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }}
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteNote(note.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Print-only view always renders the current survey in full, regardless of active tab */}
      <div className="print-only space-y-6">
        <ContactCard client={client} />
        {survey && (
          <SurveyDetails survey={survey} bmi={bmi} showBmiRecommendation={showBmiRecommendation} clientName={`${client.firstName} ${client.lastName}`} clientEmail={client.email} />
        )}
      </div>
    </div>
  );
}

function ContactCard({ client }: { client: any }) {
  return (
    <Card className="border-border/50 shadow-sm bg-muted/10 print-break-inside-avoid">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          Dane kontaktowe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-foreground truncate">{client.email || <span className="text-muted-foreground italic">Brak email</span>}</span>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-foreground">{client.phone || <span className="text-muted-foreground italic">Brak telefonu</span>}</span>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-foreground">Dodano: {formatDate(client.createdAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-foreground">Status: {clientStatusLabel(client.status)}</span>
        </div>
        {client.notes && (
          <div className="pt-4 mt-4 border-t border-border/50">
            <p className="font-medium text-xs text-muted-foreground mb-1 uppercase tracking-wider">Notatki klienta</p>
            <p className="text-foreground whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ client, survey }: { client: any; survey: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <ContactCard client={client} />
      <div className="md:col-span-2 space-y-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Podsumowanie</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <SummaryRow label="Status wywiadu treningowego" value={surveyStatusLabel(client.surveyStatus)} />
            <SummaryRow label="Ostatni wywiad treningowy" value={client.lastSurveyDate ? formatDate(client.lastSurveyDate) : "Brak"} />
            <SummaryRow label="Cel treningowy" value={survey?.trainingGoal || "-"} />
            <SummaryRow label="Poziom doświadczenia" value={survey?.experienceLevel || "-"} />
            <SummaryRow label="Preferowana liczba treningów tygodniowo" value={survey?.desiredWeeklyFrequency ? `${survey.desiredWeeklyFrequency}x / tydz.` : "-"} />
            <SummaryRow label="Miejsce treningu" value={survey?.trainingLocation || "-"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-foreground font-medium">{value}</p>
    </div>
  );
}

function SurveyTab({ client, survey, surveyLoading, id, bmi, showBmiRecommendation }: any) {
  const clientEmail = client?.email;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adaptiveDecisionPending, setAdaptiveDecisionPending] = useState(false);

  const handleAdaptiveDecision = async (decision: "accepted" | "declined") => {
    setAdaptiveDecisionPending(true);
    try {
      await customFetch(`/api/clients/${client.id}/adaptive-start`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) });
      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      toast({
        title:
          decision === "accepted"
            ? "Start adaptacyjny zastosowany"
            : "Pominięto start adaptacyjny",
      });
    } catch {
      toast({
        title: "Błąd",
        description: "Nie udało się zapisać decyzji",
        variant: "destructive",
      });
    } finally {
      setAdaptiveDecisionPending(false);
    }
  };

  if (!client.hasSurvey) {
    return (
      <div className="space-y-4">
        <InvitationCard clientId={client.id} />
        <Card className="border-border/50 shadow-sm border-dashed">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <FileEdit className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Brak wywiadu startowego</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Zbierz wywiad od klienta przed pierwszym treningiem, aby optymalnie ułożyć plan treningowy i zapobiec kontuzjom.
            </p>
            <Button asChild>
              <Link href={`/clients/${id}/survey`}>Rozpocznij Wywiad</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (surveyLoading) {
    return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  }

  if (!survey) return null;

  const isAdaptiveEligible =
    survey.experienceLevel === "Brak aktywności fizycznej" ||
    survey.experienceLevel === "Początkujący";
  const adaptiveDecision = (client as any).adaptiveStartDecision ?? null;

  return (
    <div className="space-y-6">
      <InvitationCard clientId={client.id} />
      {isAdaptiveEligible && (
        <AdaptiveStartCard
          decision={adaptiveDecision}
          onAccept={() => handleAdaptiveDecision("accepted")}
          onDecline={() => handleAdaptiveDecision("declined")}
          isPending={adaptiveDecisionPending}
        />
      )}
      <SurveyDetails
        survey={survey}
        bmi={bmi}
        showBmiRecommendation={showBmiRecommendation}
        clientEmail={clientEmail}
        editable
      />
    </div>
  );
}

// ─── Client portal invitation card ───────────────────────────────────────────

type InviteStatus = {
  accountStatus: "active" | "invited" | "none";
  invitation: { id: number; expiresAt: string; createdAt: string; revokedAt: string | null; usedAt: string | null } | null;
  clerkUserId: string | null;
};

function InvitationCard({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<InviteStatus>({
    queryKey: ["client-invite-status", clientId],
    queryFn: ({ signal }) =>
      customFetch(`/api/clients/${clientId}/invite/status`, { signal }),
    staleTime: 30_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["client-invite-status", clientId] });

  const createInvite = async () => {
    setBusy(true);
    try {
      const result: { token: string } = await customFetch(`/api/clients/${clientId}/invite`, { method: "POST" });
      // Copy activation link to clipboard.
      const url = `${window.location.origin}/client-landing/invite/${result.token}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link skopiowany", description: "Link aktywacyjny został skopiowany do schowka." });
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nieznany błąd";
      toast({ title: "Błąd", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!data?.invitation) return;
    // We don't have the raw token anymore; ask for a new one.
    createInvite();
  };

  const revokeInvite = async () => {
    setBusy(true);
    try {
      await customFetch(`/api/clients/${clientId}/invite`, { method: "DELETE" });
      toast({ title: "Zaproszenie odwołane" });
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nieznany błąd";
      toast({ title: "Błąd", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="h-16 bg-muted animate-pulse rounded-xl" />;
  }

  const status = data?.accountStatus ?? "none";

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Dostęp do portalu klienta</CardTitle>
          </div>
          {status === "active" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
              <UserCheck className="w-3 h-3" /> Konto aktywne
            </span>
          )}
          {status === "invited" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              <Send className="w-3 h-3" /> Zaproszenie wysłane
            </span>
          )}
          {status === "none" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
              Brak dostępu
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {status === "none" && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground flex-1">
              Klient nie ma jeszcze dostępu do portalu treningowego.
            </p>
            <Button size="sm" onClick={createInvite} disabled={busy}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Wyślij dostęp
            </Button>
          </div>
        )}

        {status === "invited" && data?.invitation && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Zaproszenie ważne do{" "}
              <span className="font-medium text-foreground">
                {new Date(data.invitation.expiresAt).toLocaleDateString("pl-PL")}
              </span>
              . Po aktywacji klient uzyska dostęp do swojego planu.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={copyLink} disabled={busy}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Skopiuj link
              </Button>
              <Button size="sm" variant="outline" onClick={createInvite} disabled={busy}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Wyślij ponownie
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={revokeInvite} disabled={busy}>
                <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                Odwołaj zaproszenie
              </Button>
            </div>
          </div>
        )}

        {status === "active" && (
          <p className="text-sm text-muted-foreground">
            Klient ma aktywne konto i może logować się do portalu treningowego.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Adaptive-start recommendation card ───────────────────────────────────────

function AdaptiveStartCard({
  decision,
  onAccept,
  onDecline,
  isPending,
}: {
  decision: string | null;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}) {
  const isDecided = decision === "accepted" || decision === "declined";

  return (
    <Card
      className="border-sky-200 bg-sky-50/50 shadow-sm"
      data-testid="adaptive-start-card"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base text-sky-900">
              Rekomendowany start adaptacyjny
            </CardTitle>
            {isDecided && (
              <span
                className={`inline-flex items-center mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  decision === "accepted"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
                data-testid="adaptive-start-decision-badge"
              >
                {decision === "accepted" ? "Zastosowany" : "Pominięty"}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-sky-800 leading-relaxed" data-testid="adaptive-start-description">
          Start adaptacyjny skupia się na nauce podstawowych wzorców ruchowych,
          kontroli techniki oraz prostych i stabilnych ćwiczeniach z masą ciała lub
          lekkim oporem. Obciążenie jest wprowadzane stopniowo.
        </p>

        {!isDecided ? (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPending}
              data-testid="adaptive-start-accept"
            >
              Zastosuj start adaptacyjny
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDecline}
              disabled={isPending}
              data-testid="adaptive-start-decline"
            >
              Pomiń i przygotuj standardowy plan
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={decision === "accepted" ? onDecline : onAccept}
            disabled={isPending}
            className="text-muted-foreground text-xs h-7 px-2"
            data-testid="adaptive-start-change"
          >
            {decision === "accepted"
              ? "Zmień na standardowy plan"
              : "Zmień na start adaptacyjny"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SurveyDetails({ survey, bmi, showBmiRecommendation, clientName, clientEmail, editable }: any) {
  const { data: avoidedExercises, isLoading: avoidedExercisesLoading } = useGetClientAvoidedExercises(survey?.clientId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const upsertSurvey = useUpsertClientSurvey();

  const [isEditing, setIsEditing] = useState(false);
  const [editedExercises, setEditedExercises] = useState<AvoidedExercise[]>([]);
  const [editedOtherText, setEditedOtherText] = useState("");
  const [editedOtherReason, setEditedOtherReason] = useState("");

  // Separate real exercises from the "other" entry (id === 0)
  const avoidedExList = (avoidedExercises ?? []).filter((e) => e.id > 0);
  const avoidedOther = (avoidedExercises ?? []).find((e) => e.id === 0);

  const startEdit = () => {
    setEditedExercises(
      avoidedExList.map((e) => ({ id: e.id, name: e.name, reason: e.reason ?? "" }))
    );
    setEditedOtherText(avoidedOther?.otherText ?? "");
    setEditedOtherReason(avoidedOther?.otherReason ?? "");
    setIsEditing(true);
  };

  const handleSaveAvoidedExercises = () => {
    const avoidedExerciseReasons: Record<string, string> = {};
    editedExercises.forEach((e) => {
      if (e.reason.trim()) avoidedExerciseReasons[String(e.id)] = e.reason.trim();
    });

    // Build a clean payload that matches UpsertClientSurveyBody:
    // - only include fields the API schema accepts
    // - convert null → undefined (omit) for optional scalars so zod doesn't reject them
    // - handle dateOfBirth: Date → YYYY-MM-DD string
    const s = survey ?? {};

    function strOrUndef(v: unknown): string | undefined {
      return v != null && v !== "" ? String(v) : undefined;
    }
    function numOrUndef(v: unknown): number | undefined {
      return v != null ? Number(v) : undefined;
    }
    function boolOrUndef(v: unknown): boolean | undefined {
      return v != null ? Boolean(v) : undefined;
    }

    const dateOfBirth: string | undefined = s.dateOfBirth != null
      ? (s.dateOfBirth instanceof Date
          ? s.dateOfBirth.toISOString().split("T")[0]
          : String(s.dateOfBirth).split("T")[0])
      : undefined;

    const payload = {
      // scalar string fields
      trainingGoal: strOrUndef(s.trainingGoal),
      trainingGoalOther: strOrUndef(s.trainingGoalOther),
      trainingMotivation: strOrUndef(s.trainingMotivation),
      experienceLevel: strOrUndef(s.experienceLevel),
      trainingDuration: strOrUndef(s.trainingDuration),
      healthLimitations: strOrUndef(s.healthLimitations),
      sessionDuration: strOrUndef(s.sessionDuration),
      preferredMuscles: strOrUndef(s.preferredMuscles),
      avoidedMuscles: strOrUndef(s.avoidedMuscles),
      avoidedExercises: strOrUndef(s.avoidedExercises),
      favoriteExercises: strOrUndef(s.favoriteExercises),
      additionalInfo: strOrUndef(s.additionalInfo),
      gender: strOrUndef(s.gender) as "Mężczyzna" | "Kobieta" | undefined,
      planStylePreference: strOrUndef(s.planStylePreference) as any,
      activityLevel: strOrUndef(s.activityLevel) as any,
      sleepHours: strOrUndef(s.sleepHours) as any,
      priorityMuscle1: strOrUndef(s.priorityMuscle1),
      priorityMuscle2: strOrUndef(s.priorityMuscle2),
      priorityMuscle3: strOrUndef(s.priorityMuscle3),
      trainingLocation: strOrUndef(s.trainingLocation),
      equipment: strOrUndef(s.equipment),
      cardioPreference: strOrUndef(s.cardioPreference),
      cardioFrequency: strOrUndef(s.cardioFrequency),
      preferredCardioType: strOrUndef(s.preferredCardioType),
      // scalar number fields
      weeklyFrequency: numOrUndef(s.weeklyFrequency),
      desiredWeeklyFrequency: numOrUndef(s.desiredWeeklyFrequency),
      age: numOrUndef(s.age),
      heightCm: numOrUndef(s.heightCm),
      weightKg: numOrUndef(s.weightKg),
      stressLevel: numOrUndef(s.stressLevel),
      // boolean fields
      avoidsAdvancedMethods: boolOrUndef(s.avoidsAdvancedMethods),
      // array fields — keep as-is, default to []
      advancedMethodsToAvoid: Array.isArray(s.advancedMethodsToAvoid) ? s.advancedMethodsToAvoid : [],
      // date
      ...(dateOfBirth ? { dateOfBirth } : {}),
      // avoided exercise fields (what we're actually editing)
      avoidedExerciseIds: editedExercises.map((e) => e.id),
      avoidedExerciseReasons,
      avoidedExerciseOtherText: editedOtherText.trim() || null,
      avoidedExerciseOtherReason: editedOtherReason.trim() || null,
    };

    upsertSurvey.mutate(
      { clientId: survey.clientId, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Zapisano ćwiczenia do unikania" });
          setIsEditing(false);
          queryClient.invalidateQueries({ queryKey: getClientAvoidedExercisesQueryKey(survey.clientId) });
          queryClient.invalidateQueries({ queryKey: ["client-survey", survey.clientId] as any });
        },
        onError: () => {
          toast({ title: "Nie udało się zapisać zmian", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6 print-page-break-before">
      {clientName && (
        <h2 className="text-2xl font-display font-semibold print-only mb-6 border-b pb-2">
          Wywiad Treningowy: {clientName}
        </h2>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dane podstawowe</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="E-mail" value={clientEmail} />
        <SurveyBlock label="Data urodzenia" value={formatDateOfBirth(survey.dateOfBirth)} />
        <SurveyBlock label="Wiek" value={calculateAgeFromSurvey(survey.dateOfBirth, survey.age)?.toString()} />
        <SurveyBlock label="Płeć" value={formatGender(survey.gender)} />
        <SurveyBlock label="Wzrost" value={survey.heightCm ? `${survey.heightCm} cm` : undefined} />
        <SurveyBlock label="Waga" value={survey.weightKg ? `${survey.weightKg} kg` : undefined} />
        <SurveyBlock label="BMI" value={bmi !== undefined ? `BMI: ${bmi.toFixed(1)}` : undefined} />
      </div>

      {showBmiRecommendation && (
        <Card className="border-primary/20 shadow-sm print-break-inside-avoid">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary flex items-center gap-2">
              Automatyczna podpowiedź
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-foreground/90 text-sm">{BMI_RECOMMENDATION_TEXT}</p>
          </CardContent>
        </Card>
      )}

      {/* Profil treningowy — collapsible, primary summary = experience level */}
      <CollapsibleSurveySection
        icon={<Activity size={14} />}
        title="Profil treningowy"
        summaryLabel={survey.experienceLevel ? "Poziom" : undefined}
        summaryValue={survey.experienceLevel ?? undefined}
        data-testid="profil-section"
      >
        <DetailRow label="Cel treningowy" value={survey.trainingGoal} />
        <DetailRow label="Poziom doświadczenia" value={survey.experienceLevel} />
        {survey.experienceLevel === "Brak aktywności fizycznej" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 my-2">
            Etap wprowadzający — priorytetem jest technika, kontrola ruchu i przygotowanie motoryczne.
          </p>
        )}
        <DetailRow label="Staż treningowy" value={survey.trainingDuration} />
        <DetailRow
          label="Treningi / tydzień"
          value={survey.desiredWeeklyFrequency?.toString()}
        />
        <DetailRow label="Czas sesji" value={survey.sessionDuration} />
        {survey.trainingMotivation && (
          <DetailRow label="Motywacja" value={survey.trainingMotivation} />
        )}
        {Array.isArray(survey.sportsPriorities) &&
          (survey.sportsPriorities as string[]).length > 0 && (
            <div className="py-2 border-b border-border/30 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-muted-foreground shrink-0 min-w-[140px]">
                  Priorytety sportowe
                </span>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(survey.sportsPriorities as string[]).map((v: string) => (
                    <Badge key={v} variant="secondary" className="font-normal text-xs">
                      {(
                        {
                          dynamika: "Dynamika",
                          szybkosc: "Szybkość",
                          stabilizacja: "Stabilizacja",
                        } as Record<string, string>
                      )[v] ?? v}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
      </CollapsibleSurveySection>

      {/* Regeneracja i styl życia — collapsible, primary summary = recovery quality badge */}
      {(() => {
        const recoveryQuality = deriveRecoveryQualityClient(
          survey.sleepHours,
          survey.stressLevel,
          survey.activityLevel,
        );
        const recoveryLabel = recoveryQuality ? RECOVERY_LABEL[recoveryQuality] : undefined;
        const badgeClass = recoveryQuality ? RECOVERY_BADGE_CLASS[recoveryQuality] : undefined;
        const physicalWork = survey.activityLevel === "Praca fizyczna";
        return (
          <CollapsibleSurveySection
            icon={<Moon size={14} />}
            title="Regeneracja i styl życia"
            summaryLabel={recoveryLabel ? "Jakość regeneracji" : undefined}
            summaryValue={recoveryLabel}
            badgeClass={badgeClass}
            data-testid="regeneracja-section"
          >
            <DetailRow label="Aktywność codzienna" value={survey.activityLevel} />
            <DetailRow
              label="Praca fizyczna"
              value={physicalWork ? "Tak" : survey.activityLevel ? "Nie" : undefined}
            />
            <DetailRow
              label="Sen"
              value={survey.sleepHours ? `${survey.sleepHours} h` : undefined}
            />
            <DetailRow
              label="Poziom stresu"
              value={survey.stressLevel != null ? `${survey.stressLevel}/10` : undefined}
            />
            <DetailRow label="Jakość regeneracji" value={recoveryLabel} />
            <DetailRow label="Preferowany styl planu" value={survey.planStylePreference} />
          </CollapsibleSurveySection>
        );
      })()}

      <Card className="border-border/50 shadow-sm print-break-inside-avoid">
        <CardHeader className="bg-destructive/5 pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            Kontuzje i ograniczenia ruchowe
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {survey.healthLimitations ? (
            <p className="text-foreground whitespace-pre-wrap">{survey.healthLimitations}</p>
          ) : (
            <p className="text-muted-foreground italic">Brak zgłoszonych przeciwskazań</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="Partie priorytetowe (opis)" value={survey.preferredMuscles} className="border-l-2 border-primary" />
        <SurveyBlock label="Partie do pominięcia" value={survey.avoidedMuscles} />
        <SurveyBlock label="Ulubione ćwiczenia" value={survey.favoriteExercises} />
      </div>

      {/* ── Unikane ćwiczenia (nowa struktura) ─────────────────────────── */}
      {(avoidedExList.length > 0 || avoidedOther || editable) && (
        <div className="bg-card border border-amber-200/60 rounded-xl shadow-sm col-span-full print-break-inside-avoid">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ćwiczenia do unikania
            </h4>
            {editable && !isEditing && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={startEdit} disabled={avoidedExercisesLoading}>
                <Pencil size={12} />
                {avoidedExercisesLoading ? "Ładowanie…" : "Edytuj"}
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="px-5 pb-5 space-y-4">
              <AvoidedExercisesPicker
                selectedExercises={editedExercises}
                onSelectedChange={setEditedExercises}
              />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Opis słowny / ćwiczenia spoza biblioteki</p>
                <textarea
                  value={editedOtherText}
                  onChange={(e) => setEditedOtherText(e.target.value)}
                  placeholder="Opisz ćwiczenia, których klient ma unikać (np. wyciskanie nad głowę)..."
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <textarea
                  value={editedOtherReason}
                  onChange={(e) => setEditedOtherReason(e.target.value)}
                  placeholder="Powód unikania tych ćwiczeń (opcjonalne)..."
                  rows={1}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={upsertSurvey.isPending}>
                  Anuluj
                </Button>
                <Button size="sm" onClick={handleSaveAvoidedExercises} disabled={upsertSurvey.isPending}>
                  {upsertSurvey.isPending ? "Zapisywanie…" : "Zapisz zmiany"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-5 space-y-2">
              {avoidedExList.length === 0 && !avoidedOther ? (
                /* Show legacy free-text when there are no structured entries */
                survey?.avoidedExercises ? (
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Opis (legacy)</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{survey.avoidedExercises}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Brak ćwiczeń do unikania</p>
                )
              ) : (
                <>
                  {avoidedExList.map((ex) => (
                    <div key={ex.id} className="flex items-start gap-2">
                      <span className={`text-sm font-medium ${ex.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
                        {ex.name}
                      </span>
                      {!ex.isActive && (
                        <Badge variant="secondary" className="text-xs shrink-0">nieaktywne</Badge>
                      )}
                      {ex.reason && (
                        <span className="text-xs text-muted-foreground">— {ex.reason}</span>
                      )}
                    </div>
                  ))}
                  {avoidedOther && (avoidedOther.otherText || avoidedOther.otherReason) && (
                    <div className="border-t border-border/40 pt-2 mt-2">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Opis słowny</p>
                      {avoidedOther.otherText && (
                        <p className="text-sm text-foreground">{avoidedOther.otherText}</p>
                      )}
                      {avoidedOther.otherReason && (
                        <p className="text-xs text-muted-foreground mt-0.5">{avoidedOther.otherReason}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {/* Fallback: legacy free-text field from old surveys */}
      {!avoidedExList.length && !avoidedOther && !editable && survey.avoidedExercises && (
        <SurveyBlock label="Czego unikać (legacy)" value={survey.avoidedExercises} />
      )}

      {(survey.priorityMuscle1 || survey.priorityMuscle2 || survey.priorityMuscle3) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SurveyBlock label="Priorytet #1" value={survey.priorityMuscle1} />
          <SurveyBlock label="Priorytet #2" value={survey.priorityMuscle2} />
          <SurveyBlock label="Priorytet #3" value={survey.priorityMuscle3} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="Miejsce treningu" value={survey.trainingLocation} />
        <SurveyBlock
          label="Dostępny sprzęt"
          value={
            survey.equipment?.trim() ? (
              survey.equipment
            ) : (
              <p className="text-amber-700 font-medium" data-testid="missing-equipment-warning">
                Klient nie określił sprzętu.{" "}
                {survey.trainingLocation === "Siłownia"
                  ? "Generator przyjmuje standardowe wyposażenie siłowni."
                  : "Generator dobierze tylko ćwiczenia z masą własnego ciała."}
              </p>
            )
          }
        />
        <SurveyBlock label="Nastawienie do cardio" value={survey.cardioPreference} />
        <SurveyBlock label="Częstotliwość cardio" value={survey.cardioFrequency} />
        <SurveyBlock label="Preferowany typ cardio" value={survey.preferredCardioType} />
      </div>

      {survey.avoidsAdvancedMethods === true && survey.advancedMethodsToAvoid && survey.advancedMethodsToAvoid.length === 0 && (
        <SurveyBlock label="Unikane metody intensyfikacji" value="Klient zgłosił przeciwwskazania, ale nie wskazał konkretnych metod." fullWidth />
      )}

      {survey.advancedMethodsToAvoid && survey.advancedMethodsToAvoid.length > 0 && (
        <SurveyBlock
          label="Unikane metody intensyfikacji"
          value={
            <div className="flex flex-wrap gap-2 mt-2">
              {survey.advancedMethodsToAvoid.map((method: string) => (
                <Badge key={method} variant="secondary" className="bg-muted text-muted-foreground font-normal">
                  {method}
                </Badge>
              ))}
            </div>
          }
          fullWidth
        />
      )}

      {survey.additionalInfo && (
        <SurveyBlock label="Dodatkowe informacje od klienta" value={survey.additionalInfo} fullWidth />
      )}

      <div className="text-xs text-muted-foreground text-right pt-4 print-only">
        Wywiad treningowy wygenerowany z systemu Panel Trenera dnia {new Date().toLocaleDateString('pl-PL')}
      </div>
    </div>
  );
}

function SurveyBlock({ label, value, fullWidth = false, className = "" }: { label: string, value: React.ReactNode, fullWidth?: boolean, className?: string }) {
  if (!value) return null;

  return (
    <div className={`bg-card border border-border/50 rounded-xl p-5 shadow-sm ${fullWidth ? 'col-span-full' : ''} ${className} print-break-inside-avoid`}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</h4>
      {typeof value === 'string' ? (
        <p className="text-foreground font-medium">{value}</p>
      ) : (
        value
      )}
    </div>
  );
}
