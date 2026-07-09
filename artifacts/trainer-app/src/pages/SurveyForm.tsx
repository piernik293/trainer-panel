import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useGetClient, getGetClientQueryKey, useGetClientSurvey, useUpsertClientSurvey, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";

const advancedMethodsOptions = [
  "Superserie", 
  "Serie złożone (Compound Set)", 
  "Drop sety", 
  "Serie do upadku mięśniowego", 
  "Serie wymuszone", 
  "Rest-Pause"
];

const MUSCLE_GROUPS = ["klatka piersiowa", "plecy", "barki", "biceps", "triceps", "brzuch", "uda", "pośladki", "łydki"];

function calculateBmi(heightCm: number | undefined, weightKg: number | undefined): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const heightM = heightCm / 100;
  if (heightM <= 0) return undefined;
  return weightKg / (heightM * heightM);
}

const BMI_RECOMMENDATION_TEXT =
  "Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj jednak, że BMI nie rozróżnia tkanki tłuszczowej od masy mięśniowej. W wielu przypadkach dobrym rozwiązaniem może być redukcja tkanki tłuszczowej lub rekompozycja sylwetki.";

function calculateAge(dateOfBirth: string | undefined): number | undefined {
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

const surveySchema = z.object({
  trainingGoal: z.string().optional(),
  experienceLevel: z.string().optional(),
  trainingDuration: z.string().optional(),
  healthLimitations: z.string().optional(),
  weeklyFrequency: z.coerce.number().min(1).max(14).optional().or(z.literal("").transform(() => undefined)),
  sessionDuration: z.string().optional(),
  preferredMuscles: z.string().optional(),
  avoidedMuscles: z.string().optional(),
  avoidedExercises: z.string().optional(),
  favoriteExercises: z.string().optional(),
  age: z.coerce.number().min(1).max(120).optional().or(z.literal("").transform(() => undefined)),
  dateOfBirth: z
    .string()
    .optional()
    .refine((val) => !val || new Date(val) <= new Date(), "Data urodzenia nie może być w przyszłości"),
  gender: z.enum(["Mężczyzna", "Kobieta"]).optional().or(z.literal("")),
  heightCm: z.coerce.number().min(50).max(260).optional().or(z.literal("").transform(() => undefined)),
  weightKg: z.coerce.number().min(20).max(400).optional().or(z.literal("").transform(() => undefined)),
  activityLevel: z.string().optional(),
  sleepHours: z.string().optional(),
  stressLevel: z.coerce.number().min(1).max(10).optional(),
  planStylePreference: z.string().optional(),
  avoidsAdvancedMethods: z.string().optional(),
  advancedMethodsToAvoid: z.array(z.string()).default([]),
  additionalInfo: z.string().optional(),
  priorityMuscle1: z.string().optional(),
  priorityMuscle2: z.string().optional(),
  priorityMuscle3: z.string().optional(),
  trainingLocation: z.string().optional(),
  equipment: z.string().optional(),
  cardioPreference: z.string().optional(),
  cardioFrequency: z.string().optional(),
  preferredCardioType: z.string().optional(),
});

type SurveyFormValues = z.infer<typeof surveySchema>;

export default function SurveyForm() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: client, isLoading: clientLoading } = useGetClient(id, { 
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) } 
  });
  
  const { data: survey, isLoading: surveyLoading } = useGetClientSurvey(id, {
    query: { enabled: !!client?.hasSurvey, queryKey: ['client-survey-edit', id] as any }
  });

  if (clientLoading || (client?.hasSurvey && surveyLoading)) {
    return <div className="p-8 text-center text-muted-foreground">Wczytywanie formularza...</div>;
  }

  if (!client) {
    return <div className="p-8 text-center text-destructive">Nie znaleziono klienta</div>;
  }

  // Keying on the survey id (or "new") forces a fresh mount with correct
  // defaultValues once the survey data has loaded, avoiding any risk of
  // stale/uninitialized Select values that a manual form.reset() could leave behind.
  return <SurveyFormBody key={survey?.id ?? "new"} id={id} client={client} survey={survey} />;
}

function SurveyFormBody({ id, client, survey }: { id: number; client: { firstName: string; lastName: string; hasSurvey?: boolean }; survey: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const upsertSurvey = useUpsertClientSurvey();
  const { toast } = useToast();

  const form = useForm<SurveyFormValues>({
    resolver: zodResolver(surveySchema),
    defaultValues: {
      trainingGoal: survey?.trainingGoal ?? "",
      experienceLevel: survey?.experienceLevel ?? "",
      trainingDuration: survey?.trainingDuration ?? "",
      healthLimitations: survey?.healthLimitations ?? "",
      weeklyFrequency: survey?.weeklyFrequency ?? undefined,
      sessionDuration: survey?.sessionDuration ?? "",
      preferredMuscles: survey?.preferredMuscles ?? "",
      avoidedMuscles: survey?.avoidedMuscles ?? "",
      avoidedExercises: survey?.avoidedExercises ?? "",
      favoriteExercises: survey?.favoriteExercises ?? "",
      age: survey?.age ?? undefined,
      dateOfBirth: survey?.dateOfBirth ?? "",
      gender: (survey?.gender === "Mężczyzna" || survey?.gender === "Kobieta" ? survey.gender : "") as "" | "Mężczyzna" | "Kobieta",
      heightCm: survey?.heightCm ?? undefined,
      weightKg: survey?.weightKg ?? undefined,
      activityLevel: survey?.activityLevel ?? "",
      sleepHours: survey?.sleepHours ?? "",
      stressLevel: survey?.stressLevel ?? 5,
      planStylePreference: survey?.planStylePreference ?? "",
      avoidsAdvancedMethods: survey?.avoidsAdvancedMethods === true ? "Tak" : survey?.avoidsAdvancedMethods === false ? "Nie" : "",
      advancedMethodsToAvoid: survey?.advancedMethodsToAvoid ?? [],
      additionalInfo: survey?.additionalInfo ?? "",
      priorityMuscle1: survey?.priorityMuscle1 ?? "",
      priorityMuscle2: survey?.priorityMuscle2 ?? "",
      priorityMuscle3: survey?.priorityMuscle3 ?? "",
      trainingLocation: survey?.trainingLocation ?? "",
      equipment: survey?.equipment ?? "",
      cardioPreference: survey?.cardioPreference ?? "",
      cardioFrequency: survey?.cardioFrequency ?? "",
      preferredCardioType: survey?.preferredCardioType ?? "",
    }
  });

  const experienceLevel = form.watch("experienceLevel");
  const avoidsAdvancedMethods = form.watch("avoidsAdvancedMethods");
  const dateOfBirth = form.watch("dateOfBirth");
  const watchedAge = form.watch("age");
  const isBeginner = experienceLevel === "Brak aktywności fizycznej" || experienceLevel === "Początkujący";
  const isIntermediateOrAdvanced = experienceLevel === "Średniozaawansowany" || experienceLevel === "Zaawansowany";
  const calculatedAge = calculateAge(dateOfBirth) ?? watchedAge;
  const gender = form.watch("gender");
  const genderMuscleSuggestion =
    gender === "Kobieta"
      ? "Podpowiedź: Często wybierane cele sylwetkowe to pośladki, uda, brzuch oraz barki."
      : gender === "Mężczyzna"
      ? "Podpowiedź: Często wybierane cele sylwetkowe to klatka piersiowa, barki, plecy oraz ramiona."
      : undefined;
  const heightCm = form.watch("heightCm");
  const weightKg = form.watch("weightKg");
  const bmi = calculateBmi(heightCm, weightKg);
  const showBmiRecommendation = isBeginner && bmi !== undefined && bmi >= 25;

  const onSubmit = (data: SurveyFormValues) => {
    const avoidsAdvancedMethodsBool =
      data.avoidsAdvancedMethods === "Tak" ? true : data.avoidsAdvancedMethods === "Nie" ? false : undefined;
    const payload = {
      ...data,
      gender: data.gender || undefined,
      activityLevel: data.activityLevel || undefined,
      sleepHours: data.sleepHours || undefined,
      planStylePreference: data.planStylePreference || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      age: calculateAge(data.dateOfBirth) ?? data.age,
      avoidsAdvancedMethods: avoidsAdvancedMethodsBool,
      advancedMethodsToAvoid: avoidsAdvancedMethodsBool === true ? data.advancedMethodsToAvoid : [],
    };
    upsertSurvey.mutate({ clientId: id, data: payload as Parameters<typeof upsertSurvey.mutate>[0]["data"] }, {
      onSuccess: () => {
        toast({
          title: "Zapisano pomyślnie",
          description: "Wywiad treningowy klienta został zaktualizowany."
        });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ['client-survey', id] as any });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setLocation(`/clients/${id}`);
      },
      onError: () => {
        toast({
          title: "Błąd zapisu",
          description: "Nie udało się zapisać wywiadu treningowego.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <Link href={`/clients/${id}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft size={16} />
        Powrót do profilu
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Wywiad Treningowy
        </h1>
        <p className="text-muted-foreground mt-1">
          Dla klienta: {client?.firstName} {client?.lastName}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Podstawowe informacje</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <FormField
                control={form.control}
                name="trainingGoal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cel treningowy</FormLabel>
                    {showBmiRecommendation && (
                      <FormDescription className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 rounded-sm">
                        {BMI_RECOMMENDATION_TEXT}
                      </FormDescription>
                    )}
                    <FormControl>
                      <Input placeholder="np. Budowa sylwetki, Zwiększenie siły..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Który poziom najlepiej opisuje doświadczenie treningowe klienta?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz poziom...">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Brak aktywności fizycznej">Brak aktywności fizycznej</SelectItem>
                        <SelectItem value="Początkujący">Początkujący</SelectItem>
                        <SelectItem value="Średniozaawansowany">Średniozaawansowany</SelectItem>
                        <SelectItem value="Zaawansowany">Zaawansowany</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trainingDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jak długo trenujesz?</FormLabel>
                    <FormControl>
                      <Input placeholder="np. 2 lata z przerwami" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weeklyFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Liczba treningów w tygodniu</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="14" placeholder="3" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sessionDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Czas jednego treningu (minuty)</FormLabel>
                    <FormControl>
                      <Input placeholder="np. 60-90 minut" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data urodzenia</FormLabel>
                    <FormControl>
                      <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} value={field.value ?? ""} />
                    </FormControl>
                    {calculatedAge !== undefined && (
                      <FormDescription className="text-xs">Wiek: {calculatedAge} lat{!dateOfBirth && watchedAge ? " (wartość historyczna)" : ""}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Płeć</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Mężczyzna">Mężczyzna</SelectItem>
                        <SelectItem value="Kobieta">Kobieta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="heightCm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wzrost (cm)</FormLabel>
                    <FormControl>
                      <Input type="number" min="50" max="260" placeholder="np. 178" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waga (kg)</FormLabel>
                    <FormControl>
                      <Input type="number" min="20" max="400" placeholder="np. 75" {...field} value={field.value ?? ""} />
                    </FormControl>
                    {bmi !== undefined && (
                      <FormDescription className="text-xs">BMI: {bmi.toFixed(1)}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm border-destructive/20">
            <CardHeader className="bg-destructive/5 border-b border-destructive/10">
              <CardTitle className="text-destructive">Zdrowie i ograniczenia</CardTitle>
              <CardDescription>Kluczowe dla bezpieczeństwa planu</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="healthLimitations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kontuzje / ograniczenia ruchowe / choroby</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Opisz wszelkie przebyte kontuzje, bóle w stawach, nadciśnienie itp." 
                        className="min-h-[100px] border-destructive/30 focus-visible:ring-destructive" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Preferencje Treningowe</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 gap-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isBeginner && (
                  <FormField
                    control={form.control}
                    name="preferredMuscles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Na których partiach mięśniowych najbardziej zależy klientowi?</FormLabel>
                        <FormDescription className="text-xs">Jeśli klient nie zna nazw partii mięśniowych, nie martw się — wybierz partie, na których najbardziej mu zależy. Przykłady: {MUSCLE_GROUPS.join(", ")}.</FormDescription>
                        {genderMuscleSuggestion && (
                          <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 rounded-sm">
                            {genderMuscleSuggestion}
                          </p>
                        )}
                        <FormControl>
                          <Input placeholder="np. Barki, Pośladki" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="avoidedMuscles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partie do pominięcia. Jeżeli tak opisz dlaczego.</FormLabel>
                      <FormDescription className="text-xs">Np. {MUSCLE_GROUPS.join(", ")}.</FormDescription>
                      <FormControl>
                        <Input placeholder="np. Łydki (są już wystarczające)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="favoriteExercises"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ulubione ćwiczenia</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Martwy ciąg, Wyciskanie sztangielek" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="avoidedExercises"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ćwiczenia do bezwzględnego unikania</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Przysiady ze sztangą (ból pleców)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {isBeginner && (
                <p className="text-sm text-muted-foreground -mt-2">
                  Klient jest początkujący — pytania o superserie, serie złożone, drop sety i inne metody intensyfikacji są pomijane.
                </p>
              )}

              <AnimatePresence>
                {isIntermediateOrAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="avoidsAdvancedMethods"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Czy klient ma metody treningowe, których nie chce stosować lub które są dla niego przeciwwskazane?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="max-w-xs">
                                <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Tak">Tak</SelectItem>
                              <SelectItem value="Nie">Nie</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

              {avoidsAdvancedMethods === "Tak" && (
              <FormField
                control={form.control}
                name="advancedMethodsToAvoid"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">Unikane metody intensyfikacji</FormLabel>
                      <FormDescription>
                        Zaznacz metody, których klient nie lubi lub których nie chce stosować.
                      </FormDescription>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {advancedMethodsOptions.map((option) => (
                        <FormField
                          key={option}
                          control={form.control}
                          name="advancedMethodsToAvoid"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={option}
                                className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-muted/20 transition-colors"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(option)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), option])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== option
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer w-full text-sm">
                                  {option}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
                  </motion.div>
                )}
              </AnimatePresence>

              <FormField
                control={form.control}
                name="additionalInfo"
                render={({ field }) => (
                  <FormItem className="pt-4 border-t border-border/50">
                    <FormLabel>Dodatkowe informacje od klienta</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Inne uwagi zgłoszone przez klienta, np. alergie pokarmowe, styl życia..." 
                        className="min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Aktywność, regeneracja i stres</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="activityLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poziom aktywności fizycznej w ciągu dnia</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Siedzący">Siedzący</SelectItem>
                        <SelectItem value="Lekko aktywny">Lekko aktywny</SelectItem>
                        <SelectItem value="Praca fizyczna">Praca fizyczna</SelectItem>
                        <SelectItem value="Bardzo aktywny">Bardzo aktywny</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sleepHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Średnia liczba godzin snu na dobę</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Poniżej 5 godzin">Poniżej 5 godzin</SelectItem>
                        <SelectItem value="5–6 godzin">5–6 godzin</SelectItem>
                        <SelectItem value="6–7 godzin">6–7 godzin</SelectItem>
                        <SelectItem value="7–8 godzin">7–8 godzin</SelectItem>
                        <SelectItem value="Powyżej 8 godzin">Powyżej 8 godzin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="planStylePreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferowany styl planu</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Maksymalna efektywność">Maksymalna efektywność</SelectItem>
                        <SelectItem value="Balans efektywności i wygody">Balans efektywności i wygody</SelectItem>
                        <SelectItem value="Prosty i łatwy do utrzymania">Prosty i łatwy do utrzymania</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stressLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jak oceniasz poziom stresu klienta?</FormLabel>
                    <FormDescription className="text-xs">1 = bardzo niski poziom stresu, 10 = bardzo wysoki poziom stresu</FormDescription>
                    <FormControl>
                      <div className="flex items-center gap-4 pt-2">
                        <Slider min={1} max={10} step={1} value={[field.value ?? 5]} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
                        <span className="text-primary font-semibold w-6 text-center">{field.value ?? 5}</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Lokalizacja treningu i cardio</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {isIntermediateOrAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="priorityMuscle1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partia priorytetowa 1</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Barki" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priorityMuscle2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partia priorytetowa 2</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Pośladki" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priorityMuscle3"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partia priorytetowa 3</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Plecy" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="trainingLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Miejsce treningu</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Siłownia">Siłownia</SelectItem>
                          <SelectItem value="Dom">Dom</SelectItem>
                          <SelectItem value="Plener">Plener</SelectItem>
                          <SelectItem value="Mieszane">Mieszane</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="equipment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dostępny sprzęt</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Hantle, gumy oporowe, brak sprzętu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="cardioPreference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nastawienie do cardio</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">{field.value || undefined}</SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Lubi">Lubi</SelectItem>
                          <SelectItem value="Neutralne">Neutralne</SelectItem>
                          <SelectItem value="Nie lubi">Nie lubi</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cardioFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Częstotliwość cardio</FormLabel>
                      <FormControl>
                        <Input placeholder="np. 2x w tygodniu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preferredCardioType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferowany typ cardio</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Rower, bieganie, marsz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 sticky bottom-6 z-10 bg-background/80 backdrop-blur-sm p-4 rounded-xl border border-border shadow-lg">
            <Button type="button" variant="outline" onClick={() => setLocation(`/clients/${id}`)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={upsertSurvey.isPending} className="gap-2">
              <Save size={16} />
              {upsertSurvey.isPending ? "Zapisywanie..." : "Zapisz Wywiad Treningowy"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
