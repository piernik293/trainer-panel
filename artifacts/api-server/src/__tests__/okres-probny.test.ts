/** Okres próbny trenera: liczenie dni, przejście na Free, brak blokowania danych, przedłużenie przez administratora, flaga beta. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "T", lastName: "T", primaryEmailAddress: { emailAddress: "t@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { getSubscriptionSummary } from "../services/subscriptionService";
import { trialInfo, extendedTrialEnd, TRIAL_DAYS } from "../services/trial";

const ADMIN = "trial_admin", T = "trial_trainer";
const DAY = 86_400_000;
const setEnds = (id: number, d: Date | null) => db.update(trainersTable).set({ trialEndsAt: d }).where(eq(trainersTable.id, id));
let tid = 0;

async function cleanup() {
  const rows = await db.select({ id: trainersTable.id }).from(trainersTable).where(inArray(trainersTable.clerkUserId, [T]));
  for (const r of rows) await db.delete(clientsTable).where(eq(clientsTable.trainerId, r.id));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [T]));
}
beforeAll(async () => {
  process.env["APP_ADMIN_CLERK_IDS"] = ADMIN; delete process.env["BETA_NO_LIMITS"];
  await provisionTrainer(ADMIN); await cleanup();
  tid = (await provisionTrainer(T))!.id;
});
afterAll(async () => { await cleanup(); delete process.env["BETA_NO_LIMITS"]; });

describe("liczenie dni", () => {
  it("14 dni od startu, w górę; po terminie „minął”; brak daty = none", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(trialInfo(new Date(now.getTime() + TRIAL_DAYS * DAY), now)).toMatchObject({ state: "active", daysLeft: 14 });
    expect(trialInfo(new Date(now.getTime() + 3 * DAY - 1000), now).daysLeft).toBe(3);
    expect(trialInfo(new Date(now.getTime() + 1000), now).daysLeft).toBe(1);
    expect(trialInfo(new Date(now.getTime() - 1), now)).toMatchObject({ state: "ended", daysLeft: 0 });
    expect(trialInfo(null, now).state).toBe("none");
  });
  it("przedłużenie: od końca, gdy trwa; od dziś, gdy minął", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    expect(extendedTrialEnd(new Date(now.getTime() + 2 * DAY), now).getTime()).toBe(now.getTime() + 16 * DAY);
    expect(extendedTrialEnd(new Date(now.getTime() - 5 * DAY), now).getTime()).toBe(now.getTime() + 14 * DAY);
  });
});

describe("okres próbny a plan", () => {
  it("nowy trener ma 14 dni i pełny dostęp", async () => {
    const s = await getSubscriptionSummary(tid);
    expect(s.trial).toMatchObject({ state: "active", daysLeft: 14, showEnded: false });
    expect(s.usage.clients.limit).toBeNull();
  });
  it("po 14 dniach: plan Free (3 podopiecznych), dane nietknięte", async () => {
    for (let i = 0; i < 5; i++) await db.insert(clientsTable).values({ trainerId: tid, firstName: `P${i}`, lastName: "Test" });
    await setEnds(tid, new Date(Date.now() - DAY));
    const s = await getSubscriptionSummary(tid);
    expect(s.trial).toMatchObject({ state: "ended", showEnded: true });
    expect(s.plan.code).toBe("FREE");
    expect(s.usage.clients.limit).toBe(3);
    const left = await db.select().from(clientsTable).where(eq(clientsTable.trainerId, tid));
    expect(left).toHaveLength(5); // nic nie usunięte ani zablokowane
    authUser = T;
    const list = await request(app).get("/api/clients");
    expect(list.status).toBe(200);
  });
  it("flaga BETA_NO_LIMITS: bez limitów, komunikat ukryty po stronie panelu (noLimits)", async () => {
    process.env["BETA_NO_LIMITS"] = "1";
    const s = await getSubscriptionSummary(tid);
    expect(s.noLimits).toBe(true);
    expect(s.usage.clients.limit).toBeNull();
    delete process.env["BETA_NO_LIMITS"];
  });
});

describe("administrator", () => {
  it("przedłuża okres próbny o 14 dni; zwykły trener nie może", async () => {
    authUser = T;
    expect((await request(app).post(`/api/admin/trainers/${tid}/trial/extend`)).status).toBeGreaterThanOrEqual(401);
    authUser = ADMIN;
    const r = await request(app).post(`/api/admin/trainers/${tid}/trial/extend`);
    expect(r.status).toBe(200);
    expect(r.body.trial.state).toBe("active");
    expect(r.body.trial.daysLeft).toBe(14);
    const list = await request(app).get("/api/admin/trainers");
    expect(list.body.trainers.find((x: { id: number }) => x.id === tid).trialEndsAt).toBeTruthy();
    expect((await getSubscriptionSummary(tid)).usage.clients.limit).toBeNull();
  });
});
