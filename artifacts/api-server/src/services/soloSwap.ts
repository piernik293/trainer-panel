/**
 * Solo: „Zamień na inne” — zamiana jednego ćwiczenia w planie, max 3 w ciągu 7 dni.
 * Zamiennik pochodzi z TEGO SAMEGO silnika co plan (generateDayHandler z regułami Solo i wszystkimi filtrami bezpieczeństwa),
 * wywołanego dla typu dnia z wykluczeniem wszystkich ćwiczeń planu. Wybieramy ćwiczenie tej samej partii (najchętniej tego
 * samego wzorca ruchu), które nie dubluje rodziny wzorca z reszty dnia.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, workoutPlanExercisesTable, workoutPlanDaysTable, workoutPlansTable, soloExerciseSwapsTable, exercisesTable } from "@workspace/db";
import { generateDayHandler, type GenerateDayReq } from "../routes/planDraftGenerateDay";
import { fakeRes } from "./soloPlanDriver";
import { exerciseFamily } from "./exerciseFamily";
import { parseRepsLabel } from "./soloPlanDriver";

export const SOLO_SWAPS_PER_WEEK = 3;
const WEEK_MS = 7 * 86_400_000;

export async function swapsUsed(clientId: number, now: Date = new Date()): Promise<{ used: number; limit: number; nextAt: Date | null }> {
  const since = new Date(now.getTime() - WEEK_MS);
  const rows = await db.select({ at: soloExerciseSwapsTable.createdAt }).from(soloExerciseSwapsTable)
    .where(and(eq(soloExerciseSwapsTable.clientId, clientId), gte(soloExerciseSwapsTable.createdAt, since))).orderBy(soloExerciseSwapsTable.createdAt);
  const used = rows.length;
  return { used, limit: SOLO_SWAPS_PER_WEEK, nextAt: used >= SOLO_SWAPS_PER_WEEK ? new Date(rows[used - SOLO_SWAPS_PER_WEEK]!.at.getTime() + WEEK_MS) : null };
}

export type SwapResult =
  | { ok: true; exercise: { id: number; name: string }; left: number; entry: { workingSets: number; repRangeMin: number | null; repRangeMax: number | null; restSeconds: number | null } }
  | { ok: false; status: number; code: "NOT_FOUND" | "SWAP_LIMIT" | "NO_ALTERNATIVE"; message: string };

type Cand = { id: number; name: string; mainMuscleGroup?: string | null; movementPattern?: string | null; prescription?: { sets: number; repsLabel: string; restSeconds: number } };

export async function swapExercise(clientId: number, planExerciseId: number, now: Date = new Date()): Promise<SwapResult> {
  const [row] = await db.select({ pe: workoutPlanExercisesTable, day: workoutPlanDaysTable, plan: workoutPlansTable })
    .from(workoutPlanExercisesTable)
    .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId))
    .innerJoin(workoutPlansTable, eq(workoutPlansTable.id, workoutPlanDaysTable.planId))
    .where(and(eq(workoutPlanExercisesTable.id, planExerciseId), eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")));
  if (!row || row.pe.exerciseId == null) return { ok: false, status: 404, code: "NOT_FOUND", message: "Nie znaleziono tego ćwiczenia w Twoim planie." };

  const quota = await swapsUsed(clientId, now);
  if (quota.used >= quota.limit) {
    const days = Math.max(1, Math.ceil(((quota.nextAt?.getTime() ?? now.getTime()) - now.getTime()) / 86_400_000));
    return { ok: false, status: 429, code: "SWAP_LIMIT", message: `Masz ${quota.limit} zamiany na tydzień. Kolejna będzie możliwa za ${days} ${days === 1 ? "dzień" : "dni"}.` };
  }

  // wszystkie ćwiczenia planu (nie wracamy do żadnego z nich) i ćwiczenia tego dnia
  const planRows = await db.select({ id: workoutPlanExercisesTable.id, exerciseId: workoutPlanExercisesTable.exerciseId, dayId: workoutPlanExercisesTable.dayId, name: exercisesTable.name })
    .from(workoutPlanExercisesTable)
    .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId))
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutPlanExercisesTable.exerciseId))
    .where(eq(workoutPlanDaysTable.planId, row.plan.id));
  // Nie wracamy też do ćwiczeń już zamienionych w tym planie (wypadły z planu, więc samo „jest w planie” ich nie wyklucza).
  const peIds = planRows.map((r) => r.id);
  const swappedAway = peIds.length
    ? await db.select({ id: soloExerciseSwapsTable.fromExerciseId }).from(soloExerciseSwapsTable).where(and(eq(soloExerciseSwapsTable.clientId, clientId), inArray(soloExerciseSwapsTable.planExerciseId, peIds)))
    : [];
  const inPlan = [...planRows.map((r) => r.exerciseId!), ...swappedAway.map((r) => r.id)].filter((x) => x != null);
  const [orig] = await db.select({ name: exercisesTable.name, mainMuscleGroup: exercisesTable.mainMuscleGroup, movementPattern: exercisesTable.movementPattern }).from(exercisesTable).where(eq(exercisesTable.id, row.pe.exerciseId));
  const restOfDay = planRows.filter((r) => r.dayId === row.day.id && r.id !== planExerciseId);
  const dayFamilies = new Set(restOfDay.map((r) => exerciseFamily(r.name)).filter((f): f is string => f != null));
  const type = (row.day.subtitle ?? "full_body").toLowerCase();

  let best: Cand | null = null; let fallback: Cand | null = null;
  for (let alt = 0; alt < 4 && !best; alt++) {
    const { res, out } = fakeRes();
    const req = {
      params: { clientId: String(clientId) }, soloClientId: clientId,
      body: { generationId: randomUUID(), generationDayIndex: 0, expectedDayCount: 1, v0SessionType: type, alternativeIndex: alt, weekUsedExerciseIds: inPlan, sameTypePreviousExercises: [], weekExercisesRaw: [] },
    } as unknown as GenerateDayReq;
    await generateDayHandler(req, res);
    if (out.status !== 200) continue;
    for (const c of (out.body?.exercises ?? []) as Cand[]) {
      if (inPlan.includes(c.id)) continue;
      const fam = exerciseFamily(c.name);
      if (fam && dayFamilies.has(fam)) continue;
      if ((c.mainMuscleGroup ?? "") !== (orig?.mainMuscleGroup ?? "")) continue;
      if (c.movementPattern && c.movementPattern === orig?.movementPattern) { best = c; break; }
      fallback ??= c;
    }
  }
  const pick = best ?? fallback;
  if (!pick) return { ok: false, status: 422, code: "NO_ALTERNATIVE", message: "Nie mamy teraz bezpiecznej zamiany dla tego ćwiczenia. Zostaje to, które masz w planie." };

  const reps = parseRepsLabel(pick.prescription?.repsLabel);
  await db.transaction(async (tx) => {
    await tx.update(workoutPlanExercisesTable).set({
      exerciseId: pick.id, workingSets: Math.max(1, pick.prescription?.sets ?? row.pe.workingSets), repType: "range", repRangeMin: reps.min, repRangeMax: reps.max,
      restSeconds: pick.prescription?.restSeconds ?? row.pe.restSeconds, method: null, methodGroup: null, methodNote: null,
    } as never).where(eq(workoutPlanExercisesTable.id, planExerciseId));
    await tx.insert(soloExerciseSwapsTable).values({ clientId, planExerciseId, fromExerciseId: row.pe.exerciseId!, toExerciseId: pick.id });
  });
  return { ok: true, exercise: { id: pick.id, name: pick.name }, left: quota.limit - quota.used - 1, entry: { workingSets: Math.max(1, pick.prescription?.sets ?? row.pe.workingSets), repRangeMin: reps.min, repRangeMax: reps.max, restSeconds: pick.prescription?.restSeconds ?? row.pe.restSeconds } };
}
