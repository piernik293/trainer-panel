/** Moduł kondycyjny (blok 12): czysta logika + trasy za CONDITIONING_ENABLED, izolacja A/B, idempotencja, check-in tylko u trenera. */
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
import { db, clientsTable, surveysTable, workoutPlansTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { allowedMethods, allowedTools, walkRunPlan, walkRunWeek, intervalWeek, prescribe, conditioningEnabled, firstSession, continuousWeek, MAX_WEEKLY_INCREASE } from "../services/conditioning";

const TA = "cond_test_trainer_a", TB = "cond_test_trainer_b";
const CA1 = "cond_test_client_a1", CB1 = "cond_test_client_b1", CS = "cond_test_solo";
const EMAILS = ["cond-a1@example.invalid", "cond-b1@example.invalid", "cond-solo@example.invalid"];
let a1: number, b1: number;
let planId: number;
const as = (u: string | null) => { authUser = u; };

describe("services/conditioning (czysta logika)", () => {
  it("flaga domyślnie wyłączona", () => {
    expect(conditioningEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(conditioningEnabled({ CONDITIONING_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
  it("brak aktywności i początkujący nigdy nie dostają interwałów ani tempa", () => {
    for (const l of ["Brak aktywności fizycznej", "Początkujący", null, undefined]) {
      const m = allowedMethods(l);
      expect(m).not.toContain("interwaly"); expect(m).not.toContain("tempo"); expect(m).not.toContain("fartlek");
    }
    expect(allowedMethods("Średniozaawansowany")).toContain("interwaly");
    expect(prescribe({ level: "Początkujący", method: "interwaly", week: 1, blockedJoints: new Set() }).ok).toBe(false);
  });
  it("skakanka i sanki dopiero od poziomu Ś", () => {
    const ids = (l: string) => allowedTools(l, "interwaly", new Set()).map((t) => t.id);
    expect(ids("Początkujący")).not.toContain("skakanka");
    expect(ids("Średniozaawansowany")).toContain("skakanka");
  });
  it("marszobieg: 8 tygodni, pierwsza jednostka 20–25 min, tygodnie 4 i 8 lżejsze", () => {
    const plan = walkRunPlan();
    expect(plan).toHaveLength(8);
    const f = firstSession();
    expect(f.totalMinutes).toBeGreaterThanOrEqual(20); expect(f.totalMinutes).toBeLessThanOrEqual(25);
    expect(f.pattern[0]).toMatchObject({ kind: "marsz", minutes: 2 }); expect(f.pattern[1]).toMatchObject({ kind: "trucht", minutes: 1 });
    expect(plan.filter((w) => w.light).map((w) => w.week)).toEqual([4, 8]);
    expect(walkRunWeek(4).totalMinutes).toBeLessThan(walkRunWeek(3).totalMinutes);
  });
  it("bieg ciągły: wzrost ≤ 15% tydzień do tygodnia, lżejszy tydzień co 4.", () => {
    let prev = continuousWeek(1).totalMinutes;
    for (let w = 2; w <= 12; w++) {
      const cur = continuousWeek(w);
      if (!cur.light && !continuousWeek(w - 1).light) expect(cur.totalMinutes).toBeLessThanOrEqual(prev * (1 + MAX_WEEKLY_INCREASE) + 0.001);
      if (cur.light) expect(cur.totalMinutes).toBeLessThan(prev);
      prev = cur.totalMinutes;
    }
  });
  it("interwały: do 10 odcinków", () => { expect(intervalWeek(30).repeats).toBeLessThanOrEqual(10); });
  it("filtr bólu: kolano → bez bieżni/terenu, zamiana na rower", () => {
    const p = prescribe({ level: "Początkujący", method: "bieg_ciagly", toolId: "teren", week: 1, blockedJoints: new Set(["Kolano"]) });
    expect(p.ok && p.value.tool).toBe("rower");
    expect(p.ok && p.value.swapped).toBe(true);
    const none = prescribe({ level: "Brak aktywności fizycznej", method: "marszobieg", toolId: "teren", week: 1, blockedJoints: new Set(["Kolano"]) });
    expect(none.ok).toBe(false);
  });
});

describe("trasy", () => {
  beforeAll(async () => {
    const a = (await provisionTrainer(TA))!, b = (await provisionTrainer(TB))!;
    await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
    const mk = async (email: string, clerk: string, trainerId: number | null) =>
      (await db.insert(clientsTable).values({ firstName: "Kond", lastName: "Test", email, trainerId, clerkUserId: clerk }).returning())[0]!.id;
    a1 = await mk(EMAILS[0]!, CA1, a.id);
    b1 = await mk(EMAILS[1]!, CB1, b.id);
    await mk(EMAILS[2]!, CS, null);
    const [sv] = await db.insert(surveysTable).values({ clientId: a1, experienceLevel: "Początkujący" }).returning();
    planId = (await db.insert(workoutPlansTable).values({ clientId: a1, surveyId: sv!.id, guidelineVersionId: 1, experienceLevelUsed: "Początkujący", title: "Plan kond", status: "draft" }).returning())[0]!.id;
  });
  afterAll(async () => { process.env.CONDITIONING_ENABLED = ""; await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS)); });

  it("flaga wyłączona → 404 CONDITIONING_DISABLED", async () => {
    process.env.CONDITIONING_ENABLED = ""; as(CA1);
    const r = await request(app).get("/api/client-portal/conditioning");
    expect(r.status).toBe(404); expect(r.body.code).toBe("CONDITIONING_DISABLED");
  });

  it("dzień kondycyjny: własny klient tak, cudzy 404, interwały dla P 422", async () => {
    process.env.CONDITIONING_ENABLED = "1";
    as(TA);
    const ok = await request(app).post(`/api/clients/${a1}/plans/${planId}/conditioning-days`).send({ method: "marszobieg", week: 1 });
    expect(ok.status).toBe(201);
    expect(ok.body.day.dayType).toBe("kondycyjny");
    as(TB);
    expect((await request(app).post(`/api/clients/${a1}/plans/${planId}/conditioning-days`).send({ method: "marszobieg" })).status).toBe(404);
    expect((await request(app).get(`/api/clients/${a1}/conditioning/logs`)).status).toBe(404);
    as(TA);
    const bad = await request(app).post(`/api/clients/${a1}/plans/${planId}/conditioning-days`).send({ method: "interwaly" });
    expect(bad.status).toBe(422);
  });

  it("zapis jednostki jest idempotentny, cudzy dzień odrzucony, izolacja klientów", async () => {
    process.env.CONDITIONING_ENABLED = "1";
    const uuid = "7d5f0b0e-5a39-4c6e-9d2c-0d2a8f1b7a11";
    const body = { clientUuid: uuid, method: "marszobieg", minutes: 22, rpe: 4, talkTest: "zdania" };
    as(CA1);
    expect((await request(app).post("/api/client-portal/conditioning/log").send(body)).status).toBe(201);
    const again = await request(app).post("/api/client-portal/conditioning/log").send(body);
    expect(again.status).toBe(200); expect(again.body.duplicate).toBe(true);
    expect((await request(app).post("/api/client-portal/conditioning/log").send({ ...body, minutes: 0, clientUuid: "7d5f0b0e-5a39-4c6e-9d2c-0d2a8f1b7a12" })).status).toBe(400);
    as(CB1);
    expect((await request(app).post("/api/client-portal/conditioning/log").send(body)).status).toBe(409);
    as(TA);
    expect((await request(app).get(`/api/clients/${a1}/conditioning/logs`)).body.logs).toHaveLength(1);
    as(TB);
    expect((await request(app).get(`/api/clients/${b1}/conditioning/logs`)).body.logs).toHaveLength(0);
  });

  it("check-in: podopieczny trenera tak, Solo 403", async () => {
    process.env.CONDITIONING_ENABLED = "1";
    as(CA1);
    expect((await request(app).post("/api/client-portal/conditioning/checkin").send({ felt: "w_sam_raz" })).status).toBe(200);
    as(CS);
    expect((await request(app).post("/api/client-portal/conditioning/checkin").send({ felt: "lekko" })).status).toBe(403);
  });

  it("edycja słownika celów tylko dla administratora", async () => {
    process.env.CONDITIONING_ENABLED = "1";
    as(TA);
    const list = await request(app).get("/api/conditioning/rules");
    expect(list.status).toBe(200); expect(list.body.rules.length).toBeGreaterThan(10);
    const r = await request(app).put(`/api/conditioning/rules/${list.body.rules[0].id}`).send({ mode: "opcjonalny" });
    expect(r.status).toBe(403);
  });
});
