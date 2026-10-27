/** Wywiad wysłany do trenera, który osiągnął limit klientów: osoba dostaje prosty komunikat (nie o pakiecie trenera), kod błędu zostaje. */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveyInvitesTable, trainerSubscriptionsTable } from "@workspace/db";

const T = "public_limit_trainer";
let trainerId = 0;
const emails = ["pl-limit-1@example.invalid", "pl-limit-2@example.invalid", "pl-limit-3@example.invalid", "pl-limit-4@example.invalid"];

beforeAll(async () => {
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
  trainerId = (await db.insert(trainersTable).values({ clerkUserId: T }).returning())[0]!.id;
  await db.insert(trainerSubscriptionsTable).values({ trainerId, planCode: "FREE", status: "active" }).onConflictDoNothing();
  for (const e of emails.slice(0, 3)) await db.insert(clientsTable).values({ firstName: "Limit", lastName: "Test", email: e, trainerId });
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.email, emails));
  await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("limit klientów trenera a wywiad", () => {
  it("409 z kodem limitu i prostym komunikatem dla osoby wypełniającej", async () => {
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(surveyInvitesTable).values({ trainerId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await request(app).post(`/api/public/survey/${token}`).send({
      firstName: "Limit", lastName: "Test", email: emails[3], dateOfBirth: "1990-05-05", gender: "Kobieta", experienceLevel: "Początkujący", trainingDuration: "6 miesięcy",
      sessionDuration: "45–60 min", desiredWeeklyFrequency: 3, trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", heightCm: 170, weightKg: 65, injuryStatus: "Brak",
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(409);
    expect(res.body.error).toMatch(/Napisz do swojego trenera/);
    expect(res.body.error).not.toMatch(/limit|plan|Free|pakiet/i);
    expect(typeof res.body.code).toBe("string");
  });
});
