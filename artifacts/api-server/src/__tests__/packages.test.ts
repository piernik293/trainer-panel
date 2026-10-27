/** Pakiety i licznik sesji (blok 7): reguły przypomnień (czyste) i API na bazie testowej — izolacja trenerów, limit sesji, cofnięcie, widok klienta. */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable } from "@workspace/db";
import { packageReminders, remainingSessions, LOW_SESSIONS_THRESHOLD } from "../services/packages";

const A = "pakiety_trainer_a", B = "pakiety_trainer_b", CLI = "pakiety_client_1";
let idA = 0, idB = 0, c1 = 0, c2 = 0;

beforeAll(async () => {
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
  idA = (await db.insert(trainersTable).values({ clerkUserId: A }).returning())[0]!.id;
  idB = (await db.insert(trainersTable).values({ clerkUserId: B }).returning())[0]!.id;
  c1 = (await db.insert(clientsTable).values({ firstName: "Pak", lastName: "Jeden", trainerId: idA, status: "active", clerkUserId: CLI }).returning())[0]!.id;
  c2 = (await db.insert(clientsTable).values({ firstName: "Pak", lastName: "Dwa", trainerId: idA, status: "active" }).returning())[0]!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.id, [c1, c2]));
  await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
  await pool.end();
});

describe("reguły przypomnień", () => {
  const today = new Date("2026-10-26T10:00:00Z");
  const pkg = (o: Partial<{ totalSessions: number; validUntil: string | null; status: string }> = {}) => ({ totalSessions: 10, validUntil: null, status: "active", ...o });
  it("zostało: razem − odbyte, nigdy poniżej 0", () => { expect(remainingSessions(10, 3)).toBe(7); expect(remainingSessions(10, 12)).toBe(0); });
  it("przypomnienie przy 2 i 1 pozostałej oraz przy 0; przy 3 i więcej brak", () => {
    expect(LOW_SESSIONS_THRESHOLD).toBe(2);
    expect(packageReminders(pkg(), 6, today)).toEqual([]);
    expect(packageReminders(pkg(), 7, today)).toEqual([]); // 3 left
    expect(packageReminders(pkg(), 8, today)[0]).toMatchObject({ code: "LOW_SESSIONS", text: "Zostały 2 sesje w pakiecie." });
    expect(packageReminders(pkg(), 9, today)[0]).toMatchObject({ code: "LOW_SESSIONS", text: "Została 1 sesja w pakiecie." });
    expect(packageReminders(pkg(), 10, today)[0]).toMatchObject({ code: "NO_SESSIONS" });
  });
  it("ważność: 7 dni przed końcem, w dniu końca, po końcu; bez daty brak", () => {
    expect(packageReminders(pkg({ validUntil: "2026-11-10" }), 0, today)).toEqual([]);
    expect(packageReminders(pkg({ validUntil: "2026-11-02" }), 0, today)[0]).toMatchObject({ code: "EXPIRING", text: "Pakiet traci ważność za 7 dni." });
    expect(packageReminders(pkg({ validUntil: "2026-10-27" }), 0, today)[0]).toMatchObject({ text: "Pakiet traci ważność za 1 dzień." });
    expect(packageReminders(pkg({ validUntil: "2026-10-26" }), 0, today)[0]).toMatchObject({ text: "Pakiet traci ważność dziś." });
    expect(packageReminders(pkg({ validUntil: "2026-10-25" }), 0, today)[0]).toMatchObject({ code: "EXPIRED" });
  });
  it("zamknięty pakiet nie przypomina", () => { expect(packageReminders(pkg({ status: "closed", validUntil: "2020-01-01" }), 10, today)).toEqual([]); });
});

describe("API", () => {
  let pid = 0;
  it("trener zakłada pakiet; drugi aktywny dla tego samego podopiecznego → 409", async () => {
    mockUser = A;
    const r = await request(app).post(`/api/clients/${c1}/packages`).send({ totalSessions: 4, pricePln: 400, validUntil: "2026-12-31", showToClient: true });
    expect(r.status).toBe(201); pid = r.body.id;
    expect(r.body).toMatchObject({ totalSessions: 4, usedSessions: 0, remaining: 4, pricePln: "400.00" });
    expect((await request(app).post(`/api/clients/${c1}/packages`).send({ totalSessions: 5 })).status).toBe(409);
    expect((await request(app).post(`/api/clients/${c2}/packages`).send({ totalSessions: 0 })).status).toBe(400);
  });
  it("odhaczanie, licznik „zostało”, limit i cofnięcie", async () => {
    mockUser = A;
    for (let i = 1; i <= 4; i++) {
      const r = await request(app).post(`/api/packages/${pid}/sessions`).send({});
      expect(r.status).toBe(201); expect(r.body.package.remaining).toBe(4 - i);
    }
    const over = await request(app).post(`/api/packages/${pid}/sessions`).send({});
    expect(over.status).toBe(409); expect(over.body.code).toBe("NO_SESSIONS_LEFT");
    const list = await request(app).get(`/api/clients/${c1}/packages`);
    expect(list.body.packages[0].reminders.map((x: { code: string }) => x.code)).toContain("NO_SESSIONS");
    const first = list.body.activeSessions[0].id;
    const undo = await request(app).delete(`/api/packages/${pid}/sessions/${first}`);
    expect(undo.status).toBe(200); expect(undo.body.package.remaining).toBe(1);
    expect((await request(app).delete(`/api/packages/${pid}/sessions/${first}`)).status).toBe(404); // już cofnięta
    expect((await request(app).patch(`/api/packages/${pid}`).send({ totalSessions: 2 })).status).toBe(409); // poniżej odbytych (3)
  });
  it("dwa jednoczesne odhaczenia ostatniej sesji: tylko jedno przechodzi", async () => {
    mockUser = A;
    const created = await request(app).post(`/api/clients/${c2}/packages`).send({ totalSessions: 1 });
    const id = created.body.id;
    const [x, y] = await Promise.all([request(app).post(`/api/packages/${id}/sessions`).send({}), request(app).post(`/api/packages/${id}/sessions`).send({})]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
  });
  it("izolacja: inny trener nie widzi, nie odhacza i nie zmienia", async () => {
    mockUser = B;
    expect((await request(app).get(`/api/clients/${c1}/packages`)).status).toBe(404);
    expect((await request(app).post(`/api/clients/${c1}/packages`).send({ totalSessions: 3 })).status).toBe(404);
    expect((await request(app).post(`/api/packages/${pid}/sessions`).send({})).status).toBe(404);
    expect((await request(app).patch(`/api/packages/${pid}`).send({ showToClient: false })).status).toBe(404);
    expect((await request(app).delete(`/api/packages/${pid}/sessions/1`)).status).toBe(404);
    mockUser = null;
    expect((await request(app).get(`/api/clients/${c1}/packages`)).status).toBeGreaterThanOrEqual(401);
  });
  it("podopieczny widzi tylko „zostało X” i tylko gdy trener pozwolił; nigdy ceny", async () => {
    mockUser = CLI;
    const v = await request(app).get("/api/client-portal/package");
    expect(v.status).toBe(200); expect(v.body).toMatchObject({ visible: true, remaining: 1, total: 4 });
    expect(JSON.stringify(v.body)).not.toMatch(/price|cena|400/i);
    mockUser = A;
    await request(app).patch(`/api/packages/${pid}`).send({ showToClient: false });
    mockUser = CLI;
    expect((await request(app).get("/api/client-portal/package")).body).toEqual({ visible: false });
    mockUser = null;
    expect((await request(app).get("/api/client-portal/package")).status).toBeGreaterThanOrEqual(401);
  });
  it("zamknięcie pakietu: znika z widoku klienta, nie przyjmuje sesji, można założyć nowy", async () => {
    mockUser = A;
    const closed = await request(app).patch(`/api/packages/${pid}`).send({ status: "closed" });
    expect(closed.status).toBe(200); expect(closed.body.status).toBe("closed"); expect(closed.body.showToClient).toBe(false);
    expect((await request(app).post(`/api/packages/${pid}/sessions`).send({})).status).toBe(409);
    expect((await request(app).post(`/api/clients/${c1}/packages`).send({ totalSessions: 8 })).status).toBe(201);
  });
});
