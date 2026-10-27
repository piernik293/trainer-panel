/**
 * Generator — priorytety (blok 1, 26.10.2026): długość cyklu wg poziomu, twardy limit vs zalecany zakres, "generuj od nowa" różni się od poprzedniego,
 * zamiana nie powtarza ćwiczeń z planu. Baza testowa.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, like } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, exercisesTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { blockDurationRange, hasHardVolumeLimit } from "@workspace/survey-config";
import { chooseFreshRun } from "../services/planHistory";
import { pickSwap, type SwapContext, type SwapExercise } from "../services/planSwap";

describe("długość cyklu wg poziomu", () => {
  it("BA i P 8–12 (8), Ś 6–8 (6), Z 4–6 (4)", () => {
    expect(blockDurationRange("Brak aktywności fizycznej")).toEqual({ min: 8, max: 12, default: 8 });
    expect(blockDurationRange("Początkujący")).toEqual({ min: 8, max: 12, default: 8 });
    expect(blockDurationRange("Średniozaawansowany")).toEqual({ min: 6, max: 8, default: 6 });
    expect(blockDurationRange("Zaawansowany")).toEqual({ min: 4, max: 6, default: 4 });
  });
});

describe("limit objętości: twardy dla BA/P, zalecany zakres dla Ś/Z", () => {
  it("poziomy", () => {
    expect(hasHardVolumeLimit("Brak aktywności fizycznej")).toBe(true);
    expect(hasHardVolumeLimit("Początkujący")).toBe(true);
    expect(hasHardVolumeLimit(null)).toBe(true); // nieznany poziom = strona bezpieczna
    expect(hasHardVolumeLimit("Średniozaawansowany")).toBe(false);
    expect(hasHardVolumeLimit("Zaawansowany")).toBe(false);
  });
});

describe("generuj od nowa: wybór przebiegu", () => {
  const run = (ids: number[], valid = true) => ({ valid, exercises: ids.map((id) => ({ id })) });
  it("przebieg bez poprzedniego planu wygrywa, gdy nie traci ćwiczeń", () => {
    const r = chooseFreshRun(run([4, 5, 6]), run([1, 2, 3]), new Set([1, 2, 3]));
    expect(r.usedBaseline).toBe(false); expect(r.repeated).toBe(0);
  });
  it("gdy świeży przebieg ma mniej ćwiczeń, zostaje wersja z powtórkami i jest policzona", () => {
    const r = chooseFreshRun(run([4]), run([1, 2, 3]), new Set([1, 2]));
    expect(r.usedBaseline).toBe(true); expect(r.repeated).toBe(2);
  });
  it("niepoprawny świeży przebieg → wersja bazowa", () => {
    expect(chooseFreshRun(run([4, 5, 6], false), run([1, 2, 3]), new Set()).usedBaseline).toBe(true);
  });
});

describe("pickSwap: zamiennik inny niż usunięty i niż cały plan", () => {
  const ex = (id: number, over: Partial<SwapExercise> = {}): SwapExercise => ({
    id, name: `Ć${id}`, parentExerciseId: null, exerciseType: "Złożone", learningDifficulty: 2, difficultyLevel: "Początkujący",
    suitableForNoActivity: true, isActive: true, hidden: false, reviewedByTrainer: true, intensity: null, role: null,
    movementPattern: "Przysiad", mainMuscleGroup: "Nogi", createdByTrainerId: null, equipment: ["Hantle"], ...over,
  });
  const ctx = (over: Partial<SwapContext> = {}): SwapContext => ({
    level: "Początkujący", trainerId: 1, removed: ex(1), inPlan: new Set([1, 2]), avoided: new Set(), compatible: () => true, ladderAllowed: () => true, ...over,
  });
  it("pomija usunięte, ćwiczenia z planu i wykluczone", () => {
    const pick = pickSwap([ex(1), ex(2), ex(3), ex(4)], ctx({ avoided: new Set([3]) }));
    expect(pick?.id).toBe(4);
  });
  it("brak innej opcji → null", () => {
    expect(pickSwap([ex(1), ex(2)], ctx())).toBeNull();
  });
  it("nie bierze wyższego szczebla dla początkującego ani ćwiczenia bez trudności nauki", () => {
    expect(pickSwap([ex(5, { difficultyLevel: "Zaawansowany" }), ex(6, { learningDifficulty: null })], ctx())).toBeNull();
  });
  it("nie bierze ćwiczeń niebezpiecznych dla braku aktywności", () => {
    const c = ctx({ level: "Brak aktywności fizycznej" });
    expect(pickSwap([ex(7, { suitableForNoActivity: false }), ex(8, { suitableForNoActivity: null })], c)).toBeNull();
  });
  it("nie bierze ukrytych, cudzych prywatnych ani niezgodnych ze sprzętem/stawami", () => {
    expect(pickSwap([ex(9, { hidden: true }), ex(10, { createdByTrainerId: 99 })], ctx())).toBeNull();
    expect(pickSwap([ex(11)], ctx({ compatible: () => false }))).toBeNull();
  });
});

describe("zamiana w planie (trasa)", () => {
  const TA = "gen_prio_trainer_a", TB = "gen_prio_trainer_b";
  const EMAIL = "gen-prio-a1@example.invalid";
  const as = (u: string | null) => { authUser = u; };
  let planId: number, slotA: number, idA: number, idB: number, idC: number;
  beforeAll(async () => {
    const tA = (await provisionTrainer(TA))!; await provisionTrainer(TB);
    await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
    await db.delete(exercisesTable).where(like(exercisesTable.slug, "gen-prio-%"));
    const [c] = await db.insert(clientsTable).values({ firstName: "Ola", lastName: "Priorytet", email: EMAIL, trainerId: tA.id }).returning();
    const [survey] = await db.insert(surveysTable).values({ clientId: c!.id, experienceLevel: "Średniozaawansowany", trainingLocation: "Siłownia" }).returning();
    const [plan] = await db.insert(workoutPlansTable).values({ clientId: c!.id, surveyId: survey!.id, guidelineVersionId: 1, experienceLevelUsed: "Średniozaawansowany", title: "Plan priorytety", status: "draft" }).returning();
    planId = plan!.id;
    const [day] = await db.insert(workoutPlanDaysTable).values({ planId, dayOrder: 1, dayName: "Dzień A" }).returning();
    const base = { mainMuscleGroup: "Plecy", movementPattern: "Wiosłowanie", equipment: ["Hantle"], exerciseType: "Złożone", executionInstructions: "Opis.", difficultyLevel: "Średniozaawansowany", reviewedByTrainer: true };
    const mk = async (slug: string) => (await db.insert(exercisesTable).values({ ...base, name: slug, slug }).returning())[0]!.id;
    idA = await mk("gen-prio-a"); idB = await mk("gen-prio-b"); idC = await mk("gen-prio-c");
    const add = async (exerciseId: number, order: number) => (await db.insert(workoutPlanExercisesTable).values({ dayId: day!.id, exerciseId, orderInDay: order, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 10, rir: 2 }).returning())[0]!.id;
    slotA = await add(idA, 1);
    await add(idB, 2);
  });
  afterAll(async () => {
    await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
    await db.delete(exercisesTable).where(like(exercisesTable.slug, "gen-prio-%"));
  });

  it("cudzy trener dostaje 404", async () => {
    as(TB);
    expect((await request(app).post(`/api/plans/${planId}/exercises/${slotA}/swap`).send({})).status).toBe(404);
  });
  it("zamiennik jest inny niż usunięty i niż ćwiczenia w planie; reszta planu bez zmian", async () => {
    as(TA);
    const r = await request(app).post(`/api/plans/${planId}/exercises/${slotA}/swap`).send({});
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("replaced");
    const ids = (await db.select({ exerciseId: workoutPlanExercisesTable.exerciseId }).from(workoutPlanExercisesTable)
      .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId)).where(eq(workoutPlanDaysTable.planId, planId))).map((x) => x.exerciseId);
    expect(ids.sort()).toEqual([idB, idC].sort()); // A zamieniony na C (jedyny inny), B bez zmian
    const left = await db.select({ exerciseId: workoutPlanExercisesTable.exerciseId }).from(workoutPlanExercisesTable)
      .innerJoin(workoutPlanDaysTable, eq(workoutPlanDaysTable.id, workoutPlanExercisesTable.dayId)).where(eq(workoutPlanDaysTable.planId, planId));
    expect(left.map((x) => x.exerciseId)).toContain(idB);
  });
});
