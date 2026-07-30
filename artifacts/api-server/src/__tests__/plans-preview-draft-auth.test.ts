/**
 * Generator-adjacent plan routes — ownership authorization tests (Task #81B-2B-2)
 *
 * Routes under test:
 *  POST /clients/:clientId/plans/draft
 *  POST /plans/volume-preview
 *  POST /plans/analysis-preview
 *
 * Test matrix:
 *  1. unauthenticated POST /clients/:clientId/plans/draft → 401
 *  2. Trainer A cannot create a draft for Trainer B's client → 404
 *  3. owner can create a draft normally → 201
 *  4. unauthenticated volume preview → 401
 *  5. unauthenticated analysis preview → 401
 *  6. foreign clientId in volume-preview → 404
 *  7. foreign clientId in analysis-preview → 404
 *  8. foreign planId in volume-preview (trainer does not own plan) → 404
 *  9. foreign planId in analysis-preview (trainer does not own plan) → 404
 * 10. mismatched clientId + planId in volume-preview (plan belongs to different client) → 404
 * 11. mismatched clientId + planId in analysis-preview → 404
 * 12. authenticated trainer can call volume-preview for own client → 200
 * 13. authenticated trainer can call analysis-preview for own client → 200
 * 14. trainerId in body is ignored — ownership comes from session
 * 15. generator safety regression — one existing beginner test passes
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

// ─── Mock volume calculator + plan analyser ───────────────────────────────────

vi.mock("../services/volumeCalculator", () => ({
  calculatePlanVolume: async () => ({ targets: [], exercisesWithoutAssignments: [], weeklySetsByTarget: {} }),
  calculateVolumePreview: async () => ({ targets: [], warnings: [] }),
  mapToGuidelineLevel: () => "Brak aktywności fizycznej",
  isValidExperienceLevel: () => true,
}));

vi.mock("../services/planAnalyzer", () => ({
  analyseDraftPreview: async () => ({}),
}));

// ─── Shared in-memory stores ──────────────────────────────────────────────────

const TRAINER_A = { id: 1, clerkUserId: "user_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

type StoredTrainer  = typeof TRAINER_A;
type StoredClient   = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredPlan     = { id: number; clientId: number; surveyId: number; guidelineVersionId: number; experienceLevelUsed: string; title: string; status: string; goal: string | null; description: string | null; startDate: string | null; endDate: string | null; trainerNotes: string | null; splitType: string | null; blockDurationWeeks: number | null; cardioRecommendation: string | null; activatedAt: Date | null; createdAt: Date; updatedAt: Date };
type StoredDay      = { id: number; planId: number; dayOrder: number; dayName: string | null; subtitle: string | null; description: string | null; estimatedDurationMinutes: number | null; trainerNotes: string | null };
type StoredSurvey   = { id: number; clientId: number; experienceLevel: string | null; [key: string]: unknown };
type StoredVersion  = { id: number; isActive: boolean };

let trainersStore:  StoredTrainer[]  = [];
let clientsStore:   StoredClient[]   = [];
let plansStore:     StoredPlan[]     = [];
let daysStore:      StoredDay[]      = [];
let surveysStore:   StoredSurvey[]   = [];
let versionsStore:  StoredVersion[]  = [];

let nextId = 6000;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable             = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable              = { id: "id", trainerId: "trainerId", firstName: "firstName", lastName: "lastName" };
  const workoutPlansTable         = {
    id: "id", clientId: "clientId", surveyId: "surveyId", status: "status", title: "title",
    guidelineVersionId: "guidelineVersionId", experienceLevelUsed: "experienceLevelUsed",
    goal: "goal", description: "description", startDate: "startDate", endDate: "endDate",
    trainerNotes: "trainerNotes", splitType: "splitType", blockDurationWeeks: "blockDurationWeeks",
    cardioRecommendation: "cardioRecommendation", activatedAt: "activatedAt",
    createdAt: "createdAt", updatedAt: "updatedAt",
  };
  const workoutPlanDaysTable      = { id: "id", planId: "planId", dayOrder: "dayOrder", dayName: "dayName", subtitle: "subtitle", description: "description", estimatedDurationMinutes: "estimatedDurationMinutes", trainerNotes: "trainerNotes" };
  const workoutPlanExercisesTable = { id: "id", dayId: "dayId", exerciseId: "exerciseId", orderInDay: "orderInDay", workingSets: "workingSets", warmUpSets: "warmUpSets", repType: "repType", repsExact: "repsExact", repRangeMin: "repRangeMin", repRangeMax: "repRangeMax", repTimeSeconds: "repTimeSeconds", repDistanceMeters: "repDistanceMeters", repOpenInstruction: "repOpenInstruction", loadType: "loadType", loadValue: "loadValue", loadInstruction: "loadInstruction", rir: "rir", rpe: "rpe", rirOrRpe: "rirOrRpe", tempo: "tempo", restSeconds: "restSeconds", notes: "notes", clientInstructions: "clientInstructions" };
  const exercisesTable            = { id: "id", name: "name", exerciseType: "exerciseType", exercisePriority: "exercisePriority", suitableForNoActivity: "suitableForNoActivity", mainMuscleGroup: "mainMuscleGroup", isActive: "isActive" };
  const surveysTable              = { id: "id", clientId: "clientId", cardioPreference: "cardioPreference", cardioFrequency: "cardioFrequency", preferredCardioType: "preferredCardioType", activityLevel: "activityLevel", trainingGoal: "trainingGoal", healthLimitations: "healthLimitations", injuryStatus: "injuryStatus", experienceLevel: "experienceLevel" };
  const volumeGuidelineVersionsTable = { id: "id", isActive: "isActive" };
  const volumeGuidelinesTable     = { id: "id" };
  const volumeTargetsTable        = { id: "id" };
  const volumeTargetMembersTable  = { id: "id" };

  type Cond = { field?: string; val?: unknown; op?: string } | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")      return item[cond.field] === cond.val;
    if (cond.op === "isNull")  return item[cond.field] == null;
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  // innerJoin: check right[cond.field] === left[cond.val]
  function matchesJoinCondition(left: Record<string, unknown>, right: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesJoinCondition(left, right, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq") return right[cond.field as string] === left[cond.val as string];
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)             return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)              return clientsStore  as unknown as Record<string, unknown>[];
    if (table === workoutPlansTable)         return plansStore    as unknown as Record<string, unknown>[];
    if (table === workoutPlanDaysTable)      return daysStore     as unknown as Record<string, unknown>[];
    if (table === surveysTable)              return surveysStore  as unknown as Record<string, unknown>[];
    if (table === volumeGuidelineVersionsTable) return versionsStore as unknown as Record<string, unknown>[];
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
              // left (source table) fields win on collision — preserves plan.id over client.id
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
      values: (data: Record<string, unknown>) => {
        const id = nextId++;
        const now = new Date();
        return {
          returning: async () => {
            if (table === workoutPlansTable) {
              const item = { id, createdAt: now, updatedAt: now, goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, ...data } as StoredPlan;
              plansStore.push(item);
              return [item];
            }
            if (table === workoutPlanDaysTable) {
              const item = { id, subtitle: null, description: null, estimatedDurationMinutes: null, trainerNotes: null, ...data } as StoredDay;
              daysStore.push(item);
              return [item];
            }
            return [];
          },
          onConflictDoNothing: () => Promise.resolve(),
        };
      },
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
        insert: (table: unknown) => ({
          values: (data: Record<string, unknown>) => {
            const id = nextId++;
            const now = new Date();
            return {
              returning: async () => {
                if (table === workoutPlansTable) {
                  const item = { id, createdAt: now, updatedAt: now, goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, ...data } as StoredPlan;
                  plansStore.push(item);
                  return [item];
                }
                if (table === workoutPlanDaysTable) {
                  const item = { id, subtitle: null, description: null, estimatedDurationMinutes: null, trainerNotes: null, ...data } as StoredDay;
                  daysStore.push(item);
                  return [item];
                }
                // workoutPlanExercisesTable insert has no .returning() call — handled below.
                return [];
              },
              // exercises insert uses plain await without .returning()
              then: (resolve: (v: unknown) => unknown) => resolve(undefined),
              onConflictDoNothing: () => Promise.resolve(),
            };
          },
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

    // Table exports.
    trainersTable,
    clientsTable,
    workoutPlansTable,
    workoutPlanDaysTable,
    workoutPlanExercisesTable,
    exercisesTable,
    surveysTable,
    volumeGuidelineVersionsTable,
    volumeGuidelinesTable,
    volumeTargetsTable,
    volumeTargetMembersTable,
    insertClientSchema: {},
  };

  return { db, trainersTable, clientsTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, exercisesTable, surveysTable, volumeGuidelineVersionsTable, volumeGuidelinesTable, volumeTargetsTable, volumeTargetMembersTable, insertClientSchema: {} };
});

// ─── DB operators mock ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:      (field: string, val: unknown) => ({ field, val, op: "eq" }),
  and:     (...args: unknown[])          => args.flat(),
  inArray: (field: string, val: unknown) => ({ field, val, op: "inArray" }),
  isNull:  (f: string)                   => ({ field: f, op: "isNull" }),
  max:     (field: string)               => field,
  desc:    (field: string)               => ({ field, dir: "desc" }),
  asc:     (field: string)               => ({ field, dir: "asc" }),
  sql:     (_tpl: unknown)               => ({}),
}));

// ─── App ──────────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: plansRouter } = await import("../routes/plans");
  app = express();
  app.use(express.json());
  app.use(plansRouter);
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

// ─── Store reset ──────────────────────────────────────────────────────────────

beforeEach(() => {
  nextId = 6000;
  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];
  clientsStore = [
    { id: 10, trainerId: 1, firstName: "Client", lastName: "A", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: 2, firstName: "Client", lastName: "B", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];
  plansStore = [
    { id: 100, clientId: 10, surveyId: 1, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan A", status: "draft", goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 200, clientId: 20, surveyId: 2, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan B", status: "draft", goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  daysStore = [];
  surveysStore = [
    { id: 1, clientId: 10, experienceLevel: "Początkujący" },
    { id: 2, clientId: 20, experienceLevel: "Początkujący" },
  ];
  versionsStore = [
    { id: 1, isActive: true },
  ];
  setAuth(null);
});

// ─── Shared request bodies ────────────────────────────────────────────────────

const minimalDraftBody = {
  title: "Test plan",
  surveyId: 1,
  days: [],
};

const volumePreviewBodyA = {
  clientId: 10,
  days: [],
};

const analysisPreviewBodyA = {
  clientId: 10,
  days: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Plan preview + draft route authorization (Task #81B-2B-2)", () => {

  // ── 1. unauthenticated draft → 401 ──────────────────────────────────────────

  it("(1) unauthenticated POST /clients/:clientId/plans/draft → 401", async () => {
    setAuth(null);
    const res = await request(app)
      .post("/clients/10/plans/draft")
      .send(minimalDraftBody);
    expect(res.status).toBe(401);
  });

  // ── 2. Trainer A cannot create a draft for Trainer B's client → 404 ─────────

  it("(2) Trainer A creates draft for Trainer B's client → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/20/plans/draft")
      .send({ ...minimalDraftBody, surveyId: 2 });
    expect(res.status).toBe(404);
    // No plan must have been written.
    expect(plansStore.length).toBe(2); // only the two seed plans
  });

  // ── 3. owner can create a draft normally → 201 ───────────────────────────────

  it("(3) Trainer A creates draft for own client → 201", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/clients/10/plans/draft")
      .send(minimalDraftBody);
    expect(res.status).toBe(201);
    // A new plan must have been persisted.
    expect(plansStore.length).toBe(3);
    expect(plansStore[2].clientId).toBe(10);
  });

  // ── 4. unauthenticated volume preview → 401 ──────────────────────────────────

  it("(4) unauthenticated POST /plans/volume-preview → 401", async () => {
    setAuth(null);
    const res = await request(app)
      .post("/plans/volume-preview")
      .send(volumePreviewBodyA);
    expect(res.status).toBe(401);
  });

  // ── 5. unauthenticated analysis preview → 401 ────────────────────────────────

  it("(5) unauthenticated POST /plans/analysis-preview → 401", async () => {
    setAuth(null);
    const res = await request(app)
      .post("/plans/analysis-preview")
      .send(analysisPreviewBodyA);
    expect(res.status).toBe(401);
  });

  // ── 6. foreign clientId in volume-preview → 404 ──────────────────────────────

  it("(6) Trainer A calls volume-preview with Trainer B's clientId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send({ clientId: 20, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 7. foreign clientId in analysis-preview → 404 ────────────────────────────

  it("(7) Trainer A calls analysis-preview with Trainer B's clientId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/analysis-preview")
      .send({ clientId: 20, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 8. foreign planId in volume-preview → 404 ────────────────────────────────
  // Plan 200 belongs to client 20 which belongs to Trainer B.

  it("(8) Trainer A calls volume-preview with Trainer B's planId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send({ clientId: 20, planId: 200, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 9. foreign planId in analysis-preview → 404 ──────────────────────────────

  it("(9) Trainer A calls analysis-preview with Trainer B's planId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/analysis-preview")
      .send({ clientId: 20, planId: 200, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 10. mismatched clientId + planId in volume-preview → 404 ─────────────────
  // Plan 100 belongs to client 10 (Trainer A) but caller sends clientId=10, planId=200
  // (plan 200 belongs to client 20 / Trainer B): loadPlanAndVerifyOwner returns null → 404.

  it("(10) volume-preview: own clientId but other trainer's planId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send({ clientId: 10, planId: 200, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 11. mismatched clientId + planId in analysis-preview → 404 ───────────────

  it("(11) analysis-preview: own clientId but other trainer's planId → 404", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/analysis-preview")
      .send({ clientId: 10, planId: 200, days: [] });
    expect(res.status).toBe(404);
  });

  // ── 12. volume-preview for own client → 200 ──────────────────────────────────

  it("(12) Trainer A calls volume-preview for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send(volumePreviewBodyA);
    expect(res.status).toBe(200);
  });

  // ── 13. analysis-preview for own client → 200 ────────────────────────────────

  it("(13) Trainer A calls analysis-preview for own client → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/analysis-preview")
      .send(analysisPreviewBodyA);
    expect(res.status).toBe(200);
  });

  // ── 14. trainerId in body is ignored ─────────────────────────────────────────
  // Trainer A sends clientId=20 (Trainer B's client) with a body trainerId=1 (their own id).
  // The route must ignore body.trainerId — ownership comes from session only → 404.

  it("(14) trainerId in body is ignored — ownership from session only", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send({ clientId: 20, days: [], trainerId: 1 });
    expect(res.status).toBe(404);
  });

  // ── 15. volume-preview with own planId and matching clientId → 200 ───────────
  // Also covers the "planId supplied + matching clientId" happy path (mismatched
  // clientId/planId would → 404; tested in 10 and 11 above).

  it("(15) volume-preview with own planId + matching clientId → 200", async () => {
    setAuth("user_A");
    const res = await request(app)
      .post("/plans/volume-preview")
      .send({ clientId: 10, planId: 100, days: [] });
    expect(res.status).toBe(200);
  });
});
