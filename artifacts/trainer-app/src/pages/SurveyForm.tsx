import { useEffect, useState, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useGetClient,
  getGetClientQueryKey,
  useGetClientSurvey,
  useUpsertClientSurvey,
  getListClientsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Save, Pencil } from "lucide-react";
import { MuscleGroupCombobox } from "@/components/MuscleGroupCombobox";
import { FavoriteExercisesPicker, type FavoriteExercise } from "@/components/FavoriteExercisesPicker";
import { AvoidedExercisesPicker, type AvoidedExercise } from "@/components/AvoidedExercisesPicker";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import {
  TRAINING_GOAL_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  ATHLETE_STATUS_OPTIONS,
  SPORT_PERFORMANCE_NEEDS,
  SESSION_DURATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  CARDIO_PREFERENCE_OPTIONS,
  CARDIO_FREQUENCY_OPTIONS,
  PREFERRED_CARDIO_TYPE_OPTIONS,
  ACTIVITY_LEVEL_OPTIONS,
  SLEEP_HOURS_OPTIONS,
  PLAN_STYLE_OPTIONS,
  ADVANCED_METHODS,
  TRAINING_FREQUENCY_RECOMMENDATIONS,
  BMI_RECOMMENDATION_TEXT,
  CARDIO_RECOMMENDATION_TEXT,
  CARDIO_AVOID_REASSURANCE_TEXT,
  API_TO_ATHLETE_STATUS,
  ATHLETE_STATUS_TO_API,
  calculateBmi,
  calculateAge,
  buildEquipmentString,
  parseEquipment,
  goalIsSport,
  isIntermediateOrAdvancedLevel,
  showTrainingDurationField,
  showEquipmentField,
  showCardioRecommendation,
  isCardioRelevant,
} from "@workspace/survey-config";

// ─── Schema ───────────────────────────────────────────────────────────────────
// All fields optional so trainers can save partial data at any stage.

const surveySchema = z.object({
  trainingGoal: z.string().optional(),
  athleteStatus: z.enum(["Hobbystycznie", "Zawodowo"]).optional(),
  sportPerformanceNeeds: z.array(z.string()).optional().default([]),
  sportsPriorities: z.array(z.string()).optional().default([]),
  trainingMotivation: z.string().optional(),
  experienceLevel: z.string().optional(),
  trainingDuration: z.string().optional(),
  injuryStatus: z.enum(["Tak", "Nie"]).optional(),
  healthLimitations: z.string().optional(),
  desiredWeeklyFrequency: z.coerce
    .number()
    .min(1)
    .max(7)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sessionDuration: z.string().optional(),
  avoidedExercises: z.string().optional(),
  favoriteExercises: z.string().optional(),
  // Trainer-only: muscle groups to avoid entirely (not on client survey)
  age: z.coerce
    .number()
    .min(1)
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dateOfBirth: z
    .string()
    .optional()
    .refine(
      (val) => !val || new Date(val) <= new Date(),
      "Data urodzenia nie może być w przyszłości"
    ),
  gender: z.enum(["Mężczyzna", "Kobieta"]).optional().or(z.literal("")),
  heightCm: z.coerce
    .number()
    .min(80, "Wzrost musi być między 80 a 260 cm")
    .max(260, "Wzrost musi być między 80 a 260 cm")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  weightKg: z.coerce
    .number()
    .min(20)
    .max(400)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  activityLevel: z.string().optional(),
  sleepHours: z.string().optional(),
  stressLevel: z.coerce.number().min(1).max(10).optional(),
  planStylePreference: z.string().optional(),
  avoidsAdvancedMethods: z.string().optional(),
  advancedMethodsToAvoid: z.array(z.string()).default([]),
  hasAdditionalInfo: z.enum(["Tak", "Nie"]).optional(),
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

// ─── Custom PATCH mutation ─────────────────────────────────────────────────────
// Updates an existing survey row in-place (does not insert a new row).

function usePatchSurvey() {
  return useMutation({
    mutationFn: async ({
      clientId,
      surveyId,
      data,
    }: {
      clientId: number;
      surveyId: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    }) => {
      const res = await fetch(`/api/clients/${clientId}/surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });
}

// ─── Loader shell ─────────────────────────────────────────────────────────────

export default function SurveyForm() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [isEditing, setIsEditing] = useState(false);

  const { data: client, isLoading: clientLoading } = useGetClient(id, {
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) },
  });

  const {
    data: survey,
    isLoading: surveyLoading,
    refetch: refetchSurvey,
  } = useGetClientSurvey(id, {
    query: {
      enabled: !!client?.hasSurvey,
      queryKey: ["client-survey-edit", id] as unknown[],
    },
  });

  if (clientLoading || (client?.hasSurvey && surveyLoading)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Wczytywanie wywiadu...
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 text-center text-destructive">
        Nie znaleziono klienta
      </div>
    );
  }

  if (isEditing) {
    return (
      <SurveyFormBody
        key={survey?.id ?? "new"}
        id={id}
        client={client}
        survey={survey}
        surveyId={survey?.id}
        onSaved={() => {
          refetchSurvey();
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  if (!survey) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Klient nie wypełnił jeszcze wywiadu treningowego.
      </div>
    );
  }

  return (
    <SurveyReadonlyPreview
      id={id}
      client={client}
      survey={survey}
      onEdit={() => setIsEditing(true)}
    />
  );
}

// ─── Read-only preview ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SurveyReadonlyPreview({
  id,
  client,
  survey,
  onEdit,
}: {
  id: number;
  client: { firstName: string; lastName: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey: any;
  onEdit: () => void;
}) {
  function Field({
    label,
    value,
  }: {
    label: string;
    value?: string | number | null | undefined;
  }) {
    if (value == null || value === "") return null;
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    );
  }

  const bmi = calculateBmi(survey.heightCm, survey.weightKg);
  const isBeginner =
    survey.experienceLevel === "Brak aktywności fizycznej" ||
    survey.experienceLevel === "Początkujący";
  const showBmiRec = isBeginner && bmi !== undefined && bmi >= 25;

  // Format date of birth for display
  const dobFormatted = survey.dateOfBirth
    ? (() => {
        try {
          const d =
            survey.dateOfBirth instanceof Date
              ? survey.dateOfBirth
              : new Date(survey.dateOfBirth);
          return d.toLocaleDateString("pl-PL");
        } catch {
          return String(survey.dateOfBirth).split("T")[0];
        }
      })()
    : null;

  // Derive age
  const dobStr = survey.dateOfBirth
    ? survey.dateOfBirth instanceof Date
      ? survey.dateOfBirth.toISOString().split("T")[0]
      : String(survey.dateOfBirth).split("T")[0]
    : null;
  const ageVal = dobStr ? (calculateAge(dobStr) ?? survey.age) : survey.age;

  const sportsPriorities: string[] = Array.isArray(survey.sportsPriorities)
    ? survey.sportsPriorities
    : [];
  const SP_LABEL: Record<string, string> = {
    dynamika: "Dynamika",
    szybkosc: "Szybkość",
    stabilizacja: "Stabilizacja",
  };

  const advancedMethods: string[] = Array.isArray(survey.advancedMethodsToAvoid)
    ? survey.advancedMethodsToAvoid
    : [];

  const EditBtn = () => (
    <Button onClick={onEdit} className="gap-2">
      <Pencil size={16} />
      Edytuj wywiad
    </Button>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Back link */}
      <Link
        href={`/clients/${id}`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={16} />
        Powrót do profilu
      </Link>

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Wywiad Treningowy
          </h1>
          <p className="text-muted-foreground mt-1">
            Dla klienta: {client.firstName} {client.lastName}
          </p>
        </div>
        <EditBtn />
      </div>

      {/* ── 1. Cel treningowy ──────────────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Cel treningowy</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cel treningowy" value={survey.trainingGoal} />
          {survey.trainingMotivation ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Dlaczego chcesz trenować?
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {survey.trainingMotivation}
              </p>
            </div>
          ) : null}
          {sportsPriorities.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Priorytety sportowe
              </p>
              <div className="flex flex-wrap gap-2">
                {sportsPriorities.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                  >
                    {SP_LABEL[v] ?? v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showBmiRec && (
        <Card className="border-primary/20 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-primary/90">{BMI_RECOMMENDATION_TEXT}</p>
          </CardContent>
        </Card>
      )}

      {/* ── 2. Doświadczenie i organizacja ────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Doświadczenie i organizacja treningów</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Poziom doświadczenia" value={survey.experienceLevel} />
          <Field label="Staż treningowy" value={survey.trainingDuration} />
          <Field
            label="Liczba treningów tygodniowo"
            value={survey.desiredWeeklyFrequency?.toString()}
          />
          <Field label="Czas trwania sesji" value={survey.sessionDuration} />
        </CardContent>
      </Card>

      {/* ── 3. Dane klienta ───────────────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Dane klienta</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Data urodzenia" value={dobFormatted} />
          <Field label="Wiek" value={ageVal?.toString()} />
          <Field label="Płeć" value={survey.gender} />
          <Field
            label="Wzrost"
            value={survey.heightCm ? `${survey.heightCm} cm` : null}
          />
          <Field
            label="Waga"
            value={survey.weightKg ? `${survey.weightKg} kg` : null}
          />
          <Field label="BMI" value={bmi !== undefined ? bmi.toFixed(1) : null} />
        </CardContent>
      </Card>

      {/* ── 4. Zdrowie i ograniczenia ─────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm border-destructive/20">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10">
          <CardTitle className="text-destructive">
            Zdrowie i ograniczenia
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {survey.healthLimitations ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {survey.healthLimitations}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Brak zgłoszonych przeciwskazań
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 5. Preferencje treningowe ─────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Preferencje treningowe</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Priorytet 1" value={survey.priorityMuscle1} />
          <Field label="Priorytet 2" value={survey.priorityMuscle2} />
          <Field label="Priorytet 3" value={survey.priorityMuscle3} />
          <Field label="Ulubione ćwiczenia" value={survey.favoriteExercises} />
          {survey.avoidsAdvancedMethods != null && (
            <Field
              label="Metody intensyfikacji w planie"
              value={survey.avoidsAdvancedMethods ? "Tak" : "Nie"}
            />
          )}
          {advancedMethods.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Metody do unikania
              </p>
              <div className="flex flex-wrap gap-2">
                {advancedMethods.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 6. Aktywność, regeneracja i stres ────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Aktywność, regeneracja i stres</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Aktywność w ciągu dnia" value={survey.activityLevel} />
          <Field label="Sen (śr. godz./dobę)" value={survey.sleepHours} />
          <Field
            label="Poziom stresu (1–10)"
            value={survey.stressLevel?.toString()}
          />
          <Field
            label="Preferowany styl planu"
            value={survey.planStylePreference}
          />
        </CardContent>
      </Card>

      {/* ── 7. Miejsce treningu i sprzęt ──────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Miejsce treningu i sprzęt</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Miejsce treningów" value={survey.trainingLocation} />
          <Field label="Sprzęt" value={survey.equipment} />
        </CardContent>
      </Card>

      {/* ── 8. Cardio ─────────────────────────────────────────────────── */}
      {(survey.cardioPreference ||
        survey.cardioFrequency ||
        survey.preferredCardioType) && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle>Aktywność tlenowa i cardio</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              label="Preferencja cardio"
              value={survey.cardioPreference}
            />
            <Field
              label="Aktywność tlenowa obecnie"
              value={survey.cardioFrequency}
            />
            <Field
              label="Preferowana forma cardio"
              value={survey.preferredCardioType}
            />
          </CardContent>
        </Card>
      )}

      {/* ── 9. Dodatkowe informacje ───────────────────────────────────── */}
      {survey.additionalInfo && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle>Dodatkowe informacje</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {survey.additionalInfo}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer edit button */}
      <div className="flex justify-end">
        <EditBtn />
      </div>
    </div>
  );
}

// ─── Form body ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SurveyFormBody({
  id,
  client,
  survey,
  surveyId,
  onSaved,
  onCancel,
}: {
  id: number;
  client: { firstName: string; lastName: string; hasSurvey?: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey: any;
  surveyId?: number;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const upsertSurvey = useUpsertClientSurvey();
  const patchSurvey = usePatchSurvey();
  const { toast } = useToast();

  // Derive injuryStatus from stored data for backward-compat with old surveys
  const derivedInjuryStatus =
    survey?.injuryStatus ??
    (survey?.healthLimitations ? "Tak" : undefined);

  // Derive hasAdditionalInfo from stored data
  const derivedHasAdditionalInfo =
    survey?.hasAdditionalInfo ??
    (survey?.additionalInfo ? "Tak" : undefined);

  // Map legacy API athleteStatus format ("Tak — amatorsko") → UI value ("Hobbystycznie")
  const derivedAthleteStatus =
    survey?.athleteStatus && typeof survey.athleteStatus === "string"
      ? (API_TO_ATHLETE_STATUS[survey.athleteStatus] ?? undefined)
      : undefined;

  const form = useForm<SurveyFormValues>({
    resolver: zodResolver(surveySchema),
    defaultValues: {
      trainingGoal: (survey?.trainingGoal as string) ?? "",
      athleteStatus: derivedAthleteStatus,
      sportPerformanceNeeds: (survey?.sportPerformanceNeeds as string[]) ?? [],
      sportsPriorities: (survey?.sportsPriorities as string[]) ?? [],
      trainingMotivation: (survey?.trainingMotivation as string) ?? "",
      experienceLevel: (survey?.experienceLevel as string) ?? "",
      trainingDuration: (survey?.trainingDuration as string) ?? "",
      injuryStatus: derivedInjuryStatus as "Tak" | "Nie" | undefined,
      healthLimitations: (survey?.healthLimitations as string) ?? "",
      desiredWeeklyFrequency:
        (survey?.desiredWeeklyFrequency as number) ?? undefined,
      sessionDuration: (survey?.sessionDuration as string) ?? "",
      avoidedExercises: (survey?.avoidedExercises as string) ?? "",
      favoriteExercises: (survey?.favoriteExercises as string) ?? "",
      age: (survey?.age as number) ?? undefined,
      dateOfBirth: (survey?.dateOfBirth as string) ?? "",
      gender:
        survey?.gender === "Mężczyzna" || survey?.gender === "Kobieta"
          ? (survey.gender as "Mężczyzna" | "Kobieta")
          : "",
      heightCm: (survey?.heightCm as number) ?? undefined,
      weightKg: (survey?.weightKg as number) ?? undefined,
      activityLevel: (survey?.activityLevel as string) ?? "",
      sleepHours: (survey?.sleepHours as string) ?? "",
      stressLevel: (survey?.stressLevel as number) ?? 5,
      planStylePreference: (survey?.planStylePreference as string) ?? "",
      avoidsAdvancedMethods:
        survey?.avoidsAdvancedMethods === true
          ? "Tak"
          : survey?.avoidsAdvancedMethods === false
          ? "Nie"
          : "",
      advancedMethodsToAvoid:
        (survey?.advancedMethodsToAvoid as string[]) ?? [],
      hasAdditionalInfo: derivedHasAdditionalInfo as "Tak" | "Nie" | undefined,
      additionalInfo: (survey?.additionalInfo as string) ?? "",
      priorityMuscle1: (survey?.priorityMuscle1 as string) ?? "",
      priorityMuscle2: (survey?.priorityMuscle2 as string) ?? "",
      priorityMuscle3: (survey?.priorityMuscle3 as string) ?? "",
      trainingLocation: (survey?.trainingLocation as string) ?? "",
      equipment: (survey?.equipment as string) ?? "",
      cardioPreference: (survey?.cardioPreference as string) ?? "",
      cardioFrequency: (survey?.cardioFrequency as string) ?? "",
      preferredCardioType: (survey?.preferredCardioType as string) ?? "",
    },
  });

  // ── Derived watch values ──
  const experienceLevel = form.watch("experienceLevel");
  const avoidsAdvancedMethods = form.watch("avoidsAdvancedMethods");
  const dateOfBirth = form.watch("dateOfBirth");
  const watchedAge = form.watch("age");
  const heightCm = form.watch("heightCm");
  const weightKg = form.watch("weightKg");
  const trainingLocation = form.watch("trainingLocation");
  const trainingGoal = form.watch("trainingGoal");
  const activityLevel = form.watch("activityLevel");
  const injuryStatus = form.watch("injuryStatus");
  const hasAdditionalInfo = form.watch("hasAdditionalInfo");
  const cardioPreference = form.watch("cardioPreference");

  const isSportGoal = goalIsSport(trainingGoal);
  const isIntermAdv = isIntermediateOrAdvancedLevel(experienceLevel);
  // Ref to the animated "Preferencje treningowe" motion.div.
  // Used to restore overflow:visible after the open animation so the
  // absolutely-positioned exercise search dropdowns are not clipped.
  const prefsMotionRef = useRef<HTMLDivElement>(null);
  const showTrainingDuration = showTrainingDurationField(experienceLevel);
  const showEquipment = showEquipmentField(trainingLocation);
  const showCardioRec = showCardioRecommendation(trainingGoal);
  const cardioRelevant = isCardioRelevant(trainingGoal, activityLevel);

  const calculatedAge = calculateAge(dateOfBirth) ?? watchedAge;
  const bmi = calculateBmi(heightCm, weightKg);
  const isBeginner =
    experienceLevel === "Brak aktywności fizycznej" ||
    experienceLevel === "Początkujący";
  const showBmiRecommendation = isBeginner && bmi !== undefined && bmi >= 25;
  const trainingFrequencyRecommendation = experienceLevel
    ? TRAINING_FREQUENCY_RECOMMENDATIONS[experienceLevel]
    : undefined;

  // Equipment checkbox state (synced into RHF via useEffect)
  const [equipmentItems, setEquipmentItems] = useState<string[]>(
    () => parseEquipment(survey?.equipment as string).items
  );
  const [equipmentOther, setEquipmentOther] = useState<string>(
    () => parseEquipment(survey?.equipment as string).other
  );
  useEffect(() => {
    form.setValue("equipment", buildEquipmentString(equipmentItems, equipmentOther));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentItems, equipmentOther]);

  // ── Exercise picker state ──
  const [selectedFavoriteExercises, setSelectedFavoriteExercises] = useState<FavoriteExercise[]>([]);
  const [selectedAvoidedExercises, setSelectedAvoidedExercises] = useState<AvoidedExercise[]>([]);
  const exercisePickerInitialized = useRef(false);
  useEffect(() => {
    if (exercisePickerInitialized.current) return;
    exercisePickerInitialized.current = true;
    setSelectedFavoriteExercises([]);
    setSelectedAvoidedExercises([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shared success/error handlers ──
  const handleSuccess = () => {
    toast({
      title: "Zapisano pomyślnie",
      description: "Wywiad treningowy klienta został zaktualizowany.",
    });
    queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
    queryClient.invalidateQueries({
      queryKey: ["client-survey", id] as unknown[],
    });
    queryClient.invalidateQueries({
      queryKey: ["client-survey-edit", id] as unknown[],
    });
    queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    onSaved?.();
  };

  const handleError = () => {
    toast({
      title: "Błąd zapisu",
      description: "Nie udało się zapisać wywiadu treningowego.",
      variant: "destructive",
    });
  };

  // ── Submit ──
  const onSubmit = (data: SurveyFormValues) => {
    const avoidsAdvancedMethodsBool =
      data.avoidsAdvancedMethods === "Tak"
        ? true
        : data.avoidsAdvancedMethods === "Nie"
        ? false
        : undefined;
    const isSportGoalSubmit = data.trainingGoal === "Cel sportowy";

    const favoritesString =
      selectedFavoriteExercises.length > 0
        ? selectedFavoriteExercises.map((e) => e.name).join(", ")
        : (data.favoriteExercises ?? "");
    const avoidedString =
      selectedAvoidedExercises.length > 0
        ? selectedAvoidedExercises.map((e) => e.name).join(", ")
        : (data.avoidedExercises ?? "");
    const avoidedIds =
      selectedAvoidedExercises.length > 0
        ? selectedAvoidedExercises.map((e) => e.id)
        : undefined;
    const avoidedReasons =
      selectedAvoidedExercises.length > 0
        ? Object.fromEntries(
            selectedAvoidedExercises
              .filter((e) => e.reason)
              .map((e) => [String(e.id), e.reason]),
          )
        : undefined;

    const payload = {
      ...data,
      gender: data.gender || undefined,
      activityLevel: data.activityLevel || undefined,
      sleepHours: data.sleepHours || undefined,
      planStylePreference: data.planStylePreference || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      age: calculateAge(data.dateOfBirth) ?? data.age,
      athleteStatus:
        isSportGoalSubmit && data.athleteStatus
          ? (ATHLETE_STATUS_TO_API[data.athleteStatus] ?? "Nie")
          : "Nie",
      sportPerformanceNeeds: isSportGoalSubmit
        ? (data.sportPerformanceNeeds ?? [])
        : [],
      sportsPriorities: isSportGoalSubmit
        ? (data.sportsPriorities ?? [])
        : [],
      healthLimitations:
        data.injuryStatus === "Nie" ? "" : data.healthLimitations,
      additionalInfo:
        data.hasAdditionalInfo === "Nie" ? "" : data.additionalInfo,
      avoidsAdvancedMethods: avoidsAdvancedMethodsBool,
      advancedMethodsToAvoid:
        avoidsAdvancedMethodsBool === true ? data.advancedMethodsToAvoid : [],
      favoriteExercises: favoritesString,
      avoidedExercises: avoidedString,
      avoidedExerciseIds: avoidedIds,
      avoidedExerciseReasons: avoidedReasons,
    };

    // When editing an existing survey: PATCH (update in-place, no new row).
    // When creating a new survey: PUT (upsert / append history).
    if (surveyId) {
      patchSurvey.mutate(
        { clientId: id, surveyId, data: payload },
        { onSuccess: handleSuccess, onError: handleError },
      );
    } else {
      upsertSurvey.mutate(
        {
          clientId: id,
          data: payload as Parameters<typeof upsertSurvey.mutate>[0]["data"],
        },
        { onSuccess: handleSuccess, onError: handleError },
      );
    }
  };

  const isPending = upsertSurvey.isPending || patchSurvey.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <Link
        href={`/clients/${id}`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={16} />
        Powrót do profilu
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Wywiad Treningowy — Edycja
        </h1>
        <p className="text-muted-foreground mt-1">
          Dla klienta: {client?.firstName} {client?.lastName}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── 1. Cel treningowy ─────────────────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Cel treningowy</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (
                            value === "Cel sportowy" &&
                            form.getValues("experienceLevel") ===
                              "Brak aktywności fizycznej"
                          ) {
                            form.setValue("experienceLevel", "");
                          }
                          if (value !== "Cel sportowy") {
                            form.setValue("athleteStatus", undefined);
                            form.setValue("sportPerformanceNeeds", []);
                            form.setValue("sportsPriorities", []);
                          }
                        }}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz cel...">
                              {field.value || undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TRAINING_GOAL_OPTIONS.map((goal) => (
                            <SelectItem key={goal} value={goal}>
                              {goal}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Motivation — always visible when goal is set */}
                <FormField
                  control={form.control}
                  name="trainingMotivation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dlaczego chcesz trenować?</FormLabel>
                      <FormDescription className="text-xs">
                        Krótko — co klient chce osiągnąć i co chce poprawić.
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="np. Poprawa kondycji, powrót po kontuzji..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Sport goal — conditional block */}
              <AnimatePresence>
                {isSportGoal && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 border-t border-border/50 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="athleteStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Jak uprawia sport?</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value ?? ""}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Wybierz...">
                                      {field.value || undefined}
                                    </SelectValue>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {ATHLETE_STATUS_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Sport performance priorities */}
                      <FormField
                        control={form.control}
                        name="sportsPriorities"
                        render={() => (
                          <FormItem>
                            <FormLabel>
                              Główne priorytety sportowe (opcjonalne)
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Zaznacz obszary kluczowe dla dyscypliny klienta.
                            </FormDescription>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                              {SPORT_PERFORMANCE_NEEDS.map(
                                ({ value: need, desc }) => {
                                  const spVal = need === "Dynamika" ? "dynamika" : need === "Szybkość" ? "szybkosc" : "stabilizacja";
                                  return (
                                    <FormField
                                      key={need}
                                      control={form.control}
                                      name="sportsPriorities"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-muted/20 transition-colors">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value?.includes(spVal)}
                                              onCheckedChange={(checked) => {
                                                checked
                                                  ? field.onChange([
                                                      ...(field.value || []),
                                                      spVal,
                                                    ])
                                                  : field.onChange(
                                                      (field.value || []).filter(
                                                        (v: string) => v !== spVal
                                                      )
                                                    );
                                                const currentNeeds =
                                                  form.getValues("sportPerformanceNeeds") ?? [];
                                                form.setValue(
                                                  "sportPerformanceNeeds",
                                                  checked
                                                    ? [...currentNeeds, need]
                                                    : currentNeeds.filter(
                                                        (v: string) => v !== need
                                                      ),
                                                );
                                              }}
                                            />
                                          </FormControl>
                                          <div className="flex flex-col gap-0.5 flex-1">
                                            <FormLabel className="font-medium cursor-pointer text-sm leading-snug">
                                              {need}
                                            </FormLabel>
                                            <span className="text-xs text-muted-foreground/70 leading-snug">
                                              {desc}
                                            </span>
                                          </div>
                                        </FormItem>
                                      )}
                                    />
                                  );
                                }
                              )}
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* ── 2. Doświadczenie i organizacja ───────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Doświadczenie i organizacja treningów</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Który poziom najlepiej opisuje doświadczenie klienta?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz poziom...">
                            {field.value || undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPERIENCE_LEVEL_OPTIONS
                          .filter(
                            ({ level }) =>
                              !(
                                isSportGoal &&
                                level === "Brak aktywności fizycznej"
                              )
                          )
                          .map(({ level, desc }) => (
                            <SelectItem key={level} value={level}>
                              <span>{level}</span>
                              <span className="text-xs text-muted-foreground ml-2 hidden md:inline">
                                — {desc}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showTrainingDuration && (
                <FormField
                  control={form.control}
                  name="trainingDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jak długo trenuje klient?</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="np. 2 lata z przerwami"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="desiredWeeklyFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Ile treningów tygodniowo klient chciałby wykonywać?
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Pozwoli to lepiej dopasować plan do oczekiwań klienta.
                    </FormDescription>
                    {trainingFrequencyRecommendation && (
                      <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 rounded-sm">
                        {trainingFrequencyRecommendation}
                      </p>
                    )}
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="7"
                        placeholder="4"
                        {...field}
                        value={field.value ?? ""}
                      />
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
                    <FormLabel>
                      Ile czasu klient może poświęcić na pojedynczy trening?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz czas...">
                            {field.value || undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SESSION_DURATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── 3. Dane klienta ───────────────────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Dane klienta</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data urodzenia</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    {calculatedAge !== undefined && (
                      <FormDescription className="text-xs">
                        Wiek: {calculatedAge} lat
                        {!dateOfBirth && watchedAge
                          ? " (wartość historyczna)"
                          : ""}
                      </FormDescription>
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
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
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="80"
                        max="260"
                        placeholder="np. 178"
                        {...field}
                        value={field.value ?? ""}
                      />
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
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="np. 75,5"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                      />
                    </FormControl>
                    {bmi !== undefined && (
                      <FormDescription className="text-xs">
                        BMI: {bmi.toFixed(1)}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── 4. Zdrowie i ograniczenia ─────────────────────────────────── */}
          <Card className="border-border/50 shadow-sm border-destructive/20">
            <CardHeader className="bg-destructive/5 border-b border-destructive/10">
              <CardTitle className="text-destructive">
                Zdrowie i ograniczenia
              </CardTitle>
              <CardDescription>Kluczowe dla bezpieczeństwa planu</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <FormField
                control={form.control}
                name="injuryStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Czy u klienta występują kontuzje, dolegliwości bólowe lub
                      ograniczenia ruchowe?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
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

              <AnimatePresence>
                {injuryStatus === "Tak" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <FormField
                      control={form.control}
                      name="healthLimitations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opisz ograniczenia zdrowotne *</FormLabel>
                          <FormDescription className="text-xs">
                            Przykłady: ból kolan, ból barków, ból odcinka
                            lędźwiowego, strzelający łokieć, problemy z
                            nadgarstkami, ograniczona ruchomość, przebyte
                            operacje, inne przewlekłe dolegliwości.
                          </FormDescription>
                          {isBeginner && (
                            <p className="text-xs text-primary/80 bg-primary/5 border border-primary/20 px-3 py-2">
                              Te informacje są zawsze uwzględniane przy doborze ćwiczeń i nie są traktowane jedynie jako preferencja.
                            </p>
                          )}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* ── 5. Preferencje treningowe ─────────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Preferencje treningowe</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {isBeginner && (
                <div className="text-sm text-muted-foreground bg-muted/30 border border-border/50 px-4 py-3 leading-relaxed">
                  Na początku łatwo pochopnie ocenić, które partie lub ćwiczenia powinny być najważniejsze. Przy poziomie doświadczenia klienta potraktujemy te wybory jako wskazówkę, a plan będzie przede wszystkim rozwijał całe ciało i uczył podstawowych wzorców ruchowych.
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-1">
                  Partie priorytetowe
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {isBeginner
                    ? "Na tym etapie nie musisz wybierać konkretnych priorytetów. Najpierw skupimy się na równomiernym rozwoju całego ciała."
                    : "Do 3 partii, na których klientowi zależy najbardziej."}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(["priorityMuscle1", "priorityMuscle2", "priorityMuscle3"] as const).map(
                    (name, i) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground/80">
                              Priorytet {i + 1}
                            </FormLabel>
                            <FormControl>
                              <MuscleGroupCombobox
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                placeholder={
                                  ["np. Barki", "np. Pośladki", "np. Plecy"][i]
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium leading-none">Ulubione ćwiczenia</p>
                {isBeginner && (
                  <p className="text-xs text-muted-foreground">
                    Możesz wskazać ćwiczenia, które klient lubi, ale trener może wybrać prostsze lub lepiej dopasowane warianty do jego poziomu.
                  </p>
                )}
                <FavoriteExercisesPicker
                  selectedExercises={selectedFavoriteExercises}
                  onSelectedChange={setSelectedFavoriteExercises}
                />
                {selectedFavoriteExercises.length === 0 &&
                  !!form.getValues("favoriteExercises") && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Poprzedni zapis:{" "}
                    <span className="italic">{form.getValues("favoriteExercises")}</span>
                    {" "}— użyj wyszukiwarki, aby zastąpić.
                  </p>
                )}
              </div>

              <AnimatePresence>
                {isIntermAdv && (
                  <motion.div
                    ref={prefsMotionRef}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="space-y-6"
                    style={{ overflow: "hidden" }}
                    onAnimationStart={() => {
                      if (prefsMotionRef.current) {
                        prefsMotionRef.current.style.overflow = "hidden";
                      }
                    }}
                    onAnimationComplete={() => {
                      if (prefsMotionRef.current) {
                        prefsMotionRef.current.style.overflow = "visible";
                      }
                    }}
                  >
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium leading-none">Ćwiczenia do unikania</p>
                      <p className="text-xs text-muted-foreground">
                        Wyszukaj po nazwie i opcjonalnie dodaj powód.
                      </p>
                      <AvoidedExercisesPicker
                        selectedExercises={selectedAvoidedExercises}
                        onSelectedChange={setSelectedAvoidedExercises}
                      />
                      {selectedAvoidedExercises.length === 0 &&
                        !!form.getValues("avoidedExercises") && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Poprzedni zapis:{" "}
                          <span className="italic">{form.getValues("avoidedExercises")}</span>
                          {" "}— użyj wyszukiwarki, aby zastąpić.
                        </p>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="avoidsAdvancedMethods"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Czy klient chce, aby w planie były uwzględniane
                            metody intensyfikacji treningu?
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                          >
                            <FormControl>
                              <SelectTrigger className="max-w-xs">
                                <SelectValue placeholder="Wybierz...">
                                  {field.value || undefined}
                                </SelectValue>
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
                            <FormLabel className="text-base">
                              Unikane metody intensyfikacji
                            </FormLabel>
                            <FormDescription>
                              Zaznacz metody, których klient nie lubi lub których
                              nie chce stosować.
                            </FormDescription>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {ADVANCED_METHODS.map((option) => (
                                <FormField
                                  key={option}
                                  control={form.control}
                                  name="advancedMethodsToAvoid"
                                  render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-muted/20 transition-colors">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(option)}
                                          onCheckedChange={(checked) =>
                                            checked
                                              ? field.onChange([
                                                  ...(field.value || []),
                                                  option,
                                                ])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (v) => v !== option
                                                  )
                                                )
                                          }
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer w-full text-sm">
                                        {option}
                                      </FormLabel>
                                    </FormItem>
                                  )}
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

              {isBeginner && (
                <p className="text-sm text-muted-foreground">
                  Klient jest początkujący — pytania o superserie, drop sety i
                  inne metody intensyfikacji są pomijane.
                </p>
              )}

            </CardContent>
          </Card>

          {/* ── 6. Aktywność, regeneracja i stres ────────────────────────── */}
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
                    <FormLabel>
                      Jaki jest poziom aktywności fizycznej klienta w ciągu dnia?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACTIVITY_LEVEL_OPTIONS.map(
                          ({ level }) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    {field.value && (
                      <FormDescription className="text-xs">
                        {ACTIVITY_LEVEL_OPTIONS.find(
                          (o) => o.level === field.value
                        )?.trainerDesc}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sleepHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ile godzin średnio śpi klient na dobę?</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SLEEP_HOURS_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PLAN_STYLE_OPTIONS.map(({ style }) => (
                          <SelectItem key={style} value={style}>
                            {style}
                          </SelectItem>
                        ))}
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
                    <FormDescription className="text-xs">
                      1 = bardzo niski poziom stresu, 10 = bardzo wysoki poziom
                      stresu
                    </FormDescription>
                    <FormControl>
                      <div className="flex items-center gap-4 pt-2">
                        <Slider
                          min={1}
                          max={10}
                          step={1}
                          value={[field.value ?? 5]}
                          onValueChange={(v) => field.onChange(v[0])}
                          className="flex-1"
                        />
                        <span className="text-primary font-semibold w-6 text-center">
                          {field.value ?? 5}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── 7. Miejsce treningu i sprzęt ──────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Miejsce treningu i sprzęt</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="trainingLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Gdzie najczęściej trenuje klient?
                      </FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === "Siłownia") {
                            setEquipmentItems([]);
                            setEquipmentOther("");
                          }
                        }}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">
                              {field.value || undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Siłownia">Siłownia</SelectItem>
                          <SelectItem value="Dom">Dom</SelectItem>
                          <SelectItem value="Siłownia plenerowa">
                            Siłownia plenerowa
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showEquipment && (
                  <FormItem>
                    <FormLabel>Jakim sprzętem dysponuje klient?</FormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {EQUIPMENT_OPTIONS.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={equipmentItems.includes(opt)}
                            onCheckedChange={(checked) =>
                              setEquipmentItems((prev) =>
                                checked
                                  ? [...prev, opt]
                                  : prev.filter((i) => i !== opt)
                              )
                            }
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                    <Input
                      placeholder="Inny sprzęt"
                      value={equipmentOther}
                      onChange={(e) => setEquipmentOther(e.target.value)}
                      className="mt-2"
                    />
                  </FormItem>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── 8. Aktywność tlenowa i cardio ─────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Aktywność tlenowa i cardio</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {cardioRelevant && (
                <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 rounded-sm -mt-2">
                  {CARDIO_RECOMMENDATION_TEXT}
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="cardioPreference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Jak klient chce uwzględnić cardio w planie?
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">
                              {field.value || undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARDIO_PREFERENCE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {cardioPreference ===
                        "Wolę ograniczyć cardio do niezbędnego minimum" && (
                        <FormDescription className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 rounded-sm">
                          {CARDIO_AVOID_REASSURANCE_TEXT}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cardioFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Jak wygląda aktywność tlenowa klienta obecnie?
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">
                              {field.value || undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARDIO_FREQUENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="preferredCardioType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Jaka forma cardio najbardziej odpowiada klientowi?
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz...">
                              {field.value || undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PREFERRED_CARDIO_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── 9. Dodatkowe informacje ───────────────────────────────────── */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle>Dodatkowe informacje</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <FormField
                control={form.control}
                name="hasAdditionalInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Czy jest coś jeszcze, co powinienem wiedzieć?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="Wybierz...">
                            {field.value || undefined}
                          </SelectValue>
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

              <AnimatePresence>
                {hasAdditionalInfo === "Tak" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <FormField
                      control={form.control}
                      name="additionalInfo"
                      render={({ field }) => (
                        <FormItem>
                          <FormDescription className="text-xs mb-2">
                            Krótko dopisz tylko to, co może mieć znaczenie dla
                            planu.
                          </FormDescription>
                          <FormControl>
                            <Textarea
                              placeholder="Inne uwagi zgłoszone przez klienta, np. alergie, styl życia, ograniczenia czasowe..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* ── Submit bar ──────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 sticky bottom-6 z-10 bg-background/80 backdrop-blur-sm p-4 rounded-xl border border-border shadow-lg">
            <Button
              type="button"
              variant="outline"
              onClick={() => onCancel?.()}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="gap-2"
            >
              <Save size={16} />
              {isPending ? "Zapisywanie..." : "Zapisz zmiany"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
