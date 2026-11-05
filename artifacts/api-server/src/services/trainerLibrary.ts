/** Biblioteka trenera (flaga TRAINER_LIBRARY_ENABLED): własne ćwiczenia, kompletność, zgoda na wspólną bibliotekę, propozycje dla administratora. */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, exercisesTable, trainersTable, exerciseProposalLogTable } from "@workspace/db";
import { computeCompleteness } from "../lib/exercise-completeness";
import { fetchMuscleStats } from "../lib/exercise-completeness";
import { libraryExtrasOk } from "./exerciseOwnership";

export const trainerLibraryEnabled = (): boolean => process.env["TRAINER_LIBRARY_ENABLED"] === "1";
export const LIBRARY_JOINTS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"] as const;
export const JOINT_LEVELS = ["Niskie", "Średnie", "Wysokie"] as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export async function ownExercises(trainerId: number) {
  const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.createdByTrainerId, trainerId)).orderBy(desc(exercisesTable.createdAt));
  const stats = await fetchMuscleStats(rows.map((r) => r.id));
  return rows.map((r) => {
    const c = computeCompleteness(r, stats.get(r.id));
    const missing = [...c.missingFields];
    if (!r.jointStress) missing.push("Poziom obciążenia stawów");
    if (r.jointStressAreas == null) missing.push("Obciążane stawy (może być „brak”)");
    return { id: r.id, name: r.name, isActive: r.isActive, complete: c.isComplete && libraryExtrasOk(r), missing,
      jointStress: r.jointStress, jointStressAreas: r.jointStressAreas, videoUrl: null as string | null,
      shareConsent: r.shareConsent, shareStatus: r.shareStatus, shareRejectReason: r.shareRejectReason };
  });
}

/** Podobne ćwiczenia w katalogu wspólnym: ta sama nazwa po normalizacji, nazwa zawierająca się w drugiej albo ten sam wzorzec i partia + wspólny człon nazwy. */
export async function similarInCatalogue(ex: { id: number; name: string; movementPattern: string | null; mainMuscleGroup: string | null }) {
  const cat = await db.select({ id: exercisesTable.id, name: exercisesTable.name, movementPattern: exercisesTable.movementPattern, mainMuscleGroup: exercisesTable.mainMuscleGroup })
    .from(exercisesTable).where(and(isNull(exercisesTable.createdByTrainerId), isNull(exercisesTable.createdByClientId)));
  const n = norm(ex.name); const words = new Set(n.split(" ").filter((w) => w.length > 3));
  return cat.filter((c) => {
    const cn = norm(c.name);
    if (cn === n || cn.includes(n) || n.includes(cn)) return true;
    const shared = cn.split(" ").filter((w) => words.has(w)).length;
    return shared >= 2 && c.movementPattern === ex.movementPattern && c.mainMuscleGroup === ex.mainMuscleGroup;
  }).slice(0, 5).map((c) => ({ id: c.id, name: c.name }));
}

export async function proposals() {
  const rows = await db.select({ ex: exercisesTable, trainerName: trainersTable.displayName, trainerEmail: trainersTable.email }).from(exercisesTable)
    .innerJoin(trainersTable, eq(trainersTable.id, exercisesTable.createdByTrainerId))
    .where(and(eq(exercisesTable.shareConsent, true), inArray(exercisesTable.shareStatus, ["proposed", "added", "rejected"]))).orderBy(desc(exercisesTable.shareConsentAt));
  const out = [];
  for (const r of rows) out.push({ id: r.ex.id, name: r.ex.name, description: r.ex.description, executionInstructions: r.ex.executionInstructions, coachingTips: r.ex.coachingTips,
    movementPattern: r.ex.movementPattern, mainMuscleGroup: r.ex.mainMuscleGroup, equipment: r.ex.equipment, difficultyLevel: r.ex.difficultyLevel, jointStress: r.ex.jointStress, jointStressAreas: r.ex.jointStressAreas,
    status: r.ex.shareStatus, consentAt: r.ex.shareConsentAt, rejectReason: r.ex.shareRejectReason, author: r.trainerName ?? r.trainerEmail ?? "Trener",
    similar: r.ex.shareStatus === "proposed" ? await similarInCatalogue(r.ex) : [] });
  return out;
}

export async function logRows(exerciseId?: number) {
  const q = db.select().from(exerciseProposalLogTable).orderBy(desc(exerciseProposalLogTable.createdAt)).limit(200);
  return exerciseId ? q.where(eq(exerciseProposalLogTable.exerciseId, exerciseId)) : q;
}
