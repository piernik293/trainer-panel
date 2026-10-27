/** Link i kod trenera (blok 2): izolacja bez akceptacji, odłączenie, limit prób, nowy kod unieważnia stary, konto z linku nie staje się trenerem. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, clientLinkEventsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { JOIN_ATTEMPT_LIMIT, generateJoinCode, normalizeJoinCode, resetJoinAttempts, allowJoinAttempt } from "../services/joinCode";

const TA = "join_test_trainer_a", TB = "join_test_trainer_b";
const P1 = "join_test_person_1", P2 = "join_test_person_2";
const as = (u: string | null) => { authUser = u; };
let codeA = "";

async function cleanup() {
  const people = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.clerkUserId, [P1, P2]));
  if (people.length) await db.delete(clientsTable).where(inArray(clientsTable.id, people.map((p) => p.id)));
}
beforeAll(async () => { await provisionTrainer(TA); await provisionTrainer(TB); await cleanup(); });
afterAll(async () => { await cleanup(); });
beforeEach(() => { resetJoinAttempts(); });

describe("kod (czysta logika)", () => {
  it("kształt, alfabet i normalizacja", () => {
    const c = generateJoinCode();
    expect(c).toHaveLength(10);
    expect(normalizeJoinCode(c.toLowerCase())).toBe(c);
    expect(normalizeJoinCode(`${c.slice(0, 5)}-${c.slice(5)}`)).toBe(c);
    expect(normalizeJoinCode("ABC")).toBeNull();
    expect(normalizeJoinCode("0000000000")).toBeNull(); // 0 nie występuje w alfabecie
    expect(normalizeJoinCode(null)).toBeNull();
  });
  it("limit prób", () => {
    for (let i = 0; i < JOIN_ATTEMPT_LIMIT; i++) expect(allowJoinAttempt("k")).toBe(true);
    expect(allowJoinAttempt("k")).toBe(false);
    expect(allowJoinAttempt("inny")).toBe(true);
  });
});

describe("przepływ", () => {
  it("trener dostaje kod i link; bez sesji 401", async () => {
    as(null);
    expect((await request(app).get("/api/trainer/join")).status).toBe(401);
    as(TA);
    const r = await request(app).get("/api/trainer/join");
    expect(r.status).toBe(200);
    codeA = r.body.code;
    expect(r.body.link).toContain(codeA);
    expect((await request(app).get("/api/trainer/join")).body.code).toBe(codeA); // stały, dopóki trener nie wygeneruje nowego
  });

  it("błędny kod → 404; poprawny → tylko nazwa trenera", async () => {
    as(null);
    expect((await request(app).get("/api/join/AAAAAAAAAA")).status).toBe(404);
    expect((await request(app).get("/api/join/xx")).status).toBe(404);
    const ok = await request(app).get(`/api/join/${codeA}`);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body)).toEqual(["trainerName"]);
  });

  it("limit prób zgadywania kodu: po 10 próbach 429", async () => {
    as(null);
    let last = 0;
    for (let i = 0; i < JOIN_ATTEMPT_LIMIT + 2; i++) last = (await request(app).get("/api/join/BBBBBBBBBB")).status;
    expect(last).toBe(429);
  });

  it("prośba bez akceptacji: trener nie widzi osoby; po akceptacji widzi; po odłączeniu traci dostęp", async () => {
    as(P1);
    const req = await request(app).post(`/api/join/${codeA}/request`).send({ firstName: "Ola" });
    expect(req.status).toBe(201);
    const [p1] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, P1));
    expect(p1!.trainerId).toBeNull();
    expect((await request(app).get("/api/account/status")).body).toMatchObject({ linked: false, pendingTrainerName: expect.any(String) });

    as(TA);
    expect((await request(app).get(`/api/clients/${p1!.id}`)).status).toBe(404); // bez akceptacji — nic
    const list = await request(app).get("/api/trainer/join");
    expect(list.body.requests).toHaveLength(1);
    const reqId = list.body.requests[0].id;

    as(TB);
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/accept`)).status).toBe(404); // cudza prośba

    as(TA);
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/accept`)).status).toBe(200);
    expect((await request(app).get(`/api/clients/${p1!.id}`)).status).toBe(200);
    as(TB);
    expect((await request(app).get(`/api/clients/${p1!.id}`)).status).toBe(404);

    as(TA);
    expect((await request(app).post(`/api/clients/${p1!.id}/disconnect`)).status).toBe(200);
    expect((await request(app).get(`/api/clients/${p1!.id}`)).status).toBe(404); // trener traci dostęp
    const [after] = await db.select().from(clientsTable).where(eq(clientsTable.id, p1!.id));
    expect(after!.trainerId).toBeNull();
    expect(after!.clerkUserId).toBe(P1); // konto i historia zostają u osoby
    const ev = await db.select().from(clientLinkEventsTable).where(eq(clientLinkEventsTable.clientId, p1!.id));
    expect(ev.map((e) => e.kind).sort()).toEqual(["disconnected", "joined"]);
  });

  it("odrzucenie: osoba nie dostaje trenera; można poprosić ponownie", async () => {
    as(P1);
    await request(app).post(`/api/join/${codeA}/request`).send({});
    as(TA);
    const reqId = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/reject`)).status).toBe(200);
    const [p1] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, P1));
    expect(p1!.trainerId).toBeNull();
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/accept`)).status).toBe(404); // już rozpatrzona
  });

  it("osoba odłącza się sama", async () => {
    as(P1);
    await request(app).post(`/api/join/${codeA}/request`).send({});
    as(TA);
    const reqId = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    await request(app).post(`/api/trainer/join-requests/${reqId}/accept`);
    as(P1);
    expect((await request(app).post("/api/client-portal/disconnect")).status).toBe(200);
    expect((await request(app).post("/api/client-portal/disconnect")).status).toBe(409);
    const [p1] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, P1));
    expect(p1!.trainerId).toBeNull();
  });

  it("nowy kod unieważnia stary", async () => {
    as(TA);
    const fresh = await request(app).post("/api/trainer/join/code");
    expect(fresh.status).toBe(200);
    expect(fresh.body.code).not.toBe(codeA);
    as(null);
    expect((await request(app).get(`/api/join/${codeA}`)).status).toBe(404);
    expect((await request(app).get(`/api/join/${fresh.body.code}`)).status).toBe(200);
    as(P2);
    expect((await request(app).post(`/api/join/${codeA}/request`).send({ firstName: "Ewa" })).status).toBe(404);
    codeA = fresh.body.code;
  });

  it("konto z linku nigdy nie staje się trenerem; konto trenera nie może poprosić o dołączenie", async () => {
    as(P2);
    expect((await request(app).post(`/api/join/${codeA}/request`).send({ firstName: "Ewa" })).status).toBe(201);
    const t = await request(app).get("/api/trainer/join");
    expect(t.status).toBe(403); expect(t.body.code).toBe("CLIENT_ACCOUNT");
    const [tr] = await db.select().from(trainersTable).where(eq(trainersTable.clerkUserId, P2));
    expect(tr).toBeUndefined();
    as(TB);
    const r = await request(app).post(`/api/join/${codeA}/request`).send({ firstName: "X" });
    expect(r.status).toBe(403); expect(r.body.code).toBe("TRAINER_ACCOUNT");
  });

  it("osoba połączona z jednym trenerem nie dołączy do drugiego bez odłączenia", async () => {
    as(P2);
    as(TA);
    const reqId = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/accept`)).status).toBe(200);
    as(TB);
    const codeB = (await request(app).get("/api/trainer/join")).body.code;
    as(P2);
    const r = await request(app).post(`/api/join/${codeB}/request`).send({});
    expect(r.status).toBe(409); expect(r.body.code).toBe("ALREADY_LINKED");
  });
});
