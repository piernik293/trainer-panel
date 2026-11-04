/** Nowy wygląd portalu: flaga UI_V2_ENABLED, profil (nick unikalny bez względu na wielkość liter, walidacja, kolor), izolacja kont. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "uiv2_client_a" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async () => ({}) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable } from "@workspace/db";

const IDS = ["uiv2_client_a", "uiv2_client_b"];
let trainerId = 0;
const put = (body: unknown) => request(app).put("/api/client-portal/profile").send(body as object);

beforeAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, IDS));
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "uiv2_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "uiv2_trainer" } }).returning();
  trainerId = t.id;
  for (const [i, id] of IDS.entries()) await db.insert(clientsTable).values({ firstName: i ? "Beata" : "Anna", lastName: "uiv2-test", trainerId, status: "active", clerkUserId: id });
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); auth.userId = "uiv2_client_a"; });
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, IDS));
  await pool.end();
});

describe("UI_V2_ENABLED", () => {
  it("wyłączona (domyślnie): status mówi false, profil to 404", async () => {
    expect((await request(app).get("/api/ui-v2/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/client-portal/profile")).status).toBe(404);
    expect((await put({ nick: "abc" })).status).toBe(404);
  });
  it("włączona: status true", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    expect((await request(app).get("/api/ui-v2/status")).body).toEqual({ enabled: true });
  });
});

describe("profil", () => {
  it("zapis nicka, nazwy i koloru; odczyt zwraca to samo i listę 6 kolorów", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    const r = await put({ nick: "ShiiFuu", displayName: "Shii", avatarColor: "#0F766E" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nick: "ShiiFuu", displayName: "Shii", avatarColor: "#0F766E", firstName: "Anna" });
    expect(r.body.colors).toHaveLength(6);
    expect((await request(app).get("/api/client-portal/profile")).body.nick).toBe("ShiiFuu");
  });
  it("nick zajęty (także inną wielkością liter) → 409; własny nick można zapisać ponownie", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    auth.userId = "uiv2_client_b";
    const r = await put({ nick: "shiifuu" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NICK_TAKEN");
    auth.userId = "uiv2_client_a";
    expect((await put({ nick: "SHIIFUU" })).status).toBe(200);
  });
  it("walidacja: zły nick, wulgaryzm, nieznany kolor, za długa nazwa → 400; nic się nie zmienia", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    expect((await put({ nick: "a" })).status).toBe(400);
    expect((await put({ nick: "kurwa123" })).status).toBe(400);
    expect((await put({ avatarColor: "#000000" })).status).toBe(400);
    expect((await put({ displayName: "x".repeat(41) })).status).toBe(400);
    expect((await request(app).get("/api/client-portal/profile")).body.nick).toBe("SHIIFUU");
  });
  it("nick można usunąć (null); imię i nazwisko widoczne dla trenera się nie zmieniają", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    const r = await put({ nick: null });
    expect(r.body.nick).toBeNull();
    expect(r.body.firstName).toBe("Anna");
  });
});
