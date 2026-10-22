/**
 * Trainer profile creation and role separation (real database).
 *
 *   - POST /trainer/profile creates the trainers row — idempotent, and five
 *     concurrent first calls still leave exactly one row,
 *   - requireAuth never creates a trainer: an account without a profile gets
 *     403 TRAINER_PROFILE_REQUIRED on trainer endpoints,
 *   - an account linked to a client (client portal) gets 403 CLIENT_ACCOUNT on
 *     trainer endpoints and on POST /trainer/profile — no trainer row appears.
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
import { db, pool, trainersTable, clientsTable } from "@workspace/db";

const NEW_TRAINER = "trainer_profile_test_new";
const RACE_TRAINER = "trainer_profile_test_race";
const CLIENT_ACCOUNT = "trainer_profile_test_client";
const OWNER = "trainer_profile_test_owner";
const CLIENT_EMAIL = "trainer-profile-test-client@example.invalid";
const ALL = [NEW_TRAINER, RACE_TRAINER, CLIENT_ACCOUNT, OWNER];

const TRAINER_ENDPOINTS = ["/api/clients", "/api/stats", "/api/survey-invites"];

async function trainerRows(clerkUserId: string) {
  return db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, clerkUserId));
}

beforeAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, CLIENT_EMAIL));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, ALL));
  const [owner] = await db.insert(trainersTable).values({ clerkUserId: OWNER }).returning();
  await db.insert(clientsTable).values({
    firstName: "Portal",
    lastName: "Client",
    email: CLIENT_EMAIL,
    status: "active",
    trainerId: owner.id,
    clerkUserId: CLIENT_ACCOUNT,
  });
});

afterEach(() => {
  mockUserId = null;
});

afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, CLIENT_EMAIL));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, ALL));
  await pool.end();
});

describe("new account in the trainer app", () => {
  it("has no trainer access before the profile exists (403, no row created)", async () => {
    mockUserId = NEW_TRAINER;
    for (const path of TRAINER_ENDPOINTS) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.code, path).toBe("TRAINER_PROFILE_REQUIRED");
    }
    expect(await trainerRows(NEW_TRAINER)).toHaveLength(0);
  });

  it("POST /trainer/profile creates the trainer; trainer endpoints then work", async () => {
    mockUserId = NEW_TRAINER;
    const res = await request(app).post("/api/trainer/profile");
    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe("number");
    for (const path of TRAINER_ENDPOINTS) {
      expect((await request(app).get(path)).status, path).toBe(200);
    }
  });

  it("repeated POST /trainer/profile returns the same trainer", async () => {
    mockUserId = NEW_TRAINER;
    const first = await request(app).post("/api/trainer/profile");
    const second = await request(app).post("/api/trainer/profile");
    expect(second.body.id).toBe(first.body.id);
    expect(await trainerRows(NEW_TRAINER)).toHaveLength(1);
  });

  it("five concurrent first calls create exactly one trainer row", async () => {
    mockUserId = RACE_TRAINER;
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post("/api/trainer/profile")),
    );
    for (const r of responses) expect(r.status).toBe(200);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await trainerRows(RACE_TRAINER)).toHaveLength(1);
  });

  it("no session → 401", async () => {
    expect((await request(app).post("/api/trainer/profile")).status).toBe(401);
  });
});

describe("client portal account", () => {
  it("gets 403 CLIENT_ACCOUNT with a Polish message on trainer endpoints", async () => {
    mockUserId = CLIENT_ACCOUNT;
    for (const path of TRAINER_ENDPOINTS) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.code, path).toBe("CLIENT_ACCOUNT");
      expect(res.body.error, path).toContain("portalu klienta");
    }
  });

  it("cannot create a trainer profile", async () => {
    mockUserId = CLIENT_ACCOUNT;
    const res = await request(app).post("/api/trainer/profile");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CLIENT_ACCOUNT");
    expect(await trainerRows(CLIENT_ACCOUNT)).toHaveLength(0);
  });
});

describe("trainer account and client portal invitations", () => {
  it("a trainer account cannot activate a client invitation (403 TRAINER_ACCOUNT)", async () => {
    mockUserId = NEW_TRAINER; // has a trainer profile (created above)
    const res = await request(app).post(`/api/client-invitations/${"a".repeat(64)}/activate`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TRAINER_ACCOUNT");
    expect(res.body.error).toBe("To konto jest kontem trenera. Użyj innego adresu e-mail.");
  });
});
