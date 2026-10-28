/**
 * Without consent to process health data (declined / withdrawn) the generator leaves out exercises with a HIGH joint load (joint_stress = "Wysokie").
 * Regression (generator simulation, 28.10.2026): the plyometric block built its own pool and called the filter without `jointStress`,
 * so a declined-consent advanced athlete still got "Skok jednonóż". The unit test of the filter alone did not see it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "conservative_gen_trainer" }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable } from "@workspace/db";

let trainerId = 0;
const clientIds: number[] = [];
const highLoad = new Set<number>();

async function mkClient(consent: string | null): Promise<number> {
  const [c] = await db.insert(clientsTable).values({ firstName: "Zgoda", lastName: "conservative-gen", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "male", heightCm: 180, weightKg: 80, experienceLevel: "Zaawansowany", trainingDuration: "6 lat",
    trainingLocation: "Dom", equipment: "Brak sprzętu", sessionDuration: "60–90 min", activityLevel: "Lekka aktywność", sleepHours: "7",
    planStylePreference: "Dowolny", trainingGoal: "Cel sportowy", jumpExperience: "Tak — robię regularnie", athleteStatus: "Tak — amatorsko",
    sportDiscipline: "siatkówka", sportPerformanceNeeds: ["Dynamika"], injuryStatus: "Brak", healthConsentStatus: consent,
  } as never);
  return c.id;
}

async function offered(clientId: number): Promise<number[]> {
  const out: number[] = [];
  for (const t of ["lower", "legs", "full_body"] as const) {
    for (const alt of [0, 1, 2, 3]) {
      const r = await request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({ generationId: randomUUID(), generationDayIndex: 0, expectedDayCount: 3, v0SessionType: t, alternativeIndex: alt });
      expect([200, 422]).toContain(r.status);
      out.push(...((r.body.exercises ?? []) as Array<{ id: number }>).map((e) => e.id));
    }
  }
  return out;
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "conservative_gen_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "conservative_gen_trainer" } }).returning();
  trainerId = t.id;
  for (const e of await db.select({ id: exercisesTable.id, js: exercisesTable.jointStress }).from(exercisesTable)) if (e.js === "Wysokie") highLoad.add(e.id);
}, 60_000);

afterAll(async () => {
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId))).map((r) => r.id);
  const ids = [...new Set([...clientIds, ...left])];
  if (ids.length) {
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("brak zgody zdrowotnej: wysokie obciążenie stawów odpada także w bloku skoków", () => {
  it.each(["declined", "withdrawn"])("%s → ani jedno ćwiczenie o wysokim obciążeniu stawów", async (status) => {
    const ids = await offered(await mkClient(status));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => highLoad.has(id))).toEqual([]);
  }, 120_000);

  it("kontrola: bez tej flagi te same wywołania dają ćwiczenia o wysokim obciążeniu (test nie jest pusty)", async () => {
    const ids = await offered(await mkClient(null));
    expect(ids.some((id) => highLoad.has(id))).toBe(true);
  }, 120_000);
});
