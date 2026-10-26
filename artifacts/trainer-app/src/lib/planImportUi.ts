/** Helpers for the plan import screen (block 9): reading a file as base64, the import steps' types and the payload builder. */
export const FIELD_KEYS = ["day", "exercise", "sets", "reps", "load", "rir", "note"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export const FIELD_LABELS: Record<FieldKey, string> = { day: "Dzień", exercise: "Ćwiczenie", sets: "Serie", reps: "Powtórzenia", load: "Ciężar", rir: "RIR", note: "Notatka" };
export type Mapping = Partial<Record<FieldKey, number>>;

export interface Candidate { exerciseId: number; name: string; score: number }
export interface AnalyzedRow {
  line: number; exerciseText: string; sets: number | null; repsMin: number | null; repsMax: number | null; repsText: string; loadText: string; rir: number | null; note: string;
  errors: string[]; match: Candidate | null; candidates: Candidate[]; jointWarning: string | null; equipmentProblem: string | null;
}
export interface AnalyzedDay { name: string; rows: AnalyzedRow[] }

/** The trainer's choice for one row: a catalogue exercise, the trainer's own exercise (new name) or skip. */
export type Choice = { kind: "exercise"; exerciseId: number } | { kind: "custom"; name: string } | { kind: "skip" };

export function defaultChoice(r: AnalyzedRow): Choice {
  if (r.errors.length > 0) return { kind: "skip" };
  return r.match ? { kind: "exercise", exerciseId: r.match.exerciseId } : { kind: "custom", name: r.exerciseText };
}

export function buildSavePayload(title: string, target: "plan" | "template", days: AnalyzedDay[], choices: Record<number, Choice>, acknowledge: boolean) {
  return {
    title, target, acknowledgeJointWarning: acknowledge,
    days: days.map((d) => ({
      dayName: d.name,
      exercises: d.rows.flatMap((r) => {
        const c = choices[r.line] ?? defaultChoice(r);
        if (c.kind === "skip") return [];
        return [{
          exerciseId: c.kind === "exercise" ? c.exerciseId : null, ...(c.kind === "custom" ? { customName: c.name.trim() || r.exerciseText } : {}),
          sets: r.sets ?? 3, repsMin: r.repsMin, repsMax: r.repsMax, repsText: r.repsText, loadText: r.loadText, rir: r.rir, note: r.note,
        }];
      }),
    })).filter((d) => d.exercises.length > 0),
  };
}

/** Rows whose chosen exercise loads a reported joint (the trainer must confirm) / does not fit the client's equipment (cannot be saved). */
export function rowWarnings(days: AnalyzedDay[], choices: Record<number, Choice>) {
  const joint: AnalyzedRow[] = [], equipment: AnalyzedRow[] = [];
  for (const d of days) for (const r of d.rows) {
    const c = choices[r.line] ?? defaultChoice(r);
    if (c.kind !== "exercise" || c.exerciseId !== r.match?.exerciseId) continue; // warnings are known only for the best match
    if (r.jointWarning) joint.push(r);
    if (r.equipmentProblem) equipment.push(r);
  }
  return { joint, equipment };
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    fr.readAsDataURL(file);
  });
}
