/**
 * Achievements behind ACHIEVEMENTS_ENABLED (docs/OSIAGNIECIA.md), on the test database:
 * flag OFF = nothing happens (404, no extra field in the finish answer); flag ON = idempotent awards, one shown after a session,
 * isolation between clients, holiday / illness periods.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "ach_client_a" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import {
  db, pool, trainersTable, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, setLogsTable,
  clientAchievementsTable, clientPausesTable, exercisesTable, volumeGuidelineVersionsTable,
} from "@workspace/db";
import { evaluateAndStore } from "../services/achievementsStore";

let trainerId = 0; let otherTrainerId = 0;
let clientA = 0; let clientB = 0; let planA = 0; let dayA = 0; let planExA = 0; let exerciseId = 0;
const clientIds: number[] = [];

async function mkClient(name: string, clerkUserId: string, trainer = trainerId) {
  const [c] = await db.insert(clientsTable).values({ firstName: name, lastName: "ach-test", trainerId: trainer, status: "active", clerkUserId }).returning();
  clientIds.push(c.id);
  return c.id;
}
async function mkPlan(clientId: number) {
  const [sv] = await db.insert(surveysTable).values({ clientId, dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: 65, experienceLevel: "Początkujący", trainingLocation: "Siłownia", injuryStatus: "Brak" } as never).returning();
  const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
  const [plan] = await db.insert(workoutPlansTable).values({ clientId, surveyId: sv.id, guidelineVersionId: ver.id, experienceLevelUsed: "Początkujący", title: "ach-plan", status: "active" } as never).returning();
  const [d1] = await db.insert(workoutPlanDaysTable).values({ planId: plan.id, dayOrder: 1, dayName: "A" } as never).returning();
  await db.insert(workoutPlanDaysTable).values({ planId: plan.id, dayOrder: 2, dayName: "B" } as never);
  const [pe] = await db.insert(workoutPlanExercisesTable).values({ dayId: d1.id, exerciseId, orderInDay: 1, workingSets: 3 } as never).returning();
  return { planId: plan.id, dayId: d1.id, planExId: pe.id };
}
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
async function mkSession(clientId: number, planId: number, dayId: number, daysAgo: number, status: "in_progress" | "completed" = "completed") {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  const [s] = await db.insert(workoutSessionsTable).values({
    clientId, planId, planDayId: dayId, sessionDate: iso(daysAgo), status, isCompleted: status === "completed", completedAt: status === "completed" ? when : null,
    startedAt: when, endedAt: status === "completed" ? when : null, clientUuid: randomUUID(),
  } as never).returning();
  return s.id;
}
async function mkSet(sessionId: number, planExId: number | null, setNumber: number, weightKg: number, reps: number) {
  await db.insert(setLogsTable).values({ sessionId, planExerciseId: planExId, exerciseId, exerciseNameSnapshot: "Przysiad ach", setNumber, weightKg: String(weightKg), reps, clientUuid: randomUUID() } as never);
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "ach_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "ach_trainer" } }).returning();
  const [t2] = await db.insert(trainersTable).values({ clerkUserId: "ach_trainer_other" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "ach_trainer_other" } }).returning();
  trainerId = t.id; otherTrainerId = t2.id;
  const [ex] = await db.select({ id: exercisesTable.id }).from(exercisesTable).limit(1);
  exerciseId = ex.id;
  clientA = await mkClient("Anna", "ach_client_a"); clientB = await mkClient("Beata", "ach_client_b", otherTrainerId);
  ({ planId: planA, dayId: dayA, planExId: planExA } = await mkPlan(clientA));
}, 60_000);

afterEach(() => { vi.unstubAllEnvs(); auth.userId = "ach_client_a"; });

afterAll(async () => {
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.trainerId, [trainerId, otherTrainerId]))).map((r) => r.id);
  const ids = [...new Set([...clientIds, ...left])];
  if (ids.length) {
    await db.delete(clientAchievementsTable).where(inArray(clientAchievementsTable.clientId, ids));
    await db.delete(clientPausesTable).where(inArray(clientPausesTable.clientId, ids));
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids));
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, ids));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(inArray(trainersTable.id, [trainerId, otherTrainerId]));
  await pool.end();
});

describe("flag OFF (default)", () => {
  it("status says disabled and every route is 404; the finish answer has no `achievement` field and nothing is stored", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "");
    expect((await request(app).get("/api/achievements/status")).body).toEqual({ enabled: false });
    for (const r of [request(app).get("/api/client-portal/achievements"), request(app).get("/api/client-portal/pauses"), request(app).get(`/api/clients/${clientA}/pauses`)]) {
      const res = await r; expect(res.status).toBe(404); expect(res.body.code).toBe("ACHIEVEMENTS_DISABLED");
    }
    const sid = await mkSession(clientA, planA, dayA, 0, "in_progress");
    const fin = await request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status: "completed" });
    expect(fin.status).toBe(200);
    expect("achievement" in fin.body).toBe(false);
    expect(await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, clientA))).toEqual([]);
    await db.delete(workoutSessionsTable).where(eq(workoutSessionsTable.id, sid));
  });
});

describe("flag ON", () => {
  it("finishing the first training shows exactly one award; repeating the request (offline retry) shows none and stores nothing twice", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const sid = await mkSession(clientA, planA, dayA, 0, "in_progress");
    const fin = await request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status: "completed" });
    expect(fin.status).toBe(200);
    expect(fin.body.achievement).toMatchObject({ kind: "milestone", title: "Pierwszy trening za Tobą" });
    const again = await request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status: "completed" });
    expect(again.body.achievement).toBeNull();
    const rows = await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, clientA));
    expect(rows.filter((r) => r.kind === "milestone" && r.key === "1")).toHaveLength(1);
  }, 60_000);

  it("an aborted training awards nothing", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const c = await mkClient("Abort", "ach_client_abort");
    const p = await mkPlan(c);
    const sid = await mkSession(c, p.planId, p.dayId, 0, "in_progress");
    auth.userId = "ach_client_abort";
    const fin = await request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status: "aborted" });
    expect(fin.status).toBe(200);
    expect("achievement" in fin.body).toBe(false);
    expect(await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, c))).toEqual([]);
  }, 60_000);

  it("a record from planned sets is stored once; sets above the plan and a duplicated evaluation create nothing more", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const c = await mkClient("Rekord", "ach_client_rec");
    const p = await mkPlan(c);
    const s1 = await mkSession(c, p.planId, p.dayId, 9); await mkSet(s1, p.planExId, 1, 40, 8);
    const s2 = await mkSession(c, p.planId, p.dayId, 5); await mkSet(s2, p.planExId, 1, 45, 8); await mkSet(s2, p.planExId, 4, 90, 8); // 4th set of 3 planned
    const first = await evaluateAndStore(c);
    expect(first.earned.filter((e) => e.kind === "record")).toHaveLength(1);
    expect(first.earned.find((e) => e.kind === "record")!.sessionId).toBe(s2);
    const second = await evaluateAndStore(c);
    expect(second.earned).toEqual([]); // idempotent
    const rows = await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, c));
    expect(new Set(rows.map((r) => `${r.kind}:${r.key}`)).size).toBe(rows.length);
  }, 60_000);

  it("a pain reported that day: no award from that session", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const c = await mkClient("Bol", "ach_client_pain");
    const p = await mkPlan(c);
    const s1 = await mkSession(c, p.planId, p.dayId, 0);
    await db.update(workoutSessionsTable).set({ hadPain: true }).where(eq(workoutSessionsTable.id, s1));
    expect((await evaluateAndStore(c)).earned).toEqual([]);
  }, 60_000);

  it("the list belongs to one client only; marking as seen; no ranking fields", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const mine = await request(app).get("/api/client-portal/achievements");
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(Object.keys(mine.body).sort()).toEqual(["items", "streakWeeks"]);
    auth.userId = "ach_client_b";
    expect((await request(app).get("/api/client-portal/achievements")).body.items).toEqual([]); // client B has no training
    auth.userId = "ach_client_a";
    await request(app).post("/api/client-portal/achievements/seen");
    expect((await request(app).get("/api/client-portal/achievements")).body.items.every((i: { seen: boolean }) => i.seen)).toBe(true);
  }, 60_000);

  it("holiday / illness periods: the client sets and deletes only their own; limits; the trainer only for own clients", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const ok = await request(app).post("/api/client-portal/pauses").send({ startDate: iso(2), endDate: iso(-5), reason: "urlop" });
    expect(ok.status).toBe(201);
    expect((await request(app).post("/api/client-portal/pauses").send({ startDate: iso(0), endDate: iso(-40), reason: "urlop" })).status).toBe(400); // longer than 28 days
    expect((await request(app).post("/api/client-portal/pauses").send({ startDate: iso(40), endDate: iso(38), reason: "inne" })).status).toBe(400); // too far back
    expect((await request(app).post("/api/client-portal/pauses").send({ startDate: iso(0), endDate: iso(1), reason: "urlop" })).status).toBe(400); // end before start
    expect((await request(app).post("/api/client-portal/pauses").send({ startDate: "nie-data", endDate: iso(0), reason: "urlop" })).status).toBe(400);
    auth.userId = "ach_client_b";
    expect((await request(app).delete(`/api/client-portal/pauses/${ok.body.id}`)).status).toBe(404); // not B's
    expect((await request(app).get("/api/client-portal/pauses")).body.items).toEqual([]);
    auth.userId = "ach_trainer";
    const t = await request(app).post(`/api/clients/${clientA}/pauses`).send({ startDate: iso(0), endDate: iso(-60), reason: "choroba" });
    expect(t.status).toBe(201); expect(t.body.setBy).toBe("trainer"); // trainers may set longer ones
    expect((await request(app).post(`/api/clients/${clientB}/pauses`).send({ startDate: iso(0), endDate: iso(-3), reason: "choroba" })).status).toBe(404); // not their client
    expect((await request(app).get(`/api/clients/${clientB}/pauses`)).status).toBe(404);
    expect((await request(app).delete(`/api/clients/${clientA}/pauses/${t.body.id}`)).status).toBe(200);
    auth.userId = "ach_client_a";
    expect((await request(app).delete(`/api/client-portal/pauses/${ok.body.id}`)).status).toBe(200);
  }, 60_000);
});

describe("activity (map of the year)", () => {
  it("flag ON: only the own completed training days, deduplicated and sorted; flag OFF: 404", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "");
    expect((await request(app).get("/api/client-portal/activity")).status).toBe(404);
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "1");
    const c = await mkClient("Mapa", "ach_client_map");
    const p = await mkPlan(c);
    await mkSession(c, p.planId, p.dayId, 3); await mkSession(c, p.planId, p.dayId, 3); await mkSession(c, p.planId, p.dayId, 10);
    await mkSession(c, p.planId, p.dayId, 1, "in_progress");
    auth.userId = "ach_client_map";
    const r = await request(app).get("/api/client-portal/activity");
    expect(r.status).toBe(200);
    expect(r.body.days).toEqual([iso(10), iso(3)]);
    auth.userId = "ach_client_b";
    expect((await request(app).get("/api/client-portal/activity")).body.days).toEqual([]);
  }, 60_000);
});
