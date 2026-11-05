/** Regulamin (flaga TERMS_ENABLED): akceptacja z wersją i datą; eksport danych użytkownika („Pobierz moje dane”, §14) z limitem i śladem. */
import { and, eq, gte, inArray, sql, desc } from "drizzle-orm";
import { REGULAMIN_VERSION } from "@workspace/survey-config";
import { db, termsAcceptancesTable, dataExportsTable, clientsTable, trainersTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable,
  workoutSessionsTable, setLogsTable, painReportsTable, dailyStepsTable, clientAchievementsTable, clientPausesTable, exercisesTable, planTemplatesTable } from "@workspace/db";

export const termsEnabled = (): boolean => process.env["TERMS_ENABLED"] === "1";
export const CURRENT_TERMS_VERSION = REGULAMIN_VERSION;
export const EXPORT_LIMIT_PER_DAY = 3;

export async function termsState(clerkUserId: string) {
  const rows = await db.select().from(termsAcceptancesTable).where(eq(termsAcceptancesTable.clerkUserId, clerkUserId)).orderBy(desc(termsAcceptancesTable.acceptedAt));
  const current = rows.find((r) => r.version === CURRENT_TERMS_VERSION);
  return { version: CURRENT_TERMS_VERSION, accepted: !!current, acceptedAt: current?.acceptedAt ?? null, previousVersion: current ? null : (rows[0]?.version ?? null) };
}
export async function acceptTerms(clerkUserId: string, version: string): Promise<boolean> {
  if (version !== CURRENT_TERMS_VERSION) return false;
  await db.insert(termsAcceptancesTable).values({ clerkUserId, version }).onConflictDoNothing();
  return true;
}

export async function exportsLast24h(clerkUserId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(dataExportsTable).where(and(eq(dataExportsTable.clerkUserId, clerkUserId), gte(dataExportsTable.createdAt, since)));
  return r?.n ?? 0;
}

/** Dane konta w JSON. Podopieczny/Solo: profil, wywiady, plany, treningi, serie, zgłoszenia bólu, kroki, osiągnięcia, przerwy. Trener: własny profil, własne ćwiczenia i szablony (dane podopiecznych NIE są w eksporcie trenera — to ich dane). */
export async function buildExport(clerkUserId: string): Promise<{ role: "podopieczny" | "solo" | "trener"; data: Record<string, unknown> } | null> {
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerkUserId));
  if (c) {
    const surveys = await db.select().from(surveysTable).where(eq(surveysTable.clientId, c.id));
    const plans = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c.id));
    const planIds = plans.map((p) => p.id);
    const days = planIds.length ? await db.select().from(workoutPlanDaysTable).where(inArray(workoutPlanDaysTable.planId, planIds)) : [];
    const dayIds = days.map((d) => d.id);
    const pex = dayIds.length ? await db.select({ pe: workoutPlanExercisesTable, name: exercisesTable.name }).from(workoutPlanExercisesTable)
      .leftJoin(exercisesTable, eq(exercisesTable.id, workoutPlanExercisesTable.exerciseId)).where(inArray(workoutPlanExercisesTable.dayId, dayIds)) : [];
    const sessions = await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.clientId, c.id));
    const sessionIds = sessions.map((s) => s.id);
    const sets = sessionIds.length ? await db.select().from(setLogsTable).where(inArray(setLogsTable.sessionId, sessionIds)) : [];
    const pain = await db.select().from(painReportsTable).where(eq(painReportsTable.clientId, c.id));
    const steps = await db.select().from(dailyStepsTable).where(eq(dailyStepsTable.clientId, c.id));
    const ach = await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, c.id));
    const pauses = await db.select().from(clientPausesTable).where(eq(clientPausesTable.clientId, c.id));
    return {
      role: c.trainerId == null ? "solo" : "podopieczny",
      data: {
        profil: c, wywiady: surveys,
        plany: plans.map((p) => ({ ...p, dni: days.filter((d) => d.planId === p.id).map((d) => ({ ...d, cwiczenia: pex.filter((x) => x.pe.dayId === d.id).map((x) => ({ ...x.pe, nazwaCwiczenia: x.name })) })) })),
        treningi: sessions.map((s) => ({ ...s, serie: sets.filter((x) => x.sessionId === s.id) })),
        zgloszeniaBolu: pain, kroki: steps, osiagniecia: ach, przerwy: pauses,
      },
    };
  }
  const [t] = await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, clerkUserId));
  if (t) {
    const own = await db.select().from(exercisesTable).where(eq(exercisesTable.createdByTrainerId, t.id));
    const templates = await db.select().from(planTemplatesTable).where(eq(planTemplatesTable.trainerId, t.id));
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.trainerId, t.id));
    return { role: "trener", data: { profil: t, wlasneCwiczenia: own, szablonyPlanow: templates, liczbaPodopiecznych: n?.n ?? 0,
      uwaga: "Dane podopiecznych nie są częścią tego pliku — należą do nich. Każdy podopieczny pobiera własne dane w aplikacji." } };
  }
  return null;
}
export async function logExport(clerkUserId: string, role: string): Promise<void> {
  await db.insert(dataExportsTable).values({ clerkUserId, role });
}
