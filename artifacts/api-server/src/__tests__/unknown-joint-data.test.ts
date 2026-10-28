/**
 * Decision 3a (owner, 28.10.2026), end to end: with the joint data of the WHOLE test catalogue removed, a client who reported a joint, and a client without
 * health consent, get no exercise on any selection path (the unknown is never offered); a client with neither still gets a plan (the control).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "unknown_joint_trainer" }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable } from "@workspace/db";

let trainerId = 0;
const clientIds: number[] = [];
let saved: Array<{ id: number; jointStress: string | null; jointStressAreas: string[] | null }> = [];
const SESSIONS = ["push", "pull", "legs", "upper", "lower", "full_body"] as const;

async function mk(level: string, healthLimitations: string | null, consent: string | null) {
  const [c] = await db.insert(clientsTable).values({ firstName: "Nieznane", lastName: "unknown-joint-test", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: 65, experienceLevel: level, trainingDuration: "4 lata", trainingLocation: "Siłownia",
    sessionDuration: "45–60 min", activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny", trainingGoal: "Budowa sylwetki",
    injuryStatus: healthLimitations ? "Tak" : "Brak", healthLimitations, healthConsentStatus: consent,
  } as never);
  return c.id;
}
const ids = (b: { exercises?: Array<{ id: number }> }) => (b.exercises ?? []).map((e) => e.id);
async function allPaths(clientId: number): Promise<number[]> {
  const out: number[] = [];
  const rec = await request(app).get(`/api/clients/${clientId}/exercise-recommendations`); out.push(...ids(rec.body));
  const dr = await request(app).get(`/api/clients/${clientId}/plan-draft/day-recommendations`).query({ broadCategories: "Klatka piersiowa,Plecy,Barki,Mięśnie czworogłowe uda,Pośladki,Brzuch" }); out.push(...ids(dr.body));
  for (const s of SESSIONS) {
    const v0 = await request(app).get(`/api/clients/${clientId}/plan-draft/day-recommendations`).query({ useV0Selector: "true", v0SessionType: s }); out.push(...ids(v0.body));
    for (const alt of [0, 1]) {
      const g = await request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({ generationId: randomUUID(), generationDayIndex: 0, expectedDayCount: 3, v0SessionType: s, alternativeIndex: alt });
      expect([200, 422]).toContain(g.status); out.push(...ids(g.body));
    }
  }
  return out;
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "unknown_joint_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "unknown_joint_trainer" } }).returning();
  trainerId = t.id;
  saved = await db.select({ id: exercisesTable.id, jointStress: exercisesTable.jointStress, jointStressAreas: exercisesTable.jointStressAreas }).from(exercisesTable);
  await db.update(exercisesTable).set({ jointStress: null, jointStressAreas: null }); // the whole catalogue now has no joint data
}, 120_000);

afterAll(async () => {
  for (const r of saved) await db.update(exercisesTable).set({ jointStress: r.jointStress, jointStressAreas: r.jointStressAreas }).where(eq(exercisesTable.id, r.id));
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId))).map((r) => r.id);
  const all = [...new Set([...clientIds, ...left])];
  if (all.length) { await db.delete(surveysTable).where(inArray(surveysTable.clientId, all)); await db.delete(clientsTable).where(inArray(clientsTable.id, all)); }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
}, 120_000);

describe("exercises without joint data are never offered to a client who reported a joint or has no consent", () => {
  it("control: a client with no report and consent unknown gets exercises (the test is not vacuous)", async () => {
    expect((await allPaths(await mk("Średniozaawansowany", null, null))).length).toBeGreaterThan(0);
  }, 180_000);
  for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
    it(`reported joint (interview text) — ${level}: nothing offered on any path`, async () => {
      expect(await allPaths(await mk(level, "boli mnie kolano", null))).toEqual([]);
    }, 180_000);
  }
  for (const status of ["declined", "withdrawn"]) {
    it(`health consent ${status}: nothing offered on any path`, async () => {
      expect(await allPaths(await mk("Średniozaawansowany", null, status))).toEqual([]);
    }, 180_000);
  }
});
