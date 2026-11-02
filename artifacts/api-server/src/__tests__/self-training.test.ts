/** „Mój trening” (trener jako własny podopieczny): powstaje przy akceptacji i pierwszym wejściu, migracja dla obecnych trenerów, izolacja, bez limitu i bez odłączenia. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Tr", lastName: "Ener", primaryEmailAddress: { emailAddress: "self.training@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, trainerApplicationsTable, trainerSubscriptionsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { runWithSubscriptionLimit, isSubscriptionLimitError } from "../services/subscriptionService";

const ADMIN = "selft_admin", NEWBIE = "selft_newbie", LEGACY = "selft_legacy_trainer", OTHER = "selft_other_trainer", HASCLIENT = "selft_trainer_with_coach";
const USERS = [ADMIN, NEWBIE, LEGACY, OTHER, HASCLIENT];
const EMAILS = ["selft-extra-1@example.invalid", "selft-extra-2@example.invalid", "selft-extra-3@example.invalid"];
const as = (u: string | null) => { authUser = u; };
const selfOf = async (clerk: string) => (await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerk)))[0];

beforeAll(async () => {
  process.env.APP_ADMIN_CLERK_IDS = ADMIN;
  delete process.env.BETA_NO_LIMITS;
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, USERS));
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, USERS));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, USERS));
  await provisionTrainer(ADMIN);
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, USERS));
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, USERS));
  const ts = await db.select({ id: trainersTable.id }).from(trainersTable).where(inArray(trainersTable.clerkUserId, USERS));
  if (ts.length) await db.delete(trainerSubscriptionsTable).where(inArray(trainerSubscriptionsTable.trainerId, ts.map((t) => t.id)));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, USERS));
});

describe("powstawanie profilu „Mój trening”", () => {
  it("akceptacja wniosku tworzy go od razu: ten sam trener, to samo konto, bez drugiego trenera", async () => {
    as(NEWBIE); expect((await request(app).post("/api/trainer-applications").send({ note: "x" })).status).toBe(201);
    as(ADMIN);
    const list = await request(app).get("/api/admin/trainer-applications?status=pending");
    const mine = list.body.applications.find((a: { name: string | null }) => a.name === "Tr Ener");
    expect(mine).toBeTruthy();
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/accept`)).status).toBe(200);
    const [tr] = await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, NEWBIE));
    const self = await selfOf(NEWBIE);
    expect(self).toMatchObject({ firstName: "Mój trening", trainerId: tr!.id, clerkUserId: NEWBIE });
  });
  it("pierwsze wejście trenera do panelu też go tworzy, bez duplikatów", async () => {
    await provisionTrainer(LEGACY);
    as(LEGACY);
    expect((await request(app).post("/api/trainer/profile")).status).toBe(200);
    expect((await request(app).post("/api/trainer/profile")).status).toBe(200);
    expect(await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, LEGACY))).toHaveLength(1);
  });
  it("migracja 0064: obecny trener bez profilu dostaje go; powtórne uruchomienie nic nie dubluje; trenera z kontem podopiecznego u innego trenera nie rusza", async () => {
    const mig = readFileSync(join(__dirname, "../../../../lib/db/migrations/0064_moj_trening.sql"), "utf8");
    const t1 = (await provisionTrainer(OTHER))!, t2 = (await provisionTrainer(HASCLIENT))!;
    await db.insert(clientsTable).values({ firstName: "Pod", lastName: "Trenerem", email: EMAILS[0]!, trainerId: t1.id, clerkUserId: HASCLIENT });
    // Migracja dotyka wszystkich trenerów w bazie, więc uruchamiamy ją w transakcji, którą cofamy — inne testy nie dostają przy tym cudzych profili.
    await db.transaction(async (tx) => {
      for (let i = 0; i < 2; i++) await tx.execute(sql.raw(mig));
      const mine = await tx.select().from(clientsTable).where(eq(clientsTable.clerkUserId, OTHER));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ firstName: "Mój trening", trainerId: t1.id });
      const [coached] = await tx.select().from(clientsTable).where(eq(clientsTable.clerkUserId, HASCLIENT));
      expect(coached).toMatchObject({ firstName: "Pod", trainerId: t1.id }); // prowadzi go inny trener — bez zmian
      tx.rollback();
    }).catch((e: unknown) => { if (!(e instanceof Error && /rollback/i.test(e.message))) throw e; });
    expect(t2.id).not.toBe(t1.id);
    expect(await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, OTHER))).toHaveLength(0);
  });
});

describe("izolacja i zasady", () => {
  it("inny trener nie widzi cudzego „Mojego treningu” (lista i szczegóły)", async () => {
    const self = (await selfOf(NEWBIE))!;
    as(OTHER);
    const list = await request(app).get("/api/clients");
    expect((list.body as Array<{ id: number }>).some((c) => c.id === self.id)).toBe(false);
    expect((await request(app).get(`/api/clients/${self.id}`)).status).toBe(404);
    as(NEWBIE);
    expect((await request(app).get(`/api/clients/${self.id}`)).status).toBe(200);
    expect(((await request(app).get("/api/clients")).body as Array<{ id: number }>).some((c) => c.id === self.id)).toBe(true);
  });
  it("nie da się go odłączyć (trener ani portal) ani usunąć", async () => {
    const self = (await selfOf(NEWBIE))!;
    as(NEWBIE);
    const a = await request(app).post(`/api/clients/${self.id}/disconnect`); expect([a.status, a.body.code]).toEqual([409, "SELF_TRAINING"]);
    const b = await request(app).post("/api/client-portal/disconnect"); expect([b.status, b.body.code]).toEqual([409, "SELF_TRAINING"]);
    expect((await request(app).delete(`/api/clients/${self.id}`)).status).toBe(409);
    expect((await selfOf(NEWBIE))!.trainerId).toBe(self.trainerId);
  });
  it("nie liczy się do limitu klientów planu Free (3 zwykłych klientów mieści się obok niego)", async () => {
    const [tr] = await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, NEWBIE));
    await db.insert(trainerSubscriptionsTable).values({ trainerId: tr!.id, planCode: "FREE", status: "active" }).onConflictDoNothing();
    for (const email of EMAILS) await runWithSubscriptionLimit(tr!.id, "clients", async (tx) => { await tx.insert(clientsTable).values({ firstName: "Zwykły", lastName: "Klient", email, trainerId: tr!.id }); });
    await expect(runWithSubscriptionLimit(tr!.id, "clients", async () => "ok")).rejects.toSatisfy(isSubscriptionLimitError);
  });
  it("pulpit nie liczy własnego profilu jako podopiecznego", async () => {
    as(LEGACY);
    const r = await request(app).get("/api/dashboard/summary");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("Mój trening");
  });
  it("trener widzi przełącznik: /account/home i /account/roles mówią isClient", async () => {
    as(NEWBIE);
    expect((await request(app).get("/api/account/home")).body).toMatchObject({ destination: "panel", isTrainer: true, isClient: true });
    expect((await request(app).get("/api/account/roles")).body).toMatchObject({ isTrainer: true, isClient: true });
  });
});
