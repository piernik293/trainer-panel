/** Masa i obwody (BODY_LOG_ENABLED): flaga, zapis i nadpisanie dnia, walidacja, izolacja osób, trener bez dostępu, usuwanie tylko własnych. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { like } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "bl_a" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, clientsTable, trainersTable, bodyMeasurementsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const A = "bl_a", B = "bl_b", TR = "bl_trener";
const as = (id: string | null) => { auth.userId = id; };
const on = () => vi.stubEnv("BODY_LOG_ENABLED", "1");
async function wipe() {
  await db.delete(clientsTable).where(like(clientsTable.clerkUserId, "bl_%"));
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "bl_%"));
}
beforeAll(async () => {
  await wipe();
  await provisionTrainer(TR);
  await db.insert(clientsTable).values([
    { firstName: "A", lastName: "", trainerId: null, status: "active", clerkUserId: A },
    { firstName: "B", lastName: "", trainerId: null, status: "active", clerkUserId: B },
  ]);
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); await pool.end(); });

describe("masa i obwody", () => {
  it("wyłączona: status false, 404", async () => {
    expect((await request(app).get("/api/body-log/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/client-portal/body")).status).toBe(404);
    expect((await request(app).post("/api/client-portal/body").send({ weightKg: 70 })).status).toBe(404);
  });
  it("zapis, drugi wpis tego samego dnia nadpisuje podane pola, lista rosnąco po dacie", async () => {
    on();
    expect((await request(app).post("/api/client-portal/body").send({ measuredOn: "2026-10-01", weightKg: 72.4, waistCm: 80 })).status).toBe(201);
    expect((await request(app).post("/api/client-portal/body").send({ measuredOn: "2026-10-01", weightKg: 72.0 })).status).toBe(201);
    expect((await request(app).post("/api/client-portal/body").send({ measuredOn: "2026-10-08", weightKg: 71.6 })).status).toBe(201);
    const l = (await request(app).get("/api/client-portal/body")).body.items;
    expect(l.map((x: { measuredOn: string }) => x.measuredOn)).toEqual(["2026-10-01", "2026-10-08"]);
    expect(l[0]).toMatchObject({ weightKg: 72, waistCm: 80 }); // masa nadpisana, talia zostaje
  });
  it("walidacja: puste, poza zakresem, przyszłość, obce pola", async () => {
    on();
    for (const body of [{}, { weightKg: 5 }, { weightKg: 900 }, { armCm: 500 }, { measuredOn: "2999-01-01", weightKg: 70 }, { weightKg: 70, bmi: 1 }, { measuredOn: "wczoraj", weightKg: 70 }])
      expect((await request(app).post("/api/client-portal/body").send(body)).status).toBe(400);
  });
  it("izolacja: B nie widzi wpisów A i nie usunie ich; trener i brak sesji bez dostępu", async () => {
    on();
    const id = (await request(app).get("/api/client-portal/body")).body.items[0].id as number;
    as(B);
    expect((await request(app).get("/api/client-portal/body")).body.items).toEqual([]);
    expect((await request(app).delete(`/api/client-portal/body/${id}`)).status).toBe(404);
    as(TR); expect((await request(app).get("/api/client-portal/body")).status).toBeGreaterThanOrEqual(401);
    as(null); expect((await request(app).get("/api/client-portal/body")).status).toBe(401);
    as(A); expect((await request(app).delete(`/api/client-portal/body/${id}`)).status).toBe(200);
    expect((await request(app).delete("/api/client-portal/body/abc")).status).toBe(400);
    expect(await db.select().from(bodyMeasurementsTable)).not.toContainEqual(expect.objectContaining({ id }));
  });
});
