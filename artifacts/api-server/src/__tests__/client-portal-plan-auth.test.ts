/**
 * Client Portal plan route authorization (Task #83)
 *
 * Verifies that GET /client-portal/plan is protected by requireClientAuth and
 * that the authenticated client identity (resolved from Clerk session + DB
 * lookup) is the sole authorization source — email and clientId query params
 * must not affect the result.
 *
 * Test matrix (12 scenarios):
 *  1.  Unauthenticated GET /client-portal/plan → 401
 *  2.  Authenticated Client A receives only Client A's active plan
 *  3.  Authenticated Client A cannot receive Client B's plan
 *  4.  Supplying Client B's email in query does not change Client A's scope
 *  5.  Supplying Client B's clientId in query does not change Client A's scope
 *  6.  A client with no linked plan receives 404
 *  7.  A Clerk user with no linked client record receives 404
 *  8.  Nested plan days and exercises belong only to the authenticated client's plan
 *  9.  Existing secured client session routes still pass (spot-check via GET /sessions → 401)
 * 10.  Existing trainer-facing authorization spot-check (GET /clients/:id/workout-sessions → 401)
 * 11.  No protected plan route reads email or clientId from request for authorization
 * 12.  Response shape matches expected { client, plan } contract
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── Mock Clerk ───────────────────────────────────────────────────────────────

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: unknown) => mockGetAuth(req),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

// ─── Mock warmup service ──────────────────────────────────────────────────────

vi.mock("../services/rampWarmup", () => ({
  determineDayType: () => "push",
  getRampWarmup: () => [{ name: "Bike", durationSeconds: 300 }],
}));

// ─── In-memory data stores ────────────────────────────────────────────────────

type StoredClient = {
  id: number; clerkUserId: string | null; trainerId: number | null;
  firstName: string; lastName: string; email: string | null;
  phone: string | null; notes: string | null; status: string;
  createdAt: Date; updatedAt: Date;
};
type StoredPlan = {
  id: number; clientId: number; title: string; status: string;
  goal: string | null; description: string | null;
  startDate: string | null; endDate: string | null;
  createdAt: Date; activatedAt: Date | null;
};
type StoredDay = {
  id: number; planId: number; dayOrder: number;
  dayName: string | null; subtitle: string | null;
  description: string | null; estimatedDurationMinutes: number | null;
};
type StoredPlanExercise = {
  id: number; dayId: number; exerciseId: number; orderInDay: number;
  workingSets: number; warmUpSets: number; repType: string | null;
  repsExact: number | null; repRangeMin: number | null; repRangeMax: number | null;
  rir: number | null; loadType: string | null; loadValue: string | null;
  restSeconds: number | null;
};
type StoredExercise = { id: number; name: string; mainMuscleGroup: string | null };
type StoredSession = {
  id: number; clientId: number; planId: number; planDayId: number;
  sessionDate: string; isCompleted: boolean; notes: string | null;
  completedAt: Date | null; createdAt: Date;
};
type StoredTrainer = { id: number; clerkUserId: string; displayName: string; email: string | null; createdAt: Date };

let clientsStore: StoredClient[] = [];
let plansStore: StoredPlan[] = [];
let daysStore: StoredDay[] = [];
let planExercisesStore: StoredPlanExercise[] = [];
let exercisesStore: StoredExercise[] = [];
let sessionsStore: StoredSession[] = [];
let trainersStore: StoredTrainer[] = [];
let nextId = 9000;

// ─── Drizzle-orm mock ─────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  sql:     (_tpl: unknown)               => ({}),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable              = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable               = { id: "id", clerkUserId: "clerkUserId", trainerId: "trainerId", firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", notes: "notes", status: "status", createdAt: "createdAt", updatedAt: "updatedAt" };
  const workoutPlansTable          = { id: "id", clientId: "clientId", title: "title", status: "status", goal: "goal", description: "description", startDate: "startDate", endDate: "endDate", createdAt: "createdAt", activatedAt: "activatedAt" };
  const workoutPlanDaysTable       = { id: "id", planId: "planId", dayOrder: "dayOrder", dayName: "dayName", subtitle: "subtitle", description: "description", estimatedDurationMinutes: "estimatedDurationMinutes" };
  const workoutSessionsTable       = { id: "id", clientId: "clientId", planId: "planId", planDayId: "planDayId", sessionDate: "sessionDate", isCompleted: "isCompleted", notes: "notes", completedAt: "completedAt", createdAt: "createdAt" };
  const workoutPlanExercisesTable  = { id: "id", dayId: "dayId", exerciseId: "exerciseId", orderInDay: "orderInDay", workingSets: "workingSets", warmUpSets: "warmUpSets", repType: "repType", repsExact: "repsExact", repRangeMin: "repRangeMin", repRangeMax: "repRangeMax", rir: "rir", loadType: "loadType", loadValue: "loadValue", restSeconds: "restSeconds", repTimeSeconds: "repTimeSeconds", repOpenInstruction: "repOpenInstruction", loadInstruction: "loadInstruction", rpe: "rpe", tempo: "tempo", clientInstructions: "clientInstructions" };
  const exerciseExecutionLogsTable = { id: "id", sessionId: "sessionId", planExerciseId: "planExerciseId", setsCompleted: "setsCompleted", repsCompleted: "repsCompleted", weightKg: "weightKg", rir: "rir", note: "note", isCompleted: "isCompleted", updatedAt: "updatedAt" };
  const exercisesTable             = { id: "id", name: "name", mainMuscleGroup: "mainMuscleGroup" };

  type Cond = { field?: string; val?: unknown; op?: string } | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")      return item[cond.field] === cond.val;
    if (cond.op === "isNull")  return item[cond.field] == null;
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function matchesJoinCondition(left: Record<string, unknown>, right: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesJoinCondition(left, right, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq") {
      return (
        right[cond.field as string] === left[cond.val as string] ||
        left[cond.field as string]  === right[cond.val as string]
      );
    }
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)              return trainersStore      as unknown as Record<string, unknown>[];
    if (table === clientsTable)               return clientsStore       as unknown as Record<string, unknown>[];
    if (table === workoutPlansTable)          return plansStore         as unknown as Record<string, unknown>[];
    if (table === workoutPlanDaysTable)       return daysStore          as unknown as Record<string, unknown>[];
    if (table === workoutSessionsTable)       return sessionsStore      as unknown as Record<string, unknown>[];
    if (table === workoutPlanExercisesTable)  return planExercisesStore as unknown as Record<string, unknown>[];
    if (table === exercisesTable)             return exercisesStore     as unknown as Record<string, unknown>[];
    return [];
  }

  function chain(items: Record<string, unknown>[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit:   (n: number)           => chain(items.slice(0, n)),
      where:   (cond: Cond)          => chain(items.filter((i) => matchesCondition(i, cond))),
      innerJoin: (rightTable: unknown, joinCond: Cond) => {
        const rightStore = getStore(rightTable);
        const merged: Record<string, unknown>[] = [];
        for (const left of items) {
          for (const right of rightStore) {
            if (matchesJoinCondition(left, right, joinCond)) {
              merged.push({ ...right, ...left });
            }
          }
        }
        return chain(merged);
      },
    };
  }

  const db = {
    select: (_shape?: unknown) => ({
      from: (table: unknown) => chain(getStore(table)),
    }),
    insert: (_table: unknown) => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const id = nextId++;
          return [{ id, createdAt: new Date(), ...data }];
        },
        onConflictDoNothing: () => Promise.resolve(),
      }),
    }),
    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: (cond: Cond) => {
          const store = getStore(table);
          const idx = store.findIndex((i) => matchesCondition(i, cond));
          if (idx !== -1) store[idx] = { ...store[idx], ...data };
          return { returning: async () => (idx !== -1 ? [store[idx]] : []) };
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (_data: unknown) => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => chain(getStore(table)),
        }),
      };
      return fn(tx);
    },
  };

  return {
    db,
    trainersTable, clientsTable, workoutPlansTable, workoutPlanDaysTable,
    workoutSessionsTable, workoutPlanExercisesTable, exerciseExecutionLogsTable,
    exercisesTable,
  };
});

// ─── App setup ────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: clientPortalRouter } = await import("../routes/clientPortal");
  app = express();
  app.use(express.json());
  app.use(clientPortalRouter);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setAuth(clerkUserId: string | null) {
  mockGetAuth.mockReturnValue({ userId: clerkUserId ?? undefined });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_A_CLERK = "client_clerk_A";
const CLIENT_B_CLERK = "client_clerk_B";
const CLIENT_A_ID = 10;
const CLIENT_B_ID = 20;
const PLAN_A_ID = 100;
const PLAN_B_ID = 200;
const DAY_A_ID = 11;
const DAY_A2_ID = 12;
const DAY_B_ID = 21;
const PLAN_EX_A_ID = 501;
const PLAN_EX_B_ID = 601;

beforeEach(() => {
  nextId = 9000;

  clientsStore = [
    {
      id: CLIENT_A_ID, clerkUserId: CLIENT_A_CLERK, trainerId: 1,
      firstName: "Anna", lastName: "Kowalska", email: "anna@test.com",
      phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: CLIENT_B_ID, clerkUserId: CLIENT_B_CLERK, trainerId: 2,
      firstName: "Bartek", lastName: "Nowak", email: "bartek@test.com",
      phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date(),
    },
  ];

  plansStore = [
    {
      id: PLAN_A_ID, clientId: CLIENT_A_ID, title: "Plan Anny", status: "active",
      goal: "Siła", description: null, startDate: null, endDate: null,
      createdAt: new Date(), activatedAt: new Date(),
    },
    {
      id: PLAN_B_ID, clientId: CLIENT_B_ID, title: "Plan Bartka", status: "active",
      goal: "Masa", description: null, startDate: null, endDate: null,
      createdAt: new Date(), activatedAt: new Date(),
    },
  ];

  daysStore = [
    {
      id: DAY_A_ID,  planId: PLAN_A_ID, dayOrder: 1, dayName: "Dzień A1",
      subtitle: null, description: null, estimatedDurationMinutes: null,
    },
    {
      id: DAY_A2_ID, planId: PLAN_A_ID, dayOrder: 2, dayName: "Dzień A2",
      subtitle: null, description: null, estimatedDurationMinutes: null,
    },
    {
      id: DAY_B_ID,  planId: PLAN_B_ID, dayOrder: 1, dayName: "Dzień B",
      subtitle: null, description: null, estimatedDurationMinutes: null,
    },
  ];

  exercisesStore = [
    { id: 1, name: "Squat", mainMuscleGroup: "Nogi" },
    { id: 2, name: "Bench", mainMuscleGroup: "Klatka" },
  ];

  planExercisesStore = [
    {
      id: PLAN_EX_A_ID, dayId: DAY_A_ID, exerciseId: 1, orderInDay: 1,
      workingSets: 3, warmUpSets: 2, repType: "range",
      repsExact: null, repRangeMin: 8, repRangeMax: 12,
      rir: 2, loadType: "weight", loadValue: "60", restSeconds: 120,
    },
    {
      id: PLAN_EX_B_ID, dayId: DAY_B_ID, exerciseId: 2, orderInDay: 1,
      workingSets: 4, warmUpSets: 1, repType: "exact",
      repsExact: 8, repRangeMin: null, repRangeMax: null,
      rir: 1, loadType: "weight", loadValue: "80", restSeconds: 180,
    },
  ];

  sessionsStore = [];

  trainersStore = [
    { id: 1, clerkUserId: "trainer_clerk_A", displayName: "Trainer A", email: null, createdAt: new Date() },
    { id: 2, clerkUserId: "trainer_clerk_B", displayName: "Trainer B", email: null, createdAt: new Date() },
  ];
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("client-portal plan route authorization (Task #83)", () => {

  // ── 1. Unauthenticated → 401 ─────────────────────────────────────────────────

  it("(1) unauthenticated GET /client-portal/plan → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(401);
  });

  // ── 2. Client A receives their own active plan ────────────────────────────────

  it("(2) Client A receives Client A's active plan", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe(PLAN_A_ID);
    expect(res.body.plan.clientId).toBe(CLIENT_A_ID);
    expect(res.body.client.id).toBe(CLIENT_A_ID);
    expect(res.body.client.firstName).toBe("Anna");
  });

  // ── 3. Client A cannot receive Client B's plan ───────────────────────────────

  it("(3) Client A authenticated — does not receive Client B's plan", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);
    // Must never include Plan B data
    expect(res.body.plan.id).not.toBe(PLAN_B_ID);
    expect(res.body.plan.clientId).not.toBe(CLIENT_B_ID);
    expect(JSON.stringify(res.body)).not.toContain(String(PLAN_B_ID));
  });

  // ── 4. Email in query does not change Client A's scope ───────────────────────

  it("(4) Client B email in query does not change Client A's scope", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .get("/client-portal/plan")
      .query({ email: "bartek@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe(PLAN_A_ID);
    expect(res.body.plan.clientId).toBe(CLIENT_A_ID);
  });

  // ── 5. clientId in query does not change Client A's scope ────────────────────

  it("(5) Client B clientId in query does not change Client A's scope", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .get("/client-portal/plan")
      .query({ clientId: CLIENT_B_ID });
    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe(PLAN_A_ID);
    expect(res.body.plan.clientId).toBe(CLIENT_A_ID);
  });

  // ── 6. Client with no active plan receives 404 ───────────────────────────────

  it("(6) Client with no active plan → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    // Set Plan A to inactive
    plansStore = plansStore.map((p) =>
      p.id === PLAN_A_ID ? { ...p, status: "draft" } : p,
    );
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(404);
  });

  // ── 7. Clerk user with no linked client record receives 404 ──────────────────

  it("(7) Clerk user with no client record → 404", async () => {
    setAuth("clerk_user_with_no_client_record");
    const res = await request(app).get("/client-portal/plan");
    // requireClientAuth returns 404 when no clients row has this clerkUserId
    expect(res.status).toBe(404);
  });

  // ── 8. Nested plan days and exercises belong to authenticated client only ─────

  it("(8a) Plan days in response belong only to Client A's plan", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);
    const dayIds: number[] = res.body.plan.days.map((d: { id: number }) => d.id);
    // Client A's plan has DAY_A_ID and DAY_A2_ID
    expect(dayIds).toContain(DAY_A_ID);
    expect(dayIds).toContain(DAY_A2_ID);
    // Must NOT include Client B's day
    expect(dayIds).not.toContain(DAY_B_ID);
  });

  it("(8b) Plan exercises in response belong only to Client A's plan", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);
    const exIds: number[] = res.body.plan.days
      .flatMap((d: { exercises: { id: number }[] }) => d.exercises.map((e) => e.id));
    // Client A has PLAN_EX_A_ID
    expect(exIds).toContain(PLAN_EX_A_ID);
    // Must NOT include Client B's exercise
    expect(exIds).not.toContain(PLAN_EX_B_ID);
  });

  it("(8c) Client B never receives Client A's plan data", async () => {
    setAuth(CLIENT_B_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe(PLAN_B_ID);
    // Must NOT contain Client A's plan ID anywhere
    expect(JSON.stringify(res.body)).not.toContain(String(PLAN_A_ID));
    // Must NOT contain Client A's exercise
    const exIds: number[] = res.body.plan.days
      .flatMap((d: { exercises: { id: number }[] }) => d.exercises.map((e) => e.id));
    expect(exIds).not.toContain(PLAN_EX_A_ID);
  });

  // ── 9. Existing client session routes still require auth ─────────────────────

  it("(9) unauthenticated GET /client-portal/sessions → 401 (session route regression)", async () => {
    setAuth(null);
    const res = await request(app).get("/client-portal/sessions").query({ planDayId: DAY_A_ID });
    expect(res.status).toBe(401);
  });

  // ── 10. Trainer-facing routes still require auth ──────────────────────────────

  it("(10) unauthenticated GET /clients/:id/workout-sessions → 401 (trainer route regression)", async () => {
    setAuth(null);
    const res = await request(app).get(`/clients/${CLIENT_A_ID}/workout-sessions`);
    expect(res.status).toBe(401);
  });

  // ── 11. No email or clientId in request is used for authorization ─────────────

  it("(11a) both email and clientId in query are ignored — Client A still sees own plan", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .get("/client-portal/plan")
      .query({ email: "bartek@test.com", clientId: CLIENT_B_ID });
    expect(res.status).toBe(200);
    expect(res.body.plan.clientId).toBe(CLIENT_A_ID);
  });

  it("(11b) email in query does not reveal Client B plan to Client A", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .get("/client-portal/plan")
      .query({ email: "bartek@test.com" });
    // Must serve Client A's plan, never Client B's
    expect(res.body.plan?.id).toBe(PLAN_A_ID);
    expect(JSON.stringify(res.body)).not.toContain(String(PLAN_B_ID));
  });

  // ── 12. Response shape matches expected { client, plan } contract ──────────────

  it("(12) response includes client and plan with days and exercises", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get("/client-portal/plan");
    expect(res.status).toBe(200);

    // client shape
    expect(res.body.client).toMatchObject({
      id: CLIENT_A_ID,
      firstName: "Anna",
      lastName: "Kowalska",
    });

    // plan shape
    expect(res.body.plan).toMatchObject({
      id: PLAN_A_ID,
      clientId: CLIENT_A_ID,
      title: "Plan Anny",
      status: "active",
    });

    // days
    expect(Array.isArray(res.body.plan.days)).toBe(true);
    expect(res.body.plan.days.length).toBeGreaterThan(0);

    // exercises nested inside days
    const day1 = res.body.plan.days.find((d: { id: number }) => d.id === DAY_A_ID);
    expect(day1).toBeDefined();
    expect(Array.isArray(day1.exercises)).toBe(true);
    expect(day1.exercises.length).toBe(1);
    expect(day1.exercises[0].id).toBe(PLAN_EX_A_ID);
  });

});
