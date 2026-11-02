/** Ukrywanie historii Solo: bez zgody trener (i administrator) nie widzi NICZEGO z okresu Solo na żadnej trasie odczytu; ze zgodą widzi. Test dla każdej trasy. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Ola", lastName: "H", primaryEmailAddress: { emailAddress: "ola.hist@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db, clientsTable, trainersTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, painReportsTable, dailyStepsTable,
  conditioningLogsTable, clientPausesTable, exercisesTable, trainerJoinRequestsTable,
} from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { loadReportModel } from "../services/monthlyReport";
import { resetJoinAttempts } from "../services/joinCode";

const TR = "solohist_trainer", ADM = "solohist_admin", P = "solohist_person";
const as = (u: string | null) => { authUser = u; };
let trId = 0, cid = 0, planId = 0, sessionId = 0;
const today = new Date().toISOString().slice(0, 10);

async function cleanup() {
  const c = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.clerkUserId, P)))[0];
  if (c) {
    const arch = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.lastName, String(c.id)))).map((x) => x.id);
    const all = [c.id, ...arch];
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, all));
    await db.delete(clientsTable).where(inArray(clientsTable.id, all));
  }
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [TR, ADM]));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [TR, ADM]));
}

beforeAll(async () => {
  process.env.SOLO_ENABLED = "1"; process.env.CONDITIONING_ENABLED = "1"; process.env.ACHIEVEMENTS_ENABLED = "1"; process.env.APP_ADMIN_CLERK_IDS = ADM; resetJoinAttempts();
  await cleanup();
  trId = (await provisionTrainer(TR))!.id; await provisionTrainer(ADM);
  await db.update(trainersTable).set({ joinCode: "ABCDEFGH24" }).where(eq(trainersTable.id, trId));
  // osoba Solo z pełną historią
  as(P); const st = await request(app).get("/api/account/status"); (await import("node:fs")).writeFileSync(process.env.HOME + "/logs/hist-dbg.txt", `${st.status} ${JSON.stringify(st.body)}`);
  cid = (await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, P)))[0]!.id;
  const [sv] = await db.insert(surveysTable).values({ clientId: cid, experienceLevel: "Początkujący", healthLimitations: "Kolano — wywiad Solo", injuryStatus: "Tak", trainingGoal: "Budowa sylwetki" } as never).returning();
  const ex = (await db.select({ id: exercisesTable.id }).from(exercisesTable).limit(1))[0]!;
  const [pl] = await db.insert(workoutPlansTable).values({ clientId: cid, surveyId: sv!.id, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan Solo", status: "active", activatedAt: new Date(), createdBy: "solo" } as never).returning();
  planId = pl!.id;
  const [d] = await db.insert(workoutPlanDaysTable).values({ planId, dayOrder: 1, dayName: "Dzień 1" }).returning();
  await db.insert(workoutPlanExercisesTable).values({ dayId: d!.id, exerciseId: ex.id, orderInDay: 1, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 10, rir: 2 });
  const [s] = await db.insert(workoutSessionsTable).values({ clientId: cid, planId, planDayId: d!.id, sessionDate: today, isCompleted: true, status: "completed" } as never).returning();
  sessionId = s!.id;
  await db.insert(painReportsTable).values({ sessionId, clientId: cid, area: "Kolano", severity: 3, clientUuid: randomUUID() } as never);
  await db.insert(dailyStepsTable).values({ clientId: cid, day: today, steps: 9000 });
  await db.insert(conditioningLogsTable).values({ clientUuid: randomUUID(), clientId: cid, method: "marsz", minutes: 20 } as never);
  await db.insert(clientPausesTable).values({ clientId: cid, startDate: today, endDate: today, reason: "urlop", setBy: "client" });
  // prośba bez zgody i akceptacja
  as(P); await request(app).post("/api/join/ABCDEFGH24/request").send({ shareHistory: false });
  as(TR);
  const r = (await db.select().from(trainerJoinRequestsTable).where(and(eq(trainerJoinRequestsTable.trainerId, trId), eq(trainerJoinRequestsTable.status, "pending"))))[0]!;
  await request(app).post(`/api/trainer/join-requests/${r.id}/accept`);
});
afterAll(async () => {
  for (const k of ["SOLO_ENABLED", "CONDITIONING_ENABLED", "ACHIEVEMENTS_ENABLED"]) delete process.env[k];
  await cleanup();
});

const empty = (b: unknown) => (Array.isArray(b) ? b.length === 0 : b == null || (typeof b === "object" && Object.keys(b as object).length === 0));

describe("bez zgody trener nie widzi niczego z okresu Solo (każda trasa odczytu)", () => {
  const get404or = async (path: string) => { as(TR); return request(app).get(path); };
  it("wywiady i zgłoszenia bólu", async () => {
    expect(empty((await get404or(`/api/clients/${cid}/surveys`)).body)).toBe(true);
    const sv = await get404or(`/api/clients/${cid}/survey`); expect(sv.status === 404 || empty(sv.body)).toBe(true);
    expect(empty((await get404or(`/api/clients/${cid}/pain-reports`)).body)).toBe(true);
    expect(JSON.stringify((await get404or(`/api/clients/${cid}`)).body)).not.toContain("Kolano");
  });
  it("plany: lista, szczegóły, historia, ostrzeżenia stawów, podgląd portalu", async () => {
    expect(empty((await get404or(`/api/clients/${cid}/plans`)).body)).toBe(true);
    for (const p of [`/api/plans/${planId}`, `/api/plans/${planId}/history`, `/api/plans/${planId}/joint-warnings`, `/api/clients/${cid}/portal-preview`]) expect((await get404or(p)).status, p).toBe(404);
  });
  it("treningi: sesje (dwa widoki), rekordy", async () => {
    expect(empty((await get404or(`/api/clients/${cid}/training-sessions`)).body)).toBe(true);
    expect((await get404or(`/api/clients/${cid}/training-sessions/${sessionId}`)).status).toBe(404);
    expect(empty((await get404or(`/api/clients/${cid}/training-records`)).body)).toBe(true);
    expect(empty((await get404or(`/api/clients/${cid}/workout-sessions`)).body)).toBe(true);
    expect((await get404or(`/api/clients/${cid}/workout-sessions/${sessionId}`)).status).toBe(404);
  });
  it("kroki, kondycja, przerwy", async () => {
    const steps = (await get404or(`/api/clients/${cid}/steps`)).body as { days?: Array<{ steps: number | null }>; today?: number | null; weekTotal?: number };
    expect(JSON.stringify(steps)).not.toContain("9000");
    const cond = await get404or(`/api/clients/${cid}/conditioning/logs`); expect(empty(cond.body.logs)).toBe(true);
    expect(empty((await get404or(`/api/clients/${cid}/pauses`)).body.items)).toBe(true);
  });
  it("raport miesięczny (PDF): model bez treningów, bólu i kroków z okresu Solo", async () => {
    const model = await loadReportModel(cid, trId, today.slice(0, 7));
    expect(model).not.toBeNull();
    const json = JSON.stringify(model);
    expect(json).not.toContain("Kolano"); expect(json).not.toContain("9000");
    expect((await get404or(`/api/clients/${cid}/monthly-report`)).status).toBeLessThan(500);
  });
  it("pulpit: bez wzmianek o planie, treningach i bólu z okresu Solo", async () => {
    as(TR);
    const r = await request(app).get("/api/dashboard/summary");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("Kolano");
  });
  it("administrator: wgląd w osobę nie pokazuje wywiadu ani bólu z okresu Solo", async () => {
    as(ADM);
    const r = await request(app).post("/api/admin/access/client").send({ clientId: cid, reason: "sprawdzam izolację historii Solo" });
    expect(r.status).toBe(200);
    expect(r.body.healthDescription ?? null).toBeNull(); expect(empty(r.body.painReports)).toBe(true);
  });
  it("osoba nadal widzi własną historię w portalu", async () => {
    as(P);
    expect((await db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.clientId, cid))).length).toBe(1);
    expect((await request(app).get("/api/client-portal/steps")).body.days?.some?.((d: { steps: number }) => d.steps === 9000) ?? true).toBe(true);
  });
});

describe("ze zgodą trener widzi", () => {
  it("po odłączeniu i ponownym połączeniu ze zgodą: wywiad, plan, trening, kroki widoczne", async () => {
    as(P); expect((await request(app).post("/api/client-portal/disconnect")).status).toBe(200);
    await request(app).post("/api/join/ABCDEFGH24/request").send({ shareHistory: true });
    as(TR);
    const r = (await db.select().from(trainerJoinRequestsTable).where(and(eq(trainerJoinRequestsTable.trainerId, trId), eq(trainerJoinRequestsTable.status, "pending"))))[0]!;
    expect((await request(app).post(`/api/trainer/join-requests/${r.id}/accept`)).status).toBe(200);
    expect(((await request(app).get(`/api/clients/${cid}/surveys`)).body as unknown[]).length).toBeGreaterThan(0);
    expect((await request(app).get(`/api/plans/${planId}`)).status).toBe(200);
    expect(((await request(app).get(`/api/clients/${cid}/training-sessions`)).body as unknown[]).length).toBe(1);
    expect(JSON.stringify((await request(app).get(`/api/clients/${cid}/steps`)).body)).toContain("9000");
    expect(((await request(app).get(`/api/clients/${cid}/pain-reports`)).body as unknown[]).length).toBe(1);
  });
});
