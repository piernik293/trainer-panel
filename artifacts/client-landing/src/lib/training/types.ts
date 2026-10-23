export interface PrevSet { setNumber: number; weightKg: number | null; reps: number | null; rir: number | null }
export interface ExerciseInfo {
  planExerciseId: number;
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string[];
  sets: number;
  reps: string;
  repMin: number | null;
  repMax: number | null;
  rir: number | null;
  restText: string;
  weightStepKg: number | null;
  showWeight: boolean;
  howTo: string | null;
  note: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  previous: PrevSet[];
  record: { weightKg: number | null; reps: number | null } | null;
  /** heaviest weight per number of repetitions in earlier sessions (offline record check) */
  history: { weightKg: number; reps: number }[];
}
export interface RampItem { name: string; detail: string; description: string }
export interface TrainingDay {
  planDayId: number;
  weekday: string;
  position: { index: number; total: number };
  name: string;
  estimatedMinutes: number | null;
  exerciseCount: number;
  equipment: string[];
  trainerNote: string | null;
  exercises: ExerciseInfo[];
  warmup: RampItem[];
  /** estimated minutes of the short warm-up (about 7) */
  warmupMinutes?: number;
  cooldown: RampItem[];
  activeSession: { id: number; sets: { planExerciseId: number | null; setNumber: number; weightKg: number | null; reps: number | null; rir: number | null; skipped: boolean }[]; pain: { id: number; exerciseId: number | null }[] } | null;
}
export interface TodayResponse {
  client: { firstName: string };
  plan: { id: number; title: string };
  week: { done: number; target: number };
  lastSession: { id: number; completedAt: string | null; dayName: string | null } | null;
  today: TrainingDay | null;
  next: TrainingDay | null;
}
export const PAIN_AREAS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek", "Inne"] as const;
export type PainArea = (typeof PAIN_AREAS)[number];
export type Rating = "too_easy" | "just_right" | "too_hard";
export const RATING_LABELS: Record<Rating, string> = { too_easy: "Za lekko", just_right: "W sam raz", too_hard: "Za ciężko" };
