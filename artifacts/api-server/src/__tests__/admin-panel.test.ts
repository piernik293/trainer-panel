/** Panel administratora (blok 3): dostęp tylko dla administratora z .env, oczyszczanie błędów, dziennik dostępu, blokada konta, brak limitów generatora. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "ktos@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, appErrorsTable, adminAccessLogTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { scrubMessage, normalizePlace } from "../services/errorLog";
import { runWithSubscriptionLimit, isSubscriptionLimitError } from "../services/subscriptionService";

const ADMIN = "admin_panel_test_admin", TR = "admin_panel_test_trainer", CL = "admin_panel_test_client", SOLO = "admin_panel_test_solo";
const as = (u: string | null) => { authUser = u; };
let trId: number, adminId: number, clientId: number;
const EMAILS = ["admin-panel-client@example.invalid"];

beforeAll(async () => {
  process.env.APP_ADMIN_CLERK_IDS = ADMIN;
  const a = (await provisionTrainer(ADMIN))!, t = (await provisionTrainer(TR))!;
  adminId = a.id; trId = t.id;
  await db.update(trainersTable).set({ blockedAt: null }).where(inArray(trainersTable.id, [adminId, trId]));
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [CL, SOLO]));
  clientId = (await db.insert(clientsTable).values({ firstName: "Adm", lastName: "Test", email: EMAILS[0]!, trainerId: trId, clerkUserId: CL }).returning())[0]!.id;
  await db.insert(clientsTable).values({ firstName: "Solo", lastName: "", trainerId: null, clerkUserId: SOLO });
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [CL, SOLO]));
  await db.delete(appErrorsTable).where(eq(appErrorsTable.place, "/admin-test-screen"));
});

describe("oczyszczanie błędów (czysta logika)", () => {
  it("usuwa e-maile, tokeny, hasła, długie liczby i adresy z parametrami", () => {
    const s = scrubMessage("Błąd dla jan.kowalski@example.com: Authorization: Bearer abc.def.ghi password=Tajne123 token=xyz https://x.pl/a?token=SEKRET&u=1 tel 600 700 800 id 0123456789abcdef0123456789abcdef");
    expect(s).not.toMatch(/jan\.kowalski|example\.com|Tajne123|SEKRET|abc\.def|600 700|0123456789abcdef/);
    expect(s).toContain("[e-mail]");
  });
  it("opis ze słowami zdrowotnymi jest w całości ukrywany", () => {
    expect(scrubMessage("Ból kolana u klienta, kontuzja")).toBe("[treść ukryta — mogła zawierać dane zdrowotne]");
    expect(scrubMessage("TypeError: x is undefined")).toBe("TypeError: x is undefined");
  });
  it("jest przycinany, a miejsce nie zawiera identyfikatorów ani parametrów", () => {
    expect(scrubMessage("x".repeat(1000)).length).toBeLessThanOrEqual(301);
    expect(normalizePlace("GET /api/clients/123/plans/45?email=a@b.pl")).toBe("GET /api/clients/:id/plans/:id");
    expect(normalizePlace("/plan/3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("/plan/:id");
  });
});

describe("dostęp do panelu", () => {
  const routes = ["/api/admin/errors", "/api/admin/trainers", "/api/admin/solo", "/api/admin/subscriptions", "/api/admin/access-log"];
  it("bez sesji 401", async () => {
    as(null);
    for (const r of routes) expect((await request(app).get(r)).status, r).toBe(401);
  });
  it("trener, podopieczny i osoba Solo: 403", async () => {
    for (const u of [TR, CL, SOLO]) {
      as(u);
      for (const r of routes) expect((await request(app).get(r)).status, `${u} ${r}`).toBe(403);
      expect((await request(app).post("/api/admin/access/client").send({ clientId, reason: "sprawdzam błąd tej osoby" })).status).toBe(403);
    }
  });
  it("/admin/me: trener false, administrator true", async () => {
    as(TR); expect((await request(app).get("/api/admin/me")).body.isAdmin).toBe(false);
    as(ADMIN); expect((await request(app).get("/api/admin/me")).body.isAdmin).toBe(true);
  });
  it("administrator widzi listy", async () => {
    as(ADMIN);
    for (const r of routes) expect((await request(app).get(r)).status, r).toBe(200);
    const t = (await request(app).get("/api/admin/trainers")).body;
    expect(t.trainers.some((x: { id: number }) => x.id === trId)).toBe(true);
    expect(t.howToAddTrainer).toContain("TRAINER_CLERK_IDS");
    // każdy trener ma czytelną etykietę (konto bez nazwy i e-maila: „Konto …” + końcówka identyfikatora, nie cały identyfikator)
    expect(t.trainers.every((x: { label: string }) => x.label.length > 0)).toBe(true);
    const mine = t.trainers.find((x: { id: number }) => x.id === trId);
    expect(mine.label).toMatch(/^Konto …\S{1,6}$/);
    expect((await request(app).get("/api/admin/solo")).body.accounts.some((a: { firstName: string }) => a.firstName === "Solo")).toBe(true);
  });
});

describe("dziennik błędów", () => {
  it("zgłoszenie z panelu jest oczyszczone, liczone i nie zawiera sekretów", async () => {
    as(CL);
    const body = { source: "portal", place: "/admin-test-screen", message: "Nie działa dla ola@example.com token=ABCDEF123456 bearer eyJhbGciOi.payload.sig" };
    expect((await request(app).post("/api/client-errors").send(body)).status).toBe(202);
    expect((await request(app).post("/api/client-errors").send(body)).status).toBe(202);
    as(TR);
    await request(app).post("/api/client-errors").send(body);
    as(ADMIN);
    const list = (await request(app).get("/api/admin/errors")).body.errors as Array<{ id: number; place: string; message: string; occurrences: number; users: number; status: string }>;
    const e = list.find((x) => x.place === "/admin-test-screen")!;
    expect(e.occurrences).toBe(3);
    expect(e.users).toBe(2);
    expect(e.status).toBe("new");
    expect(JSON.stringify(e)).not.toMatch(/ola@example|ABCDEF123456|eyJhbGci/);
    expect((await request(app).post(`/api/admin/errors/${e.id}/reviewed`)).status).toBe(200);
    const after = (await request(app).get("/api/admin/errors?status=reviewed")).body.errors;
    expect(after.some((x: { id: number }) => x.id === e.id)).toBe(true);
  });
  it("niepoprawne zgłoszenie 400", async () => {
    as(null);
    expect((await request(app).post("/api/client-errors").send({ source: "x", place: "/", message: "m" })).status).toBe(400);
  });
});

describe("wgląd w dane i dziennik dostępu", () => {
  it("bez powodu 400, z powodem — wpis w dzienniku zanim padną dane", async () => {
    as(ADMIN);
    expect((await request(app).post("/api/admin/access/client").send({ clientId, reason: "krótko" })).status).toBe(400);
    const before = (await request(app).get("/api/admin/access-log")).body.entries.length;
    const r = await request(app).post("/api/admin/access/client").send({ clientId, reason: "Błąd zgłoszony przez trenera, sprawdzam konto" });
    expect(r.status).toBe(200);
    const log = (await request(app).get("/api/admin/access-log")).body.entries;
    expect(log.length).toBe(before + 1);
    expect(log[0]).toMatchObject({ clientId, action: "client_detail" });
  });
  it("dziennik jest nieusuwalny i niezmienny nawet w bazie", async () => {
    await expect(db.delete(adminAccessLogTable)).rejects.toThrow();
    await expect(db.update(adminAccessLogTable).set({ reason: "zmiana" })).rejects.toThrow();
  });
  it("dane zdrowotne nie są w zwykłych listach", async () => {
    as(ADMIN);
    for (const r of ["/api/admin/trainers", "/api/admin/solo", "/api/admin/subscriptions"]) {
      const txt = JSON.stringify((await request(app).get(r)).body);
      expect(txt).not.toMatch(/healthDescription|painReports|notatk/i);
    }
  });
});

describe("trenerzy: pakiet i blokada", () => {
  it("zmiana pakietu tylko przez administratora; blokada wymaga potwierdzenia i działa", async () => {
    as(TR);
    expect((await request(app).patch(`/api/admin/trainers/${trId}/plan`).send({ planCode: "PRO" })).status).toBe(403);
    as(ADMIN);
    expect((await request(app).patch(`/api/admin/trainers/${trId}/plan`).send({ planCode: "GOLD" })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/trainers/${trId}/plan`).send({ planCode: "PRO" })).status).toBe(200);
    expect((await request(app).patch(`/api/admin/trainers/${trId}/plan`).send({ planCode: "FREE" })).status).toBe(200);
    expect((await request(app).post(`/api/admin/trainers/${trId}/block`).send({ blocked: true })).status).toBe(400); // bez potwierdzenia
    expect((await request(app).post(`/api/admin/trainers/${adminId}/block`).send({ blocked: true, confirm: true })).status).toBe(409); // nie zablokuje siebie
    expect((await request(app).post(`/api/admin/trainers/${trId}/block`).send({ blocked: true, confirm: true })).status).toBe(200);
    as(TR);
    const blocked = await request(app).get("/api/admin/me");
    expect(blocked.status).toBe(403); expect(blocked.body.code).toBe("ACCOUNT_BLOCKED");
    expect((await request(app).get("/api/clients")).status).toBe(403);
    as(ADMIN);
    expect((await request(app).post(`/api/admin/trainers/${trId}/block`).send({ blocked: false, confirm: true })).status).toBe(200);
    as(TR);
    expect((await request(app).get("/api/admin/me")).status).toBe(200);
  });
});

describe("administrator bez limitu generatora", () => {
  it("administrator przechodzi limit, zwykły trener na FREE nie", async () => {
    await expect(runWithSubscriptionLimit(adminId, "planGenerations", async () => "ok", 100)).resolves.toBe("ok");
    await runWithSubscriptionLimit(trId, "planGenerations", async () => "ok", 1).catch(() => undefined);
    const err = await runWithSubscriptionLimit(trId, "planGenerations", async () => "ok", 100).catch((e) => e);
    expect(isSubscriptionLimitError(err)).toBe(true);
  });
});
