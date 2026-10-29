/** Nowe konto bez roli trenera i bez klienta (B1/B3): status konta nie jest błędem, wniosek zapisuje imię i e-mail z konta, rola nie powstaje bez akceptacji. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ firstName: "Ola", lastName: "Nowak", primaryEmailAddress: { emailAddress: "ola.access@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, trainersTable, trainerApplicationsTable } from "@workspace/db";

const NEW = "access_req_new_person";
afterAll(async () => { await db.delete(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, NEW)); });

describe("konto bez trenera i bez klienta", () => {
  it("/account/status: 200 i „niepołączone” zamiast 404", async () => {
    authUser = NEW;
    const r = await request(app).get("/api/account/status");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ linked: false, trainerName: null, pendingTrainerName: null });
  });
  it("wniosek: zapisuje imię i e-mail z konta, a konto nadal nie jest trenerem", async () => {
    authUser = NEW;
    expect((await request(app).post("/api/trainer-applications").send({ note: "Chcę prowadzić klientów" })).status).toBe(201);
    const [row] = await db.select().from(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, NEW));
    expect(row).toMatchObject({ displayName: "Ola Nowak", email: "ola.access@example.invalid", status: "pending" });
    const profile = await request(app).post("/api/trainer/profile");
    expect(profile.status).toBe(403);
    expect(await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, NEW))).toHaveLength(0);
    expect((await request(app).get("/api/account/roles")).body.application.status).toBe("pending");
  });
  it("drugi wniosek: 409 oczekuje", async () => {
    authUser = NEW;
    expect((await request(app).post("/api/trainer-applications").send({})).status).toBe(409);
  });
});
