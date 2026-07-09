import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useSubmitPublicSurvey } from "@workspace/api-client-react";
import { CheckCircle2, Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const MUSCLE_GROUPS = ["klatka piersiowa", "plecy", "barki", "biceps", "triceps", "brzuch", "uda", "łydki"];
const ADVANCED_METHODS = ["superserie", "serie złożone (compound set)", "drop sety", "serie do upadku mięśniowego", "serie wymuszone", "rest-pause"];

function calculateBmi(heightCm: number | undefined, weightKg: number | undefined): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const heightM = heightCm / 100;
  if (heightM <= 0) return undefined;
  return weightKg / (heightM * heightM);
}

const BMI_RECOMMENDATION_TEXT =
  "Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj, że BMI nie rozróżnia masy mięśniowej i tkanki tłuszczowej. W takim przypadku często warto rozważyć redukcję tkanki tłuszczowej lub rekompozycję sylwetki.";

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

const formSchema = z.object({
  firstName: z.string().min(1, "Imię jest wymagane"),
  lastName: z.string().min(1, "Nazwisko jest wymagane"),
  email: z.string().email("Nieprawidłowy adres e-mail").optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z
    .string()
    .min(1, "Data urodzenia jest wymagana")
    .refine((val) => new Date(val) <= new Date(), "Data urodzenia nie może być w przyszłości"),
  gender: z.enum(["Mężczyzna", "Kobieta"], { required_error: "Płeć jest wymagana" }),
  heightCm: z.coerce.number().min(50, "Wzrost jest wymagany").max(260),
  weightKg: z.coerce.number().min(20, "Waga jest wymagana").max(400),
  trainingGoal: z.string().optional(),
  experienceLevel: z.string().min(1, "Poziom doświadczenia jest wymagany"),
  trainingDuration: z.string().optional(),
  healthLimitations: z.string().optional(),
  weeklyFrequency: z.coerce.number().min(1).max(7).optional(),
  sessionDuration: z.string().optional(),
  preferredMuscles: z.string().optional(),
  avoidedMuscles: z.string().optional(),
  avoidedExercises: z.string().optional(),
  favoriteExercises: z.string().optional(),
  activityLevel: z.string().min(1, "Poziom aktywności jest wymagany"),
  sleepHours: z.string().min(1, "To pole jest wymagane"),
  stressLevel: z.coerce.number().min(1).max(10).default(5),
  planStylePreference: z.string().min(1, "Wybierz styl planu"),
  avoidsAdvancedMethods: z.enum(["Tak", "Nie"]).optional(),
  advancedMethodsToAvoid: z.array(z.string()).optional().default([]),
  additionalInfo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="space-y-8 mb-16 relative">
    <div className="flex items-center gap-4 mb-8">
      <div className="h-[1px] flex-1 bg-white/5"></div>
      <h3 className="text-sm font-semibold text-primary tracking-widest uppercase">{title}</h3>
      <div className="h-[1px] flex-1 bg-white/5"></div>
    </div>
    {children}
  </div>
);

export default function SurveyForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  
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
      healthLimitations: "",
      weeklyFrequency: undefined,
      sessionDuration: "",
      preferredMuscles: "",
      avoidedMuscles: "",
      avoidedExercises: "",
      favoriteExercises: "",
      activityLevel: "",
      sleepHours: "",
      stressLevel: 5,
      planStylePreference: "",
      avoidsAdvancedMethods: undefined,
      advancedMethodsToAvoid: [],
      additionalInfo: "",
    },
  });

  const experienceLevel = form.watch("experienceLevel");
  const avoidsAdvancedMethods = form.watch("avoidsAdvancedMethods");
  const dateOfBirth = form.watch("dateOfBirth");
  const gender = form.watch("gender");
  const genderMuscleSuggestion =
    gender === "Kobieta"
      ? "Podpowiedź: Często wybierane cele sylwetkowe: pośladki, uda, brzuch, barki."
      : gender === "Mężczyzna"
      ? "Podpowiedź: Często wybierane cele sylwetkowe: klatka piersiowa, barki, plecy, ramiona."
      : undefined;
  const isBeginner = experienceLevel === "Początkujący";
  const isIntermediateOrAdvanced = experienceLevel === "Średniozaawansowany" || experienceLevel === "Zaawansowany";
  const calculatedAge = calculateAge(dateOfBirth);
  const heightCm = form.watch("heightCm");
  const weightKg = form.watch("weightKg");
  const bmi = calculateBmi(heightCm, weightKg);
  const showBmiRecommendation = isBeginner && bmi !== undefined && bmi >= 25;

  const mutation = useSubmitPublicSurvey();

  const onSubmit = (data: FormValues) => {
    const { avoidsAdvancedMethods, advancedMethodsToAvoid, ...rest } = data;
    const avoidsAdvancedMethodsBool =
      avoidsAdvancedMethods === "Tak" ? true : avoidsAdvancedMethods === "Nie" ? false : undefined;
    const payload = {
      ...rest,
      age: calculateAge(rest.dateOfBirth) ?? undefined,
      avoidsAdvancedMethods: avoidsAdvancedMethodsBool,
      advancedMethodsToAvoid: avoidsAdvancedMethodsBool === true ? advancedMethodsToAvoid : [],
    };
    mutation.mutate(
      { data: payload as Parameters<typeof mutation.mutate>[0]["data"] },
      {
        onSuccess: (res) => {
          setSuccessMessage(res.message || "Dziękuję za wypełnienie ankiety. Przeanalizuję Twoje odpowiedzi i przygotuję indywidualny plan treningowy.");
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <Section title="Dane podstawowe">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="firstName" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Imię *</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="lastName" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Nazwisko *</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">E-mail</FormLabel>
                <FormControl>
                  <Input {...field} type="email" className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
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
            <FormField control={form.control} name="dateOfBirth" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Data urodzenia *</FormLabel>
                <FormControl>
                  <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                {calculatedAge !== undefined && (
                  <p className="text-xs text-muted-foreground">Wiek: {calculatedAge} lat</p>
                )}
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="gender" render={({field}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Płeć *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-3">
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
            <FormField control={form.control} name="heightCm" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Wzrost (cm) *</FormLabel>
                <FormControl>
                  <Input type="number" min={50} max={260} {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="weightKg" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Waga (kg) *</FormLabel>
                <FormControl>
                  <Input type="number" min={20} max={400} {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary h-12 px-4 text-base rounded-none" />
                </FormControl>
                {bmi !== undefined && (
                  <p className="text-xs text-muted-foreground/70">BMI: {bmi.toFixed(1)}</p>
                )}
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Section>

        <Section title="Profil treningowy">
          <FormField control={form.control} name="trainingGoal" render={({field}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Cel treningowy</FormLabel>
              {showBmiRecommendation && (
                <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                  {BMI_RECOMMENDATION_TEXT}
                </p>
              )}
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa sprawności", "Poprawa kondycji", "Inny"].map(goal => (
                    <FormItem key={goal} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={goal} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-5 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {goal}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )} />

          <FormField control={form.control} name="experienceLevel" render={({field}) => (
            <FormItem className="space-y-4 mt-12">
              <FormLabel className="text-muted-foreground">Doświadczenie treningowe</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {["Początkujący", "Średniozaawansowany", "Zaawansowany"].map(level => (
                    <FormItem key={level} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={level} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-5 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {level}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <FormField control={form.control} name="trainingDuration" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Jak długo trenujesz?</FormLabel>
                <FormControl>
                  <Input placeholder="np. 2 lata" {...field} className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="healthLimitations" render={({field}) => (
              <FormItem className="md:col-span-2">
                <FormLabel className="text-muted-foreground">Czy masz kontuzje, urazy lub ograniczenia ruchowe?</FormLabel>
                <FormControl>
                  <Textarea placeholder="Brak / Opisz krótko" {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[80px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
          </div>
        </Section>

        <Section title="Organizacja i Preferencje">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <FormField control={form.control} name="weeklyFrequency" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Ile razy w tygodniu chcesz trenować?</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min={1} 
                    max={7} 
                    {...field} 
                    value={field.value || ''} 
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} 
                    className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none" 
                  />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="sessionDuration" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Ile czasu możesz przeznaczyć na jeden trening?</FormLabel>
                <FormControl>
                  <Input placeholder="np. 60 min" {...field} className="bg-background/50 border-white/10 focus-visible:border-primary h-12 px-4 rounded-none" />
                </FormControl>
              </FormItem>
            )} />
          </div>

          <div className="grid grid-cols-1 gap-8">
            <FormField control={form.control} name="preferredMuscles" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Czy są partie mięśniowe, na których szczególnie Ci zależy?</FormLabel>
                <FormDescription className="text-xs text-muted-foreground/70">
                  Np. {MUSCLE_GROUPS.join(", ")}.
                </FormDescription>
                {genderMuscleSuggestion && (
                  <p className="text-xs text-primary/80 bg-primary/5 border border-primary/10 px-3 py-2">
                    {genderMuscleSuggestion}
                  </p>
                )}
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="avoidedMuscles" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Czy są partie mięśniowe, których nie chcesz rozwijać? Jeżeli tak opisz dlaczego.</FormLabel>
                <FormDescription className="text-xs text-muted-foreground/70">
                  Np. {MUSCLE_GROUPS.join(", ")}.
                </FormDescription>
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="avoidedExercises" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Czy są ćwiczenia, których nie chcesz wykonywać?</FormLabel>
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="favoriteExercises" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Jakie są Twoje ulubione ćwiczenia?</FormLabel>
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
          </div>
        </Section>

        <Section title="Aktywność i regeneracja">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <FormField control={form.control} name="activityLevel" render={({field}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Poziom aktywności fizycznej w ciągu dnia *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 gap-3">
                    {["Siedzący", "Lekko aktywny", "Praca fizyczna", "Bardzo aktywny"].map(level => (
                      <FormItem key={level} className="flex items-center space-x-0 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={level} className="peer sr-only" />
                        </FormControl>
                        <FormLabel className="w-full flex items-center px-6 py-4 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all font-medium">
                          {level}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="sleepHours" render={({field}) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-muted-foreground">Ile godzin średnio sypiasz w ciągu doby? *</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 gap-3">
                    {["poniżej 6h", "6-7h", "7-8h", "powyżej 8h"].map(hours => (
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
              <FormLabel className="text-muted-foreground">Poziom odczuwanego stresu (1 = niski, 10 = bardzo wysoki)</FormLabel>
              <FormControl>
                <div className="flex items-center gap-6 pt-2">
                  <Slider min={1} max={10} step={1} value={[field.value ?? 5]} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
                  <span className="text-primary font-semibold text-lg w-8 text-center">{field.value ?? 5}</span>
                </div>
              </FormControl>
            </FormItem>
          )} />
        </Section>

        <Section title="Styl planu treningowego">
          <FormField control={form.control} name="planStylePreference" render={({field}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Jaki styl planu Ci odpowiada? *</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {["Maksymalnie efektywny", "Kompromis", "Prosty i trwały"].map(style => (
                    <FormItem key={style} className="flex items-center space-x-0 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={style} className="peer sr-only" />
                      </FormControl>
                      <FormLabel className="w-full flex items-center justify-center px-6 py-5 border border-white/10 bg-card rounded-none cursor-pointer hover:bg-white/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary transition-all text-center font-medium">
                        {style}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </Section>

        <AnimatePresence>
          {isIntermediateOrAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <Section title="Metody intensyfikacji">
                <FormField control={form.control} name="avoidsAdvancedMethods" render={({field}) => (
                  <FormItem className="space-y-4 mb-8">
                    <FormLabel className="text-muted-foreground">Czy masz jakieś metody treningowe, których nie chcesz stosować lub które są dla Ciebie przeciwwskazane?</FormLabel>
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
              </Section>
            </motion.div>
          )}
        </AnimatePresence>

        <Section title="Informacje dodatkowe">
          {isBeginner && (
            <p className="text-sm text-muted-foreground/70 mb-8 -mt-4">
              Jako początkujący/a nie musisz znać zaawansowanych technik treningowych — trener dobierze je za Ciebie.
            </p>
          )}
          <FormField control={form.control} name="additionalInfo" render={({field}) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Czy chcesz dodać coś jeszcze? Styl życia, dieta, inne uwagi.</FormLabel>
              <FormControl>
                <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[120px] p-4 rounded-none resize-y" />
              </FormControl>
            </FormItem>
          )} />
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
              "Wyślij ankietę"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}