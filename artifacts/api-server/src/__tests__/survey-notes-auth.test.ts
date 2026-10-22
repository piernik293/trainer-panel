/**
 * Survey + Notes ownership — Vitest tests (Task #81B-1)
 *
 * 14 test cases covering:
 *  - unauthenticated requests → 401
 *  - Trainer A cannot access Trainer B resources → 404
 *  - body trainerId is ignored
 *  - public survey invitation routes still work without trainer login
 *  - public survey responses never expose internal trainer notes
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import crypto from "crypto";

// ─── Mock Clerk ───────────────────────────────────────────────────────────────

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: unknown) => mockGetAuth(req),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

// ─── Mock @workspace/api-zod (all pass-through) ───────────────────────────────

function coerceParams(d: unknown) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    out[k] = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  }
  return { success: true as const, data: out };
}
const passBody = { safeParse: (d: unknown) => ({ success: true as const, data: d as Record<string, unknown> }) };
const passResp = { parse: (d: unknown) => d };

vi.mock("@workspace/api-zod", () => ({
  GetClientSurveyParams:          { safeParse: coerceParams },
  GetClientSurveyResponse:        passResp,
  ListClientSurveysParams:        { safeParse: coerceParams },
  ListClientSurveysResponse:      passResp,
  GetClientSurveyByIdParams:      { safeParse: coerceParams },
  GetClientSurveyByIdResponse:    passResp,
  GetClientAvoidedExercisesParams:{ safeParse: coerceParams },
  GetClientAvoidedExercisesResponse: passResp,
  UpsertClientSurveyParams:       { safeParse: coerceParams },
  UpsertClientSurveyBody:         passBody,
  UpsertClientSurveyResponse:     passResp,
  ListClientNotesParams:          { safeParse: coerceParams },
  ListClientNotesResponse:        passResp,
  CreateClientNoteParams:         { safeParse: coerceParams },
  CreateClientNoteBody:           passBody,
  CreateClientNoteResponse:       passResp,
  UpdateClientNoteParams:         { safeParse: coerceParams },
  UpdateClientNoteBody:           passBody,
  UpdateClientNoteResponse:       passResp,
  DeleteClientNoteParams:         { safeParse: coerceParams },
  SubmitPublicSurveyBody:         passBody,
}));

vi.mock("../services/subscriptionService", async () => {
  const { db } = await import("@workspace/db");
  return {
    runWithSubscriptionLimit: async (
      _trainerId: number,
      _metric: string,
      operation: (tx: unknown) => Promise<unknown>,
    ) => db.transaction(operation),
    assertSubscriptionLimitInTransaction: async () => undefined,
    isSubscriptionLimitError: () => false,
  };
});

// ─── Shared in-memory stores (module-level so mock factory can close over them)

const TRAINER_A = { id: 1, clerkUserId: "user_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

type StoredClient  = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredSurvey  = { id: number; clientId: number; trainingGoal: string; avoidedExerciseIds: number[]; avoidedExerciseReasons: Record<string, string> | null; avoidedExerciseOtherText: string | null; avoidedExerciseOtherReason: string | null; createdAt: Date; [key: string]: unknown };
type StoredNote    = { id: number; clientId: number; content: string; createdAt: Date; updatedAt: Date };
type StoredInvite  = { id: number; trainerId: number; tokenHash: string; intendedEmail: string | null; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; createdAt: Date };
type StoredTrainer = typeof TRAINER_A;

let trainersStore: StoredTrainer[] = [];
let clientsStore:  StoredClient[]  = [];
let surveysStore:  StoredSurvey[]  = [];
let notesStore:    StoredNote[]    = [];
let invitesStore:  StoredInvite[]  = [];
let exercisesStore: { id: number; name: string; isActive: boolean }[] = [];

let nextId = 200;

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  // Table column name objects — camelCase so conditions match store item keys.
  const trainersTable      = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable       = { id: "id", trainerId: "trainerId" };
  const surveysTable       = { id: "id", clientId: "clientId", createdAt: "createdAt" };
  const trainerNotesTable  = { id: "id", clientId: "clientId", content: "content", createdAt: "createdAt", updatedAt: "updatedAt" };
  const exercisesTable     = { id: "id", name: "name", isActive: "isActive" };
  const surveyInvitesTable = { id: "id", trainerId: "trainerId", tokenHash: "tokenHash", usedAt: "usedAt", revokedAt: "revokedAt", expiresAt: "expiresAt" };

  type Cond =
    | { field?: string; val?: unknown; op?: string }
    | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")      return item[cond.field] === cond.val;
    if (cond.op === "isNull")  return item[cond.field] === null;
    if (cond.op === "gt") {
      const a = item[cond.field], b = cond.val;
      if (a instanceof Date && b instanceof Date) return a > b;
      return false;
    }
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)      return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)       return clientsStore  as unknown as Record<string, unknown>[];
    if (table === surveysTable)       return surveysStore  as unknown as Record<string, unknown>[];
    if (table === trainerNotesTable)  return notesStore    as unknown as Record<string, unknown>[];
    if (table === surveyInvitesTable) return invitesStore  as unknown as Record<string, unknown>[];
    if (table === exercisesTable)     return exercisesStore as unknown as Record<string, unknown>[];
    return [];
  }

  // Thenable chain supporting .orderBy().limit().where() chaining.
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
    // ── SELECT ──────────────────────────────────────────────────────────────
    select: (_shape?: unknown) => ({
      from: (table: unknown) => chain(getStore(table)),
    }),

    // ── INSERT ──────────────────────────────────────────────────────────────
    insert: (table: unknown) => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const id = nextId++;
          const now = new Date();
          if (table === surveysTable) {
            const item: StoredSurvey = { id, createdAt: now, avoidedExerciseIds: [], avoidedExerciseReasons: null, avoidedExerciseOtherText: null, avoidedExerciseOtherReason: null, trainingGoal: "", ...data } as unknown as StoredSurvey; // clientId comes from data
            surveysStore.push(item);
            return [item];
          }
          if (table === trainerNotesTable) {
            const item: StoredNote = { id, createdAt: now, updatedAt: now, clientId: 0, content: "", ...data } as StoredNote;
            notesStore.push(item);
            return [item];
          }
          if (table === surveyInvitesTable) {
            const item: StoredInvite = { id, createdAt: now, usedAt: null, revokedAt: null, trainerId: 0, tokenHash: "", intendedEmail: null, expiresAt: now, ...data } as StoredInvite;
            invitesStore.push(item);
            return [item];
          }
          if (table === clientsTable) {
            const item: StoredClient = { id, createdAt: now, updatedAt: now, firstName: "", lastName: "", email: null, phone: null, notes: null, status: "active", trainerId: 0, ...data } as StoredClient;
            clientsStore.push(item);
            return [item];
          }
          return [];
        },
      }),
    }),

    // ── UPDATE ──────────────────────────────────────────────────────────────
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

    // ── DELETE ──────────────────────────────────────────────────────────────
    delete: (table: unknown) => ({
      where: (cond: Cond) => ({
        returning: async () => {
          const store = getStore(table);
          const idx = store.findIndex((i) => matchesCondition(i, cond));
          if (idx === -1) return [];
          const [removed] = store.splice(idx, 1);
          return [removed];
        },
      }),
    }),

    // ── TRANSACTION (used by requireAuth's provisionTrainer) ─────────────
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (data: Record<string, unknown>) => ({
            onConflictDoNothing: () => Promise.resolve(),
            returning: async () => {
              if (table === clientsTable) {
                const item: StoredClient = { id: nextId++, createdAt: new Date(), updatedAt: new Date(), firstName: "", lastName: "", email: null, phone: null, notes: null, status: "active", trainerId: 0, ...data } as StoredClient;
                clientsStore.push(item);
                return [item];
              }
              if (table === surveyInvitesTable) {
                const item: StoredInvite = { id: nextId++, createdAt: new Date(), usedAt: null, revokedAt: null, trainerId: 0, tokenHash: "", intendedEmail: null, expiresAt: new Date(), ...data } as StoredInvite;
                invitesStore.push(item);
                return [item];
              }
              return [];
            },
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => ({
            where: (cond: Cond) => Promise.resolve(getStore(table).filter((i) => matchesCondition(i, cond))),
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
      };
      return fn(tx);
    },

    // Table exports consumed by route files.
    trainersTable,
    clientsTable,
    surveysTable,
    trainerNotesTable,
    exercisesTable,
    surveyInvitesTable,
  };

  return {
    db,
    trainersTable,
    clientsTable,
    surveysTable,
    trainerNotesTable,
    exercisesTable,
    surveyInvitesTable,
    // Type-only exports (not used at runtime).
    insertClientSchema: {},
  };
});

// ─── DB operators mock ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args,
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  asc:     (field: string)               => ({ field, dir: "asc" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  gt:      (field: string, val: unknown) => ({ field, val, op: "gt" }),
}));

// ─── App builders ─────────────────────────────────────────────────────────────

let app: Express;
let publicApp: Express;

beforeAll(async () => {
  const [
    { default: surveysRouter },
    { default: notesRouter },
    { default: publicRouter },
  ] = await Promise.all([
    import("../routes/surveys"),
    import("../routes/notes"),
    import("../routes/public"),
  ]);

  app = express();
  app.use(express.json());
  app.use(surveysRouter);
  app.use(notesRouter);

  publicApp = express();
  publicApp.use(express.json());
  publicApp.use(publicRouter);
});

// ─── Test data helpers ────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

beforeEach(() => {
  nextId = 200;
  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];
  clientsStore  = [
    { id: 10, trainerId: 1, firstName: "Client", lastName: "A", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: 2, firstName: "Client", lastName: "B", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];
  surveysStore = [
    { id: 1, clientId: 10, trainingGoal: "Masa", avoidedExerciseIds: [], avoidedExerciseReasons: null, avoidedExerciseOtherText: null, avoidedExerciseOtherReason: null, createdAt: new Date() },
    { id: 2, clientId: 20, trainingGoal: "Siła", avoidedExerciseIds: [], avoidedExerciseReasons: null, avoidedExerciseOtherText: null, avoidedExerciseOtherReason: null, createdAt: new Date() },
  ];
  notesStore = [
    { id: 1, clientId: 10, content: "Note A",  createdAt: new Date(), updatedAt: new Date() },
    { id: 2, clientId: 20, content: "Note B",  createdAt: new Date(), updatedAt: new Date() },
  ];
  invitesStore   = [];
  exercisesStore = [];
  setAuth(null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Survey ownership (Task #81B-1)", () => {

  it("(1) unauthenticated survey read → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/survey");
    expect(res.status).toBe(401);
  });

  it("(2) Trainer A reads own survey → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/survey");
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBe(10);
  });

  it("(3) Trainer A reads Trainer B survey → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/survey");
    expect(res.status).toBe(404);
  });

  it("(4) Trainer A updates Trainer B survey → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .patch("/clients/20/surveys/2")
      .send({ trainingGoal: "Hacked" });
    expect(res.status).toBe(404);
    // Verify the store was not mutated
    expect(surveysStore.find((s) => s.id === 2)!.trainingGoal).toBe("Siła");
  });

  it("(5) request-body trainerId is ignored on survey PUT", async () => {
    setAuth("user_A");
    const res = await request(app)
      .put("/clients/10/survey")
      .send({ trainingGoal: "Masa", trainerId: 999 });
    expect(res.status).toBe(200);
    // The new survey row must be scoped to clientId 10, not affected by body trainerId
    const created = surveysStore.find((s) => s.clientId === 10 && s.id !== 1);
    expect(created).toBeDefined();
    expect(created!.clientId).toBe(10);
  });

  it("(6) Trainer A reads own avoided exercises → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/avoided-exercises");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("(7) Trainer A reads Trainer B avoided exercises → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/avoided-exercises");
    expect(res.status).toBe(404);
  });
});

describe("Notes ownership (Task #81B-1)", () => {

  it("(8) unauthenticated notes list → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/notes");
    expect(res.status).toBe(401);
  });

  it("(9) Trainer A reads Trainer B notes → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/notes");
    expect(res.status).toBe(404);
  });

  it("(10) Trainer A cannot create note for Trainer B client → 404", async () => {
    setAuth("user_A");
    const before = notesStore.length;
    const res = await request(app)
      .post("/clients/20/notes")
      .send({ content: "Injected" });
    expect(res.status).toBe(404);
    expect(notesStore.length).toBe(before); // no note was created
  });

  it("(11) Trainer A cannot update Trainer B note (derives ownership via note → client) → 404", async () => {
    setAuth("user_A");
    // note 2 belongs to client 20 (Trainer B), even though URL has clientId=10 (Trainer A's)
    const res = await request(app)
      .patch("/clients/10/notes/2")
      .send({ content: "Hacked" });
    expect(res.status).toBe(404);
    expect(notesStore.find((n) => n.id === 2)!.content).toBe("Note B"); // unchanged
  });

  it("(12) Trainer A cannot delete Trainer B note (derives ownership via note → client) → 404", async () => {
    setAuth("user_A");
    // note 2 belongs to client 20 (Trainer B)
    const res = await request(app).delete("/clients/10/notes/2");
    expect(res.status).toBe(404);
    expect(notesStore.find((n) => n.id === 2)).toBeDefined(); // not deleted
  });
});

describe("Public survey invitation regression (Task #81B-1)", () => {

  it("(13) GET /public/survey/:token works without trainer login", async () => {
    setAuth(null);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    invitesStore.push({
      id: 1, trainerId: 1, tokenHash, intendedEmail: "test@example.com",
      expiresAt: new Date(Date.now() + 86400_000),
      usedAt: null, revokedAt: null, createdAt: new Date(),
    });
    const res = await request(publicApp).get(`/public/survey/${rawToken}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.intendedEmail).toBe("test@example.com");
  });

  it("(14) POST /public/survey/:token response never contains internal trainer notes", async () => {
    setAuth(null);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    invitesStore.push({
      id: 1, trainerId: 1, tokenHash, intendedEmail: null,
      expiresAt: new Date(Date.now() + 86400_000),
      usedAt: null, revokedAt: null, createdAt: new Date(),
    });
    // Add a note for the trainer — must never appear in the public response.
    notesStore.push({ id: 99, clientId: 10, content: "INTERNAL", createdAt: new Date(), updatedAt: new Date() });

    const res = await request(publicApp)
      .post(`/public/survey/${rawToken}`)
      .send({
        firstName: "Jan", lastName: "Test", email: "jan@example.com",
        phone: "", trainingGoal: "Masa", experienceLevel: "Początkujący",
        dateOfBirth: "1990-01-01", gender: "Mężczyzna", heightCm: 180, weightKg: 80,
      });

    expect(res.status).toBe(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("INTERNAL");
    expect(body).not.toContain("trainer_notes");
    expect(res.body).not.toHaveProperty("notes");
  });
});
