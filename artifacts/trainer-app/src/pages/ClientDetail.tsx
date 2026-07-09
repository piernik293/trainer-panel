import { useState } from "react";
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Printer, FileEdit, Phone, Mail, Calendar, ClipboardList, History, StickyNote, Trash2, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { clientStatusLabel, surveyStatusLabel } from "@/lib/client-status";
import { useToast } from "@/hooks/use-toast";

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

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  const { data: client, isLoading: clientLoading } = useGetClient(id, {
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) }
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
        </div>

        <div className="flex gap-2">
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
          <TabsTrigger value="history">Historia wywiadów treningowych</TabsTrigger>
          <TabsTrigger value="notes">Notatki</TabsTrigger>
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
              <SurveyDetails survey={displayedSurvey} bmi={calculateBmi(displayedSurvey.heightCm, displayedSurvey.weightKg)} showBmiRecommendation={false} />
            </div>
          )}
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
          <SurveyDetails survey={survey} bmi={bmi} showBmiRecommendation={showBmiRecommendation} clientName={`${client.firstName} ${client.lastName}`} />
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
            <SummaryRow label="Możliwa liczba dni treningowych" value={survey?.weeklyFrequency ? `${survey.weeklyFrequency}x / tydz.` : "-"} />
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
  if (!client.hasSurvey) {
    return (
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
    );
  }

  if (surveyLoading) {
    return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  }

  if (!survey) return null;

  return <SurveyDetails survey={survey} bmi={bmi} showBmiRecommendation={showBmiRecommendation} />;
}

function SurveyDetails({ survey, bmi, showBmiRecommendation, clientName }: any) {
  return (
    <div className="space-y-6 print-page-break-before">
      {clientName && (
        <h2 className="text-2xl font-display font-semibold print-only mb-6 border-b pb-2">
          Wywiad Treningowy: {clientName}
        </h2>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="Cel treningowy" value={survey.trainingGoal} />
        <SurveyBlock label="Poziom doświadczenia" value={survey.experienceLevel} />
        <SurveyBlock label="Staż treningowy" value={survey.trainingDuration} />
        <SurveyBlock label="Możliwa liczba dni treningowych" value={survey.weeklyFrequency?.toString()} />
        <SurveyBlock label="Preferowana liczba treningów tygodniowo" value={survey.desiredWeeklyFrequency?.toString()} />
        <SurveyBlock label="Czas trwania sesji" value={survey.sessionDuration} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="Aktywność w ciągu dnia" value={survey.activityLevel} />
        <SurveyBlock label="Sen (śr. godz./dobę)" value={survey.sleepHours} />
        <SurveyBlock label="Poziom stresu (1-10)" value={survey.stressLevel?.toString()} />
        <SurveyBlock label="Preferowany styl planu" value={survey.planStylePreference} />
      </div>

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
        <SurveyBlock label="Czego unikać" value={survey.avoidedExercises} />
      </div>

      {(survey.priorityMuscle1 || survey.priorityMuscle2 || survey.priorityMuscle3) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SurveyBlock label="Priorytet #1" value={survey.priorityMuscle1} />
          <SurveyBlock label="Priorytet #2" value={survey.priorityMuscle2} />
          <SurveyBlock label="Priorytet #3" value={survey.priorityMuscle3} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SurveyBlock label="Miejsce treningu" value={survey.trainingLocation} />
        <SurveyBlock label="Dostępny sprzęt" value={survey.equipment} />
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
