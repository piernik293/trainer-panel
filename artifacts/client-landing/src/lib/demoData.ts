/** Dane przykładowe trybu podglądu („Zobacz, jak to działa”) — wyłącznie w przeglądarce, nic nie trafia do bazy. */
import type { ExerciseInfo } from "@/lib/training/types";

const base = { muscleGroup: "", equipment: [] as string[], rir: 2, restText: "ok. 1,5 min", weightStepKg: null, showWeight: false, note: null, videoUrl: null, imageUrl: null, previous: [], record: null, history: [] };

export const DEMO_DAY = { name: "Całe ciało A", weekday: "Dziś", estimatedMinutes: 25 };

export const DEMO_EXERCISES: ExerciseInfo[] = [
  { ...base, planExerciseId: 1, exerciseId: 1, name: "Przysiad do skrzyni", muscleGroup: "Nogi", sets: 3, reps: "10–12", repMin: 10, repMax: 12,
    howTo: "Usiądź na skrzyni lub krześle i wstań. Plecy proste, kolana w kierunku palców." },
  { ...base, planExerciseId: 2, exerciseId: 2, name: "Pompki na podwyższeniu", muscleGroup: "Klatka", sets: 2, reps: "8–10", repMin: 8, repMax: 10,
    howTo: "Dłonie na ławce lub stole. Ciało w jednej linii, opuść klatkę do podwyższenia." },
  { ...base, planExerciseId: 3, exerciseId: 3, name: "Plank", muscleGroup: "Brzuch", sets: 2, reps: "20 s", repMin: null, repMax: null, timed: true, seconds: 20,
    howTo: "Oprzyj się na przedramionach i palcach stóp. Trzymaj ciało prosto przez cały czas." },
];
