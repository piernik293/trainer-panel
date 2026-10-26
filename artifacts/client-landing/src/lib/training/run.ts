/**
 * State of one training run on the phone, kept in localStorage so a reload (or no network) loses nothing.
 * The server copy is built from the offline queue (see queue.ts).
 */
import type { LoggedSet } from "./logic";
import type { Rating, TrainingDay } from "./types";

/** "warmup" / "cooldown" exist only in runs saved before warm-up and cool-down became separate (see ramp.ts); they load as "exercises" / "finish". */
export type Stage = "warmup" | "exercises" | "cooldown" | "finish" | "done";

export interface RunState {
  v: 1;
  planDayId: number;
  sessionUuid: string;
  startedAt: string;
  stage: Stage;
  warmupIndex: number;
  exerciseIndex: number;
  cooldownIndex: number;
  /** planExerciseId → setNumber → result */
  sets: Record<number, Record<number, LoggedSet>>;
  /** exercises dropped through "Coś boli?" */
  skippedExercises: number[];
  /** joints reported in "Coś boli?" during this workout (the cool-down avoids them) */
  painAreas?: string[];
  rating: Rating | null;
  note: string;
  endedAt: string | null;
}

export function newRun(day: TrainingDay, sessionUuid: string, now = new Date()): RunState {
  const sets: RunState["sets"] = {};
  for (const s of day.activeSession?.sets ?? []) {
    if (s.planExerciseId == null) continue;
    (sets[s.planExerciseId] ??= {})[s.setNumber] = { weightKg: s.weightKg, reps: s.reps, rir: s.rir, skipped: s.skipped };
  }
  return {
    v: 1, planDayId: day.planDayId, sessionUuid, startedAt: now.toISOString(), stage: "exercises",
    warmupIndex: 0, exerciseIndex: 0, cooldownIndex: 0, sets, skippedExercises: [], rating: null, note: "", endedAt: null, painAreas: [],
  };
}

export type RunAction =
  | { type: "stage"; stage: Stage }
  | { type: "saveSet"; planExerciseId: number; setNumber: number; value: LoggedSet }
  | { type: "goToExercise"; index: number }
  | { type: "nextExercise"; total: number }
  | { type: "prevExercise" }
  | { type: "skipExercise"; planExerciseId: number }
  | { type: "painArea"; area: string }
  | { type: "feedback"; rating: Rating | null; note: string }
  | { type: "end"; at: string };

export function runReducer(s: RunState, a: RunAction): RunState {
  switch (a.type) {
    case "stage": return { ...s, stage: a.stage };
    case "saveSet":
      return { ...s, sets: { ...s.sets, [a.planExerciseId]: { ...(s.sets[a.planExerciseId] ?? {}), [a.setNumber]: a.value } } };
    case "goToExercise": return { ...s, stage: "exercises", exerciseIndex: Math.max(0, a.index) };
    case "nextExercise":
      return s.exerciseIndex + 1 >= a.total ? { ...s, stage: "finish" } : { ...s, exerciseIndex: s.exerciseIndex + 1 };
    case "prevExercise": return { ...s, exerciseIndex: Math.max(0, s.exerciseIndex - 1) };
    case "skipExercise":
      return s.skippedExercises.includes(a.planExerciseId) ? s : { ...s, skippedExercises: [...s.skippedExercises, a.planExerciseId] };
    case "painArea":
      return (s.painAreas ?? []).includes(a.area) ? s : { ...s, painAreas: [...(s.painAreas ?? []), a.area] };
    case "feedback": return { ...s, rating: a.rating, note: a.note };
    case "end": return { ...s, stage: "done", endedAt: a.at };
  }
}

/** First set (1-based) of the exercise without a saved result; sets + 1 when all are done. */
export function activeSetNumber(sets: Record<number, LoggedSet> | undefined, total: number): number {
  for (let n = 1; n <= total; n++) if (!sets?.[n]) return n;
  return total + 1;
}

export function countDoneSets(run: Pick<RunState, "sets">): number {
  return Object.values(run.sets).reduce((n, byNo) => n + Object.values(byNo).filter((x) => !x.skipped).length, 0);
}

const key = (planDayId: number) => `optimatren-trening:v1:${planDayId}`;
export function loadRun(planDayId: number, storage: Pick<Storage, "getItem"> = safeStorage()): RunState | null {
  try {
    const raw = storage.getItem(key(planDayId));
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (r?.v !== 1 || r.planDayId !== planDayId) return null;
    return { ...r, stage: r.stage === "warmup" ? "exercises" : r.stage === "cooldown" ? "finish" : r.stage };
  } catch { return null; }
}
export function saveRun(run: RunState, storage: Pick<Storage, "setItem"> = safeStorage()): void {
  try { storage.setItem(key(run.planDayId), JSON.stringify(run)); } catch { /* storage unavailable — the run lasts for this page only */ }
}
export function clearRun(planDayId: number, storage: Pick<Storage, "removeItem"> = safeStorage()): void {
  try { storage.removeItem(key(planDayId)); } catch { /* ignore */ }
}
function safeStorage(): Storage {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage; }
}
