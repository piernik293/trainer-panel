/**
 * Muscle catalogue routes — authorization (regression: P0, no auth at all).
 *
 * POST /muscles and PUT /exercises/:id/muscles mutate the shared catalogue
 * that drives plan volume calculations. They must require a session, and:
 *   - POST /muscles: catalogue admin only,
 *   - PUT  /exercises/:id/muscles: exercise owner, or catalogue admin for
 *     public exercises (same rule as PATCH /exercises/:id),
 *   - GET  /exercises/:id/muscles: private exercises stay invisible to others.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

let mockUserId: string | null = null;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import app from "../../app";
import { db, pool, trainersTable, exercisesTable, exerciseMuscleAssignmentsTable } from "@workspace/db";

const OWNER = "muscles_auth_test_owner";
const OTHER = "muscles_auth_test_other";
const ADMIN = "muscles_auth_test_admin";
const PRIVATE_SLUG = "muscles-auth-test-private-exercise";
const PUBLIC_EXERCISE_ID = 1;

let privateExerciseId: number;
let publicAssignments: { specificMuscleId: number; isPrimary: boolean; coefficient: number }[];
const savedAdminEnv = process.env.CATALOGUE_ADMIN_CLERK_IDS;

beforeAll(async () => {
  await db.delete(exercisesTable).where(eq(exercisesTable.slug, PRIVATE_SLUG));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [OWNER, OTHER, ADMIN]));
  const [owner] = await db.insert(trainersTable).values({ clerkUserId: OWNER }).returning();
  await db.insert(trainersTable).values([{ clerkUserId: OTHER }, { clerkUserId: ADMIN }]);
  const [ex] = await db
    .insert(exercisesTable)
    .values({ name: "Muscles auth test (private)", slug: PRIVATE_SLUG, mainMuscleGroup: "Plecy", createdByTrainerId: owner.id })
    .returning();
  privateExerciseId = ex.id;

  // Snapshot the public exercise so the admin PUT re-writes identical data.
  publicAssignments = (
    await db
      .select()
      .from(exerciseMuscleAssignmentsTable)
      .where(eq(exerciseMuscleAssignmentsTable.exerciseId, PUBLIC_EXERCISE_ID))
  ).map((a) => ({ specificMuscleId: a.specificMuscleId, isPrimary: a.isPrimary, coefficient: a.coefficient }));
  process.env.CATALOGUE_ADMIN_CLERK_IDS = ADMIN;
});

afterEach(() => {
  mockUserId = null;
});

afterAll(async () => {
  process.env.CATALOGUE_ADMIN_CLERK_IDS = savedAdminEnv;
  await db.delete(exercisesTable).where(eq(exercisesTable.slug, PRIVATE_SLUG));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [OWNER, OTHER, ADMIN]));
  await pool.end();
});

const primaryOnly = { assignments: [{ specificMuscleId: 3, isPrimary: true, coefficient: 1 }] };

describe("muscle catalogue routes — no session", () => {
  it("POST /muscles → 401", async () => {
    const res = await request(app).post("/api/muscles").send({ name: "X", broadCategory: "Plecy" });
    expect(res.status).toBe(401);
  });

  it("PUT /exercises/:id/muscles → 401", async () => {
    const res = await request(app).put(`/api/exercises/${PUBLIC_EXERCISE_ID}/muscles`).send(primaryOnly);
    expect(res.status).toBe(401);
  });

  it("GET /exercises/:id/muscles of a private exercise → 404", async () => {
    const res = await request(app).get(`/api/exercises/${privateExerciseId}/muscles`);
    expect(res.status).toBe(404);
  });

  it("GET /exercises/:id/muscles of a public exercise → 200", async () => {
    const res = await request(app).get(`/api/exercises/${PUBLIC_EXERCISE_ID}/muscles`);
    expect(res.status).toBe(200);
  });
});

describe("muscle catalogue routes — signed-in trainers", () => {
  it("non-admin trainer cannot create catalogue muscles (403)", async () => {
    mockUserId = OTHER;
    const res = await request(app).post("/api/muscles").send({ name: "X", broadCategory: "Plecy" });
    expect(res.status).toBe(403);
  });

  it("non-admin trainer cannot change a public exercise (404, as PATCH /exercises/:id)", async () => {
    mockUserId = OTHER;
    const res = await request(app).put(`/api/exercises/${PUBLIC_EXERCISE_ID}/muscles`).send(primaryOnly);
    expect(res.status).toBe(404);
  });

  it("another trainer cannot see or change a private exercise (404)", async () => {
    mockUserId = OTHER;
    expect((await request(app).get(`/api/exercises/${privateExerciseId}/muscles`)).status).toBe(404);
    expect((await request(app).put(`/api/exercises/${privateExerciseId}/muscles`).send(primaryOnly)).status).toBe(404);
  });

  it("owner can set muscles on their private exercise (200)", async () => {
    mockUserId = OWNER;
    const res = await request(app).put(`/api/exercises/${privateExerciseId}/muscles`).send(primaryOnly);
    expect(res.status).toBe(200);
    expect((await request(app).get(`/api/exercises/${privateExerciseId}/muscles`)).status).toBe(200);
  });

  it("catalogue admin can update a public exercise (200, data unchanged)", async () => {
    mockUserId = ADMIN;
    const res = await request(app)
      .put(`/api/exercises/${PUBLIC_EXERCISE_ID}/muscles`)
      .send({ assignments: publicAssignments });
    expect(res.status).toBe(200);
  });
});
