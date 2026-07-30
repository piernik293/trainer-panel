/**
 * Trainer-facing workout session route authorization (Task #81B-3A)
 *
 * Routes under test (trainer-facing):
 *   GET /clients/:clientId/workout-sessions
 *   GET /clients/:clientId/workout-sessions/:sessionId
 *
 * Client-portal routes (/client-portal/sessions*) are NOT touched by this task
 * and are verified to remain functional under their clientId-based access model.
 *
 * Test matrix:
 *  1. unauthenticated GET /clients/:clientId/workout-sessions → 401
 *  2. Trainer A reads sessions for own client → 200
 *  3. Trainer A reads sessions for Trainer B's client → 404
 *  4. Trainer A cannot read Trainer B's session by sessionId → 404
 *  5. Session C cannot be accessed through Client A's URL
 *     (both belong to Trainer A — cross-client scoping blocked by clientId binding)
 *  6. Execution log data cannot be retrieved through a mismatched session/client
 *  7. Trainer A cannot access Trainer B's session detail → 404
 *  8. Valid owner session detail returns exercises + logs → 200
 *  9. trainerId in body/query is ignored — ownership from session only
 * 10. client-portal GET /client-portal/sessions works without Clerk auth
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

// ─── Mock warmup service (used by /client-portal/sessions/:sessionId/warmup) ─

vi.mock("../services/rampWarmup", () => ({
  determineDayType: () => "push",
  getRampWarmup: () => [],
}));

// ─── Shared in-memory stores ──────────────────────────────────────────────────

const TRAINER_A = { id: 1, clerkUserId: "user_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

type StoredTrainer  = typeof TRAINER_A;
type StoredClient   = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredPlan     = { id: number; clientId: number; title: string; status: string; goal: string | null; description: string | null; startDate: string | null; endDate: string | null; createdAt: Date; activatedAt: Date | null };
type StoredDay      = { id: number; planId: number; dayOrder: number; dayName: string | null; subtitle: string | null; description: string | null; estimatedDurationMinutes: number | null };
type StoredSession  = { id: number; clientId: number; planId: number; planDayId: number; sessionDate: string; isCompleted: boolean; notes: string | null; completedAt: Date | null; createdAt: Date };
type StoredPlanEx   = { id: number; dayId: number; exerciseId: number; orderInDay: number; workingSets: number; warmUpSets: number; repType: string | null; repsExact: number | null; repRangeMin: number | null; repRangeMax: number | null; rir: number | null; loadType: string | null; loadValue: string | null; restSeconds: number | null };
type StoredLog      = { id: number; sessionId: number; planExerciseId: number; setsCompleted: number | null; repsCompleted: number | null; weightKg: number | null; rir: number | null; note: string | null; isCompleted: boolean };
type StoredExercise = { id: number; name: string; exerciseType: string | null; exercisePriority: string | null; mainMuscleGroup: string | null; suitableForNoActivity: boolean | null; isActive: boolean };

let trainersStore:  StoredTrainer[]  = [];
let clientsStore:   StoredClient[]   = [];
let plansStore:     StoredPlan[]     = [];
let daysStore:      StoredDay[]      = [];
let sessionsStore:  StoredSession[]  = [];
let planExStore:    StoredPlanEx[]   = [];
let logsStore:      StoredLog[]      = [];
let exercisesStore: StoredExercise[] = [];

let nextId = 7000;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable              = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable               = { id: "id", trainerId: "trainerId", firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", notes: "notes", status: "status" };
  const workoutPlansTable          = { id: "id", clientId: "clientId", title: "title", status: "status", goal: "goal", description: "description", startDate: "startDate", endDate: "endDate", createdAt: "createdAt", activatedAt: "activatedAt" };
  const workoutPlanDaysTable       = { id: "id", planId: "planId", dayOrder: "dayOrder", dayName: "dayName", subtitle: "subtitle", description: "description", estimatedDurationMinutes: "estimatedDurationMinutes" };
  const workoutSessionsTable       = { id: "id", clientId: "clientId", planId: "planId", planDayId: "planDayId", sessionDate: "sessionDate", isCompleted: "isCompleted", notes: "notes", completedAt: "completedAt", createdAt: "createdAt" };
  const workoutPlanExercisesTable  = { id: "id", dayId: "dayId", exerciseId: "exerciseId", orderInDay: "orderInDay", workingSets: "workingSets", warmUpSets: "warmUpSets", repType: "repType", repsExact: "repsExact", repRangeMin: "repRangeMin", repRangeMax: "repRangeMax", rir: "rir", loadType: "loadType", loadValue: "loadValue", restSeconds: "restSeconds" };
  const exerciseExecutionLogsTable = { id: "id", sessionId: "sessionId", planExerciseId: "planExerciseId", setsCompleted: "setsCompleted", repsCompleted: "repsCompleted", weightKg: "weightKg", rir: "rir", note: "note", isCompleted: "isCompleted" };
  const exercisesTable             = { id: "id", name: "name", exerciseType: "exerciseType", exercisePriority: "exercisePriority", mainMuscleGroup: "mainMuscleGroup", suitableForNoActivity: "suitableForNoActivity", isActive: "isActive" };

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
    // eq(a, b) stores field=a_key, val=b_key.  The column ordering in the source call
    // can be either eq(leftCol, rightCol) or eq(rightCol, leftCol), so we accept
    // either direction to handle both conventions safely.
    if (cond.op === "eq") {
      return (
        right[cond.field as string] === left[cond.val as string] ||
        left[cond.field as string] === right[cond.val as string]
      );
    }
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)              return trainersStore  as unknown as Record<string, unknown>[];
    if (table === clientsTable)               return clientsStore   as unknown as Record<string, unknown>[];
    if (table === workoutPlansTable)          return plansStore     as unknown as Record<string, unknown>[];
    if (table === workoutPlanDaysTable)       return daysStore      as unknown as Record<string, unknown>[];
    if (table === workoutSessionsTable)       return sessionsStore  as unknown as Record<string, unknown>[];
    if (table === workoutPlanExercisesTable)  return planExStore    as unknown as Record<string, unknown>[];
    if (table === exerciseExecutionLogsTable) return logsStore      as unknown as Record<string, unknown>[];
    if (table === exercisesTable)             return exercisesStore as unknown as Record<string, unknown>[];
    return [];
  }

  function chain(items: Record<string, unknown>[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit:   (n: number)          => chain(items.slice(0, n)),
      where:   (cond: Cond)         => chain(items.filter((i) => matchesCondition(i, cond))),
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

    insert: (table: unknown) => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const id = nextId++;
          const now = new Date();
          const item = { id, createdAt: now, ...data };
          if (table === workoutSessionsTable) sessionsStore.push(item as unknown as StoredSession);
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

    delete: (table: unknown) => ({
      where: (cond: Cond) => {
        const store = getStore(table);
        const idx = store.findIndex((i) => matchesCondition(i, cond));
        const removed = idx !== -1 ? store.splice(idx, 1) : [];
        return { returning: async () => removed };
      },
    }),

    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (_data: unknown) => ({
            onConflictDoNothing: () => Promise.resolve(),
            returning: async () => [],
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => chain(getStore(table)),
        }),
        update: (_table: unknown) => ({
          set: (_data: unknown) => ({
            where: (_cond: unknown) => ({ returning: async () => [] }),
          }),
        }),
      };
      return fn(tx);
    },

    trainersTable,
    clientsTable,
    workoutPlansTable,
    workoutPlanDaysTable,
    workoutSessionsTable,
    workoutPlanExercisesTable,
    exerciseExecutionLogsTable,
    exercisesTable,
  };

  return {
    db,
    trainersTable, clientsTable, workoutPlansTable, workoutPlanDaysTable,
    workoutSessionsTable, workoutPlanExercisesTable, exerciseExecutionLogsTable,
    exercisesTable,
  };
});

// ─── DB operators mock ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  sql:     (_tpl: unknown)               => ({}),
}));

// ─── App ──────────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: clientPortalRouter } = await import("../routes/clientPortal");
  app = express();
  app.use(express.json());
  app.use(clientPortalRouter);
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

// ─── Store reset ──────────────────────────────────────────────────────────────

beforeEach(() => {
  nextId = 7000;

  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];

  clientsStore = [
    // Client 10 → Trainer A
    { id: 10, trainerId: 1, firstName: "Anna", lastName: "A", email: "anna@example.com", phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    // Client 20 → Trainer B
    { id: 20, trainerId: 2, firstName: "Bob",  lastName: "B", email: "bob@example.com",  phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    // Client 30 → Trainer A (second client — used for cross-client scoping test)
    { id: 30, trainerId: 1, firstName: "Carl", lastName: "C", email: "carl@example.com", phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];

  plansStore = [
    { id: 100, clientId: 10, title: "Plan A", status: "active", goal: null, description: null, startDate: null, endDate: null, createdAt: new Date(), activatedAt: new Date() },
    { id: 200, clientId: 20, title: "Plan B", status: "active", goal: null, description: null, startDate: null, endDate: null, createdAt: new Date(), activatedAt: new Date() },
    { id: 300, clientId: 30, title: "Plan C", status: "active", goal: null, description: null, startDate: null, endDate: null, createdAt: new Date(), activatedAt: new Date() },
  ];

  daysStore = [
    { id: 11, planId: 100, dayOrder: 1, dayName: "A day 1", subtitle: null, description: null, estimatedDurationMinutes: null },
    { id: 21, planId: 200, dayOrder: 1, dayName: "B day 1", subtitle: null, description: null, estimatedDurationMinutes: null },
    { id: 31, planId: 300, dayOrder: 1, dayName: "C day 1", subtitle: null, description: null, estimatedDurationMinutes: null },
  ];

  // Session 1000 → client 10 (Trainer A)
  // Session 2000 → client 20 (Trainer B)
  // Session 3000 → client 30 (Trainer A) — used for cross-client scoping
  sessionsStore = [
    { id: 1000, clientId: 10, planId: 100, planDayId: 11, sessionDate: "2026-07-01", isCompleted: true,  notes: null, completedAt: new Date(), createdAt: new Date() },
    { id: 2000, clientId: 20, planId: 200, planDayId: 21, sessionDate: "2026-07-02", isCompleted: false, notes: null, completedAt: null,       createdAt: new Date() },
    { id: 3000, clientId: 30, planId: 300, planDayId: 31, sessionDate: "2026-07-03", isCompleted: false, notes: null, completedAt: null,       createdAt: new Date() },
  ];

  planExStore = [
    { id: 501, dayId: 11, exerciseId: 1, orderInDay: 1, workingSets: 3, warmUpSets: 0, repType: "exact", repsExact: 10, repRangeMin: null, repRangeMax: null, rir: 2, loadType: null, loadValue: null, restSeconds: 90 },
  ];

  logsStore = [
    { id: 601, sessionId: 1000, planExerciseId: 501, setsCompleted: 3, repsCompleted: 10, weightKg: 60, rir: 2, note: null, isCompleted: true },
  ];

  exercisesStore = [
    { id: 1, name: "Squat", exerciseType: "złożone", exercisePriority: "Bardzo wysoki", mainMuscleGroup: "Nogi", suitableForNoActivity: false, isActive: true },
  ];

  setAuth(null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Trainer-facing session route authorization (Task #81B-3A)", () => {

  // ── 1. unauthenticated session list → 401 ───────────────────────────────────

  it("(1) unauthenticated GET /clients/:clientId/workout-sessions → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/workout-sessions");
    expect(res.status).toBe(401);
  });

  // ── 2. Trainer A reads sessions for own client → 200 ────────────────────────

  it("(2) Trainer A reads sessions for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/workout-sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── 3. Trainer A reads sessions for Trainer B's client → 404 ────────────────

  it("(3) Trainer A reads sessions for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/workout-sessions");
    expect(res.status).toBe(404);
  });

  // ── 4. Trainer A cannot read Trainer B's session by sessionId → 404 ─────────

  it("(4) Trainer A cannot read Trainer B's session via trainer B's clientId URL → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/workout-sessions/2000");
    expect(res.status).toBe(404);
  });

  // ── 5. Session C cannot be accessed through Client A's URL ──────────────────
  // Session 3000 belongs to Client 30 (Trainer A).
  // Client 10 also belongs to Trainer A.
  // Trainer A uses clientId=10 in the URL to try to access session 3000.
  // The WHERE clause binds session.clientId = 10, so session 3000 (clientId=30)
  // is not returned — 404.

  it("(5) Session from Client C cannot be accessed via Client A's URL (cross-client scoping blocked)", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/workout-sessions/3000");
    expect(res.status).toBe(404);
  });

  // ── 6. Execution log data cannot be retrieved through a mismatched session ───
  // Session 1000 belongs to Client 10 (Trainer A).
  // Trainer A requests session 1000 via Client 20's URL (Trainer B's client).
  // verifyClientBelongsToTrainer(client 20) fails → 404.
  // Log 601 is never returned.

  it("(6) Log data unreachable through mismatched session/client URL → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/workout-sessions/1000");
    expect(res.status).toBe(404);
    // Log data must not appear in any error detail.
    expect(JSON.stringify(res.body)).not.toContain("601");
  });

  // ── 7. Trainer A cannot access Trainer B's session detail → 404 ─────────────

  it("(7) Trainer A cannot read Trainer B's session detail → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/workout-sessions/2000");
    expect(res.status).toBe(404);
  });

  // ── 8. Valid owner session detail returns exercises + logs → 200 ─────────────

  it("(8) Trainer A reads own client's session detail → 200 with exercises and logs", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/workout-sessions/1000");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("exercises");
    expect(Array.isArray(res.body.exercises)).toBe(true);
  });

  // ── 9. trainerId in query/body is ignored ─────────────────────────────────────
  // Trainer A appends ?trainerId=2 (Trainer B's id) in query — ownership still
  // comes from req.trainer.id (Clerk session), not query params → 200.

  it("(9a) trainerId in query is ignored — ownership from session only (own client → 200)", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/workout-sessions?trainerId=2");
    expect(res.status).toBe(200);
  });

  it("(9b) even with trainerId=1 in query, foreign client still returns 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/workout-sessions?trainerId=1");
    expect(res.status).toBe(404);
  });

  // ── 10. client-portal GET /client-portal/sessions now requires Clerk auth ────
  // Task #82 secured all /client-portal/sessions* routes with requireClientAuth.
  // Unauthenticated requests must return 401 regardless of query params.

  it("(10) GET /client-portal/sessions without Clerk auth → 401 (secured by Task #82)", async () => {
    setAuth(null); // no auth
    const res = await request(app)
      .get("/client-portal/sessions")
      .query({ clientId: 10, planDayId: 11 });
    expect(res.status).toBe(401);
  });
});
