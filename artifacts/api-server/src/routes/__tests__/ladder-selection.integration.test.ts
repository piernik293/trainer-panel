/**
 * Ladders on the test database (migration 0022): automatic selection (generate-day, V0 day recommendations) never offers an exercise from a
 * step above the client's level — for every level and session type; warm-up-role exercises only for BA clients with suitableForNoActivity = true;
 * a trainer can still add any exercise by hand (override).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "ladder_trainer" }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, exerciseLadderStepsTable, workoutPlansTable } from "@workspace/db";
import { LADDER_RANK } from "../../services/ladderSelection";

const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"] as const;
const SESSIONS = ["push", "pull", "legs", "upper", "lower", "full_body"] as const;
let trainerId = 0;
const clientIds: number[] = [];
const minRank = new Map<number, number>();
let warmupBaIds: number[] = [];

async function mkClient(level: string): Promise<{ clientId: number; surveyId: number }> {
  const [c] = await db.insert(clientsTable).values({ firstName: "Drab", lastName: "ladder-test", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  const [s] = await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: "65", experienceLevel: level, trainingLocation: "Siłownia",
    activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny", trainingGoal: "Poprawa kondycji", injuryStatus: "Brak",
  } as never).returning();
  return { clientId: c.id, surveyId: s.id };
}
const idsOf = (b: { exercises?: Array<{ id: number }> }) => (b.exercises ?? []).map((e) => e.id);

async function offered(clientId: number): Promise<number[]> {
  const out: number[] = [];
  for (const s of SESSIONS) {
    const v0 = await request(app).get(`/api/clients/${clientId}/plan-draft/day-recommendations`).query({ useV0Selector: "true", v0SessionType: s });
    expect([200, 422]).toContain(v0.status); out.push(...idsOf(v0.body));
    const gid = randomUUID(); const used: number[] = [];
    for (const alt of [0, 1, 2]) {
      const g = await request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({ generationId: gid, generationDayIndex: alt, expectedDayCount: 3, v0SessionType: s, alternativeIndex: alt, weekUsedExerciseIds: used });
      expect([200, 422]).toContain(g.status); const ids = idsOf(g.body); out.push(...ids); used.push(...ids);
    }
  }
  return out;
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "ladder_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "ladder_trainer" } }).returning();
  trainerId = t.id;
  const steps = await db.select().from(exerciseLadderStepsTable);
  for (const s of steps) minRank.set(s.exerciseId, Math.min(minRank.get(s.exerciseId) ?? 9, LADDER_RANK[s.level]));
  const ba = steps.filter((s) => s.level === "Brak aktywności fizycznej").map((s) => s.exerciseId);
  const rows = ba.length ? await db.select({ id: exercisesTable.id, role: exercisesTable.role }).from(exercisesTable).where(inArray(exercisesTable.id, ba)) : [];
  warmupBaIds = rows.filter((r) => r.role === "rozgrzewka").map((r) => r.id);
}, 60_000);
afterAll(async () => {
  if (clientIds.length) {
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, clientIds));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, clientIds));
    await db.delete(clientsTable).where(inArray(clientsTable.id, clientIds));
  }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("ladders seeded in the database", () => {
  it("has steps for all four levels", () => {
    expect(new Set([...minRank.values()])).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe("automatic selection never goes above the client's step", () => {
  for (const [rank, level] of LEVELS.entries()) {
    it(`${level}: no ladder exercise from a higher step is offered (all session types, alternatives, fallbacks)`, async () => {
      const { clientId } = await mkClient(level);
      const ids = await offered(clientId);
      expect(ids.length).toBeGreaterThan(0);
      const above = ids.filter((id) => (minRank.get(id) ?? 0) > rank);
      expect(above).toEqual([]);
      // warm-up-role exercises appear only for BA clients
      if (rank > 0) expect(ids.filter((id) => warmupBaIds.includes(id))).toEqual([]);
    }, 120_000);
  }
});

describe("trainer override", () => {
  it("a trainer can still add an exercise from a higher step to a beginner's plan by hand", async () => {
    const { clientId, surveyId } = await mkClient("Początkujący");
    const [high] = await db.select({ id: exercisesTable.id }).from(exerciseLadderStepsTable).innerJoin(exercisesTable, eq(exercisesTable.id, exerciseLadderStepsTable.exerciseId)).where(eq(exerciseLadderStepsTable.level, "Zaawansowany")).limit(1);
    expect(high).toBeTruthy();
    const plan = await request(app).post(`/api/clients/${clientId}/plans`).send({ title: "Override", surveyId, goal: "Hipertrofia" });
    expect(plan.status).toBe(201);
    const day = await request(app).post(`/api/plans/${plan.body.id}/days`).send({ dayName: "Dzień 1", subtitle: "x", estimatedDurationMinutes: 60 });
    expect(day.status).toBe(201);
    const add = await request(app).post(`/api/plans/${plan.body.id}/days/${day.body.days[0].id}/exercises`).send({ exerciseId: high.id, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 12, restSeconds: 90, rir: 2 });
    expect([200, 201], JSON.stringify(add.body)).toContain(add.status);
  }, 60_000);
});
