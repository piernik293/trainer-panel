/**
 * Manual add of an exercise that loads a joint the client reported (interview or pain ≤ 30 days):
 * a WARNING, not a block. Without confirmation → 409 with the trainer-facing text and nothing is saved;
 * with "Dodaj mimo to" → the exercise is added and the decision (who, when, exercise, joint) is recorded.
 * The client portal never reads the decision table.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "joint_warning_add_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import {
  db,
  pool,
  trainersTable,
  clientsTable,
  surveysTable,
  exercisesTable,
  painReportsTable,
  workoutSessionsTable,
  workoutPlanExercisesTable,
  jointWarningDecisionsTable,
} from "@workspace/db";

const TRAINER_CLERK_ID = "joint_warning_add_trainer";
const CLIENT_EMAIL_PREFIX = "joint-warning-add-";
const SHOULDER_SLUG = "joint-warning-add-shoulder";
const NO_TAG_SLUG = "joint-warning-add-no-tag";
const SHOULDER_EXERCISE_ID = 900_101;
const NO_TAG_EXERCISE_ID = 900_102;

let trainerId = 0;
const clientIds: number[] = [];

async function cleanup() {
  await db.delete(clientsTable).where(inArray(clientsTable.email, [1, 2, 3, 4].map((n) => `${CLIENT_EMAIL_PREFIX}${n}@example.invalid`)));
  await db.delete(exercisesTable).where(inArray(exercisesTable.slug, [SHOULDER_SLUG, NO_TAG_SLUG]));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TRAINER_CLERK_ID));
}

/** Client + survey + plan + one day, via the same API the panel uses. */
async function setupClient(n: number, healthText: string | null) {
  const [c] = await db.insert(clientsTable).values({
    firstName: "Staw", lastName: "Ostrzeżenie", email: `${CLIENT_EMAIL_PREFIX}${n}@example.invalid`, trainerId,
  }).returning();
  clientIds.push(c.id);
  const [sv] = await db.insert(surveysTable).values({
    clientId: c.id, experienceLevel: "Średniozaawansowany", trainingLocation: "Siłownia",
    equipment: "Sztanga,Hantle,Drążek,Ławka,Masa własnego ciała",
    injuryStatus: healthText ? "Tak" : "Brak", healthLimitations: healthText,
    avoidedExerciseIds: [], avoidedExerciseReasons: {}, advancedMethodsToAvoid: [],
  } as never).returning();
  const plan = await request(app).post(`/api/clients/${c.id}/plans`).send({ title: "Ostrzeżenie staw", surveyId: sv.id });
  expect(plan.status).toBe(201);
  const day = await request(app).post(`/api/plans/${plan.body.id}/days`).send({ dayName: "Dzień 1" });
  expect(day.status).toBe(201);
  const dayId = (day.body.days as Array<{ id: number }>)[0].id;
  return { clientId: c.id as number, planId: plan.body.id as number, dayId };
}

async function addPain(clientId: number, planId: number, dayId: number, area: string, ageDays: number) {
  const [s] = await db.insert(workoutSessionsTable).values({
    clientId, planId, planDayId: dayId, sessionDate: new Date().toISOString().slice(0, 10),
  } as never).returning();
  await db.insert(painReportsTable).values({
    sessionId: s.id, clientId, area, severity: 3, clientUuid: randomUUID(),
    createdAt: new Date(Date.now() - ageDays * 86_400_000),
  });
}

const add = (planId: number, dayId: number, exerciseId: number, ack?: boolean) =>
  request(app).post(`/api/plans/${planId}/days/${dayId}/exercises`)
    .send({ exerciseId, workingSets: 3, ...(ack === undefined ? {} : { acknowledgeJointWarning: ack }) });

const planExerciseCount = async (dayId: number) =>
  (await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.dayId, dayId))).length;

const decisionsFor = (clientId: number) =>
  db.select().from(jointWarningDecisionsTable).where(eq(jointWarningDecisionsTable.clientId, clientId));

beforeAll(async () => {
  await cleanup();
  const [t] = await db.insert(trainersTable).values({ clerkUserId: TRAINER_CLERK_ID }).returning();
  trainerId = t.id;
  await db.insert(exercisesTable).values([
    {
      id: SHOULDER_EXERCISE_ID, name: "Fixture — wyciskanie obciążające bark", slug: SHOULDER_SLUG,
      mainMuscleGroup: "Barki", equipment: ["Hantle"], trainingLocation: ["Siłownia"], jointStressAreas: ["Bark", "Łokieć"],
    },
    {
      id: NO_TAG_EXERCISE_ID, name: "Fixture — ćwiczenie bez stawu", slug: NO_TAG_SLUG,
      mainMuscleGroup: "Barki", equipment: ["Hantle"], trainingLocation: ["Siłownia"], jointStressAreas: [],
    },
  ] as never);
});

afterAll(async () => {
  if (clientIds.length) {
    await db.delete(jointWarningDecisionsTable).where(inArray(jointWarningDecisionsTable.clientId, clientIds));
    await db.delete(painReportsTable).where(inArray(painReportsTable.clientId, clientIds));
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, clientIds));
  }
  await cleanup();
  await pool.end();
});

describe("ręczne dodanie ćwiczenia na zgłoszony staw — ostrzeżenie, nie blokada", () => {
  it("bez potwierdzenia: 409 z treścią ostrzeżenia, nic nie zapisane", async () => {
    const { clientId, planId, dayId } = await setupClient(1, "ból barku przy podnoszeniu ręki");
    const res = await add(planId, dayId, SHOULDER_EXERCISE_ID);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EXERCISE_LOADS_REPORTED_JOINT");
    expect(res.body.joints).toEqual(["Bark"]);
    expect(res.body.error).toBe("Klient zgłosił ból: bark. To ćwiczenie obciąża bark. Dodać mimo to?");
    expect(await planExerciseCount(dayId)).toBe(0);
    expect(await decisionsFor(clientId)).toEqual([]);
  });

  it("„Dodaj mimo to”: ćwiczenie dodane, decyzja zapisana (kto, kiedy, ćwiczenie, staw)", async () => {
    const { clientId, planId, dayId } = await setupClient(2, null);
    await addPain(clientId, planId, dayId, "Bark", 3);
    const before = Date.now();
    const res = await add(planId, dayId, SHOULDER_EXERCISE_ID, true);
    expect(res.status).toBe(201);
    expect(await planExerciseCount(dayId)).toBe(1);
    const [d, ...rest] = await decisionsFor(clientId);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({
      trainerId, clientId, planId, exerciseId: SHOULDER_EXERCISE_ID,
      exerciseNameSnapshot: "Fixture — wyciskanie obciążające bark", joints: ["Bark"], decision: "dodaj_mimo_to",
    });
    expect(d.planExerciseId).not.toBeNull();
    expect(d.createdAt.getTime()).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("ćwiczenie bez zgłoszonego stawu: dodane bez ostrzeżenia i bez wpisu decyzji", async () => {
    const { clientId, planId, dayId } = await setupClient(3, "ból barku");
    const res = await add(planId, dayId, NO_TAG_EXERCISE_ID);
    expect(res.status).toBe(201);
    expect(await decisionsFor(clientId)).toEqual([]);
  });

  it("ból zgłoszony ponad 30 dni temu nie wywołuje ostrzeżenia", async () => {
    const { clientId, planId, dayId } = await setupClient(4, null);
    await addPain(clientId, planId, dayId, "Bark", 31);
    const res = await add(planId, dayId, SHOULDER_EXERCISE_ID);
    expect(res.status).toBe(201);
    expect(await decisionsFor(clientId)).toEqual([]);
    const rows = await db.select().from(workoutPlanExercisesTable)
      .where(and(eq(workoutPlanExercisesTable.dayId, dayId), eq(workoutPlanExercisesTable.exerciseId, SHOULDER_EXERCISE_ID)));
    expect(rows).toHaveLength(1);
  });

  it("portal klienta nie czyta decyzji ani treści ostrzeżenia", () => {
    const src = readFileSync(join(__dirname, "..", "clientPortal.ts"), "utf8");
    expect(src).not.toMatch(/jointWarningDecisions|EXERCISE_LOADS_REPORTED_JOINT|Dodać mimo to/);
  });
});
