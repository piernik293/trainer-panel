/**
 * "Generuj od nowa" must not hand the client the same plan again (owner's decision 26.10.2026): the exercises of the client's most recent
 * plan (any status) are excluded first, and only put back when no other safe option exists for a slot.
 */
import { desc, eq, inArray } from "drizzle-orm";
import { db, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable } from "@workspace/db";

/** Exercise ids of the client's latest plan (empty when the client has none). */
export async function previousPlanExerciseIds(clientId: number): Promise<Set<number>> {
  const [plan] = await db
    .select({ id: workoutPlansTable.id })
    .from(workoutPlansTable)
    .where(eq(workoutPlansTable.clientId, clientId))
    .orderBy(desc(workoutPlansTable.createdAt), desc(workoutPlansTable.id))
    .limit(1);
  if (!plan) return new Set();
  const days = await db.select({ id: workoutPlanDaysTable.id }).from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan.id));
  if (days.length === 0) return new Set();
  const rows = await db
    .select({ exerciseId: workoutPlanExercisesTable.exerciseId })
    .from(workoutPlanExercisesTable)
    .where(inArray(workoutPlanExercisesTable.dayId, days.map((d) => d.id)));
  return new Set(rows.map((r) => r.exerciseId));
}

export interface EngineRunLike { valid: boolean; exercises: ReadonlyArray<{ id: number }> }

/**
 * Chooses between the run that excluded the previous plan and the baseline run (which may repeat exercises).
 * The excluded run wins when it is valid and loses no exercise compared to the baseline; otherwise the baseline is used and
 * the repeated exercises are counted for the trainer's summary.
 */
export function chooseFreshRun<T extends EngineRunLike>(
  fresh: T, baseline: T, previous: ReadonlySet<number>,
): { result: T; repeated: number; usedBaseline: boolean } {
  const freshOk = fresh.valid && fresh.exercises.length >= baseline.exercises.length;
  const result = freshOk ? fresh : baseline;
  return { result, repeated: result.exercises.filter((e) => previous.has(e.id)).length, usedBaseline: !freshOk };
}
