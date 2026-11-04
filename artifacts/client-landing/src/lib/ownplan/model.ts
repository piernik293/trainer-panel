/** Model edytora własnego planu (Solo): czyste funkcje bez React, łatwe do testów. */
export interface EdExercise {
  /** numer ćwiczenia w planie (istniejące) — zachowywany przy zapisie */
  id?: number;
  exerciseId: number | null;
  customName?: string;
  /** ćwiczenie własne osoby (już zapisane w planie albo dopiero dodawane) */
  custom?: boolean;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  weightKg: number | null;
  rir: number | null;
  restSeconds: number | null;
  note: string;
  warning?: string | null;
}
export interface EdDay { id?: number; name: string; exercises: EdExercise[] }
export interface EdPlan { title: string; days: EdDay[] }

export const LIMITS = { days: 7, exercisesPerDay: 15 } as const;
export const emptyPlan = (): EdPlan => ({ title: "Mój plan", days: [{ name: "Dzień 1", exercises: [] }] });
export const newExercise = (src: { id?: number; name: string; warning?: string | null } | { customName: string }): EdExercise =>
  "customName" in src
    ? { exerciseId: null, customName: src.customName, custom: true, name: src.customName, sets: 3, repMin: 8, repMax: 12, weightKg: null, rir: null, restSeconds: null, note: "" }
    : { exerciseId: src.id!, name: src.name, sets: 3, repMin: 8, repMax: 12, weightKg: null, rir: null, restSeconds: null, note: "", warning: src.warning ?? null };

export function move<T>(arr: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return [...arr];
  const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x!); return a;
}

/** Odpowiedź serwera (GET /own-plan) → stan edytora. */
export function fromServer(p: { title: string; days: Array<{ id: number; name: string; exercises: Array<{ id: number; exerciseId: number; name: string; custom: boolean; sets: number; repMin: number; repMax: number; weightKg: number | null; rir: number | null; restSeconds: number | null; note: string | null }> }> } | null): EdPlan {
  if (!p) return emptyPlan();
  return { title: p.title, days: p.days.map((d) => ({ id: d.id, name: d.name, exercises: d.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, custom: e.custom, name: e.name, sets: e.sets, repMin: e.repMin, repMax: e.repMax, weightKg: e.weightKg, rir: e.rir, restSeconds: e.restSeconds, note: e.note ?? "" })) })) };
}

/** Stan edytora → ciało PUT /own-plan. Ćwiczenia istniejące zachowują `id`; własne (bez numeru w katalogu) idą jako `customName`. */
export function toPayload(p: EdPlan) {
  return {
    title: p.title.trim(),
    days: p.days.map((d) => ({
      ...(d.id ? { id: d.id } : {}), name: d.name.trim(),
      exercises: d.exercises.map((e) => ({
        ...(e.id ? { id: e.id } : {}),
        ...(e.customName && e.exerciseId == null ? { customName: e.customName } : { exerciseId: e.exerciseId }),
        sets: e.sets, repMin: e.repMin, ...(e.repMax !== e.repMin ? { repMax: e.repMax } : {}),
        weightKg: e.weightKg, rir: e.rir, restSeconds: e.restSeconds, note: e.note.trim() ? e.note.trim() : null,
      })),
    })),
  };
}

/** Zwraca komunikat o błędzie planu albo null, gdy można zapisać. */
export function validate(p: EdPlan): string | null {
  if (!p.title.trim()) return "Podaj nazwę planu.";
  if (p.days.length === 0) return "Dodaj co najmniej jeden dzień.";
  if (p.days.length > LIMITS.days) return `Najwyżej ${LIMITS.days} dni.`;
  for (const d of p.days) {
    if (!d.name.trim()) return "Każdy dzień potrzebuje nazwy.";
    if (d.exercises.length === 0) return `Dzień „${d.name.trim()}” nie ma ćwiczeń.`;
    if (d.exercises.length > LIMITS.exercisesPerDay) return `W dniu „${d.name.trim()}” najwyżej ${LIMITS.exercisesPerDay} ćwiczeń.`;
    for (const e of d.exercises) {
      if (e.sets < 1 || e.sets > 10) return `„${e.name}”: serie od 1 do 10.`;
      if (e.repMin < 1 || e.repMax < e.repMin || e.repMax > 100) return `„${e.name}”: sprawdź powtórzenia.`;
    }
  }
  return null;
}

export interface AnalyzedDay { name: string; rows: Array<{ exerciseText: string; sets: number | null; repsMin: number | null; repsMax: number | null; loadText: string; rir: number | null; note: string; match: { exerciseId: number; name: string; score: number } | null; jointWarning: string | null }> }
const WEIGHT = /^\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i;
/** Wynik analizy pliku → dni do edycji. Dopasowanie pewne (≥ 0,6) bierze ćwiczenie z katalogu, inaczej zostaje nazwa jako ćwiczenie własne. */
export function fromImport(days: readonly AnalyzedDay[]): EdDay[] {
  return days.slice(0, LIMITS.days).map((d, i) => ({
    name: d.name?.trim() || `Dzień ${i + 1}`,
    exercises: d.rows.slice(0, LIMITS.exercisesPerDay).map((r) => {
      const sure = r.match && r.match.score >= 0.6;
      const w = WEIGHT.exec(r.loadText ?? "");
      const repMin = r.repsMin ?? 8;
      const base = sure ? newExercise({ id: r.match!.exerciseId, name: r.match!.name, warning: r.jointWarning }) : newExercise({ customName: r.exerciseText.trim().slice(0, 120) || "Ćwiczenie" });
      return { ...base, sets: Math.min(10, Math.max(1, r.sets ?? 3)), repMin, repMax: Math.max(repMin, r.repsMax ?? repMin), weightKg: w ? Number(w[1]!.replace(",", ".")) : null, rir: r.rir != null ? Math.min(4, Math.max(0, r.rir)) : null, note: r.note ?? "" };
    }),
  }));
}
