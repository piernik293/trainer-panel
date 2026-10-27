/** Skrzynka uwagi (blok 8) przez API: „załatwione”, próg ciszy, izolacja trenerów, powód z pakietu. Baza testowa. */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, workoutPlansTable, surveysTable, volumeGuidelineVersionsTable } from "@workspace/db";

const A = "attention_trainer_a", B = "attention_trainer_b";
let idA = 0, idB = 0, c1 = 0, c2 = 0, cB = 0;

beforeAll(async () => {
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
  idA = (await db.insert(trainersTable).values({ clerkUserId: A }).returning())[0]!.id;
  idB = (await db.insert(trainersTable).values({ clerkUserId: B }).returning())[0]!.id;
  const mk = async (trainerId: number, n: string) => (await db.insert(clientsTable).values({ firstName: n, lastName: "Uwaga", trainerId, status: "active" }).returning())[0]!.id;
  c1 = await mk(idA, "Cichy"); c2 = await mk(idA, "Ruchliwy"); cB = await mk(idB, "Obcy");
  const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
  for (const cid of [c1, cB]) {
    const [sv] = await db.insert(surveysTable).values({ clientId: cid, experienceLevel: "Początkujący" } as never).returning();
    await db.insert(workoutPlansTable).values({ clientId: cid, surveyId: sv!.id, guidelineVersionId: ver!.id, experienceLevelUsed: "Początkujący", title: "p", status: "active", activatedAt: new Date(Date.now() - 12 * 86_400_000) } as never);
  }
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.id, [c1, c2, cB]));
  await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
  await pool.end();
});

describe("skrzynka uwagi", () => {
  it("klient bez treningu od 12 dni jest na liście („Cisza”); próg 14 dni go ukrywa, 7 pokazuje", async () => {
    mockUser = A;
    const r = await request(app).get("/api/dashboard/summary");
    expect(r.status).toBe(200);
    const row = r.body.attention.allItems.find((i: { clientId: number }) => i.clientId === c1);
    expect(row).toMatchObject({ kind: "silent", reasonLabel: "Cisza" });
    expect(r.body.attention.allItems.some((i: { clientId: number }) => i.clientId === c2)).toBe(false); // bez planu aktywnego
    expect((await request(app).put("/api/dashboard/attention-settings").send({ silenceDays: 14 })).body).toEqual({ silenceDays: 14 });
    expect((await request(app).get("/api/dashboard/summary")).body.attention.allItems.some((i: { clientId: number }) => i.clientId === c1)).toBe(false);
    expect((await request(app).put("/api/dashboard/attention-settings").send({ silenceDays: 5 })).status).toBe(400);
    await request(app).put("/api/dashboard/attention-settings").send({ silenceDays: 7 });
  });
  it("„załatwione” ukrywa powód; inny trener nie może oznaczać cudzego klienta", async () => {
    mockUser = A;
    const row = (await request(app).get("/api/dashboard/summary")).body.attention.allItems.find((i: { clientId: number }) => i.clientId === c1);
    mockUser = B;
    expect((await request(app).post("/api/dashboard/attention/dismiss").send({ kind: row.kind, ref: row.ref })).status).toBe(404);
    mockUser = A;
    expect((await request(app).post("/api/dashboard/attention/dismiss").send({ kind: row.kind, ref: row.ref })).status).toBe(200);
    expect((await request(app).post("/api/dashboard/attention/dismiss").send({ kind: row.kind, ref: row.ref })).status).toBe(200); // powtórka bez błędu
    const after = (await request(app).get("/api/dashboard/summary")).body.attention.allItems;
    expect(after.some((i: { clientId: number }) => i.clientId === c1)).toBe(false);
    expect((await request(app).post("/api/dashboard/attention/dismiss").send({ kind: "nieznany", ref: "1:x" })).status).toBe(400);
    mockUser = null;
    expect((await request(app).post("/api/dashboard/attention/dismiss").send({ kind: "silent", ref: `${c1}:x` })).status).toBeGreaterThanOrEqual(401);
  });
  it("izolacja: trener B widzi tylko swojego klienta", async () => {
    mockUser = B;
    const items = (await request(app).get("/api/dashboard/summary")).body.attention.allItems as Array<{ clientId: number }>;
    expect(items.map((i) => i.clientId)).toEqual([cB]);
    expect((await request(app).get("/api/dashboard/attention-settings")).body).toEqual({ silenceDays: 7 }); // ustawienia A nie przenoszą się
  });
  it("pakiet z 2 sesjami do końca pojawia się jako powód po zamknięciu „ciszy”", async () => {
    mockUser = A;
    const p = await request(app).post(`/api/clients/${c1}/packages`).send({ totalSessions: 4 });
    expect(p.status).toBe(201);
    for (let i = 0; i < 2; i++) await request(app).post(`/api/packages/${p.body.id}/sessions`).send({});
    const item = (await request(app).get("/api/dashboard/summary")).body.attention.allItems.find((i: { clientId: number }) => i.clientId === c1);
    expect(item).toMatchObject({ kind: "package", description: "Zostały 2 sesje w pakiecie." });
  });
});
