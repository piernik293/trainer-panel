/** „Prośba o dołączenie” w „Wymaga uwagi” (27.10.2026): widoczna tylko dla adresata, znika po decyzji, akcja prowadzi do próśb. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { joinRequestItems, buildAttention } from "../services/dashboardAttention";

const TA = "join_attn_trainer_a", TB = "join_attn_trainer_b", P1 = "join_attn_person_1";
const as = (u: string | null) => { authUser = u; };
type Item = { kind: string; name: string; actionHref: string; actionLabel: string };
const attention = async () => ((await request(app).get("/api/dashboard/summary")).body.attention.items as Item[]);

beforeAll(async () => {
  await provisionTrainer(TA); await provisionTrainer(TB);
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [P1]));
});
afterAll(async () => { await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [P1])); });

describe("joinRequestItems (czysta logika)", () => {
  it("pozycja z akcją „Przejdź do prośby” i odnośnikiem do próśb", () => {
    const [it] = joinRequestItems([{ id: 7, firstName: "Ola", createdAt: new Date("2026-10-27T10:00:00Z") }]);
    expect(it).toMatchObject({ kind: "join_request", name: "Ola", reasonLabel: "Prośba o dołączenie", actionLabel: "Przejdź do prośby", actionHref: "/settings#dolaczanie", ref: "7", clientId: null });
  });
  it("wchodzi do listy przez extraItems i można ją oznaczyć jako załatwioną", () => {
    const base = { clients: [], surveys: [], plans: [], invites: [], today: "2026-10-27", now: new Date("2026-10-27T12:00:00Z") };
    const extra = joinRequestItems([{ id: 7, firstName: "Ola", createdAt: new Date("2026-10-27T10:00:00Z") }]);
    expect(buildAttention({ ...base, extraItems: extra }).byKind.join_request).toBe(1);
    expect(buildAttention({ ...base, extraItems: extra, dismissed: new Set(["join_request|7"]) }).byKind.join_request).toBe(0);
  });
});

describe("pulpit trenera", () => {
  it("adresat widzi prośbę, inny trener nie, po akceptacji prośba znika", async () => {
    as(TA);
    const code = (await request(app).get("/api/trainer/join")).body.code as string;
    as(P1);
    expect((await request(app).post(`/api/join/${code}/request`).send({ firstName: "Ola" })).status).toBe(201);
    as(TA);
    const mine = (await attention()).filter((i) => i.kind === "join_request");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Ola", actionHref: "/settings#dolaczanie" });
    as(TB);
    expect((await attention()).filter((i) => i.kind === "join_request")).toHaveLength(0);
    as(TA);
    const reqId = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    expect((await request(app).post(`/api/trainer/join-requests/${reqId}/accept`)).status).toBe(200);
    expect((await attention()).filter((i) => i.kind === "join_request")).toHaveLength(0);
  });
});
