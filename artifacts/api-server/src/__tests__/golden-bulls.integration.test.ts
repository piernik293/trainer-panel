/**
 * „Złote Byczki” (GOLDEN_BULLS_ENABLED): flaga wyłączona = brak zmian; kolejność numerów, limit puli, brak duplikatów (także przy równoczesnych zapisach),
 * wykluczenie kont admina/QA/testowych, Pro gratis trenera przez okres próbny, Solo przy pierwszym ukończonym treningu, panel administratora, licznik.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "gb_admin" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, exercisesTable, volumeGuidelineVersionsTable, goldenBullsTable, trainerApplicationsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { grantBull, revokeBull, bullStatus, isExcludedAccount } from "../services/goldenBulls";

const PREFIX = "gb_";
const DAY = 86_400_000;
const ALL_IDS: string[] = [];
const acct = (n: string) => { const id = `${PREFIX}${n}`; ALL_IDS.push(id); return id; };
const ADMIN = "gb_admin";
let exerciseId = 0;

async function wipe() {
  await db.delete(goldenBullsTable).where(like(goldenBullsTable.clerkUserId, `${PREFIX}%`));
  await db.delete(trainerApplicationsTable).where(like(trainerApplicationsTable.clerkUserId, `${PREFIX}%`));
  const cl = await db.select({ id: clientsTable.id }).from(clientsTable).where(like(clientsTable.clerkUserId, `${PREFIX}%`));
  if (cl.length) {
    const ids = cl.map((c) => c.id);
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids));
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, ids));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, `${PREFIX}%`));
}
beforeAll(async () => {
  Object.assign(process.env, { APP_ADMIN_CLERK_IDS: ADMIN });
  await wipe();
  await provisionTrainer(ADMIN);
  exerciseId = (await db.select({ id: exercisesTable.id }).from(exercisesTable).limit(1))[0]!.id;
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); auth.userId = ADMIN; });
afterAll(async () => { await wipe(); delete process.env.APP_ADMIN_CLERK_IDS; await pool.end(); });

const on = (extra: Record<string, string> = {}) => { vi.stubEnv("GOLDEN_BULLS_ENABLED", "1"); for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v); };
const count = async () => (await db.select().from(goldenBullsTable).where(like(goldenBullsTable.clerkUserId, `${PREFIX}%`))).length;
const mkTrainer = async (n: string) => { const id = acct(n); const t = (await provisionTrainer(id))!; return { clerkUserId: id, trainerId: t.id, email: `${id}@poczta-testowa.pl` }; };

describe("flaga wyłączona (domyślnie)", () => {
  it("licznik pokazuje enabled:false i left:0; przyznanie nic nie robi; trasy admina 404 przy przyznawaniu", async () => {
    vi.stubEnv("GOLDEN_BULLS_ENABLED", "");
    const s = (await request(app).get("/api/golden-bulls/status")).body;
    expect(s).toMatchObject({ enabled: false, trainer: { left: 0 }, solo: { left: 0 } });
    const t = await mkTrainer("off1");
    expect(await grantBull("trainer", t)).toBeNull();
    expect(await count()).toBe(0);
    auth.userId = ADMIN;
    expect((await request(app).post("/api/admin/golden-bulls/grant").send({ kind: "trainer", id: t.trainerId, reason: "test ręczny" })).status).toBe(404);
  });
});

describe("pule, numery, duplikaty", () => {
  it("numery rosną od 1, ta sama osoba nie dostaje drugiej odznaki, pula (2) kończy się; licznik maleje do zera", async () => {
    on({ GOLDEN_BULLS_TRAINER_POOL: "2" });
    const a = await mkTrainer("p1"), b = await mkTrainer("p2"), c = await mkTrainer("p3");
    const ga = await grantBull("trainer", a);
    expect(ga?.number).toBe(1);
    expect((await grantBull("trainer", a))?.id).toBe(ga!.id); // duplikat: ta sama odznaka
    expect((await grantBull("trainer", b))?.number).toBe(2);
    expect(await grantBull("trainer", c)).toBeNull(); // pula pełna
    expect(await count()).toBe(2);
    const s = (await request(app).get("/api/golden-bulls/status")).body;
    expect(s).toMatchObject({ enabled: true, trainer: { pool: 2, left: 0 } });
  });
  it("równoczesne zapisy: 6 kont naraz, pula 3 → dokładnie 3 odznaki, numery 1–3 bez dziur i powtórzeń", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "3" });
    const ts = await Promise.all(["r1", "r2", "r3", "r4", "r5", "r6"].map(mkTrainer));
    const res = await Promise.all(ts.map((t) => grantBull("trainer", t)));
    const won = res.filter(Boolean);
    expect(won).toHaveLength(3);
    expect(won.map((w) => w!.number).sort()).toEqual([1, 2, 3]);
    expect(await count()).toBe(3);
  }, 60_000);
  it("pule trenerów i Solo są osobne", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "1", GOLDEN_BULLS_SOLO_POOL: "2" });
    const t = await mkTrainer("s1");
    expect((await grantBull("trainer", t))?.number).toBe(1);
    const s1 = acct("solo1"), s2 = acct("solo2"), s3 = acct("solo3");
    expect((await grantBull("solo", { clerkUserId: s1, email: `${s1}@poczta-testowa.pl` }))?.number).toBe(1);
    expect((await grantBull("solo", { clerkUserId: s2, email: `${s2}@poczta-testowa.pl` }))?.number).toBe(2);
    expect(await grantBull("solo", { clerkUserId: s3, email: `${s3}@poczta-testowa.pl` })).toBeNull();
    const st = await bullStatus();
    expect(st.trainer.left).toBe(0); expect(st.solo.left).toBe(0);
  });
});

describe("konta, które nie zabierają miejsc", () => {
  it("administrator, konto QA (+clerk_test@), adres zastępczy, brak adresu i konto z listy wykluczeń", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "5", GOLDEN_BULLS_EXCLUDE_CLERK_IDS: "gb_excluded" });
    expect(isExcludedAccount(ADMIN, "a@poczta.pl")).toBe(true);
    expect(isExcludedAccount("gb_x", "qa123+clerk_test@example.com")).toBe(true);
    expect(isExcludedAccount("gb_x", "x@example.invalid")).toBe(true);
    expect(isExcludedAccount("gb_x", null)).toBe(true);
    expect(isExcludedAccount("gb_excluded", "ok@poczta.pl")).toBe(true);
    expect(isExcludedAccount("gb_real", "ola@poczta.pl")).toBe(false);
    const qa = acct("qa"); await provisionTrainer(qa);
    expect(await grantBull("trainer", { clerkUserId: ADMIN, email: "szef@poczta.pl" })).toBeNull();
    expect(await grantBull("trainer", { clerkUserId: qa, email: "qa1+clerk_test@example.com" })).toBeNull();
    expect(await count()).toBe(0);
    const real = await mkTrainer("real");
    expect((await grantBull("trainer", real))?.number).toBe(1); // wykluczone konta nie zajęły numeru ani miejsca
  });
});

describe("Pro gratis trenera i odebranie", () => {
  it("trener dostaje okres Pro na 6 miesięcy (jak okres próbny); dłuższego okresu nie skracamy; odebranie kończy Pro i zwalnia miejsce", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "1", GOLDEN_BULLS_TRAINER_MONTHS: "6" });
    const now = new Date();
    const t = await mkTrainer("pro1");
    await db.update(trainersTable).set({ trialEndsAt: new Date(now.getTime() + 2 * DAY) }).where(eq(trainersTable.id, t.trainerId));
    const b = (await grantBull("trainer", t, { now }))!;
    const [tr] = await db.select({ e: trainersTable.trialEndsAt }).from(trainersTable).where(eq(trainersTable.id, t.trainerId));
    const days = (tr!.e!.getTime() - now.getTime()) / DAY;
    expect(days).toBeGreaterThan(175); expect(days).toBeLessThan(190);
    expect(b.perksUntil!.getTime()).toBe(tr!.e!.getTime());
    // druga pula: miejsce zajęte, dopóki nie odbierzemy
    const t2 = await mkTrainer("pro2");
    expect(await grantBull("trainer", t2)).toBeNull();
    expect(await revokeBull(b.id, "konto testowe", ADMIN)).toBeTruthy();
    const [after] = await db.select({ e: trainersTable.trialEndsAt }).from(trainersTable).where(eq(trainersTable.id, t.trainerId));
    expect(after!.e!.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // Pro gratis zakończone
    expect((await grantBull("trainer", t2))?.number).toBe(2); // miejsce zwolnione, numer kolejny (bez ponownego użycia numeru 1)
    expect(await grantBull("trainer", t)).toBeNull(); // odebranej odznaki nie przyznajemy drugi raz automatycznie
  });
  it("dłuższy okres, który trener już ma, zostaje (nie skracamy)", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "2", GOLDEN_BULLS_TRAINER_MONTHS: "3" });
    const now = new Date();
    const t = await mkTrainer("long");
    const long = new Date(now.getTime() + 400 * DAY);
    await db.update(trainersTable).set({ trialEndsAt: long }).where(eq(trainersTable.id, t.trainerId));
    await grantBull("trainer", t, { now });
    const [tr] = await db.select({ e: trainersTable.trialEndsAt }).from(trainersTable).where(eq(trainersTable.id, t.trainerId));
    expect(tr!.e!.getTime()).toBe(long.getTime());
  });
});

describe("przyznanie w przepływach", () => {
  it("akceptacja wniosku trenera przyznaje Byczka (konto zwykłe) — bez flagi nic", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    const mk = async (n: string) => { const id = acct(n); await db.insert(trainerApplicationsTable).values({ clerkUserId: id, displayName: "Ola Test", email: `${id}@poczta-testowa.pl` }); return id; };
    vi.stubEnv("GOLDEN_BULLS_ENABLED", "");
    const off = await mk("app_off");
    const idOff = (await db.select({ id: trainerApplicationsTable.id }).from(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, off)))[0]!.id;
    auth.userId = ADMIN;
    expect((await request(app).post(`/api/admin/trainer-applications/${idOff}/accept`)).status).toBe(200);
    expect(await count()).toBe(0);
    on({ GOLDEN_BULLS_TRAINER_POOL: "5" });
    const onId = await mk("app_on");
    const idOn = (await db.select({ id: trainerApplicationsTable.id }).from(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, onId)))[0]!.id;
    expect((await request(app).post(`/api/admin/trainer-applications/${idOn}/accept`)).status).toBe(200);
    const rows = await db.select().from(goldenBullsTable).where(eq(goldenBullsTable.clerkUserId, onId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "trainer", number: 1, grantedBy: "auto" });
    expect(rows[0]!.trainerId).toBeTruthy();
  }, 60_000);

  it("osoba Solo dostaje Byczka dopiero przy PIERWSZYM UKOŃCZONYM treningu (nie przy samym starcie ani przerwaniu); podopieczny trenera nie dostaje", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_SOLO_POOL: "5" });
    const mkSolo = async (n: string, trainerId: number | null) => {
      const id = acct(n);
      const [c] = await db.insert(clientsTable).values({ firstName: "Solo", lastName: "gb-test", trainerId, status: "active", clerkUserId: id }).returning();
      const [sv] = await db.insert(surveysTable).values({ clientId: c!.id, dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: 65, experienceLevel: "Początkujący", trainingLocation: "Siłownia", injuryStatus: "Brak" } as never).returning();
      const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
      const [plan] = await db.insert(workoutPlansTable).values({ clientId: c!.id, surveyId: sv!.id, guidelineVersionId: ver!.id, experienceLevelUsed: "Początkujący", title: "gb-plan", status: "active" } as never).returning();
      const [d] = await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: 1, dayName: "A" } as never).returning();
      await db.insert(workoutPlanExercisesTable).values({ dayId: d!.id, exerciseId, orderInDay: 1, workingSets: 3 } as never);
      const [s] = await db.insert(workoutSessionsTable).values({ clientId: c!.id, planId: plan!.id, planDayId: d!.id, sessionDate: new Date().toISOString().slice(0, 10), status: "in_progress", isCompleted: false, startedAt: new Date(), clientUuid: randomUUID() } as never).returning();
      return { id, sessionId: s!.id };
    };
    const fin = (sid: number, status: string) => request(app).post(`/api/client-portal/training/sessions/${sid}/finish`).send({ status });
    const solo = await mkSolo("solo_fin", null);
    auth.userId = solo.id;
    expect(await count()).toBe(0); // sam start sesji nic nie daje
    expect((await fin(solo.sessionId, "aborted")).status).toBe(200);
    expect(await count()).toBe(0); // przerwanie nie daje odznaki
    const solo2 = await mkSolo("solo_ok", null);
    auth.userId = solo2.id;
    expect((await fin(solo2.sessionId, "completed")).status).toBe(200);
    expect((await fin(solo2.sessionId, "completed")).status).toBe(200); // powtórka żądania (offline) nie duplikuje
    const rows = await db.select().from(goldenBullsTable).where(eq(goldenBullsTable.clerkUserId, solo2.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "solo", number: 1 });
    expect(rows[0]!.perksUntil!.getTime() - rows[0]!.grantedAt.getTime()).toBeGreaterThan(80 * DAY); // 3 miesiące od startu
    const t = await mkTrainer("owner");
    const mine = await mkSolo("withtrainer", t.trainerId);
    auth.userId = mine.id;
    expect((await fin(mine.sessionId, "completed")).status).toBe(200);
    expect(await db.select().from(goldenBullsTable).where(eq(goldenBullsTable.clerkUserId, mine.id))).toHaveLength(0);
  }, 60_000);
});

describe("panel administratora", () => {
  it("lista, ręczne przyznanie z powodem (także koncie wykluczonemu), odebranie z powodem; zwykłe konto 403; krótki powód 400", async () => {
    await wipe(); await provisionTrainer(ADMIN);
    on({ GOLDEN_BULLS_TRAINER_POOL: "3" });
    const t = await mkTrainer("man");
    auth.userId = acct("nobody"); await provisionTrainer(auth.userId);
    expect((await request(app).get("/api/admin/golden-bulls")).status).toBe(403);
    auth.userId = ADMIN;
    expect((await request(app).post("/api/admin/golden-bulls/grant").send({ kind: "trainer", id: t.trainerId, reason: "x" })).status).toBe(400);
    const g = await request(app).post("/api/admin/golden-bulls/grant").send({ kind: "trainer", id: t.trainerId, reason: "pierwszy trener beta" });
    expect(g.status).toBe(201);
    expect(g.body.number).toBe(1);
    const list = (await request(app).get("/api/admin/golden-bulls")).body;
    expect(list.pools).toEqual({ trainer: 3, solo: 100 });
    const mine = list.bulls.find((b: { id: number }) => b.id === g.body.id);
    expect(mine).toMatchObject({ kind: "trainer", number: 1, grantedBy: "administrator", reason: "pierwszy trener beta", revoked: false });
    expect((await request(app).post(`/api/admin/golden-bulls/${g.body.id}/revoke`).send({ reason: "no" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/golden-bulls/${g.body.id}/revoke`).send({ reason: "konto testowe QA" })).status).toBe(200);
    const after = (await request(app).get("/api/admin/golden-bulls")).body.bulls.find((b: { id: number }) => b.id === g.body.id);
    expect(after).toMatchObject({ revoked: true, revokedReason: "konto testowe QA" });
    expect((await request(app).post(`/api/admin/golden-bulls/${g.body.id}/revoke`).send({ reason: "jeszcze raz" })).status).toBe(404); // już odebrana
  }, 60_000);
});
