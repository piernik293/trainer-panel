/** Decision 51 on the real route: a short day carries a plain-words note, a refused day carries code + the same kind of message (never the engine's text). */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "shortage_trainer" }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable } from "@workspace/db";

let trainerId = 0;
const clientIds: number[] = [];
async function mk(level: string, location: string, equipment: string | null, healthLimitations: string | null = null) {
  const [c] = await db.insert(clientsTable).values({ firstName: "Brak", lastName: "shortage-test", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1990-01-01", gender: "male", heightCm: 180, weightKg: 80, experienceLevel: level, trainingDuration: level === "Początkujący" ? "3 miesiące" : "4 lata",
    trainingLocation: location, equipment, sessionDuration: "45–60 min", activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny",
    trainingGoal: "Budowa sylwetki", injuryStatus: healthLimitations ? "Tak" : "Brak", healthLimitations,
  } as never);
  return c.id;
}
const day = (clientId: number, type: string, alt = 0) => request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({ generationId: randomUUID(), generationDayIndex: 0, expectedDayCount: 3, v0SessionType: type, alternativeIndex: alt });

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "shortage_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "shortage_trainer" } }).returning();
  trainerId = t.id;
}, 60_000);
afterAll(async () => {
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId))).map((r) => r.id);
  const ids = [...new Set([...clientIds, ...left])];
  if (ids.length) { await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids)); await db.delete(clientsTable).where(inArray(clientsTable.id, ids)); }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("decision 51: minimum 3 exercises, message in plain words", () => {
  it("home without equipment, pull day: either refused with the owner's wording or a short day with the same wording in the note", async () => {
    const r = await day(await mk("Średniozaawansowany", "Dom", "Brak sprzętu"), "pull");
    if (r.status === 422) {
      expect(r.body.code).toBe("TOO_FEW_EXERCISES");
      expect(r.body.error).toBe("Mało ćwiczeń na plecy bez sprzętu. Dodaj gumę albo drążek, a plan będzie pełniejszy.");
      expect(r.body.exercises).toEqual([]);
    } else {
      expect(r.status).toBe(200);
      expect(r.body.exercises.length).toBeGreaterThanOrEqual(3);
      if (r.body.exercises.length < 4) expect(r.body.limitedDayNote).toContain("Mało ćwiczeń na plecy bez sprzętu");
    }
    expect(String(r.body.error ?? "")).not.toMatch(/V0 PULL|minimum \d exercises/); // the trainer never sees the engine text (it stays in engineError)
  }, 60_000);

  it("a refusal never shows the engine's text; a 3-exercise day appears among bare-equipment days and carries the note", async () => {
    const cid = await mk("Początkujący", "Dom", "Gumy oporowe");
    let short = 0, refused = 0;
    for (const t of ["pull", "push", "legs", "upper", "lower", "full_body"]) for (const alt of [0, 1]) {
      const r = await day(cid, t, alt);
      if (r.status === 422) { refused++; expect(r.body.code).toBe("TOO_FEW_EXERCISES"); expect(r.body.error).toMatch(/Dodaj|wybierz|zmień/i); expect(r.body.error).not.toMatch(/V0|minimum/); }
      else if (r.body.exercises.length === 3) { short++; expect(r.body.limitedDayNote).toMatch(/^Ten dzień ma tylko 3 ćwiczenia\. /); }
      else expect(r.body.limitedDayNote).toBeUndefined();
    }
    expect(short + refused).toBeGreaterThan(0); // bare equipment + beginner: the pool is thin, so the test is not vacuous
  }, 120_000);

  it("a normal gym day has no note", async () => {
    const r = await day(await mk("Średniozaawansowany", "Siłownia", null), "upper");
    expect(r.status).toBe(200);
    expect(r.body.exercises.length).toBeGreaterThanOrEqual(4);
    expect(r.body.limitedDayNote).toBeUndefined();
  }, 60_000);
});
