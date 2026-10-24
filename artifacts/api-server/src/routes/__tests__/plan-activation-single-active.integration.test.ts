/**
 * Activation keeps at most one active plan per client: activating a plan archives the client's previous active plan
 * (archived, not deleted); its sessions stay attached to it. Other clients' plans are untouched. The database enforces
 * the rule as well (partial unique index, migration 0027).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "single_active_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, workoutPlansTable, workoutSessionsTable, specificMusclesTable, exerciseMuscleAssignmentsTable } from "@workspace/db";

const TRAINER = "single_active_trainer";
const EMAILS = ["single-active-1@example.invalid", "single-active-2@example.invalid"];
const EXERCISE_ID = 900_401;
let trainerId = 0;

async function cleanup() {
  const clients = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.email, EMAILS));
  if (clients.length) await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, clients.map((c) => c.id)));
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(exercisesTable).where(eq(exercisesTable.id, EXERCISE_ID));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TRAINER));
}

async function client(email: string) {
  const [c] = await db.insert(clientsTable).values({ firstName: "Jeden", lastName: "Aktywny", email, trainerId }).returning();
  const [sv] = await db.insert(surveysTable).values({
    clientId: c.id, experienceLevel: "Początkujący", trainingLocation: "Siłownia", equipment: "Hantle",
    avoidedExerciseIds: [], avoidedExerciseReasons: {}, advancedMethodsToAvoid: [],
  } as never).returning();
  return { clientId: c.id as number, surveyId: sv.id as number };
}

/** Complete plan (passes the activation checks): one day, one exercise, 2 × 8–12. */
async function plan(clientId: number, surveyId: number, title: string): Promise<number> {
  const p = await request(app).post(`/api/clients/${clientId}/plans`).send({ title, surveyId });
  expect(p.status).toBe(201);
  const d = await request(app).post(`/api/plans/${p.body.id}/days`).send({ dayName: "Dzień A" });
  const dayId = (d.body.days as Array<{ id: number }>)[0].id;
  const e = await request(app).post(`/api/plans/${p.body.id}/days/${dayId}/exercises`)
    .send({ exerciseId: EXERCISE_ID, workingSets: 2, repType: "range", repRangeMin: 8, repRangeMax: 12 });
  expect(e.status).toBe(201);
  return p.body.id;
}

const statusOf = async (id: number) => (await db.select({ s: workoutPlansTable.status }).from(workoutPlansTable).where(eq(workoutPlansTable.id, id)))[0].s;
const activeCount = async (clientId: number) =>
  (await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")))).length;

beforeAll(async () => {
  await cleanup();
  trainerId = (await db.insert(trainersTable).values({ clerkUserId: TRAINER }).returning())[0].id;
  await db.insert(exercisesTable).values({
    id: EXERCISE_ID, name: "Fixture — jeden aktywny plan", slug: "single-active-fixture", mainMuscleGroup: "Barki",
    equipment: ["Hantle"], trainingLocation: ["Siłownia"],
  } as never);
  const [muscle] = await db.select({ id: specificMusclesTable.id }).from(specificMusclesTable).where(eq(specificMusclesTable.name, "Mięsień naramienny (głowa boczna)"));
  await db.insert(exerciseMuscleAssignmentsTable).values({ exerciseId: EXERCISE_ID, specificMuscleId: muscle.id, isPrimary: true, coefficient: 1 });
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("aktywacja: najwyżej jeden aktywny plan klienta", () => {
  it("aktywacja nowego planu archiwizuje poprzedni; sesje zostają przy starym planie", async () => {
    const a = await client(EMAILS[0]);
    const b = await client(EMAILS[1]);
    const oldPlan = await plan(a.clientId, a.surveyId, "Stary plan");
    const otherClientPlan = await plan(b.clientId, b.surveyId, "Plan innego klienta");

    const first = await request(app).post(`/api/plans/${oldPlan}/activate`);
    expect(first.status).toBe(200);
    expect(first.body.archivedPlans).toEqual([]);
    expect((await request(app).post(`/api/plans/${otherClientPlan}/activate`)).status).toBe(200);

    const [day] = (await request(app).get(`/api/plans/${oldPlan}`)).body.days as Array<{ id: number }>;
    const [session] = await db.insert(workoutSessionsTable).values({
      clientId: a.clientId, planId: oldPlan, planDayId: day.id, sessionDate: new Date().toISOString().slice(0, 10),
    } as never).returning();

    const newPlan = await plan(a.clientId, a.surveyId, "Nowy plan");
    const res = await request(app).post(`/api/plans/${newPlan}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.archivedPlans).toEqual([{ id: oldPlan, title: "Stary plan" }]);
    expect(await statusOf(oldPlan)).toBe("archived");
    expect(await statusOf(newPlan)).toBe("active");
    expect(await activeCount(a.clientId)).toBe(1);
    // historia treningów: sesja nadal przy starym planie, nic nie usunięte
    const [s] = await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.id, session.id));
    expect(s.planId).toBe(oldPlan);
    expect(s.planDayId).toBe(day.id);
    // plan innego klienta nietknięty
    expect(await statusOf(otherClientPlan)).toBe("active");
  });

  it("zarchiwizowany plan można aktywować ponownie — wtedy archiwizowany jest bieżący", async () => {
    const [{ id: clientId }] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.email, EMAILS[0]));
    const plans = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, clientId));
    const archived = plans.find((p) => p.status === "archived")!;
    const active = plans.find((p) => p.status === "active")!;
    const res = await request(app).post(`/api/plans/${archived.id}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.archivedPlans.map((p: { id: number }) => p.id)).toEqual([active.id]);
    expect(await activeCount(clientId)).toBe(1);
  });

  it("baza nie pozwala na dwa aktywne plany jednego klienta (indeks 0027)", async () => {
    const [{ id: clientId }] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.email, EMAILS[0]));
    const archived = (await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "archived"))))[0];
    await expect(db.update(workoutPlansTable).set({ status: "active" }).where(eq(workoutPlansTable.id, archived.id))).rejects.toThrow();
    expect(await activeCount(clientId)).toBe(1);
  });
});
