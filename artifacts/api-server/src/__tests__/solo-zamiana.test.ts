/** Solo: „Zamień na inne” — zamiennik z tego samego silnika i reguł Solo, nie z planu, max 3 na tydzień, tylko własne ćwiczenia. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Ola", lastName: "Zamiana", primaryEmailAddress: { emailAddress: "ola.zamiana@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, workoutSessionsTable, exercisesTable, soloExerciseSwapsTable } from "@workspace/db";
import { swapsUsed } from "../services/soloSwap";

const A = "zamiana_a", B = "zamiana_b";
const ANSWERS = {
  dateOfBirth: "1990-04-04", gender: "Kobieta", heightCm: 170, weightKg: 65, trainingGoal: "Budowa sylwetki", experienceLevel: "Zaawansowany", trainingDuration: "5 lat", injuryStatus: "Brak", healthConsent: true,
  sessionDuration: "60–90 min", desiredWeeklyFrequency: 4, trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", sleepHours: "7–8 godzin", planStylePreference: "Balans efektywności i wygody",
};
async function cleanup() {
  const ids = (await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.clerkUserId, [A, B]))).map((c) => c.id);
  if (ids.length) { await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids)); await db.delete(clientsTable).where(inArray(clientsTable.id, ids)); }
}
const planRows = async (clerk: string) => {
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerk));
  const [plan] = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.clientId, c!.id));
  const days = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan!.id));
  const rows = await db.select().from(workoutPlanExercisesTable).where(inArray(workoutPlanExercisesTable.dayId, days.map((d) => d.id)));
  return { client: c!, rows };
};
beforeAll(async () => { process.env.SOLO_ENABLED = "1"; process.env.BETA_NO_LIMITS = "1"; await cleanup(); });
afterAll(async () => { delete process.env.SOLO_ENABLED; delete process.env.BETA_NO_LIMITS; await cleanup(); });

describe("Solo: Zamień na inne", () => {
  it("zamiennik spoza planu, z reguł Solo; limit 3 na tydzień; cudze ćwiczenie 404", async () => {
    authUser = A; await request(app).get("/api/account/status");
    expect((await request(app).post("/api/solo/survey").send(ANSWERS)).status).toBe(201);
    expect((await request(app).post("/api/solo/plan")).status).toBe(201);
    const { client, rows } = await planRows(A);
    expect((await request(app).get("/api/solo/swaps")).body).toMatchObject({ used: 0, limit: 3, left: 3 });

    const before = new Set(rows.map((r) => r.exerciseId));
    const swapped: number[] = [];
    for (const target of rows) {
      if (swapped.length >= 3) break;
      const r = await request(app).post(`/api/solo/plan-exercises/${target.id}/swap`);
      if (r.status === 422) { expect(r.body.code).toBe("NO_ALTERNATIVE"); continue; } // brak bezpiecznego zamiennika to poprawny wynik
      expect(r.status).toBe(200);
      swapped.push(target.id);
      expect(before.has(r.body.exercise.id)).toBe(false); // inny niż ćwiczenia planu
      const [now] = await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.id, target.id));
      expect(now!.exerciseId).toBe(r.body.exercise.id);
      const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, r.body.exercise.id));
      expect(ex!.reviewedByTrainer).toBe(true); expect(ex!.hidden).toBeFalsy(); // reguła Solo: tylko zatwierdzone, widoczne
      before.add(r.body.exercise.id);
    }
    expect(swapped.length).toBeGreaterThan(0);
    const q = await swapsUsed(client.id);
    expect(q.used).toBe(swapped.length);

    // dobijamy do limitu 3 wpisami i sprawdzamy odmowę
    for (let i = q.used; i < 3; i++) await db.insert(soloExerciseSwapsTable).values({ clientId: client.id, fromExerciseId: 1, toExerciseId: 2 });
    const target = rows[rows.length - 1]!;
    const blocked = await request(app).post(`/api/solo/plan-exercises/${target.id}/swap`);
    expect([blocked.status, blocked.body.code]).toEqual([429, "SWAP_LIMIT"]);
    expect(blocked.body.error).toMatch(/3 zamiany na tydzień/);
    // po tygodniu limit się odnawia
    expect((await swapsUsed(client.id, new Date(Date.now() + 8 * 86_400_000))).used).toBe(0);

    // inna osoba nie może zamienić cudzego ćwiczenia ani trener-konto bez planu
    authUser = B; await request(app).get("/api/account/status");
    expect((await request(app).post(`/api/solo/plan-exercises/${target.id}/swap`)).status).toBe(404);
    authUser = null;
    expect((await request(app).post(`/api/solo/plan-exercises/${target.id}/swap`)).status).toBe(401);
  });
});
