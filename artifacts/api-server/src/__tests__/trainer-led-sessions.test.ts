/**
 * Trainer-led sessions + client portal preview (cooperation mode feature)
 *
 * Focused matrix:
 *  1. Unauthenticated GET /clients/:id/portal-preview → 401
 *  2. Trainer A cannot preview another trainer's client → 404
 *  3. Trainer A previews own client → { client, plan } with days
 *  4. Unauthenticated POST /clients/:id/trainer-sessions/open → 401
 *  5. Open for an `online` client → 403 (cooperation mode gate)
 *  6. Open for an `in_person` client → creates trainer-led session
 *     (performedBy=trainer, sessionMode=in_person, performedByTrainerId set)
 *  7. Open when client has an ACTIVE SELF-DIRECTED session for that day → 409
 *  8. Open when an ACTIVE TRAINER-LED session exists → reuses it (same id)
 *  9. PUT trainer-sessions exercise write on a self-directed session → 403
 * 10. PATCH complete marks session completed with completedAt
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

vi.mock("../services/rampWarmup", () => ({
  determineDayType: () => "push",
  getRampWarmup: () => [],
}));

// ─── In-memory stores ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let clientsStore: Row[] = [];
let plansStore: Row[] = [];
let daysStore: Row[] = [];
let planExercisesStore: Row[] = [];
let exercisesStore: Row[] = [];
let sessionsStore: Row[] = [];
let logsStore: Row[] = [];
let trainersStore: Row[] = [];
let nextId = 9000;

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (field: string)               => ({ field, op: "isNull" }),
  sql:     (_tpl: unknown)               => ({}),
}));

vi.mock("@workspace/db", () => {
  const trainersTable = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable = { id: "id", clerkUserId: "clerkUserId", trainerId: "trainerId", firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", notes: "notes", status: "status", cooperationMode: "cooperationMode", createdAt: "createdAt", updatedAt: "updatedAt" };
  const workoutPlansTable = { id: "id", clientId: "clientId", title: "title", status: "status", goal: "goal", description: "description", startDate: "startDate", endDate: "endDate", createdAt: "createdAt", activatedAt: "activatedAt", updatedAt: "updatedAt", cardioRecommendation: "cardioRecommendation" };
  const workoutPlanDaysTable = { id: "id", planId: "planId", dayOrder: "dayOrder", dayName: "dayName", subtitle: "subtitle", description: "description", estimatedDurationMinutes: "estimatedDurationMinutes" };
  const workoutSessionsTable = { id: "id", clientId: "clientId", planId: "planId", planDayId: "planDayId", sessionDate: "sessionDate", isCompleted: "isCompleted", notes: "notes", completedAt: "completedAt", createdAt: "createdAt", updatedAt: "updatedAt", difficultyRating: "difficultyRating", hadPain: "hadPain", energyLevel: "energyLevel", performedBy: "performedBy", sessionMode: "sessionMode", performedByTrainerId: "performedByTrainerId" };
  const workoutPlanExercisesTable = { id: "id", dayId: "dayId", exerciseId: "exerciseId", orderInDay: "orderInDay", workingSets: "workingSets", warmUpSets: "warmUpSets", repType: "repType", repsExact: "repsExact", repRangeMin: "repRangeMin", repRangeMax: "repRangeMax", rir: "rir", loadType: "loadType", loadValue: "loadValue", restSeconds: "restSeconds", repTimeSeconds: "repTimeSeconds", repOpenInstruction: "repOpenInstruction", loadInstruction: "loadInstruction", rpe: "rpe", tempo: "tempo", clientInstructions: "clientInstructions" };
  const exerciseExecutionLogsTable = { id: "id", sessionId: "sessionId", planExerciseId: "planExerciseId", setsCompleted: "setsCompleted", repsCompleted: "repsCompleted", weightKg: "weightKg", rir: "rir", note: "note", isCompleted: "isCompleted", updatedAt: "updatedAt", exerciseId: "exerciseId", exerciseNameSnapshot: "exerciseNameSnapshot", plannedSets: "plannedSets", plannedRepMin: "plannedRepMin", plannedRepMax: "plannedRepMax", plannedRir: "plannedRir" };
  const exercisesTable = { id: "id", name: "name", mainMuscleGroup: "mainMuscleGroup" };

  type Cond = { field?: string; val?: unknown; op?: string } | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Row, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq") return item[cond.field] === cond.val;
    if (cond.op === "isNull") return item[cond.field] == null;
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function matchesJoinCondition(left: Row, right: Row, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesJoinCondition(left, right, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq") {
      return (
        right[cond.field as string] === left[cond.val as string] ||
        left[cond.field as string] === right[cond.val as string]
      );
    }
    return true;
  }

  function getStore(table: unknown): Row[] {
    if (table === trainersTable) return trainersStore;
    if (table === clientsTable) return clientsStore;
    if (table === workoutPlansTable) return plansStore;
    if (table === workoutPlanDaysTable) return daysStore;
    if (table === workoutSessionsTable) return sessionsStore;
    if (table === workoutPlanExercisesTable) return planExercisesStore;
    if (table === exerciseExecutionLogsTable) return logsStore;
    if (table === exercisesTable) return exercisesStore;
    return [];
  }

  function chain(items: Row[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit: (n: number) => chain(items.slice(0, n)),
      where: (cond: Cond) => chain(items.filter((i) => matchesCondition(i, cond))),
      innerJoin: (rightTable: unknown, joinCond: Cond) => {
        const rightStore = getStore(rightTable);
        const merged: Row[] = [];
        for (const left of items) {
          for (const right of rightStore) {
            if (matchesJoinCondition(left, right, joinCond)) merged.push({ ...right, ...left });
          }
        }
        return chain(merged);
      },
    };
  }

  const db = {
    select: (_shape?: unknown) => ({ from: (table: unknown) => chain(getStore(table)) }),
    insert: (table: unknown) => ({
      values: (data: Row) => ({
        returning: async () => {
          const id = nextId++;
          const row = { id, createdAt: new Date(), ...data };
          getStore(table).push(row);
          return [row];
        },
        onConflictDoNothing: () => Promise.resolve(),
        onConflictDoUpdate: (_opts: unknown) => ({
          returning: async () => {
            const id = nextId++;
            const row = { id, createdAt: new Date(), ...data };
            getStore(table).push(row);
            return [row];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (data: Row) => ({
        where: (cond: Cond) => {
          const store = getStore(table);
          const idx = store.findIndex((i) => matchesCondition(i, cond));
          if (idx !== -1) store[idx] = { ...store[idx]!, ...data };
          return { returning: async () => (idx !== -1 ? [store[idx]] : []) };
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (_data: unknown) => ({ onConflictDoNothing: () => Promise.resolve() }),
        }),
        select: (_shape?: unknown) => ({ from: (table: unknown) => chain(getStore(table)) }),
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

function setAuth(clerkUserId: string | null) {
  mockGetAuth.mockReturnValue({ userId: clerkUserId ?? undefined });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRAINER_A = "trainer_clerk_A";
const TRAINER_B = "trainer_clerk_B";
const CLIENT_ONLINE_ID = 10; // trainer A, online
const CLIENT_GYM_ID = 11; // trainer A, in_person
const CLIENT_B_ID = 20; // trainer B
const PLAN_ID = 100;
const DAY_ID = 200;
const PLAN_EX_ID = 300;

beforeEach(() => {
  nextId = 9000;
  trainersStore = [
    { id: 1, clerkUserId: TRAINER_A, displayName: "A", email: null, createdAt: new Date() },
    { id: 2, clerkUserId: TRAINER_B, displayName: "B", email: null, createdAt: new Date() },
  ];
  clientsStore = [
    { id: CLIENT_ONLINE_ID, clerkUserId: null, trainerId: 1, firstName: "Ola", lastName: "Online", email: null, phone: null, notes: null, status: "active", cooperationMode: "online", createdAt: new Date(), updatedAt: new Date() },
    { id: CLIENT_GYM_ID, clerkUserId: null, trainerId: 1, firstName: "Stefan", lastName: "Stacjonarny", email: null, phone: null, notes: null, status: "active", cooperationMode: "in_person", createdAt: new Date(), updatedAt: new Date() },
    { id: CLIENT_B_ID, clerkUserId: null, trainerId: 2, firstName: "Bartek", lastName: "Obcy", email: null, phone: null, notes: null, status: "active", cooperationMode: "in_person", createdAt: new Date(), updatedAt: new Date() },
  ];
  plansStore = [
    { id: PLAN_ID, clientId: CLIENT_GYM_ID, title: "Plan Stefana", status: "active", goal: null, description: null, startDate: null, endDate: null, createdAt: new Date(), activatedAt: new Date(), updatedAt: new Date(), cardioRecommendation: null },
  ];
  daysStore = [
    { id: DAY_ID, planId: PLAN_ID, dayOrder: 1, dayName: "Dzień 1", subtitle: null, description: null, estimatedDurationMinutes: 60 },
  ];
  exercisesStore = [{ id: 1, name: "Squat", mainMuscleGroup: "Nogi" }];
  planExercisesStore = [
    { id: PLAN_EX_ID, dayId: DAY_ID, exerciseId: 1, orderInDay: 1, workingSets: 3, warmUpSets: 2, repType: "range", repsExact: null, repRangeMin: 8, repRangeMax: 12, rir: 2, loadType: "weight", loadValue: "60", restSeconds: 120, repTimeSeconds: null, repOpenInstruction: null, loadInstruction: null, rpe: null, tempo: null, clientInstructions: null },
  ];
  sessionsStore = [];
  logsStore = [];
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("client portal preview (trainer, read-only)", () => {
  it("(1) unauthenticated → 401", async () => {
    setAuth(null);
    const res = await request(app).get(`/clients/${CLIENT_GYM_ID}/portal-preview`);
    expect(res.status).toBe(401);
  });

  it("(2) trainer A cannot preview trainer B's client → 404", async () => {
    setAuth(TRAINER_A);
    const res = await request(app).get(`/clients/${CLIENT_B_ID}/portal-preview`);
    expect(res.status).toBe(404);
  });

  it("(3) trainer A previews own client → { client, plan } with days", async () => {
    setAuth(TRAINER_A);
    const res = await request(app).get(`/clients/${CLIENT_GYM_ID}/portal-preview`);
    expect(res.status).toBe(200);
    expect(res.body.client.id).toBe(CLIENT_GYM_ID);
    expect(res.body.plan.title).toBe("Plan Stefana");
    expect(res.body.plan.days).toHaveLength(1);
    // NOTE: the DB mock ignores select() aliasing, so assert on the raw id
    // rather than the aliased exerciseName column.
    expect(res.body.plan.days[0].exercises).toHaveLength(1);
    expect(res.body.plan.days[0].exercises[0].id).toBe(PLAN_EX_ID);
  });
});

describe("trainer-led session open", () => {
  const openBody = { planId: PLAN_ID, planDayId: DAY_ID };

  it("(4) unauthenticated → 401", async () => {
    setAuth(null);
    const res = await request(app).post(`/clients/${CLIENT_GYM_ID}/trainer-sessions/open`).send(openBody);
    expect(res.status).toBe(401);
  });

  it("(5) online client → 403 cooperation-mode gate", async () => {
    setAuth(TRAINER_A);
    const res = await request(app).post(`/clients/${CLIENT_ONLINE_ID}/trainer-sessions/open`).send(openBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/stacjonarnych lub hybrydowych/);
  });

  it("(6) in_person client → creates trainer-led session with metadata", async () => {
    setAuth(TRAINER_A);
    const res = await request(app).post(`/clients/${CLIENT_GYM_ID}/trainer-sessions/open`).send(openBody);
    expect(res.status).toBe(200);
    expect(res.body.session.performedBy).toBe("trainer");
    expect(res.body.session.sessionMode).toBe("in_person");
    expect(res.body.session.performedByTrainerId).toBe(1);
    expect(sessionsStore).toHaveLength(1);
  });

  it("(7) active self-directed session for that day → 409", async () => {
    sessionsStore.push({ id: 500, clientId: CLIENT_GYM_ID, planId: PLAN_ID, planDayId: DAY_ID, sessionDate: "2026-08-01", isCompleted: false, notes: null, completedAt: null, createdAt: new Date(), performedBy: "client", sessionMode: "self_directed", performedByTrainerId: null });
    setAuth(TRAINER_A);
    const res = await request(app).post(`/clients/${CLIENT_GYM_ID}/trainer-sessions/open`).send(openBody);
    expect(res.status).toBe(409);
    expect(sessionsStore).toHaveLength(1); // no duplicate created
  });

  it("(8) active trainer-led session → reused, no duplicate", async () => {
    sessionsStore.push({ id: 501, clientId: CLIENT_GYM_ID, planId: PLAN_ID, planDayId: DAY_ID, sessionDate: "2026-08-01", isCompleted: false, notes: null, completedAt: null, createdAt: new Date(), performedBy: "trainer", sessionMode: "in_person", performedByTrainerId: 1 });
    setAuth(TRAINER_A);
    const res = await request(app).post(`/clients/${CLIENT_GYM_ID}/trainer-sessions/open`).send(openBody);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(501);
    expect(sessionsStore).toHaveLength(1);
  });
});

describe("trainer-led session writes", () => {
  it("(9) PUT exercise on a self-directed session → 403", async () => {
    sessionsStore.push({ id: 502, clientId: CLIENT_GYM_ID, planId: PLAN_ID, planDayId: DAY_ID, sessionDate: "2026-08-01", isCompleted: false, notes: null, completedAt: null, createdAt: new Date(), performedBy: "client", sessionMode: "self_directed", performedByTrainerId: null });
    setAuth(TRAINER_A);
    const res = await request(app)
      .put(`/clients/${CLIENT_GYM_ID}/trainer-sessions/502/exercises/${PLAN_EX_ID}`)
      .send({ setsCompleted: 3, repsCompleted: 10, weightKg: 60, isCompleted: true });
    expect(res.status).toBe(403);
  });

  it("(9b) client cannot open/write/complete an active trainer-led session", async () => {
    // Client with clerk id linked to CLIENT_GYM_ID
    clientsStore[1]!["clerkUserId"] = "client_clerk_S";
    sessionsStore.push({ id: 504, clientId: CLIENT_GYM_ID, planId: PLAN_ID, planDayId: DAY_ID, sessionDate: "2026-08-01", isCompleted: false, notes: null, completedAt: null, createdAt: new Date(), performedBy: "trainer", sessionMode: "in_person", performedByTrainerId: 1 });
    setAuth("client_clerk_S");

    const open = await request(app)
      .post("/client-portal/sessions/open")
      .send({ planId: PLAN_ID, planDayId: DAY_ID });
    expect(open.status).toBe(409);

    const put = await request(app)
      .put(`/client-portal/sessions/504/exercises/${PLAN_EX_ID}`)
      .send({ setsCompleted: 3 });
    expect(put.status).toBe(403);

    const patch = await request(app)
      .patch("/client-portal/sessions/504")
      .send({ isCompleted: true });
    expect(patch.status).toBe(403);
  });

  it("(10) PATCH complete → isCompleted + completedAt set", async () => {
    sessionsStore.push({ id: 503, clientId: CLIENT_GYM_ID, planId: PLAN_ID, planDayId: DAY_ID, sessionDate: "2026-08-01", isCompleted: false, notes: null, completedAt: null, createdAt: new Date(), performedBy: "trainer", sessionMode: "in_person", performedByTrainerId: 1 });
    setAuth(TRAINER_A);
    const res = await request(app)
      .patch(`/clients/${CLIENT_GYM_ID}/trainer-sessions/503`)
      .send({ isCompleted: true, notes: "Dobra sesja" });
    expect(res.status).toBe(200);
    expect(res.body.isCompleted).toBe(true);
    expect(res.body.completedAt).toBeTruthy();
    expect(res.body.notes).toBe("Dobra sesja");
  });
});
