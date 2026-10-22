/**
 * Integration tests for the client portal workout logging flow.
 *
 * Tests are self-contained: beforeAll creates a dedicated client, survey,
 * active plan, plan day, and plan exercise row; afterAll deletes everything
 * via cascade so the DB is left clean.
 *
 * Why self-contained: no existing client has a unique email with an active
 * plan, so hardcoding IDs would be brittle.  Owning the fixture data
 * guarantees deterministic results regardless of DB state.
 */

// Since 5711879 (13.08) the client portal authenticates the client's own
// Clerk session (requireClientAuth) instead of an ?email= lookup. Requests run
// as the primary fixture client unless a test switches portalUserId.
const PORTAL_CLIENT = "portal_test_client";
const PORTAL_OTHER = "portal_test_other";
let portalUserId: string | null = PORTAL_CLIENT;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: portalUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../../app";
import {
  db,
  pool,
  clientsTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  workoutSessionsTable,
  exerciseExecutionLogsTable,
} from "@workspace/db";
import { surveysTable } from "@workspace/db";

beforeAll(async () => {
  await legacyTrainerId();
});

// ─── Fixture IDs (populated in beforeAll) ────────────────────────────────────

let testClientId: number;
let testOtherClientId: number;
let testPlanId: number;
let testDayId: number;
let testPlanExerciseId: number;

const TEST_EMAIL = "portal-test-fixture-do-not-use@example.invalid";
const TEST_EMAIL_OTHER = "portal-test-other-do-not-use@example.invalid";

// ─── Setup: create all required fixture rows ──────────────────────────────────

beforeAll(async () => {
  // Clean up any leftover fixture data from a previous interrupted run.
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL_OTHER));

  // Create primary test client.
  const [client] = await db
    .insert(clientsTable)
    .values({ firstName: "Portal", lastName: "TestFixture", email: TEST_EMAIL, trainerId: await legacyTrainerId(), clerkUserId: PORTAL_CLIENT })
    .returning();
  testClientId = client.id;

  // Create a second client for cross-client rejection tests.
  const [other] = await db
    .insert(clientsTable)
    .values({ firstName: "Other", lastName: "Client", email: TEST_EMAIL_OTHER, trainerId: await legacyTrainerId(), clerkUserId: PORTAL_OTHER })
    .returning();
  testOtherClientId = other.id;

  // A survey row is required by the FK on workout_plans.survey_id.
  const [survey] = await db
    .insert(surveysTable)
    .values({ clientId: testClientId, experienceLevel: "Zaawansowany" })
    .returning();

  // Create an active plan.
  const [plan] = await db
    .insert(workoutPlansTable)
    .values({
      clientId: testClientId,
      surveyId: survey.id,
      guidelineVersionId: 1,   // guideline version 1 is always present in dev DB
      experienceLevelUsed: "Zaawansowany",
      title: "Test Plan — clientPortal integration",
      status: "active",
      activatedAt: new Date(),
    })
    .returning();
  testPlanId = plan.id;

  // Create a plan day.
  const [day] = await db
    .insert(workoutPlanDaysTable)
    .values({ planId: testPlanId, dayOrder: 1, dayName: "Test Day A" })
    .returning();
  testDayId = day.id;

  // Create a plan exercise (exercise 4 = Wyciskanie hantli nad głowę, active in dev DB).
  const [planExercise] = await db
    .insert(workoutPlanExercisesTable)
    .values({
      dayId: testDayId,
      exerciseId: 4,
      orderInDay: 1,
      workingSets: 3,
    })
    .returning();
  testPlanExerciseId = planExercise.id;
});

// ─── Teardown: cascade-delete the primary client (removes plan, days,
//     exercises, sessions, and logs via FK cascade).  The other client
//     has no plan rows so a direct delete is sufficient.

afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL_OTHER));
  await pool.end();
});

// ─── Helper: create a session via the API ────────────────────────────────────

async function createSession(date = "2099-01-15"): Promise<number> {
  const res = await request(app)
    .post("/api/client-portal/sessions")
    .send({
      clientId: testClientId,
      planId: testPlanId,
      planDayId: testDayId,
      sessionDate: date,
    });
  // 201 = new session; 200 = the active session already open for this plan
  // day is returned (one active session per day, see POST /client-portal/sessions).
  expect([200, 201]).toContain(res.status);
  return res.body.id as number;
}

// ─── Suite 1: happy path ──────────────────────────────────────────────────────

describe("Client portal — happy path", () => {
  it("finds the signed-in client's active plan", async () => {
    const res = await request(app)
      .get("/api/client-portal/plan")
      .expect(200);

    expect(res.body.client.id).toBe(testClientId);
    expect(res.body.plan.id).toBe(testPlanId);
    expect(res.body.plan.status).toBe("active");
    expect(Array.isArray(res.body.plan.days)).toBe(true);
    expect(res.body.plan.days.length).toBeGreaterThan(0);
  });

  it("creates a workout session", async () => {
    const res = await request(app)
      .post("/api/client-portal/sessions")
      .send({
        clientId: testClientId,
        planId: testPlanId,
        planDayId: testDayId,
        sessionDate: "2099-01-15",
      })
      .expect(201);

    expect(res.body.clientId).toBe(testClientId);
    expect(res.body.planId).toBe(testPlanId);
    expect(res.body.planDayId).toBe(testDayId);
    expect(res.body.isCompleted).toBe(false);
  });

  it("logs an exercise for a session", async () => {
    const sessionId = await createSession("2099-01-20");

    const res = await request(app)
      .put(`/api/client-portal/sessions/${sessionId}/exercises/${testPlanExerciseId}`)
      .send({
        clientId: testClientId,
        setsCompleted: 4,
        repsCompleted: 10,
        weightKg: 80,
        rir: 2,
        isCompleted: true,
      })
      .expect(200);

    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.planExerciseId).toBe(testPlanExerciseId);
    expect(res.body.setsCompleted).toBe(4);
    expect(res.body.repsCompleted).toBe(10);
    expect(Number(res.body.weightKg)).toBe(80);
    expect(res.body.rir).toBe(2);
    expect(res.body.isCompleted).toBe(true);
  });

  it("full happy path: find plan → start session → log exercise → complete session", async () => {
    // Step 1 — find plan by email
    const planRes = await request(app)
      .get("/api/client-portal/plan")
      .expect(200);
    expect(planRes.body.plan.status).toBe("active");

    // Step 2 — create session
    const sessionId = await createSession("2099-02-01");

    // Step 3 — log an exercise
    await request(app)
      .put(`/api/client-portal/sessions/${sessionId}/exercises/${testPlanExerciseId}`)
      .send({ clientId: testClientId, setsCompleted: 3, repsCompleted: 8, weightKg: 75, isCompleted: true })
      .expect(200);

    // Step 4 — complete the session
    const completeRes = await request(app)
      .patch(`/api/client-portal/sessions/${sessionId}`)
      .send({ clientId: testClientId, isCompleted: true })
      .expect(200);

    expect(completeRes.body.isCompleted).toBe(true);
    expect(completeRes.body.completedAt).not.toBeNull();

    // Step 5 — verify log persisted in DB
    const [log] = await db
      .select()
      .from(exerciseExecutionLogsTable)
      .where(eq(exerciseExecutionLogsTable.sessionId, sessionId));

    expect(log).toBeDefined();
    expect(log.setsCompleted).toBe(3);
    expect(log.isCompleted).toBe(true);
  });
});

// ─── Suite 2: idempotent PUT (update, not duplicate) ──────────────────────────

describe("Client portal — idempotent exercise logging", () => {
  it("PUT twice on the same exercise updates instead of duplicating", async () => {
    const sessionId = await createSession("2099-03-01");

    // First PUT
    const first = await request(app)
      .put(`/api/client-portal/sessions/${sessionId}/exercises/${testPlanExerciseId}`)
      .send({ clientId: testClientId, setsCompleted: 3, repsCompleted: 8, weightKg: 60 })
      .expect(200);

    // Second PUT with different values
    const second = await request(app)
      .put(`/api/client-portal/sessions/${sessionId}/exercises/${testPlanExerciseId}`)
      .send({ clientId: testClientId, setsCompleted: 4, repsCompleted: 10, weightKg: 65 })
      .expect(200);

    // Same log id — no duplicate row
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.setsCompleted).toBe(4);
    expect(second.body.repsCompleted).toBe(10);
    expect(Number(second.body.weightKg)).toBe(65);

    // Confirm exactly one row in DB
    const logs = await db
      .select()
      .from(exerciseExecutionLogsTable)
      .where(eq(exerciseExecutionLogsTable.sessionId, sessionId));

    expect(logs).toHaveLength(1);
    expect(logs[0].setsCompleted).toBe(4);
  });
});

// ─── Suite 3: email not found ─────────────────────────────────────────────────

describe("Client portal — no client account", () => {
  // Replaces the old ?email= cases: access now depends only on the session.
  it("returns 404 with a descriptive message when the account is not linked to a client", async () => {
    portalUserId = "portal_test_unlinked";
    try {
      const res = await request(app).get("/api/client-portal/plan").expect(404);
      expect(res.body.error.toLowerCase()).toMatch(/klient/);
    } finally {
      portalUserId = PORTAL_CLIENT;
    }
  });

  it("returns 401 without a session", async () => {
    portalUserId = null;
    try {
      const res = await request(app).get("/api/client-portal/plan").expect(401);
      expect(res.body.error).toBeTruthy();
    } finally {
      portalUserId = PORTAL_CLIENT;
    }
  });
});

// ─── Suite 4: cross-client access ─────────────────────────────────────────────

describe("Client portal — cross-client access rejected", () => {
  // The other client is signed in and targets the primary client's data.
  // clientId in the body is ignored by the API (identity = session).
  async function asOther<T>(fn: () => Promise<T>): Promise<T> {
    portalUserId = PORTAL_OTHER;
    try {
      return await fn();
    } finally {
      portalUserId = PORTAL_CLIENT;
    }
  }

  it("rejects exercise logging for a session that belongs to a different client", async () => {
    const sessionId = await createSession("2099-04-01");

    const res = await asOther(() =>
      request(app)
        .put(`/api/client-portal/sessions/${sessionId}/exercises/${testPlanExerciseId}`)
        .send({ clientId: testClientId, setsCompleted: 5 })
        .expect(404),
    );

    expect(res.body.error).toBeTruthy();
  });

  it("rejects PATCH (session completion) for a session belonging to a different client", async () => {
    const sessionId = await createSession("2099-04-02");

    const res = await asOther(() =>
      request(app)
        .patch(`/api/client-portal/sessions/${sessionId}`)
        .send({ clientId: testClientId, isCompleted: true })
        .expect(404),
    );

    expect(res.body.error).toBeTruthy();

    // Confirm DB row is unchanged
    const [session] = await db
      .select()
      .from(workoutSessionsTable)
      .where(eq(workoutSessionsTable.id, sessionId));
    expect(session.isCompleted).toBe(false);
  });

  it("rejects creating a session for a plan owned by a different client (404)", async () => {
    const res = await asOther(() =>
      request(app)
        .post("/api/client-portal/sessions")
        .send({
          clientId: testClientId,   // ignored — the other client does not own testPlanId
          planId: testPlanId,
          planDayId: testDayId,
          sessionDate: "2099-05-01",
        })
        .expect(404),
    );

    expect(res.body.error).toBeTruthy();
  });
});
