/**
 * Wywiad 2.0 — the interview as steps: one question (or a small group of closely
 * related fields) per screen, progress bar, autosave. The questions, options,
 * validation and rules are unchanged; see lib/surveyWizard.ts and
 * docs/WYWIAD-INWENTARZ.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { SECTION_TEXT, HINT_TEXT, LOCATION_DESC, PLAN_STYLE_DESC } from "@/lib/surveyHelpTexts";
import {
  ADVANCED_METHODS,
  ACTIVITY_LEVEL_OPTIONS,
  CARDIO_AVOID_REASSURANCE_TEXT,
  CARDIO_FREQUENCY_HELPER_TEXT,
  birthDateBounds,
  birthDateError,
  heightError,
  BIRTH_INVALID_MESSAGE,
  BIRTH_REQUIRED_MESSAGE,
  weightError,
  toggleEquipment,
  NO_EQUIPMENT,
  SURVEY_LIMITS,
  CARDIO_FREQUENCY_OPTIONS,
  CARDIO_PREFERENCE_OPTIONS,
  CARDIO_RECOMMENDATION_TEXT,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  MUSCLE_GROUPS,
  PLAN_STYLE_OPTIONS,
  PREFERRED_CARDIO_TYPE_OPTIONS,
  SESSION_DURATION_OPTIONS,
  SLEEP_HOURS_OPTIONS,
  SPORT_PERFORMANCE_NEEDS,
  TRAINING_FREQUENCY_RECOMMENDATIONS,
  TRAINING_GOAL_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  ATHLETE_STATUS_OPTIONS,
  buildEquipmentString,
  calculateAge,
  getLocalDateString,
  isBeginnerLevel,
  isCardioRelevant,
} from "@workspace/survey-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { AvoidedExercisesPicker } from "./AvoidedExercisesPicker";
import { FavoriteExercisesPicker } from "./FavoriteExercisesPicker";
import { MuscleGroupCombobox } from "./MuscleGroupCombobox";
import { humanizeError } from "@/lib/userError";
import { cn } from "@/lib/utils";
import {
  EMPTY_ANSWERS,
  STAGES,
  buildSurveyPayload,
  clearDraft,
  isStepVisible,
  loadDraft,
  normalizeAnswers,
  remainingMinutes,
  saveDraft,
  validateStep,
  missingHint,
  parseWeight,
  visibleSteps,
  visibleStages,
  type Answers,
  type Prefill,
  type StepId,
} from "@/lib/surveyWizard";

const AUTO_ADVANCE_MS = 300;

interface Choice {
  value: string;
  label: string;
  /** One-line description. */
  desc?: string;
  /** Full description behind the "Więcej" toggle. */
  more?: string;
}

// ─── Small building blocks ───────────────────────────────────────────────────

function ChoiceList({
  name, options, value, onChange, columns = 1,
}: { name: string; options: Choice[]; value: string; onChange: (v: string) => void; columns?: 1 | 2 }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [open, setOpen] = useState<string[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-3", columns === 2 && "grid-cols-2")}>
      {options.map((o, i) => (
        <div
          key={o.value}
          className={cn(
            "relative flex flex-wrap items-start rounded-lg border bg-card transition-colors focus-within:ring-2 focus-within:ring-ring",
            value === o.value ? "border-primary bg-brand-soft" : "border-input hover:bg-muted",
          )}
        >
          <label className={cn("flex min-w-0 flex-1 cursor-pointer flex-col justify-center px-4", o.more ? "min-h-14 py-2.5" : "min-h-14 py-3")}>
            <input
              ref={(el) => { refs.current[i] = el; }}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              tabIndex={value === o.value || (!value && i === 0) ? 0 : -1}
              onChange={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className="sr-only"
            />
            <span className={cn("font-semibold", o.more && "pr-14", value === o.value && "text-primary")}>{o.label}</span>
            {o.desc && <span className="mt-0.5 text-sm text-muted-foreground">{o.desc}</span>}
          </label>
          {o.more && (
            <>
              <button
                type="button"
                aria-expanded={open.includes(o.value)}
                onClick={() => setOpen((cur) => (cur.includes(o.value) ? cur.filter((v) => v !== o.value) : [...cur, o.value]))}
                className="absolute right-0 top-0 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-primary hover:underline"
              >
                {open.includes(o.value) ? "Mniej" : "Więcej"}
              </button>
              {open.includes(o.value) && <p className="w-full px-4 pb-3 text-sm text-muted-foreground">{o.more}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function MultiList({
  options, selected, onToggle, columns = 1,
}: { options: Choice[]; selected: string[]; onToggle: (v: string) => void; columns?: 1 | 2 }) {
  return (
    <div className={cn("grid gap-3", columns === 2 && "grid-cols-2")}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cn(
              "flex min-h-14 flex-col justify-center rounded-lg border bg-card px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary bg-brand-soft" : "border-input hover:bg-muted",
            )}
          >
            <span className={cn("font-semibold", on && "text-primary")}>{o.label}</span>
            {o.desc && <span className="mt-0.5 text-sm text-muted-foreground">{o.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Field({ id, label, unit, error, children }: { id: string; label: string; unit?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        {children}
        {unit && <span className="text-muted-foreground">{unit}</span>}
      </div>
      {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  );
}

const bigInput = "h-14 text-lg";

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "health" }) {
  return (
    <p className={cn("rounded-lg border px-3 py-2 text-sm", tone === "health" ? "border-border bg-muted text-foreground" : "border-primary/20 bg-brand-soft text-foreground")}>
      {children}
    </p>
  );
}

function DateInput({ value, onChange, id }: { value: string; onChange: (iso: string) => void; id: string }) {
  const bounds = useMemo(() => birthDateBounds(), []);
  const toDisplay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : "");
  const [display, setDisplay] = useState(() => toDisplay(value));
  const [touched, setTouched] = useState(false);
  const cal = useRef<HTMLInputElement>(null);
  const format = (digits: string) => {
    const d = digits.slice(0, 8);
    let out = d.slice(0, 2);
    if (d.length > 2) out += "." + d.slice(2, 4);
    if (d.length > 4) out += "." + d.slice(4, 8);
    return out;
  };
  const apply = (text: string) => {
    const f = format(text.replace(/\D/g, ""));
    setDisplay(f);
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(f);
    onChange(m ? `${m[3]}-${m[2]}-${m[1]}` : "");
  };
  // Complete date: checked at once (age 16–90). Incomplete text: only after leaving the field.
  const complete = /^\d{2}\.\d{2}\.\d{4}$/.test(display);
  const error = complete ? birthDateError(value) : touched ? (display ? BIRTH_INVALID_MESSAGE : BIRTH_REQUIRED_MESSAGE) : null;
  return (
    <div className="space-y-1.5">
      <div className="relative w-full">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="DD.MM.RRRR"
          value={display}
          maxLength={10}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => apply(e.target.value)}
          onBlur={() => setTouched(true)}
          onPaste={(e) => { e.preventDefault(); apply(e.clipboardData.getData("text")); }}
          className={cn(bigInput, "pr-12", error && "border-danger")}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Otwórz kalendarz"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
          onClick={() => cal.current?.showPicker?.()}
        >
          <Calendar className="h-5 w-5" />
        </button>
        {/* The calendar starts empty and opens about 30 years back, never at today. */}
        <input
          ref={cal}
          type="date"
          min={bounds.min}
          max={bounds.max}
          value={value || bounds.opensAt}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => { if (e.target.value) { setDisplay(toDisplay(e.target.value)); onChange(e.target.value); } }}
        />
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

/** "text (opcjonalnie)" — the old text stays whole, the marker is a separate element. */
function Opt({ text }: { text: string }) {
  return <>{text} <span className="whitespace-nowrap">(opcjonalnie)</span></>;
}

function Section({
  id, title, lead, more, headingRef, children,
}: { id: StepId; title: string; lead: React.ReactNode; more?: string; headingRef: React.Ref<HTMLHeadingElement>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 sm:space-y-4" data-step={id}>
      <div className="space-y-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-[26px] font-extrabold leading-tight tracking-tight outline-none sm:text-[28px]" data-testid="question">
          {title}
        </h1>
        <p className="text-muted-foreground">
          {lead}
          {more && (
            <>
              {" "}
              <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                {open ? "Mniej" : "Więcej"}
              </button>
            </>
          )}
        </p>
        {more && open && <p className="text-sm text-muted-foreground">{more}</p>}
      </div>
      {children}
    </div>
  );
}


export default function SurveyWizard({
  inviteToken,
  prefill = {},
}: {
  inviteToken: string;
  prefill?: Prefill;
}) {
  const initial = useMemo(() => {
    const base: Answers = {
      ...EMPTY_ANSWERS,
      firstName: prefill.firstName ?? "",
      lastName: prefill.lastName ?? "",
      email: prefill.email ?? "",
      phone: prefill.phone ?? "",
    };
    const draft = loadDraft(inviteToken);
    const answers = normalizeAnswers(draft ? { ...base, ...draft.answers } : base, prefill);
    const first = visibleSteps(answers, prefill)[0];
    return { answers, stepId: (draft?.stepId ?? first) as StepId | "summary" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [stepId, setStepId] = useState<StepId | "summary">(initial.stepId);
  const [showError, setShowError] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const [done, setDone] = useState<string | null>(null);
  const [cardioExpanded, setCardioExpanded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = visibleSteps(answers, prefill);
  const stages = visibleStages(answers, prefill);
  const effectiveStep: StepId | "summary" =
    stepId === "summary" || steps.includes(stepId) ? stepId : (steps.find((s) => s) ?? "summary");
  const index = effectiveStep === "summary" ? steps.length : steps.indexOf(effectiveStep);
  const stageIdx = effectiveStep === "summary" ? stages.length : stages.findIndex((s) => s.visible.includes(effectiveStep as StepId));
  const stage = stages[Math.min(stageIdx, stages.length - 1)];
  const error = effectiveStep === "summary" ? null : validateStep(effectiveStep, answers);

  const set = useCallback(
    (patch: Partial<Answers>) => {
      setShowError(true);
      setAnswers((prev) => normalizeAnswers({ ...prev, ...patch }, prefill));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Autosave (token-scoped) and focus on the question after a step change.
  useEffect(() => {
    if (!done) saveDraft(inviteToken, { v: 1, answers, stepId: effectiveStep });
  }, [answers, effectiveStep, inviteToken, done]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
    setShowError(false);
    setTouched({});
  }, [effectiveStep]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (to: StepId | "summary") => {
    if (timer.current) clearTimeout(timer.current);
    setStepId(to);
  };
  const goNext = (snapshot: Answers = answers) => {
    if (effectiveStep === "summary") return;
    if (validateStep(effectiveStep, snapshot)) {
      setShowError(true);
      return;
    }
    const list = visibleSteps(snapshot, prefill);
    const i = list.indexOf(effectiveStep);
    go(i >= 0 && i < list.length - 1 ? list[i + 1] : "summary");
  };
  const goBack = () => {
    if (index <= 0) return;
    go(steps[index - 1] ?? steps[steps.length - 1]);
  };
  /** Single choice: store the answer and move on after a short pause. */
  const choose = (patch: Partial<Answers>) => {
    const next = normalizeAnswers({ ...answers, ...patch }, prefill);
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    if (!validateStep(effectiveStep as StepId, next)) timer.current = setTimeout(() => goNext(next), AUTO_ADVANCE_MS);
  };

  const mutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch(`/api/public/survey/${encodeURIComponent(inviteToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) throw new Error("Błąd serwera — spróbuj ponownie.");
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      return res.json() as Promise<{ success: boolean; message?: string }>;
    },
    onSuccess: (res) => {
      clearDraft(inviteToken);
      setDone(res.message || "Dziękuję za wypełnienie wywiadu treningowego. Przeanalizuję Twoje odpowiedzi i przygotuję indywidualny plan treningowy.");
    },
  });

  if (done) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center rounded-lg border border-border bg-card px-6 py-16 text-center" role="status">
        <CheckCircle2 className="mb-6 h-12 w-12 text-primary" aria-hidden="true" />
        <h2 className="mb-3 text-3xl font-extrabold tracking-tight">Krok pierwszy zrobiony.</h2>
        <p className="text-muted-foreground">{done}</p>
      </div>
    );
  }

  const segments = stages.length;
  const filled = Math.min(stageIdx, segments);
  const isLast = effectiveStep !== "summary" && index === steps.length - 1;
  const stepsLeft = Math.max(0, steps.length - index);

  const level = answers.experienceLevel;
  const age = calculateAge(answers.dateOfBirth);
  const multiCount =
    effectiveStep === "sportNeeds" ? answers.sportPerformanceNeeds.length
    : effectiveStep === "equipment" ? answers.equipmentItems.length
    : effectiveStep === "methodsList" ? answers.advancedMethodsToAvoid.length
    : null;

  const err = (show = showError) => (show ? error : null);

  function renderStep(id: StepId): React.ReactNode {
    switch (id) {
      case "name":
        return (
          <Section id={id} headingRef={heading} title="Jak masz na imię?" lead={SECTION_TEXT.basic}>
            <Field id="firstName" label="Imię" error={showError && !answers.firstName.trim() ? "Imię jest wymagane" : null}>
              <Input id="firstName" value={answers.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" className={bigInput} />
            </Field>
            <Field id="lastName" label="Nazwisko" error={showError && answers.firstName.trim() && !answers.lastName.trim() ? "Nazwisko jest wymagane" : null}>
              <Input id="lastName" value={answers.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" className={bigInput} />
            </Field>
          </Section>
        );
      case "contact":
        return (
          <Section id={id} headingRef={heading} title="Jak się z Tobą skontaktować?" lead="Trener użyje tego adresu, żeby przesłać Ci plan.">
            <Field id="email" label="E-mail" error={err()}>
              <Input id="email" type="email" inputMode="email" value={answers.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" className={bigInput} aria-invalid={!!err()} />
            </Field>
            <Field id="phone" label="Telefon (opcjonalnie)">
              <Input id="phone" type="tel" value={answers.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" className={bigInput} />
            </Field>
          </Section>
        );
      case "birth":
        return (
          <Section id={id} headingRef={heading} title="Kiedy się urodziłeś/-aś?" lead="Wiek wpływa na dobór obciążeń i tempa progresji.">
            <div className="space-y-1.5">
              <label htmlFor="dob" className="text-sm font-semibold">Data urodzenia</label>
              <DateInput id="dob" value={answers.dateOfBirth} onChange={(v) => set({ dateOfBirth: v })} />
            </div>
            {age !== undefined && !birthDateError(answers.dateOfBirth) && <p className="text-sm text-muted-foreground">Wiek: {age} lat</p>}
            <p className="text-sm font-semibold">Płeć</p>
            <ChoiceList name="Płeć" columns={2} options={["Mężczyzna", "Kobieta"].map((v) => ({ value: v, label: v }))} value={answers.gender} onChange={(v) => set({ gender: v })} />
          </Section>
        );
      case "body":
        return (
          <Section id={id} headingRef={heading} title="Wzrost i waga" lead="Wzrost i waga pomagają dobrać obciążenia i tempo progresji.">
            <Field id="height" label="Wzrost" unit="cm" error={touched.height || (answers.heightCm !== undefined && String(answers.heightCm).length >= 3) ? heightError(answers.heightCm) : null}>
              <Input id="height" type="number" inputMode="numeric" min={SURVEY_LIMITS.heightMin} max={SURVEY_LIMITS.heightMax} value={answers.heightCm ?? ""} onBlur={() => touch("height")} aria-describedby="height-error" onChange={(e) => set({ heightCm: e.target.value === "" ? undefined : parseInt(e.target.value) })} className={bigInput} />
            </Field>
            <Field id="weight" label="Waga" unit="kg" error={touched.weight || answers.weightKg.length >= 2 ? weightError(parseWeight(answers.weightKg)) : null}>
              <Input id="weight" inputMode="decimal" placeholder="np. 75,5" onBlur={() => touch("weight")} aria-describedby="weight-error" value={answers.weightKg} onChange={(e) => set({ weightKg: e.target.value.replace(",", ".") })} className={bigInput} />
            </Field>
          </Section>
        );
      case "goal":
        return (
          <Section id={id} headingRef={heading} title="Jaki jest Twój cel treningowy?" lead={SECTION_TEXT.goal}>
            <ChoiceList name="Cel treningowy" options={TRAINING_GOAL_OPTIONS.map((v) => ({ value: v, label: v }))} value={answers.trainingGoal} onChange={(v) => choose({ trainingGoal: v })} />
          </Section>
        );
      case "sportStatus":
        return (
          <Section id={id} headingRef={heading} title="Jak uprawiasz sport?" lead="Pytamy o to, bo wybrałeś/-aś cel sportowy.">
            <ChoiceList name="Jak uprawiasz sport" options={ATHLETE_STATUS_OPTIONS.map((v) => ({ value: v, label: v }))} value={answers.athleteStatus} onChange={(v) => choose({ athleteStatus: v })} />
          </Section>
        );
      case "sportNeeds":
        return (
          <Section id={id} headingRef={heading} title="Co jest dla Ciebie najważniejsze w sporcie?" lead={<>Pytamy o to, bo wybrałeś/-aś cel sportowy. <Opt text={HINT_TEXT.sportNeeds} /></>}>
            <MultiList
              options={SPORT_PERFORMANCE_NEEDS.map((n) => ({ value: n.value, label: n.value, desc: n.desc }))}
              selected={answers.sportPerformanceNeeds}
              onToggle={(v) => set({ sportPerformanceNeeds: toggle(answers.sportPerformanceNeeds, v) })}
            />
          </Section>
        );
      case "motivation":
        return (
          <Section id={id} headingRef={heading} title="Dlaczego chcesz trenować?" lead={<Opt text={HINT_TEXT.motivation} />}>
            <Input aria-label="Dlaczego chcesz trenować" placeholder="np. Chcę poprawić kondycję i schudnąć przed wakacjami" value={answers.trainingMotivation} onChange={(e) => set({ trainingMotivation: e.target.value })} className={bigInput} />
          </Section>
        );
      case "level":
        return (
          <Section id={id} headingRef={heading} title="Który poziom najlepiej opisuje Twoje doświadczenie?" lead="Wybierz opis, który najlepiej do Ciebie pasuje. Trener dostosuje plan do Twojego doświadczenia." more={SECTION_TEXT.level}>
            <ChoiceList
              name="Poziom doświadczenia"
              options={EXPERIENCE_LEVEL_OPTIONS.filter((o) => !(answers.trainingGoal === "Cel sportowy" && o.level === "Brak aktywności fizycznej")).map((o) => ({ value: o.level, label: o.level, desc: LEVEL_SHORT[o.level], more: LEVEL_FULL[o.level] ?? o.desc }))}
              value={answers.experienceLevel}
              onChange={(v) => choose({ experienceLevel: v })}
            />
          </Section>
        );
      case "duration":
        return (
          <Section id={id} headingRef={heading} title="Jak długo trenujesz?" lead="Pytamy o to, bo wskazałeś/-aś doświadczenie treningowe. Pomaga nam dobrać właściwy poziom planu (opcjonalnie).">
            <Input aria-label="Jak długo trenujesz" placeholder="np. 2 lata" value={answers.trainingDuration} onChange={(e) => set({ trainingDuration: e.target.value })} className={bigInput} />
          </Section>
        );
      case "location":
        return (
          <Section id={id} headingRef={heading} title="Gdzie najczęściej będziesz trenować?" lead={SECTION_TEXT.place}>
            <ChoiceList name="Miejsce treningu" options={TRAINING_LOCATION_OPTIONS.map((o) => ({ value: o.loc, label: o.loc, desc: LOCATION_DESC[o.loc] ?? o.desc }))} value={answers.trainingLocation} onChange={(v) => choose({ trainingLocation: v })} />
          </Section>
        );
      case "equipment":
        return (
          <Section id={id} headingRef={heading} title="Jakim sprzętem dysponujesz?" lead="Pytamy o to, bo trenujesz w domu lub na siłowni plenerowej. Zaznacz wszystko, co masz.">
            <MultiList columns={2} options={EQUIPMENT_OPTIONS.map((v) => ({ value: v, label: v }))} selected={answers.equipmentItems} onToggle={(v) => set({ equipmentItems: toggleEquipment(answers.equipmentItems, v) })} />
            <Input aria-label="Inny sprzęt" placeholder="Inny sprzęt" value={answers.equipmentOther} onChange={(e) => set({ equipmentOther: e.target.value, ...(e.target.value.trim() ? { equipmentItems: answers.equipmentItems.filter((x) => x !== NO_EQUIPMENT) } : {}) })} className={bigInput} />
            {err() && <p className="text-sm text-danger">{err()}</p>}
          </Section>
        );
      case "frequency":
        return (
          <Section id={id} headingRef={heading} title="Ile treningów tygodniowo chciałbyś wykonywać?" lead={SECTION_TEXT.time}>
            <Note>{HINT_TEXT.frequency}</Note>
            {level && TRAINING_FREQUENCY_RECOMMENDATIONS[level] && <Note>{TRAINING_FREQUENCY_RECOMMENDATIONS[level]}</Note>}
            <Field id="freq" label="Liczba treningów w tygodniu" error={err()}>
              <Input id="freq" type="number" inputMode="numeric" min={1} max={7} value={answers.desiredWeeklyFrequency ?? ""} onChange={(e) => set({ desiredWeeklyFrequency: e.target.value === "" ? undefined : Math.min(7, Math.max(1, parseInt(e.target.value))) })} className={bigInput} />
            </Field>
          </Section>
        );
      case "session":
        return (
          <Section id={id} headingRef={heading} title="Ile czasu realnie możesz poświęcić na jeden trening?" lead="Realny czas pozwala ułożyć plan, który utrzymasz na dłużej.">
            <ChoiceList name="Czas treningu" columns={2} options={SESSION_DURATION_OPTIONS.map((v) => ({ value: v, label: v }))} value={answers.sessionDuration} onChange={(v) => choose({ sessionDuration: v })} />
          </Section>
        );
      case "injury":
        return (
          <Section id={id} headingRef={heading} title="Czy masz kontuzje, dolegliwości bólowe lub ograniczenia ruchowe?" lead={SECTION_TEXT.health}>
            <Note tone="health">To nie jest diagnoza. Podaj tylko to, co trener powinien wiedzieć, żeby dobrać bezpieczne ćwiczenia.</Note>
            <ChoiceList name="Kontuzje i ograniczenia" columns={2} options={[{ value: "Tak", label: "Tak" }, { value: "Nie", label: "Nie" }]} value={answers.injuryStatus} onChange={(v) => choose({ injuryStatus: v as Answers["injuryStatus"] })} />
            {showError && error && <p className="text-sm text-danger">{error}</p>}
          </Section>
        );
      case "healthDesc":
        return (
          <Section id={id} headingRef={heading} title="Opisz zdrowie i ograniczenia" lead="Pytamy o to, bo wskazałeś/-aś ograniczenia.">
            <Note>{HINT_TEXT.healthExamples}</Note>
            <Note tone="health">To nie jest diagnoza — opisz własnymi słowami, jak potrafisz.</Note>
            {isBeginnerLevel(level) && <Note>{HINT_TEXT.beginnerHealth}</Note>}
            <Textarea aria-label="Opis ograniczeń" aria-invalid={!!err()} value={answers.healthLimitations} onChange={(e) => set({ healthLimitations: e.target.value })} placeholder="Opisz krótko swoje kontuzje, dolegliwości lub ograniczenia ruchowe..." className="min-h-[140px] text-base" />
            {err() && <p className="text-sm text-danger">{err()}</p>}
          </Section>
        );
      case "activity":
        return (
          <Section id={id} headingRef={heading} title="Jak dużo ruszasz się na co dzień poza treningami?" lead={SECTION_TEXT.life}>
            <ChoiceList name="Codzienna aktywność" options={ACTIVITY_LEVEL_OPTIONS.map((o) => ({ value: o.level, label: ACTIVITY_LABEL[o.level] ?? o.level, desc: ACTIVITY_DESC[o.level] ?? o.clientDesc }))} value={answers.activityLevel} onChange={(v) => choose({ activityLevel: v })} />
          </Section>
        );
      case "sleep":
        return (
          <Section id={id} headingRef={heading} title="Ile godzin średnio sypiasz w ciągu doby?" lead="Sen wpływa na regenerację, a ta na to, ile treningu będzie dla Ciebie dobre.">
            <ChoiceList name="Sen" options={SLEEP_HOURS_OPTIONS.map((v) => ({ value: v, label: v }))} value={answers.sleepHours} onChange={(v) => choose({ sleepHours: v })} />
          </Section>
        );
      case "stress":
        return (
          <Section id={id} headingRef={heading} title="Jak oceniasz swój poziom stresu?" lead={`${HINT_TEXT.stress} Możesz pominąć to pytanie.`}>
            <div className="flex items-center gap-6 pt-4">
              <Slider min={1} max={10} step={1} value={[answers.stressLevel ?? 5]} aria-label="Poziom stresu" onValueChange={(v) => set({ stressLevel: v[0] })} className="flex-1" />
              <span className="w-10 text-center text-3xl font-extrabold text-primary" data-testid="stress-value">{answers.stressLevel ?? "—"}</span>
            </div>
            {answers.stressLevel !== undefined && (
              <button type="button" className="min-h-11 text-sm text-muted-foreground underline" onClick={() => set({ stressLevel: undefined })}>
                Nie odpowiadam
              </button>
            )}
          </Section>
        );
      case "cardioPref":
        return (
          <Section id={id} headingRef={heading} title="Jak uwzględnić cardio w planie?" lead={<Opt text={SECTION_TEXT.cardio} />}>
            {isCardioRelevant(answers.trainingGoal, answers.activityLevel) && <Note>{CARDIO_RECOMMENDATION_TEXT}</Note>}
            <ChoiceList
              name="Cardio w planie"
              options={CARDIO_PREFERENCE_OPTIONS.map((v) => ({ value: v, label: CARDIO_PREF_LABEL[v] ?? v }))}
              value={answers.cardioPreference}
              onChange={(v) => choose({ cardioPreference: v })}
            />
            {answers.cardioPreference === "Wolę ograniczyć cardio do niezbędnego minimum" && <Note>{CARDIO_AVOID_REASSURANCE_TEXT}</Note>}
          </Section>
        );
      case "cardioFreq":
        return (
          <Section id={id} headingRef={heading} title="Jak często wykonujesz cardio?" lead={<Opt text={CARDIO_FREQUENCY_HELPER_TEXT} />}>
            <ChoiceList name="Częstotliwość cardio" options={CARDIO_FREQUENCY_OPTIONS.map((v) => ({ value: v, label: v }))} value={answers.cardioFrequency} onChange={(v) => choose({ cardioFrequency: v })} />
          </Section>
        );
      case "cardioType": {
        const main = ["Marsz", "Bieganie", "Rower"];
        const opts = PREFERRED_CARDIO_TYPE_OPTIONS.filter((v) => cardioExpanded || main.includes(v) || v === answers.preferredCardioType);
        return (
          <Section id={id} headingRef={heading} title="Jaka forma aktywności tlenowej najbardziej Ci odpowiada?" lead="Wybierz formę, którą lubisz (opcjonalnie).">
            <ChoiceList name="Forma cardio" columns={2} options={opts.map((v) => ({ value: v, label: v }))} value={answers.preferredCardioType} onChange={(v) => choose({ preferredCardioType: v })} />
            <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-primary" onClick={() => setCardioExpanded((x) => !x)}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", cardioExpanded && "rotate-180")} aria-hidden="true" />
              {cardioExpanded ? "Pokaż mniej" : "Pokaż więcej"}
            </button>
          </Section>
        );
      }
      case "planStyle":
        return (
          <Section id={id} headingRef={heading} title="Jaki styl planu Ci odpowiada?" lead={SECTION_TEXT.prefs}>
            <ChoiceList name="Styl planu" options={PLAN_STYLE_OPTIONS.map((o) => ({ value: o.style, label: o.style, desc: PLAN_STYLE_DESC[o.style] ?? o.desc }))} value={answers.planStylePreference} onChange={(v) => choose({ planStylePreference: v })} />
          </Section>
        );
      case "avoided":
        return (
          <Section id={id} headingRef={heading} title="Ćwiczenia do unikania" lead={<>Pytamy o to, bo masz większe doświadczenie. <Opt text={HINT_TEXT.avoided} /></>}>
            <AvoidedExercisesPicker
              selectedExercises={answers.avoidedExercises}
              onSelectedChange={(v) => set({ avoidedExercises: v })}
              otherText={answers.avoidedOtherText}
              onOtherTextChange={(v) => set({ avoidedOtherText: v })}
              otherReason={answers.avoidedOtherReason}
              onOtherReasonChange={(v) => set({ avoidedOtherReason: v })}
            />
          </Section>
        );
      case "favorite":
        return (
          <Section
            id={id}
            headingRef={heading}
            title={isBeginnerLevel(level) ? "Ćwiczenia preferowane" : "Jakie są Twoje ulubione ćwiczenia?"}
            lead={<Opt text={isBeginnerLevel(level) ? HINT_TEXT.favBeginner : HINT_TEXT.favOther} />}
          >
            <FavoriteExercisesPicker selectedExercises={answers.favoriteExercises} onSelectedChange={(v) => set({ favoriteExercises: v })} />
          </Section>
        );
      case "priority":
        return (
          <Section
            id={id}
            headingRef={heading}
            title="Partie priorytetowe"
            lead={<Opt text={isBeginnerLevel(level) ? HINT_TEXT.priBeginner : HINT_TEXT.priOther} />}
          >
            {isBeginnerLevel(level) && <Note>{HINT_TEXT.priNote}</Note>}
            {(["priorityMuscle1", "priorityMuscle2", "priorityMuscle3"] as const).map((k, i) => (
              <div key={k} className="space-y-1.5">
                <p className="text-sm font-semibold">Priorytet {i + 1}</p>
                <MuscleGroupCombobox value={answers[k]} onChange={(v) => set({ [k]: v } as Partial<Answers>)} placeholder={["np. Barki", "np. Pośladki", "np. Plecy"][i]} />
              </div>
            ))}
            <span className="sr-only">{MUSCLE_GROUPS.length} grup mięśniowych do wyboru</span>
          </Section>
        );
      case "methods":
        return (
          <Section id={id} headingRef={heading} title="Czy chcesz, aby w planie były metody intensyfikacji treningu?" lead={<>Pytamy o to, bo masz większe doświadczenie. <Opt text={HINT_TEXT.methods} /></>}>
            <ChoiceList name="Metody intensyfikacji" columns={2} options={[{ value: "Tak", label: "Tak" }, { value: "Nie", label: "Nie" }]} value={answers.avoidsAdvancedMethods} onChange={(v) => choose({ avoidsAdvancedMethods: v as Answers["avoidsAdvancedMethods"] })} />
          </Section>
        );
      case "methodsList":
        return (
          <Section id={id} headingRef={heading} title="Które metody chcesz stosować?" lead="Pytamy o to, bo chcesz metod intensyfikacji.">
            <MultiList options={ADVANCED_METHODS.map((v) => ({ value: v, label: v }))} selected={answers.advancedMethodsToAvoid} onToggle={(v) => set({ advancedMethodsToAvoid: toggle(answers.advancedMethodsToAvoid, v) })} />
          </Section>
        );
      case "additional":
        return (
          <Section id={id} headingRef={heading} title="Czy jest coś jeszcze, co powinienem wiedzieć?" lead={<><Opt text={SECTION_TEXT.additional} /> {HINT_TEXT.additional}</>}>
            <Textarea aria-label="Dodatkowe informacje" value={answers.additionalInfo} onChange={(e) => set({ additionalInfo: e.target.value })} className="min-h-[140px] text-base" />
          </Section>
        );
    }
  }

  const summaryItems = (ids: StepId[]) => ids.map((id) => ({ id, text: summaryText(id, answers) })).filter((i) => i.text);

  return (
    <div
      className="mx-auto w-full max-w-[560px] space-y-3 sm:space-y-5"
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        const t = e.target as HTMLElement;
        if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.closest("[role=combobox],[cmdk-root]")) return;
        e.preventDefault();
        if (effectiveStep !== "summary") goNext();
      }}
    >
      {/* Header: back, stage, progress */}
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={index <= 0}
            aria-label="Wstecz"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" data-testid="stage-name">
              {effectiveStep === "summary" ? "Podsumowanie" : stage?.name}
            </p>
            <p className="text-sm text-muted-foreground" data-testid="stage-count">
              {effectiveStep === "summary" ? `Ostatni krok` : `${stageIdx + 1} z ${segments}`} · {effectiveStep === "summary" ? "sprawdź i wyślij" : `jeszcze ok. ${remainingMinutes(stepsLeft)} min`}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Postęp wywiadu"
          aria-valuemin={0}
          aria-valuemax={segments}
          aria-valuenow={filled}
          className="flex gap-1"
        >
          {stages.map((s, i) => (
            <span key={s.id} className={cn("h-1.5 flex-1 rounded-sm", i < filled ? "bg-primary" : i === filled && effectiveStep !== "summary" ? "bg-primary/50" : "bg-muted")} />
          ))}
        </div>
      </header>

      <div className="flex flex-col rounded-lg border border-border bg-card p-4 sm:min-h-[420px] sm:p-5">
        <div className="flex-1" key={effectiveStep}>
          {effectiveStep === "summary" ? (
            <div className="space-y-4" data-step="summary">
              <h1 ref={heading} tabIndex={-1} className="text-[26px] font-extrabold leading-tight tracking-tight outline-none sm:text-[28px]" data-testid="question">
                Sprawdź swoje odpowiedzi
              </h1>
              <p className="text-muted-foreground">Możesz wrócić do każdego etapu i coś zmienić. Po wysłaniu trener zobaczy Twoje odpowiedzi.</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {stages.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 p-3" data-testid="summary-stage">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-muted-foreground">{summaryItems(s.visible).map((i) => i.text).join(" · ") || "—"}</p>
                    </div>
                    <button type="button" onClick={() => go(s.visible[0])} className="min-h-11 shrink-0 px-2 text-sm font-semibold text-primary hover:underline" aria-label={`Zmień: ${s.name}`}>
                      Zmień
                    </button>
                  </li>
                ))}
              </ul>
              {mutation.isError && (
                <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {humanizeError(mutation.error, "Nie udało się wysłać wywiadu. Spróbuj ponownie.")}
                </p>
              )}
            </div>
          ) : (
            renderStep(effectiveStep)
          )}
        </div>

        <div className="mt-4 sm:mt-6">
          {effectiveStep === "summary" ? (
            <Button
              size="lg"
              className="w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(buildSurveyPayload(answers, prefill))}
            >
              {mutation.isPending ? <><Loader2 className="h-5 w-5 animate-spin" /> Przetwarzanie...</> : "Wyślij trenerowi"}
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                className="w-full disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                onClick={() => goNext()}
                disabled={!!error}
                aria-describedby={error ? "next-hint" : undefined}
                data-testid="next"
              >
                {isLast ? "Podsumowanie" : multiCount ? `Dalej · zaznaczono ${multiCount}` : "Dalej"}
              </Button>
              {error && (
                <p id="next-hint" data-testid="next-hint" className="mt-2 text-center text-sm text-muted-foreground">
                  {missingHint(effectiveStep, answers) ?? error}
                </p>
              )}
            </>
          )}
          {showError && error && effectiveStep !== "summary" && !["injury", "healthDesc", "contact", "frequency", "equipment", "birth", "name", "body"].includes(effectiveStep) && (
            <p role="alert" className="mt-2 text-sm text-danger">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const LEVEL_SHORT: Record<string, string> = {
  "Brak aktywności fizycznej": "Zaczynam lub wracam po przerwie.",
  Początkujący: "Uczę się podstaw i techniki.",
  Średniozaawansowany: "Trenuję regularnie, znam podstawy.",
  Zaawansowany: "Duże doświadczenie, świadome metody.",
};
/** Full descriptions (client wording, as in the former form). */
const LEVEL_FULL: Record<string, string> = {
  "Brak aktywności fizycznej": "Nie podejmuję regularnej aktywności fizycznej, nigdy wcześniej nie realizowałem/-am uporządkowanego treningu oporowego lub wracam po długiej przerwie. Chcę spokojnie zacząć, nauczyć się podstawowych wzorców ruchowych i stopniowo przygotować organizm do regularnego wysiłku.",
  Początkujący: "Mam niewielkie doświadczenie treningowe. Nadal uczę się podstawowych ćwiczeń, poprawnej techniki oraz zasad treningowych i nie czuję się jeszcze pewnie w samodzielnym planowaniu treningów.",
  Średniozaawansowany: "Trenuję regularnie i swobodnie wykonuję większość podstawowych ćwiczeń. Rozumiem podstawowe zasady treningowe, potrafię kontrolować technikę i świadomie realizuję plan treningowy.",
  Zaawansowany: "Posiadam duże doświadczenie treningowe, bardzo dobrze znam swoje możliwości oraz świadomie wykorzystuję różne metody treningowe do osiągania konkretnych celów.",
};

const ACTIVITY_LABEL: Record<string, string> = {
  Siedzący: "Siedzący tryb dnia",
  "Lekko aktywny": "Umiarkowana aktywność",
  "Praca fizyczna": "Duża aktywność",
  "Bardzo aktywny": "Bardzo duża aktywność",
};
const ACTIVITY_DESC: Record<string, string> = {
  Siedzący: "Większość dnia siedzę i mało chodzę.",
  "Lekko aktywny": "Regularnie chodzę i wykonuję lekkie codzienne aktywności.",
  "Praca fizyczna": "Większość dnia jestem w ruchu lub pracuję fizycznie.",
  "Bardzo aktywny": "Wykonuję ciężką pracę fizyczną albo intensywnie ruszam się przez większość dnia.",
};
const CARDIO_PREF_LABEL: Record<string, string> = {
  "Chętnie uwzględnię cardio w planie": "Uwzględnij w planie",
  "Cardio może być dodatkiem do planu": "Może być dodatkiem do planu",
  "Wolę ograniczyć cardio do niezbędnego minimum": "Tylko niezbędne minimum",
};

/** One-line summary of what the client answered on a screen ("" when nothing). */
export function summaryText(id: StepId, a: Answers): string {
  switch (id) {
    case "name": return [a.firstName, a.lastName].filter(Boolean).join(" ");
    case "contact": return [a.email, a.phone].filter(Boolean).join(", ");
    case "birth": return [a.dateOfBirth ? a.dateOfBirth.split("-").reverse().join(".") : "", a.gender].filter(Boolean).join(", ");
    case "body": return a.heightCm ? `${a.heightCm} cm, ${a.weightKg.replace(".", ",")} kg` : "";
    case "goal": return a.trainingGoal;
    case "sportStatus": return a.athleteStatus;
    case "sportNeeds": return a.sportPerformanceNeeds.join(", ");
    case "motivation": return a.trainingMotivation;
    case "level": return a.experienceLevel;
    case "duration": return a.trainingDuration;
    case "location": return a.trainingLocation;
    case "equipment": return buildEquipmentString(a.equipmentItems, a.equipmentOther);
    case "frequency": return a.desiredWeeklyFrequency ? `${a.desiredWeeklyFrequency} w tygodniu` : "";
    case "session": return a.sessionDuration;
    case "injury": return a.injuryStatus === "Tak" ? "Są ograniczenia" : a.injuryStatus === "Nie" ? "Brak ograniczeń" : "";
    case "healthDesc": return a.healthLimitations;
    case "activity": return a.activityLevel;
    case "sleep": return a.sleepHours;
    case "stress": return a.stressLevel !== undefined ? `stres ${a.stressLevel}/10` : "";
    case "cardioPref": return a.cardioPreference ? (CARDIO_PREF_LABEL[a.cardioPreference] ?? a.cardioPreference) : "";
    case "cardioFreq": return a.cardioFrequency;
    case "cardioType": return a.preferredCardioType;
    case "planStyle": return a.planStylePreference;
    case "avoided": return [...a.avoidedExercises.map((e) => e.name), a.avoidedOtherText].filter(Boolean).join(", ");
    case "favorite": return a.favoriteExercises.map((e) => e.name).join(", ");
    case "priority": return [a.priorityMuscle1, a.priorityMuscle2, a.priorityMuscle3].filter(Boolean).join(", ");
    case "methods": return a.avoidsAdvancedMethods;
    case "methodsList": return a.advancedMethodsToAvoid.join(", ");
    case "additional": return a.additionalInfo;
  }
}

export { STAGES, isStepVisible };
