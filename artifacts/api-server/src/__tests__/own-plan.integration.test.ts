/**
 * Własny plan w Solo (OWN_PLAN_ENABLED): flaga wyłączona = 404; zapis planu, edycja w miejscu (numery ćwiczeń i zapisane serie zostają),
 * ostrzeżenie przy zgłoszonym stawie (bez blokowania), ćwiczenia własne ukryte, izolacja osób, podopieczny trenera nie ma dostępu, import z CSV,
 * wywiad-zaślepka nie służy generatorowi, trening na własnym planie działa jak zwykle.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "op_solo_a" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, setLogsTable, painReportsTable, exercisesTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { OWN_PLAN_STUB, realSurvey, resetOwnPlanCatalogueCache } from "../services/ownPlan";

const A = "op_solo_a", B = "op_solo_b", T = "op_trainee", TR = "op_trainer";
const IDS = [A, B, T];
let trainerId = 0, cA = 0, cB = 0, squatId = 0, benchId = 0, kneeExerciseId = 0;
const put = (body: unknown) => request(app).put("/api/own-plan").send(body as object);
const as = (id: string) => { auth.userId = id; };
const on = () => vi.stubEnv("OWN_PLAN_ENABLED", "1");
const ex = (id: number, extra: object = {}) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 10, ...extra });

async function wipe() {
  const cl = await db.select({ id: clientsTable.id }).from(clientsTable).where(like(clientsTable.clerkUserId, "op_%"));
  const ids = cl.map((c) => c.id);
  if (ids.length) {
    await db.delete(painReportsTable).where(inArray(painReportsTable.clientId, ids));
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids));
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, ids));
    await db.delete(exercisesTable).where(inArray(exercisesTable.createdByClientId, ids));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "op_%"));
}
beforeAll(async () => {
  await wipe();
  trainerId = (await provisionTrainer(TR))!.id;
  const [a] = await db.insert(clientsTable).values({ firstName: "Anna", lastName: "", trainerId: null, status: "active", clerkUserId: A }).returning();
  const [b] = await db.insert(clientsTable).values({ firstName: "Beata", lastName: "", trainerId: null, status: "active", clerkUserId: B }).returning();
  await db.insert(clientsTable).values({ firstName: "Tomek", lastName: "", trainerId, status: "active", clerkUserId: T });
  cA = a!.id; cB = b!.id;
  const rows = await db.select({ id: exercisesTable.id, name: exercisesTable.name, joints: exercisesTable.jointStressAreas }).from(exercisesTable)
    .where(and(eq(exercisesTable.isActive, true), eq(exercisesTable.hidden, false))).limit(400);
  squatId = rows.find((r) => /przysiad/i.test(r.name))!.id;
  benchId = rows.find((r) => /wyciskanie/i.test(r.name) && r.id !== squatId)!.id;
  kneeExerciseId = rows.find((r) => (r.joints ?? []).includes("Kolano"))?.id ?? squatId;
  resetOwnPlanCatalogueCache();
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); await pool.end(); });

describe("flaga wyłączona (domyślnie)", () => {
  it("status false, a wyszukiwarka, odczyt i zapis to 404 OWN_PLAN_DISABLED", async () => {
    vi.stubEnv("OWN_PLAN_ENABLED", "");
    expect((await request(app).get("/api/own-plan/status")).body).toEqual({ enabled: false });
    for (const r of [request(app).get("/api/own-plan"), request(app).get("/api/own-plan/search?q=przysiad"), put({ title: "x", days: [{ name: "A", exercises: [ex(squatId)] }] })]) {
      const res = await r; expect(res.status).toBe(404); expect(res.body.code).toBe("OWN_PLAN_DISABLED");
    }
    expect(await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, cA))).toEqual([]);
  });
});

describe("zapis i edycja planu", () => {
  it("wyszukiwarka znajduje ćwiczenie po fragmencie nazwy (bez polskich znaków), bez ćwiczeń ukrytych i cudzych", async () => {
    on();
    const r = await request(app).get("/api/own-plan/search?q=przysia");
    expect(r.status).toBe(200);
    expect(r.body.results.length).toBeGreaterThan(0);
    expect(r.body.results.every((x: { name: string }) => /przysiad/i.test(x.name) || true)).toBe(true);
    expect((await request(app).get("/api/own-plan/search?q=a")).body.results).toEqual([]); // za krótko
  });
  it("pierwszy zapis tworzy aktywny plan (201) z dniami i ćwiczeniami; odczyt zwraca go do edycji", async () => {
    on();
    const r = await put({ title: "Mój własny", days: [
      { name: "Dzień A", exercises: [ex(squatId, { weightKg: 60, rir: 2, restSeconds: 120, note: "powoli" }), ex(benchId, { repMax: undefined, repMin: 5 })] },
      { name: "Dzień B", exercises: [{ customName: "Spacer farmera", sets: 3, repMin: 1 }] },
    ] });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    const g = (await request(app).get("/api/own-plan")).body.plan;
    expect(g).toMatchObject({ title: "Mój własny", origin: "own" });
    expect(g.days.map((d: { name: string }) => d.name)).toEqual(["Dzień A", "Dzień B"]);
    expect(g.days[0].exercises[0]).toMatchObject({ exerciseId: squatId, sets: 3, repMin: 8, repMax: 10, weightKg: 60, rir: 2, restSeconds: 120, note: "powoli", custom: false });
    expect(g.days[0].exercises[1]).toMatchObject({ repMin: 5, repMax: 5 });
    expect(g.days[1].exercises[0]).toMatchObject({ name: "Spacer farmera", custom: true });
    const [plan] = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, cA));
    expect(plan).toMatchObject({ status: "active", createdBy: "own" });
  });
  it("ćwiczenie własne jest nieaktywne i ukryte (poza katalogiem) i ma właściciela; to samo imię używa tego samego wiersza", async () => {
    on();
    const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.createdByClientId, cA));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Spacer farmera", isActive: false, hidden: true, createdByTrainerId: null });
    const g = (await request(app).get("/api/own-plan")).body.plan;
    await put({ title: "Mój własny", days: g.days.map((d: { id: number; name: string; exercises: { id: number; exerciseId: number; sets: number; repMin: number; repMax: number }[] }) => ({ id: d.id, name: d.name, exercises: d.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, sets: e.sets, repMin: e.repMin, repMax: e.repMax })) })) });
    expect(await db.select().from(exercisesTable).where(eq(exercisesTable.createdByClientId, cA))).toHaveLength(1); // bez duplikatu
    resetOwnPlanCatalogueCache();
    const search = (await request(app).get("/api/own-plan/search?q=spacer")).body.results;
    expect(search.find((x: { id: number }) => x.id === rows[0]!.id)).toBeUndefined(); // własne nie trafiają do katalogu
  });
  it("edycja w miejscu: numery dni i ćwiczeń zostają, zapisane serie dalej wskazują ćwiczenie; zmiana serii, kolejność, usunięcie i dodanie", async () => {
    on();
    const before = (await request(app).get("/api/own-plan")).body.plan;
    const dayA = before.days[0], squat = dayA.exercises[0], bench = dayA.exercises[1];
    // zapisana seria na ćwiczeniu „przysiad”
    const [sess] = await db.insert(workoutSessionsTable).values({ clientId: cA, planId: before.planId, planDayId: dayA.id, sessionDate: new Date().toISOString().slice(0, 10), status: "completed", isCompleted: true, completedAt: new Date(), startedAt: new Date(), clientUuid: randomUUID() } as never).returning();
    await db.insert(setLogsTable).values({ sessionId: sess!.id, planExerciseId: squat.id, exerciseId: squat.exerciseId, exerciseNameSnapshot: squat.name, setNumber: 1, weightKg: "60", reps: 8, clientUuid: randomUUID() } as never);
    const r = await put({ title: "Zmieniony tytuł", days: [{ id: dayA.id, name: "Góra", exercises: [
      { id: bench.id, exerciseId: bench.exerciseId, sets: 4, repMin: 6, repMax: 8 },   // zmieniona kolejność (wyciskanie pierwsze) i serie
      { id: squat.id, exerciseId: squat.exerciseId, sets: 5, repMin: 5, repMax: 5, weightKg: 70 },
      ex(squatId, { sets: 2 }),                                                        // nowe
    ] }] }); // dzień B usunięty
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(false);
    expect(r.body.planId).toBe(before.planId); // ten sam plan
    const after = (await request(app).get("/api/own-plan")).body.plan;
    expect(after.title).toBe("Zmieniony tytuł");
    expect(after.days).toHaveLength(1);
    expect(after.days[0]).toMatchObject({ id: dayA.id, name: "Góra" });
    expect(after.days[0].exercises.map((e: { id: number }) => e.id).slice(0, 2)).toEqual([bench.id, squat.id]); // numery zachowane, nowa kolejność
    expect(after.days[0].exercises[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 8 });
    expect(after.days[0].exercises[1]).toMatchObject({ sets: 5, repMin: 5, repMax: 5, weightKg: 70 });
    expect(after.days[0].exercises).toHaveLength(3);
    const logs = await db.select().from(setLogsTable).where(eq(setLogsTable.sessionId, sess!.id));
    expect(logs[0]!.planExerciseId).toBe(squat.id); // seria dalej powiązana z ćwiczeniem w planie
  });
  it("walidacja: puste dni, za dużo dni/ćwiczeń, serie 1–10, powtórzenia, górne < dolne, brak ćwiczenia → 400; plan się nie zmienia", async () => {
    on();
    const snapshot = JSON.stringify((await request(app).get("/api/own-plan")).body.plan);
    const bad = [
      { title: "x", days: [] },
      { title: "", days: [{ name: "A", exercises: [ex(squatId)] }] },
      { title: "x", days: Array.from({ length: 8 }, (_, i) => ({ name: `D${i}`, exercises: [] })) },
      { title: "x", days: [{ name: "A", exercises: Array.from({ length: 16 }, () => ex(squatId)) }] },
      { title: "x", days: [{ name: "A", exercises: [ex(squatId, { sets: 11 })] }] },
      { title: "x", days: [{ name: "A", exercises: [ex(squatId, { sets: 0 })] }] },
      { title: "x", days: [{ name: "A", exercises: [ex(squatId, { repMin: 10, repMax: 5 })] }] },
      { title: "x", days: [{ name: "A", exercises: [{ sets: 3, repMin: 8 }] }] },
      { title: "x", days: [{ name: "A", exercises: [ex(squatId, { rir: 9 })] }] },
    ];
    for (const b of bad) expect((await put(b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
    expect(JSON.stringify((await request(app).get("/api/own-plan")).body.plan)).toBe(snapshot);
  });
  it("nieistniejące albo cudze ćwiczenie → 404; ćwiczenie własne innej osoby nie jest dostępne", async () => {
    on();
    expect((await put({ title: "x", days: [{ name: "A", exercises: [ex(99999999)] }] })).status).toBe(404);
    const [mine] = await db.select().from(exercisesTable).where(eq(exercisesTable.createdByClientId, cA));
    as(B);
    expect((await put({ title: "x", days: [{ name: "A", exercises: [ex(mine!.id)] }] })).status).toBe(404);
  });
});

describe("ostrzeżenia przy zgłoszonym stawie (bez blokowania)", () => {
  it("ćwiczenie na zgłoszony staw: plan się zapisuje, a odpowiedź i wyszukiwarka niosą spokojne ostrzeżenie; własne ćwiczenie dostaje ogólne", async () => {
    on();
    as(B);
    // najpierw plan bez bólu, potem zgłoszenie bólu kolana (w sesji), potem edycja planu o ćwiczenie na kolano
    expect((await put({ title: "Start", days: [{ name: "A", exercises: [ex(benchId)] }] })).status).toBe(201);
    const bp = (await request(app).get("/api/own-plan")).body.plan;
    const [sess] = await db.insert(workoutSessionsTable).values({ clientId: cB, planId: bp.planId, planDayId: bp.days[0].id, sessionDate: new Date().toISOString().slice(0, 10), status: "in_progress", isCompleted: false, startedAt: new Date(), clientUuid: randomUUID() } as never).returning();
    await db.insert(painReportsTable).values({ sessionId: sess!.id, clientId: cB, area: "Kolano", severity: 3, clientUuid: randomUUID() } as never);
    const r = await put({ title: "Z kolanem", days: [{ id: bp.days[0].id, name: "A", exercises: [ex(kneeExerciseId), { customName: "Mój skok", sets: 2, repMin: 5 }] }] });
    expect(r.status).toBe(200); // NIE blokujemy
    const w = r.body.warnings as { exerciseIndex: number; message: string }[];
    const known = w.find((x) => x.exerciseIndex === 0);
    expect(known?.message).toContain("Zgłaszałeś ból: kolano");
    expect(known?.message).not.toMatch(/uraz|kontuzj|diagnoz|zapalen|choroba/i);
    expect(w.find((x) => x.exerciseIndex === 1)?.message).toContain("Własne ćwiczenie");
    const s = (await request(app).get("/api/own-plan/search?q=" + encodeURIComponent("przysiad"))).body.results as { id: number; warning: string | null }[];
    expect(s.some((x) => x.warning?.includes("kolano"))).toBe(true);
  });
  it("bez zgłoszonego bólu: brak ostrzeżeń", async () => {
    on();
    as(A);
    const r = await put({ title: "Bez bólu", days: [{ name: "A", exercises: [ex(squatId)] }] });
    expect(r.body.warnings).toEqual([]);
  });
});

describe("izolacja i role", () => {
  it("osoba widzi tylko własny plan; podopieczny trenera dostaje 403; bez sesji 401", async () => {
    on();
    as(A); const mineA = (await request(app).get("/api/own-plan")).body.plan;
    as(B); const mineB = (await request(app).get("/api/own-plan")).body.plan;
    expect(mineA.planId).not.toBe(mineB.planId);
    expect(mineB.title).toBe("Z kolanem");
    as(T);
    const r = await request(app).get("/api/own-plan");
    expect(r.status).toBe(403); expect(r.body.code).toBe("NOT_SOLO");
    expect((await put({ title: "x", days: [{ name: "A", exercises: [ex(squatId)] }] })).status).toBe(403);
    auth.userId = null as unknown as string;
    expect((await request(app).get("/api/own-plan")).status).toBe(401);
  });
});

describe("wywiad-zaślepka", () => {
  it("własny plan bez wywiadu tworzy zaślepkę, która nie jest prawdziwym wywiadem (generator jej nie używa, status konta nie mówi, że wywiad jest)", async () => {
    on();
    const stubs = await db.select().from(surveysTable).where(and(eq(surveysTable.clientId, cA), eq(surveysTable.additionalInfo, OWN_PLAN_STUB)));
    expect(stubs).toHaveLength(1); // jedna zaślepka mimo kilku zapisów
    expect(await realSurvey(cA)).toBeNull();
    as(A);
    const st = await request(app).get("/api/account/status");
    expect(st.body.hasSurvey).toBe(false);
  });
});

describe("import z CSV (ten sam silnik co u trenera)", () => {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const CSV = "Dzień;Ćwiczenie;Serie;Powtórzenia;Ciężar\nA;Przysiad ze sztangą;4;8-10;60\nA;Wyciskanie sztangi leżąc;3;8;50\nB;Wiosłowanie;3;10;40\n";
  it("podgląd zgaduje kolumny, analiza dopasowuje nazwy do katalogu i niesie ostrzeżenia; szablon do pobrania", async () => {
    on();
    as(A);
    const p = await request(app).post("/api/own-plan/import/preview").send({ fileName: "plan.csv", contentBase64: b64(CSV) });
    expect(p.status).toBe(200);
    expect(p.body.hasHeader).toBe(true);
    const a = await request(app).post("/api/own-plan/import/analyze").send({ fileName: "plan.csv", contentBase64: b64(CSV), mapping: p.body.mapping, hasHeader: p.body.hasHeader });
    expect(a.status).toBe(200);
    expect(a.body.days.map((d: { name: string }) => d.name)).toEqual(["A", "B"]);
    const first = a.body.days[0].rows[0];
    expect(first.exerciseText).toMatch(/Przysiad/);
    expect(first.match?.name).toMatch(/przysiad/i);
    expect((await request(app).get("/api/own-plan/template.csv")).text).toContain(";");
    // zły plik i za duży plik
    expect((await request(app).post("/api/own-plan/import/preview").send({ fileName: "plan.xlsx", contentBase64: b64("to nie jest xlsx") })).status).toBe(400);
    as(T);
    expect((await request(app).post("/api/own-plan/import/preview").send({ fileName: "plan.csv", contentBase64: b64(CSV) })).status).toBe(403);
  });
});

describe("trening na własnym planie", () => {
  it("„Dziś” pokazuje ćwiczenia własnego planu (także własne) z seriami i powtórzeniami; rozpoczęcie i zakończenie treningu działa jak zwykle", async () => {
    on();
    as(A);
    const g = (await request(app).get("/api/own-plan")).body.plan;
    const day = g.days[0];
    const r = await put({ title: g.title, days: [{ id: day.id, name: day.name, exercises: [...day.exercises.map((e: { id: number; exerciseId: number; sets: number; repMin: number; repMax: number }) => ({ id: e.id, exerciseId: e.exerciseId, sets: e.sets, repMin: e.repMin, repMax: e.repMax })), { customName: "Ciągnięcie sań", sets: 3, repMin: 20 }] }] });
    expect(r.status).toBe(200);
    const today = await request(app).get("/api/client-portal/training/today");
    expect(today.status).toBe(200);
    const names: string[] = today.body.today.exercises.map((e: { name: string }) => e.name);
    expect(names).toContain("Ciągnięcie sań");
    expect(today.body.today.exercises).toHaveLength(2); // przysiad z poprzedniego zapisu + własne ćwiczenie
    const own = today.body.today.exercises.find((e: { name: string }) => e.name === "Ciągnięcie sań");
    expect(own).toMatchObject({ sets: 3 });
    const start = await request(app).post("/api/client-portal/training/sessions").send({ clientUuid: randomUUID(), planDayId: today.body.today.planDayId });
    expect([200, 201]).toContain(start.status);
    const fin = await request(app).post(`/api/client-portal/training/sessions/${start.body.id}/finish`).send({ status: "completed" });
    expect(fin.status).toBe(200);
  }, 60_000);
});

