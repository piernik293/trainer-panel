/**
 * Nazwy dni planu wg akcentu zamiast „Dzień 1”: „Drążek i poręcze”, „Nogi i skoki”, „Góra ciała”… oraz sprzęt, który
 * w danym dniu naprawdę jest użyty (nagłówek dnia nie wymienia sprzętu, którego dzień nie wymaga).
 */
export interface NamingExercise { name: string; mainMuscleGroup?: string | null; equipment?: readonly string[] | null; jump?: boolean }
export interface NamingDay { type?: string | null; exercises: readonly NamingExercise[] }

const NOT_GEAR = new Set(["masa własnego ciała", "brak sprzętu", "inny"]);
const LEG = new Set(["uda", "łydki", "pośladki", "nogi", "czworogłowe", "dwugłowe"]);
const PUSH = new Set(["klatka piersiowa", "barki", "triceps"]);
const PULL = new Set(["plecy", "biceps"]);
const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Sprzęt użyty w ćwiczeniach dnia (bez masy ciała), w kolejności pierwszego użycia. */
export function usedEquipment(exercises: readonly NamingExercise[]): string[] {
  const out: string[] = [];
  for (const e of exercises) for (const g of e.equipment ?? []) if (!NOT_GEAR.has(low(g)) && !out.includes(g)) out.push(g);
  return out;
}

/** Akcent jednego dnia. null = brak wyraźnego akcentu (wtedy numer dnia). */
export function dayAccent(day: NamingDay): string | null {
  const ex = day.exercises;
  if (ex.length === 0) return null;
  const gear = usedEquipment(ex).map(low);
  const hasBar = gear.includes("drążek"), hasRails = gear.includes("poręcze"), hasRings = gear.includes("kółka gimnastyczne");
  const groups = ex.map((e) => low(e.mainMuscleGroup)).filter(Boolean);
  const legs = groups.filter((g) => LEG.has(g)).length, push = groups.filter((g) => PUSH.has(g)).length, pull = groups.filter((g) => PULL.has(g)).length;
  const jumps = ex.some((e) => e.jump);
  const total = Math.max(1, groups.length);
  if (legs / total >= 0.5) return jumps ? "Nogi i skoki" : "Nogi";
  if (hasBar && hasRails) return "Drążek i poręcze";
  if (hasRings) return "Kółka i drążek";
  if (hasBar && pull >= push) return "Drążek i plecy";
  if (hasRails) return "Poręcze i pchanie";
  if (push > 0 && pull > 0) return "Góra ciała";
  if (push > 0) return "Pchanie";
  if (pull > 0) return "Przyciąganie";
  if (legs > 0 && push + pull > 0) return "Całe ciało";
  return null;
}

/** Nazwy dni całego planu: powtórzone akcenty dostają A/B…, dni bez akcentu — „Dzień N”. */
export function dayNames(days: readonly NamingDay[]): string[] {
  const base = days.map((d, i) => dayAccent(d) ?? `Dzień ${i + 1}`);
  const count = new Map<string, number>(); for (const n of base) count.set(n, (count.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return base.map((n) => {
    if ((count.get(n) ?? 0) < 2) return n;
    const k = seen.get(n) ?? 0; seen.set(n, k + 1);
    return `${n} ${String.fromCharCode(65 + k)}`;
  });
}
