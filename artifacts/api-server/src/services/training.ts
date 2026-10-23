/**
 * Training rules for the client "Trening" flow (tor C): weight steps, default
 * rest, records, previous results. Pure functions — no DB access.
 */

// ─── Weight step by equipment ─────────────────────────────────────────────────

export interface WeightStep {
  /** kg added/removed by the − / + buttons; null when the load field is hidden. */
  stepKg: number | null;
  /** false = bodyweight exercise: load field hidden, "additional load" is optional. */
  showWeight: boolean;
}

const BODYWEIGHT_ONLY = new Set([
  "Masa własnego ciała", "Brak sprzętu", "Drążek", "Poręcze", "TRX", "Gumy oporowe", "Piłka", "Ławka",
]);

/**
 * barbell 2.5 kg; machine/cable 2.5 kg; dumbbell and kettlebell 1 kg;
 * bodyweight (no load equipment) — no weight field.
 * With several values the first match wins: Sztanga > Maszyna/Wyciąg > Hantle/Kettlebell.
 */
export function weightStepFor(equipment: readonly string[]): WeightStep {
  if (equipment.includes("Sztanga")) return { stepKg: 2.5, showWeight: true };
  if (equipment.includes("Maszyna") || equipment.includes("Wyciąg")) return { stepKg: 2.5, showWeight: true };
  if (equipment.includes("Hantle") || equipment.includes("Kettlebell")) return { stepKg: 1, showWeight: true };
  if (equipment.length === 0 || equipment.every((e) => BODYWEIGHT_ONLY.has(e))) return { stepKg: null, showWeight: false };
  return { stepKg: 2.5, showWeight: true };
}

// ─── Default rest ─────────────────────────────────────────────────────────────

export type ExerciseRole = "secondary" | "main" | "power";

/** main = compound (exercise_type "Złożone"), secondary = isolation; power = compound with <= 5 planned reps. */
export function exerciseRoleFor(exerciseType: string | null, plannedRepsMax: number | null): ExerciseRole {
  if (exerciseType === "Złożone") return plannedRepsMax != null && plannedRepsMax <= 5 ? "power" : "main";
  return "secondary";
}

export interface RestRange {
  minSeconds: number;
  maxSeconds: number | null; // null = a single value
  source: "trainer" | "default";
}

type RestRow = Record<ExerciseRole, [number, number] | null>;

const REST: Record<string, RestRow> = {
  "Brak aktywności fizycznej": { secondary: [60, 90], main: [60, 90], power: null },
  "Początkujący": { secondary: [60, 90], main: [90, 120], power: null },
  "Średniozaawansowany": { secondary: [60, 120], main: [120, 180], power: [180, 180] },
  "Zaawansowany": { secondary: [90, 120], main: [180, 240], power: [180, 300] },
};

/** Sessions of up to an hour: auxiliary at most 90 s, main 2 min, power at most 3 min. */
const SHORT_SESSION_CAP: Record<ExerciseRole, number> = { secondary: 90, main: 120, power: 180 };
export const SHORT_SESSION_MINUTES = 60;

/**
 * Rest shown to the client as information (no timer).
 * Precedence: the trainer's `rest_seconds` on the plan exercise > table by effective
 * level and role, capped for sessions <= 1 h. Power falls back to "main" where the table has no value.
 */
export function restFor(opts: {
  level: string | null;
  role: ExerciseRole;
  sessionMinutes: number | null;
  trainerRestSeconds: number | null;
}): RestRange {
  if (opts.trainerRestSeconds != null && opts.trainerRestSeconds > 0) {
    return { minSeconds: opts.trainerRestSeconds, maxSeconds: null, source: "trainer" };
  }
  const row = REST[opts.level ?? ""] ?? REST["Początkujący"]!;
  const role: ExerciseRole = row[opts.role] ? opts.role : "main";
  let [min, max] = row[role]!;
  if (opts.sessionMinutes != null && opts.sessionMinutes <= SHORT_SESSION_MINUTES) {
    const cap = SHORT_SESSION_CAP[role];
    max = Math.min(max, cap);
    min = Math.min(min, max);
  }
  return { minSeconds: min, maxSeconds: max === min ? null : max, source: "default" };
}

export function formatRest(r: RestRange): string {
  const f = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s < 120 && s % 30 !== 0 ? `${s} s` : s >= 60 ? `${(s / 60).toString().replace(".", ",")} min` : `${s} s`);
  if (r.maxSeconds == null) return `ok. ${f(r.minSeconds)}`;
  return `${f(r.minSeconds)}–${f(r.maxSeconds)}`;
}

// ─── Previous result and records ──────────────────────────────────────────────

export interface PerformedSet {
  weightKg: number | null;
  reps: number | null;
}

/**
 * Record rule: a set is a record when its weight is higher than the best weight
 * ever lifted for the same or a greater number of repetitions. The first time an
 * exercise is performed there is no baseline, so nothing is a record.
 * Returns the gain in kg (new weight − previous best) or null when not a record.
 */
export function recordGain(history: readonly PerformedSet[], set: PerformedSet): number | null {
  if (set.weightKg == null || set.reps == null || set.reps <= 0 || set.weightKg <= 0) return null;
  const comparable = history.filter((h) => h.weightKg != null && h.reps != null && h.reps >= set.reps!);
  const everLifted = history.some((h) => h.weightKg != null && h.reps != null);
  if (!everLifted) return null;
  const best = comparable.reduce((m, h) => Math.max(m, h.weightKg!), 0);
  return set.weightKg > best ? Math.round((set.weightKg - best) * 100) / 100 : null;
}

/**
 * Compact history for the phone (offline record check): per number of repetitions
 * only the heaviest weight is kept, which preserves recordGain() exactly.
 */
export function compactHistory(history: readonly PerformedSet[]): { weightKg: number; reps: number }[] {
  const byReps = new Map<number, number>();
  for (const h of history) {
    if (h.weightKg == null || h.reps == null || h.reps <= 0) continue;
    byReps.set(h.reps, Math.max(byReps.get(h.reps) ?? 0, h.weightKg));
  }
  return [...byReps.entries()].map(([reps, weightKg]) => ({ weightKg, reps })).sort((a, b) => a.reps - b.reps);
}

/** Best result of a list of sets: highest weight, ties broken by reps. */
export function bestSet(sets: readonly PerformedSet[]): PerformedSet | null {
  let best: PerformedSet | null = null;
  for (const s of sets) {
    if (s.weightKg == null || s.reps == null) continue;
    if (!best || s.weightKg > best.weightKg! || (s.weightKg === best.weightKg && s.reps > best.reps!)) best = s;
  }
  return best;
}

// ─── Day picking ──────────────────────────────────────────────────────────────

/** Next plan day after the last performed one (cyclic); the first day when nothing was done yet. */
export function nextDayIndex(dayIds: readonly number[], lastDoneDayId: number | null): number {
  if (dayIds.length === 0) return -1;
  const i = lastDoneDayId == null ? -1 : dayIds.indexOf(lastDoneDayId);
  return (i + 1) % dayIds.length;
}

export const PL_WEEKDAYS = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"] as const;

/** Monday 00:00 of the ISO week containing `d` (local). */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// ─── Pain ─────────────────────────────────────────────────────────────────────

export const PAIN_MESSAGE =
  "Przerwij to ćwiczenie. Pozostałe możesz robić, jeśli nie bolą. Przy silnym bólu skonsultuj się z lekarzem.";
