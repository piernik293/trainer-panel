/** Ćwiczenia izometryczne na czas (C1): wyzwalacz w bazie, ekran „Dziś”, zapis czasu serii. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, exercisesTable, setLogsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { seedWarmupCatalogue } from "../seeds/warmupCatalogueSeed";

const TR = "izo_test_trainer", CL = "izo_test_client", EMAIL = "izo-test@example.invalid";
const SLUGS = ["izo-test-plank", "izo-test-lsit", "izo-test-pompki"];
const LEVELS: Array<[string, number]> = [["Brak aktywności fizycznej", 15], ["Początkujący", 20], ["Średniozaawansowany", 30], ["Zaawansowany", 45]];
let clientId: number, plank: number, lsit: number, pushups: number, dayId: number;
const as = (u: string | null) => { authUser = u; };

async function planDay(level: string, status: "draft" | "active" = "draft") {
  const [survey] = await db.insert(surveysTable).values({ clientId, experienceLevel: level }).returning();
  const [plan] = await db.insert(workoutPlansTable).values({ clientId, surveyId: survey!.id, guidelineVersionId: 1, experienceLevelUsed: level, title: `Izo ${level}`, status, activatedAt: status === "active" ? new Date() : null }).returning();
  const [day] = await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: 1, dayName: "Dzień", estimatedDurationMinutes: 45 }).returning();
  return day!.id;
}
const addRange = async (day: number, exerciseId: number, order = 1) =>
  (await db.insert(workoutPlanExercisesTable).values({ dayId: day, exerciseId, orderInDay: order, workingSets: 3, repType: "range", repRangeMin: 12, repRangeMax: 15, rir: 2 }).returning())[0]!;

beforeAll(async () => {
  await seedWarmupCatalogue();
  const t = (await provisionTrainer(TR))!;
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  await db.delete(exercisesTable).where(inArray(exercisesTable.slug, SLUGS));
  clientId = (await db.insert(clientsTable).values({ firstName: "Iza", lastName: "Czas", email: EMAIL, trainerId: t.id, clerkUserId: CL }).returning())[0]!.id;
  const mk = async (slug: string, name: string, extra: object) => (await db.insert(exercisesTable).values({ name, slug, mainMuscleGroup: "Brzuch", equipment: ["Masa własnego ciała"], exerciseType: "Izolowane", ...extra }).returning())[0]!.id;
  plank = await mk(SLUGS[0]!, "Test plank", { isTimed: true });
  lsit = await mk(SLUGS[1]!, "Test L-sit", { isTimed: true, defaultDurationSeconds: 10 });
  pushups = await mk(SLUGS[2]!, "Test pompki", { isTimed: false });
  dayId = await planDay("Początkujący", "active");
});
afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  await db.delete(exercisesTable).where(inArray(exercisesTable.slug, SLUGS));
});

describe("wyzwalacz: ćwiczenie izometryczne w planie zawsze ma czas, nie powtórzenia", () => {
  it("czas zależy od poziomu planu (15 / 20 / 30 / 45 s)", async () => {
    for (const [level, secs] of LEVELS) {
      const row = await addRange(await planDay(level), plank);
      expect(row, level).toMatchObject({ repType: "time", repTimeSeconds: secs, repsExact: null, repRangeMin: null, repRangeMax: null });
    }
  });
  it("ćwiczenie z krótkim domyślnym czasem (L-sit) nie dostaje więcej niż swój czas", async () => {
    const row = await addRange(await planDay("Zaawansowany"), lsit);
    expect(row).toMatchObject({ repType: "time", repTimeSeconds: 10 });
  });
  it("zwykłe ćwiczenie zostaje z powtórzeniami; czas wpisany przez trenera zostaje", async () => {
    const day = await planDay("Początkujący");
    expect(await addRange(day, pushups)).toMatchObject({ repType: "range", repRangeMin: 12, repTimeSeconds: null });
    const kept = (await db.insert(workoutPlanExercisesTable).values({ dayId: day, exerciseId: plank, orderInDay: 2, workingSets: 2, repType: "time", repTimeSeconds: 40 }).returning())[0]!;
    expect(kept.repTimeSeconds).toBe(40);
  });
  it("zmiana (UPDATE) na powtórzenia też wraca do czasu", async () => {
    const row = await addRange(await planDay("Średniozaawansowany"), plank);
    const [upd] = await db.update(workoutPlanExercisesTable).set({ repType: "exact", repsExact: 20, repTimeSeconds: null }).where(eq(workoutPlanExercisesTable.id, row.id)).returning();
    expect(upd).toMatchObject({ repType: "time", repTimeSeconds: 30, repsExact: null });
  });
  it("w bazie nie ma żadnego ćwiczenia izometrycznego z powtórzeniami", async () => {
    const r = await db.execute(sql`select count(*)::int as n from workout_plan_exercises pe join exercises e on e.id = pe.exercise_id where e.is_timed and (pe.rep_type is distinct from 'time' or pe.rep_time_seconds is null or pe.reps_exact is not null or pe.rep_range_min is not null)`);
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("portal: ekran „Dziś” i zapis czasu serii", () => {
  it("ćwiczenie na czas ma timed, sekundy i tekst „20 s”; zapis czasu bez powtórzeń; poprzedni wynik wraca z czasem", async () => {
    const pe = await addRange(dayId, plank);
    as(CL);
    const t = await request(app).get("/api/client-portal/training/today");
    expect(t.status).toBe(200);
    const ex = t.body.today.exercises.find((e: { planExerciseId: number }) => e.planExerciseId === pe.id);
    expect(ex).toMatchObject({ timed: true, seconds: 20, reps: "20 s" });
    const s = await request(app).post("/api/client-portal/training/sessions").send({ clientUuid: randomUUID(), planDayId: dayId });
    expect(s.status).toBe(201);
    const sid = s.body.id ?? s.body.sessionId ?? s.body.session?.id;
    const put = await request(app).put(`/api/client-portal/training/sessions/${sid}/sets`).send({ clientUuid: randomUUID(), planExerciseId: pe.id, setNumber: 1, durationSeconds: 15, rir: null });
    expect(put.status).toBe(200);
    const [log] = await db.select().from(setLogsTable).where(eq(setLogsTable.planExerciseId, pe.id));
    expect(log).toMatchObject({ durationSeconds: 15, reps: null });
    expect((await request(app).put(`/api/client-portal/training/sessions/${sid}/sets`).send({ clientUuid: randomUUID(), planExerciseId: pe.id, setNumber: 2, durationSeconds: 9999 })).status).toBe(400);
    await request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status: "completed" });
    const again = await request(app).get("/api/client-portal/training/today");
    const ex2 = again.body.today?.exercises?.find((e: { planExerciseId: number }) => e.planExerciseId === pe.id) ?? again.body.next?.exercises?.find((e: { planExerciseId: number }) => e.planExerciseId === pe.id);
    if (ex2) expect(ex2.previous[0]).toMatchObject({ durationSeconds: 15, reps: null });
  });
});
