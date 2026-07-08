import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useSubmitPublicSurvey } from "@workspace/api-client-react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  firstName: z.string().min(1, "Imię jest wymagane"),
  lastName: z.string().min(1, "Nazwisko jest wymagane"),
  email: z.string().email("Nieprawidłowy adres e-mail").optional().or(z.literal("")),
  phone: z.string().optional(),
  trainingGoal: z.string().optional(),
  experienceLevel: z.string().optional(),
  trainingDuration: z.string().optional(),
  healthLimitations: z.string().optional(),
  weeklyFrequency: z.coerce.number().min(1).max(7).optional(),
  sessionDuration: z.string().optional(),
  preferredMuscles: z.string().optional(),
  avoidedMuscles: z.string().optional(),
  avoidedExercises: z.string().optional(),
  favoriteExercises: z.string().optional(),
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
      advancedMethodsToAvoid: [],
      additionalInfo: "",
    },
  });

  const mutation = useSubmitPublicSurvey();

  const onSubmit = (data: FormValues) => {
    mutation.mutate(
      { data },
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
        
        <Section title="Dane kontaktowe">
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
          </div>
        </Section>

        <Section title="Profil treningowy">
          <FormField control={form.control} name="trainingGoal" render={({field}) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-muted-foreground">Cel treningowy</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa sprawności", "Inny"].map(goal => (
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
                <FormControl>
                  <Textarea {...field} className="bg-background/50 border-white/10 focus-visible:border-primary min-h-[100px] p-4 rounded-none resize-y" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="avoidedMuscles" render={({field}) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Czy są partie mięśniowe, których nie chcesz rozwijać?</FormLabel>
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

        <Section title="Informacje dodatkowe">
          <FormField control={form.control} name="advancedMethodsToAvoid" render={() => (
            <FormItem className="mb-12">
              <div className="mb-6">
                <FormLabel className="text-muted-foreground text-base">Czy masz przeciwwskazania do wykonywania:</FormLabel>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {["superserie", "serie złożone (compound set)", "drop sety", "serie do upadku mięśniowego", "serie wymuszone", "rest-pause"].map(method => (
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