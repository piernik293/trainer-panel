/**
 * Kroki wpisywane ręcznie (blok 6): walidacja 0–100000, jeden wpis na dzień (nadpisanie), okno 7 dni, cel,
 * średnia tygodnia, izolacja klient/klient i trener/trener. Baza testowa.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { shiftDate, summarize, todayWarsaw, isEnterableDate } from "../services/steps";

const TA = "steps_test_trainer_a", TB = "steps_test_trainer_b";
const CA1 = "steps_test_client_a1", CB1 = "steps_test_client_b1";
const EMAILS = ["steps-a1@example.invalid", "steps-b1@example.invalid"];
let a1: number, b1: number;
const as = (u: string | null) => { authUser = u; };

beforeAll(async () => {
  const tA = (await provisionTrainer(TA))!, tB = (await provisionTrainer(TB))!;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  const mk = async (email: string, clerk: string, trainerId: number) =>
    (await db.insert(clientsTable).values({ firstName: "Krok", lastName: "Test", email, trainerId, clerkUserId: clerk }).returning())[0]!.id;
  a1 = await mk(EMAILS[0]!, CA1, tA.id);
  b1 = await mk(EMAILS[1]!, CB1, tB.id);
});
afterAll(async () => { await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS)); });

describe("services/steps (pure)", () => {
  it("okno wpisów: dziś i 6 dni wstecz, nie przyszłość, nie nieistniejąca data", () => {
    const t = "2026-10-25";
    expect(isEnterableDate("2026-10-25", t)).toBe(true);
    expect(isEnterableDate("2026-10-19", t)).toBe(true);
    expect(isEnterableDate("2026-10-18", t)).toBe(false);
    expect(isEnterableDate("2026-10-26", t)).toBe(false);
    expect(isEnterableDate("2026-02-30", t)).toBe(false);
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("podsumowanie: brak wpisu to „brak danych”, średnia tylko z dni z wpisem, realizacja celu", () => {
    const t = "2026-10-25";
    const s = summarize([{ day: "2026-10-25", steps: 6000 }, { day: "2026-10-24", steps: 10000 }, { day: "2026-10-20", steps: 2000 }], 8000, t);
    expect(s.days).toHaveLength(7);
    expect(s.days[6]).toEqual({ date: t, steps: 6000 });
    expect(s.days[0]!.steps).toBeNull();
    expect(s.average).toBe(6000);
    expect(s.todayPercent).toBe(75);
    expect(s.daysAtGoal).toBe(1);
    expect(s.averagePercent).toBe(75);
    expect(summarize([], null, t)).toMatchObject({ average: null, todayPercent: null, daysAtGoal: null, averagePercent: null });
    expect(summarize([{ day: t, steps: 30000 }], 10000, t).todayPercent).toBe(100);
  });
});

describe("portal klienta", () => {
  it("bez sesji 401", async () => { as(null); expect((await request(app).get("/api/client-portal/steps")).status).toBe(401); });
  it("pusty tydzień: 7 dni bez danych, brak celu", async () => {
    as(CA1);
    const r = await request(app).get("/api/client-portal/steps");
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(7);
    expect(r.body).toMatchObject({ goal: null, average: null, todaySteps: null });
  });
  it("walidacja: ujemne, > 100000, ułamek, tekst, przyszłość, za stara data", async () => {
    as(CA1);
    const put = (b: object) => request(app).put("/api/client-portal/steps").send(b);
    for (const steps of [-1, 100001, 5.5, "8000", null]) expect((await put({ steps })).status, String(steps)).toBe(400);
    expect((await put({ steps: 100 , date: shiftDate(todayWarsaw(), 1) })).status).toBe(400);
    expect((await put({ steps: 100, date: shiftDate(todayWarsaw(), -7) })).status).toBe(400);
    expect((await put({ steps: 0 })).status).toBe(200);
    expect((await put({ steps: 100000 })).status).toBe(200);
  });
  it("ponowny wpis tego dnia nadpisuje (kolejka offline jest idempotentna), średnia z dni z wpisem", async () => {
    as(CA1);
    const t = todayWarsaw();
    await request(app).put("/api/client-portal/steps").send({ steps: 3000 });
    await request(app).put("/api/client-portal/steps").send({ steps: 4000 });
    await request(app).put("/api/client-portal/steps").send({ steps: 8000, date: shiftDate(t, -1) });
    const r = await request(app).get("/api/client-portal/steps");
    expect(r.body.todaySteps).toBe(4000);
    expect(r.body.average).toBe(6000);
  });
  it("cel: 1000–100000 albo brak; realizacja", async () => {
    as(CA1);
    const goal = (g: unknown) => request(app).put("/api/client-portal/steps-goal").send({ goal: g });
    expect((await goal(500)).status).toBe(400);
    expect((await goal(100001)).status).toBe(400);
    expect((await goal("8000")).status).toBe(400);
    const ok = await goal(8000);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ goal: 8000, todayPercent: 50 });
    expect((await goal(null)).body.goal).toBeNull();
    await goal(8000);
  });
  it("klient B1 nie widzi kroków A1 i nie zmienia ich", async () => {
    as(CB1);
    const r = await request(app).get("/api/client-portal/steps");
    expect(r.body).toMatchObject({ todaySteps: null, average: null, goal: null });
    await request(app).put("/api/client-portal/steps").send({ steps: 1234 });
    as(CA1);
    expect((await request(app).get("/api/client-portal/steps")).body.todaySteps).toBe(4000);
  });
});

describe("panel trenera", () => {
  it("trener A widzi średnią i cel swojego klienta, trener B dostaje 404", async () => {
    as(TA);
    const r = await request(app).get(`/api/clients/${a1}/steps`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ goal: 8000, todaySteps: 4000, average: 6000 });
    as(TB);
    expect((await request(app).get(`/api/clients/${a1}/steps`)).status).toBe(404);
    expect((await request(app).put(`/api/clients/${a1}/steps-goal`).send({ goal: 1500 })).status).toBe(404);
    as(TA);
    expect((await request(app).get("/api/clients/abc/steps")).status).toBe(404);
  });
  it("trener ustawia cel klienta (widoczny w portalu); zły cel 400", async () => {
    as(TA);
    expect((await request(app).put(`/api/clients/${a1}/steps-goal`).send({ goal: 999 })).status).toBe(400);
    expect((await request(app).put(`/api/clients/${a1}/steps-goal`).send({ goal: 10000 })).body.goal).toBe(10000);
    as(CA1);
    expect((await request(app).get("/api/client-portal/steps")).body.goal).toBe(10000);
  });
  it("klient nie wejdzie na trasę trenera, trener na trasę portalu (401/403/404)", async () => {
    as(CA1);
    expect([401, 403, 404]).toContain((await request(app).get(`/api/clients/${a1}/steps`)).status);
    as(TA);
    expect([401, 403, 404]).toContain((await request(app).get("/api/client-portal/steps")).status);
  });
});
