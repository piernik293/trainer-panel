/** „Wkrótce” z głosowaniem (ROADMAP_ENABLED): flaga, jeden głos na konto, cofnięcie, rola, ukryte pozycje, administrator, podział głosów. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, like } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "rm_solo" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, clientsTable, trainersTable, roadmapItemsTable, roadmapVotesTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const SOLO = "rm_solo", SOLO2 = "rm_solo2", TR = "rm_trener", POD = "rm_pod", NOBODY = "rm_nikt", ADMIN = "rm_admin";
const as = (id: string | null) => { auth.userId = id; };
let firstId = 0;
async function wipe() {
  await db.delete(roadmapVotesTable).where(like(roadmapVotesTable.clerkUserId, "rm_%"));
  await db.delete(roadmapItemsTable).where(like(roadmapItemsTable.slug, "rm-test-%"));
  await db.delete(clientsTable).where(like(clientsTable.clerkUserId, "rm_%"));
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "rm_%"));
}
beforeAll(async () => {
  await wipe();
  Object.assign(process.env, { APP_ADMIN_CLERK_IDS: ADMIN });
  await provisionTrainer(ADMIN);
  const t = await provisionTrainer(TR);
  await db.insert(clientsTable).values([
    { firstName: "Solo", lastName: "", trainerId: null, status: "active", clerkUserId: SOLO },
    { firstName: "Solo2", lastName: "", trainerId: null, status: "active", clerkUserId: SOLO2 },
    { firstName: "Pod", lastName: "", trainerId: t!.id, status: "active", clerkUserId: POD },
  ]);
  const [first] = await db.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.slug, "kalkulator-1rm"));
  firstId = first!.id;
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(SOLO); });
afterAll(async () => { await wipe(); delete process.env.APP_ADMIN_CLERK_IDS; await pool.end(); });
const on = () => { vi.stubEnv("ROADMAP_ENABLED", "1"); };

describe("Wkrótce — flaga i start", () => {
  it("wyłączona: 404 na listę i głos, status false", async () => {
    expect((await request(app).get("/api/roadmap/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/roadmap")).status).toBe(404);
    expect((await request(app).post(`/api/roadmap/${firstId}/vote`)).status).toBe(404);
  });
  it("lista startowa: 12 pozycji ze statusem „Wkrótce”, w tym 7 kart z dopisku, bez dat", async () => {
    on();
    const r = await request(app).get("/api/roadmap"); expect(r.status).toBe(200);
    const slugs = r.body.items.map((i: { title: string }) => i.title);
    for (const t of ["Kalkulator 1RM", "Prognoza progresu", "BMR / TDEE i cel wagi", "Makroskładniki i szablony żywienia", "Suplementy w pigułce", "Plany nawyków", "Asystent AI", "Prowadzę trening", "Płatności BLIK od klientów", "Import planu ze zdjęcia", "Podsumowanie roku (story)", "Rynek trenerów"]) expect(slugs).toContain(t);
    for (const i of r.body.items) { expect(i.statusLabel).toBe("Wkrótce"); expect(`${i.title} ${i.blurb}`).not.toMatch(/\b20\d\d\b|kwiet|maj|czerw|lip|sierp|wrze|paźdz|listop|grud|stycz|lut|marz/i); }
  });
});

describe("głosowanie", () => {
  it("jeden głos na konto na pozycję (powtórka nic nie zmienia), cofnięcie, dwa konta = 2", async () => {
    on(); as(SOLO);
    const before = (await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === firstId).votes;
    expect((await request(app).post(`/api/roadmap/${firstId}/vote`)).status).toBe(200);
    expect((await request(app).post(`/api/roadmap/${firstId}/vote`)).status).toBe(200);
    const mine = (await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === firstId);
    expect(mine).toMatchObject({ votes: before + 1, voted: true });
    as(SOLO2); await request(app).post(`/api/roadmap/${firstId}/vote`);
    const other = (await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === firstId);
    expect(other).toMatchObject({ votes: before + 2, voted: true });
    expect((await request(app).delete(`/api/roadmap/${firstId}/vote`)).status).toBe(200);
    const after = (await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === firstId);
    expect(after).toMatchObject({ votes: before + 1, voted: false });
    as(SOLO); expect((await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === firstId).voted).toBe(true); // głos konta SOLO nietknięty
  });
  it("konto bez roli i bez sesji nie głosuje; zły numer = 400/404", async () => {
    on(); as(NOBODY); expect((await request(app).post(`/api/roadmap/${firstId}/vote`)).status).toBe(403);
    as(null); expect((await request(app).get("/api/roadmap")).status).toBe(401);
    as(SOLO); expect((await request(app).post("/api/roadmap/abc/vote")).status).toBe(400);
    expect((await request(app).post("/api/roadmap/99999999/vote")).status).toBe(404);
  });
});

describe("administrator", () => {
  it("zwykłe konto: 403; administrator: lista z podziałem trener/Solo/podopieczny", async () => {
    on(); as(TR); expect((await request(app).get("/api/admin/roadmap")).status).toBe(403);
    as(TR); await request(app).post(`/api/roadmap/${firstId}/vote`);
    as(POD); await request(app).post(`/api/roadmap/${firstId}/vote`);
    as(SOLO); await request(app).post(`/api/roadmap/${firstId}/vote`);
    as(ADMIN); const r = await request(app).get("/api/admin/roadmap"); expect(r.status).toBe(200);
    const row = r.body.items.find((i: { id: number }) => i.id === firstId);
    expect(row.votes).toMatchObject({ trener: 1, podopieczny: 1, solo: 1, total: 3 });
  });
  it("dodanie, ukrycie (znika u użytkowników, głosy zostają), status „Gotowe”, walidacja", async () => {
    on(); as(ADMIN);
    expect((await request(app).post("/api/admin/roadmap").send({ title: "x" })).status).toBe(400);
    const c = await request(app).post("/api/admin/roadmap").send({ title: "Test rm-test pozycja", blurb: "Krótki opis testowy." });
    expect(c.status).toBe(201);
    const id = c.body.id as number;
    await db.update(roadmapItemsTable).set({ slug: `rm-test-${id}` }).where(eq(roadmapItemsTable.id, id));
    as(SOLO); await request(app).post(`/api/roadmap/${id}/vote`);
    as(ADMIN); expect((await request(app).patch(`/api/admin/roadmap/${id}`).send({ hidden: true })).status).toBe(200);
    as(SOLO); expect((await request(app).get("/api/roadmap")).body.items.some((i: { id: number }) => i.id === id)).toBe(false);
    expect((await request(app).post(`/api/roadmap/${id}/vote`)).status).toBe(404); // ukryta pozycja: nowe głosy odrzucone
    as(ADMIN);
    expect((await request(app).get("/api/admin/roadmap")).body.items.find((i: { id: number }) => i.id === id).votes.total).toBe(1);
    await request(app).patch(`/api/admin/roadmap/${id}`).send({ hidden: false, status: "done" });
    as(SOLO); expect((await request(app).get("/api/roadmap")).body.items.find((i: { id: number }) => i.id === id).statusLabel).toBe("Gotowe");
    as(ADMIN); expect((await request(app).patch(`/api/admin/roadmap/${id}`).send({ status: "zly" })).status).toBe(400);
    expect((await request(app).patch("/api/admin/roadmap/99999999").send({ hidden: true })).status).toBe(404);
  });
});
