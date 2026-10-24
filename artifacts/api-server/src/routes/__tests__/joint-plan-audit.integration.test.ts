/**
 * Existing plans vs reported joints: the plan warning ("To ćwiczenie obciąża zgłoszony staw") with a replacement from
 * the lower steps of the same ladder, one-click swap, owner isolation. Pure proposal rules are tested first.
 * Runs on the test database with a fixture ladder (pattern "TEST-audyt-stawow"), so the real catalogue does not matter.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "joint_audit_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../../app";
import {
  db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, exerciseLadderStepsTable,
  workoutPlanExercisesTable, workoutPlansTable, jointWarningDecisionsTable, planChangeLogTable,
} from "@workspace/db";
import { proposeLadderReplacement, type CandidateInfo, type ReplacementContext } from "../../services/jointPlanAudit";
import type { LadderRow } from "../../services/ladderSelection";

// ─── Pure rules ───────────────────────────────────────────────────────────────

const cand = (id: number, o: Partial<CandidateInfo> = {}): CandidateInfo => ({
  id, name: `E${id}`, isActive: true, jointStressAreas: [], suitableForNoActivity: true, learningDifficulty: 1,
  trainingLocation: [], equipment: [], requiredEquipmentAll: [], ...o,
});
const L: LadderRow[] = [
  { pattern: "P", stepOrder: 1, level: "Brak aktywności fizycznej", exerciseId: 1 },
  { pattern: "P", stepOrder: 2, level: "Początkujący", exerciseId: 2 },
  { pattern: "P", stepOrder: 3, level: "Początkujący", exerciseId: 3 },
  { pattern: "P", stepOrder: 4, level: "Średniozaawansowany", exerciseId: 4 },
  { pattern: "P", stepOrder: 5, level: "Zaawansowany", exerciseId: 5 },
];
const ctx = (o: Partial<ReplacementContext> = {}): ReplacementContext => ({
  level: "Zaawansowany", blockedJoints: new Set(["Bark"]), compatible: () => true, excludeIds: new Set(), ...o,
});

describe("proposeLadderReplacement (czysta reguła)", () => {
  const info = new Map([1, 2, 3, 4, 5].map((i) => [i, cand(i)]));
  it("najbliższy niższy szczebel, nigdy wyższy", () => {
    expect(proposeLadderReplacement(4, L, info, ctx())?.id).toBe(3);
    expect(proposeLadderReplacement(1, L, info, ctx())).toBeNull();
  });
  it("pomija szczeble obciążające zgłoszony staw, niezgodne ze sprzętem, nieaktywne i już użyte w dniu", () => {
    const i2 = new Map(info);
    i2.set(4, cand(4, { jointStressAreas: ["Bark"] }));
    i2.set(3, cand(3, { isActive: false }));
    i2.set(2, cand(2, { equipment: ["Kettlebell"] }));
    const c = ctx({ compatible: (e) => !e.equipment.includes("Kettlebell"), excludeIds: new Set([1]) });
    expect(proposeLadderReplacement(5, L, i2, c)).toBeNull();
    expect(proposeLadderReplacement(5, L, i2, ctx({ compatible: (e) => !e.equipment.includes("Kettlebell") }))?.id).toBe(1);
  });
  it("klient nieaktywny: tylko suitableForNoActivity === true i szczebel nie wyżej niż jego poziom", () => {
    const i2 = new Map(info);
    i2.set(1, cand(1, { suitableForNoActivity: false }));
    expect(proposeLadderReplacement(3, L, i2, ctx({ level: "Brak aktywności fizycznej" }))).toBeNull();
    expect(proposeLadderReplacement(3, L, info, ctx({ level: "Brak aktywności fizycznej" }))?.id).toBe(1);
  });
  it("początkujący: learningDifficulty null → odrzucone", () => {
    const i2 = new Map(info);
    i2.set(2, cand(2, { learningDifficulty: null }));
    expect(proposeLadderReplacement(3, L, i2, ctx({ level: "Początkujący" }))?.id).toBe(1);
  });
  it("ćwiczenie spoza drabinek → brak propozycji", () => {
    expect(proposeLadderReplacement(99, L, info, ctx())).toBeNull();
  });
});

// ─── API ──────────────────────────────────────────────────────────────────────

const TRAINER = "joint_audit_trainer";
const OTHER_TRAINER = "joint_audit_other_trainer";
const EMAIL = (n: number) => `joint-audit-${n}@example.invalid`;
const PATTERN = "TEST-audyt-stawow";
const IDS = { easy: 900_301, kettle: 900_302, shoulderLow: 900_303, shoulderPlan: 900_304, offLadder: 900_305 };

let trainerId = 0, otherTrainerId = 0;

async function cleanup() {
  await db.delete(clientsTable).where(inArray(clientsTable.email, [1, 2, 3].map(EMAIL)));
  await db.delete(exerciseLadderStepsTable).where(eq(exerciseLadderStepsTable.pattern, PATTERN));
  await db.delete(exercisesTable).where(inArray(exercisesTable.id, Object.values(IDS)));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [TRAINER, OTHER_TRAINER]));
}

async function planFor(n: number, owner: number, health: string | null, exerciseIds: number[]) {
  const [c] = await db.insert(clientsTable).values({ firstName: "Audyt", lastName: "Stawów", email: EMAIL(n), trainerId: owner }).returning();
  const [sv] = await db.insert(surveysTable).values({
    clientId: c.id, experienceLevel: "Średniozaawansowany", trainingLocation: "Siłownia", equipment: "Hantle, Masa własnego ciała",
    injuryStatus: health ? "Tak" : "Brak", healthLimitations: health,
    avoidedExerciseIds: [], avoidedExerciseReasons: {}, advancedMethodsToAvoid: [],
  } as never).returning();
  if (owner !== trainerId) return { clientId: c.id as number, surveyId: sv.id as number };
  const plan = await request(app).post(`/api/clients/${c.id}/plans`).send({ title: `Audyt ${n}`, surveyId: sv.id });
  expect(plan.status).toBe(201);
  const day = await request(app).post(`/api/plans/${plan.body.id}/days`).send({ dayName: "Dzień A" });
  const dayId = (day.body.days as Array<{ id: number }>)[0].id;
  for (const id of exerciseIds) {
    const r = await request(app).post(`/api/plans/${plan.body.id}/days/${dayId}/exercises`)
      .send({ exerciseId: id, workingSets: 4, repRangeMin: 6, repRangeMax: 8, rir: 2, acknowledgeJointWarning: true });
    expect(r.status).toBe(201);
  }
  const rows = await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.dayId, dayId));
  return { clientId: c.id as number, planId: plan.body.id as number, dayId, rows };
}

beforeAll(async () => {
  await cleanup();
  trainerId = (await db.insert(trainersTable).values({ clerkUserId: TRAINER }).returning())[0].id;
  otherTrainerId = (await db.insert(trainersTable).values({ clerkUserId: OTHER_TRAINER }).returning())[0].id;
  const ex = (id: number, name: string, equipment: string[], joints: string[]) => ({
    id, name, slug: `joint-audit-${id}`, mainMuscleGroup: "Barki", equipment, trainingLocation: ["Siłownia"],
    jointStressAreas: joints, suitableForNoActivity: true, learningDifficulty: 1,
  });
  await db.insert(exercisesTable).values([
    ex(IDS.easy, "Fixture audyt — szczebel 1 bez stawu", ["Masa własnego ciała"], []),
    ex(IDS.kettle, "Fixture audyt — szczebel 2 kettlebell", ["Kettlebell"], []),
    ex(IDS.shoulderLow, "Fixture audyt — szczebel 3 bark", ["Hantle"], ["Bark"]),
    ex(IDS.shoulderPlan, "Fixture audyt — szczebel 4 bark", ["Hantle"], ["Bark"]),
    ex(IDS.offLadder, "Fixture audyt — poza drabinką bark", ["Hantle"], ["Bark"]),
  ] as never);
  await db.insert(exerciseLadderStepsTable).values([
    { pattern: PATTERN, stepOrder: 1, level: "Brak aktywności fizycznej", exerciseId: IDS.easy },
    { pattern: PATTERN, stepOrder: 2, level: "Początkujący", exerciseId: IDS.kettle },
    { pattern: PATTERN, stepOrder: 3, level: "Początkujący", exerciseId: IDS.shoulderLow },
    { pattern: PATTERN, stepOrder: 4, level: "Średniozaawansowany", exerciseId: IDS.shoulderPlan },
  ]);
});

afterAll(async () => {
  const clients = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.email, [1, 2, 3].map(EMAIL)));
  if (clients.length) await db.delete(jointWarningDecisionsTable).where(inArray(jointWarningDecisionsTable.clientId, clients.map((c) => c.id)));
  await cleanup();
  await pool.end();
});

describe("ostrzeżenie w planie i zamiana jednym kliknięciem", () => {
  it("lista ostrzeżeń: ćwiczenia na zgłoszony staw z zamiennikiem z drabinki niżej (pomija staw i sprzęt)", async () => {
    const { planId, rows } = await planFor(1, trainerId, "ból barku", [IDS.shoulderPlan, IDS.offLadder]);
    const res = await request(app).get(`/api/plans/${planId}/joint-warnings`);
    expect(res.status).toBe(200);
    const byEx = new Map((res.body.warnings as Array<{ exerciseId: number; trainerDecisionAt: string | null }>).map((w) => [w.exerciseId, w]));
    expect([...byEx.keys()].sort()).toEqual([IDS.shoulderPlan, IDS.offLadder].sort());
    expect(byEx.get(IDS.shoulderPlan)).toMatchObject({
      joints: ["Bark"], message: "To ćwiczenie obciąża zgłoszony staw",
      replacement: { exerciseId: IDS.easy, name: "Fixture audyt — szczebel 1 bez stawu" },
    });
    // oba dodane przyciskiem „Dodaj mimo to” → decyzja trenera jest widoczna przy ostrzeżeniu
    expect(byEx.get(IDS.shoulderPlan)?.trainerDecisionAt).not.toBeNull();
    expect(byEx.get(IDS.offLadder)).toMatchObject({ replacement: null });
    expect(rows).toHaveLength(2);
  });

  it("zamiana: ćwiczenie w slocie zmienione na zamiennik, parametry bez zmian, ostrzeżenie znika", async () => {
    const { planId, rows } = await planFor(2, trainerId, "ból barku", [IDS.shoulderPlan, IDS.offLadder]);
    const slot = rows!.find((r) => r.exerciseId === IDS.shoulderPlan)!;
    const res = await request(app).post(`/api/plans/${planId}/exercises/${slot.id}/joint-replacement`);
    expect(res.status).toBe(200);
    const [after] = await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.id, slot.id));
    expect(after.exerciseId).toBe(IDS.easy);
    expect({ sets: after.workingSets, min: after.repRangeMin, max: after.repRangeMax, rir: after.rir, order: after.orderInDay })
      .toEqual({ sets: slot.workingSets, min: slot.repRangeMin, max: slot.repRangeMax, rir: slot.rir, order: slot.orderInDay });
    const w = await request(app).get(`/api/plans/${planId}/joint-warnings`);
    expect((w.body.warnings as Array<{ exerciseId: number }>).map((x) => x.exerciseId)).toEqual([IDS.offLadder]);
    // historia planu: kto, kiedy, co na co
    const [log] = await db.select().from(planChangeLogTable).where(eq(planChangeLogTable.planId, planId));
    expect(log).toMatchObject({
      trainerId, kind: "zamiana_staw", planExerciseId: slot.id,
      fromExerciseId: IDS.shoulderPlan, fromExerciseName: "Fixture audyt — szczebel 4 bark",
      toExerciseId: IDS.easy, toExerciseName: "Fixture audyt — szczebel 1 bez stawu", details: "zgłoszony staw: Bark",
    });
    const hist = await request(app).get(`/api/plans/${planId}/history`);
    expect(hist.status).toBe(200);
    expect(hist.body.entries).toHaveLength(1);
    expect(hist.body.entries[0]).toMatchObject({ trainer: "Trener", fromExerciseName: "Fixture audyt — szczebel 4 bark", toExerciseName: "Fixture audyt — szczebel 1 bez stawu" });
    expect(Date.parse(hist.body.entries[0].createdAt)).not.toBeNaN();
    // drugi raz ten sam slot: już bez ostrzeżenia
    const again = await request(app).post(`/api/plans/${planId}/exercises/${slot.id}/joint-replacement`);
    expect(again.status).toBe(409); expect(again.body.code).toBe("NO_WARNING");
    expect(await db.select().from(planChangeLogTable).where(eq(planChangeLogTable.planId, planId))).toHaveLength(1);
    // poza drabinką: brak zamiennika, nic nie zmienione
    const off = rows!.find((r) => r.exerciseId === IDS.offLadder)!;
    const none = await request(app).post(`/api/plans/${planId}/exercises/${off.id}/joint-replacement`);
    expect(none.status).toBe(409); expect(none.body.code).toBe("NO_REPLACEMENT");
    const [offAfter] = await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.id, off.id));
    expect(offAfter.exerciseId).toBe(IDS.offLadder);
  });

  it("klient bez zgłoszonego bólu: brak ostrzeżeń", async () => {
    const { planId } = await planFor(3, trainerId, null, [IDS.shoulderPlan]);
    const res = await request(app).get(`/api/plans/${planId}/joint-warnings`);
    expect(res.status).toBe(200); expect(res.body.warnings).toEqual([]);
  });

  it("izolacja: plan klienta innego trenera → 404 (lista i zamiana)", async () => {
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.email, EMAIL(1)));
    await db.update(clientsTable).set({ trainerId: otherTrainerId }).where(eq(clientsTable.id, c.id));
    try {
      const [plan] = await db.select({ id: workoutPlansTable.id }).from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c.id));
      const planId = plan.id;
      const anyPlan = (await db.select({ id: workoutPlanExercisesTable.id }).from(workoutPlanExercisesTable).limit(1))[0];
      expect((await request(app).get(`/api/plans/${planId}/joint-warnings`)).status).toBe(404);
      expect((await request(app).post(`/api/plans/${planId}/exercises/${anyPlan.id}/joint-replacement`)).status).toBe(404);
      expect((await request(app).get(`/api/plans/${planId}/history`)).status).toBe(404);
    } finally {
      await db.update(clientsTable).set({ trainerId }).where(eq(clientsTable.id, c.id));
    }
  });
});
