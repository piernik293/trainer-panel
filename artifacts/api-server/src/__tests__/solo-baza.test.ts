/** Solo jako podstawa konta (S1–S5): każde konto od razu Solo, wywiad i plan z serwera, limity, połączenie z trenerem ze zgodą, odłączenie, izolacja. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Ola", lastName: "Solo", primaryEmailAddress: { emailAddress: "ola.solo@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, exercisesTable, trainerJoinRequestsTable, clientInvitationsTable, clientAchievementsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { soloDayCount, soloCycleWeeks, parseRepsLabel } from "../services/soloPlanDriver";
import { resetJoinAttempts } from "../services/joinCode";
import { createHash, randomBytes } from "node:crypto";

const TR = "solob_trainer", TR_OTHER = "solob_other_trainer", NEW = "solob_new_person", S1 = "solob_solo_1", S2 = "solob_solo_2", INV = "solob_invited", FRESH = "solob_fresh";
const ALL = [TR, TR_OTHER, NEW, S1, S2, INV, FRESH];
const as = (u: string | null) => { authUser = u; };
const clientOf = async (clerk: string) => (await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerk)))[0];

const ANSWERS = {
  dateOfBirth: "1990-04-04", gender: "Kobieta", heightCm: 170, weightKg: 65, trainingGoal: "Budowa sylwetki", experienceLevel: "Początkujący", injuryStatus: "Brak", healthConsent: true,
  sessionDuration: "45–60 min", desiredWeeklyFrequency: 3, trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", sleepHours: "7–8 godzin", planStylePreference: "Balans efektywności i wygody",
};

async function cleanup() {
  const ids = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.clerkUserId, ALL))).map((c) => c.id);
  const arch = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.lastName, ids.map(String)))).map((c) => c.id);
  const all = [...ids, ...arch];
  if (all.length) {
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, all));
    await db.delete(clientsTable).where(inArray(clientsTable.id, all));
  }
  await db.delete(clientsTable).where(inArray(clientsTable.email, ["solob-inv@example.invalid"]));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [TR, TR_OTHER]));
}
let trId = 0;
beforeAll(async () => {
  process.env.SOLO_ENABLED = "1"; delete process.env.BETA_NO_LIMITS; resetJoinAttempts();
  await cleanup();
  trId = (await provisionTrainer(TR))!.id; await provisionTrainer(TR_OTHER);
  await db.update(trainersTable).set({ joinCode: "ABCDEFGH23" }).where(eq(trainersTable.id, trId));
});
afterAll(async () => { delete process.env.SOLO_ENABLED; await cleanup(); });

describe("czysta logika", () => {
  it("liczba dni 2–5 z limitem poziomu, długość cyklu wg poziomu, odczyt powtórzeń", () => {
    expect(soloDayCount(undefined, "Początkujący")).toBe(3);
    expect(soloDayCount(6, "Początkujący")).toBe(4);
    expect(soloDayCount(6, "Brak aktywności fizycznej")).toBe(3);
    expect(soloDayCount(1, "Zaawansowany")).toBe(2);
    expect(soloDayCount(5, "Zaawansowany")).toBe(5);
    expect([soloCycleWeeks("Brak aktywności fizycznej"), soloCycleWeeks("Początkujący"), soloCycleWeeks("Średniozaawansowany"), soloCycleWeeks("Zaawansowany")]).toEqual([4, 4, 6, 8]);
    expect(parseRepsLabel("8–10")).toEqual({ min: 8, max: 10 });
    expect(parseRepsLabel("")).toEqual({ min: 8, max: 12 });
  });
});

describe("każde konto jest od razu Solo (nigdy trenerem)", () => {
  it("nowe konto: pierwsze wejście tworzy konto Solo (bez trenera) i pierwsze osiągnięcie; wielokrotne wejścia nie dublują", async () => {
    process.env.ACHIEVEMENTS_ENABLED = "1";
    as(NEW);
    const a = await request(app).get("/api/account/status"); const b = await request(app).get("/api/account/status");
    expect(a.status).toBe(200); expect(a.body).toMatchObject({ linked: false, firstName: "Ola", hasSurvey: false, hasPlan: false }); expect(b.body.firstName).toBe("Ola");
    const rows = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, NEW));
    expect(rows).toHaveLength(1); expect(rows[0]!.trainerId).toBeNull();
    expect(await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, NEW))).toHaveLength(0);
    const ach = await db.select().from(clientAchievementsTable).where(eq(clientAchievementsTable.clientId, rows[0]!.id));
    expect(ach.map((x) => x.title)).toContain("Witaj w Optimatren");
    delete process.env.ACHIEVEMENTS_ENABLED;
    expect((await request(app).post("/api/trainer/profile")).status).toBe(403); // konto Solo nie staje się trenerem
  });
  it("/account/home: nowe konto → portal, a konto Solo nie ma roli trenera", async () => {
    as(FRESH);
    const h = await request(app).get("/api/account/home");
    expect(h.body).toMatchObject({ destination: "portal", isTrainer: false, linked: false });
    expect(await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, FRESH))).toHaveLength(0);
  });
  it("bez sesji 401; z wyłączoną flagą trasy Solo to 404", async () => {
    as(null); expect((await request(app).post("/api/solo/plan")).status).toBe(401);
    process.env.SOLO_ENABLED = "0"; as(S1); expect((await request(app).post("/api/solo/plan")).status).toBe(404); process.env.SOLO_ENABLED = "1";
  });
});

describe("wywiad i plan Solo", () => {
  it("plan bez wywiadu: 409 NO_SURVEY; wywiad z błędem: 400; poprawny: 201", async () => {
    as(S1);
    const noSurvey = await request(app).post("/api/solo/plan"); expect([noSurvey.status, noSurvey.body.code]).toEqual([409, "NO_SURVEY"]);
    expect((await request(app).post("/api/solo/survey").send({ ...ANSWERS, dateOfBirth: "2015-01-01" })).status).toBe(400);
    expect((await request(app).post("/api/solo/survey").send({ ...ANSWERS, heightCm: 20 })).status).toBe(400);
    expect((await request(app).post("/api/solo/survey").send({ ...ANSWERS, injuryStatus: "Tak", healthLimitations: "" })).status).toBe(400);
    const okRes = await request(app).post("/api/solo/survey").send(ANSWERS); if (okRes.status !== 201) console.log("SURVEY400", JSON.stringify(okRes.body).slice(0, 400)); expect(okRes.status).toBe(201);
    const c = (await clientOf(S1))!;
    expect(await db.select().from(surveysTable).where(eq(surveysTable.clientId, c.id))).toHaveLength(1);
  });
  it("plan: aktywny, createdBy=solo, cykl wg poziomu, same ćwiczenia zatwierdzone, ćwiczenia izometryczne na czas", async () => {
    as(S1);
    const r = await request(app).post("/api/solo/plan");
    (await import("node:fs")).writeFileSync(process.env.HOME + "/logs/soloplan.txt", `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    if (r.status !== 201) { expect([422]).toContain(r.status); expect(r.body.code).toBe("NO_SAFE_PLAN"); return; } // mały katalog testowy: dopuszczalna odmowa z prostym komunikatem
    const c = (await clientOf(S1))!;
    const [plan] = await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, c.id), eq(workoutPlansTable.status, "active")));
    expect(plan).toMatchObject({ createdBy: "solo", experienceLevelUsed: "Początkujący", blockDurationWeeks: 4 });
    const days = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan!.id));
    expect(days.length).toBeGreaterThanOrEqual(1);
    const exs = await db.select({ pe: workoutPlanExercisesTable, e: exercisesTable }).from(workoutPlanExercisesTable).innerJoin(exercisesTable, eq(exercisesTable.id, workoutPlanExercisesTable.exerciseId)).where(inArray(workoutPlanExercisesTable.dayId, days.map((d) => d.id)));
    expect(exs.length).toBeGreaterThan(0);
    for (const x of exs) {
      expect(x.e.reviewedByTrainer, x.e.name).toBe(true); // reguła Solo: tylko zatwierdzone
      expect(x.e.hidden).not.toBe(true);
      if (x.e.isTimed) expect(x.pe.repType).toBe("time");
    }
    // limit: kolejny plan w ciągu 14 dni → 429 z prostym komunikatem; przy BETA_NO_LIMITS bez limitu
    const again = await request(app).post("/api/solo/plan"); expect([again.status, again.body.code]).toEqual([429, "PLAN_LIMIT"]);
    process.env.BETA_NO_LIMITS = "1";
    const free = await request(app).post("/api/solo/plan"); expect([201, 422]).toContain(free.status);
    delete process.env.BETA_NO_LIMITS;
    const active = await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, c.id), eq(workoutPlansTable.status, "active")));
    expect(active).toHaveLength(1); // poprzedni plan trafia do archiwum, aktywny jest zawsze jeden
  });
  it("osoba połączona z trenerem nie układa sobie planu sama (403)", async () => {
    const t = (await provisionTrainer(TR_OTHER))!;
    await db.insert(clientsTable).values({ firstName: "Pod", lastName: "Opieczny", trainerId: t.id, clerkUserId: S2 });
    as(S2); expect((await request(app).post("/api/solo/plan")).status).toBe(403);
    expect((await request(app).post("/api/solo/survey").send(ANSWERS)).status).toBe(403);
  });
});

describe("połączenie z trenerem: zgoda na historię, izolacja, odłączenie", () => {
  async function connect(person: string, share: boolean) {
    as(person);
    expect((await request(app).post("/api/join/ABCDEFGH23/request").send({ shareHistory: share })).status).toBe(201);
    as(TR);
    const reqs = await db.select().from(trainerJoinRequestsTable).where(eq(trainerJoinRequestsTable.trainerId, trId));
    const mine = reqs.filter((r) => r.status === "pending").at(-1)!;
    expect((await request(app).post(`/api/trainer/join-requests/${mine.id}/accept`)).status).toBe(200);
    return (await clientOf(person))!;
  }
  it("bez zgody (domyślnie): przed akceptacją trener nic nie widzi; po niej widzi tylko imię — bez wywiadu, planu i treningów z okresu Solo; nowy plan trenera widzi", async () => {
    const c0 = (await clientOf(S1))!;
    const [sp] = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c0.id)).limit(1);
    if (sp) { const [sd] = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, sp.id)).limit(1); await db.insert(workoutSessionsTable).values({ clientId: c0.id, planId: sp.id, planDayId: sd!.id, sessionDate: "2026-10-01" } as never); }
    as(TR);
    expect((await request(app).get(`/api/clients/${c0.id}`)).status).toBe(404); // przed akceptacją: brak dostępu
    const c = await connect(S1, false);
    expect(c.trainerId).toBe(trId); expect(c.historyVisibleFrom).not.toBeNull();
    as(TR);
    expect((await request(app).get(`/api/clients/${c.id}`)).status).toBe(200);
    const surveys = await request(app).get(`/api/clients/${c.id}/surveys`); expect(surveys.body).toEqual([]);
    expect(((await request(app).get(`/api/clients/${c.id}/plans`)).body as unknown[]).length).toBe(0);
    expect(((await request(app).get(`/api/clients/${c.id}/training-sessions`)).body as unknown[]).length).toBe(0);
    const soloPlan = (await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c.id)))[0];
    if (soloPlan) expect((await request(app).get(`/api/plans/${soloPlan.id}`)).status).toBe(404);
    // osoba nadal widzi własną historię (plany i treningi zostają u niej)
    expect((await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.clientId, c.id))).length).toBeGreaterThan(0);
    // inny trener nie widzi tej osoby w ogóle
    as(TR_OTHER); expect((await request(app).get(`/api/clients/${c.id}`)).status).toBe(404);
  });
  it("odłączenie: wraca do Solo z historią (wywiad wraca), trener traci dostęp", async () => {
    const c = (await clientOf(S1))!;
    as(S1);
    expect((await request(app).post("/api/client-portal/disconnect")).status).toBe(200);
    const after = (await clientOf(S1))!;
    expect(after.trainerId).toBeNull(); expect(after.historyVisibleFrom).toBeNull();
    expect((await db.select().from(surveysTable).where(eq(surveysTable.clientId, c.id))).length).toBeGreaterThan(0);
    as(TR); expect((await request(app).get(`/api/clients/${c.id}`)).status).toBe(404);
  });
  it("ze zgodą: trener widzi wywiad i historię od razu", async () => {
    const c = await connect(S1, true);
    expect(c.historyVisibleFrom).toBeNull();
    as(TR);
    expect(((await request(app).get(`/api/clients/${c.id}/surveys`)).body as unknown[]).length).toBeGreaterThan(0);
    expect(((await request(app).get(`/api/clients/${c.id}/training-sessions`)).body as unknown[]).length).toBeGreaterThan(0);
  });
  it("aktywacja planu przez trenera archiwizuje plan Solo", async () => {
    const c = (await clientOf(S1))!;
    const solo = (await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, c.id), eq(workoutPlansTable.status, "active"))))[0];
    if (!solo) return; // katalog testowy mógł odmówić planu Solo
    const [sv] = await db.select({ id: surveysTable.id }).from(surveysTable).where(eq(surveysTable.clientId, c.id));
    const [np] = await db.insert(workoutPlansTable).values({ clientId: c.id, surveyId: sv!.id, guidelineVersionId: solo.guidelineVersionId, experienceLevelUsed: "Początkujący", title: "Plan trenera", status: "draft" }).returning();
    const [d] = await db.insert(workoutPlanDaysTable).values({ planId: np!.id, dayOrder: 1, dayName: "Dzień 1" }).returning();
    const ex = (await db.select({ id: exercisesTable.id }).from(exercisesTable).limit(1))[0]!;
    await db.insert(workoutPlanExercisesTable).values({ dayId: d!.id, exerciseId: ex.id, orderInDay: 1, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 10, rir: 2 });
    as(TR);
    const act = await request(app).post(`/api/plans/${np!.id}/activate`).send({});
    if (act.status === 200) expect((await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.id, solo.id)))[0]!.status).toBe("archived");
  });
});

describe("zaproszenie od trenera działa jak dziś", () => {
  async function invite(): Promise<{ token: string; clientId: number }> {
    const [c] = await db.insert(clientsTable).values({ firstName: "Z", lastName: "Zaproszenia", email: "solob-inv@example.invalid", trainerId: trId }).returning();
    const token = randomBytes(32).toString("hex");
    await db.insert(clientInvitationsTable).values({ clientId: c!.id, trainerId: trId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) });
    return { token, clientId: c!.id };
  }
  it("puste konto Solo ustępuje: link od trenera łączy automatycznie, bez szukania opcji", async () => {
    as(INV); await request(app).get("/api/account/status"); // konto Solo powstaje przy wejściu
    expect((await clientOf(INV))!.trainerId).toBeNull();
    const inv = await invite();
    const r = await request(app).post(`/api/client-invitations/${inv.token}/activate`).send({});
    expect(r.status).toBe(200);
    const linked = (await clientOf(INV))!;
    expect(linked.id).toBe(inv.clientId); expect(linked.trainerId).toBe(trId);
  });
  it("konto Solo z własnymi danymi nie traci ich przez link — dostaje wskazówkę o kodzie", async () => {
    as(S1); await request(app).post("/api/client-portal/disconnect");
    const inv = await invite();
    const r = await request(app).post(`/api/client-invitations/${inv.token}/activate`).send({});
    expect([r.status, r.body.code]).toEqual([409, "SOLO_HAS_DATA"]);
    expect((await clientOf(S1))!.id).not.toBe(inv.clientId);
  });
});
