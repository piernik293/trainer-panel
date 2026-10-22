/**
 * Client Portal session route authorization (Task #82)
 *
 * Verifies that all /client-portal/sessions* routes are protected by
 * requireClientAuth and that authenticated client identity (resolved from
 * Clerk session + DB lookup) is the sole authorization source.
 *
 * Routes under test:
 *   GET  /client-portal/sessions
 *   POST /client-portal/sessions
 *   GET  /client-portal/sessions/:sessionId
 *   PATCH /client-portal/sessions/:sessionId
 *   PUT  /client-portal/sessions/:sessionId/exercises/:planExerciseId
 *   GET  /client-portal/sessions/:sessionId/warmup
 *
 * Test matrix (12 scenarios + cross-resource test):
 *  1.  Unauthenticated request to every protected route → 401
 *  2.  Client A lists only Client A's sessions
 *  3.  Client A cannot list Client B's sessions by supplying Client B's clientId in query
 *  4.  Client A can open Client A's session
 *  5.  Client A cannot open Client B's session by sessionId
 *  6.  Client A cannot access execution logs or warmup data for Client B's session
 *  7.  Client A cannot update Client B's session (PATCH)
 *  8.  Client A cannot create a session from Client B's plan or plan day (POST)
 *  9.  Supplying a foreign clientId in query does not change authenticated scope
 * 10.  Supplying a foreign clientId in body does not change authenticated scope
 * 11.  Valid authenticated client workflows return expected data
 * 12.  Trainer-facing session routes remain protected (unauthenticated → 401)
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
type StoredSession = {
  id: number; clientId: number; planId: number; planDayId: number;
  sessionDate: string; isCompleted: boolean; notes: string | null;
  completedAt: Date | null; createdAt: Date;
};
type StoredLog = {
  id: number; sessionId: number; planExerciseId: number;
  setsCompleted: number | null; repsCompleted: number | null;
  weightKg: string | null; rir: number | null; note: string | null;
  isCompleted: boolean;
};
type StoredExercise = { id: number; name: string; mainMuscleGroup: string | null };
type StoredPlanExercise = {
  id: number; dayId: number; exerciseId: number; orderInDay: number;
  workingSets: number; warmUpSets: number; repType: string | null;
  repsExact: number | null; repRangeMin: number | null; repRangeMax: number | null;
  rir: number | null; loadType: string | null; loadValue: string | null;
  restSeconds: number | null;
};
type StoredTrainer = { id: number; clerkUserId: string; displayName: string; email: string | null; createdAt: Date };

let clientsStore: StoredClient[] = [];
let plansStore: StoredPlan[] = [];
let daysStore: StoredDay[] = [];
let sessionsStore: StoredSession[] = [];
let logsStore: StoredLog[] = [];
let exercisesStore: StoredExercise[] = [];
let planExercisesStore: StoredPlanExercise[] = [];
let trainersStore: StoredTrainer[] = [];
let nextId = 9000;

// ─── DB operators mock ────────────────────────────────────────────────────────
// Must be separate from the @workspace/db mock because routes import eq/and/etc
// from "drizzle-orm" directly, not from "@workspace/db".

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  sql:     (_tpl: unknown)               => ({}),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
// Uses the same chain() pattern as session-auth.test.ts which is proven to work.
// Column reference values are camelCase strings matching in-memory record keys.

vi.mock("@workspace/db", () => {
  const trainersTable              = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable               = { id: "id", clerkUserId: "clerkUserId", trainerId: "trainerId", firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", notes: "notes", status: "status", createdAt: "createdAt", updatedAt: "updatedAt" };
  const workoutPlansTable          = { id: "id", clientId: "clientId", title: "title", status: "status", goal: "goal", description: "description", startDate: "startDate", endDate: "endDate", createdAt: "createdAt", activatedAt: "activatedAt" };
  const workoutPlanDaysTable       = { id: "id", planId: "planId", dayOrder: "dayOrder", dayName: "dayName", subtitle: "subtitle", description: "description", estimatedDurationMinutes: "estimatedDurationMinutes" };
  const workoutSessionsTable       = { id: "id", clientId: "clientId", planId: "planId", planDayId: "planDayId", sessionDate: "sessionDate", isCompleted: "isCompleted", notes: "notes", completedAt: "completedAt", createdAt: "createdAt" };
  const workoutPlanExercisesTable  = { id: "id", dayId: "dayId", exerciseId: "exerciseId", orderInDay: "orderInDay", workingSets: "workingSets", warmUpSets: "warmUpSets", repType: "repType", repsExact: "repsExact", repRangeMin: "repRangeMin", repRangeMax: "repRangeMax", rir: "rir", loadType: "loadType", loadValue: "loadValue", restSeconds: "restSeconds" };
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
    if (table === exerciseExecutionLogsTable) return logsStore          as unknown as Record<string, unknown>[];
    if (table === exercisesTable)             return exercisesStore     as unknown as Record<string, unknown>[];
    return [];
  }

  // `project` maps rows when select() used a nested shape such as
  // { log: exerciseExecutionLogsTable, currentName: … } (applied on await).
  function chain(
    items: Record<string, unknown>[],
    project: (row: Record<string, unknown>) => unknown = (row) => row,
  ) {
    const join = (rightTable: unknown, joinCond: Cond, keepUnmatched: boolean) => {
      const rightStore = getStore(rightTable);
      const merged: Record<string, unknown>[] = [];
      for (const left of items) {
        const matches = rightStore.filter((right) => matchesJoinCondition(left, right, joinCond));
        for (const right of matches) merged.push({ ...right, ...left });
        if (keepUnmatched && matches.length === 0) merged.push({ ...left });
      }
      return chain(merged, project);
    };
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items.map(project)).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items, project),
      limit:   (n: number)           => chain(items.slice(0, n), project),
      where:   (cond: Cond)          => chain(items.filter((i) => matchesCondition(i, cond)), project),
      innerJoin: (rightTable: unknown, joinCond: Cond) => join(rightTable, joinCond, false),
      leftJoin:  (rightTable: unknown, joinCond: Cond) => join(rightTable, joinCond, true),
    };
  }

  /** select({ key: table, … }) → rows become { key: row, other: undefined }. */
  function projectionFor(shape: unknown, table: unknown) {
    if (!shape || typeof shape !== "object") return undefined;
    const tableKey = Object.entries(shape).find(([, v]) => v === table)?.[0];
    if (!tableKey) return undefined;
    return (row: Record<string, unknown>) => ({ [tableKey]: row });
  }

  const db = {
    select: (shape?: unknown) => ({
      from: (table: unknown) => chain(getStore(table), projectionFor(shape, table)),
    }),

    insert: (table: unknown) => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const id = nextId++;
          const now = new Date();
          const item = { id, createdAt: now, ...data };
          if (table === workoutSessionsTable)       sessionsStore.push(item as unknown as StoredSession);
          if (table === exerciseExecutionLogsTable) logsStore.push(item as unknown as StoredLog);
          return [item];
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
      // Used by requireAuth (trainer provisioning). Provision trainer from current Clerk userId.
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
  (globalThis as Record<string, unknown>).__currentClerkUserId = clerkUserId;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_A_CLERK = "client_clerk_A";
const CLIENT_B_CLERK = "client_clerk_B";
const CLIENT_A_ID = 10;
const CLIENT_B_ID = 20;
const PLAN_A_ID = 100;
const PLAN_B_ID = 200;
const DAY_A_ID = 11;
const DAY_B_ID = 21;
const SESSION_A_ID = 1000;
const SESSION_B_ID = 2000;
const LOG_A_ID = 601;
const PLAN_EX_ID = 501;

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
      id: PLAN_A_ID, clientId: CLIENT_A_ID, title: "Plan A", status: "active",
      goal: null, description: null, startDate: null, endDate: null,
      createdAt: new Date(), activatedAt: new Date(),
    },
    {
      id: PLAN_B_ID, clientId: CLIENT_B_ID, title: "Plan B", status: "active",
      goal: null, description: null, startDate: null, endDate: null,
      createdAt: new Date(), activatedAt: new Date(),
    },
  ];
  daysStore = [
    {
      id: DAY_A_ID, planId: PLAN_A_ID, dayOrder: 1, dayName: "Day A",
      subtitle: null, description: null, estimatedDurationMinutes: null,
    },
    {
      id: DAY_B_ID, planId: PLAN_B_ID, dayOrder: 1, dayName: "Day B",
      subtitle: null, description: null, estimatedDurationMinutes: null,
    },
  ];
  sessionsStore = [
    {
      id: SESSION_A_ID, clientId: CLIENT_A_ID, planId: PLAN_A_ID, planDayId: DAY_A_ID,
      sessionDate: "2026-07-01", isCompleted: false, notes: null,
      completedAt: null, createdAt: new Date(),
    },
    {
      id: SESSION_B_ID, clientId: CLIENT_B_ID, planId: PLAN_B_ID, planDayId: DAY_B_ID,
      sessionDate: "2026-07-02", isCompleted: false, notes: null,
      completedAt: null, createdAt: new Date(),
    },
  ];
  logsStore = [
    {
      id: LOG_A_ID, sessionId: SESSION_A_ID, planExerciseId: PLAN_EX_ID,
      setsCompleted: 3, repsCompleted: 10, weightKg: "60", rir: 2, note: null, isCompleted: true,
    },
  ];
  exercisesStore = [
    { id: 1, name: "Squat", mainMuscleGroup: "Nogi" },
  ];
  planExercisesStore = [
    {
      id: PLAN_EX_ID, dayId: DAY_A_ID, exerciseId: 1, orderInDay: 1,
      workingSets: 3, warmUpSets: 2, repType: "range", repsExact: null,
      repRangeMin: 8, repRangeMax: 12, rir: 2, loadType: "weight",
      loadValue: "60", restSeconds: 120,
    },
  ];
  trainersStore = [
    { id: 1, clerkUserId: "trainer_user_A", displayName: "Trainer A", email: null, createdAt: new Date() },
    { id: 2, clerkUserId: "trainer_user_B", displayName: "Trainer B", email: null, createdAt: new Date() },
  ];
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("client-portal session route authentication (Task #82)", () => {

  // ── 1. Unauthenticated requests → 401 for every protected route ─────────────

  it("(1a) unauthenticated GET /client-portal/sessions → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/client-portal/sessions").query({ planDayId: DAY_A_ID });
    expect(res.status).toBe(401);
  });

  it("(1b) unauthenticated POST /client-portal/sessions → 401", async () => {
    setAuth(null);
    const res = await request(app).post("/client-portal/sessions").send({
      planId: PLAN_A_ID, planDayId: DAY_A_ID, sessionDate: "2026-08-01",
    });
    expect(res.status).toBe(401);
  });

  it("(1c) unauthenticated GET /client-portal/sessions/:sessionId → 401", async () => {
    setAuth(null);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_A_ID}`);
    expect(res.status).toBe(401);
  });

  it("(1d) unauthenticated PATCH /client-portal/sessions/:sessionId → 401", async () => {
    setAuth(null);
    const res = await request(app).patch(`/client-portal/sessions/${SESSION_A_ID}`).send({ isCompleted: true });
    expect(res.status).toBe(401);
  });

  it("(1e) unauthenticated GET /client-portal/sessions/:sessionId/warmup → 401", async () => {
    setAuth(null);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_A_ID}/warmup`);
    expect(res.status).toBe(401);
  });

  it("(1f) unauthenticated PUT /client-portal/sessions/:sessionId/exercises/:id → 401", async () => {
    setAuth(null);
    const res = await request(app)
      .put(`/client-portal/sessions/${SESSION_A_ID}/exercises/${PLAN_EX_ID}`)
      .send({ setsCompleted: 3 });
    expect(res.status).toBe(401);
  });

  // ── 2. Client A lists only their own sessions ────────────────────────────────

  it("(2) Client A lists sessions → only Client A's sessions returned", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .get("/client-portal/sessions")
      .query({ planDayId: DAY_A_ID });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const s of res.body) {
      expect(s.clientId).toBe(CLIENT_A_ID);
    }
  });

  // ── 3. Foreign clientId in query does not expand scope ───────────────────────

  it("(3) Client A supplies Client B's clientId in query → still only sees own scope", async () => {
    setAuth(CLIENT_A_CLERK);
    // Querying planDayId=DAY_B_ID: Client A has no sessions for that day
    const res = await request(app)
      .get("/client-portal/sessions")
      .query({ planDayId: DAY_B_ID, clientId: CLIENT_B_ID });
    expect(res.status).toBe(200);
    // DAY_B_ID belongs to Client B — Client A has no sessions there
    expect(res.body).toHaveLength(0);
  });

  // ── 4. Client A can open their own session ───────────────────────────────────

  it("(4) Client A opens own session → 200 with logs", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_A_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SESSION_A_ID);
    expect(res.body.clientId).toBe(CLIENT_A_ID);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  // ── 5. Client A cannot open Client B's session ───────────────────────────────

  it("(5) Client A opens Client B's sessionId → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_B_ID}`);
    expect(res.status).toBe(404);
  });

  // ── 6. Execution logs and warmup not accessible through Client B's session ───

  it("(6a) Client A cannot access logs from Client B's session → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_B_ID}`);
    expect(res.status).toBe(404);
    // Log data belonging to session B must not appear in the response
    expect(JSON.stringify(res.body)).not.toContain(String(SESSION_B_ID));
  });

  it("(6b) Client A cannot get warmup for Client B's session → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_B_ID}/warmup`);
    expect(res.status).toBe(404);
  });

  // ── 7. Client A cannot update Client B's session ─────────────────────────────

  it("(7) Client A PATCHes Client B's session → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .patch(`/client-portal/sessions/${SESSION_B_ID}`)
      .send({ isCompleted: true });
    expect(res.status).toBe(404);
  });

  // ── 8. Client A cannot create a session from Client B's plan ─────────────────

  it("(8a) Client A POSTs session with Client B's planId → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).post("/client-portal/sessions").send({
      planId: PLAN_B_ID,
      planDayId: DAY_B_ID,
      sessionDate: "2026-08-01",
    });
    expect(res.status).toBe(404);
  });

  it("(8b) Client A POSTs session with own plan but Client B's planDayId → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    // DAY_B_ID belongs to PLAN_B (not PLAN_A), so the planDay→plan check must fail
    const res = await request(app).post("/client-portal/sessions").send({
      planId: PLAN_A_ID,
      planDayId: DAY_B_ID,
      sessionDate: "2026-08-01",
    });
    expect(res.status).toBe(404);
  });

  // ── 9. Foreign clientId in query does not change authenticated scope ──────────

  it("(9) clientId in query is ignored — scope comes from Clerk session", async () => {
    setAuth(CLIENT_A_CLERK);
    // Even with clientId=CLIENT_B_ID in query, we still see only Client A's data
    const res = await request(app)
      .get("/client-portal/sessions")
      .query({ planDayId: DAY_A_ID, clientId: CLIENT_B_ID });
    expect(res.status).toBe(200);
    for (const s of res.body) {
      expect(s.clientId).toBe(CLIENT_A_ID);
    }
  });

  // ── 10. Foreign clientId in body does not change authenticated scope ──────────

  it("(10a) clientId in POST body is ignored — uses own plan, session has own clientId", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).post("/client-portal/sessions").send({
      clientId: CLIENT_B_ID,     // must be ignored
      planId: PLAN_A_ID,
      planDayId: DAY_A_ID,
      sessionDate: "2026-08-10",
    });
    // Plan A belongs to Client A — should succeed with Client A's id in the session.
    // 201 = new session; 200 = Client A's active session for this day is returned.
    expect([200, 201]).toContain(res.status);
    expect(res.body.clientId).toBe(CLIENT_A_ID);
  });

  it("(10b) clientId in PATCH body is ignored — session B still belongs to Client B → 404", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .patch(`/client-portal/sessions/${SESSION_B_ID}`)
      .send({ clientId: CLIENT_A_ID, isCompleted: true });   // clientId in body must be ignored
    expect(res.status).toBe(404);
  });

  // ── 11. Valid authenticated workflows return expected data ────────────────────

  it("(11a) Client A starts a session from own plan → correct clientId", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).post("/client-portal/sessions").send({
      planId: PLAN_A_ID,
      planDayId: DAY_A_ID,
      sessionDate: "2026-08-15",
    });
    expect([200, 201]).toContain(res.status); // 200 = existing active session of the day

    expect(res.body.clientId).toBe(CLIENT_A_ID);
    expect(res.body.planId).toBe(PLAN_A_ID);
  });

  it("(11b) Client A patches own session → 200 with updated data", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .patch(`/client-portal/sessions/${SESSION_A_ID}`)
      .send({ isCompleted: true });
    expect(res.status).toBe(200);
    expect(res.body.isCompleted).toBe(true);
  });

  it("(11c) Client A gets warmup for own session → 200 with blocks", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app).get(`/client-portal/sessions/${SESSION_A_ID}/warmup`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("blocks");
  });

  it("(11d) Client A upserts exercise log for own session → 200", async () => {
    setAuth(CLIENT_A_CLERK);
    const res = await request(app)
      .put(`/client-portal/sessions/${SESSION_A_ID}/exercises/${PLAN_EX_ID}`)
      .send({ setsCompleted: 3, repsCompleted: 10, weightKg: 65, isCompleted: true });
    expect(res.status).toBe(200);
  });

  // ── Cross-resource test ───────────────────────────────────────────────────────
  // Client A owns session A; Client B owns session B.
  // Every request type from Client A against session B must be blocked.

  it("(cross) Client A cannot GET, PATCH, warmup, or PUT exercise log for session B", async () => {
    setAuth(CLIENT_A_CLERK);

    const getDetail = await request(app).get(`/client-portal/sessions/${SESSION_B_ID}`);
    expect(getDetail.status).toBe(404);

    const getWarmup = await request(app).get(`/client-portal/sessions/${SESSION_B_ID}/warmup`);
    expect(getWarmup.status).toBe(404);

    const patch = await request(app)
      .patch(`/client-portal/sessions/${SESSION_B_ID}`)
      .send({ notes: "hack" });
    expect(patch.status).toBe(404);

    const putLog = await request(app)
      .put(`/client-portal/sessions/${SESSION_B_ID}/exercises/${PLAN_EX_ID}`)
      .send({ setsCompleted: 1 });
    expect(putLog.status).toBe(404);
  });

  // ── 12. Trainer-facing session routes remain protected ────────────────────────

  it("(12) Unauthenticated GET /clients/:id/workout-sessions → 401", async () => {
    setAuth(null);
    const res = await request(app).get(`/clients/${CLIENT_A_ID}/workout-sessions`);
    expect(res.status).toBe(401);
  });

});
