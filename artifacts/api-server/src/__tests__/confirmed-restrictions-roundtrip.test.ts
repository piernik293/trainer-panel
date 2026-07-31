/**
 * Confirmed restrictions — HTTP round-trip tests (Task #95)
 *
 * Verifies the full save → reload cycle for `confirmedRestrictions`:
 *  1.  PUT with confirmedRestrictions → GET returns the same value.
 *  2.  PUT without confirmedRestrictions → GET returns null/absent.
 *  3.  PATCH with confirmedRestrictions → GET returns the updated value.
 *  4.  PUT with invalid JSON → stored as null, GET returns null.
 *  5.  PUT with non-array JSON → stored as null, GET returns null.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── Clerk mocks ──────────────────────────────────────────────────────────────

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: unknown) => mockGetAuth(req),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

// ─── Drizzle-orm operator mocks ───────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args,
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  asc:     (field: string)               => ({ field, dir: "asc" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  gt:      (field: string, val: unknown) => ({ field, val, op: "gt" }),
}));

// ─── api-zod: pass-through for params/responses, REAL body schema ────────────
// UpsertClientSurveyBody uses the real schema so confirmedRestrictions
// validation (max length, type coercion) is exercised end-to-end.

vi.mock("@workspace/api-zod", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/api-zod")>();

  function coerceParams(d: unknown) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      out[k] = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
    }
    return { success: true as const, data: out };
  }
  const passResp = { parse: (d: unknown) => d };

  return {
    GetClientSurveyParams:             { safeParse: coerceParams },
    GetClientSurveyResponse:           passResp,
    UpsertClientSurveyParams:          { safeParse: coerceParams },
    UpsertClientSurveyBody:            real.UpsertClientSurveyBody,   // real validation
    UpsertClientSurveyResponse:        passResp,
    GetClientSurveyByIdParams:         { safeParse: coerceParams },
    GetClientSurveyByIdResponse:       passResp,
    ListClientSurveysParams:           { safeParse: coerceParams },
    ListClientSurveysResponse:         passResp,
    GetClientAvoidedExercisesParams:   { safeParse: coerceParams },
    GetClientAvoidedExercisesResponse: passResp,
  };
});

// ─── In-memory stores ─────────────────────────────────────────────────────────

const TRAINER_A = {
  id: 1,
  clerkUserId: "user_A",
  displayName: "TA",
  email: null as string | null,
  createdAt: new Date(),
};

const CLIENT_10 = {
  id: 10,
  trainerId: 1,
  firstName: "Jan",
  lastName: "K",
  email: null as string | null,
  phone: null as string | null,
  notes: null as string | null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

type StoredSurvey = {
  id: number;
  clientId: number;
  trainingGoal: string;
  avoidedExerciseIds: number[];
  avoidedExerciseReasons: Record<string, string> | null;
  avoidedExerciseOtherText: string | null;
  avoidedExerciseOtherReason: string | null;
  advancedMethodsToAvoid: string[];
  confirmedRestrictions: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
};

let trainersStore: typeof TRAINER_A[] = [];
let clientsStore: typeof CLIENT_10[]  = [];
let surveysStore: StoredSurvey[]      = [];
let nextId = 200;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable  = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable   = { id: "id", trainerId: "trainerId" };
  const surveysTable   = { id: "id", clientId: "clientId", createdAt: "createdAt" };
  const exercisesTable = { id: "id", name: "name", isActive: "isActive" };

  type Cond =
    | { field?: string; val?: unknown; op?: string }
    | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")      return item[cond.field] === cond.val;
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    if (cond.op === "isNull")  return item[cond.field] == null;
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)  return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)   return clientsStore  as unknown as Record<string, unknown>[];
    if (table === surveysTable)   return surveysStore  as unknown as Record<string, unknown>[];
    if (table === exercisesTable) return [] as Record<string, unknown>[];
    return [];
  }

  function chain(items: Record<string, unknown>[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit:   (n: number)           => chain(items.slice(0, n)),
      where:   (cond: Cond)          => chain(items.filter((i) => matchesCondition(i, cond))),
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
          if (table === surveysTable) {
            const item: StoredSurvey = {
              id,
              createdAt: now,
              updatedAt: now,
              avoidedExerciseIds: [],
              avoidedExerciseReasons: null,
              avoidedExerciseOtherText: null,
              avoidedExerciseOtherReason: null,
              advancedMethodsToAvoid: [],
              confirmedRestrictions: null,
              trainingGoal: "",
              clientId: 0,
              ...data,
            } as StoredSurvey;
            surveysStore.push(item);
            return [item];
          }
          if (table === trainersTable) {
            return [{ ...TRAINER_A, ...data, id }];
          }
          return [];
        },
        onConflictDoNothing: () => ({
          returning: async () => [] as unknown[],
        }),
      }),
    }),

    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: (cond: Cond) => ({
          returning: async () => {
            const store = getStore(table);
            const idx = store.findIndex((i) => matchesCondition(i, cond));
            if (idx === -1) return [];
            store[idx] = { ...store[idx], ...data };
            return [store[idx]];
          },
        }),
      }),
    }),

    // requireAuth uses db.transaction for JIT trainer provisioning.
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (_data: Record<string, unknown>) => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (_table: unknown) => ({
            where: (cond: Cond) =>
              Promise.resolve(
                (trainersStore as unknown as Record<string, unknown>[]).filter((i) =>
                  matchesCondition(i, cond),
                ),
              ),
          }),
        }),
      };
      return fn(tx);
    },
  };

  return { db, trainersTable, clientsTable, surveysTable, exercisesTable };
});

// ─── App ──────────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: surveysRouter } = await import("../routes/surveys");
  app = express();
  app.use(express.json());
  app.use(surveysRouter);
});

beforeEach(() => {
  nextId = 200;
  trainersStore = [{ ...TRAINER_A }];
  clientsStore  = [{ ...CLIENT_10 }];
  surveysStore  = [];
  mockGetAuth.mockReturnValue({ userId: TRAINER_A.clerkUserId });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

const RESTRICTIONS = JSON.stringify([
  { bodyPart: "Kolano lewe", note: "ból przy przysiadach" },
]);

const BASE_BODY = { trainingGoal: "Siła", advancedMethodsToAvoid: [] };

describe("HTTP round-trip: confirmed restrictions", () => {
  it("(1) PUT with confirmedRestrictions → GET returns the field", async () => {
    const putRes = await request(app)
      .put("/clients/10/survey")
      .send({ ...BASE_BODY, confirmedRestrictions: RESTRICTIONS });

    expect(putRes.status).toBe(200);
    expect(putRes.body.confirmedRestrictions).toBe(RESTRICTIONS);

    const getRes = await request(app).get("/clients/10/survey");
    expect(getRes.status).toBe(200);
    expect(getRes.body.confirmedRestrictions).toBe(RESTRICTIONS);
  });

  it("(2) PUT without confirmedRestrictions → GET returns null or absent", async () => {
    await request(app).put("/clients/10/survey").send(BASE_BODY);

    const getRes = await request(app).get("/clients/10/survey");
    expect(getRes.status).toBe(200);
    expect(getRes.body.confirmedRestrictions == null).toBe(true);
  });

  it("(3) PATCH with confirmedRestrictions → GET returns updated value", async () => {
    const putRes = await request(app)
      .put("/clients/10/survey")
      .send(BASE_BODY);

    expect(putRes.status).toBe(200);
    const surveyId: number = putRes.body.id;

    const patchRes = await request(app)
      .patch(`/clients/10/surveys/${surveyId}`)
      .send({ ...BASE_BODY, confirmedRestrictions: RESTRICTIONS });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.confirmedRestrictions).toBe(RESTRICTIONS);

    const getRes = await request(app).get("/clients/10/survey");
    expect(getRes.status).toBe(200);
    expect(getRes.body.confirmedRestrictions).toBe(RESTRICTIONS);
  });

  it("(4) PUT with invalid JSON confirmedRestrictions → stored as null", async () => {
    const putRes = await request(app)
      .put("/clients/10/survey")
      .send({ ...BASE_BODY, confirmedRestrictions: "not-json{{{" });

    expect(putRes.status).toBe(200);
    expect(putRes.body.confirmedRestrictions).toBeNull();

    const getRes = await request(app).get("/clients/10/survey");
    expect(getRes.status).toBe(200);
    expect(getRes.body.confirmedRestrictions).toBeNull();
  });

  it("(5) PUT with non-array JSON confirmedRestrictions → stored as null", async () => {
    const putRes = await request(app)
      .put("/clients/10/survey")
      .send({ ...BASE_BODY, confirmedRestrictions: JSON.stringify({ foo: "bar" }) });

    expect(putRes.status).toBe(200);
    expect(putRes.body.confirmedRestrictions).toBeNull();

    const getRes = await request(app).get("/clients/10/survey");
    expect(getRes.status).toBe(200);
    expect(getRes.body.confirmedRestrictions).toBeNull();
  });
});
