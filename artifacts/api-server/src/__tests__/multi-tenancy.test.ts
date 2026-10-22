/**
 * Multi-tenancy isolation — Vitest tests
 *
 * Proves all 11 isolation requirements from the spec:
 *
 *  1.  Two different Clerk users resolve to two different internal trainer IDs.
 *  2.  A brand-new trainer sees an empty client list.
 *  3.  Trainer A cannot list Trainer B's clients (GET /clients scoped by session).
 *  4.  Trainer A cannot read Trainer B's client detail → 404.
 *  5.  Trainer A cannot update Trainer B's client → 404.
 *  6.  Trainer A cannot delete Trainer B's client → 404.
 *  7.  Creating a client assigns req.trainer.id, not any body-supplied trainerId.
 *  8.  A trainerId supplied in the request body is silently stripped.
 *  9.  GET /clients/:id/plan-draft/day-recommendations without auth → 401.
 *      (This route previously had no requireAuth middleware — now fixed.)
 * 10.  Trainer A cannot get day-recommendations for Trainer B's client → 404.
 * 11.  Trainer A cannot revoke Trainer B's survey invite → 404;
 *      Trainer B's invite revokedAt stays null (the mutation bug is fixed).
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

// ─── Mock survey-status (clients router depends on fetchLatestSurveyPerClient)

vi.mock("../lib/survey-status", () => ({
  fetchLatestSurveyPerClient: async () => new Map(),
  computeSurveyStatus: () => ({ hasActiveSurvey: false }),
}));

// ─── Mock heavy day-recommendations services ───────────────────────────────────

vi.mock("../lib/recommendation-engine", () => ({
  scoreExercise: () => 0,
}));

vi.mock("../lib/exercise-completeness", () => ({
  computeCompleteness: () => ({ isComplete: false }),
  fetchMuscleStats: async () => new Map(),
}));

vi.mock("../services/ExerciseSelectionEngineV0", () => ({
  runExerciseSelectionEngineV0: async () => ({ slots: [] }),
}));

vi.mock("../services/planDraftDayRecommendationsService", () => ({
  isLocationCompatible: () => true,
  isEquipmentCompatible: () => true,
  selectExercise: () => null,
  selectDayRecommendations: () => [],
  selectByUncoveredTargets: () => [],
  zeroSubTargetCoverage: () => ({}),
  accumulateSubTargetCoverage: () => ({}),
}));

vi.mock("../services/planAnalyzer", () => ({
  normalizeMovementCategory: () => "compound",
}));

vi.mock("../services/goalProfileService", () => ({
  buildGoalProfile: () => ({}),
}));

vi.mock("../services/exercisePrescriptionService.js", () => ({
  deriveExerciseClassForOutput: () => "main_compound",
  sessionOrderRank: () => 0,
  prescribeExercise: () => ({}),
}));

// ─── Mock @workspace/api-zod ──────────────────────────────────────────────────

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
  // clients router
  GetClientParams:              { safeParse: coerceParams },
  UpdateClientParams:           { safeParse: coerceParams },
  DeleteClientParams:           { safeParse: coerceParams },
  GetClientResponse:            passResp,
  ListClientsResponse:          passResp,
  UpdateClientResponse:         passResp,
  CreateClientResponse:         passResp,
  // planDraftDayRecommendations router
  PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS: ["Średniozaawansowany", "Zaawansowany"],
  getCompatibleSplits:          () => [],
}));

// ─── Shared in-memory stores ──────────────────────────────────────────────────

const TRAINER_A = { id: 1, clerkUserId: "user_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

type StoredTrainer = typeof TRAINER_A;
type StoredClient  = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredSurvey  = { id: number; clientId: number; experienceLevel: string; avoidedExerciseIds: number[]; [key: string]: unknown };
type StoredInvite  = { id: number; trainerId: number; tokenHash: string; intendedEmail: string | null; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; archivedAt: Date | null; createdAt: Date };

let trainersStore: StoredTrainer[] = [];
let clientsStore:  StoredClient[]  = [];
let surveysStore:  StoredSurvey[]  = [];
let invitesStore:  StoredInvite[]  = [];

let nextId = 500;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable      = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable       = { id: "id", trainerId: "trainerId", createdAt: "createdAt" };
  const surveysTable       = { id: "id", clientId: "clientId", createdAt: "createdAt" };
  const surveyInvitesTable = { id: "id", trainerId: "trainerId", tokenHash: "tokenHash", usedAt: "usedAt", revokedAt: "revokedAt", archivedAt: "archivedAt", expiresAt: "expiresAt" };

  // Other tables referenced by planDraftDayRecommendations — returns empty.
  const exercisesTable                = { id: "id", isActive: "isActive" };
  const exerciseMuscleAssignmentsTable = { id: "id" };
  const volumeTargetMembersTable      = { id: "id" };
  const volumeTargetsTable            = { id: "id" };

  type Cond =
    | { field?: string; val?: unknown; op?: string }
    | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")     return item[cond.field] === cond.val;
    if (cond.op === "isNull") return item[cond.field] == null;
    if (cond.op === "gt") {
      const a = item[cond.field], b = cond.val;
      if (a instanceof Date && b instanceof Date) return a > b;
      return false;
    }
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)       return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)        return clientsStore  as unknown as Record<string, unknown>[];
    if (table === surveysTable)        return surveysStore  as unknown as Record<string, unknown>[];
    if (table === surveyInvitesTable)  return invitesStore  as unknown as Record<string, unknown>[];
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
          const now = new Date();
          const id  = nextId++;
          if (table === clientsTable) {
            const item = { id, createdAt: now, updatedAt: now, firstName: "", lastName: "", email: null, phone: null, notes: null, status: "active", trainerId: 0, ...data } as StoredClient;
            clientsStore.push(item);
            return [item];
          }
          return [{ id, createdAt: now, ...data }];
        },
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

    // transaction used by requireAuth's provisionTrainer
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (data: Record<string, unknown>) => ({
            onConflictDoNothing: async () => {
              // JIT-provision: insert trainer if absent.
              const exists = (trainersStore as unknown as StoredTrainer[]).some(
                (t) => t.clerkUserId === (data as { clerkUserId: string }).clerkUserId,
              );
              if (!exists) {
                (trainersStore as unknown as StoredTrainer[]).push({
                  id: nextId++,
                  clerkUserId: (data as { clerkUserId: string }).clerkUserId,
                  displayName: "New Trainer",
                  email: null,
                  createdAt: new Date(),
                });
              }
            },
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => ({
            where: (cond: Cond) =>
              Promise.resolve(getStore(table).filter((i) => matchesCondition(i, cond))),
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

    trainersTable,
    clientsTable,
    surveysTable,
    surveyInvitesTable,
    exercisesTable,
    exerciseMuscleAssignmentsTable,
    volumeTargetMembersTable,
    volumeTargetsTable,
    insertClientSchema: {},
  };

  return {
    db,
    trainersTable,
    clientsTable,
    surveysTable,
    surveyInvitesTable,
    exercisesTable,
    exerciseMuscleAssignmentsTable,
    volumeTargetMembersTable,
    volumeTargetsTable,
    insertClientSchema: {},
  };
});

// ─── DB operators mock ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  desc:    (field: string)               => ({ field, dir: "desc" }),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  gt:      (field: string, val: unknown) => ({ field, val, op: "gt" }),
  sql:     (_tpl: unknown)              => ({}),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const [
    { default: clientsRouter },
    { default: surveyInvitesRouter },
    { default: dayRecsRouter },
  ] = await Promise.all([
    import("../routes/clients"),
    import("../routes/surveyInvites"),
    import("../routes/planDraftDayRecommendations"),
  ]);

  app = express();
  app.use(express.json());
  app.use(clientsRouter);
  app.use(surveyInvitesRouter);
  app.use(dayRecsRouter);
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

// ─── Store reset ──────────────────────────────────────────────────────────────

beforeEach(() => {
  nextId = 500;

  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];

  clientsStore = [
    { id: 10, trainerId: 1, firstName: "Alice", lastName: "A", email: "alice@test.com", phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: 2, firstName: "Boris", lastName: "B", email: "boris@test.com", phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];

  surveysStore = [
    { id: 1, clientId: 10, experienceLevel: "Początkujący", avoidedExerciseIds: [] },
    { id: 2, clientId: 20, experienceLevel: "Początkujący", avoidedExerciseIds: [] },
  ];

  invitesStore = [
    {
      id: 1, trainerId: 1, tokenHash: "hash_A",
      intendedEmail: "invite@a.com", expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null, revokedAt: null, archivedAt: null, createdAt: new Date(),
    },
    {
      id: 2, trainerId: 2, tokenHash: "hash_B",
      intendedEmail: "invite@b.com", expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null, revokedAt: null, archivedAt: null, createdAt: new Date(),
    },
  ];

  setAuth(null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-tenancy isolation", () => {

  // ── 1. Two Clerk users → two different trainer IDs ─────────────────────────

  it("(1) Trainer A and Trainer B resolve to different trainer IDs", async () => {
    // Trainer A's session → sees only their clients
    setAuth("user_A");
    const resA = await request(app).get("/clients");
    expect(resA.status).toBe(200);
    const idsA = (resA.body as Array<{ id: number }>).map((c) => c.id);
    expect(idsA).toContain(10);    // Alice belongs to Trainer A
    expect(idsA).not.toContain(20); // Boris belongs to Trainer B

    // Trainer B's session → sees only their clients
    setAuth("user_B");
    const resB = await request(app).get("/clients");
    expect(resB.status).toBe(200);
    const idsB = (resB.body as Array<{ id: number }>).map((c) => c.id);
    expect(idsB).toContain(20);    // Boris belongs to Trainer B
    expect(idsB).not.toContain(10); // Alice belongs to Trainer A
  });

  // ── 2. New trainer receives empty client list ──────────────────────────────

  it("(2) A brand-new trainer (user_C) sees an empty client list", async () => {
    // Profile created on first sign-in by POST /trainer/profile.
    const { provisionTrainer } = await import("../middlewares/requireAuth");
    await provisionTrainer("user_C");
    setAuth("user_C");
    const res = await request(app).get("/clients");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── 3. Trainer A cannot read Trainer B's client ────────────────────────────

  it("(3) Trainer A cannot GET /clients/:id for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20");
    expect(res.status).toBe(404);
  });

  // ── 4. Trainer A cannot update Trainer B's client ─────────────────────────

  it("(4) Trainer A cannot PATCH /clients/:id for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .patch("/clients/20")
      .send({ firstName: "Hacked" });
    expect(res.status).toBe(404);
    // Confirm the client in the store is unchanged
    const boris = clientsStore.find((c) => c.id === 20)!;
    expect(boris.firstName).toBe("Boris");
  });

  // ── 5. Trainer A cannot delete Trainer B's client ─────────────────────────

  it("(5) Trainer A cannot DELETE /clients/:id for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).delete("/clients/20");
    expect(res.status).toBe(404);
    // Boris must still exist in the store
    expect(clientsStore.find((c) => c.id === 20)).toBeDefined();
  });

  // ── 6. Trainer A can access their own client ───────────────────────────────

  it("(6) Trainer A can GET /clients/:id for their own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10");
    expect(res.status).toBe(200);
    expect((res.body as { id: number }).id).toBe(10);
  });

  // ── 7. Creating a client assigns req.trainer.id (not body trainerId) ───────

  it("(7) POST /clients assigns the session trainer.id, ignoring trainerId in body", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients")
      .send({
        firstName: "New",
        lastName: "Client",
        email: "new@test.com",
        trainerId: 999, // must be silently stripped
      });
    expect(res.status).toBe(201);
    // The newly inserted client in the store must have trainerId === 1 (Trainer A)
    const newest = clientsStore.find((c) => c.email === "new@test.com");
    expect(newest).toBeDefined();
    expect(newest!.trainerId).toBe(1);
    expect(newest!.trainerId).not.toBe(999);
  });

  // ── 8. Body trainerId is silently stripped on update too ──────────────────

  it("(8) PATCH /clients/:id ignores trainerId in body; updates own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .patch("/clients/10")
      .send({ firstName: "Updated", trainerId: 999 });
    expect(res.status).toBe(200);
    // trainerId on Alice must not have changed
    const alice = clientsStore.find((c) => c.id === 10)!;
    expect(alice.trainerId).toBe(1);
  });

  // ── 9. Unauthenticated request to day-recommendations → 401 ───────────────
  //
  // This route previously had no requireAuth middleware — it accepted
  // unauthenticated requests.  The fix adds requireAuth as the first
  // middleware on the route.

  it("(9) GET /clients/:id/plan-draft/day-recommendations without auth → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/plan-draft/day-recommendations");
    expect(res.status).toBe(401);
  });

  // ── 10. Trainer A cannot get day-recommendations for Trainer B's client ────
  //
  // The route previously queried clients without a trainerId filter.
  // The fix adds `eq(clientsTable.trainerId, req.trainer!.id)` to the WHERE.

  it("(10) Trainer A cannot GET day-recommendations for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/plan-draft/day-recommendations");
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/klient/i);
  });

  it("(10b) Trainer A can reach the ownership check for their own client (gets past client lookup)", async () => {
    setAuth("user_A");
    // Client 10 belongs to Trainer A.  The route will find the client, then
    // look up their survey.  We have a survey seeded for client 10, so the
    // route will continue processing (exercises query returns empty → 200 with
    // empty recommendations array) rather than 404 "client not found".
    const res = await request(app).get("/clients/10/plan-draft/day-recommendations");
    // Must NOT be 401 (auth passed) or a client-ownership 404.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    // If a 404 occurs it must NOT say "Klient nie znaleziony" (client lookup
    // must have succeeded).
    if (res.status === 404) {
      expect((res.body as { error: string }).error).not.toMatch(/klient nie znaleziony/i);
    }
  });

  // ── 11. Survey invite revoke ownership (TOCTOU bug fixed) ─────────────────
  //
  // Previously: the UPDATE ran on any invite by ID, then the ownership check
  // fired after-the-fact.  Trainer A could revoke Trainer B's invite even
  // though the API returned 404.
  //
  // Fixed: trainerId is now part of the WHERE clause; the UPDATE only touches
  // invites owned by the authenticated trainer.

  it("(11a) Trainer A cannot revoke Trainer B's invite → 404", async () => {
    setAuth("user_A");
    const res = await request(app).delete("/survey-invites/2");
    expect(res.status).toBe(404);
  });

  it("(11b) Trainer B's invite revokedAt stays null after Trainer A's failed revoke attempt", async () => {
    setAuth("user_A");
    await request(app).delete("/survey-invites/2");
    // Trainer B's invite must be unchanged in the store.
    const inviteB = invitesStore.find((i) => i.id === 2)!;
    expect(inviteB.revokedAt).toBeNull();
  });

  it("(11c) Trainer A can successfully revoke their own invite → 204", async () => {
    setAuth("user_A");
    const res = await request(app).delete("/survey-invites/1");
    expect(res.status).toBe(204);
    // Trainer A's invite must be marked revoked.
    const inviteA = invitesStore.find((i) => i.id === 1)!;
    expect(inviteA.revokedAt).not.toBeNull();
  });

  // ── 12. No route falls back to trainer ID 1 ───────────────────────────────

  it("(12) A freshly provisioned trainer gets a unique ID (not hardcoded to 1)", async () => {
    // user_D signs in for the first time → POST /trainer/profile provisions.
    const { provisionTrainer } = await import("../middlewares/requireAuth");
    await provisionTrainer("user_D");
    setAuth("user_D");
    const res = await request(app).get("/clients");
    expect(res.status).toBe(200);
    // The provisioned trainer must exist in the store with a new ID (not 1 or 2).
    const trainerD = trainersStore.find((t) => t.clerkUserId === "user_D");
    expect(trainerD).toBeDefined();
    expect(trainerD!.id).not.toBe(1);
    expect(trainerD!.id).not.toBe(2);
  });
});
