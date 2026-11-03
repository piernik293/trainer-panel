/** Metody intensyfikacji (docs/METODY.md) w prawdziwym przepływie Solo: bez flagi nic się nie zmienia; z flagą zapisują się metody, para jest obok siebie. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Ola", lastName: "Metody", primaryEmailAddress: { emailAddress: "ola.metody@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable } from "@workspace/db";

const P = "metody_person_a", Q = "metody_person_b";
const ANSWERS = {
  dateOfBirth: "1990-04-04", gender: "Kobieta", heightCm: 170, weightKg: 65, trainingGoal: "Budowa sylwetki", experienceLevel: "Zaawansowany", trainingDuration: "5 lat", injuryStatus: "Brak", healthConsent: true,
  sessionDuration: "60–90 min", desiredWeeklyFrequency: 4, trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", sleepHours: "7–8 godzin", planStylePreference: "Balans efektywności i wygody",
  preferredMethods: ["Superserie", "Drop sety"],
};
async function cleanup() {
  const ids = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.clerkUserId, [P, Q]))).map((c) => c.id);
  if (ids.length) { await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids)); await db.delete(clientsTable).where(inArray(clientsTable.id, ids)); }
}
async function methodRows(clerk: string) {
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerk));
  const [plan] = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c!.id));
  const days = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan!.id));
  const rows = await db.select().from(workoutPlanExercisesTable).where(inArray(workoutPlanExercisesTable.dayId, days.map((d) => d.id)));
  return { days, rows };
}
beforeAll(async () => { process.env.SOLO_ENABLED = "1"; process.env.BETA_NO_LIMITS = "1"; await cleanup(); });
afterAll(async () => { delete process.env.SOLO_ENABLED; delete process.env.BETA_NO_LIMITS; delete process.env.METHODS_V2_ENABLED; await cleanup(); });

describe("metody w planie Solo", () => {
  it("status flagi", async () => {
    delete process.env.METHODS_V2_ENABLED;
    expect((await request(app).get("/api/methods/status")).body).toEqual({ enabled: false });
    process.env.METHODS_V2_ENABLED = "1";
    expect((await request(app).get("/api/methods/status")).body).toEqual({ enabled: true });
  });
  it("bez flagi: wywiad zapisuje wybór, ale plan nie ma żadnych metod", async () => {
    delete process.env.METHODS_V2_ENABLED;
    authUser = P;
    await request(app).get("/api/account/status");
    expect((await request(app).post("/api/solo/survey").send(ANSWERS)).status).toBe(201);
    const r = await request(app).post("/api/solo/plan"); expect([201]).toContain(r.status);
    const { rows } = await methodRows(P);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.method == null && x.methodGroup == null)).toBe(true);
  });
  it("z flagą: Zaawansowany z wyborem Superserie + Drop sety dostaje metody, para obok siebie, najwyżej 2 w dniu, tylko superserie i drop set (Solo)", async () => {
    process.env.METHODS_V2_ENABLED = "1";
    authUser = Q;
    await request(app).get("/api/account/status");
    expect((await request(app).post("/api/solo/survey").send(ANSWERS)).status).toBe(201);
    expect((await request(app).post("/api/solo/plan")).status).toBe(201);
    const { days, rows } = await methodRows(Q);
    const withMethod = rows.filter((x) => x.method);
    expect(withMethod.length).toBeGreaterThan(0);
    for (const x of withMethod) { expect(["superserie", "drop_set"]).toContain(x.method); expect((x.methodNote ?? "").length).toBeGreaterThan(10); }
    for (const d of days) {
      const dayRows = rows.filter((x) => x.dayId === d.id).sort((a, b) => a.orderInDay - b.orderInDay);
      expect(dayRows.filter((x) => x.method).length).toBeLessThanOrEqual(2);
      const groups = new Set(dayRows.map((x) => x.methodGroup).filter((g): g is number => g != null));
      for (const g of groups) {
        const idx = dayRows.map((x, i) => (x.methodGroup === g ? i : -1)).filter((i) => i >= 0);
        expect(idx).toHaveLength(2); expect(idx[1]! - idx[0]!).toBe(1); // para stoi obok siebie
      }
    }
  });
});
