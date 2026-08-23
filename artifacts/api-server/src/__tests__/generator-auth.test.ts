/**
 * Generator route ownership — Vitest tests (Task #81B-2B-1)
 *
 * Covers:
 *  - unauthenticated requests → 401
 *  - Trainer A cannot read/generate for Trainer B's client → 404
 *  - trainerId in request body is ignored
 *  - valid owner operations succeed
 *
 * Routes under test:
 *  GET  /clients/:clientId/plan-draft-input
 *  POST /plans/draft-input/validate
 *  POST /plans/draft-volume/preview
 *  POST /plans/draft-distribution/preview
 *  POST /clients/:clientId/plan-draft/generate-day
 *  POST /clients/:clientId/plan-draft/balance-week
 *  POST /clients/:clientId/plan-draft/record-generation
 *  GET  /clients/:clientId/exercise-recommendations
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

// ─── Mock heavy services ──────────────────────────────────────────────────────

vi.mock("../services/planDraftInputService", () => ({
  loadPlanDraftInput: async (clientId: number) => ({
    input: {
      clientId,
      experienceLevel: "Początkujący",
      priorityMuscleGroups: [],
      excludedMuscleGroups: [],
      sleepHours: 7,
      stressLevel: "Niski",
      physicalWork: "Siedzący",
      dailyActivity: "Niska",
      recoveryQuality: "Dobra",
    },
    warnings: [],
  }),
}));

vi.mock("../services/planDraftVolumeDecisionService", () => ({
  calculateVolumeDecisions: async () => ({ targets: [] }),
}));

vi.mock("../services/planDraftVolumeDistributionService", () => ({
  calculateVolumeDistribution: async () => ({ days: [] }),
}));

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
  buildCompatibilityFilter: () => () => true,
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

// ─── Mock @workspace/api-zod ─────────────────────────────────────────────────

const passBody = { safeParse: (d: unknown) => ({ success: true as const, data: d as Record<string, unknown> }) };
const passResp = { parse: (d: unknown) => d };
const coerceParams = (d: unknown) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    out[k] = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  }
  return { success: true as const, data: out };
};

vi.mock("@workspace/api-zod", () => ({
  GetClientPlanDraftInputParams:    { safeParse: coerceParams },
  ValidateDraftInputBody:           passBody,
  ValidateDraftInputResponse:       passResp,
  DraftVolumePreviewBody:           passBody,
  DraftVolumeDistributionBody:      passBody,
  ListExerciseRecommendationsResponse: passResp,
  VALID_EXPERIENCE_LEVELS:          ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"],
  PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS: ["Średniozaawansowany", "Zaawansowany"],
  getCompatibleSplits:              () => [],
}));

// ─── Shared in-memory stores ──────────────────────────────────────────────────

const TRAINER_A = { id: 1, clerkUserId: "user_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

type StoredTrainer = typeof TRAINER_A;
type StoredClient  = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredSurvey  = { id: number; clientId: number; [key: string]: unknown };
type StoredUsageLog = { id: number; clientId: number; generationId: string; exerciseId: number };

let trainersStore:  StoredTrainer[]  = [];
let clientsStore:   StoredClient[]   = [];
let surveysStore:   StoredSurvey[]   = [];
let usageLogStore:  StoredUsageLog[] = [];
let nextId = 3000;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable              = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable               = { id: "id", trainerId: "trainerId", firstName: "firstName", lastName: "lastName" };
  const surveysTable               = { id: "id", clientId: "clientId", createdAt: "createdAt", trainingLocation: "trainingLocation", equipment: "equipment", avoidedExerciseIds: "avoidedExerciseIds", experienceLevel: "experienceLevel", trainingGoal: "trainingGoal" };
  const exercisesTable             = { id: "id", isActive: "isActive", name: "name", exerciseType: "exerciseType", exercisePriority: "exercisePriority", mainMuscleGroup: "mainMuscleGroup", suitableForNoActivity: "suitableForNoActivity" };
  const clientExerciseUsageLogTable = { id: "id", clientId: "clientId", generationId: "generationId", exerciseId: "exerciseId" };
  const volumeTargetsTable         = { id: "id", isActive: "isActive" };

  type Cond = { field?: string; val?: unknown; op?: string } | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")     return item[cond.field] === cond.val;
    if (cond.op === "isNull") return item[cond.field] == null;
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)              return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)               return clientsStore  as unknown as Record<string, unknown>[];
    if (table === surveysTable)               return surveysStore  as unknown as Record<string, unknown>[];
    if (table === clientExerciseUsageLogTable) return usageLogStore as unknown as Record<string, unknown>[];
    // volume targets — return empty (services are mocked)
    return [];
  }

  function chain(items: Record<string, unknown>[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit:   (n: number)          => chain(items.slice(0, n)),
      where:   (cond: Cond)         => chain(items.filter((i) => matchesCondition(i, cond))),
    };
  }

  const db = {
    select: (_shape?: unknown) => ({
      from: (table: unknown) => chain(getStore(table)),
    }),

    insert: (table: unknown) => ({
      values: (data: Record<string, unknown> | Record<string, unknown>[]) => ({
        onConflictDoNothing: () => Promise.resolve(),
        returning: async () => {
          const rows = Array.isArray(data) ? data : [data];
          return rows.map((d) => {
            const item = { id: nextId++, createdAt: new Date(), ...d };
            if (table === clientExerciseUsageLogTable) {
              usageLogStore.push(item as unknown as StoredUsageLog);
            }
            return item;
          });
        },
      }),
    }),

    update: (_table: unknown) => ({
      set: (_data: unknown) => ({
        where: (_cond: unknown) => ({
          returning: async () => [],
        }),
      }),
    }),

    delete: (_table: unknown) => ({
      where: (_cond: unknown) => ({ returning: async () => [] }),
    }),

    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (data: Record<string, unknown> | Record<string, unknown>[]) => ({
            onConflictDoNothing: () => Promise.resolve(),
            returning: async () => {
              const rows = Array.isArray(data) ? data : [data];
              return rows.map((d) => {
                const item = { id: nextId++, createdAt: new Date(), ...d };
                if (table === clientExerciseUsageLogTable) {
                  usageLogStore.push(item as unknown as StoredUsageLog);
                }
                return item;
              });
            },
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => ({
            where: (cond: Cond) =>
              Promise.resolve(getStore(table).filter((i) => matchesCondition(i, cond))),
          }),
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
    surveysTable,
    exercisesTable,
    clientExerciseUsageLogTable,
    volumeTargetsTable,
    insertClientSchema: {},
  };

  return { db, trainersTable, clientsTable, surveysTable, exercisesTable, clientExerciseUsageLogTable, volumeTargetsTable, insertClientSchema: {} };
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
  const [
    { default: planDraftInputRouter },
    { default: planDraftGenerateDayRouter },
    { default: planDraftBalanceWeekRouter },
    { default: planDraftRecordGenerationRouter },
    { default: recommendationsRouter },
  ] = await Promise.all([
    import("../routes/planDraftInput"),
    import("../routes/planDraftGenerateDay"),
    import("../routes/planDraftBalanceWeek"),
    import("../routes/planDraftRecordGeneration"),
    import("../routes/recommendations"),
  ]);

  app = express();
  app.use(express.json());
  app.use(planDraftInputRouter);
  app.use(planDraftGenerateDayRouter);
  app.use(planDraftBalanceWeekRouter);
  app.use(planDraftRecordGenerationRouter);
  app.use(recommendationsRouter);
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

// ─── Store reset ──────────────────────────────────────────────────────────────

beforeEach(() => {
  nextId = 3000;
  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];
  clientsStore = [
    { id: 10, trainerId: 1, firstName: "Client", lastName: "A", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: 2, firstName: "Client", lastName: "B", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];
  surveysStore = [
    { id: 1, clientId: 10, experienceLevel: "Początkujący", trainingGoal: "Masa", trainingLocation: "Siłownia", equipment: "Sztangi", avoidedExerciseIds: [] },
    { id: 2, clientId: 20, experienceLevel: "Początkujący", trainingGoal: "Siła", trainingLocation: "Siłownia", equipment: "Sztangi", avoidedExerciseIds: [] },
  ];
  usageLogStore = [];
  setAuth(null);
});

// ─── Shared body helpers ──────────────────────────────────────────────────────

const validateBody = { clientId: 10, preferences: { splitType: "full_body", trainingDays: 3, blockDurationWeeks: 4 } };
const volumePreviewBody = { clientId: 10, preferences: { trainingDays: 3, sessionDurationMinutes: 60, priorityMuscleGroups: [] }, trainerVolumeOverrides: [] };
const distributionBody = { clientId: 10, experienceLevel: "Początkujący", trainingDays: 3, selectedSplitType: "full_body", selectedWeeklyVolumes: [], priorityTargetIds: [], corePriority: "normal" };
const balanceWeekBody = { days: [{ exercises: [] }] };
const recordGenerationBody = { generationId: "550e8400-e29b-41d4-a716-446655440000", exerciseIds: [1] };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Generator route authorization (Task #81B-2B-1)", () => {

  // ── 1. Unauthenticated plan-draft input → 401 ───────────────────────────────

  it("(1) unauthenticated GET /clients/:clientId/plan-draft-input → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/plan-draft-input");
    expect(res.status).toBe(401);
  });

  // ── 2. Trainer A can read generator input for Client A ──────────────────────

  it("(2) Trainer A reads plan-draft-input for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/plan-draft-input");
    expect(res.status).toBe(200);
  });

  // ── 3. Trainer A cannot read generator input for Trainer B's client ─────────

  it("(3) Trainer A reads plan-draft-input for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/plan-draft-input");
    expect(res.status).toBe(404);
  });

  // ── 4. Unauthenticated generate-day → 401 ──────────────────────────────────

  it("(4) unauthenticated POST /clients/:clientId/plan-draft/generate-day → 401", async () => {
    setAuth(null);
    const res = await request(app)
      .post("/clients/10/plan-draft/generate-day")
      .send({ v0SessionType: "push" });
    expect(res.status).toBe(401);
  });

  // ── 5. Trainer A cannot generate a day for Trainer B's client ───────────────

  it("(5) Trainer A generates day for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/20/plan-draft/generate-day")
      .send({ v0SessionType: "push" });
    expect(res.status).toBe(404);
  });

  // ── 6. Trainer A cannot balance a week for Trainer B's client ───────────────

  it("(6) Trainer A balances week for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/20/plan-draft/balance-week")
      .send(balanceWeekBody);
    expect(res.status).toBe(404);
  });

  // ── 7. Trainer A cannot record generation for Trainer B's client ────────────

  it("(7) Trainer A records generation for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/20/plan-draft/record-generation")
      .send(recordGenerationBody);
    expect(res.status).toBe(404);
    // No usage log rows should have been written
    expect(usageLogStore.length).toBe(0);
  });

  // ── 8. Trainer A cannot request recommendations for Trainer B's client ──────

  it("(8) Trainer A requests recommendations for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/exercise-recommendations");
    expect(res.status).toBe(404);
  });

  // ── 9. trainerId supplied in request body is ignored ────────────────────────

  it("(9) trainerId in body is ignored — ownership comes from session only", async () => {
    setAuth("user_A");
    // Trainer A sends clientId=20 (Trainer B's client) with a body trainerId=1 (their own).
    // The route must ignore body.trainerId and use req.trainer.id from session → 404.
    const res = await request(app)
      .post("/plans/draft-volume/preview")
      .send({ ...volumePreviewBody, clientId: 20, trainerId: 1 });
    expect(res.status).toBe(404);
  });

  // ── 10. Valid owner generation returns successful result ─────────────────────

  it("(10a) Trainer A validate for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/draft-input/validate")
      .send(validateBody);
    expect(res.status).toBe(200);
  });

  it("(10b) Trainer A draft-volume/preview for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/draft-volume/preview")
      .send(volumePreviewBody);
    expect(res.status).toBe(200);
  });

  it("(10c) Trainer A balance-week for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/10/plan-draft/balance-week")
      .send(balanceWeekBody);
    expect(res.status).toBe(200);
  });

  it("(10d) Trainer A record-generation for own client → 201", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/10/plan-draft/record-generation")
      .send(recordGenerationBody);
    expect(res.status).toBe(201);
  });

  it("(10e) Trainer A recommendations for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/exercise-recommendations");
    expect(res.status).toBe(200);
  });

  // ── 11. Validate and distribution/preview also block foreign clients ─────────
  // (Existing validate + distribution routes now check ownership from body clientId)

  it("(11a) validate with foreign clientId in body → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/draft-input/validate")
      .send({ ...validateBody, clientId: 20 });
    expect(res.status).toBe(404);
  });

  it("(11b) distribution/preview with foreign clientId in body → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/draft-distribution/preview")
      .send({ ...distributionBody, clientId: 20 });
    expect(res.status).toBe(404);
  });
});
