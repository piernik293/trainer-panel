/** Database side of the achievements (docs/OSIAGNIECIA.md): loads the history, runs the pure engine, stores new awards idempotently. */
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db, clientsTable, workoutSessionsTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, setLogsTable, painReportsTable,
  dailyStepsTable, clientAchievementsTable, clientPausesTable,
} from "@workspace/db";
import { computeAchievements, monthlyChallengeEnabled, pickCelebration, type AchSession, type AchSet, type Candidate } from "./achievements";
import { loadLadderRows } from "./ladderSelection";
import { todayWarsaw, shiftDate } from "./steps";

const warsawDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const num = (v: string | number | null) => (v == null ? null : Number(v));

export async function loadAchievementInput(clientId: number, today: string = todayWarsaw()) {
  const [client] = await db.select({ stepsGoal: clientsTable.stepsGoal }).from(clientsTable).where(eq(clientsTable.id, clientId));
  const rows = await db.select().from(workoutSessionsTable).where(and(
    eq(workoutSessionsTable.clientId, clientId),
    or(eq(workoutSessionsTable.status, "completed"), and(isNull(workoutSessionsTable.status), eq(workoutSessionsTable.isCompleted, true))),
  )).orderBy(asc(workoutSessionsTable.id));

  const planIds = [...new Set(rows.map((r) => r.planId))];
  const dayCounts = planIds.length
    ? await db.select({ planId: workoutPlanDaysTable.planId, n: sql<number>`count(*)::int` }).from(workoutPlanDaysTable).where(inArray(workoutPlanDaysTable.planId, planIds)).groupBy(workoutPlanDaysTable.planId)
    : [];
  const daysOfPlan = new Map(dayCounts.map((d) => [d.planId, d.n]));

  // a pain reported on a calendar day (Warsaw) blocks awards of the sessions of that day
  const pains = await db.select({ createdAt: painReportsTable.createdAt }).from(painReportsTable).where(eq(painReportsTable.clientId, clientId));
  const painDays = new Set(pains.map((p) => warsawDay(p.createdAt)));
  const sessions: AchSession[] = rows.map((r) => ({
    id: r.id, date: String(r.sessionDate), order: (r.completedAt ?? r.createdAt).getTime(), planDays: daysOfPlan.get(r.planId) ?? 0,
    pain: r.hadPain === true || painDays.has(String(r.sessionDate)) || (r.completedAt != null && painDays.has(warsawDay(r.completedAt))),
  }));

  const sessionIds = rows.map((r) => r.id);
  const setRows = sessionIds.length
    ? await db.select({
        sessionId: setLogsTable.sessionId, exerciseId: setLogsTable.exerciseId, name: setLogsTable.exerciseNameSnapshot, setNumber: setLogsTable.setNumber,
        weightKg: setLogsTable.weightKg, reps: setLogsTable.reps, plannedSets: workoutPlanExercisesTable.workingSets,
      }).from(setLogsTable)
        .leftJoin(workoutPlanExercisesTable, eq(workoutPlanExercisesTable.id, setLogsTable.planExerciseId))
        .where(and(inArray(setLogsTable.sessionId, sessionIds), eq(setLogsTable.skipped, false)))
    : [];
  const sets: AchSet[] = setRows.map((r) => ({
    sessionId: r.sessionId, exerciseId: r.exerciseId, exerciseName: r.name ?? "Ćwiczenie", setNumber: r.setNumber,
    weightKg: num(r.weightKg), reps: r.reps, plannedSets: r.plannedSets ?? null,
  }));

  const pauses = (await db.select().from(clientPausesTable).where(eq(clientPausesTable.clientId, clientId))).map((p) => ({ start: String(p.startDate), end: String(p.endDate) }));

  // Ladders from the catalogue (docs/DRABINKI.md). The calisthenics ladders (feature/kalistenika) join here when that branch is merged.
  const ladder = (await loadLadderRows()).map((l) => ({ exerciseId: l.exerciseId, pattern: l.pattern, stepOrder: l.stepOrder }));

  const steps = (await db.select({ day: dailyStepsTable.day, steps: dailyStepsTable.steps }).from(dailyStepsTable)
    .where(and(eq(dailyStepsTable.clientId, clientId), gte(dailyStepsTable.day, shiftDate(today, -400))))).map((r) => ({ day: String(r.day), steps: r.steps }));

  const [active] = await db.select({ id: workoutPlansTable.id }).from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active"))).limit(1);
  let planDaysNow: number | null = null;
  if (active) {
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, active.id));
    planDaysNow = c?.n ?? null;
  }
  return { today, sessions, sets, pauses, ladder, stepsGoal: client?.stepsGoal ?? null, steps, planDaysNow, monthlyChallenge: monthlyChallengeEnabled() };
}

export type StoredAchievement = typeof clientAchievementsTable.$inferSelect;

/** Computes everything from the history and stores what is new (unique key: repeated runs and duplicated sessions create nothing twice). */
export async function evaluateAndStore(clientId: number, today: string = todayWarsaw()): Promise<{ earned: (StoredAchievement & { priority: number })[]; streakWeeks: number }> {
  const result = computeAchievements(await loadAchievementInput(clientId, today));
  const earned: (StoredAchievement & { priority: number })[] = [];
  for (const c of result.candidates) {
    const [row] = await db.insert(clientAchievementsTable).values({
      clientId, kind: c.kind, key: c.key, title: c.title, body: c.body, sessionId: c.sessionId, detail: c.detail,
    }).onConflictDoNothing().returning();
    if (row) earned.push({ ...row, priority: c.priority });
  }
  return { earned, streakWeeks: result.streakWeeks };
}

export { pickCelebration };
export type { Candidate };
