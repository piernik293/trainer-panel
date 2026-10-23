/**
 * GET /dashboard/summary (real database): data comes only from the signed-in
 * trainer's own rows, in the agreed order, with onboarding derived from data.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

let mockUserId: string | null = null;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import {
  db,
  pool,
  trainersTable,
  clientsTable,
  surveysTable,
  workoutPlansTable,
  surveyInvitesTable,
  bookingsTable,
} from "@workspace/db";

const A = "dash_summary_trainer_a";
const B = "dash_summary_trainer_b";
const EMPTY = "dash_summary_trainer_empty";
const MARK = "dashsum-fixture";

let idA = 0;
let idB = 0;
let clientA1 = 0;
let clientA2 = 0;
let clientB1 = 0;

async function cleanup() {
  const trainers = await db.select({ id: trainersTable.id }).from(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B, EMPTY]));
  const ids = trainers.map((t) => t.id);
  if (ids.length > 0) {
    await db.delete(surveyInvitesTable).where(inArray(surveyInvitesTable.trainerId, ids));
    await db.delete(bookingsTable).where(inArray(bookingsTable.trainerId, ids));
    const cl = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.trainerId, ids));
    const cids = cl.map((c) => c.id);
    if (cids.length > 0) {
      await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, cids));
      await db.delete(surveysTable).where(inArray(surveysTable.clientId, cids));
      await db.delete(clientsTable).where(inArray(clientsTable.id, cids));
    }
    await db.delete(trainersTable).where(inArray(trainersTable.id, ids));
  }
}

beforeAll(async () => {
  await cleanup();
  const [a] = await db.insert(trainersTable).values({ clerkUserId: A, displayName: "Anna" }).returning();
  const [b] = await db.insert(trainersTable).values({ clerkUserId: B }).returning();
  await db.insert(trainersTable).values({ clerkUserId: EMPTY });
  idA = a.id;
  idB = b.id;

  const mk = async (trainerId: number, firstName: string) =>
    (await db.insert(clientsTable).values({ firstName, lastName: MARK, trainerId, status: "active" }).returning())[0].id;
  clientA1 = await mk(idA, "Ala");
  clientA2 = await mk(idA, "Ola");
  clientB1 = await mk(idB, "Bartek");

  const full = {
    dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: "65", experienceLevel: "Początkujący",
    activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny",
  } as const;
  // A1: fresh complete interview, no plan → "interview"
  await db.insert(surveysTable).values({ clientId: clientA1, ...full } as never);
  // A2: old interview, no plan → "no_plan"
  await db.insert(surveysTable).values({ clientId: clientA2, ...full, createdAt: new Date(Date.now() - 30 * 86_400_000) } as never);
  // B1: interview, no plan — must never show for trainer A
  await db.insert(surveysTable).values({ clientId: clientB1, ...full } as never);
  await db.insert(surveyInvitesTable).values({ trainerId: idB, tokenHash: `${MARK}-b`, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - 6 * 86_400_000) });
  await db.insert(bookingsTable).values({ trainerId: idB, clientId: clientB1, startsAt: new Date(), durationMinutes: 60 });
});

afterEach(() => {
  mockUserId = null;
});
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("GET /api/dashboard/summary", () => {
  it("no session → 401", async () => {
    expect((await request(app).get("/api/dashboard/summary")).status).toBe(401);
  });

  it("trainer A sees only their own clients, in agreed order", async () => {
    mockUserId = A;
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.trainerName).toBe("Anna");
    expect(res.body.counts).toMatchObject({ totalClients: 2, activeClients: 2, newInterviews: 1 });
    expect(res.body.attention.items.map((i: { kind: string; clientId: number }) => [i.kind, i.clientId])).toEqual([
      ["interview", clientA1],
      ["no_plan", clientA2],
    ]);
    expect(JSON.stringify(res.body)).not.toContain("Bartek");
    expect(res.body.todayBookings).toEqual([]);
    expect(res.body.onboarding).toMatchObject({ completed: 2, next: "invite" }) // no invitation sent: interview came from elsewhere;
  });

  it("trainer B does not see A's items, only their own (invite, booking)", async () => {
    mockUserId = B;
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("Ala");
    expect(body).not.toContain("Ola");
    expect(res.body.attention.items.map((i: { kind: string }) => i.kind)).toEqual(["interview", "invite_pending"]);
    expect(res.body.onboarding.steps.find((s: { key: string }) => s.key === "invite").done).toBe(true);
  });

  it("a trainer without clients gets empty lists and only the first step done", async () => {
    mockUserId = EMPTY;
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.counts.totalClients).toBe(0);
    expect(res.body.attention).toEqual({ items: [], total: 0 });
    expect(res.body.todayBookings).toEqual([]);
    expect(res.body.recentEvents).toEqual([]);
    expect(res.body.onboarding).toMatchObject({ completed: 1, next: "invite" });
  });
});
