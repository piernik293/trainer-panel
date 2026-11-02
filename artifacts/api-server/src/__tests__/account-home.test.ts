/** Jedno logowanie (U1): serwer decyduje, dokąd trafia osoba po zalogowaniu; samo wejście nigdy nie robi z konta trenera. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const TR = "home_trainer", BLOCKED = "home_blocked_trainer", LINKED = "home_linked_client", SOLO = "home_solo_person", ADMIN = "home_admin_new", NOBODY = "home_nobody", BOTH = "home_trainer_and_client", APPROVED = "home_approved_not_yet";
const EMAILS = ["home-linked@example.invalid", "home-solo@example.invalid", "home-both@example.invalid"];
const as = (u: string | null) => { authUser = u; };
const home = () => request(app).get("/api/account/home");
let trId = 0;

beforeAll(async () => {
  process.env.APP_ADMIN_CLERK_IDS = ADMIN;
  process.env.TRAINER_CLERK_IDS = APPROVED;
  delete process.env.TRAINER_SIGNUP_OPEN;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  trId = (await provisionTrainer(TR))!.id;
  const b = (await provisionTrainer(BLOCKED))!;
  await db.update(trainersTable).set({ blockedAt: new Date() }).where(eq(trainersTable.id, b.id));
  await provisionTrainer(BOTH);
  await db.insert(clientsTable).values({ firstName: "Pod", lastName: "Opieczny", email: EMAILS[0]!, trainerId: trId, clerkUserId: LINKED });
  await db.insert(clientsTable).values({ firstName: "Solo", lastName: "Osoba", email: EMAILS[1]!, trainerId: null, clerkUserId: SOLO });
  await db.insert(clientsTable).values({ firstName: "Trener", lastName: "Trenuje", email: EMAILS[2]!, trainerId: null, clerkUserId: BOTH });
});
afterAll(async () => {
  delete process.env.TRAINER_CLERK_IDS;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [TR, BLOCKED, BOTH, ADMIN, APPROVED]));
});

describe("GET /account/home — kierowanie po zalogowaniu", () => {
  it("bez sesji 401", async () => { as(null); expect((await home()).status).toBe(401); });
  it("podopieczny trenera → portal (połączony)", async () => {
    as(LINKED); expect((await home()).body).toMatchObject({ destination: "portal", isClient: true, linked: true, isTrainer: false });
  });
  it("konto bez trenera → portal (niepołączone), także zupełnie nowe konto bez żadnego wiersza", async () => {
    as(SOLO); expect((await home()).body).toMatchObject({ destination: "portal", linked: false });
    as(NOBODY); expect((await home()).body).toMatchObject({ destination: "portal", isClient: false, isTrainer: false, linked: false });
  });
  it("trener → panel; trener z własnym treningiem też (isClient dla przełącznika)", async () => {
    as(TR); expect((await home()).body).toMatchObject({ destination: "panel", isTrainer: true });
    as(BOTH); expect((await home()).body).toMatchObject({ destination: "panel", isTrainer: true, isClient: true });
  });
  it("administrator (także bez wiersza trenera) i konto zatwierdzone w .env → panel", async () => {
    as(ADMIN); expect((await home()).body.destination).toBe("panel");
    as(APPROVED); expect((await home()).body.destination).toBe("panel");
  });
  it("trener, który ma też własny trening (konto połączone z klientem), nadal wchodzi do panelu; konto samego klienta nie", async () => {
    as(BOTH); const ok = await request(app).post("/api/trainer/profile"); expect(ok.status).toBe(200);
    as(SOLO); expect((await request(app).post("/api/trainer/profile")).status).toBe(403);
  });
  it("zablokowany trener → blocked", async () => {
    as(BLOCKED); expect((await home()).body.destination).toBe("blocked");
  });
  it("samo wywołanie niczego nie tworzy: konto bez roli nie staje się trenerem", async () => {
    as(NOBODY); await home(); await home();
    expect(await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, NOBODY))).toHaveLength(0);
    as(LINKED); await home();
    expect(await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, LINKED))).toHaveLength(0);
    expect((await request(app).post("/api/trainer/profile")).status).toBe(403);
  });
});
