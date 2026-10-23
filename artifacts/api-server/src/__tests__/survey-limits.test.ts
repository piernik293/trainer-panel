/**
 * The same body-data limits as the interview screens (lib/survey-config), enforced by the API:
 * age 16–90, height 120–230 cm, weight 35–250 kg; "Brak sprzętu" excludes other equipment.
 * Real database; every accepted case consumes its own invitation.
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
import { db, pool, trainersTable, clientsTable, surveyInvitesTable } from "@workspace/db";

const T = "survey_limits_trainer";
let trainerId = 0;
const emails: string[] = [];
let seq = 0;

beforeAll(async () => {
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
  const [t] = await db.insert(trainersTable).values({ clerkUserId: T }).returning();
  trainerId = t!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.email, emails));
  await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

async function submit(over: Record<string, unknown>) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(surveyInvitesTable).values({
    trainerId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000),
  });
  const email = `limits-${Date.now()}-${++seq}@example.invalid`;
  emails.push(email);
  const res = await request(app).post(`/api/public/survey/${token}`).send({
    firstName: "Test", lastName: "Limity", email, dateOfBirth: "1990-05-05", gender: "Kobieta", injuryStatus: "Brak",
    trainingGoal: "Budowa sylwetki", experienceLevel: "Początkujący", sessionDuration: "45–60 min", desiredWeeklyFrequency: 3,
    trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", heightCm: 170, weightKg: 65, ...over,
  });
  // Accepted cases create a client; remove it at once so the plan's client limit is never reached.
  if (res.status === 201) await db.delete(clientsTable).where(eq(clientsTable.email, email));
  return res;
}

const yearsAgo = (years: number, dayOffset = 0) => {
  const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
};

describe("POST /public/survey/:token — body data limits", () => {
  it("birth date: exactly 16 and exactly 90 are accepted", async () => {
    expect((await submit({ dateOfBirth: yearsAgo(16) })).status).toBe(201);
    expect((await submit({ dateOfBirth: yearsAgo(90) })).status).toBe(201);
  });
  it("birth date: under 16, over 90 and the future are rejected with Polish messages", async () => {
    const young = await submit({ dateOfBirth: yearsAgo(16, 1) });
    expect(young.status).toBe(400);
    expect(young.body.error).toBe("Wiek musi mieścić się między 16 a 90 lat. Sprawdź datę urodzenia.");
    expect((await submit({ dateOfBirth: yearsAgo(91) })).status).toBe(400);
    expect((await submit({ dateOfBirth: "2999-01-01" })).status).toBe(400);
  });
  it("height 120–230", async () => {
    expect((await submit({ heightCm: 120 })).status).toBe(201);
    expect((await submit({ heightCm: 230 })).status).toBe(201);
    const low = await submit({ heightCm: 119 });
    expect(low.status).toBe(400);
    expect(low.body.error).toBe("Wzrost musi być między 120 a 230 cm.");
    expect((await submit({ heightCm: 231 })).status).toBe(400);
  });
  it("weight 35–250", async () => {
    expect((await submit({ weightKg: 35 })).status).toBe(201);
    expect((await submit({ weightKg: 250 })).status).toBe(201);
    const low = await submit({ weightKg: 34.9 });
    expect(low.status).toBe(400);
    expect(low.body.error).toBe("Waga musi być między 35 a 250 kg.");
    expect((await submit({ weightKg: 251 })).status).toBe(400);
  });
  it("height and weight are required", async () => {
    expect((await submit({ heightCm: undefined })).status).toBe(400);
    expect((await submit({ weightKg: undefined })).status).toBe(400);
  });
  it("'Brak sprzętu' together with other equipment is rejected; alone it is fine", async () => {
    const bad = await submit({ trainingLocation: "Dom", equipment: "Hantle, Brak sprzętu" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("Brak sprzętu");
    expect((await submit({ trainingLocation: "Dom", equipment: "Brak sprzętu, Piłka lecznicza" })).status).toBe(400);
    expect((await submit({ trainingLocation: "Dom", equipment: "Brak sprzętu" })).status).toBe(201);
    expect((await submit({ trainingLocation: "Dom", equipment: "Hantle, Gumy oporowe" })).status).toBe(201);
  });
});

describe("POST /public/survey/:token — priority muscle groups by effective level", () => {
  const three = { priorityMuscle1: "Barki", priorityMuscle2: "Pośladki", priorityMuscle3: "Plecy" };
  it("beginners: at most one group (400 with a Polish message), one is fine", async () => {
    const bad = await submit({ experienceLevel: "Początkujący", ...three });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Przy tym poziomie możesz wskazać najwyżej jedną partię priorytetową.");
    expect((await submit({ experienceLevel: "Brak aktywności fizycznej", priorityMuscle1: "Barki", priorityMuscle2: "Plecy" })).status).toBe(400);
    expect((await submit({ experienceLevel: "Początkujący", priorityMuscle1: "Barki" })).status).toBe(201);
    expect((await submit({ experienceLevel: "Początkujący" })).status).toBe(201);
  });
  it("the effective level counts: intermediate with < 2 years is a beginner here too", async () => {
    expect((await submit({ experienceLevel: "Średniozaawansowany", trainingDuration: "1 rok", ...three })).status).toBe(400);
    expect((await submit({ experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata", ...three })).status).toBe(201);
    expect((await submit({ experienceLevel: "Zaawansowany", trainingDuration: "5 lat", ...three })).status).toBe(201);
  });
});
