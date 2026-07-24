import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useSubmitPublicSurvey } from "@workspace/api-client-react";
import { Calendar, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { AvoidedExercisesPicker, type SelectedExercise } from "./AvoidedExercisesPicker";
import { FavoriteExercisesPicker, type FavoriteExercise } from "./FavoriteExercisesPicker";
import { MuscleGroupCombobox } from "./MuscleGroupCombobox";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUPS,
  ADVANCED_METHODS,
  EQUIPMENT_OPTIONS,
  SPORT_PERFORMANCE_NEEDS,
  TRAINING_FREQUENCY_RECOMMENDATIONS,
  BMI_RECOMMENDATION_TEXT,
  CARDIO_RECOMMENDATION_TEXT,
  CARDIO_AVOID_REASSURANCE_TEXT,
  CARDIO_FREQUENCY_HELPER_TEXT,
  calculateBmi,
  calculateAge,
  getLocalDateString,
  buildEquipmentString,
} from "@workspace/survey-config";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const formSchema = z.object({
  firstName: z.string().min(1, "Imię jest wymagane"),
  lastName: z.string().min(1, "Nazwisko jest wymagane"),
  email: z
    .string()
    .transform((val) => val.trim())
    .pipe(
      z
        .string()
        .min(1, "E-mail jest wymagany, aby trener mógł skontaktować się z Tobą oraz przesłać plan treningowy.")
        .email("E-mail jest wymagany, aby trener mógł skontaktować się z Tobą oraz przesłać plan treningowy.")
    ),
  phone: z.string().optional(),
  dateOfBirth: z
    .string()
    .min(1, "Data urodzenia jest wymagana")
    .refine((val) => {
      const age = calculateAge(val);
      return age !== undefined && age >= 0 && age <= 100;
    }, "❌ Wprowadzona data urodzenia jest nieprawidłowa. Sprawdź i popraw datę."),
  gender: z.enum(["Mężczyzna", "Kobieta"], { required_error: "Płeć jest wymagana" }),
  heightCm: z.coerce.number().min(80, "Wzrost musi być między 80 a 260 cm").max(260, "Wzrost musi być między 80 a 260 cm"),
  weightKg: z.coerce.number().min(20, "Waga musi być między 20 a 400 kg").max(400, "Waga musi być między 20 a 400 kg"),
  trainingGoal: z.string().min(1, "To pole jest wymagane"),
  experienceLevel: z.string().min(1, "Poziom doświadczenia jest wymagany"),
  trainingDuration: z.string().optional(),
  injuryStatus: z.enum(["Tak", "Nie"]).optional(),
  healthLimitations: z.string().optional(),
  sessionDuration: z.string().min(1, "To pole jest wymagane"),
  avoidedExercises: z.string().optional(),
  favoriteExercises: z.string().optional(),
  desiredWeeklyFrequency: z.coerce.number({ invalid_type_error: "To pole jest wymagane" }).min(1, "To pole jest wymagane").max(7, "Maksymalna liczba treningów to 7"),
  activityLevel: z.string().min(1, "Poziom aktywności jest wymagany"),
  sleepHours: z.string().min(1, "To pole jest wymagane"),
  stressLevel: z.coerce.number().min(1).max(10).default(5),
  planStylePreference: z.string().min(1, "Wybierz styl planu"),
  avoidsAdvancedMethods: z.enum(["Tak", "Nie"]).optional(),
  advancedMethodsToAvoid: z.array(z.string()).optional().default([]),
  additionalInfo: z.string().optional(),
  priorityMuscle1: z.string().optional(),
  priorityMuscle2: z.string().optional(),
  priorityMuscle3: z.string().optional(),
  trainingLocation: z.string().min(1, "To pole jest wymagane"),
  equipment: z.string().optional(),
  cardioPreference: z.string().optional(),
  cardioFrequency: z.string().optional(),
  preferredCardioType: z.string().optional(),
  trainingMotivation: z.string().optional(),
  hasAdditionalInfo: z.enum(["Tak", "Nie"]).optional(),
  // Athlete / sport fields (only active when trainingGoal === "Cel sportowy")
  athleteStatus: z.enum([
    "Hobbystycznie",
    "Zawodowo",
  ]).optional(),
  sportPerformanceNeeds: z.array(z.string()).optional().default([]),
}).superRefine((data, ctx) => {
  const requiresEquipment = data.trainingLocation === "Dom" || data.trainingLocation === "Siłownia plenerowa";
  if (requiresEquipment && (!data.equipment || data.equipment.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "To pole jest wymagane.",
      path: ["equipment"],
    });
  }
  // Feature 2: when injuryStatus = "Tak" the description is mandatory
  if (data.injuryStatus === "Tak" && (!data.healthLimitations || data.healthLimitations.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Opisz swoje ograniczenia zdrowotne, kontuzje lub dolegliwości bólowe.",
      path: ["healthLimitations"],
    });
  }
  // Sport goal: athleteStatus (sport level) is required when "Cel sportowy" is selected
  if (data.trainingGoal === "Cel sportowy" && !data.athleteStatus) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wybierz poziom sportowy.",
      path: ["athleteStatus"],
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

const Section = ({ title, description, children }: { step: number, title: string, description: string, children: React.ReactNode }) => (
  <div className="space-y-8 mb-16 relative">
    <div className="mb-10">
      <h3 className="text-2xl font-bold text-foreground tracking-tight">{title}</h3>
      <div className="h-[1px] w-12 bg-primary/40 my-4"></div>
      <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-2xl">{description}</p>
    </div>
    {children}
  </div>
);

// ── Date of birth: DD.MM.YYYY masked input with calendar fallback ────────────
function DateOfBirthInput({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: boolean;
}) {
  function toDisplay(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatDigits(digits: string): string {
    const d8 = digits.slice(0, 8);
    let out = d8.slice(0, 2);
    if (d8.length > 2) out += "." + d8.slice(2, 4);
    if (d8.length > 4) out += "." + d8.slice(4, 8);
    return out;
  }

  function tryParseISO(formatted: string): string {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(formatted.trim());
    if (!match) return "";
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  const [display, setDisplay] = useState(() => toDisplay(value));
  const calendarRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = formatDigits(digits);
    setDisplay(formatted);
    onChange(tryParseISO(formatted));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").trim();
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = formatDigits(digits);
    setDisplay(formatted);
    onChange(tryParseISO(formatted));
  }

  function handleCalendarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    if (iso) {
      setDisplay(toDisplay(iso));
      onChange(iso);
    }
  }

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="numeric"
        placeholder="DD.MM.RRRR"
        value={display}
        onChange={handleChange}
        onPaste={handlePaste}
        onBlur={onBlur}
        maxLength={10}
        className={cn(
          "bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none pr-12",
          error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive"
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Otwórz kalendarz"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
        onClick={() => calendarRef.current?.showPicker?.()}
      >
        <Calendar className="w-5 h-5" />
      </button>
      {/* Hidden native date picker — opened by the calendar icon button */}
      <input
        ref={calendarRef}
        type="date"
        max={getLocalDateString(new Date())}
        value={value || ""}
        onChange={handleCalendarChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

export default function SurveyForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showValidationBanner, setShowValidationBanner] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      gender: undefined,
      heightCm: undefined,
      weightKg: undefined,
      trainingGoal: "",
      experienceLevel: "",
      trainingDuration: "",
      injuryStatus: undefined,
      healthLimitations: "",
      athleteStatus: undefined,
      sportPerformanceNeeds: [],
      sessionDuration: "",
      avoidedExercises: "",
      favoriteExercises: "",
      activityLevel: "",
      sleepHours: "",
      stressLevel: 5,
      planStylePreference: "",
      avoidsAdvancedMethods: undefined,
      advancedMethodsToAvoid: [],
      additionalInfo: "",
      trainingMotivation: "",
      hasAdditionalInfo: undefined,
      priorityMuscle1: "",
      priorityMuscle2: "",
      priorityMuscle3: "",
      trainingLocation: "",
      equipment: "",
      cardioPreference: "",
      cardioFrequency: "",
      preferredCardioType: "",
    },
  });

  const experienceLevel = form.watch("experienceLevel");
  const injuryStatus = form.watch("injuryStatus");
  const avoidsAdvancedMethods = form.watch("avoidsAdvancedMethods");
  const dateOfBirth = form.watch("dateOfBirth");
  const gender = form.watch("gender");
  const isBeginner = experienceLevel === "Brak aktywności fizycznej" || experienceLevel === "Początkujący";
  const isIntermediateOrAdvanced = experienceLevel === "Średniozaawansowany" || experienceLevel === "Zaawansowany";
  const showTrainingDuration =
    experienceLevel === "Początkujący" || experienceLevel === "Średniozaawansowany" || experienceLevel === "Zaawansowany";
  const calculatedAge = calculateAge(dateOfBirth);
  const heightCm = form.watch("heightCm");
  const weightKgWatched = form.watch("weightKg");
  // During typing the field holds a dot-normalized string; coerce to number for BMI display
  const weightKg = parseFloat(String(weightKgWatched ?? "")) || undefined;
  const bmi = calculateBmi(heightCm, weightKg);
  const showBmiRecommendation = isBeginner && bmi !== undefined && bmi >= 25;
  const trainingFrequencyRecommendation = experienceLevel ? TRAINING_FREQUENCY_RECOMMENDATIONS[experienceLevel] : undefined;
  const trainingLocation = form.watch("trainingLocation");
  const showEquipmentField = trainingLocation === "Dom" || trainingLocation === "Siłownia plenerowa";
  const trainingGoal = form.watch("trainingGoal");
  const isSportGoal = trainingGoal === "Cel sportowy";
  const showCardioRecommendation = trainingGoal === "Redukcja tkanki tłuszczowej" || trainingGoal === "Poprawa kondycji" || trainingGoal === "Cel sportowy";
  const activityLevel = form.watch("activityLevel");
  const isCardioRelevant = showCardioRecommendation || activityLevel === "Siedzący";
  const hasAdditionalInfoVal = form.watch("hasAdditionalInfo");

  const [equipmentItems, setEquipmentItems] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState<string>("");

  // ── Avoided exercises state (outside RHF — complex object, not a plain field) ─
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [avoidedExerciseOtherText, setAvoidedExerciseOtherText] = useState("");
  const [avoidedExerciseOtherReason, setAvoidedExerciseOtherReason] = useState("");
  // ── Favorite exercises state (outside RHF — complex object, joins to string on submit) ─
  const [selectedFavoriteExercises, setSelectedFavoriteExercises] = useState<FavoriteExercise[]>([]);
  // Auto-expand if the user previously selected a hidden cardio option
  const [cardioTypeExpanded, setCardioTypeExpanded] = useState(() =>
    ["Szybki marsz", "Sport rekreacyjny", "Orbitrek", "Pływanie", "Wioślarz", "Stepper / schody"]
      .includes(form.getValues("preferredCardioType") ?? "")
  );

  useEffect(() => {
    form.setValue("equipment", buildEquipmentString(equipmentItems, equipmentOther));
    form.trigger("equipment");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentItems, equipmentOther]);

  const mutation = useSubmitPublicSurvey();

  const onInvalid = () => {
    setShowValidationBanner(true);
    setTimeout(() => {
      const firstInvalid = document.querySelector('[aria-invalid="true"]');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  };

  const onSubmit = (data: FormValues) => {
    setShowValidationBanner(false);
    const {
      avoidsAdvancedMethods,
      advancedMethodsToAvoid,
      injuryStatus: injuryStatusVal,
      athleteStatus: athleteStatusVal,
      sportPerformanceNeeds: sportNeedsVal,
      favoriteExercises: _favoriteExercisesRHF, // discarded — driven by picker state
      ...rest
    } = data;
    const avoidsAdvancedMethodsBool =
      avoidsAdvancedMethods === "Tak" ? true : avoidsAdvancedMethods === "Nie" ? false : undefined;
    const isSportGoalSubmit = rest.trainingGoal === "Cel sportowy";
    // Map simplified sport-level value to the legacy API format the engine expects
    const levelToApiStatus: Record<string, string> = {
      "Hobbystycznie": "Tak — amatorsko",
      "Zawodowo": "Tak — zawodowo",
    };
    const mappedAthleteStatus = isSportGoalSubmit && athleteStatusVal
      ? (levelToApiStatus[athleteStatusVal] ?? "Nie")
      : "Nie";
    const payload = {
      ...rest,
      age: calculateAge(rest.dateOfBirth) ?? undefined,
      injuryStatus: injuryStatusVal,
      // When "Nie" is selected, clear any leftover text so it's not stored
      healthLimitations: injuryStatusVal === "Nie" ? "" : rest.healthLimitations,
      favoriteExercises: selectedFavoriteExercises.length > 0
        ? selectedFavoriteExercises.map((e) => e.name).join(", ")
        : undefined,
      athleteStatus: mappedAthleteStatus,
      sportDiscipline: undefined,
      sportPerformanceNeeds: isSportGoalSubmit ? (sportNeedsVal ?? []) : [],
      avoidsAdvancedMethods: avoidsAdvancedMethodsBool,
      advancedMethodsToAvoid: avoidsAdvancedMethodsBool === true ? advancedMethodsToAvoid : [],
      avoidedExerciseIds: selectedExercises.map((e) => e.id),
      avoidedExerciseReasons: Object.fromEntries(
        selectedExercises
          .filter((e) => e.reason.trim())
          .map((e) => [String(e.id), e.reason.trim()]),
      ),
      avoidedExerciseOtherText: avoidedExerciseOtherText.trim() || undefined,
      avoidedExerciseOtherReason: avoidedExerciseOtherReason.trim() || undefined,
    };
    mutation.mutate(
      { data: payload as Parameters<typeof mutation.mutate>[0]["data"] },
      {
        onSuccess: (res) => {
          setSuccessMessage(res.message || "Dziękuję za wypełnienie wywiadu treningowego. Przeanalizuję Twoje odpowiedzi i przygotuję indywidualny plan treningowy.");
          setIsSubmitted(true);
        },
      }
    );
  };

  if (isSubmitted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center justify-center py-24 px-6 text-center bg-card/30 backdrop-blur-sm border border-white/5 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8">
          <CheckCircle2 className="w-12 h-12 text-primary" />
        </div>
        <h3 className="text-3xl font-bold mb-4 tracking-tight">Krok pierwszy zrobiony.</h3>
        <p className="text-muted-foreground text-lg max-w-lg leading-relaxed">
          {successMessage}
        </p>
      </motion.div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
        {showValidationBanner && Object.keys(form.formState.errors).length > 0 && (
          <div className="border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm font-medium mb-8">
            Nie można wysłać wywiadu treningowego. Uzupełnij wymagane pola oznaczone na czerwono.
          </div>
        )}
        
        <Section
          step={1}
          title="Dane podstawowe"
          description="Podstawowe informacje pozwalają mi lepiej Cię poznać oraz uwzględnić wiek, wzrost i wagę przy doborze obciążeń i tempa progresji."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="firstName" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Imię *</FormLabel>
                <FormControl>
                  <Input {...field} className={cn("bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="lastName" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Nazwisko *</FormLabel>
                <FormControl>
                  <Input {...field} className={cn("bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">E-mail *</FormLabel>
                <FormControl>
                  <Input {...field} type="email" className={cn("bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Telefon</FormLabel>
                <FormControl>
                  <Input {...field} type="tel" className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dateOfBirth" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Data urodzenia *</FormLabel>
                <FormControl>
                  <DateOfBirthInput
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      form.trigger("dateOfBirth");
                    }}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                  />
                </FormControl>
                {calculatedAge !== undefined && !fieldState.error && (
                  <p className="text-xs text-muted-foreground">Wiek: {calculatedAge} lat</p>
                )}
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="gender" render={({field, fieldState}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Płeć *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className={cn("grid grid-cols-2 gap-3", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}>
                    {["Mężczyzna", "Kobieta"].map(g => (
                      <FormItem key={g} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={g} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex items-center justify-center px-4 py-3 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium text-sm">
                          {g}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="heightCm" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Wzrost (cm) *</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" min={80} max={260} {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} className={cn("bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="weightKg" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Waga (kg) *</FormLabel>
                <FormControl>
                  <Input type="text" inputMode="decimal" placeholder="np. 75,5" {...field} value={field.value ?? ''} onChange={(e) => { const normalized = e.target.value.replace(",", "."); field.onChange(normalized || undefined); }} className={cn("bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")} />
                </FormControl>
                {bmi !== undefined && (
                  <p className="text-xs text-muted-foreground/70">BMI: {bmi.toFixed(1)}</p>
                )}
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Section>

        <Section
          step={2}
          title="Cel treningowy"
          description="Twój cel wyznacza kierunek całego planu — od doboru ćwiczeń, przez intensywność, aż po proporcje treningu siłowego i cardio."
        >
          <FormField control={form.control} name="trainingGoal" render={({field, fieldState}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Cel treningowy *</FormLabel>
              {showBmiRecommendation && (
                <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                  {BMI_RECOMMENDATION_TEXT}
                </p>
              )}
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset sport fields when switching away from sport goal
                    if (value !== "Cel sportowy") {
                      form.setValue("athleteStatus", undefined);
                      form.setValue("sportPerformanceNeeds", []);
                    }
                    // "Cel sportowy" + "Brak aktywności fizycznej" are logically contradictory
                    if (value === "Cel sportowy" && form.getValues("experienceLevel") === "Brak aktywności fizycznej") {
                      form.setValue("experienceLevel", "");
                    }
                    form.trigger("trainingGoal");
                  }}
                  defaultValue={field.value}
                  className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}
                >
                  {["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa kondycji", "Poprawa sprawności", "Cel sportowy"].map(goal => (
                    <FormItem key={goal} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={goal} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-5 min-h-[72px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {goal}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* ── Conditional sport block — shown only when "Cel sportowy" is selected ── */}
          <AnimatePresence>
            {isSportGoal && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="space-y-8 pt-6 border-t border-white/10">
                  {/* Sport level */}
                  <FormField control={form.control} name="athleteStatus" render={({field, fieldState}) => (
                    <FormItem className="space-y-4">
                      <FormLabel className="text-muted-foreground">Jak uprawiasz sport? *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.trigger("athleteStatus");
                          }}
                          value={field.value}
                          className={cn(
                            "grid grid-cols-1 sm:grid-cols-2 gap-3",
                            fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2"
                          )}
                        >
                          {["Hobbystycznie", "Zawodowo"].map((opt) => (
                            <FormItem key={opt} className="flex items-center space-x-0 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={opt} className="peer sr-only" />
                              </FormControl>
                              <FormLabel className="w-full flex items-center justify-center px-6 py-5 min-h-[72px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium text-sm">
                                {opt}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* 3 main sport performance priorities */}
                  <FormField control={form.control} name="sportPerformanceNeeds" render={() => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">Główne priorytety sportowe (opcjonalne)</FormLabel>
                      <FormDescription className="text-xs text-muted-foreground/70">
                        Zaznacz obszary, które są dla Ciebie najważniejsze. Pomogą dobrać odpowiednie elementy treningowe.
                      </FormDescription>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        {SPORT_PERFORMANCE_NEEDS.map(({ value: need, desc }) => (
                          <FormField key={need} control={form.control} name="sportPerformanceNeeds" render={({field}) => (
                            <FormItem className="flex flex-row items-start space-x-4 space-y-0 p-4 border border-white/5 bg-card/50 rounded-none hover:bg-card/80 transition-colors">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(need)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), need])
                                      : field.onChange((field.value || []).filter((v: string) => v !== need));
                                  }}
                                  className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground border-white/20 h-5 w-5 rounded-none mt-0.5"
                                />
                              </FormControl>
                              <div className="flex flex-col gap-0.5 flex-1">
                                <FormLabel className="font-medium cursor-pointer text-sm leading-snug">{need}</FormLabel>
                                <span className="text-xs text-muted-foreground/70 leading-snug">{desc}</span>
                              </div>
                            </FormItem>
                          )} />
                        ))}
                      </div>
                    </FormItem>
                  )} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Dlaczego chcesz trenować? ── */}
          <FormField control={form.control} name="trainingMotivation" render={({field}) => (
            <FormItem className="mt-8">
              <FormLabel className="text-muted-foreground">Dlaczego chcesz trenować?</FormLabel>
              <FormDescription className="text-xs text-muted-foreground/70">
                Krótko napisz, po co chcesz trenować i co chcesz poprawić.
              </FormDescription>
              <FormControl>
                <Input
                  placeholder="np. Chcę poprawić kondycję i schudnąć przed wakacjami"
                  {...field}
                  className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none"
                />
              </FormControl>
            </FormItem>
          )} />
        </Section>

        <Section
          step={3}
          title="Doświadczenie"
          description="Poziom zaawansowania decyduje o tym, jak dobieram technikę, złożoność ćwiczeń oraz sposób prowadzenia planu."
        >
          <FormField control={form.control} name="experienceLevel" render={({field, fieldState}) => (
            <FormItem className="space-y-4 mt-12">
              <FormLabel className="text-muted-foreground">Który poziom najlepiej opisuje Twoje doświadczenie treningowe? *</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={(value) => {
                      field.onChange(value);
                      // Auto-reset if sport goal is active and "Brak aktywności" is somehow still selected
                    }} defaultValue={field.value} className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}>
                  {[
                    ...(!isSportGoal ? [{ level: "Brak aktywności fizycznej", desc: "Nie podejmuję regularnej aktywności fizycznej, nigdy wcześniej nie realizowałem/-am uporządkowanego treningu oporowego lub wracam po długiej przerwie. Chcę spokojnie zacząć, nauczyć się podstawowych wzorców ruchowych i stopniowo przygotować organizm do regularnego wysiłku." }] : []),
                    { level: "Początkujący", desc: "Mam niewielkie doświadczenie treningowe. Nadal uczę się podstawowych ćwiczeń, poprawnej techniki oraz zasad treningowych i nie czuję się jeszcze pewnie w samodzielnym planowaniu treningów." },
                    { level: "Średniozaawansowany", desc: "Trenuję regularnie i swobodnie wykonuję większość podstawowych ćwiczeń. Rozumiem podstawowe zasady treningowe, potrafię kontrolować technikę i świadomie realizuję plan treningowy." },
                    { level: "Zaawansowany", desc: "Posiadam duże doświadczenie treningowe, bardzo dobrze znam swoje możliwości oraz świadomie wykorzystuję różne metody treningowe do osiągania konkretnych celów." },
                  ].map(({ level, desc }) => (
                    <FormItem key={level} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={level} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 py-5 min-h-[140px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        <span>{level}</span>
                        <span className="text-xs font-normal text-muted-foreground leading-snug">{desc}</span>
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormDescription className="text-xs text-muted-foreground/70">
                Nie kieruj się wyłącznie liczbą lat treningu. Wybierz poziom, który najlepiej opisuje Twoją wiedzę, umiejętności oraz samodzielność podczas treningów.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          
          {showTrainingDuration && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
              <FormField control={form.control} name="trainingDuration" render={({field}) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Jak długo trenujesz?</FormLabel>
                  <FormControl>
                    <Input placeholder="np. 2 lata" {...field} className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none" />
                  </FormControl>
                </FormItem>
              )} />
            </div>
          )}
        </Section>

        <Section
          step={4}
          title="Zdrowie i ograniczenia"
          description="Informacje o kontuzjach i dolegliwościach są kluczowe dla bezpieczeństwa — pozwalają wykluczyć ryzykowne ćwiczenia i dobrać bezpieczne alternatywy."
        >
          {/* Feature 2 — Structured injury / health-limitation capture */}
          <FormField control={form.control} name="injuryStatus" render={({field, fieldState}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Czy masz jakiekolwiek kontuzje, dolegliwości bólowe lub ograniczenia ruchowe, o których trener powinien wiedzieć? *</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.trigger(["injuryStatus", "healthLimitations"]);
                  }}
                  value={field.value}
                  className={cn("grid grid-cols-2 gap-4 max-w-sm", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}
                >
                  {["Tak", "Nie"].map((opt) => (
                    <FormItem key={opt} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={opt} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-5 min-h-[64px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {opt}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Conditional description — shown only when "Tak" is selected */}
            {injuryStatus === "Tak" && (
            <FormField control={form.control} name="healthLimitations" render={({field, fieldState}) => (
              <FormItem className="mt-6">
                <FormLabel className="text-muted-foreground">Opisz zdrowie i ograniczenia *</FormLabel>
                <FormDescription className="text-xs text-muted-foreground/70">
                  Przykłady: ból kolan, ból barków, ból odcinka lędźwiowego, strzelający łokieć, problemy z nadgarstkami, ograniczona ruchomość, przebyte operacje, inne przewlekłe dolegliwości.
                </FormDescription>
                {isBeginner && (
                  <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                    Te informacje są zawsze uwzględniane przy doborze ćwiczeń i nie są traktowane jedynie jako preferencja.
                  </p>
                )}
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Opisz krótko swoje kontuzje, dolegliwości lub ograniczenia ruchowe..."
                    className={cn(
                      "bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y",
                      fieldState.error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive"
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          )}
        </Section>

        <Section
          step={5}
          title="Organizacja treningów"
          description="Realny czas i częstotliwość treningów pozwalają ułożyć plan, który będzie możliwy do utrzymania na dłuższą metę, a nie tylko przez pierwsze tygodnie."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <FormField control={form.control} name="desiredWeeklyFrequency" render={({field, fieldState}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Ile treningów tygodniowo chciałbyś wykonywać? *</FormLabel>
                <FormDescription className="text-xs text-muted-foreground/70">
                  Pozwoli to lepiej dopasować plan do Twoich oczekiwań oraz możliwości.
                </FormDescription>
                {trainingFrequencyRecommendation && (
                  <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                    {trainingFrequencyRecommendation}
                  </p>
                )}
                <FormControl>
                  <Input 
                    type="number" 
                    min={1} 
                    max={7} 
                    {...field} 
                    value={field.value || ''} 
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Math.min(7, Math.max(1, parseInt(e.target.value)));
                      field.onChange(val);
                    }}
                    className={cn("bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none", fieldState.error && "border-destructive focus-visible:border-destructive")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sessionDuration" render={({field, fieldState}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Ile czasu realnie możesz poświęcić na pojedynczy trening? *</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className={cn("grid grid-cols-2 gap-3", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}
                  >
                    {["30–45 min", "45–60 min", "60–90 min", "90+ min"].map((opt) => (
                      <FormItem key={opt} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={opt} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex items-center justify-center px-4 py-4 min-h-[56px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium text-sm">
                          {opt}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Section>

        <Section
          step={6}
          title="Miejsce treningu i sprzęt"
          description="Miejsce oraz dostępny sprzęt decydują o tym, jakie ćwiczenia i warianty obciążeń będą dla Ciebie realnie wykonalne."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="trainingLocation" render={({field, fieldState}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Gdzie najczęściej będziesz trenować? *</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.trigger(["trainingLocation", "equipment"]);
                    }}
                    defaultValue={field.value}
                    className={cn("grid grid-cols-1 gap-3", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}
                  >
                    {[
                      { loc: "Siłownia", desc: "Mam dostęp do pełnego wyposażenia siłowni." },
                      { loc: "Dom", desc: "Trenuję w domu." },
                      { loc: "Siłownia plenerowa", desc: "Trenuję głównie na drążkach, poręczach oraz sprzęcie dostępnym na świeżym powietrzu." },
                    ].map(({ loc, desc }) => (
                      <FormItem key={loc} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={loc} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex flex-col items-start gap-1 px-6 py-4 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium">
                          <span>{loc}</span>
                          <span className="text-xs font-normal text-muted-foreground leading-snug">{desc}</span>
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {showEquipmentField && (
              <div aria-invalid={!!form.formState.errors.equipment} className="space-y-2">
                <Label className="text-muted-foreground">Jakim sprzętem dysponujesz? *</Label>
                <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 -m-2", form.formState.errors.equipment && "ring-1 ring-destructive ring-offset-2 ring-offset-background")}>
                  {EQUIPMENT_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={equipmentItems.includes(opt)}
                        onCheckedChange={(checked) =>
                          setEquipmentItems((prev) => (checked ? [...prev, opt] : prev.filter((i) => i !== opt)))
                        }
                        className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground border-white/20 h-4 w-4 rounded-none"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                <Input
                  placeholder="Inny sprzęt"
                  value={equipmentOther}
                  onChange={(e) => setEquipmentOther(e.target.value)}
                  className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none mt-2"
                />
                {form.formState.errors.equipment && (
                  <p className="text-sm font-medium text-destructive">{form.formState.errors.equipment.message as string}</p>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section
          step={7}
          title="Cardio"
          description="Pomaga dobrać ilość aktywności wspierającej redukcję, kondycję i ogólną wydolność."
        >
          {isCardioRelevant && (
            <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2 mb-6 -mt-4">
              {CARDIO_RECOMMENDATION_TEXT}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cardio preference — 2 compact options */}
            <FormField control={form.control} name="cardioPreference" render={({field}) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-muted-foreground">Jak uwzględnić cardio?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-1 gap-2">
                    {([
                      { label: "Uwzględnij w planie", value: "Chętnie uwzględnię cardio w planie" },
                      { label: "Tylko niezbędne minimum", value: "Wolę ograniczyć cardio do niezbędnego minimum" },
                    ] as const).map(({ label, value }) => (
                      <FormItem key={value} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={value} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex items-center px-4 py-3 min-h-[46px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium text-sm leading-snug">
                          {label}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                {field.value === "Wolę ograniczyć cardio do niezbędnego minimum" && (
                  <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                    {CARDIO_AVOID_REASSURANCE_TEXT}
                  </p>
                )}
              </FormItem>
            )} />

            {/* Cardio frequency — 2×2 on mobile, 4-in-a-row on desktop */}
            <FormField control={form.control} name="cardioFrequency" render={({field}) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-muted-foreground">Jak często wykonujesz cardio?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {([
                      { label: "Brak",          value: "Nie wykonuję cardio" },
                      { label: "1× / tydz.",    value: "1 raz w tygodniu" },
                      { label: "2–3× / tydz.",  value: "2–3 razy w tygodniu" },
                      { label: "4+× / tydz.",   value: "4 lub więcej razy w tygodniu" },
                    ] as const).map(({ label, value }) => (
                      <FormItem key={value} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={value} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full min-h-[46px] flex items-center justify-center text-sm border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium text-center">
                          {label}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )} />
          </div>

          {/* Preferred cardio activity — progressive disclosure */}
          <div className="mt-6">
            <FormField control={form.control} name="preferredCardioType" render={({field}) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-muted-foreground">Jaka forma aktywności tlenowej najbardziej Ci odpowiada?</FormLabel>

                <RadioGroup onValueChange={field.onChange} value={field.value}>
                  {/* Always-visible: Marsz, Bieganie, Rower */}
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: "Marsz",    value: "Marsz" },
                      { label: "Bieganie", value: "Bieganie" },
                      { label: "Rower",    value: "Rower" },
                    ] as const).map(({ label, value }) => {
                      const id = `cardio-type-${value}`;
                      return (
                        <div key={value} className="flex items-center">
                          <RadioGroupItem id={id} value={value} className="peer sr-only" />
                          <label htmlFor={id} className="w-full min-h-[46px] flex items-center justify-center text-sm border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium text-center">
                            {label}
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {/* Expanded: 6 additional options */}
                  <AnimatePresence>
                    {cardioTypeExpanded && (
                      <motion.div
                        key="cardio-extra"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {([
                            { label: "Szybki marsz", value: "Szybki marsz" },
                            { label: "Sport",        value: "Sport rekreacyjny" },
                            { label: "Orbitrek",     value: "Orbitrek" },
                            { label: "Pływanie",     value: "Pływanie" },
                            { label: "Wioślarz",     value: "Wioślarz" },
                            { label: "Schody",       value: "Stepper / schody" },
                          ] as const).map(({ label, value }) => {
                            const id = `cardio-type-${value.replace(/[\s/]+/g, "-")}`;
                            return (
                              <div key={value} className="flex items-center">
                                <RadioGroupItem id={id} value={value} className="peer sr-only" />
                                <label htmlFor={id} className="w-full min-h-[46px] flex items-center justify-center text-sm border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium text-center">
                                  {label}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </RadioGroup>

                {/* Pokaż więcej / Pokaż mniej */}
                <button
                  type="button"
                  onClick={() => setCardioTypeExpanded(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", cardioTypeExpanded && "rotate-180")} />
                  {cardioTypeExpanded ? "Pokaż mniej" : "Pokaż więcej"}
                </button>

                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Section>

        <Section
          step={8}
          title="Regeneracja i styl życia"
          description="Sen, poziom stresu oraz codzienna aktywność wpływają na zdolność organizmu do regeneracji, co bezpośrednio przekłada się na dobór objętości treningowej."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <FormField control={form.control} name="activityLevel" render={({field, fieldState}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Jak dużo ruszasz się na co dzień poza treningami? *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className={cn("grid grid-cols-1 gap-2", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}>
                    {([
                      { value: "Siedzący",       label: "Siedzący tryb dnia",    desc: "Większość dnia siedzę i mało chodzę." },
                      { value: "Lekko aktywny",  label: "Umiarkowana aktywność", desc: "Regularnie chodzę i wykonuję lekkie codzienne aktywności." },
                      { value: "Praca fizyczna", label: "Duża aktywność",        desc: "Większość dnia jestem w ruchu lub pracuję fizycznie." },
                      { value: "Bardzo aktywny", label: "Bardzo duża aktywność", desc: "Wykonuję ciężką pracę fizyczną albo intensywnie ruszam się przez większość dnia." },
                    ] as const).map(({ value, label, desc }) => (
                      <FormItem key={value} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={value} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex flex-col items-start gap-0.5 px-5 py-3 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium">
                          <span className="text-sm">{label}</span>
                          <span className="text-xs font-normal text-muted-foreground leading-snug">{desc}</span>
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="sleepHours" render={({field, fieldState}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Ile godzin średnio sypiasz w ciągu doby? *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className={cn("grid grid-cols-1 gap-3", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}>
                    {["Poniżej 5 godzin", "5–6 godzin", "6–7 godzin", "7–8 godzin", "Powyżej 8 godzin"].map(hours => (
                      <FormItem key={hours} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={hours} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex items-center px-6 py-4 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium">
                          {hours}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="stressLevel" render={({field}) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Jak oceniasz swój poziom stresu?</FormLabel>
              <FormDescription className="text-xs text-muted-foreground/70">
                1 = bardzo niski poziom stresu, 10 = bardzo wysoki poziom stresu
              </FormDescription>
              <FormControl>
                <div className="flex items-center gap-6 pt-2">
                  <Slider min={1} max={10} step={1} value={[field.value ?? 5]} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
                  <span className="text-primary font-semibold text-lg w-8 text-center">{field.value ?? 5}</span>
                </div>
              </FormControl>
            </FormItem>
          )} />
        </Section>

        <Section
          step={9}
          title="Dodatkowe preferencje"
          description="Twoje preferencje dotyczące stylu planu, priorytetowych partii oraz technik treningowych pomagają dopasować plan nie tylko pod cel, ale i pod Twój komfort."
        >
          <FormField control={form.control} name="planStylePreference" render={({field, fieldState}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Jaki styl planu Ci odpowiada? *</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4", fieldState.error && "ring-1 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2")}>
                  {[
                    { style: "Maksymalna efektywność", desc: "Najważniejsze są dla mnie jak najlepsze efekty." },
                    { style: "Balans efektywności i wygody", desc: "Chcę osiągać dobre efekty przy zachowaniu komfortu treningów." },
                    { style: "Prosty i łatwy do utrzymania", desc: "Zależy mi na prostym, przejrzystym planie, który będzie łatwy do realizacji nawet w gorsze dni." },
                  ].map(({ style, desc }) => (
                    <FormItem key={style} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={style} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 py-5 min-h-[120px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        <span>{style}</span>
                        <span className="text-xs font-normal text-muted-foreground leading-snug">{desc}</span>
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {isBeginner && (
            <div className="mt-12 text-sm text-muted-foreground/90 bg-muted/20 border border-white/10 px-4 py-3 leading-relaxed">
              Na początku łatwo pochopnie ocenić, które partie lub ćwiczenia powinny być najważniejsze. Przy Twoim poziomie doświadczenia potraktujemy te wybory jako wskazówkę, a plan będzie przede wszystkim rozwijał całe ciało i uczył podstawowych wzorców ruchowych.
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 mt-12">
            {/* ── Ćwiczenia do unikania — tylko dla Średniozaawansowany / Zaawansowany ─ */}
            {isIntermediateOrAdvanced && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Ćwiczenia do unikania</label>
                <p className="text-xs text-muted-foreground/70">
                  Wyszukaj po nazwie lub opisz ćwiczenie, jeśli nie znasz jego nazwy.
                </p>
                <AvoidedExercisesPicker
                  selectedExercises={selectedExercises}
                  onSelectedChange={setSelectedExercises}
                  otherText={avoidedExerciseOtherText}
                  onOtherTextChange={setAvoidedExerciseOtherText}
                  otherReason={avoidedExerciseOtherReason}
                  onOtherReasonChange={setAvoidedExerciseOtherReason}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {isBeginner ? "Ćwiczenia preferowane" : "Jakie są Twoje ulubione ćwiczenia?"}
              </label>
              <p className="text-xs text-muted-foreground/70">
                {isBeginner
                  ? "Możesz wskazać ćwiczenia, które lubisz, ale trener może wybrać prostsze lub lepiej dopasowane warianty do Twojego poziomu."
                  : "Wyszukaj po nazwie — możesz dodać kilka ćwiczeń."}
              </p>
              <FavoriteExercisesPicker
                selectedExercises={selectedFavoriteExercises}
                onSelectedChange={setSelectedFavoriteExercises}
              />
            </div>
          </div>

          <div className="space-y-3 mt-12">
            <p className="text-sm font-medium text-muted-foreground">Partie priorytetowe</p>
            <p className="text-xs text-muted-foreground/70">
              {isBeginner
                ? "Na tym etapie nie musisz wybierać konkretnych priorytetów. Najpierw skupimy się na równomiernym rozwoju całego ciała."
                : "Wybierz do 3 partii mięśniowych, na których zależy Ci najbardziej."}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="priorityMuscle1" render={({field}) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground/80">Priorytet 1</FormLabel>
                    <FormControl>
                      <MuscleGroupCombobox
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="np. Barki"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="priorityMuscle2" render={({field}) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground/80">Priorytet 2</FormLabel>
                    <FormControl>
                      <MuscleGroupCombobox
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="np. Pośladki"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="priorityMuscle3" render={({field}) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground/80">Priorytet 3</FormLabel>
                    <FormControl>
                      <MuscleGroupCombobox
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="np. Plecy"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

          <AnimatePresence>
            {isIntermediateOrAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-12">
                  <FormField control={form.control} name="avoidsAdvancedMethods" render={({field}) => (
                    <FormItem className="space-y-4 mb-8">
                      <FormLabel className="text-muted-foreground">Czy chcesz, aby w planie były uwzględniane metody intensyfikacji treningu?</FormLabel>
                      <FormDescription className="text-xs text-muted-foreground/70">
                        Zaznacz tylko te metody, które chcesz stosować w planie.
                      </FormDescription>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-4 max-w-sm">
                          {["Tak", "Nie"].map(opt => (
                            <FormItem key={opt} className="flex items-center space-x-0 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={opt} className="peer sr-only" />
                              </FormControl>
                              <FormLabel className="w-full flex items-center justify-center px-6 py-4 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                                {opt}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )} />

                  <AnimatePresence>
                    {avoidsAdvancedMethods === "Tak" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <FormField control={form.control} name="advancedMethodsToAvoid" render={() => (
                          <FormItem className="mb-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              {ADVANCED_METHODS.map(method => (
                                <FormField key={method} control={form.control} name="advancedMethodsToAvoid" render={({field}) => (
                                  <FormItem className="flex flex-row items-center space-x-4 space-y-0 p-5 border border-white/5 bg-card/50 rounded-none hover:bg-card/80 transition-colors">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(method)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), method])
                                            : field.onChange((field.value || []).filter(val => val !== method))
                                        }}
                                        className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground border-white/20 h-5 w-5 rounded-none"
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-sm leading-snug flex-1">{method}</FormLabel>
                                  </FormItem>
                                )} />
                              ))}
                            </div>
                          </FormItem>
                        )} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section
          step={10}
          title="Dodatkowe informacje"
          description="Miejsce na wszystko, co może mieć znaczenie przy przygotowaniu planu."
        >
          <FormField control={form.control} name="hasAdditionalInfo" render={({field}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Czy jest coś jeszcze, co powinienem wiedzieć?</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="grid grid-cols-2 gap-4 max-w-sm"
                >
                  {["Tak", "Nie"].map((opt) => (
                    <FormItem key={opt} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={opt} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-4 min-h-[56px] border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {opt}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )} />
          {hasAdditionalInfoVal === "Tak" && (
            <FormField control={form.control} name="additionalInfo" render={({field}) => (
              <FormItem className="mt-6">
                <FormDescription className="text-xs text-muted-foreground/70 mb-2">
                  Krótko dopisz tylko to, co może mieć znaczenie dla planu.
                </FormDescription>
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
          )}
        </Section>

        <div className="pt-8 flex justify-center">
          <Button 
            type="submit" 
            disabled={mutation.isPending}
            className="w-full md:w-auto min-w-[280px] h-14 bg-primary text-primary-foreground font-semibold text-lg uppercase tracking-wide hover:bg-primary/90 transition-all rounded-none"
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Przetwarzanie...</span>
            ) : (
              "Wyślij wywiad treningowy"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}