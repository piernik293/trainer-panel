/**
 * A joint the client reported (interview text or pain report ≤ 30 days) never reaches a plan through ANY selection path:
 * exercise recommendations, day recommendations (original + V0), generate-day (all session types, alternatives,
 * week-used exhaustion = fallbacks / safe reuse). Every joint × every level, on the test database.
 * The catalogue's joint tags are set by movement pattern for the duration of the test and restored afterwards.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "joint_excl_trainer" }),
  // generate-day meters plan generations; the fixture trainer is the unlimited account, so the quota never interferes
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, painReportsTable, workoutSessionsTable, workoutPlansTable, workoutPlanDaysTable, volumeGuidelineVersionsTable } from "@workspace/db";

const JOINTS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"] as const;
const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"] as const;
const TEXT: Record<string, string> = {
  Kolano: "boli mnie kolano", Biodro: "problem z biodrem", "Plecy — dół": "ból w odcinku lędźwiowym",
  Bark: "ból barku", Łokieć: "łokieć tenisisty", Nadgarstek: "ból nadgarstka",
};
const TAGS: Record<string, string[]> = {
  Przysiad: ["Kolano", "Biodro"], Wykrok: ["Kolano", "Biodro"], "Zawias biodrowy": ["Biodro", "Plecy — dół"],
  "Pchanie poziome": ["Bark", "Łokieć", "Nadgarstek"], "Pchanie pionowe": ["Bark", "Łokieć"],
  "Przyciąganie poziome": ["Bark", "Łokieć"], "Przyciąganie pionowe": ["Bark", "Łokieć"],
  "Zgięcie łokcia": ["Łokieć"], "Wyprost łokcia": ["Łokieć"], Odwodzenie: ["Bark"], Przywodzenie: ["Bark"],
  "Zgięcie tułowia": ["Plecy — dół"], Rotacja: ["Plecy — dół"], "Zgięcie kolana": ["Kolano"], "Wyprost kolana": ["Kolano"],
  "Zgięcie/wyprost nadgarstka": ["Nadgarstek"],
};
const SESSIONS = ["push", "pull", "legs", "upper", "lower", "full_body"] as const;

let trainerId = 0;
const clientIds: number[] = [];
let original: Array<{ id: number; areas: string[] | null }> = [];
const tagById = new Map<number, string[]>();

async function mkClient(level: string, text: string | null, pain: string | null, painAgeDays = 2): Promise<number> {
  const [c] = await db.insert(clientsTable).values({ firstName: "Staw", lastName: "joint-excl", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  const [sv] = await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: "65", experienceLevel: level,
    trainingLocation: "Siłownia", activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny",
    trainingGoal: "Poprawa kondycji", injuryStatus: text ? "Tak" : "Brak", healthLimitations: text,
  } as never).returning();
  if (pain) {
    const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
    const [plan] = await db.insert(workoutPlansTable).values({ clientId: c.id, surveyId: sv.id, guidelineVersionId: ver.id, experienceLevelUsed: level, title: "joint-excl" } as never).returning();
    const [pd] = await db.insert(workoutPlanDaysTable).values({ planId: plan.id, dayOrder: 1, dayName: "Dzień 1" } as never).returning();
    const [s] = await db.insert(workoutSessionsTable).values({ clientId: c.id, planId: plan.id, planDayId: pd.id, sessionDate: new Date().toISOString().slice(0, 10) } as never).returning();
    await db.insert(painReportsTable).values({
      sessionId: s.id, clientId: c.id, area: pain, severity: 3, clientUuid: randomUUID(),
      createdAt: new Date(Date.now() - painAgeDays * 86_400_000),
    });
  }
  return c.id;
}

const idsOf = (body: { exercises?: Array<{ id: number }> }) => (body.exercises ?? []).map((e) => e.id);

/** Every selection path for one client; returns all exercise ids that were offered. */
async function runAllPaths(clientId: number): Promise<number[]> {
  const out: number[] = [];
  const rec = await request(app).get(`/api/clients/${clientId}/exercise-recommendations`);
  expect(rec.status).toBe(200); out.push(...idsOf(rec.body));
  const dr = await request(app).get(`/api/clients/${clientId}/plan-draft/day-recommendations`).query({ broadCategories: "Klatka piersiowa,Plecy,Barki,Mięśnie czworogłowe uda,Pośladki,Brzuch,Biceps,Triceps" });
  expect(dr.status).toBe(200); out.push(...idsOf(dr.body));
  for (const s of SESSIONS) {
    const v0 = await request(app).get(`/api/clients/${clientId}/plan-draft/day-recommendations`).query({ useV0Selector: "true", v0SessionType: s });
    expect([200, 422]).toContain(v0.status); out.push(...idsOf(v0.body));
    const gid = randomUUID(); const used: number[] = [];
    for (const alt of [0, 1, 2]) {
      const g = await request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({
        generationId: gid, generationDayIndex: alt, expectedDayCount: 3, v0SessionType: s, alternativeIndex: alt, weekUsedExerciseIds: used,
      });
      // 422 = the engine refused to build the day (a required slot has no safe candidate left) — safe, nothing is offered
      expect([200, 422]).toContain(g.status);
      const ids = idsOf(g.body); out.push(...ids); used.push(...ids); // growing used set → fallback / reuse paths
    }
  }
  return out;
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "joint_excl_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "joint_excl_trainer" } }).returning();
  trainerId = t.id;
  const all = await db.select().from(exercisesTable);
  original = all.map((e) => ({ id: e.id, areas: e.jointStressAreas }));
  for (const e of all) {
    const tags = TAGS[e.movementPattern ?? ""] ?? [];
    tagById.set(e.id, tags);
    await db.update(exercisesTable).set({ jointStressAreas: tags }).where(eq(exercisesTable.id, e.id));
  }
}, 60_000);

afterAll(async () => {
  for (const o of original) await db.update(exercisesTable).set({ jointStressAreas: o.areas }).where(eq(exercisesTable.id, o.id));
  // Also clients left by an interrupted earlier run (the trainer row is reused through onConflict), not only this run's own.
  const leftovers = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId))).map((r) => r.id);
  clientIds.push(...leftovers.filter((id) => !clientIds.includes(id)));
  if (clientIds.length) {
    await db.delete(painReportsTable).where(inArray(painReportsTable.clientId, clientIds));
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, clientIds));
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, clientIds));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, clientIds));
    await db.delete(clientsTable).where(inArray(clientsTable.id, clientIds));
  }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("joint exclusion — every joint × every level × every selection path", () => {
  for (const [ji, joint] of JOINTS.entries()) {
    for (const level of LEVELS) {
      // half the joints via the interview text, half via a pain report — both sources are covered for every level
      const viaText = ji % 2 === 0;
      it(`${joint} / ${level} (${viaText ? "wywiad" : "zgłoszenie bólu"})`, async () => {
        const cid = await mkClient(level, viaText ? TEXT[joint] : null, viaText ? null : joint);
        const offered = await runAllPaths(cid);
        expect(offered.length).toBeGreaterThan(0);
        expect(offered.filter((id) => (tagById.get(id) ?? []).includes(joint))).toEqual([]);
      }, 120_000);
    }
  }

  it("control: without pain the same catalogue DOES offer tagged exercises (the test is not vacuous)", async () => {
    const cid = await mkClient("Średniozaawansowany", null, null);
    const offered = await runAllPaths(cid);
    for (const joint of JOINTS) expect(offered.some((id) => (tagById.get(id) ?? []).includes(joint))).toBe(true);
  }, 120_000);

  it("a pain report older than 30 days does not block", async () => {
    const cid = await mkClient("Średniozaawansowany", null, "Bark", 31);
    const offered = await runAllPaths(cid);
    expect(offered.some((id) => (tagById.get(id) ?? []).includes("Bark"))).toBe(true);
  }, 120_000);

  it("interview text and a pain report together block both joints", async () => {
    const cid = await mkClient("Początkujący", TEXT.Kolano, "Bark");
    const offered = await runAllPaths(cid);
    expect(offered.filter((id) => { const t = tagById.get(id) ?? []; return t.includes("Kolano") || t.includes("Bark"); })).toEqual([]);
  }, 120_000);
});
