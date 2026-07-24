/**
 * Cardio Recommendation Generator
 *
 * Pure function: derives a practical cardio recommendation from client survey
 * fields. No side effects, no API calls. Used in PlanEditor to generate a
 * default recommendation when the trainer has not yet saved an override.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardioSession {
  durationMinutes: number;
  /** Activity-specific metric text, e.g. "tempo około 6:40 min/km" */
  metric: string;
}

export interface CardioRecommendationData {
  activity: string;
  sessionsPerWeek: number;
  sessions: CardioSession[];
  progressionText: string;
  executionInstruction: string;
  preSessionNote: string;
  hasHealthLimitation: boolean;
}

export interface CardioInputs {
  /** "Tylko niezbędne minimum" | "Uwzględnij w planie" | null */
  cardioPreference: string | null;
  /** "0" | "1-2" | "3-4" | "4+" | null — current weekly cardio frequency */
  cardioFrequency: string | null;
  /** "Marsz" | "Bieganie" | "Rower" | "Pływanie" | "Orbitrek" | "Wioślarz" | "Schody" | "Sport rekreacyjny" | null */
  preferredCardioType: string | null;
  /** "Siedzący" | "Lekko aktywny" | "Praca fizyczna" | "Bardzo aktywny" | null */
  activityLevel: string | null;
  trainingGoal: string | null;
  experienceLevel: string | null;
  /** Number of strength training days per week in this plan */
  trainingDays: number;
  hasHealthLimitation: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BEGINNER_LEVELS = new Set(["Brak aktywności fizycznej", "Początkujący"]);

function isBeginner(level: string | null): boolean {
  return !!level && BEGINNER_LEVELS.has(level);
}

function isMinimum(pref: string | null): boolean {
  return pref === "Tylko niezbędne minimum";
}

function isAlreadyVeryActive(freq: string | null): boolean {
  return freq === "4+";
}

function isAlreadyActive(freq: string | null): boolean {
  return freq === "3-4" || freq === "4+";
}

// ─── Activity selection ───────────────────────────────────────────────────────

function selectActivity(inputs: CardioInputs): string {
  const pref = inputs.preferredCardioType;
  const beginner = isBeginner(inputs.experienceLevel);
  const inactive =
    inputs.activityLevel === "Siedzący" ||
    inputs.experienceLevel === "Brak aktywności fizycznej";
  const minimum = isMinimum(inputs.cardioPreference);

  // Do not push running on inactive / beginner / minimum clients unless they
  // explicitly chose it.
  if ((beginner || inactive || minimum) && pref !== "Bieganie") {
    // Honor their non-running preference; otherwise default to Marsz.
    if (pref && pref !== "Bieganie") return pref;
    return "Marsz";
  }

  // Use their preference when set.
  if (pref) return pref;

  // Sensible default for everyone else.
  return "Szybki marsz";
}

// ─── Session count ────────────────────────────────────────────────────────────

function selectSessionCount(inputs: CardioInputs): number {
  const minimum = isMinimum(inputs.cardioPreference);
  const beginner = isBeginner(inputs.experienceLevel);
  const alreadyVeryActive = isAlreadyVeryActive(inputs.cardioFrequency);
  const alreadyActive = isAlreadyActive(inputs.cardioFrequency);
  const veryActiveLifestyle =
    inputs.activityLevel === "Bardzo aktywny" ||
    inputs.activityLevel === "Praca fizyczna";

  // Client already does 4+ cardio sessions — do not pile on.
  if (alreadyVeryActive) return 2;

  // Minimum preference → conservative 1–2.
  if (minimum) return beginner ? 1 : 2;

  // Already active (3-4×) → maintain, no addition.
  if (alreadyActive) return 2;

  // "Uwzględnij w planie" path:
  if (beginner) return 2;
  if (veryActiveLifestyle) return 2; // avoid overloading an already busy client
  return 3;
}

// ─── Session duration ─────────────────────────────────────────────────────────

function selectDuration(inputs: CardioInputs, sessionsPerWeek: number): number {
  const beginner = isBeginner(inputs.experienceLevel);
  const minimum = isMinimum(inputs.cardioPreference);
  const veryActiveLifestyle =
    inputs.activityLevel === "Bardzo aktywny" ||
    inputs.activityLevel === "Praca fizyczna";

  if (beginner || minimum) return 20;
  if (veryActiveLifestyle && sessionsPerWeek >= 3) return 30;
  return 25;
}

// ─── Activity-specific metric ─────────────────────────────────────────────────

function buildMetric(activity: string): string {
  switch (activity) {
    case "Bieganie":
      return "tempo około 6:40 min/km";
    case "Marsz":
      return "Idź energicznym tempem, ale bez dużej zadyszki.";
    case "Szybki marsz":
      return "prędkość około 5.5 km/h";
    case "Rower":
    case "Orbitrek":
      return "lekka lub umiarkowana intensywność";
    case "Wioślarz":
      return "umiarkowane, równomierne tempo";
    case "Pływanie":
      return "spokojne tempo, skupienie na technice";
    case "Schody":
      return "umiarkowana intensywność";
    case "Sport rekreacyjny":
      return "zgodnie z zasadami wybranej dyscypliny";
    default:
      return "lekka lub umiarkowana intensywność";
  }
}

// ─── Progression ─────────────────────────────────────────────────────────────

function buildProgression(
  activity: string,
  durationMinutes: number,
  sessionsPerWeek: number,
): string {
  const sessionRef =
    sessionsPerWeek === 1
      ? "sesję"
      : sessionsPerWeek === 2
      ? "obie sesje"
      : "wszystkie sesje";

  switch (activity) {
    case "Bieganie":
      return (
        `Wykonuj ${sessionRef} przez 1–2 tygodnie. Jeśli kończysz je bez nadmiernego zmęczenia, ` +
        `zachowaj czas ${durationMinutes} minut i spróbuj poprawić tempo z około 6:40 do 6:30–6:35 min/km.`
      );
    case "Marsz":
      return (
        `Po 1–2 tygodniach wydłuż każdą sesję z ${durationMinutes} do ${durationMinutes + 5} minut. ` +
        `Nie zwiększaj jednocześnie czasu i tempa.`
      );
    case "Szybki marsz":
      return (
        `Jeśli ${sessionRef} wykonujesz swobodnie, zwiększ prędkość z 5.5 do 5.8 km/h ` +
        `albo wydłuż sesję o 5 minut. Nie zmieniaj obu parametrów jednocześnie.`
      );
    case "Rower":
    case "Orbitrek":
      return (
        `Po 1–2 tygodniach wydłuż każdą sesję o 5 minut lub zwiększ intensywność o jeden poziom. ` +
        `Nie zmieniaj obu parametrów jednocześnie.`
      );
    case "Wioślarz":
      return (
        `Po 1–2 tygodniach wydłuż każdą sesję o 5 minut lub delikatnie zwiększ tempo. ` +
        `Zachowaj prawidłową technikę przy każdej zmianie.`
      );
    case "Pływanie":
      return (
        `Po 1–2 tygodniach zwiększ czas sesji o 5–10 minut lub dodaj dodatkowe długości basenu. ` +
        `Zachowaj równe tempo i skupienie na technice.`
      );
    default:
      return (
        `Po 1–2 tygodniach wydłuż każdą sesję o 5 minut. ` +
        `Nie zwiększaj jednocześnie czasu i intensywności.`
      );
  }
}

// ─── Execution instruction ────────────────────────────────────────────────────

function buildExecutionInstruction(activity: string): string {
  switch (activity) {
    case "Bieganie":
      return (
        "Utrzymuj równe, spokojne tempo. Podczas lekkiego lub umiarkowanego biegu powinieneś " +
        "móc wypowiedzieć pełne zdanie bez dużej zadyszki."
      );
    case "Marsz":
    case "Szybki marsz":
      return (
        "Idź wyprostowany z lekkim wahaniem ramion. Utrzymuj tempo, przy którym możesz " +
        "mówić krótkimi zdaniami bez dużej zadyszki."
      );
    case "Rower":
      return (
        "Utrzymuj równomierną kadencję (70–90 obrotów/min). " +
        "Przy lekkiej intensywności swobodna rozmowa powinna być możliwa."
      );
    case "Orbitrek":
      return (
        "Utrzymuj pełny zakres ruchu i kontroluj intensywność. " +
        "Przy lekkiej intensywności swobodna rozmowa powinna być możliwa."
      );
    case "Pływanie":
      return (
        "Skup się na technice i równomiernym oddechu. " +
        "Nie forsuj prędkości — ważniejsza jest regularność i jakość ruchów."
      );
    case "Wioślarz":
      return (
        "Zachowaj prawidłową kolejność: najpierw nogi, potem tułów, na końcu ręce. " +
        "Intensywność: spokojny rytm, możliwość prowadzenia rozmowy."
      );
    default:
      return (
        "Utrzymuj równe, spokojne tempo. Podczas lekkiego lub umiarkowanego cardio powinieneś " +
        "móc wypowiedzieć pełne zdanie bez dużej zadyszki."
      );
  }
}

// ─── Pre-session note ─────────────────────────────────────────────────────────

function buildPreSessionNote(activity: string): string {
  const isOutdoor =
    activity === "Marsz" ||
    activity === "Szybki marsz" ||
    activity === "Bieganie" ||
    activity === "Sport rekreacyjny";

  const base =
    "Załóż wygodne obuwie sportowe, zabierz wodę i dopasuj strój do temperatury oraz warunków pogodowych.";

  return isOutdoor
    ? base + " W słabej widoczności wybierz jasny lub odblaskowy element stroju."
    : base;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateCardioRecommendation(
  inputs: CardioInputs,
): CardioRecommendationData {
  const activity = selectActivity(inputs);
  const sessionsPerWeek = selectSessionCount(inputs);
  const durationMinutes = selectDuration(inputs, sessionsPerWeek);
  const metric = buildMetric(activity);

  const sessions: CardioSession[] = Array.from(
    { length: sessionsPerWeek },
    () => ({ durationMinutes, metric }),
  );

  return {
    activity,
    sessionsPerWeek,
    sessions,
    progressionText: buildProgression(activity, durationMinutes, sessionsPerWeek),
    executionInstruction: buildExecutionInstruction(activity),
    preSessionNote: buildPreSessionNote(activity),
    hasHealthLimitation: inputs.hasHealthLimitation,
  };
}
