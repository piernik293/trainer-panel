/** Wnioski o konto trenera (blok 6): ponowny wniosek po 14 dniach, akceptacja nadaje rolę, przełącznik automatyczny domyślnie wyłączony, izolacja. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, trainerApplicationsTable, appSettingsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { REAPPLY_AFTER_DAYS, canApplyNow, nextApplyAt } from "../services/trainerApplications";

const ADMIN = "tapp_test_admin", TR = "tapp_test_trainer", P1 = "tapp_test_person_1", P2 = "tapp_test_person_2";
const USERS = [P1, P2];
const as = (u: string | null) => { authUser = u; };

async function cleanup() {
  await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, USERS));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, USERS));
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, USERS));
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, "trainer_auto_accept"));
}
beforeAll(async () => {
  process.env.APP_ADMIN_CLERK_IDS = ADMIN;
  await provisionTrainer(ADMIN); await provisionTrainer(TR);
});
beforeEach(cleanup);
afterAll(cleanup);

const mkClient = async (clerk: string, name: string) => db.insert(clientsTable).values({ firstName: name, lastName: "", trainerId: null, clerkUserId: clerk });

describe("czysta logika", () => {
  it("14 dni po odrzuceniu", () => {
    const rejected = new Date("2026-10-01T10:00:00Z");
    expect(REAPPLY_AFTER_DAYS).toBe(14);
    expect(canApplyNow(rejected, new Date("2026-10-14T10:00:00Z"))).toBe(false);
    expect(canApplyNow(rejected, new Date("2026-10-15T10:00:00Z"))).toBe(true);
    expect(canApplyNow(null)).toBe(true);
    expect(nextApplyAt(rejected).toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });
});

describe("wniosek i decyzja", () => {
  it("bez sesji 401; trener nie może składać wniosku", async () => {
    as(null);
    expect((await request(app).post("/api/trainer-applications").send({})).status).toBe(401);
    as(TR);
    const r = await request(app).post("/api/trainer-applications").send({});
    expect(r.status).toBe(409); expect(r.body.code).toBe("ALREADY_TRAINER");
  });

  it("osoba bez roli trenera: wniosek oczekuje, nie ma dostępu do panelu trenera; drugi wniosek 409", async () => {
    await mkClient(P1, "Ola");
    as(P1);
    expect((await request(app).get("/api/clients")).status).toBe(403);
    const r = await request(app).post("/api/trainer-applications").send({ note: "Prowadzę kilka osób" });
    expect(r.status).toBe(201); expect(r.body.status).toBe("pending");
    expect((await request(app).post("/api/trainer-applications").send({})).body.code).toBe("PENDING");
    expect((await request(app).get("/api/clients")).status).toBe(403); // wniosek sam niczego nie daje
    const roles = (await request(app).get("/api/account/roles")).body;
    expect(roles).toMatchObject({ isTrainer: false, isClient: true, application: { status: "pending" } });
  });

  it("lista i decyzje tylko dla administratora", async () => {
    await mkClient(P1, "Ola");
    as(P1); await request(app).post("/api/trainer-applications").send({});
    for (const u of [P1, TR]) {
      as(u);
      expect((await request(app).get("/api/admin/trainer-applications")).status, u).toBe(403);
      expect((await request(app).get("/api/admin/settings")).status).toBe(403);
    }
    as(ADMIN);
    const list = (await request(app).get("/api/admin/trainer-applications?status=pending")).body.applications;
    const mine = list.find((a: { name: string }) => a.name === "Ola");
    expect(mine).toBeTruthy();
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/accept`)).status).toBe(200);
    // po akceptacji osoba ma rolę trenera i nadal jest podopiecznym (przełącznik Mój trening / Podopieczni)
    as(P1);
    expect((await request(app).get("/api/clients")).status).toBe(200);
    expect((await request(app).get("/api/account/roles")).body).toMatchObject({ isTrainer: true, isClient: true });
    // ponowna decyzja o tym samym wniosku nie istnieje
    as(ADMIN);
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/reject`)).status).toBe(404);
  });

  it("odrzucenie: ponowny wniosek dopiero po 14 dniach", async () => {
    await mkClient(P2, "Ewa");
    as(P2); await request(app).post("/api/trainer-applications").send({});
    as(ADMIN);
    const id = (await request(app).get("/api/admin/trainer-applications?status=pending")).body.applications.find((a: { name: string }) => a.name === "Ewa").id;
    expect((await request(app).post(`/api/admin/trainer-applications/${id}/reject`)).status).toBe(200);
    as(P2);
    expect((await request(app).get("/api/clients")).status).toBe(403);
    const early = await request(app).post("/api/trainer-applications").send({});
    expect(early.status).toBe(409); expect(early.body.code).toBe("REAPPLY_LATER");
    expect((await request(app).get("/api/account/roles")).body.application).toMatchObject({ status: "rejected", canApply: false });
    // 15 dni później
    await db.update(trainerApplicationsTable).set({ decidedAt: new Date(Date.now() - 15 * 86_400_000) }).where(eq(trainerApplicationsTable.id, id));
    const again = await request(app).post("/api/trainer-applications").send({});
    expect(again.status).toBe(201); expect(again.body.status).toBe("pending");
  });

  it("przełącznik automatyczny jest domyślnie wyłączony; po włączeniu wniosek przechodzi od razu", async () => {
    as(ADMIN);
    expect((await request(app).get("/api/admin/settings")).body.autoAccept).toBe(false);
    await mkClient(P1, "Ola");
    as(P1);
    expect((await request(app).post("/api/trainer-applications").send({})).body.status).toBe("pending");
    await db.delete(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, P1));
    as(ADMIN);
    expect((await request(app).put("/api/admin/settings").send({ autoAccept: true })).body.autoAccept).toBe(true);
    as(P1);
    expect((await request(app).post("/api/trainer-applications").send({})).body.status).toBe("accepted");
    expect((await request(app).get("/api/clients")).status).toBe(200);
    as(ADMIN);
    await request(app).put("/api/admin/settings").send({ autoAccept: false });
  });
});
