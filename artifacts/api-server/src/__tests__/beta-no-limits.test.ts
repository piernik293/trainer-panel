/** Beta bez limitów (D1): flaga BETA_NO_LIMITS domyślnie wyłączona; włączona znosi limity klientów, własnych ćwiczeń i generatora. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "ktos.beta@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, trainerSubscriptionsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { betaNoLimits, runWithSubscriptionLimit, isSubscriptionLimitError } from "../services/subscriptionService";

const TR = "beta_nolimits_trainer";
const EMAILS = [1, 2, 3].map((i) => `beta-nolimits-${i}@example.invalid`);
let trainerId: number;
const as = (u: string | null) => { authUser = u; };

beforeAll(async () => {
  delete process.env.BETA_NO_LIMITS;
  const t = (await provisionTrainer(TR))!; trainerId = t.id;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.insert(trainerSubscriptionsTable).values({ trainerId, planCode: "FREE", status: "active" }).onConflictDoNothing();
  for (const email of EMAILS) await db.insert(clientsTable).values({ firstName: "Beta", lastName: "Limit", email, trainerId });
});
afterAll(async () => {
  delete process.env.BETA_NO_LIMITS;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(trainerSubscriptionsTable).where(eq(trainerSubscriptionsTable.trainerId, trainerId));
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
});

describe("flaga", () => {
  it("domyślnie wyłączona", () => {
    expect(betaNoLimits({})).toBe(false);
    expect(betaNoLimits({ BETA_NO_LIMITS: "0" })).toBe(false);
    expect(betaNoLimits({ BETA_NO_LIMITS: "1" })).toBe(true);
  });
});

describe("bez flagi: limity planu Free działają jak dotąd", () => {
  it("czwarty klient jest blokowany, podsumowanie pokazuje limity", async () => {
    await expect(runWithSubscriptionLimit(trainerId, "clients", async () => "ok")).rejects.toSatisfy(isSubscriptionLimitError);
    as(TR);
    const r = await request(app).get("/api/subscription/summary");
    expect(r.status).toBe(200);
    expect(r.body.noLimits).toBe(false);
    expect(r.body.usage.clients).toMatchObject({ limit: 3, used: 3, atLimit: true });
    expect(r.body.availablePlans.length).toBeGreaterThan(1);
  });
});

describe("z flagą BETA_NO_LIMITS=1: bez limitów", () => {
  it("czwarty klient przechodzi, podsumowanie bez limitów i bez planów do kupienia", async () => {
    process.env.BETA_NO_LIMITS = "1";
    await expect(runWithSubscriptionLimit(trainerId, "clients", async () => "ok")).resolves.toBe("ok");
    await expect(runWithSubscriptionLimit(trainerId, "planGenerations", async () => "ok")).resolves.toBe("ok");
    await expect(runWithSubscriptionLimit(trainerId, "customExercises", async () => "ok")).resolves.toBe("ok");
    as(TR);
    const r = await request(app).get("/api/subscription/summary");
    expect(r.body.noLimits).toBe(true);
    expect(r.body.usage.clients).toMatchObject({ limit: null, atLimit: false });
    expect(r.body.usage.planGenerations).toMatchObject({ limit: null, atLimit: false });
    expect(r.body.availablePlans).toEqual([]);
    delete process.env.BETA_NO_LIMITS;
  });
});
