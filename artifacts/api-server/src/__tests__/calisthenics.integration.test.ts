/**
 * Calisthenics style behind CALISTHENICS_ENABLED (docs/KALISTENIKA.md):
 *  - flag OFF: generate-day answers exactly as without the style (and the extra routes say "disabled");
 *  - flag ON: only body weight / bar / parallel bars / rings / bands, about 5 exercises per unit, days by station, BA/P safe, jumps only on the leg day.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "calis_trainer" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable } from "@workspace/db";
import { isCalisthenicsExercise } from "../services/calisthenics";

const TYPES = ["pull", "push", "legs", "upper", "full_body"] as const;
let trainerId = 0; let otherTrainerId = 0;
const clientIds: number[] = [];
const cat = new Map<number, typeof exercisesTable.$inferSelect>();

interface Opt { level: string; years?: string; location: string; equipment: string | null; goal?: string; jump?: string | null }
async function mkClient(o: Opt, owner = trainerId): Promise<number> {
  const [c] = await db.insert(clientsTable).values({ firstName: "Kali", lastName: "calis-test", trainerId: owner, status: "active" }).returning();
  clientIds.push(c.id);
  await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "male", heightCm: 180, weightKg: 80, experienceLevel: o.level, trainingDuration: o.years ?? (o.level === "Średniozaawansowany" || o.level === "Zaawansowany" ? "4 lata" : "3 miesiące"),
    trainingLocation: o.location, equipment: o.equipment, sessionDuration: "45–60 min", activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny",
    trainingGoal: o.goal ?? "Budowa sylwetki", jumpExperience: o.jump ?? null, injuryStatus: "Brak",
    athleteStatus: o.goal === "Cel sportowy" ? "Tak — amatorsko" : "Nie", sportDiscipline: o.goal === "Cel sportowy" ? "siatkówka" : null, sportPerformanceNeeds: o.goal === "Cel sportowy" ? ["Dynamika"] : [],
  } as never);
  return c.id;
}

async function day(clientId: number, type: string, style?: string, alt = 0) {
  return request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({
    generationId: randomUUID(), generationDayIndex: 0, expectedDayCount: 3, v0SessionType: type, alternativeIndex: alt, ...(style ? { style } : {}),
  });
}
type Out = { id: number; name: string; matchReasons: string[]; prescription?: { sets: number; repsLabel: string; restSeconds: number } };
const plyoBlockOf = (xs: Out[]) => xs.filter((e) => e.matchReasons.includes("Blok pliometryczny"));
const mainOf = (xs: Out[]) => xs.filter((e) => !e.matchReasons.includes("Blok pliometryczny"));

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "calis_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "calis_trainer" } }).returning();
  const [t2] = await db.insert(trainersTable).values({ clerkUserId: "calis_trainer_other" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "calis_trainer_other" } }).returning();
  trainerId = t.id; otherTrainerId = t2.id;
  for (const e of await db.select().from(exercisesTable)) cat.set(e.id, e);
}, 60_000);

afterEach(() => { vi.unstubAllEnvs(); auth.userId = "calis_trainer"; });

afterAll(async () => {
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.trainerId, [trainerId, otherTrainerId]))).map((r) => r.id);
  const ids = [...new Set([...clientIds, ...left])];
  if (ids.length) {
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(inArray(trainersTable.id, [trainerId, otherTrainerId]));
  await pool.end();
});

describe("flag OFF (default): the generator behaves exactly as today", () => {
  it("status says disabled, the days route is 404", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "");
    expect((await request(app).get("/api/calisthenics/status")).body).toEqual({ enabled: false });
    const cid = await mkClient({ level: "Początkujący", location: "Siłownia", equipment: null });
    const r = await request(app).get(`/api/clients/${cid}/plan-draft/calisthenics-days?days=3`);
    expect(r.status).toBe(404); expect(r.body.code).toBe("CALISTHENICS_DISABLED");
  });

  it.each([
    ["gym, intermediate, sport goal", { level: "Średniozaawansowany", location: "Siłownia", equipment: null, goal: "Cel sportowy", jump: "Trochę — robiłem/am okazjonalnie" }],
    ["home, beginner, bands", { level: "Początkujący", location: "Dom", equipment: "Gumy oporowe" }],
    ["outdoor gym, advanced", { level: "Zaawansowany", location: "Siłownia plenerowa", equipment: "Drążek do podciągania, Uchwyty do pompek" }],
  ] as const)("asking for the style changes nothing (%s)", async (_n, opt) => {
    vi.stubEnv("CALISTHENICS_ENABLED", "");
    const cid = await mkClient(opt as Opt);
    for (const t of TYPES) {
      const plain = await day(cid, t);
      const styled = await day(cid, t, "calisthenics");
      expect(styled.status, t).toBe(plain.status);
      expect(JSON.stringify(styled.body.exercises), t).toBe(JSON.stringify(plain.body.exercises));
    }
  }, 120_000);
});

describe("flag ON", () => {
  it("only body weight, bar, parallel bars, rings and bands; about 5 exercises (+ the jump block on the leg day)", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const cid = await mkClient({ level: "Zaawansowany", location: "Siłownia plenerowa", equipment: "Drążek do podciągania, Kółka gimnastyczne, Uchwyty do pompek" });
    let produced = 0;
    for (const t of TYPES) for (const alt of [0, 1]) {
      const r = await day(cid, t, "calisthenics", alt);
      expect([200, 422]).toContain(r.status);
      const xs = (r.body.exercises ?? []) as Out[];
      for (const e of xs) expect(isCalisthenicsExercise(cat.get(e.id)!), `${t}: ${e.name}`).toBe(true);
      expect(mainOf(xs).length, t).toBeLessThanOrEqual(5);
      if (xs.length) produced++;
      if (t !== "legs") expect(plyoBlockOf(xs), `no jumps on ${t}`).toEqual([]);
      else expect(plyoBlockOf(xs).length).toBeLessThanOrEqual(2);
    }
    expect(produced).toBeGreaterThan(2);
  }, 120_000);

  it("the leg day opens with the jump block (2) by the usual rules: advanced + experience \"Tak\" may get high intensity, others never above their lower of the two", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const sport = await mkClient({ level: "Zaawansowany", location: "Dom", equipment: "Drążek do podciągania, Gumy oporowe", goal: "Cel sportowy", jump: "Tak — robię regularnie" });
    const r = await day(sport, "legs", "calisthenics");
    expect(r.status).toBe(200);
    const block = plyoBlockOf(r.body.exercises);
    expect(block.length).toBe(2);
    expect(r.body.exercises.slice(0, 2).map((e: Out) => e.id)).toEqual(block.map((e) => e.id)); // at the start of the day
    // intermediate with "Nie" (and a non-sport goal = "Nie"): landing drill + low intensity only
    for (const o of [
      { level: "Średniozaawansowany", location: "Dom", equipment: "Drążek do podciągania", goal: "Cel sportowy", jump: "Nie — dopiero zaczynam" },
      { level: "Zaawansowany", location: "Dom", equipment: "Drążek do podciągania", goal: "Budowa sylwetki", jump: "Tak — robię regularnie" },
    ] as Opt[]) {
      const res = await day(await mkClient(o), "legs", "calisthenics");
      for (const e of plyoBlockOf(res.body.exercises ?? [])) {
        const ex = cat.get(e.id)!;
        expect(ex.role === "przygotowanie do skoków" || ex.intensity === "niska", e.name).toBe(true);
      }
    }
  }, 120_000);

  it("BA: no jumps, only exercises suitable for the inactive, verified and approved; no hanging, pull-ups or dips", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const cid = await mkClient({ level: "Brak aktywności fizycznej", location: "Dom", equipment: "Gumy oporowe, Drążek do podciągania" });
    for (const t of TYPES) {
      const r = await day(cid, t, "calisthenics");
      expect([200, 422]).toContain(r.status);
      const xs = (r.body.exercises ?? []) as Out[];
      expect(plyoBlockOf(xs)).toEqual([]);
      for (const e of xs) {
        const ex = cat.get(e.id)!;
        expect(ex.suitableForNoActivity, e.name).toBe(true);
        expect(ex.verificationStatus, e.name).toBe("zweryfikowane");
        expect(ex.reviewedByTrainer, e.name).not.toBe(false);
        expect(e.name, e.name).not.toMatch(/podciąganie na drążku|dipy|zwis|muscle-up/i);
      }
    }
  }, 120_000);

  it("P: verified and approved only, lower rungs only (no pull-up on the bar, no dips, no one-arm push-up), jumps = landing drill + low intensity", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const cid = await mkClient({ level: "Początkujący", location: "Siłownia plenerowa", equipment: "Drążek do podciągania, Poręcze, Gumy oporowe" });
    for (const t of TYPES) for (const alt of [0, 1]) {
      const r = await day(cid, t, "calisthenics", alt);
      expect([200, 422]).toContain(r.status);
      for (const e of (r.body.exercises ?? []) as Out[]) {
        const ex = cat.get(e.id)!;
        expect(ex.verificationStatus, e.name).toBe("zweryfikowane");
        expect(ex.reviewedByTrainer, e.name).not.toBe(false);
        expect(ex.learningDifficulty, e.name).not.toBeNull();
        expect(e.name, e.name).not.toMatch(/^Podciąganie na drążku|^Dipy na poręczach|jednorącz|Muscle-up|Pistol|w staniu na rękach/i);
        if (e.matchReasons.includes("Blok pliometryczny")) expect(ex.role === "przygotowanie do skoków" || ex.intensity === "niska", e.name).toBe(true);
      }
    }
  }, 120_000);

  it("health consent withdrawn: no high joint load in the calisthenics plan either (including the jump block)", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const cid = await mkClient({ level: "Zaawansowany", location: "Dom", equipment: "Drążek do podciągania", goal: "Cel sportowy", jump: "Tak — robię regularnie" });
    await db.update(surveysTable).set({ healthConsentStatus: "withdrawn" }).where(eq(surveysTable.clientId, cid));
    for (const t of TYPES) for (const e of ((await day(cid, t, "calisthenics")).body.exercises ?? []) as Out[]) expect(cat.get(e.id)!.jointStress, e.name).not.toBe("Wysokie");
  }, 120_000);

  it("days by station: status enabled, 3 days = bar / parallel bars / legs; no pulling station → warning; foreign client 404", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    expect((await request(app).get("/api/calisthenics/status")).body).toEqual({ enabled: true });
    const withBar = await mkClient({ level: "Początkujący", location: "Dom", equipment: "Drążek do podciągania" });
    const r = await request(app).get(`/api/clients/${withBar}/plan-draft/calisthenics-days?days=3`);
    expect(r.status).toBe(200);
    expect(r.body.days.map((d: { dayType: string }) => d.dayType)).toEqual(["pull", "push", "legs"]);
    expect(r.body.stations).toMatchObject({ bar: true, bands: false });
    const bare = await mkClient({ level: "Początkujący", location: "Dom", equipment: "Brak sprzętu" });
    const r2 = await request(app).get(`/api/clients/${bare}/plan-draft/calisthenics-days?days=3`);
    expect(r2.body.days.map((d: { dayType: string }) => d.dayType)).toEqual(["push", "push", "legs"]);
    expect(r2.body.warnings.length).toBe(1);
    auth.userId = "calis_trainer_other";
    expect((await request(app).get(`/api/clients/${withBar}/plan-draft/calisthenics-days?days=3`)).status).toBe(404);
    expect((await request(app).get(`/api/clients/${withBar}/plan-draft/calisthenics-days?days=0`)).status).toBe(400);
  }, 120_000);

  it("decision 54.2: at home without any equipment a bench / chair exercise may appear (and stays within the style's equipment)", async () => {
    vi.stubEnv("CALISTHENICS_ENABLED", "1");
    const cid = await mkClient({ level: "Zaawansowany", location: "Dom", equipment: "Brak sprzętu" });
    let withBench = 0;
    for (const t of ["push", "upper", "legs", "full_body", "lower"]) for (const alt of [0, 1, 2, 3]) {
      const r = await day(cid, t, "calisthenics", alt);
      for (const e of (r.body.exercises ?? []) as Out[]) {
        expect(isCalisthenicsExercise(cat.get(e.id)!), e.name).toBe(true);
        if ((cat.get(e.id)!.equipment ?? []).includes("Ławka") && !(cat.get(e.id)!.equipment ?? []).includes("Masa własnego ciała")) withBench++;
      }
    }
    expect(withBench).toBeGreaterThan(0);
  }, 180_000);
});
