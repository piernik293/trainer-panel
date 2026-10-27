import { useEffect } from "react";
import { humanizeError, VALIDATION_MESSAGE } from "@/lib/userError";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreateExercise,
  useUpdateExercise,
  useGetExercise,
  getListExercisesQueryKey,
  getGetExerciseQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscriptionSummary } from "@/lib/use-subscription-summary";
import {
  MAIN_MUSCLE_GROUPS,
  EQUIPMENT_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  DIFFICULTY_LEVEL_OPTIONS,
  MOVEMENT_PATTERN_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  MOVEMENT_CATEGORY_OPTIONS,
  PLANE_OF_MOTION_OPTIONS,
  EXECUTION_OPTIONS,
  EXECUTION_LABELS,
  RESISTANCE_TYPE_OPTIONS,
  CAN_PERFORM_TO_FAILURE_OPTIONS,
  JOINT_STRESS_OPTIONS,
  EXERCISE_PRIORITY_OPTIONS,
  TRAINING_GOAL_OPTIONS,
  SUITABLE_EXPERIENCE_LEVEL_OPTIONS,
  RATING_OPTIONS,
  LOCATION_DISPLAY_LABELS,
  MOVEMENT_COMPLEXITY_OPTIONS,
} from "@/lib/exercise-constants";

// ─── Schema ───────────────────────────────────────────────────────────────────

const exerciseSchema = z.object({
  // Section 1
  name: z.string().min(1, "Nazwa ćwiczenia jest wymagana"),
  mainMuscleGroup: z.string().min(1, "Główna partia mięśniowa jest wymagana"),
  secondaryMuscleGroups: z.array(z.string()).default([]),
  difficultyLevel: z.string().optional(),
  movementPattern: z.string().optional(),
  exerciseType: z.string().optional(),
  equipment: z.array(z.string()).default([]),
  equipmentOther: z.string().optional(),
  trainingLocation: z.array(z.string()).default([]),
  // Section 2
  description: z.string().optional(),
  executionInstructions: z.string().optional(),
  commonMistakes: z.string().optional(),
  coachingTips: z.string().optional(),
  breathingTips: z.string().optional(),
  safetyNotes: z.string().optional(),
  tempo: z.string().optional(),
  rangeOfMotion: z.string().optional(),
  videoUrl: z.string().optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
  // Section 4 — AI Exercise Intelligence
  suitableExperienceLevels: z.array(z.string()).default([]),
  trainingGoals: z.array(z.string()).default([]),
  movementCategory: z.string().optional(),
  planeOfMotion: z.string().optional(),
  execution: z.string().optional(),
  resistanceType: z.string().optional(),
  requiresSpotter: z.boolean().optional(),
  canBePerformedToFailure: z.string().optional(),
  jointStress: z.string().optional(),
  learningDifficulty: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  neurologicalFatigue: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  domsPotential: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  exercisePriority: z.string().optional(),
  // Phase A — Adaptation support
  movementComplexity: z.string().optional(),
  suitableForNoActivity: z.boolean().optional(),
});

type ExerciseFormValues = z.infer<typeof exerciseSchema>;

const emptyDefaults: ExerciseFormValues = {
  name: "",
  mainMuscleGroup: "",
  secondaryMuscleGroups: [],
  difficultyLevel: "",
  movementPattern: "",
  exerciseType: "",
  equipment: [],
  equipmentOther: "",
  trainingLocation: [],
  description: "",
  executionInstructions: "",
  commonMistakes: "",
  coachingTips: "",
  breathingTips: "",
  safetyNotes: "",
  tempo: "",
  rangeOfMotion: "",
  videoUrl: "",
  imageUrl: "",
  suitableExperienceLevels: [],
  trainingGoals: [],
  movementCategory: "",
  planeOfMotion: "",
  execution: "",
  resistanceType: "",
  requiresSpotter: undefined,
  canBePerformedToFailure: "",
  jointStress: "",
  learningDifficulty: "",
  neurologicalFatigue: "",
  domsPotential: "",
  exercisePriority: "",
  movementComplexity: "",
  suitableForNoActivity: false,
};

// ─── Reusable sub-components ─────────────────────────────────────────────────

function ToggleGroupField({
  label,
  options,
  value,
  onChange,
  hint,
  labelMap,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  /** Optional map from stored value → display label. Falls back to the stored value. */
  labelMap?: Record<string, string>;
}) {
  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-3 pt-1">
        {options.map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 text-sm border border-border/50 rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <Checkbox checked={value.includes(option)} onCheckedChange={() => toggle(option)} />
            {labelMap?.[option] ?? option}
          </label>
        ))}
      </div>
    </FormItem>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder,
  labels,
}: {
  label: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Optional map from canonical option value → display label shown to the user. */
  labels?: Record<string, string>;
}) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <Select value={value ?? ""} onValueChange={onChange}>
        <FormControl>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder={placeholder ?? "Wybierz..."} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  );
}

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <FormItem>
      <FormLabel>{label} <span className="text-muted-foreground font-normal">(1–5)</span></FormLabel>
      <div className="flex gap-2 pt-1">
        {RATING_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(value) === String(n) ? "" : String(n))}
            className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
              String(value) === String(n)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/50 text-muted-foreground hover:bg-muted/30"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <FormMessage />
    </FormItem>
  );
}

// ─── Form body ────────────────────────────────────────────────────────────────

function ExerciseFormBody({
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
  submitLabel,
}: {
  defaultValues: ExerciseFormValues;
  onSubmit: (data: ExerciseFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseSchema),
    defaultValues,
  });

  const equipment = form.watch("equipment");
  const showEquipmentOther = equipment.includes("Inny");

  const { toast: validationToast } = useToast();
  const onInvalidSubmit = () => {
    // react-hook-form focuses the first invalid field automatically.
    validationToast({ title: VALIDATION_MESSAGE, variant: "destructive" });
  };

  const handleSubmit = (data: ExerciseFormValues) => {
    const cleaned: ExerciseFormValues = data.equipment.includes("Inny")
      ? data
      : { ...data, equipmentOther: "" };
    onSubmit(cleaned);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, onInvalidSubmit)} className="space-y-6">

        {/* ── Section 1: Basic Information ── */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle className="text-base">1. Podstawowe informacje</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Nazwa ćwiczenia *</FormLabel>
                    <FormControl>
                      <Input placeholder="np. Wyciskanie sztangi leżąc" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mainMuscleGroup"
                render={({ field }) => (
                  <SelectField
                    label="Główna partia mięśniowa *"
                    options={MAIN_MUSCLE_GROUPS}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Wybierz partię"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="difficultyLevel"
                render={({ field }) => (
                  <SelectField
                    label="Poziom trudności"
                    options={DIFFICULTY_LEVEL_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Wybierz poziom"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="movementPattern"
                render={({ field }) => (
                  <SelectField
                    label="Wzorzec ruchowy"
                    options={MOVEMENT_PATTERN_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Wybierz wzorzec"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="exerciseType"
                render={({ field }) => (
                  <SelectField
                    label="Typ ćwiczenia"
                    options={EXERCISE_TYPE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Wybierz typ"
                  />
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="secondaryMuscleGroups"
              render={({ field }) => (
                <ToggleGroupField
                  label="Drugoplanowe partie mięśniowe"
                  hint="Można wybrać kilka."
                  options={MAIN_MUSCLE_GROUPS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <ToggleGroupField
                  label="Wymagany sprzęt"
                  hint="Można wybrać kilka."
                  options={EQUIPMENT_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            {showEquipmentOther && (
              <FormField
                control={form.control}
                name="equipmentOther"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opisz sprzęt</FormLabel>
                    <FormControl>
                      <Input placeholder="np. ławka skośna, obciążniki na kostkę" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="trainingLocation"
              render={({ field }) => (
                <ToggleGroupField
                  label="Miejsce treningu"
                  hint="Można wybrać kilka."
                  options={TRAINING_LOCATION_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  labelMap={LOCATION_DISPLAY_LABELS}
                />
              )}
            />
          </CardContent>
        </Card>

        {/* ── Section 2: Coaching Information ── */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle className="text-base">2. Informacje trenerskie</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opis ćwiczenia</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Krótki opis ćwiczenia i jego celu" className="min-h-[90px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="executionInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instrukcje wykonania</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Krok po kroku, jak prawidłowo wykonać ćwiczenie" className="min-h-[110px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commonMistakes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Częste błędy</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Najczęstsze błędy techniczne popełniane przez klientów" className="min-h-[90px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="coachingTips"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wskazówki trenerskie</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Praktyczne podpowiedzi ułatwiające naukę i korektę techniki" className="min-h-[90px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="breathingTips"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wskazówki oddechowe</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Jak prawidłowo oddychać podczas ćwiczenia" className="min-h-[80px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="safetyNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Uwagi dotyczące bezpieczeństwa</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Przeciwwskazania, ryzyka i środki ostrożności" className="min-h-[80px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="tempo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo <span className="text-muted-foreground font-normal">(opcjonalne)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="np. 3-1-2-0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rangeOfMotion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zalecany zakres ruchu</FormLabel>
                    <FormControl>
                      <Input placeholder="np. pełny zakres, ¾ zakresu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="videoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link do wideo</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link do zdjęcia</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 4: AI Exercise Intelligence ── */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle className="text-base">3. Inteligencja ćwiczenia</CardTitle>
            <CardDescription>Dane używane przez aplikację i przyszłe AI. Nie są wyświetlane klientowi.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <FormField
              control={form.control}
              name="suitableExperienceLevels"
              render={({ field }) => (
                <ToggleGroupField
                  label="Odpowiedni poziom doświadczenia"
                  hint="Można wybrać kilka."
                  options={SUITABLE_EXPERIENCE_LEVEL_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            <FormField
              control={form.control}
              name="trainingGoals"
              render={({ field }) => (
                <ToggleGroupField
                  label="Cel treningowy"
                  hint="Można wybrać kilka."
                  options={TRAINING_GOAL_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="movementCategory"
                render={({ field }) => (
                  <SelectField
                    label="Kategoria ruchu"
                    options={MOVEMENT_CATEGORY_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="planeOfMotion"
                render={({ field }) => (
                  <SelectField
                    label="Płaszczyzna ruchu"
                    options={PLANE_OF_MOTION_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="execution"
                render={({ field }) => (
                  <SelectField
                    label="Wykonanie"
                    options={EXECUTION_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    labels={EXECUTION_LABELS}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="resistanceType"
                render={({ field }) => (
                  <SelectField
                    label="Typ oporu"
                    options={RESISTANCE_TYPE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="canBePerformedToFailure"
                render={({ field }) => (
                  <SelectField
                    label="Możliwość wykonania do upadku"
                    options={CAN_PERFORM_TO_FAILURE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="jointStress"
                render={({ field }) => (
                  <SelectField
                    label="Obciążenie stawów"
                    options={JOINT_STRESS_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="exercisePriority"
                render={({ field }) => (
                  <SelectField
                    label="Priorytet ćwiczenia"
                    options={EXERCISE_PRIORITY_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="movementComplexity"
                render={({ field }) => (
                  <SelectField
                    label="Złożoność ruchu"
                    options={MOVEMENT_COMPLEXITY_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Wybierz złożoność"
                  />
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="requiresSpotter"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                      aria-label="Wymaga asekuracji (spotter)"
                    />
                    <FormLabel className="cursor-pointer font-normal">
                      Wymaga asekuracji (spotter)
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="suitableForNoActivity"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                      aria-label="Odpowiednie dla segmentu Start adaptacyjny (brak aktywności fizycznej)"
                    />
                    <FormLabel className="cursor-pointer font-normal">
                      Odpowiednie dla segmentu „Start adaptacyjny" (brak aktywności fizycznej)
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="learningDifficulty"
                render={({ field }) => (
                  <RatingField
                    label="Trudność nauki"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="neurologicalFatigue"
                render={({ field }) => (
                  <RatingField
                    label="Zmęczenie neurologiczne"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="domsPotential"
                render={({ field }) => (
                  <RatingField
                    label="Potencjał DOMS"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Submit ── */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Anuluj
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Zapisywanie..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── Helper: map nullable API values to form defaults ─────────────────────────

function toStr(v: string | null | undefined): string {
  return v ?? "";
}

function toNum(v: number | null | undefined): number | "" {
  return v ?? "";
}

// ─── ExerciseNew ──────────────────────────────────────────────────────────────

export function ExerciseNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createExercise = useCreateExercise();
  const { data: subscription } = useSubscriptionSummary();
  const customExerciseLimitReached =
    subscription?.usage.customExercises.atLimit ?? false;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <Link href="/exercises" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft size={16} />
        Powrót do biblioteki
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Nowe Ćwiczenie
        </h1>
        <p className="text-muted-foreground mt-1">
          Dodaj ćwiczenie do biblioteki, aby móc je później wykorzystać w planach treningowych
        </p>
      </div>

      {customExerciseLimitReached && (
        <Alert>
          <AlertDescription>
            Wykorzystano {subscription?.usage.customExercises.used}/
            {subscription?.usage.customExercises.limit} własnych ćwiczeń w planie{" "}
            {subscription?.plan.name}. Usuń nieużywane ćwiczenie albo wybierz wyższy plan.
          </AlertDescription>
        </Alert>
      )}

      {createExercise.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {humanizeError(
              createExercise.error,
              "Nie udało się zapisać ćwiczenia. Spróbuj ponownie.",
            )}
          </AlertDescription>
        </Alert>
      )}

      <ExerciseFormBody
        defaultValues={emptyDefaults}
        isPending={createExercise.isPending}
        submitLabel="Zapisz Ćwiczenie"
        onCancel={() => setLocation("/exercises")}
        onSubmit={(data) => {
          createExercise.mutate({ data: {
            ...data,
            learningDifficulty: data.learningDifficulty ? Number(data.learningDifficulty) : undefined,
            neurologicalFatigue: data.neurologicalFatigue ? Number(data.neurologicalFatigue) : undefined,
            domsPotential: data.domsPotential ? Number(data.domsPotential) : undefined,
          } }, {
            onSuccess: (created) => {
              queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
              setLocation(`/exercises/${created.id}`);
            },
          });
        }}
      />
    </div>
  );
}

// ─── ExerciseEdit ─────────────────────────────────────────────────────────────

export function ExerciseEdit() {
  const { id } = useParams<{ id: string }>();
  const exerciseId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: exercise, isLoading } = useGetExercise(exerciseId);
  const updateExercise = useUpdateExercise();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Ładowanie danych...</div>;
  }

  if (!exercise) {
    return <div className="p-8 text-center text-muted-foreground">Ćwiczenie nie znalezione.</div>;
  }

  const defaultValues: ExerciseFormValues = {
    name: exercise.name,
    mainMuscleGroup: exercise.mainMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups,
    difficultyLevel: toStr(exercise.difficultyLevel),
    movementPattern: toStr(exercise.movementPattern),
    exerciseType: toStr(exercise.exerciseType),
    equipment: exercise.equipment,
    equipmentOther: toStr(exercise.equipmentOther),
    trainingLocation: exercise.trainingLocation,
    description: toStr(exercise.description),
    executionInstructions: toStr(exercise.executionInstructions),
    commonMistakes: toStr(exercise.commonMistakes),
    coachingTips: toStr(exercise.coachingTips),
    breathingTips: toStr(exercise.breathingTips),
    safetyNotes: toStr(exercise.safetyNotes),
    tempo: toStr(exercise.tempo),
    rangeOfMotion: toStr(exercise.rangeOfMotion),
    videoUrl: toStr(exercise.videoUrl),
    imageUrl: toStr(exercise.imageUrl),
    suitableExperienceLevels: exercise.suitableExperienceLevels ?? [],
    trainingGoals: exercise.trainingGoals ?? [],
    movementCategory: toStr(exercise.movementCategory),
    planeOfMotion: toStr(exercise.planeOfMotion),
    execution: toStr(exercise.execution),
    resistanceType: toStr(exercise.resistanceType),
    requiresSpotter: exercise.requiresSpotter ?? undefined,
    canBePerformedToFailure: toStr(exercise.canBePerformedToFailure),
    jointStress: toStr(exercise.jointStress),
    learningDifficulty: toNum(exercise.learningDifficulty),
    neurologicalFatigue: toNum(exercise.neurologicalFatigue),
    domsPotential: toNum(exercise.domsPotential),
    exercisePriority: toStr(exercise.exercisePriority),
    movementComplexity: toStr(exercise.movementComplexity),
    suitableForNoActivity: exercise.suitableForNoActivity ?? false,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <Link href={`/exercises/${exerciseId}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft size={16} />
        Powrót do ćwiczenia
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Edytuj Ćwiczenie
        </h1>
        <p className="text-muted-foreground mt-1">{exercise.name}</p>
      </div>

      <ExerciseFormBody
        key={exercise.id}
        defaultValues={defaultValues}
        isPending={updateExercise.isPending}
        submitLabel="Zapisz Zmiany"
        onCancel={() => setLocation(`/exercises/${exerciseId}`)}
        onSubmit={(data) => {
          updateExercise.mutate({ id: exerciseId, data: {
            ...data,
            learningDifficulty: data.learningDifficulty ? Number(data.learningDifficulty) : undefined,
            neurologicalFatigue: data.neurologicalFatigue ? Number(data.neurologicalFatigue) : undefined,
            domsPotential: data.domsPotential ? Number(data.domsPotential) : undefined,
          } }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetExerciseQueryKey(exerciseId) });
              setLocation(`/exercises/${exerciseId}`);
            },
          });
        }}
      />
    </div>
  );
}
