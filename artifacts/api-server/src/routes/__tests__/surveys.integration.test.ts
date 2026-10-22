/**
 * Integration tests — avoidedMuscles removal from SurveyForm.
 *
 * Verifies three invariants after removing avoidedMuscles from the trainer
 * survey form's Zod schema and defaultValues:
 *
 *   1. The backend schema (UpsertClientSurveyBody) accepts a well-formed survey
 *      payload that contains no avoidedMuscles key — no 400 error.
 *
 *   2. A previously stored avoidedMuscles value is never erased: because surveys
 *      are append-only (each PUT inserts a new row), the old row's avoidedMuscles
 *      column is untouched after the trainer saves an updated survey without the
 *      field.
 *
 *   3. The new survey row created by a payload without avoidedMuscles stores NULL
 *      for that column — it does not silently inherit or copy the old value.
 *
 * No frontend code is exercised here; tests drive the PUT /clients/:id/survey
 * route via supertest, which is the same path the form's upsertSurvey mutation
 * uses.
 */

// Trainer endpoints require a session: authenticate as the legacy test
// trainer (see __tests__/helpers/legacyTrainer.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import request from "supertest";
import { eq, desc } from "drizzle-orm";
import app from "../../app";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { UpsertClientSurveyBody } from "@workspace/api-zod";

beforeAll(async () => {
  await legacyTrainerId();
});

// ─── Fixture ──────────────────────────────────────────────────────────────────

const TEST_EMAIL = "surveys-avoided-muscles-test@example.invalid";

let testClientId: number;
let seedSurveyId: number;

/** Minimum valid body accepted by PUT /clients/:id/survey (all fields optional). */
const MINIMAL_BODY = {
  experienceLevel: "Średniozaawansowany",
  trainingGoal: "Hipertrofia",
  desiredWeeklyFrequency: 4,
  avoidedExerciseIds: [] as number[],
  avoidedExerciseReasons: {} as Record<string, string>,
  advancedMethodsToAvoid: [] as string[],
};

beforeAll(async () => {
  // Remove leftover fixture data if a previous run was interrupted.
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));

  const [client] = await db
    .insert(clientsTable)
    .values({ firstName: "AvoidedMuscles", lastName: "TestFixture", email: TEST_EMAIL , trainerId: await legacyTrainerId() })
    .returning();
  testClientId = client.id;

  // Seed an initial survey row that has avoidedMuscles populated, simulating a
  // client whose trainer previously filled in the now-removed field.
  const [seed] = await db
    .insert(surveysTable)
    .values({
      clientId: testClientId,
      experienceLevel: "Średniozaawansowany",
      avoidedMuscles: "Łydki (są już wystarczające)",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      advancedMethodsToAvoid: [],
    })
    .returning();
  seedSurveyId = seed.id;
});

afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, TEST_EMAIL));
});

// ─── Schema unit tests (no HTTP) ──────────────────────────────────────────────

describe("UpsertClientSurveyBody schema", () => {
  it("parses a payload without avoidedMuscles — no error", () => {
    const result = UpsertClientSurveyBody.safeParse(MINIMAL_BODY);
    expect(result.success).toBe(true);
  });

  it("parsed output for a payload without avoidedMuscles has avoidedMuscles=undefined", () => {
    const result = UpsertClientSurveyBody.safeParse(MINIMAL_BODY);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avoidedMuscles).toBeUndefined();
    }
  });

  it("avoidedMuscles field remains optional — a payload that includes it still parses", () => {
    const withField = { ...MINIMAL_BODY, avoidedMuscles: "Łydki" };
    const result = UpsertClientSurveyBody.safeParse(withField);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avoidedMuscles).toBe("Łydki");
    }
  });
});

// ─── HTTP integration tests ────────────────────────────────────────────────────

describe("PUT /clients/:clientId/survey — omitting avoidedMuscles", () => {
  it("responds 200 when avoidedMuscles is absent from the payload", async () => {
    // The body mirrors exactly what SurveyForm now sends: no avoidedMuscles key.
    const res = await request(app)
      .put(`/api/clients/${testClientId}/survey`)
      .send(MINIMAL_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });

  it("the newly inserted row has avoidedMuscles = null (not copied from old row)", async () => {
    // The newest row is the one just created by the PUT above.
    const [newest] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.clientId, testClientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    expect(newest).toBeDefined();
    // avoidedMuscles was not in the payload — the column must be NULL.
    expect(newest!.avoidedMuscles).toBeNull();
  });

  it("the original seed row still has its avoidedMuscles value intact", async () => {
    // Surveys are append-only; the PUT above inserted a NEW row and never
    // touched the seed row.  The old avoidedMuscles value must be preserved.
    const [seedRow] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.id, seedSurveyId));

    expect(seedRow).toBeDefined();
    expect(seedRow!.avoidedMuscles).toBe("Łydki (są już wystarczające)");
  });

  it("there are now exactly 2 survey rows for the test client (one seed, one new)", async () => {
    const rows = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.clientId, testClientId));

    expect(rows.length).toBe(2);
  });
});

// ─── Payload key presence ─────────────────────────────────────────────────────

describe("PUT /clients/:clientId/survey — response body", () => {
  it("the response JSON does not error even if avoidedMuscles is null in the new row", async () => {
    const res = await request(app)
      .put(`/api/clients/${testClientId}/survey`)
      .send(MINIMAL_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    // The route returns a parsed survey object — avoidedMuscles will be null
    // or absent, never an error.
    expect(res.body).not.toHaveProperty("error");
  });
});
