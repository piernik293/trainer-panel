/**
 * Odpowiedź o doświadczeniu ze skokami (blok 5b) jest zapisywana tylko przy celu „Cel sportowy”;
 * przy innych celach API ją odrzuca (zapisuje null), nawet gdy przyszła w zgłoszeniu. Baza testowa.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, surveyInvitesTable } from "@workspace/db";

const T = "survey_jump_experience_trainer";
let trainerId = 0;
const emails: string[] = [];
let seq = 0;

beforeAll(async () => {
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
  trainerId = (await db.insert(trainersTable).values({ clerkUserId: T }).returning())[0]!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.email, emails));
  await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

async function submitAndRead(over: Record<string, unknown>) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(surveyInvitesTable).values({ trainerId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) });
  const email = `jump-${Date.now()}-${++seq}@example.invalid`;
  emails.push(email);
  const res = await request(app).post(`/api/public/survey/${token}`).send({
    firstName: "Test", lastName: "Skoki", email, dateOfBirth: "1990-05-05", gender: "Mężczyzna", injuryStatus: "Brak",
    experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata", sessionDuration: "45–60 min", desiredWeeklyFrequency: 3,
    trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", heightCm: 180, weightKg: 80, ...over,
  });
  expect(res.status).toBe(201);
  const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.email, email));
  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.clientId, client!.id));
  await db.delete(clientsTable).where(eq(clientsTable.email, email));
  return survey!;
}

describe("jump_experience w wywiadzie", () => {
  it("Cel sportowy: odpowiedź zapisana", async () => {
    const s = await submitAndRead({ trainingGoal: "Cel sportowy", athleteStatus: "Tak — amatorsko", jumpExperience: "Trochę — robiłem/am okazjonalnie" });
    expect(s.jumpExperience).toBe("Trochę — robiłem/am okazjonalnie");
  });
  it("Cel sportowy bez odpowiedzi: null (generator traktuje jak „Nie”)", async () => {
    expect((await submitAndRead({ trainingGoal: "Cel sportowy", athleteStatus: "Tak — amatorsko" })).jumpExperience).toBeNull();
  });
  it("inny cel: odpowiedź odrzucona", async () => {
    for (const trainingGoal of ["Budowa sylwetki", "Poprawa sprawności", "Poprawa kondycji"]) {
      expect((await submitAndRead({ trainingGoal, jumpExperience: "Tak — robię regularnie" })).jumpExperience, trainingGoal).toBeNull();
    }
  });
});
