/**
 * Focused integration tests — workout history, persistent loads, progression.
 *
 * Covers the new session lifecycle:
 *   POST /client-portal/sessions/open   (get-or-create active session + previous loads)
 *   GET  /client-portal/history         (completed sessions, paginated)
 *   GET  /client-portal/sessions/:id    (logs enriched with exercise names)
 *   PATCH feedback fields + log snapshots
 *
 * Clerk is mocked to authenticate as the fixture client; everything else
 * (DB, routes, middleware) is real. Self-contained fixtures, cascade cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { vi } from "vitest";
import { eq } from "drizzle-orm";

const TEST_CLERK_ID = "user_workout_history_test_fixture";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: TEST_CLERK_ID }),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import app from "../../app";
import {
  db,
  pool,
  clientsTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  surveysTable,
  trainersTable,
} from "@workspace/db";
import { computeProgressionSuggestion } from "../clientPortal";

const TEST_EMAIL = "workout-history-fixture@example.invalid";

let clientId: number;
let planId: number;
let dayId: number;
let planExerciseId: number;

beforeAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));

  const TRAINER_CLERK_ID = "user_workout_history_test_trainer";
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TRAINER_CLERK_ID));
  const [trainer] = await db
    .insert(trainersTable)
    .values({ clerkUserId: TRAINER_CLERK_ID, email: "workout-history-trainer@example.invalid" })
    .returning();

  const [client] = await db
    .insert(clientsTable)
    .values({ firstName: "History", lastName: "Fixture", email: TEST_EMAIL, clerkUserId: TEST_CLERK_ID, trainerId: trainer!.id })
    .returning();
  clientId = client!.id;

  const [survey] = await db
    .insert(surveysTable)
    .values({ clientId, experienceLevel: "Zaawansowany" })
    .returning();

  const [plan] = await db
    .insert(workoutPlansTable)
    .values({
      clientId,
      surveyId: survey!.id,
      guidelineVersionId: 1,
      experienceLevelUsed: "Zaawansowany",
      title: "History Test Plan",
      status: "active",
      activatedAt: new Date(),
    })
    .returning();
  planId = plan!.id;

  const [day] = await db
    .insert(workoutPlanDaysTable)
    .values({ planId, dayOrder: 1, dayName: "Dzień A" })
    .returning();
  dayId = day!.id;

  const [ex] = await db
    .insert(workoutPlanExercisesTable)
    .values({
      dayId,
      exerciseId: 4,
      orderInDay: 1,
      workingSets: 3,
      repType: "range",
      repRangeMin: 8,
      repRangeMax: 12,
      rir: 2,
    })
    .returning();
  planExerciseId = ex!.id;
});

afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, "user_workout_history_test_trainer"));
  await pool.end();
});

describe("workout history + persistent loads", () => {
  let firstSessionId: number;
  let secondSessionId: number;

  it("open creates a fresh session and returns it again while active", async () => {
    const res = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    firstSessionId = res.body.session.id;
    expect(res.body.session.isCompleted).toBe(false);
    expect(res.body.session.logs).toEqual([]);
    expect(res.body.previous).toEqual({});

    // Re-open: same active session, not a new one.
    const again = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    expect(again.body.session.id).toBe(firstSessionId);
  });

  it("log upsert stores prescription snapshot; completion keeps history", async () => {
    const log = await request(app)
      .put(`/api/client-portal/sessions/${firstSessionId}/exercises/${planExerciseId}`)
      .send({ setsCompleted: 3, repsCompleted: 12, weightKg: 20, rir: 2, isCompleted: true })
      .expect(200);
    expect(log.body.exerciseId).toBe(4);
    expect(log.body.exerciseNameSnapshot).toBeTruthy();
    expect(log.body.plannedSets).toBe(3);
    expect(log.body.plannedRepMax).toBe(12);

    const patched = await request(app)
      .patch(`/api/client-portal/sessions/${firstSessionId}`)
      .send({ isCompleted: true, difficultyRating: 7, hadPain: false, energyLevel: "high" })
      .expect(200);
    expect(patched.body.isCompleted).toBe(true);
    expect(patched.body.difficultyRating).toBe(7);
    expect(patched.body.hadPain).toBe(false);
    expect(patched.body.energyLevel).toBe("high");
  });

  it("re-opening after completion creates a NEW empty session with previous loads + suggestion", async () => {
    const res = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    secondSessionId = res.body.session.id;
    expect(secondSessionId).not.toBe(firstSessionId);
    expect(res.body.session.isCompleted).toBe(false);
    expect(res.body.session.logs).toEqual([]); // fresh checkboxes

    const prev = res.body.previous[String(planExerciseId)];
    expect(prev).toBeTruthy();
    expect(Number(prev.weightKg)).toBe(20);
    expect(prev.repsCompleted).toBe(12);
    expect(prev.setsCompleted).toBe(3);
    // 3/3 sets, top of range, RIR met, no pain → increase
    expect(prev.suggestion).toBe("increase");
  });

  it("history lists only completed sessions, newest first, with counts", async () => {
    const res = await request(app).get("/api/client-portal/history?limit=12&offset=0").expect(200);
    const ids = res.body.items.map((i: { id: number }) => i.id);
    expect(ids).toContain(firstSessionId);
    expect(ids).not.toContain(secondSessionId); // active session not in history
    const item = res.body.items.find((i: { id: number }) => i.id === firstSessionId);
    expect(item.completedExercises).toBe(1);
    expect(item.completedSets).toBe(3);
    expect(item.dayName).toBe("Dzień A");
  });

  it("both sessions appear separately in history after completing the second", async () => {
    await request(app)
      .put(`/api/client-portal/sessions/${secondSessionId}/exercises/${planExerciseId}`)
      .send({ setsCompleted: 3, repsCompleted: 7, weightKg: 22.5, isCompleted: true })
      .expect(200);
    await request(app)
      .patch(`/api/client-portal/sessions/${secondSessionId}`)
      .send({ isCompleted: true })
      .expect(200);

    const res = await request(app).get("/api/client-portal/history").expect(200);
    const ids = res.body.items.map((i: { id: number }) => i.id);
    expect(ids).toContain(firstSessionId);
    expect(ids).toContain(secondSessionId);
    // Newest first.
    expect(ids.indexOf(secondSessionId)).toBeLessThan(ids.indexOf(firstSessionId));
  });

  it("session detail returns logs with exercise names (read-only history detail)", async () => {
    const res = await request(app).get(`/api/client-portal/sessions/${firstSessionId}`).expect(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].exerciseName).toBeTruthy();
    expect(Number(res.body.logs[0].weightKg)).toBe(20);
  });

  it("below-range previous result yields repeat_or_reduce; undo affects only that session", async () => {
    // Second session logged 7 reps < repRangeMin 8 → repeat_or_reduce on next open.
    const res = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    const thirdSessionId = res.body.session.id;
    const prev = res.body.previous[String(planExerciseId)];
    expect(Number(prev.weightKg)).toBe(22.5);
    expect(prev.suggestion).toBe("repeat_or_reduce");

    // Only one active session per day: undoing session 2 while session 3 is
    // active must be rejected with 409, not corrupt the invariant.
    await request(app)
      .patch(`/api/client-portal/sessions/${secondSessionId}`)
      .send({ isCompleted: false })
      .expect(409);

    // Complete the empty third session, then undo second — allowed now.
    await request(app).patch(`/api/client-portal/sessions/${thirdSessionId}`).send({ isCompleted: true }).expect(200);
    await request(app)
      .patch(`/api/client-portal/sessions/${secondSessionId}`)
      .send({ isCompleted: false })
      .expect(200);
    // First session stays completed — undo affects only the selected session.
    const first = await request(app).get(`/api/client-portal/sessions/${firstSessionId}`).expect(200);
    expect(first.body.isCompleted).toBe(true);
  });

  it("unfinished (unchecked) logs never become previous results", async () => {
    // Session 2 is active again. Uncheck its log but keep typed-in numbers.
    const open1 = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    expect(open1.body.session.id).toBe(secondSessionId);
    await request(app)
      .put(`/api/client-portal/sessions/${secondSessionId}/exercises/${planExerciseId}`)
      .send({ setsCompleted: 1, repsCompleted: 3, weightKg: 99, isCompleted: false })
      .expect(200);
    await request(app).patch(`/api/client-portal/sessions/${secondSessionId}`).send({ isCompleted: true }).expect(200);

    // Previous must come from the newest COMPLETED log (session 1: 20 kg), not 99 kg.
    const open2 = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    const prev = open2.body.previous[String(planExerciseId)];
    expect(Number(prev.weightKg)).toBe(20);
  });

  it("legacy POST /sessions returns the existing active session instead of duplicating", async () => {
    const open = await request(app)
      .post("/api/client-portal/sessions/open")
      .send({ planId, planDayId: dayId })
      .expect(200);
    const res = await request(app)
      .post("/api/client-portal/sessions")
      .send({ planId, planDayId: dayId, sessionDate: "2099-03-01" })
      .expect(200);
    expect(res.body.id).toBe(open.body.session.id);
  });
});

describe("computeProgressionSuggestion rules", () => {
  const base = {
    prevSetsCompleted: 3, prevRepsCompleted: 12, prevRir: 2,
    plannedSets: 3, plannedRepMin: 8, plannedRepMax: 12, plannedRir: 2,
    hadPain: false as boolean | null,
  };
  it("increase when all criteria met", () => {
    expect(computeProgressionSuggestion(base)).toBe("increase");
  });
  it("pain always blocks increase", () => {
    expect(computeProgressionSuggestion({ ...base, hadPain: true })).toBe("repeat_or_reduce");
  });
  it("reps below min → repeat_or_reduce", () => {
    expect(computeProgressionSuggestion({ ...base, prevRepsCompleted: 6 })).toBe("repeat_or_reduce");
  });
  it("mid-range → maintain", () => {
    expect(computeProgressionSuggestion({ ...base, prevRepsCompleted: 10 })).toBe("maintain");
  });
  it("RIR target unmet (not recorded) → maintain, not increase", () => {
    expect(computeProgressionSuggestion({ ...base, prevRir: null })).toBe("maintain");
  });
  it("no RIR target → skip RIR check", () => {
    expect(computeProgressionSuggestion({ ...base, prevRir: null, plannedRir: null })).toBe("increase");
  });
  it("no data → null", () => {
    expect(computeProgressionSuggestion({ ...base, prevSetsCompleted: null, prevRepsCompleted: null })).toBe(null);
  });
});
