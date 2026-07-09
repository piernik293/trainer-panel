import { useParams, Link } from "wouter";
import { useGetClient, getGetClientQueryKey, useGetClientSurvey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, FileEdit, Phone, Mail, Calendar, ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils";

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
  "Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj, że BMI nie rozróżnia masy mięśniowej i tkanki tłuszczowej. W takim przypadku często warto rozważyć redukcję tkanki tłuszczowej lub rekompozycję sylwetki.";

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: client, isLoading: clientLoading } = useGetClient(id, { 
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) } 
  });
  
  const { data: survey, isLoading: surveyLoading } = useGetClientSurvey(id, {
    query: { enabled: !!client?.hasSurvey, queryKey: ['client-survey', id] as any }
  });

  const bmi = calculateBmi(survey?.heightCm, survey?.weightKg);
  const showBmiRecommendation = survey?.experienceLevel === "Początkujący" && bmi !== undefined && bmi >= 25;

  const handlePrint = () => {
    window.print();
  };

  if (clientLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie profilu...</div>;
  }

  if (!client) {
    return <div className="p-8 text-center text-destructive">Nie znaleziono klienta</div>;
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-300">
      <div className="flex justify-between items-start no-print">
        <div className="space-y-2">
          <Link href="/clients" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ArrowLeft size={16} />
            Powrót do listy
          </Link>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
            {client.firstName} {client.lastName}
            {client.hasSurvey ? (
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent text-xs font-medium py-1">Aktywny Profil</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-border text-xs py-1">Nowy Kontakt</Badge>
            )}
          </h1>
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
              {client.hasSurvey ? "Edytuj Ankietę" : "Wypełnij Ankietę"}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-border/50 shadow-sm bg-muted/10 print-break-inside-avoid">
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
            
            {client.notes && (
              <div className="pt-4 mt-4 border-t border-border/50">
                <p className="font-medium text-xs text-muted-foreground mb-1 uppercase tracking-wider">Notatki trenera</p>
                <p className="text-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          {!client.hasSurvey ? (
            <Card className="border-border/50 shadow-sm border-dashed no-print">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <FileEdit className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Brak ankiety startowej</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                  Zbierz wywiad od klienta przed pierwszym treningiem, aby optymalnie ułożyć plan treningowy i zapobiec kontuzjom.
                </p>
                <Button asChild>
                  <Link href={`/clients/${id}/survey`}>
                    Rozpocznij Wywiad
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : surveyLoading ? (
            <div className="h-64 bg-muted animate-pulse rounded-xl" />
          ) : survey ? (
            <div className="space-y-6 print-page-break-before">
              <h2 className="text-2xl font-display font-semibold print-only mb-6 border-b pb-2">
                Wywiad Treningowy: {client.firstName} {client.lastName}
              </h2>
              
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
                <SurveyBlock label="Ilość treningów w tyg." value={survey.weeklyFrequency?.toString()} />
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
                <SurveyBlock label="Partie priorytetowe" value={survey.preferredMuscles} className="border-l-2 border-primary" />
                <SurveyBlock label="Partie do pominięcia" value={survey.avoidedMuscles} />
                <SurveyBlock label="Ulubione ćwiczenia" value={survey.favoriteExercises} />
                <SurveyBlock label="Czego unikać" value={survey.avoidedExercises} />
              </div>

              {survey.avoidsAdvancedMethods === true && survey.advancedMethodsToAvoid && survey.advancedMethodsToAvoid.length === 0 && (
                <SurveyBlock label="Unikane metody intensyfikacji" value="Klient zgłosił przeciwwskazania, ale nie wskazał konkretnych metod." fullWidth />
              )}

              {survey.advancedMethodsToAvoid && survey.advancedMethodsToAvoid.length > 0 && (
                <SurveyBlock 
                  label="Unikane metody intensyfikacji" 
                  value={
                    <div className="flex flex-wrap gap-2 mt-2">
                      {survey.advancedMethodsToAvoid.map(method => (
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
                Ankieta wygenerowana z systemu Panel Trenera dnia {new Date().toLocaleDateString('pl-PL')}
              </div>
            </div>
          ) : null}
        </div>
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
