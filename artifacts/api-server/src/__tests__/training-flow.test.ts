/**
 * "Trening" flow (tor C) against the test database.
 * Two trainers (A, B), clients A1/A2 (trainer A) and B1 (trainer B).
 * Covers: today screen, set logging, previous result, idempotent offline retries,
 * pain report → skipped exercise → trainer visibility, finish summary + record,
 * isolation client/client and trainer/trainer.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable,
  exercisesTable, workoutSessionsTable, painReportsTable, setLogsTable,
} from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const TA = "train_test_trainer_a", TB = "train_test_trainer_b";
const CA1 = "train_test_client_a1", CA2 = "train_test_client_a2", CB1 = "train_test_client_b1";
const EMAILS = ["train-a1@example.invalid", "train-a2@example.invalid", "train-b1@example.invalid"];
const SLUGS = ["train-test-barbell", "train-test-bodyweight"];

let a1: number, a2: number, b1: number;
let day1: number, day2: number, pe1: number, pe2: number, pe3: number, exBarbell: number, exBody: number;
const as = (u: string | null) => { authUser = u; };

beforeAll(async () => {
  const tA = (await provisionTrainer(TA))!, tB = (await provisionTrainer(TB))!;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(exercisesTable).where(inArray(exercisesTable.slug, SLUGS));
  const mk = async (email: string, clerk: string, trainerId: number, first: string) =>
    (await db.insert(clientsTable).values({ firstName: first, lastName: "Trening", email, trainerId, clerkUserId: clerk }).returning())[0]!.id;
  a1 = await mk(EMAILS[0]!, CA1, tA.id, "Ala");
  a2 = await mk(EMAILS[1]!, CA2, tA.id, "Ola");
  b1 = await mk(EMAILS[2]!, CB1, tB.id, "Bea");
  const [survey] = await db.insert(surveysTable).values({ clientId: a1, experienceLevel: "Początkujący" }).returning();
  const [plan] = await db.insert(workoutPlansTable).values({
    clientId: a1, surveyId: survey!.id, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan testowy", status: "active", activatedAt: new Date(),
  }).returning();
  const [d1] = await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: 1, dayName: "Dzień A", description: "Uwaga trenera", estimatedDurationMinutes: 45 }).returning();
  const [d2] = await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: 2, dayName: "Dzień B", estimatedDurationMinutes: 45 }).returning();
  day1 = d1!.id; day2 = d2!.id;
  const [e1] = await db.insert(exercisesTable).values({ name: "Test sztanga", slug: SLUGS[0]!, mainMuscleGroup: "Klatka piersiowa", equipment: ["Sztanga"], exerciseType: "Złożone", executionInstructions: "Opis." }).returning();
  const [e2] = await db.insert(exercisesTable).values({ name: "Test masa ciała", slug: SLUGS[1]!, mainMuscleGroup: "Brzuch", equipment: ["Masa własnego ciała"], exerciseType: "Izolowane" }).returning();
  exBarbell = e1!.id; exBody = e2!.id;
  const ins = async (dayId: number, exerciseId: number, order: number, rest: number | null) =>
    (await db.insert(workoutPlanExercisesTable).values({ dayId, exerciseId, orderInDay: order, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 10, rir: 2, restSeconds: rest }).returning())[0]!.id;
  pe1 = await ins(day1, exBarbell, 1, null);
  pe2 = await ins(day1, exBody, 2, 45);
  pe3 = await ins(day2, exBarbell, 1, null);
});

afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(exercisesTable).where(inArray(exercisesTable.slug, SLUGS));
});

const today = () => request(app).get("/api/client-portal/training/today");
const start = (planDayId: number, clientUuid = randomUUID()) => request(app).post("/api/client-portal/training/sessions").send({ clientUuid, planDayId });
const putSet = (sid: number, planExerciseId: number, setNumber: number, extra: object = {}, clientUuid = randomUUID()) =>
  request(app).put(`/api/client-portal/training/sessions/${sid}/sets`).send({ clientUuid, planExerciseId, setNumber, ...extra });

let sessionId: number;
const startUuid = randomUUID();

describe("authentication and isolation (client)", () => {
  it("no session → 401", async () => { as(null); expect((await today()).status).toBe(401); });
  it("client without a plan gets 404, not someone else's plan", async () => {
    as(CA2); expect((await today()).status).toBe(404);
    as(CB1); expect((await today()).status).toBe(404);
  });
  it("another client cannot start a session on A1's plan day", async () => {
    as(CA2); expect((await start(day1)).status).toBe(404);
    as(CB1); expect((await start(day1)).status).toBe(404);
  });
});

describe("today screen", () => {
  it("first day, rest and weight step by equipment, trainer's rest overrides the table", async () => {
    as(CA1);
    const r = await today();
    expect(r.status).toBe(200);
    expect(r.body.today).toMatchObject({ name: "Dzień A", position: { index: 1, total: 2 }, exerciseCount: 2, trainerNote: "Uwaga trenera", estimatedMinutes: 45 });
    expect(r.body.today.equipment).toEqual(["Sztanga"]);
    const [bar, body] = r.body.today.exercises;
    expect(bar).toMatchObject({ weightStepKg: 2.5, showWeight: true, sets: 3, reps: "8–10", rir: 2, restSource: "default" });
    expect(bar.restText).toBe("1,5 min–2 min"); // beginner, main, session <= 1 h
    expect(body).toMatchObject({ showWeight: false, weightStepKg: null, restSource: "trainer", restText: "ok. 45 s" });
    expect(r.body.today.warmup.length).toBeGreaterThan(0);
    expect(r.body.today.cooldown.length).toBeGreaterThan(0);
    expect(r.body.client.firstName).toBe("Ala");
  });
});

describe("set logging, idempotency and corrections", () => {
  it("starts a session (idempotent by clientUuid and by day)", async () => {
    as(CA1);
    const s = await start(day1, startUuid);
    expect(s.status).toBe(201);
    sessionId = s.body.id;
    const again = await start(day1, startUuid);
    expect(again.body.id).toBe(sessionId);
    const other = await start(day1);
    expect(other.body.id).toBe(sessionId); // one active session per day
    const t = await today();
    expect(t.body.today.activeSession.id).toBe(sessionId);
  });
  it("saves a set; the same UUID again does not duplicate", async () => {
    as(CA1);
    const u = randomUUID();
    const r1 = await putSet(sessionId, pe1, 1, { weightKg: 60, reps: 8, rir: 2 }, u);
    expect(r1.status).toBe(200);
    const r2 = await putSet(sessionId, pe1, 1, { weightKg: 60, reps: 8, rir: 2 }, u);
    expect(r2.body.duplicate).toBe(true);
    const rows = await db.select().from(setLogsTable).where(eq(setLogsTable.sessionId, sessionId));
    expect(rows).toHaveLength(1);
  });
  it("correction (new UUID, same set) replaces the value", async () => {
    as(CA1);
    await putSet(sessionId, pe1, 1, { weightKg: 62.5, reps: 8, rir: 1 });
    const rows = await db.select().from(setLogsTable).where(eq(setLogsTable.sessionId, sessionId));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.weightKg)).toBe(62.5);
    expect(rows[0]!.rir).toBe(1);
  });
  it("rejects invalid values (RIR 5, negative weight, exercise from another day)", async () => {
    as(CA1);
    expect((await putSet(sessionId, pe1, 2, { weightKg: 60, reps: 8, rir: 5 })).status).toBe(400);
    expect((await putSet(sessionId, pe1, 2, { weightKg: -1, reps: 8 })).status).toBe(400);
    expect((await putSet(sessionId, pe3, 1, { weightKg: 60, reps: 8 })).status).toBe(403);
  });
  it("other clients cannot write to or finish this session", async () => {
    as(CA2);
    expect((await putSet(sessionId, pe1, 3, { weightKg: 1, reps: 1 })).status).toBe(404);
    expect((await request(app).post(`/api/client-portal/training/sessions/${sessionId}/finish`).send({ status: "completed" })).status).toBe(404);
    as(CB1);
    expect((await request(app).post(`/api/client-portal/training/sessions/${sessionId}/pain`).send({ clientUuid: randomUUID(), area: "Kolano", severity: 2 })).status).toBe(404);
  });
  it("a set UUID cannot be reused in another session (409)", async () => {
    as(CA1);
    const u = randomUUID();
    await putSet(sessionId, pe1, 2, { weightKg: 60, reps: 8 }, u);
    const s2 = await start(day2);
    const r = await putSet(s2.body.id, pe3, 1, { weightKg: 60, reps: 8 }, u);
    expect(r.status).toBe(409);
    await db.delete(workoutSessionsTable).where(eq(workoutSessionsTable.id, s2.body.id));
  });
});

describe("pain report → exercise skipped → trainer sees it", () => {
  const painUuid = randomUUID();
  it("saves the report, skips the remaining sets, is idempotent, validates input", async () => {
    as(CA1);
    const bad = (extra: object) => request(app).post(`/api/client-portal/training/sessions/${sessionId}/pain`).send({ clientUuid: randomUUID(), planExerciseId: pe2, area: "Kolano", severity: 3, ...extra });
    expect((await bad({ area: "Serce" })).status).toBe(400);
    expect((await bad({ severity: 6 })).status).toBe(400);
    expect((await bad({ description: "x".repeat(501) })).status).toBe(400);
    const r = await request(app).post(`/api/client-portal/training/sessions/${sessionId}/pain`)
      .send({ clientUuid: painUuid, planExerciseId: pe2, area: "Bark", severity: 4, description: "  ostry przy unoszeniu  " });
    expect(r.status).toBe(201);
    expect(r.body.message).toContain("Przerwij to ćwiczenie");
    const again = await request(app).post(`/api/client-portal/training/sessions/${sessionId}/pain`)
      .send({ clientUuid: painUuid, planExerciseId: pe2, area: "Bark", severity: 4 });
    expect(again.body.duplicate).toBe(true);
    expect(await db.select().from(painReportsTable).where(eq(painReportsTable.sessionId, sessionId))).toHaveLength(1);
    const skipped = await db.select().from(setLogsTable).where(eq(setLogsTable.exerciseId, exBody));
    expect(skipped.filter((s) => s.sessionId === sessionId && s.skipped)).toHaveLength(3);
  });
  it("own trainer sees the report and can mark it read; the other trainer cannot", async () => {
    as(TA);
    const list = await request(app).get(`/api/clients/${a1}/pain-reports`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ area: "Bark", severity: 4, description: "ostry przy unoszeniu", readByTrainerAt: null });
    const id = list.body[0].id;
    as(TB);
    expect((await request(app).get(`/api/clients/${a1}/pain-reports`)).status).toBe(404);
    expect((await request(app).patch(`/api/clients/${a1}/pain-reports/${id}/read`)).status).toBe(404);
    as(TA);
    expect((await request(app).patch(`/api/clients/${a1}/pain-reports/${id}/read`)).status).toBe(200);
    expect((await request(app).get(`/api/clients/${a1}/pain-reports`)).body[0].readByTrainerAt).not.toBeNull();
  });
});

describe("finish, summary, previous result and record", () => {
  it("finishes with rating and note, returns the summary; repeating returns the same", async () => {
    as(CA1);
    await putSet(sessionId, pe1, 2, { weightKg: 60, reps: 8, rir: 2 });
    await putSet(sessionId, pe1, 3, { weightKg: 60, reps: 8, rir: 2 });
    const body = { status: "completed", rating: "just_right", note: "Dobrze poszło" };
    const f = await request(app).post(`/api/client-portal/training/sessions/${sessionId}/finish`).send(body);
    expect(f.status).toBe(200);
    expect(f.body).toMatchObject({ status: "completed", sets: 3, week: { done: 1, target: 2 } });
    expect(f.body.records).toEqual([]); // first time: no baseline
    const f2 = await request(app).post(`/api/client-portal/training/sessions/${sessionId}/finish`).send(body);
    expect(f2.body.sets).toBe(3);
    const [row] = await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.id, sessionId));
    expect(row).toMatchObject({ status: "completed", sessionRating: "just_right", notes: "Dobrze poszło", isCompleted: true });
  });
  it("a finished session no longer accepts sets", async () => {
    as(CA1);
    expect((await putSet(sessionId, pe1, 1, { weightKg: 1, reps: 1 })).status).toBe(409);
  });
  it("next day is offered, then the cycle returns to day one with the previous result", async () => {
    as(CA1);
    // A session finished "today" → no training left for today, the next one is shown.
    const t = await today();
    expect(t.body.today).toBeNull();
    expect(t.body.next.name).toBe("Dzień B");
    expect(t.body.lastSession.id).toBe(sessionId);
    // Make the first session look like yesterday's and the plan returns to day 2 → day 1.
    await db.update(workoutSessionsTable).set({ completedAt: new Date(Date.now() - 86_400_000 * 2) }).where(eq(workoutSessionsTable.id, sessionId));
    const s2 = await start(day2);
    await putSet(s2.body.id, pe3, 1, { weightKg: 65, reps: 8, rir: 1 }); // best so far is 62.5 at 8 reps (corrected set) → record, +2.5
    const f = await request(app).post(`/api/client-portal/training/sessions/${s2.body.id}/finish`).send({ status: "completed", rating: "too_easy" });
    expect(f.body.records).toHaveLength(1);
    expect(f.body.records[0]).toMatchObject({ weightKg: 65, reps: 8, gainKg: 2.5 });
    await db.update(workoutSessionsTable).set({ completedAt: new Date(Date.now() - 86_400_000) }).where(eq(workoutSessionsTable.id, s2.body.id));
    const t2 = await today();
    expect(t2.body.today.name).toBe("Dzień A");
    const bar = t2.body.today.exercises[0];
    expect(bar.previous.map((p: { weightKg: number }) => p.weightKg)).toEqual([65]); // latest session of this exercise
    expect(bar.record).toMatchObject({ weightKg: 65, reps: 8 });
  });
  it("aborted session is stored as aborted and does not count as completed", async () => {
    as(CA1);
    const s = await start(day1);
    const f = await request(app).post(`/api/client-portal/training/sessions/${s.body.id}/finish`).send({ status: "aborted" });
    expect(f.body.status).toBe("aborted");
    expect(f.body.week.done).toBe(2); // the two completed ones
    const again = await start(day1);
    expect(again.status).toBe(201); // the day is not blocked by the aborted attempt
    expect(again.body.id).not.toBe(s.body.id);
  });
});

describe("trainer views", () => {
  it("lists sessions with status and rating, details with sets and pain; records", async () => {
    as(TA);
    const list = await request(app).get(`/api/clients/${a1}/training-sessions`);
    expect(list.status).toBe(200);
    const first = list.body.find((s: { id: number }) => s.id === sessionId);
    expect(first).toMatchObject({ status: "completed", rating: "just_right", note: "Dobrze poszło", sets: 3, pain: 1, legacy: false });
    const detail = await request(app).get(`/api/clients/${a1}/training-sessions/${sessionId}`);
    expect(detail.body.sets.filter((s: { skipped: boolean }) => !s.skipped)).toHaveLength(3);
    expect(detail.body.pain).toHaveLength(1);
    const rec = await request(app).get(`/api/clients/${a1}/training-records`);
    expect(rec.body[0]).toMatchObject({ name: "Test sztanga", weightKg: 65, reps: 8 });
  });
  it("trainer B and clients of other trainers get 404; no session → 401", async () => {
    as(TB);
    for (const p of [`training-sessions`, `training-sessions/${sessionId}`, `training-records`, `pain-reports`]) {
      expect((await request(app).get(`/api/clients/${a1}/${p}`)).status).toBe(404);
    }
    as(TA);
    expect((await request(app).get(`/api/clients/${b1}/training-sessions`)).status).toBe(404);
    as(null);
    expect((await request(app).get(`/api/clients/${a1}/training-sessions`)).status).toBe(401);
  });
});
