/**
 * RAMP Warm-up Generator
 *
 * Produces a static, template-based RAMP warm-up (Raise → Activate → Mobilize → Potentiate)
 * linked to training day type (Upper / Lower / Full body), derived from the exercises' muscle groups.
 */

export type RampPhase = "Raise" | "Activate" | "Mobilize" | "Potentiate";

export interface RampItem {
  name: string;
  detail: string; // sets/reps or duration
  description: string;
}

export interface RampBlock {
  phase: RampPhase;
  label: string;
  goal: string;
  items: RampItem[];
}

export type DayType = "upper" | "lower" | "full";

const UPPER_MUSCLE_GROUPS = new Set([
  "Klatka piersiowa",
  "Plecy",
  "Barki",
  "Biceps",
  "Triceps",
  "Przedramiona",
]);

const LOWER_MUSCLE_GROUPS = new Set([
  "Mięśnie czworogłowe uda",
  "Mięśnie dwugłowe uda",
  "Pośladki",
  "Łydki",
  "Odwodziciele",
  "Przywodziciele",
]);

export function determineDayType(muscleGroups: string[]): DayType {
  let upper = 0;
  let lower = 0;
  for (const mg of muscleGroups) {
    if (UPPER_MUSCLE_GROUPS.has(mg)) upper++;
    else if (LOWER_MUSCLE_GROUPS.has(mg)) lower++;
  }
  if (upper === 0 && lower === 0) return "full";
  if (upper > lower * 1.5) return "upper";
  if (lower > upper * 1.5) return "lower";
  return "full";
}

const TEMPLATES: Record<DayType, RampBlock[]> = {
  upper: [
    {
      phase: "Raise",
      label: "Rozgrzanie ogólne",
      goal: "Podnieś tętno i temperaturę ciała.",
      items: [
        { name: "Marsz w miejscu / truchtem", detail: "3–5 min", description: "Swobodne tempo, ramiona aktywne." },
        { name: "Krążenia ramion", detail: "2 × 10 pow. w każdą stronę", description: "Zwiększaj zakres z każdym powtórzeniem." },
        { name: "Jumping jacks", detail: "2 × 15 pow.", description: "Utrzymaj rytmiczne tempo." },
      ],
    },
    {
      phase: "Activate",
      label: "Aktywacja mięśni",
      goal: "Obudź mięśnie stabilizujące górną część ciała.",
      items: [
        { name: "Rotacje zewnętrzne z gumą", detail: "2 × 12 pow.", description: "Łokieć przy boku, kontrolowany ruch." },
        { name: "Ściąganie łopatek z gumą (band pull-apart)", detail: "2 × 15 pow.", description: "Pełen zakres ruchu, łopatki ściągaj aktywnie." },
        { name: "Pompki ścienne", detail: "2 × 10 pow.", description: "Utrzymaj napięcie brzucha przez cały ruch." },
      ],
    },
    {
      phase: "Mobilize",
      label: "Mobilizacja stawów",
      goal: "Przygotuj stawy barkowe, piersiowe i kręgosłup do pracy.",
      items: [
        { name: "Rozciąganie klatki piersiowej przy ścianie", detail: "2 × 30 s każda strona", description: "Biodra stabilne, rozciągaj powoli." },
        { name: "Skręty tułowia w siadzie lub staniu", detail: "10 pow. w każdą stronę", description: "Ramiona prostopadłe, oddech rytmiczny." },
        { name: "Krążenia nadgarstków i łokci", detail: "10 pow. w każdą stronę", description: "Małe i duże koła." },
      ],
    },
    {
      phase: "Potentiate",
      label: "Potencjacja",
      goal: "Przygotuj układ nerwowy do wysiłku treningowego.",
      items: [
        { name: "Pompki (tempo 2-1-1)", detail: "2 × 8 pow.", description: "Opuść w 2 s, 1 s pauza na dole, szybkie wyjście." },
        { name: "Face pull z gumą", detail: "2 × 12 pow.", description: "Przyciągaj ku twarzy, łokcie wysoko." },
      ],
    },
  ],

  lower: [
    {
      phase: "Raise",
      label: "Rozgrzanie ogólne",
      goal: "Podnieś tętno i temperaturę ciała.",
      items: [
        { name: "Marsz w miejscu lub rowerek stacjonarny", detail: "3–5 min", description: "Stopniowo zwiększaj tempo." },
        { name: "Krążenia bioder", detail: "2 × 10 pow. w każdą stronę", description: "Duże koła, bez pośpiechu." },
        { name: "Skoki na skakance lub jumping jacks", detail: "2 × 15 pow.", description: "Lekkie lądowanie na przodostopiu." },
      ],
    },
    {
      phase: "Activate",
      label: "Aktywacja mięśni",
      goal: "Obudź pośladki i mięśnie stabilizujące miednicę.",
      items: [
        { name: "Glute bridge", detail: "2 × 12 pow.", description: "Pełen zakres, ściśnij pośladki na górze." },
        { name: "Clamshell z gumą", detail: "2 × 12 pow. każda strona", description: "Biodra nieruchome, ruch tylko w stawie biodrowym." },
        { name: "Standing hip abduction z gumą", detail: "2 × 12 pow. każda strona", description: "Postawa wyprostowana, guma nad kolanami." },
      ],
    },
    {
      phase: "Mobilize",
      label: "Mobilizacja stawów",
      goal: "Przygotuj biodra, kolana i stawy skokowe do pracy.",
      items: [
        { name: "Hip flexor stretch (nisko)", detail: "2 × 30 s każda strona", description: "Kolano tylne przy podłodze, biodra do przodu." },
        { name: "Rozciąganie przywodzicieli (lateral squat stretch)", detail: "2 × 10 pow.", description: "Kolano w osi stopy, bez odrywania pięty." },
        { name: "Krążenia w stawie skokowym", detail: "10 pow. w każdą stronę", description: "Powolne, pełne koła." },
      ],
    },
    {
      phase: "Potentiate",
      label: "Potencjacja",
      goal: "Przygotuj układ nerwowy i mięśnie do dużych obciążeń.",
      items: [
        { name: "Przysiad z własnym ciężarem (tempo 3-1-1)", detail: "2 × 10 pow.", description: "3 s zjazd, 1 s pauza w dole, dynamiczne wyjście." },
        { name: "Wykrok w miejscu", detail: "2 × 8 pow. każda noga", description: "Kolano przedniej nogi nad kostką, stabilny tułów." },
      ],
    },
  ],

  full: [
    {
      phase: "Raise",
      label: "Rozgrzanie ogólne",
      goal: "Podnieś tętno i temperaturę całego ciała.",
      items: [
        { name: "Marsz w miejscu lub trucht", detail: "3–5 min", description: "Stopniowo zwiększaj intensywność." },
        { name: "Jumping jacks", detail: "2 × 20 pow.", description: "Ramiona i nogi pracują rytmicznie." },
        { name: "Krążenia ramion i bioder", detail: "10 pow. w każdą stronę", description: "Naprzemiennie ramiona i biodra." },
      ],
    },
    {
      phase: "Activate",
      label: "Aktywacja mięśni",
      goal: "Obudź kluczowe grupy mięśniowe całego ciała.",
      items: [
        { name: "Glute bridge", detail: "2 × 10 pow.", description: "Pełen zakres, pośladki ściskaj na górze." },
        { name: "Rotacje ramion z gumą lub bez", detail: "2 × 10 pow.", description: "Małe i duże koła, obie strony." },
        { name: "Dead bug", detail: "2 × 8 pow. każda strona", description: "Plecy płasko na podłodze, kontrolowany ruch." },
      ],
    },
    {
      phase: "Mobilize",
      label: "Mobilizacja stawów",
      goal: "Przygotuj cały łańcuch kinetyczny do pracy.",
      items: [
        { name: "Skręty tułowia (thoracic rotations)", detail: "10 pow. w każdą stronę", description: "Biodra i nogi spokojne, ruch w odcinku piersiowym." },
        { name: "Hip flexor stretch", detail: "20 s każda strona", description: "Biodra do przodu, tułów wyprostowany." },
        { name: "Rozciąganie łydek", detail: "2 × 20 s każda strona", description: "Noga wyprostowana, pięta na ziemi." },
      ],
    },
    {
      phase: "Potentiate",
      label: "Potencjacja",
      goal: "Gotowość układu nerwowego do treningowego obciążenia.",
      items: [
        { name: "Przysiad z własnym ciężarem", detail: "2 × 8 pow.", description: "Kontrolowane tempo, pełen zakres." },
        { name: "Pompki", detail: "2 × 8 pow.", description: "Ciało w jednej linii, kontrolowane zejście." },
      ],
    },
  ],
};

export function getRampWarmup(dayType: DayType): RampBlock[] {
  return TEMPLATES[dayType];
}
