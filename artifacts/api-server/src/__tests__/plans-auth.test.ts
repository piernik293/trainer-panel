/**
 * Saved workout-plan ownership — Vitest tests (Task #81B-2A)
 *
 * 10 test cases covering:
 *  - unauthenticated requests → 401
 *  - Trainer A cannot access Trainer B's plans/days/exercises → 404
 *  - day cannot be modified through a mismatched plan → 404
 *  - stored exercise cannot be modified through a mismatched day → 404
 *  - valid owner operations succeed
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
  calculatePlanVolume: async () => ({
    targets: [],
    exercisesWithoutAssignments: [],
    weeklySetsByTarget: {},
  }),
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

type StoredTrainer = typeof TRAINER_A;
type StoredClient  = { id: number; trainerId: number; firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null; status: string; createdAt: Date; updatedAt: Date };
type StoredPlan    = { id: number; clientId: number; surveyId: number; guidelineVersionId: number; experienceLevelUsed: string; title: string; status: string; goal: string | null; description: string | null; startDate: string | null; endDate: string | null; trainerNotes: string | null; splitType: string | null; blockDurationWeeks: number | null; cardioRecommendation: string | null; activatedAt: Date | null; createdAt: Date; updatedAt: Date };
type StoredDay     = { id: number; planId: number; dayOrder: number; dayName: string | null; subtitle: string | null; description: string | null; estimatedDurationMinutes: number | null; trainerNotes: string | null };
type StoredPlanEx  = { id: number; dayId: number; exerciseId: number; orderInDay: number; workingSets: number; warmUpSets: number; repType: string | null; repsExact: number | null; repRangeMin: number | null; repRangeMax: number | null; repTimeSeconds: number | null; repDistanceMeters: number | null; repOpenInstruction: string | null; loadType: string | null; loadValue: string | null; loadInstruction: string | null; rir: number | null; rpe: string | null; rirOrRpe: string | null; tempo: string | null; restSeconds: number | null; notes: string | null; clientInstructions: string | null };
type StoredSurvey  = { id: number; clientId: number; [key: string]: unknown };

let trainersStore: StoredTrainer[]  = [];
let clientsStore:  StoredClient[]   = [];
let plansStore:    StoredPlan[]     = [];
let daysStore:     StoredDay[]      = [];
let planExStore:   StoredPlanEx[]   = [];
let surveysStore:  StoredSurvey[]   = [];

let nextId = 5000;

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable             = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable              = { id: "id", trainerId: "trainerId", firstName: "firstName", lastName: "lastName" };
  const workoutPlansTable         = { id: "id", clientId: "clientId", surveyId: "surveyId", status: "status", title: "title", guidelineVersionId: "guidelineVersionId", experienceLevelUsed: "experienceLevelUsed", goal: "goal", description: "description", startDate: "startDate", endDate: "endDate", trainerNotes: "trainerNotes", splitType: "splitType", blockDurationWeeks: "blockDurationWeeks", cardioRecommendation: "cardioRecommendation", activatedAt: "activatedAt", createdAt: "createdAt", updatedAt: "updatedAt" };
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

  // For innerJoin: check right[cond.field] === left[cond.val] (field reference).
  function matchesJoinCondition(left: Record<string, unknown>, right: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesJoinCondition(left, right, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq") return right[cond.field as string] === left[cond.val as string];
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)              return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)               return clientsStore  as unknown as Record<string, unknown>[];
    if (table === workoutPlansTable)          return plansStore    as unknown as Record<string, unknown>[];
    if (table === workoutPlanDaysTable)       return daysStore     as unknown as Record<string, unknown>[];
    if (table === workoutPlanExercisesTable)  return planExStore   as unknown as Record<string, unknown>[];
    if (table === surveysTable)               return surveysStore  as unknown as Record<string, unknown>[];
    // Empty returns for volume tables — calculatePlanVolume is mocked.
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
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const id = nextId++;
          const now = new Date();
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
          if (table === workoutPlanExercisesTable) {
            const item = { id, warmUpSets: 0, repType: null, repsExact: null, repRangeMin: null, repRangeMax: null, repTimeSeconds: null, repDistanceMeters: null, repOpenInstruction: null, loadType: null, loadValue: null, loadInstruction: null, rir: null, rpe: null, rirOrRpe: null, tempo: null, restSeconds: null, notes: null, clientInstructions: null, ...data } as StoredPlanEx;
            planExStore.push(item);
            return [item];
          }
          return [];
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
          return {
            returning: async () => (idx !== -1 ? [store[idx]] : []),
          };
        },
      }),
    }),

    delete: (table: unknown) => ({
      where: (cond: Cond) => {
        const store = getStore(table);
        const idx = store.findIndex((i) => matchesCondition(i, cond));
        const removed = idx !== -1 ? store.splice(idx, 1) : [];
        return {
          returning: async () => removed,
        };
      },
    }),

    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (data: Record<string, unknown>) => ({
            onConflictDoNothing: () => Promise.resolve(),
            returning: async () => {
              if (table === trainersTable) return [];
              return [];
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

    // Table exports consumed by the route file.
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

// ─── Auth helper ──────────────────────────────────────────────────────────────

function setAuth(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

// ─── Reset stores before each test ───────────────────────────────────────────

beforeEach(() => {
  nextId = 5000;
  trainersStore = [{ ...TRAINER_A }, { ...TRAINER_B }];
  clientsStore = [
    { id: 10, trainerId: 1, firstName: "Client", lastName: "A", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    // Trainer A also owns client 30 (for cross-client test)
    { id: 30, trainerId: 1, firstName: "Client", lastName: "A2", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: 2, firstName: "Client", lastName: "B", email: null, phone: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ];
  plansStore = [
    { id: 100, clientId: 10, surveyId: 1, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan A", status: "draft", goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 200, clientId: 20, surveyId: 2, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan B", status: "draft", goal: null, description: null, startDate: null, endDate: null, trainerNotes: null, splitType: null, blockDurationWeeks: null, cardioRecommendation: null, activatedAt: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  daysStore = [
    { id: 1001, planId: 100, dayOrder: 1, dayName: "Day A-1", subtitle: null, description: null, estimatedDurationMinutes: null, trainerNotes: null },
    { id: 1002, planId: 100, dayOrder: 2, dayName: "Day A-2", subtitle: null, description: null, estimatedDurationMinutes: null, trainerNotes: null },
    { id: 2001, planId: 200, dayOrder: 1, dayName: "Day B-1", subtitle: null, description: null, estimatedDurationMinutes: null, trainerNotes: null },
  ];
  planExStore = [
    { id: 9001, dayId: 1001, exerciseId: 1, orderInDay: 1, workingSets: 3, warmUpSets: 0, repType: "exact", repsExact: 10, repRangeMin: null, repRangeMax: null, repTimeSeconds: null, repDistanceMeters: null, repOpenInstruction: null, loadType: null, loadValue: null, loadInstruction: null, rir: null, rpe: null, rirOrRpe: null, tempo: null, restSeconds: null, notes: null, clientInstructions: null },
    { id: 9002, dayId: 2001, exerciseId: 1, orderInDay: 1, workingSets: 3, warmUpSets: 0, repType: "exact", repsExact: 10, repRangeMin: null, repRangeMax: null, repTimeSeconds: null, repDistanceMeters: null, repOpenInstruction: null, loadType: null, loadValue: null, loadInstruction: null, rir: null, rpe: null, rirOrRpe: null, tempo: null, restSeconds: null, notes: null, clientInstructions: null },
  ];
  surveysStore = [
    { id: 1, clientId: 10 },
    { id: 2, clientId: 20 },
  ];
  setAuth(null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Saved-plan authorization (Task #81B-2A)", () => {

  // ── 1. Unauthenticated ──────────────────────────────────────────────────────

  it("(1) unauthenticated GET /plans/:id → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/plans/100");
    expect(res.status).toBe(401);
  });

  it("(1b) unauthenticated GET /clients/:clientId/plans → 401", async () => {
    setAuth(null);
    const res = await request(app).get("/clients/10/plans");
    expect(res.status).toBe(401);
  });

  // ── 2. Owner can access their plan ─────────────────────────────────────────

  it("(2) owner reads their plan → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/plans/100");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(100);
  });

  it("(2b) owner lists plans for their client → 200", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/10/plans");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── 3. Trainer A cannot access Trainer B's plan ────────────────────────────

  it("(3) Trainer A reads Trainer B's plan → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/plans/200");
    expect(res.status).toBe(404);
  });

  // ── 4. Plan cannot be accessed through another owned client ─────────────────
  // Trainer A owns client 10 (plan 100) and client 30 (no plans).
  // Listing plans for client 30 must not expose plan 100.

  it("(4) listing plans for another owned client returns empty, not cross-client data", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/30/plans");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── 5. Day cannot be modified through another plan ─────────────────────────

  it("(5) Trainer A cannot modify Trainer B's day via own plan ID → 404", async () => {
    // Day 2001 belongs to plan 200 (Trainer B's). Routing it under plan 100 fails ownership.
    setAuth("user_A");
    const res = await request(app)
      .patch("/plans/100/days/2001")
      .send({ dayName: "Hacked" });
    // loadPlanAndVerifyOwner(100) succeeds (plan 100 belongs to Trainer A),
    // but the day-plan check (day 2001 belongs to plan 200, not 100) → 404.
    expect(res.status).toBe(404);
    // Store must be untouched
    expect(daysStore.find((d) => d.id === 2001)!.dayName).toBe("Day B-1");
  });

  it("(5b) Trainer A cannot modify Trainer B's plan even via correct day → 404", async () => {
    // Day 2001 belongs to plan 200; Trainer A uses plan 200's ID → ownership fails first.
    setAuth("user_A");
    const res = await request(app)
      .patch("/plans/200/days/2001")
      .send({ dayName: "Hacked" });
    expect(res.status).toBe(404);
    expect(daysStore.find((d) => d.id === 2001)!.dayName).toBe("Day B-1");
  });

  // ── 6. Stored exercise cannot be modified through another day ───────────────

  it("(6) Trainer A cannot update Trainer B's exercise via own plan/day → 404", async () => {
    // planEx 9002 belongs to day 2001 (plan 200, Trainer B).
    // Even if Trainer A routes it under plan 100/day 1001, ownership of plan 100 succeeds
    // but then day check (day 1001 has no exercise 9002) → 404.
    setAuth("user_A");
    const res = await request(app)
      .patch("/plans/100/days/1001/exercises/9002")
      .send({ workingSets: 99 });
    expect(res.status).toBe(404);
    expect(planExStore.find((e) => e.id === 9002)!.workingSets).toBe(3);
  });

  // ── 7. Foreign update/delete/activation → 404 ──────────────────────────────

  it("(7a) Trainer A PATCH foreign plan → 404", async () => {
    setAuth("user_A");
    const res = await request(app).patch("/plans/200").send({ title: "Hacked" });
    expect(res.status).toBe(404);
    expect(plansStore.find((p) => p.id === 200)!.title).toBe("Plan B");
  });

  it("(7b) Trainer A DELETE foreign plan → 404", async () => {
    setAuth("user_A");
    const res = await request(app).delete("/plans/200");
    expect(res.status).toBe(404);
    expect(plansStore.some((p) => p.id === 200)).toBe(true);
  });

  it("(7c) Trainer A cannot access Trainer B's client list → 404", async () => {
    setAuth("user_A");
    const res = await request(app).get("/clients/20/plans");
    expect(res.status).toBe(404);
  });

  // ── 8. Valid owner operations still work ───────────────────────────────────

  it("(8a) Trainer A PATCH own plan title → 200", async () => {
    setAuth("user_A");
    const res = await request(app).patch("/plans/100").send({ title: "Updated" });
    expect(res.status).toBe(200);
  });

  it("(8b) Trainer A DELETE own plan day → 200", async () => {
    setAuth("user_A");
    const res = await request(app).delete("/plans/100/days/1001");
    expect(res.status).toBe(200);
    expect(daysStore.some((d) => d.id === 1001)).toBe(false);
  });

  it("(8c) Trainer B deletes own plan → 204", async () => {
    setAuth("user_B");
    const res = await request(app).delete("/plans/200");
    expect(res.status).toBe(204);
    expect(plansStore.some((p) => p.id === 200)).toBe(false);
  });
});
