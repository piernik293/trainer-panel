/**
 * Integration tests — full plan save chain (POST plan → days → exercises).
 *
 * Verifies that the sequential save flow used by the wizard's "Zapisz plan"
 * button persists correctly to the database without silent failures:
 *
 *   Chain: POST /clients/:id/plans
 *       → N× POST /plans/:id/days
 *       → M× POST /plans/:id/days/:dayId/exercises
 *
 * Scenarios covered:
 *   1. Happy path — typical 3-day plan with exercises per day.
 *   2. Empty exercise day — a day with zero exercises saves correctly.
 *   3. Dense day — a single day with many exercises (simulates max-exercise case).
 *   4. surveyId null guard — missing/invalid surveyId returns 404 and makes no
 *      partial write (no orphaned plan row in the DB).
 *   5. Bulk draft endpoint (POST /clients/:id/plans/draft) — transactional save
 *      happy path and rollback on invalid exerciseId leaves no orphaned plan row.
 *
 * Tests are self-contained: beforeAll creates all fixture rows; afterAll
 * deletes them via FK cascade so the DB is left clean.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

// The real Clerk middleware is not needed for this database-backed integration
// suite. Keep the request authenticated as the fixture trainer so the route
// ownership checks exercise the same path as production.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "plans_save_chain_test_trainer" }),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import app from "../../app";
import {
  db,
  pool,
  clientsTable,
  trainersTable,
  exercisesTable,
  workoutPlansTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
} from "@workspace/db";
import { surveysTable } from "@workspace/db";

// ─── Fixture data ─────────────────────────────────────────────────────────────

const TEST_EMAIL = "plans-save-chain-test@example.invalid";
const TEST_TRAINER_CLERK_ID = "plans_save_chain_test_trainer";
const INCOMPATIBLE_EQUIPMENT_SLUG = "plans-save-chain-incompatible-equipment";
const INCOMPATIBLE_LOCATION_SLUG = "plans-save-chain-incompatible-location";
const INCOMPATIBLE_EQUIPMENT_EXERCISE_ID = 900_001;
const INCOMPATIBLE_LOCATION_EXERCISE_ID = 900_002;

let testTrainerId: number;
let testClientId: number;
let testSurveyId: number;
let incompatibleEquipmentExerciseId: number;
let incompatibleLocationExerciseId: number;

// Exercise IDs known to exist in the dev DB (seeded on startup).
// Exercise 4 = Wyciskanie hantli nad głowę (confirmed in other integration tests).
const EXERCISE_IDS = [1, 2, 3, 4] as const;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Remove any leftover rows from a previous interrupted run.
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TEST_TRAINER_CLERK_ID));
  await db
    .delete(exercisesTable)
    .where(inArray(exercisesTable.slug, [INCOMPATIBLE_EQUIPMENT_SLUG, INCOMPATIBLE_LOCATION_SLUG]));

  const [trainer] = await db
    .insert(trainersTable)
    .values({
      clerkUserId: TEST_TRAINER_CLERK_ID,
      email: "plans-save-chain-trainer@example.invalid",
    })
    .returning();
  testTrainerId = trainer.id;

  const [client] = await db
    .insert(clientsTable)
    .values({
      firstName: "SaveChain",
      lastName: "TestFixture",
      email: TEST_EMAIL,
      trainerId: testTrainerId,
    })
    .returning();
  testClientId = client.id;

  const [incompatibleEquipmentExercise] = await db
    .insert(exercisesTable)
    .values({
      id: INCOMPATIBLE_EQUIPMENT_EXERCISE_ID,
      name: "Fixture — ćwiczenie z niedostępnym sprzętem",
      slug: INCOMPATIBLE_EQUIPMENT_SLUG,
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Kettlebell"],
      trainingLocation: ["Siłownia"],
    })
    .returning({ id: exercisesTable.id });
  incompatibleEquipmentExerciseId = incompatibleEquipmentExercise.id;

  const [incompatibleLocationExercise] = await db
    .insert(exercisesTable)
    .values({
      id: INCOMPATIBLE_LOCATION_EXERCISE_ID,
      name: "Fixture — ćwiczenie z niedostępną lokalizacją",
      slug: INCOMPATIBLE_LOCATION_SLUG,
      mainMuscleGroup: "Klatka piersiowa",
      equipment: ["Sztanga"],
      trainingLocation: ["Dom"],
    })
    .returning({ id: exercisesTable.id });
  incompatibleLocationExerciseId = incompatibleLocationExercise.id;

  const [survey] = await db
    .insert(surveysTable)
    .values({
      clientId: testClientId,
      experienceLevel: "Średniozaawansowany",
      trainingLocation: "Siłownia",
      equipment: "Sztanga,Hantle,Drążek,Ławka,Masa własnego ciała",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      advancedMethodsToAvoid: [],
    })
    .returning();
  testSurveyId = survey.id;
});

// ─── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Cascade deletes plan → days → exercises rows as well.
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
  await db
    .delete(exercisesTable)
    .where(inArray(exercisesTable.slug, [INCOMPATIBLE_EQUIPMENT_SLUG, INCOMPATIBLE_LOCATION_SLUG]));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TEST_TRAINER_CLERK_ID));
  await pool.end();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createPlan(overrides: Partial<{ title: string; surveyId: number }> = {}) {
  return request(app)
    .post(`/api/clients/${testClientId}/plans`)
    .send({
      title: "Test Plan — save chain",
      surveyId: testSurveyId,
      goal: "Hipertrofia",
      ...overrides,
    });
}

async function addDay(planId: number, dayName: string, durationMinutes?: number) {
  return request(app)
    .post(`/api/plans/${planId}/days`)
    .send({
      dayName,
      subtitle: "Górna partia",
      estimatedDurationMinutes: durationMinutes ?? 60,
    });
}

async function addExercise(planId: number, dayId: number, exerciseId: number, sets = 3) {
  return request(app)
    .post(`/api/plans/${planId}/days/${dayId}/exercises`)
    .send({
      exerciseId,
      workingSets: sets,
      repType: "range",
      repRangeMin: 8,
      repRangeMax: 12,
      restSeconds: 90,
      rir: 2,
    });
}

// ─── Suite 1: Happy path — full 3-day plan ────────────────────────────────────

describe("Full plan save chain — happy path", () => {
  let planId: number;

  it("POST /clients/:id/plans creates a draft plan and returns 201", async () => {
    const res = await createPlan();

    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(testClientId);
    expect(res.body.surveyId).toBe(testSurveyId);
    expect(res.body.status).toBe("draft");
    expect(res.body.title).toBe("Test Plan — save chain");
    expect(res.body.goal).toBe("Hipertrofia");
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days).toHaveLength(0);
    planId = res.body.id as number;
  });

  it("POST /plans/:id/days adds Day 1 and returns the updated plan", async () => {
    const res = await addDay(planId, "Klatka piersiowa + Triceps");

    expect(res.status).toBe(201);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].dayName).toBe("Klatka piersiowa + Triceps");
    expect(res.body.days[0].dayOrder).toBe(1);
    expect(res.body.days[0].exercises).toHaveLength(0);
  });

  it("POST /plans/:id/days adds Day 2 with dayOrder=2", async () => {
    const res = await addDay(planId, "Plecy + Biceps");

    expect(res.status).toBe(201);
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[1].dayOrder).toBe(2);
  });

  it("POST /plans/:id/days adds Day 3 with dayOrder=3", async () => {
    const res = await addDay(planId, "Nogi + Barki");

    expect(res.status).toBe(201);
    expect(res.body.days).toHaveLength(3);
    expect(res.body.days[2].dayOrder).toBe(3);
  });

  it("adding exercises to Day 1 — returns plan with correct exercise count", async () => {
    // Fetch the plan to get the created day IDs.
    const planRes = await request(app).get(`/api/plans/${planId}`).expect(200);
    const day1Id = planRes.body.days[0].id as number;

    // Add 3 exercises to Day 1.
    let lastRes = await addExercise(planId, day1Id, EXERCISE_IDS[0]);
    expect(lastRes.status).toBe(201);

    lastRes = await addExercise(planId, day1Id, EXERCISE_IDS[1]);
    expect(lastRes.status).toBe(201);

    lastRes = await addExercise(planId, day1Id, EXERCISE_IDS[2]);
    expect(lastRes.status).toBe(201);

    // The last response reflects all 3 exercises on Day 1.
    const day1 = lastRes.body.days.find((d: { id: number }) => d.id === day1Id);
    expect(day1.exercises).toHaveLength(3);
    // orderInDay values must be sequential starting at 1.
    const orders = day1.exercises.map((e: { orderInDay: number }) => e.orderInDay).sort();
    expect(orders).toEqual([1, 2, 3]);
  });

  it("adding exercises to Day 2 — Day 1's exercises are not affected", async () => {
    const planRes = await request(app).get(`/api/plans/${planId}`).expect(200);
    const day1Id = planRes.body.days[0].id as number;
    const day2Id = planRes.body.days[1].id as number;

    await addExercise(planId, day2Id, EXERCISE_IDS[0]);
    const lastRes = await addExercise(planId, day2Id, EXERCISE_IDS[3]);
    expect(lastRes.status).toBe(201);

    const day1 = lastRes.body.days.find((d: { id: number }) => d.id === day1Id);
    const day2 = lastRes.body.days.find((d: { id: number }) => d.id === day2Id);
    expect(day1.exercises).toHaveLength(3); // unchanged
    expect(day2.exercises).toHaveLength(2);
  });

  it("DB verification — plan row has correct clientId and surveyId", async () => {
    const [row] = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.id, planId));

    expect(row).toBeDefined();
    expect(row.clientId).toBe(testClientId);
    expect(row.surveyId).toBe(testSurveyId);
    expect(row.status).toBe("draft");
    expect(row.experienceLevelUsed).toBe("Średniozaawansowany");
  });

  it("DB verification — 3 day rows with sequential dayOrder values", async () => {
    const rows = await db
      .select()
      .from(workoutPlanDaysTable)
      .where(eq(workoutPlanDaysTable.planId, planId));

    expect(rows).toHaveLength(3);
    const orders = rows.map((r) => r.dayOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3]);
  });

  it("DB verification — exercise rows have correct exerciseId and prescription fields", async () => {
    const planRes = await request(app).get(`/api/plans/${planId}`).expect(200);
    const day1Id = planRes.body.days[0].id as number;
    const day2Id = planRes.body.days[1].id as number;

    const day1Rows = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, day1Id));

    const day2Rows = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, day2Id));

    expect(day1Rows).toHaveLength(3);
    expect(day2Rows).toHaveLength(2);

    // Spot-check prescription fields saved on a Day 1 exercise.
    const first = day1Rows.find((r) => r.orderInDay === 1);
    expect(first).toBeDefined();
    expect(first!.workingSets).toBe(3);
    expect(first!.repType).toBe("range");
    expect(first!.repRangeMin).toBe(8);
    expect(first!.repRangeMax).toBe(12);
    expect(first!.restSeconds).toBe(90);
    expect(first!.rir).toBe(2);
  });

  it("GET /plans/:id — full plan response matches DB row counts", async () => {
    const res = await request(app).get(`/api/plans/${planId}`).expect(200);

    expect(res.body.days).toHaveLength(3);

    const totalExercises = (res.body.days as { exercises: unknown[] }[])
      .reduce((sum, d) => sum + d.exercises.length, 0);
    // Day 1: 3 exercises, Day 2: 2 exercises, Day 3: 0 exercises (not added yet).
    expect(totalExercises).toBe(5);
  });
});

// ─── Suite 2: Empty exercise day ─────────────────────────────────────────────

describe("Edge case — day with zero exercises", () => {
  let planId: number;
  let emptyDayId: number;

  it("creates a plan and adds an empty day", async () => {
    const planRes = await createPlan({ title: "Test Plan — empty day edge case" });
    expect(planRes.status).toBe(201);
    planId = planRes.body.id as number;

    const dayRes = await addDay(planId, "Aktywna regeneracja");
    expect(dayRes.status).toBe(201);
    emptyDayId = dayRes.body.days[0].id as number;
  });

  it("GET /plans/:id returns the day with an empty exercises array", async () => {
    const res = await request(app).get(`/api/plans/${planId}`).expect(200);

    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].id).toBe(emptyDayId);
    expect(res.body.days[0].exercises).toHaveLength(0);
  });

  it("DB verification — day row exists, zero exercise rows", async () => {
    const dayRows = await db
      .select()
      .from(workoutPlanDaysTable)
      .where(eq(workoutPlanDaysTable.planId, planId));

    const exRows = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, emptyDayId));

    expect(dayRows).toHaveLength(1);
    expect(exRows).toHaveLength(0);
  });
});

// ─── Suite 3: Dense day (many exercises) ─────────────────────────────────────

describe("Edge case — day with many exercises", () => {
  let planId: number;
  let denseDayId: number;
  const EXERCISE_COUNT = 6;

  it("creates a plan and adds a single day with many exercises", async () => {
    const planRes = await createPlan({ title: "Test Plan — dense day edge case" });
    expect(planRes.status).toBe(201);
    planId = planRes.body.id as number;

    const dayRes = await addDay(planId, "Full Body — pełny trening");
    expect(dayRes.status).toBe(201);
    denseDayId = dayRes.body.days[0].id as number;

    // Alternate through available exercise IDs to avoid any unique constraint issues.
    let lastRes: Awaited<ReturnType<typeof addExercise>> | null = null;
    for (let i = 0; i < EXERCISE_COUNT; i++) {
      const exId = EXERCISE_IDS[i % EXERCISE_IDS.length];
      lastRes = await addExercise(planId, denseDayId, exId);
      expect(lastRes.status).toBe(201);
    }

    // Final response must list all exercises.
    const day = lastRes!.body.days.find((d: { id: number }) => d.id === denseDayId);
    expect(day.exercises).toHaveLength(EXERCISE_COUNT);
  });

  it("DB verification — correct number of exercise rows for the dense day", async () => {
    const rows = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(eq(workoutPlanExercisesTable.dayId, denseDayId));

    expect(rows).toHaveLength(EXERCISE_COUNT);

    // Verify orderInDay values are sequential and cover 1…N.
    const orders = rows.map((r) => r.orderInDay).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: EXERCISE_COUNT }, (_, i) => i + 1));
  });
});

// ─── Suite 4: surveyId null / invalid guard ───────────────────────────────────

describe("Edge case — surveyId guard prevents partial writes", () => {
  it("returns 404 when surveyId does not exist", async () => {
    const res = await createPlan({ surveyId: 9_999_999 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/wywiad/i);
  });

  it("no plan row is written when surveyId is invalid", async () => {
    // Count plans for this client before the bad request.
    const before = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, testClientId));

    await createPlan({ surveyId: 9_999_999 });

    const after = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, testClientId));

    // The plan count must be the same — no orphan row inserted.
    expect(after.length).toBe(before.length);
  });

  it("returns 400 when surveyId is missing from the request body", async () => {
    const res = await request(app)
      .post(`/api/clients/${testClientId}/plans`)
      .send({ title: "Missing survey plan" });

    // surveyId is required (z.number().int().positive()), so Zod rejects this.
    expect(res.status).toBe(400);
  });

  it("surveyId belonging to a different client returns 404", async () => {
    // Create a second client and survey.
    const otherEmail = "plans-save-chain-other@example.invalid";
    await db.delete(clientsTable).where(eq(clientsTable.email, otherEmail));

    const [otherClient] = await db
      .insert(clientsTable)
      .values({ firstName: "Other", lastName: "Client", email: otherEmail, trainerId: testTrainerId })
      .returning();

    const [otherSurvey] = await db
      .insert(surveysTable)
      .values({
        clientId: otherClient.id,
        experienceLevel: "Początkujący",
        avoidedExerciseIds: [],
        avoidedExerciseReasons: {},
        advancedMethodsToAvoid: [],
      })
      .returning();

    // Use the other client's surveyId for testClientId — must be rejected.
    const res = await request(app)
      .post(`/api/clients/${testClientId}/plans`)
      .send({ title: "Cross-client survey", surveyId: otherSurvey.id });

    expect(res.status).toBe(404);

    // Clean up the second client.
    await db.delete(clientsTable).where(eq(clientsTable.email, otherEmail));
  });
});

// ─── Suite 5: Bulk draft endpoint — transactional save & rollback ─────────────

describe("POST /clients/:id/plans/draft — transactional bulk save", () => {
  // ── Happy path ───────────────────────────────────────────────────────────

  it("saves a 2-day plan with exercises atomically and returns 201", async () => {
    const res = await request(app)
      .post(`/api/clients/${testClientId}/plans/draft`)
      .send({
        title: "Bulk Draft — happy path",
        surveyId: testSurveyId,
        goal: "Hipertrofia",
        days: [
          {
            dayName: "Klatka piersiowa",
            estimatedDurationMinutes: 60,
            exercises: [
              { exerciseId: EXERCISE_IDS[0], workingSets: 4, repType: "range", repRangeMin: 8, repRangeMax: 12, restSeconds: 90, rir: 2 },
              { exerciseId: EXERCISE_IDS[1], workingSets: 3, repType: "range", repRangeMin: 10, repRangeMax: 15, restSeconds: 60, rir: 1 },
            ],
          },
          {
            dayName: "Plecy",
            estimatedDurationMinutes: 55,
            exercises: [
              { exerciseId: EXERCISE_IDS[2], workingSets: 4, repType: "range", repRangeMin: 6, repRangeMax: 10, restSeconds: 120, rir: 2 },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(testClientId);
    expect(res.body.surveyId).toBe(testSurveyId);
    expect(res.body.status).toBe("draft");
    expect(res.body.title).toBe("Bulk Draft — happy path");

    // Days saved in correct order.
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[0].dayName).toBe("Klatka piersiowa");
    expect(res.body.days[0].dayOrder).toBe(1);
    expect(res.body.days[0].exercises).toHaveLength(2);
    expect(res.body.days[1].dayName).toBe("Plecy");
    expect(res.body.days[1].dayOrder).toBe(2);
    expect(res.body.days[1].exercises).toHaveLength(1);

    // Spot-check prescription fields.
    const firstEx = res.body.days[0].exercises[0];
    expect(firstEx.workingSets).toBe(4);
    expect(firstEx.repType).toBe("range");
    expect(firstEx.repRangeMin).toBe(8);
    expect(firstEx.repRangeMax).toBe(12);
    expect(firstEx.restSeconds).toBe(90);
    expect(firstEx.rir).toBe(2);

    // orderInDay values must be sequential per day.
    const day1Orders = res.body.days[0].exercises.map((e: { orderInDay: number }) => e.orderInDay);
    expect(day1Orders).toEqual([1, 2]);
  });

  it("DB verification — rows are present for the successful bulk save", async () => {
    // Get the plan we just saved (most recent for this client).
    const plans = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, testClientId));

    const bulkPlan = plans.find((p) => p.title === "Bulk Draft — happy path");
    expect(bulkPlan).toBeDefined();

    const days = await db
      .select()
      .from(workoutPlanDaysTable)
      .where(eq(workoutPlanDaysTable.planId, bulkPlan!.id));
    expect(days).toHaveLength(2);

    const dayIds = days.map((d) => d.id);
    const exercises = await db
      .select()
      .from(workoutPlanExercisesTable)
      .where(inArray(workoutPlanExercisesTable.dayId, dayIds));
    // 2 exercises on day 1 + 1 on day 2.
    expect(exercises).toHaveLength(3);
  });

  // ── Rollback on invalid exerciseId ───────────────────────────────────────

  it("returns 404 when a day contains an unknown exerciseId", async () => {
    const res = await request(app)
      .post(`/api/clients/${testClientId}/plans/draft`)
      .send({
        title: "Bulk Draft — bad exercise rollback",
        surveyId: testSurveyId,
        days: [
          {
            dayName: "Dzień 1 — dobry",
            exercises: [
              { exerciseId: EXERCISE_IDS[0], workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 12 },
            ],
          },
          {
            dayName: "Dzień 2 — zły exerciseId",
            exercises: [
              // First exercise is valid; second is bogus — simulates mid-chain failure.
              { exerciseId: EXERCISE_IDS[1], workingSets: 3 },
              { exerciseId: 9_999_999, workingSets: 3 },
            ],
          },
        ],
      });

    // The validation step catches the bad ID before the transaction even opens.
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/9999999/);
  });

  it("no orphaned plan row after the rejected bulk save", async () => {
    const plansBefore = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, testClientId));

    // Fire the same bad request again.
    await request(app)
      .post(`/api/clients/${testClientId}/plans/draft`)
      .send({
        title: "Bulk Draft — orphan guard",
        surveyId: testSurveyId,
        days: [
          {
            dayName: "Dzień 1",
            exercises: [{ exerciseId: EXERCISE_IDS[0], workingSets: 3 }],
          },
          {
            dayName: "Dzień 2",
            exercises: [{ exerciseId: 9_999_999, workingSets: 3 }],
          },
        ],
      });

    const plansAfter = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, testClientId));

    // Plan count must be unchanged — no orphaned rows.
    expect(plansAfter.length).toBe(plansBefore.length);
  });

  // ── Day with zero exercises ───────────────────────────────────────────────

  it("saves a plan where one day has no exercises", async () => {
    const res = await request(app)
      .post(`/api/clients/${testClientId}/plans/draft`)
      .send({
        title: "Bulk Draft — empty day",
        surveyId: testSurveyId,
        days: [
          {
            dayName: "Aktywna regeneracja",
            exercises: [],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].exercises).toHaveLength(0);
  });
});

// ─── Suite 6: Exercise compatibility guards ───────────────────────────────────

describe("Exercise compatibility guards — rejected writes are not persisted", () => {
  const incompatibleDraftCases = [
    {
      label: "niedostępny sprzęt",
      exerciseId: () => incompatibleEquipmentExerciseId,
    },
    {
      label: "niedostępna lokalizacja",
      exerciseId: () => incompatibleLocationExerciseId,
    },
  ] as const;

  it.each(incompatibleDraftCases)(
    "POST /clients/:id/plans/draft returns 422 for $label and does not create a plan",
    async ({ exerciseId }) => {
      const title = `Bulk Draft — compatibility guard — ${exerciseId()}`;
      const plansBefore = await db
        .select()
        .from(workoutPlansTable)
        .where(eq(workoutPlansTable.clientId, testClientId));

      const res = await request(app)
        .post(`/api/clients/${testClientId}/plans/draft`)
        .send({
          title,
          surveyId: testSurveyId,
          goal: "Hipertrofia",
          days: [
            {
              dayName: "Dzień z niezgodnym ćwiczeniem",
              exercises: [{ exerciseId: exerciseId(), workingSets: 3 }],
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("EXERCISE_INCOMPATIBLE_WITH_CLIENT_PROFILE");
      expect(res.body.exerciseId).toBe(exerciseId());

      const plansAfter = await db
        .select()
        .from(workoutPlansTable)
        .where(eq(workoutPlansTable.clientId, testClientId));
      expect(plansAfter.some((plan) => plan.title === title)).toBe(false);
      expect(plansAfter).toHaveLength(plansBefore.length);
    },
  );

  it.each(incompatibleDraftCases)(
    "POST /plans/:id/days/:dayId/exercises returns 422 for $label and does not add a row",
    async ({ exerciseId }) => {
      const planRes = await createPlan({
        title: `Manual Exercise — compatibility guard — ${exerciseId()}`,
      });
      expect(planRes.status).toBe(201);
      const planId = planRes.body.id as number;

      const dayRes = await addDay(planId, "Dzień z niezgodnym ćwiczeniem");
      expect(dayRes.status).toBe(201);
      const dayId = dayRes.body.days[0].id as number;

      const res = await addExercise(planId, dayId, exerciseId());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("EXERCISE_INCOMPATIBLE_WITH_CLIENT_PROFILE");
      expect(res.body.exerciseId).toBe(exerciseId());

      const exerciseRows = await db
        .select()
        .from(workoutPlanExercisesTable)
        .where(eq(workoutPlanExercisesTable.dayId, dayId));
      expect(exerciseRows).toHaveLength(0);
    },
  );
});
