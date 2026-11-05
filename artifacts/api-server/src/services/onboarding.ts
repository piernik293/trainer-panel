/** Samouczek trenera (flaga ONBOARDING_ENABLED). Kroki wynikają z danych konta; klient przykładowy ma status „przyklad” i nie liczy się do limitów ani statystyk, nie dostaje maili (brak adresu). */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, onboardingStateTable, clientsTable, surveysTable, workoutPlansTable, surveyInvitesTable } from "@workspace/db";

export const onboardingEnabled = (): boolean => process.env["ONBOARDING_ENABLED"] === "1";
export const STEPS = [
  { id: "client", label: "Dodaj podopiecznego" },
  { id: "invite", label: "Wyślij link do wywiadu" },
  { id: "plan", label: "Ułóż plan generatorem" },
  { id: "activate", label: "Aktywuj i wyślij dostęp" },
] as const;

export async function ensureState(trainerId: number) {
  await db.insert(onboardingStateTable).values({ trainerId }).onConflictDoNothing();
  const [s] = await db.select().from(onboardingStateTable).where(eq(onboardingStateTable.trainerId, trainerId));
  return s!;
}

export async function progress(trainerId: number) {
  const clients = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId));
  const ids = clients.map((c) => c.id);
  const has = (n: number) => n > 0;
  const surveys = ids.length ? (await db.select({ n: sql<number>`count(*)::int` }).from(surveysTable).where(inArray(surveysTable.clientId, ids)))[0]!.n : 0;
  const invites = (await db.select({ n: sql<number>`count(*)::int` }).from(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId)))[0]!.n;
  const plans = ids.length ? (await db.select({ n: sql<number>`count(*)::int` }).from(workoutPlansTable).where(inArray(workoutPlansTable.clientId, ids)))[0]!.n : 0;
  const active = ids.length ? (await db.select({ n: sql<number>`count(*)::int` }).from(workoutPlansTable).where(and(inArray(workoutPlansTable.clientId, ids), eq(workoutPlansTable.status, "active"))))[0]!.n : 0;
  const done: Record<string, boolean> = { client: has(ids.length), invite: has(invites) || has(surveys), plan: has(plans), activate: has(active) };
  return STEPS.map((s) => ({ ...s, done: done[s.id] === true }));
}

export async function view(trainerId: number) {
  const s = await ensureState(trainerId);
  const steps = await progress(trainerId);
  const allDone = steps.every((x) => x.done);
  let completedMinutes = s.completedMinutes;
  if (allDone && !s.completedAt) {
    completedMinutes = Math.max(1, Math.round((Date.now() - s.startedAt.getTime()) / 60_000));
    await db.update(onboardingStateTable).set({ completedAt: new Date(), completedMinutes }).where(eq(onboardingStateTable.trainerId, trainerId));
  }
  return { steps, dismissed: s.dismissedAt != null, completed: allDone || s.completedAt != null, completedMinutes, exampleClientId: s.exampleClientId };
}

export async function createExample(trainerId: number): Promise<number> {
  const s = await ensureState(trainerId);
  if (s.exampleClientId) {
    const [still] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, s.exampleClientId), eq(clientsTable.trainerId, trainerId)));
    if (still) return still.id;
  }
  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(clientsTable).values({ firstName: "Anna (przykład)", lastName: "", trainerId, status: "active", isExample: true } as never).returning({ id: clientsTable.id });
    await tx.insert(surveysTable).values({ clientId: c!.id, dateOfBirth: "1992-04-12", gender: "female", heightCm: 168, weightKg: "64", experienceLevel: "Początkujący", activityLevel: "Lekka aktywność",
      sleepHours: "7", planStylePreference: "Dowolny", trainingLocation: "Siłownia", healthLimitations: "ból prawego kolana", injuryStatus: "Tak", healthConsentStatus: "given" } as never);
    return c!.id;
  });
  await db.update(onboardingStateTable).set({ exampleClientId: id }).where(eq(onboardingStateTable.trainerId, trainerId));
  return id;
}

export async function removeExample(trainerId: number): Promise<boolean> {
  const s = await ensureState(trainerId);
  if (!s.exampleClientId) return false;
  const gone = await db.delete(clientsTable).where(and(eq(clientsTable.id, s.exampleClientId), eq(clientsTable.trainerId, trainerId), eq(clientsTable.isExample, true))).returning({ id: clientsTable.id });
  await db.update(onboardingStateTable).set({ exampleClientId: null }).where(eq(onboardingStateTable.trainerId, trainerId));
  return gone.length > 0;
}
