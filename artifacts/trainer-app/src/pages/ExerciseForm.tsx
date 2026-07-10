import { useEffect } from "react";
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
import {
  MAIN_MUSCLE_GROUPS,
  EQUIPMENT_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  DIFFICULTY_LEVEL_OPTIONS,
  MOVEMENT_PATTERN_OPTIONS,
} from "@/lib/exercise-constants";

const exerciseSchema = z.object({
  name: z.string().min(1, "Nazwa ćwiczenia jest wymagana"),
  mainMuscleGroup: z.string().min(1, "Główna partia mięśniowa jest wymagana"),
  secondaryMuscleGroups: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  equipmentOther: z.string().optional(),
  trainingLocation: z.array(z.string()).default([]),
  difficultyLevel: z.string().optional(),
  movementPattern: z.string().optional(),
  description: z.string().optional(),
  executionInstructions: z.string().optional(),
  commonMistakes: z.string().optional(),
  coachingTips: z.string().optional(),
  videoUrl: z.string().optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
});

type ExerciseFormValues = z.infer<typeof exerciseSchema>;

const emptyDefaults: ExerciseFormValues = {
  name: "",
  mainMuscleGroup: "",
  secondaryMuscleGroups: [],
  equipment: [],
  equipmentOther: "",
  trainingLocation: [],
  difficultyLevel: "",
  movementPattern: "",
  description: "",
  executionInstructions: "",
  commonMistakes: "",
  coachingTips: "",
  videoUrl: "",
  imageUrl: "",
};

function ToggleGroupField({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
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
            {option}
          </label>
        ))}
      </div>
    </FormItem>
  );
}

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

  const handleSubmit = (data: ExerciseFormValues) => {
    // Keep data semantics consistent: if "Inny" is no longer selected, the
    // free-text description shouldn't be persisted even if a value lingers
    // in the (now hidden) field.
    const cleaned: ExerciseFormValues = data.equipment.includes("Inny")
      ? data
      : { ...data, equipmentOther: "" };
    onSubmit(cleaned);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
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
              <FormItem>
                <FormLabel>Główna partia mięśniowa *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Wybierz partię" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MAIN_MUSCLE_GROUPS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="difficultyLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Poziom trudności</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Wybierz poziom" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DIFFICULTY_LEVEL_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="movementPattern"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wzorzec ruchowy</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Wybierz wzorzec" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MOVEMENT_PATTERN_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
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
            />
          )}
        />

        <div className="grid grid-cols-1 gap-6">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Opis ćwiczenia</FormLabel>
                <FormControl>
                  <Textarea placeholder="Krótki opis ćwiczenia i jego celu" className="min-h-[100px] resize-y" {...field} />
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
                  <Textarea placeholder="Krok po kroku, jak prawidłowo wykonać ćwiczenie" className="min-h-[120px] resize-y" {...field} />
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
                  <Textarea placeholder="Najczęstsze błędy techniczne popełniane przez klientów" className="min-h-[100px] resize-y" {...field} />
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
                  <Textarea placeholder="Praktyczne podpowiedzi ułatwiające naukę i korektę techniki" className="min-h-[100px] resize-y" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
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

export function ExerciseNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createExercise = useCreateExercise();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
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

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Szczegóły ćwiczenia</CardTitle>
          <CardDescription>Uzupełnij informacje, które pomogą w przyszłości układać plany treningowe.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ExerciseFormBody
            defaultValues={emptyDefaults}
            isPending={createExercise.isPending}
            submitLabel="Zapisz Ćwiczenie"
            onCancel={() => setLocation("/exercises")}
            onSubmit={(data) => {
              createExercise.mutate({ data }, {
                onSuccess: (created) => {
                  queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
                  setLocation(`/exercises/${created.id}`);
                },
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

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
    equipment: exercise.equipment,
    equipmentOther: exercise.equipmentOther ?? "",
    trainingLocation: exercise.trainingLocation,
    difficultyLevel: exercise.difficultyLevel ?? "",
    movementPattern: exercise.movementPattern ?? "",
    description: exercise.description ?? "",
    executionInstructions: exercise.executionInstructions ?? "",
    commonMistakes: exercise.commonMistakes ?? "",
    coachingTips: exercise.coachingTips ?? "",
    videoUrl: exercise.videoUrl ?? "",
    imageUrl: exercise.imageUrl ?? "",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
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

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Szczegóły ćwiczenia</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ExerciseFormBody
            key={exercise.id}
            defaultValues={defaultValues}
            isPending={updateExercise.isPending}
            submitLabel="Zapisz Zmiany"
            onCancel={() => setLocation(`/exercises/${exerciseId}`)}
            onSubmit={(data) => {
              updateExercise.mutate({ id: exerciseId, data }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetExerciseQueryKey(exerciseId) });
                  setLocation(`/exercises/${exerciseId}`);
                },
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
