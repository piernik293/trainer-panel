/**
 * Zamiana miejsca w planie na odmianę (blok 3): tylko w obrębie rodziny ćwiczenia, zapis w historii planu,
 * dawkowanie bez zmian, cudzy plan 404. Baza testowa.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, exercisesTable, planChangeLogTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const TA = "variant_swap_trainer_a", TB = "variant_swap_trainer_b";
const EMAIL = "variant-swap-a1@example.invalid";
const as = (u: string | null) => { authUser = u; };
let planId: number, slotId: number, mainId: number, v1: number, v2: number, hiddenV: number, stranger: number;

beforeAll(async () => {
  const tA = (await provisionTrainer(TA))!; await provisionTrainer(TB);
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  await db.delete(exercisesTable).where(like(exercisesTable.slug, "variant-swap-%"));
  const [c] = await db.insert(clientsTable).values({ firstName: "Ola", lastName: "Odmiana", email: EMAIL, trainerId: tA.id }).returning();
  const [survey] = await db.insert(surveysTable).values({ clientId: c!.id, experienceLevel: "Średniozaawansowany" }).returning();
  const [plan] = await db.insert(workoutPlansTable).values({ clientId: c!.id, surveyId: survey!.id, guidelineVersionId: 1, experienceLevelUsed: "Średniozaawansowany", title: "Plan odmian", status: "draft" }).returning();
  planId = plan!.id;
  const [day] = await db.insert(workoutPlanDaysTable).values({ planId, dayOrder: 1, dayName: "Dzień A" }).returning();
  const base = { mainMuscleGroup: "Plecy", equipment: ["Hantle"], exerciseType: "Złożone", executionInstructions: "Opis." };
  const [m] = await db.insert(exercisesTable).values({ ...base, name: "Swap główne", slug: "variant-swap-main" }).returning();
  mainId = m!.id;
  const mk = async (slug: string, extra: object) => (await db.insert(exercisesTable).values({ ...base, name: slug, slug, ...extra }).returning())[0]!.id;
  v1 = await mk("variant-swap-v1", { parentExerciseId: mainId });
  v2 = await mk("variant-swap-v2", { parentExerciseId: mainId });
  hiddenV = await mk("variant-swap-hidden", { parentExerciseId: mainId, hidden: true });
  stranger = await mk("variant-swap-stranger", {});
  const [pe] = await db.insert(workoutPlanExercisesTable).values({ dayId: day!.id, exerciseId: mainId, orderInDay: 1, workingSets: 4, repType: "range", repRangeMin: 8, repRangeMax: 10, rir: 2 }).returning();
  slotId = pe!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  await db.delete(exercisesTable).where(like(exercisesTable.slug, "variant-swap-%"));
});

const swap = (exerciseId: number) => request(app).post(`/api/plans/${planId}/exercises/${slotId}/variant-replacement`).send({ exerciseId });
const slot = async () => (await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.id, slotId)))[0]!;

describe("variant-replacement", () => {
  it("cudzy plan → 404, bez sesji → 401", async () => {
    as(null); expect((await swap(v1)).status).toBe(401);
    as(TB); expect((await swap(v1)).status).toBe(404);
    expect((await slot()).exerciseId).toBe(mainId);
  });
  it("odmiana, rodzeństwo i powrót do głównego działają; dawkowanie bez zmian; wpis w historii", async () => {
    as(TA);
    expect((await swap(v1)).status).toBe(200);
    let s = await slot(); expect(s.exerciseId).toBe(v1); expect(s.workingSets).toBe(4); expect(s.repRangeMin).toBe(8);
    expect((await swap(v2)).status).toBe(200);            // rodzeństwo
    expect((await slot()).exerciseId).toBe(v2);
    expect((await swap(mainId)).status).toBe(200);        // powrót do głównego
    s = await slot(); expect(s.exerciseId).toBe(mainId);
    const log = await db.select().from(planChangeLogTable).where(eq(planChangeLogTable.planId, planId));
    expect(log.filter((l) => l.kind === "zamiana_odmiana")).toHaveLength(3);
    const h = await request(app).get(`/api/plans/${planId}/history`);
    expect(h.body.entries[0]).toMatchObject({ toExerciseName: "Swap główne", details: "odmiana ćwiczenia" });
  });
  it("obce ćwiczenie 409, ukryta odmiana 404, to samo ćwiczenie 409, zły body 400", async () => {
    as(TA);
    expect((await swap(stranger)).status).toBe(409);
    expect((await swap(hiddenV)).status).toBe(404);
    expect((await swap(mainId)).status).toBe(409);
    expect((await request(app).post(`/api/plans/${planId}/exercises/${slotId}/variant-replacement`).send({})).status).toBe(400);
    expect((await slot()).exerciseId).toBe(mainId);
  });
});
