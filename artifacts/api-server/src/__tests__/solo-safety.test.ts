/**
 * Solo (blok 11) — testy bezpieczeństwa osobno: ostrzejsze zasady niż u podopiecznego trenera, przełącznik domyślnie wyłączony,
 * brak cotygodniowego check-inu, rola Solo nigdy nie staje się trenerem. Baza testowa.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, workoutPlansTable, workoutPlanDaysTable, workoutSessionsTable, painReportsTable, surveysTable, volumeGuidelineVersionsTable } from "@workspace/db";
import { SOLO_PAIN_MESSAGE, SOLO_WEEKLY_CHECKIN, isSoloClient, soloAllowsExercise, soloEnabled, soloPainExcludedIds, type SoloContext } from "../services/solo";

const ctx = (o: Partial<SoloContext> = {}): SoloContext => ({ effectiveLevel: "Początkujący", jumpExperience: null, painExcludedIds: new Set(), ...o });
const ex = (o: Record<string, unknown> = {}) => ({ id: 1, hidden: false, reviewedByTrainer: true, intensity: null, role: null, name: "Przysiad", ...o });

describe("zasady Solo (czyste)", () => {
  it("tylko ćwiczenia zweryfikowane — na KAŻDYM poziomie (także średnio- i zaawansowany)", () => {
    for (const level of ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]) {
      expect(soloAllowsExercise(ex(), ctx({ effectiveLevel: level }))).toBe(true);
      expect(soloAllowsExercise(ex({ reviewedByTrainer: false }), ctx({ effectiveLevel: level })), level).toBe(false);
      expect(soloAllowsExercise(ex({ reviewedByTrainer: null }), ctx({ effectiveLevel: level })), level).toBe(false);
      expect(soloAllowsExercise(ex({ hidden: true }), ctx({ effectiveLevel: level }))).toBe(false);
    }
  });
  it("pliometria i olimpijskie: tylko „Tak” w doświadczeniu ze skokami ORAZ poziom Ś lub Z", () => {
    const jump = ex({ intensity: "średnia", name: "Skok na skrzynię" }), snatch = ex({ id: 2, name: "Rwanie sztangi" }), clean = ex({ id: 3, name: "Zarzut sztangi" });
    for (const e of [jump, snatch, clean]) {
      expect(soloAllowsExercise(e, ctx({ effectiveLevel: "Średniozaawansowany", jumpExperience: "Tak — robię regularnie" }))).toBe(true);
      expect(soloAllowsExercise(e, ctx({ effectiveLevel: "Zaawansowany", jumpExperience: "Tak — okazjonalnie" }))).toBe(true);
      expect(soloAllowsExercise(e, ctx({ effectiveLevel: "Średniozaawansowany", jumpExperience: "Nie" }))).toBe(false);
      expect(soloAllowsExercise(e, ctx({ effectiveLevel: "Średniozaawansowany", jumpExperience: null }))).toBe(false);
      for (const lv of ["Brak aktywności fizycznej", "Początkujący"]) expect(soloAllowsExercise(e, ctx({ effectiveLevel: lv, jumpExperience: "Tak" }))).toBe(false);
    }
    expect(soloAllowsExercise(ex({ role: "lądowanie" }), ctx({ effectiveLevel: "Początkujący", jumpExperience: "Tak" }))).toBe(false);
  });
  it("ćwiczenie, na którym był ból, odpada; inne zostają", () => {
    expect(soloAllowsExercise(ex({ id: 5 }), ctx({ painExcludedIds: new Set([5]) }))).toBe(false);
    expect(soloAllowsExercise(ex({ id: 6 }), ctx({ painExcludedIds: new Set([5]) }))).toBe(true);
    expect(SOLO_PAIN_MESSAGE).toBe("Skonsultuj się ze specjalistą.");
  });
  it("brak cotygodniowego check-inu RPE; Solo = klient bez trenera", () => {
    expect(SOLO_WEEKLY_CHECKIN).toBe(false);
    expect(isSoloClient({ trainerId: null })).toBe(true); expect(isSoloClient({ trainerId: 12 })).toBe(false);
  });
  it("przełącznik: domyślnie WYŁĄCZONY; włącza go tylko SOLO_ENABLED=1", () => {
    expect(soloEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    for (const v of ["0", "true", "", "yes"]) expect(soloEnabled({ SOLO_ENABLED: v } as NodeJS.ProcessEnv)).toBe(false);
    expect(soloEnabled({ SOLO_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("API Solo", () => {
  const T = "solo_real_trainer", SOLO1 = "solo_person_1", SOLO2 = "solo_person_2";
  let trainerId = 0, clientId = 0;
  const created: number[] = [];
  beforeAll(async () => {
    await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
    trainerId = (await db.insert(trainersTable).values({ clerkUserId: T }).returning())[0]!.id;
  });
  afterEach(() => { delete process.env.SOLO_ENABLED; mockUser = null; });
  afterAll(async () => {
    await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [SOLO1, SOLO2]));
    if (clientId) await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
    await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
    void created; await pool.end();
  });

  it("wyłączone (domyślnie): status mówi false, a /solo/start i /solo/me to 404 — nic nie powstaje w bazie", async () => {
    expect((await request(app).get("/api/solo/status")).body).toEqual({ enabled: false });
    mockUser = SOLO1;
    const r = await request(app).post("/api/solo/start").send({ firstName: "Ola" });
    expect(r.status).toBe(404); expect(r.body.code).toBe("SOLO_DISABLED");
    expect((await request(app).get("/api/solo/me")).status).toBe(404);
    expect(await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, SOLO1))).toHaveLength(0);
  });
  it("włączone: osoba bez trenera dostaje konto Solo (trainer_id NULL); powtórka nic nie dubluje; wymaga logowania", async () => {
    process.env.SOLO_ENABLED = "1";
    expect((await request(app).get("/api/solo/status")).body).toEqual({ enabled: true });
    expect((await request(app).post("/api/solo/start").send({ firstName: "Ola" })).status).toBe(401);
    mockUser = SOLO1;
    const a = await request(app).post("/api/solo/start").send({ firstName: "Ola" });
    expect(a.status).toBe(201); expect(a.body.created).toBe(true);
    const b = await request(app).post("/api/solo/start").send({ firstName: "Ola" });
    expect(b.status).toBe(200); expect(b.body).toEqual({ clientId: a.body.clientId, created: false });
    const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, a.body.clientId));
    expect(row!.trainerId).toBeNull(); expect(row!.clerkUserId).toBe(SOLO1);
    expect((await request(app).get("/api/solo/me")).body).toMatchObject({ clientId: a.body.clientId, firstName: "Ola" });
    expect((await request(app).post("/api/solo/start").send({})).status).toBe(400);
  });
  it("role rozłączne: konto trenera nie zostaje Solo; klient trenera nie zostaje Solo; konto Solo nigdy nie staje się trenerem", async () => {
    process.env.SOLO_ENABLED = "1";
    mockUser = T;
    const t = await request(app).post("/api/solo/start").send({ firstName: "Trener" });
    expect(t.status).toBe(403); expect(t.body.code).toBe("TRAINER_ACCOUNT");
    clientId = (await db.insert(clientsTable).values({ firstName: "Pod", lastName: "Opieczny", trainerId, status: "active", clerkUserId: SOLO2 }).returning())[0]!.id;
    mockUser = SOLO2;
    const l = await request(app).post("/api/solo/start").send({ firstName: "X" });
    expect(l.status).toBe(403); expect(l.body.code).toBe("ALREADY_LINKED");
    expect((await request(app).get("/api/solo/me")).status).toBe(404); // klient trenera nie jest Solo
    mockUser = SOLO1;
    expect((await request(app).get("/api/trainer/profile")).status).not.toBe(200); // Solo nie dostaje panelu trenera
    expect((await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, SOLO1)))).toHaveLength(0);
  });
  it("izolacja: dane Solo (klient bez trenera) nie są widoczne dla żadnego trenera", async () => {
    process.env.SOLO_ENABLED = "1";
    mockUser = SOLO1; const a = await request(app).post("/api/solo/start").send({ firstName: "Ola" });
    mockUser = T;
    expect((await request(app).get(`/api/clients/${a.body.clientId}`)).status).toBe(404);
    const list = await request(app).get("/api/clients");
    expect(JSON.stringify(list.body)).not.toContain("Ola");
  });
  it("zgłoszenie bólu na ćwiczeniu usuwa je z kolejnych planów Solo (90 dni); starsze zgłoszenie nie", async () => {
    process.env.SOLO_ENABLED = "1";
    mockUser = SOLO1; const a = await request(app).post("/api/solo/start").send({ firstName: "Ola" });
    const cid = a.body.clientId as number;
    const [sv] = await db.insert(surveysTable).values({ clientId: cid, experienceLevel: "Początkujący" } as never).returning();
    const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
    const [plan] = await db.insert(workoutPlansTable).values({ clientId: cid, surveyId: sv!.id, guidelineVersionId: ver!.id, experienceLevelUsed: "Początkujący", title: "p" } as never).returning();
    const [day] = await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: 1, dayName: "d" } as never).returning();
    const [s] = await db.insert(workoutSessionsTable).values({ clientId: cid, planId: plan!.id, planDayId: day!.id, sessionDate: "2026-10-20" } as never).returning();
    const rep = (exerciseId: number, daysAgo: number) => db.insert(painReportsTable).values({ sessionId: s!.id, clientId: cid, exerciseId, area: "Bark", severity: 3, clientUuid: randomUUID(), createdAt: new Date(Date.now() - daysAgo * 86_400_000) });
    await rep(3, 10); await rep(4, 120);
    expect([...(await soloPainExcludedIds(cid))]).toEqual([3]);
  });
});
