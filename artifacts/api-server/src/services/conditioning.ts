/**
 * Moduł kondycyjny (blok 12) — czysta logika, bez bazy. Domyślnie WYŁĄCZONY przełącznikiem CONDITIONING_ENABLED.
 * Zasady z docs/KONDYCJA.md: bez sprzętu pomiarowego (RPE + test rozmowy), tydzień lżejszy co 4., wzrost nie większy niż ~15% tygodniowo,
 * brak aktywności i początkujący nigdy nie dostają interwałów (bezpieczniejsza z dwóch interpretacji tabeli — zob. docs/DO-DECYZJI.md).
 */

export const CONDITIONING_DISABLED_BODY = { error: "Nie znaleziono.", code: "CONDITIONING_DISABLED" } as const;

export function conditioningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.CONDITIONING_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export type ConditioningMethod = "marszobieg" | "bieg_ciagly" | "interwaly" | "tempo" | "fartlek";
export const METHODS: readonly ConditioningMethod[] = ["marszobieg", "bieg_ciagly", "interwaly", "tempo", "fartlek"];
export const METHOD_LABEL: Record<ConditioningMethod, string> = {
  marszobieg: "Marszobieg", bieg_ciagly: "Bieg ciągły (tempo rozmowy)", interwaly: "Interwały", tempo: "Tempo", fartlek: "Fartlek",
};

export type LevelRank = 0 | 1 | 2 | 3; // BA, P, Ś, Z
export function levelRank(level: string | null | undefined): LevelRank {
  if (level === "Zaawansowany") return 3;
  if (level === "Średniozaawansowany") return 2;
  if (level === "Początkujący") return 1;
  return 0; // także brak danych — najostrożniej
}

/** Metody dozwolone dla poziomu. BA/P: tylko marszobieg i bieg ciągły (P dopiero po bazie — bieg ciągły startuje od 9. tygodnia). */
export function allowedMethods(level: string | null | undefined): ConditioningMethod[] {
  const r = levelRank(level);
  if (r <= 1) return r === 0 ? ["marszobieg"] : ["marszobieg", "bieg_ciagly"];
  return [...METHODS];
}

export interface ConditioningTool {
  id: string; label: string; place: "Dom" | "Plener" | "Siłownia"; minLevel: LevelRank;
  methods: readonly ConditioningMethod[];
  /** stawy, które to narzędzie obciąża (nie wolno, gdy zgłoszony ból tego stawu) */
  loads: readonly string[];
}

const ALL: readonly ConditioningMethod[] = METHODS;
export const TOOLS: readonly ConditioningTool[] = [
  { id: "teren", label: "Bieg / marsz w terenie", place: "Plener", minLevel: 0, methods: ALL, loads: ["Kolano", "Biodro"] },
  { id: "bieznia", label: "Bieżnia", place: "Siłownia", minLevel: 0, methods: ALL, loads: ["Kolano", "Biodro"] },
  { id: "marsz_pod_gore", label: "Marsz pod górę / bieżnia z nachyleniem", place: "Siłownia", minLevel: 0, methods: ["bieg_ciagly", "tempo"], loads: ["Kolano"] },
  { id: "rower", label: "Rower (stacjonarny lub zwykły)", place: "Siłownia", minLevel: 0, methods: ["bieg_ciagly", "interwaly", "tempo", "fartlek"], loads: [] },
  { id: "orbitrek", label: "Orbitrek", place: "Siłownia", minLevel: 0, methods: ["bieg_ciagly", "interwaly", "tempo", "fartlek"], loads: [] },
  { id: "wioslarz", label: "Wioślarz", place: "Siłownia", minLevel: 1, methods: ["bieg_ciagly", "interwaly", "tempo", "fartlek"], loads: ["Plecy — dół", "Bark"] },
  { id: "skakanka", label: "Skakanka", place: "Dom", minLevel: 2, methods: ["interwaly"], loads: ["Kolano", "Biodro", "Plecy — dół"] },
  { id: "liny", label: "Liny (battle ropes)", place: "Siłownia", minLevel: 2, methods: ["interwaly"], loads: ["Bark", "Łokieć", "Nadgarstek"] },
  { id: "sanki", label: "Sanki / prowler", place: "Siłownia", minLevel: 2, methods: ["interwaly"], loads: ["Kolano", "Biodro", "Plecy — dół"] },
];

export function allowedTools(level: string | null | undefined, method: ConditioningMethod | null, blockedJoints: ReadonlySet<string>): ConditioningTool[] {
  const r = levelRank(level);
  return TOOLS.filter((t) =>
    t.minLevel <= r &&
    (method == null || t.methods.includes(method)) &&
    !t.loads.some((j) => blockedJoints.has(j)));
}

/** Narzędzie bezpieczne, gdy wybrane jest zablokowane: marsz (teren/bieżnia) tylko gdy kolano i biodro wolne, inaczej rower. */
export function substituteTool(toolId: string, level: string | null | undefined, method: ConditioningMethod, blocked: ReadonlySet<string>): ConditioningTool | null {
  const ok = allowedTools(level, method, blocked);
  const same = ok.find((t) => t.id === toolId);
  if (same) return same;
  return ok.find((t) => t.id === "rower") ?? ok.find((t) => t.id === "orbitrek") ?? ok[0] ?? null;
}

export interface ConditioningStep { kind: "marsz" | "trucht" | "odcinek" | "przerwa" | "ciagly"; minutes: number; rpe: [number, number] }
export interface ConditioningWeek {
  week: number; light: boolean; totalMinutes: number; sessionsPerWeek: number;
  /** powtarzany blok (np. marsz 2 min + trucht 1 min × 6) albo jeden ciągły odcinek */
  pattern: ConditioningStep[]; repeats: number;
  note: string;
}

export const RPE_SCALE: ReadonlyArray<{ rpe: number; label: string }> = [
  { rpe: 1, label: "bardzo lekko — prawie bez wysiłku" }, { rpe: 2, label: "lekko — spacer" }, { rpe: 3, label: "lekko — mówisz bez problemu" },
  { rpe: 4, label: "umiarkowanie — mówisz pełnymi zdaniami" }, { rpe: 5, label: "umiarkowanie — zdania, ale czujesz oddech" },
  { rpe: 6, label: "trochę ciężko — krótkie zdania" }, { rpe: 7, label: "ciężko — pojedyncze słowa" },
  { rpe: 8, label: "bardzo ciężko — trudno mówić" }, { rpe: 9, label: "prawie maksymalnie" }, { rpe: 10, label: "maksymalnie" },
];
export const TALK_TEST = "Test rozmowy: jeśli możesz mówić pełnymi zdaniami, tempo jest dobre. Jeśli tylko pojedyncze słowa — zwolnij i przejdź do marszu.";

const LIGHT_FACTOR = 0.7;
export const MAX_WEEKLY_INCREASE = 0.15;

// (marsz min, trucht min, powtórzenia) wg docs/KONDYCJA.md §3
const WALK_RUN_STAGES: ReadonlyArray<{ upto: number; walk: number; jog: number; reps: number }> = [
  { upto: 2, walk: 2, jog: 1, reps: 7 },
  { upto: 4, walk: 2, jog: 2, reps: 6 },
  { upto: 6, walk: 2, jog: 3, reps: 5 },
  { upto: 8, walk: 2, jog: 5, reps: 4 },
];

/** Tydzień „lżejszy”: co 4. (4, 8, 12 …). */
export const isLightWeek = (week: number): boolean => week > 0 && week % 4 === 0;

function round5(n: number): number { return Math.max(5, Math.round(n)); }

/** Szablon 8 tygodni marszobiegu. Tydzień 4 i 8 lżejszy (−30%); wzrost względem poprzedniego tygodnia nielekkiego ≤ 15%. */
export function walkRunWeek(week: number): ConditioningWeek {
  const w = Math.min(Math.max(1, Math.floor(week)), 8);
  const stage = WALK_RUN_STAGES.find((s) => w <= s.upto)!;
  const light = isLightWeek(w);
  // lżejszy tydzień: jedna seria mniej i krótszy trucht — około −30% czasu
  const reps = light ? Math.max(3, Math.round(stage.reps * LIGHT_FACTOR)) : stage.reps;
  const pattern: ConditioningStep[] = [
    { kind: "marsz", minutes: stage.walk, rpe: [2, 3] },
    { kind: "trucht", minutes: stage.jog, rpe: [4, 5] },
  ];
  const total = reps * (stage.walk + stage.jog);
  return {
    week: w, light, totalMinutes: total, sessionsPerWeek: 3, pattern, repeats: reps,
    note: light ? "Tydzień lżejszy — mniej powtórzeń, żeby ciało odpoczęło." : "Truchtaj tak, żeby móc mówić. Jeśli nie — zwolnij do marszu.",
  };
}

export function walkRunPlan(): ConditioningWeek[] { return Array.from({ length: 8 }, (_, i) => walkRunWeek(i + 1)); }

/** Najkrótsza pierwsza jednostka dla BA/P: 20–25 min, marsz 2 / trucht 1. */
export function firstSession(): ConditioningWeek { return walkRunWeek(1); }

/** Bieg ciągły w strefie rozmownej: start 15 min, +2 min co tydzień (≤15%), lżejszy tydzień co 4. */
export function continuousWeek(week: number, startMinutes = 15, capMinutes = 40): ConditioningWeek {
  const w = Math.max(1, Math.floor(week));
  let prev = startMinutes; let cur = startMinutes;
  for (let i = 2; i <= w; i++) {
    if (isLightWeek(i)) continue; // lżejszy nie zmienia bazy
    cur = Math.min(capMinutes, Math.min(prev + 2, Math.floor(prev * (1 + MAX_WEEKLY_INCREASE))));
    prev = cur;
  }
  const light = isLightWeek(w);
  const minutes = light ? round5(prev * LIGHT_FACTOR) : prev;
  return {
    week: w, light, totalMinutes: minutes, sessionsPerWeek: 2,
    pattern: [{ kind: "ciagly", minutes, rpe: [4, 5] }], repeats: 1,
    note: light ? "Tydzień lżejszy." : "Tempo rozmowy — pełne zdania.",
  };
}

/** Interwały (tylko Ś/Z): 6 × 1 min / 2 min lekko, +1 odcinek co tydzień do 10; lżejszy tydzień co 4. */
export function intervalWeek(week: number): ConditioningWeek {
  const w = Math.max(1, Math.floor(week));
  let reps = 6;
  for (let i = 2; i <= w; i++) if (!isLightWeek(i)) reps = Math.min(10, reps + 1);
  const light = isLightWeek(w);
  const r = light ? Math.max(4, Math.round(reps * LIGHT_FACTOR)) : reps;
  return {
    week: w, light, totalMinutes: r * 3, sessionsPerWeek: 1,
    pattern: [{ kind: "odcinek", minutes: 1, rpe: [7, 8] }, { kind: "przerwa", minutes: 2, rpe: [2, 3] }], repeats: r,
    note: light ? "Tydzień lżejszy." : "Odcinki mocno, przerwy marszem lub bardzo lekko.",
  };
}

export function buildWeek(method: ConditioningMethod, week: number): ConditioningWeek {
  switch (method) {
    case "marszobieg": return walkRunWeek(week);
    case "interwaly": return intervalWeek(week);
    default: return continuousWeek(week, method === "tempo" ? 10 : 15, method === "tempo" ? 30 : 40);
  }
}

export interface ConditioningPrescription {
  method: ConditioningMethod; methodLabel: string; tool: string | null; toolLabel: string | null;
  week: number; weekPlan: ConditioningWeek; rpeScale: typeof RPE_SCALE; talkTest: string; swapped: boolean;
}

export type PrescribeResult = { ok: true; value: ConditioningPrescription } | { ok: false; code: "METHOD_NOT_ALLOWED" | "NO_SAFE_TOOL"; error: string };

/** Walidacja i złożenie jednostki: metoda dla poziomu, narzędzie z filtrem bólu (zamiana na bezpieczne). */
export function prescribe(opts: { level: string | null | undefined; method: ConditioningMethod; toolId?: string | null; week: number; blockedJoints: ReadonlySet<string> }): PrescribeResult {
  if (!allowedMethods(opts.level).includes(opts.method)) {
    return { ok: false, code: "METHOD_NOT_ALLOWED", error: "Ta forma nie jest dostępna dla tego poziomu. Wybierz łagodniejszą." };
  }
  const wanted = opts.toolId ?? "teren";
  const tool = substituteTool(wanted, opts.level, opts.method, opts.blockedJoints);
  if (!tool) return { ok: false, code: "NO_SAFE_TOOL", error: "Brak bezpiecznego sprzętu dla tej formy przy zgłoszonym bólu. Dodaj spokojny spacer." };
  return {
    ok: true,
    value: {
      method: opts.method, methodLabel: METHOD_LABEL[opts.method], tool: tool.id, toolLabel: tool.label,
      week: opts.week, weekPlan: buildWeek(opts.method, opts.week), rpeScale: RPE_SCALE, talkTest: TALK_TEST, swapped: tool.id !== wanted,
    },
  };
}

/** Początek tygodnia (poniedziałek) dla daty YYYY-MM-DD. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Zgłoszenie bólu w dniu kondycyjnym: jednostka zamienia się na spokojny marsz (docs/KONDYCJA.md §3). */
export const PAIN_SWAP_NOTE = "Zgłoszono ból — zamiast biegu dziś spokojny marsz.";
