/**
 * Metody intensyfikacji (docs/METODY.md) — czysta funkcja dobierająca metody do jednego dnia planu.
 * Włączana flagą METHODS_V2_ENABLED=1 (domyślnie wyłączona: wtedy generator niczego nie dodaje).
 *
 * Wspólne zasady: tylko poziom Ś/Z; tylko ćwiczenia zweryfikowane i nieunikane; dzień co najmniej 4 ćwiczenia;
 * razem najwyżej 2 ćwiczenia z metodą w dniu; sztanga nad głową, przysiad ze sztangą i martwy ciąg nigdy nie dostają metody;
 * pozycja po zmianie jest nadal tym samym ćwiczeniem (filtry bezpieczeństwa już zadziałały).
 */
import { METHOD_AUTO, methodTileOf, type MethodTile } from "@workspace/survey-config";

export type MethodKey = "superserie" | "serie_zlozone" | "drop_set" | "rest_pause" | "upadek";
export const methodsV2Enabled = (env: NodeJS.ProcessEnv = process.env) => env.METHODS_V2_ENABLED === "1";

export interface MethodExercise {
  id: number; name: string; mainMuscleGroup?: string | null; exerciseType?: string | null; exercisePriority?: string | null;
  equipment?: readonly string[] | null; verified?: boolean; avoided?: boolean;
}
export interface MethodCtx {
  level: string | null | undefined; goal: string | null | undefined; solo: boolean;
  /** Kafelki z wywiadu (etykiety); pusta lista = brak odpowiedzi = bez metod */
  choices: readonly string[];
  /** Ile dni tygodnia ma już daną metodę (dla limitów tygodniowych) */
  weekDays?: Partial<Record<MethodKey, number>>;
  /** „Metody do unikania” z wywiadu (etykiety lub starsze nazwy): te metody nigdy nie są stosowane */
  avoid?: readonly string[];
  /** Deklarowany czas treningu z wywiadu (np. „30–45 min”) */
  sessionDuration?: string | null;
}
export interface MethodAssignment { exerciseId: number; method: MethodKey; group: number | null; note: string }

export const METHOD_NOTES: Record<MethodKey, string> = {
  superserie: "Dwa ćwiczenia pod rząd, bez przerwy — krótszy trening, a każda partia odpoczywa, gdy druga pracuje.",
  serie_zlozone: "Dwa ćwiczenia na tę samą partię jedno po drugim — mocniejszy bodziec, więc ciężar dobierz o 10% niższy.",
  drop_set: "Ostatnia seria: gdy skończysz, zmniejsz ciężar o około jedną czwartą i zrób jeszcze jedną. Technika bez zmian.",
  rest_pause: "Ostatnia seria: dojdź blisko końca, odpocznij 15–20 sekund i dobij jeszcze kilka powtórzeń.",
  upadek: "Ostatnia seria na maszynie: rób powtórzenia, aż technika zacznie się pogarszać — wtedy skończ.",
};

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const has = (e: MethodExercise, ...g: string[]) => (e.equipment ?? []).some((x) => g.map(lc).includes(lc(x)));
const isIso = (e: MethodExercise) => lc(e.exerciseType) === "izolowane";
const NEVER = /martwy ciąg|przysiad ze sztang|sztang\w* (nad głow|żołnierski)|wyciskanie (żołnierskie|sztangi nad)/i;
const eligible = (e: MethodExercise) => e.verified !== false && !e.avoided && !NEVER.test(e.name) && !(has(e, "Sztanga") && /nad głow/i.test(e.name));
const heavyCompound = (e: MethodExercise) => !isIso(e) && (e.exercisePriority === "Bardzo wysoki");
const machineLike = (e: MethodExercise) => has(e, "Maszyna", "Wyciąg");
const dropFriendly = (e: MethodExercise) => isIso(e) && has(e, "Maszyna", "Wyciąg", "Hantle") && !has(e, "Sztanga");

const ANTAGONISTS: Array<[string, string]> = [["biceps", "triceps"], ["klatka piersiowa", "plecy"]];
const ARM_SHOULDER = new Set(["biceps", "triceps", "barki"]);

/** Czas krótszy niż ok. 45 min („30–45 min”, „do 45 min”). */
export function isShortSession(text: string | null | undefined): boolean {
  const nums = (text ?? "").match(/\d+/g)?.map(Number) ?? [];
  return nums.length > 0 && Math.max(...nums) <= 45;
}

function pickPair(day: readonly MethodExercise[], used: Set<number>, same: boolean, armsOnly: boolean, accessoryOnly = false): [MethodExercise, MethodExercise] | null {
  const pool = day.filter((e) => eligible(e) && !used.has(e.id));
  if (same) {
    for (const a of pool) {
      const b = pool.find((x) => x.id !== a.id && lc(x.mainMuscleGroup) === lc(a.mainMuscleGroup) && isIso(x) && !isIso(a) && !heavyCompound(a));
      if (b) return [a, b];
    }
    return null;
  }
  for (const [g1, g2] of ANTAGONISTS) {
    if (armsOnly && !(ARM_SHOULDER.has(g1) && ARM_SHOULDER.has(g2))) continue;
    const a = pool.find((e) => lc(e.mainMuscleGroup) === g1 && !heavyCompound(e));
    const b = pool.find((e) => lc(e.mainMuscleGroup) === g2 && !heavyCompound(e));
    if (a && b && (accessoryOnly ? isIso(a) && isIso(b) : isIso(a) || isIso(b))) return [a, b];
  }
  return null;
}

/** Które metody (z limitami na dzień) wolno zastosować: z kafelków klienta albo z reguł „Dobierz za mnie”. */
type Planned = Array<{ method: MethodKey; perDay: number; armsOnly?: boolean; accessoryOnly?: boolean; weekDaysMax: number }>;
export function plannedMethods(ctx: MethodCtx): Planned {
  const avoided = new Set((ctx.avoid ?? []).map(methodTileOf).filter((t): t is MethodTile => t != null));
  const tileOfMethod: Record<MethodKey, MethodTile> = { superserie: "Superserie", serie_zlozone: "Serie złożone", drop_set: "Drop sety", rest_pause: "Rest-pause", upadek: "Serie do upadku mięśniowego" };
  return plannedAll(ctx).filter((o) => !avoided.has(tileOfMethod[o.method]));
}

function plannedAll(ctx: MethodCtx): Planned {
  const level = ctx.level; const z = level === "Zaawansowany";
  if (level !== "Średniozaawansowany" && !z) return [];
  const tiles = ctx.choices.map(methodTileOf).filter((t): t is MethodTile => t != null);
  if (tiles.length === 0) return [];
  const out: Planned = [];
  const add = (method: MethodKey, perDay: number, weekDaysMax: number, armsOnly = false, accessoryOnly = false) => { if (!out.some((o) => o.method === method)) out.push({ method, perDay, armsOnly, accessoryOnly, weekDaysMax }); };
  if (tiles.includes(METHOD_AUTO)) {
    const goal = ctx.goal ?? "";
    if (goal === "Budowa sylwetki") {
      add("superserie", z ? 2 : 1, 2, !z);
      add("drop_set", z ? 2 : 1, 2);
      if (z && !ctx.solo) add("rest_pause", 1, 1);
    } else if (goal === "Redukcja tkanki tłuszczowej") add("superserie", z ? 2 : 1, 2);
    else if (goal === "Zwiększenie siły" && isShortSession(ctx.sessionDuration)) add("superserie", 1, 2, false, true); // Siła: bez metod, wyjątek — krótki czas, tylko ćwiczenia dodatkowe
    return out;
  }
  if (tiles.includes("Superserie")) add("superserie", z ? 2 : 1, 2);
  if (tiles.includes("Drop sety")) add("drop_set", z ? 2 : 1, 7);
  if (!ctx.solo) {
    if (tiles.includes("Serie złożone")) add("serie_zlozone", 1, 1);
    if (tiles.includes("Rest-pause") && z) add("rest_pause", 1, 1);
    if (tiles.includes("Serie do upadku mięśniowego")) add("upadek", z ? 2 : 1, 7);
  }
  return out;
}

export function chooseMethods(day: readonly MethodExercise[], ctx: MethodCtx): MethodAssignment[] {
  if (day.length < 4) return [];
  const plan = plannedMethods(ctx);
  if (plan.length === 0) return [];
  const used = new Set<number>(); const out: MethodAssignment[] = []; let group = 1;
  const room = () => 2 - out.length;
  for (const p of plan) {
    if ((ctx.weekDays?.[p.method] ?? 0) >= p.weekDaysMax) continue;
    if (p.method === "superserie" || p.method === "serie_zlozone") {
      let pairs = 0;
      while (pairs < Math.max(1, Math.floor(p.perDay / 1)) && room() >= 2 && pairs < (p.method === "superserie" ? (ctx.level === "Zaawansowany" ? 2 : 1) : 1)) {
        const pair = pickPair(day, used, p.method === "serie_zlozone", !!p.armsOnly, !!p.accessoryOnly);
        if (!pair) break;
        for (const e of pair) { used.add(e.id); out.push({ exerciseId: e.id, method: p.method, group, note: METHOD_NOTES[p.method] }); }
        group++; pairs++;
      }
    } else {
      const pool = [...day].reverse().filter((e) => eligible(e) && !used.has(e.id) && (p.method === "drop_set" || p.method === "rest_pause" ? dropFriendly(e) && (p.method === "drop_set" || machineLike(e)) : isIso(e) && machineLike(e)));
      let n = 0;
      for (const e of pool) {
        if (n >= p.perDay || room() <= 0) break;
        used.add(e.id); out.push({ exerciseId: e.id, method: p.method, group: null, note: METHOD_NOTES[p.method] }); n++;
      }
    }
  }
  return out;
}

/** Kolejność dnia: ćwiczenia pary stoją obok siebie (para w miejscu pierwszego ćwiczenia). */
export function orderForMethods<T extends { id: number }>(items: readonly T[], assignments: readonly MethodAssignment[]): T[] {
  const groupOf = new Map(assignments.filter((a) => a.group != null).map((a) => [a.exerciseId, a.group!]));
  const out: T[] = []; const placed = new Set<number>();
  for (const it of items) {
    if (placed.has(it.id)) continue;
    out.push(it); placed.add(it.id);
    const g = groupOf.get(it.id);
    if (g != null) for (const o of items) if (!placed.has(o.id) && groupOf.get(o.id) === g) { out.push(o); placed.add(o.id); }
  }
  return out;
}

/** Serie liczone do objętości: drop set i rest-pause dodają 1 efektywną serię na ćwiczenie; pozostałe metody bez zmian. */
export function volumeSets(workingSets: number, method: string | null | undefined): number {
  return workingSets + (method === "drop_set" || method === "rest_pause" ? 1 : 0);
}

/** Metody, w których dwa ćwiczenia idą parami (jedno po drugim). */
export const isPairMethod = (m: string | null | undefined) => m === "superserie" || m === "serie_zlozone";
