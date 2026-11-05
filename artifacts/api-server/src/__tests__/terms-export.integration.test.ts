/** Regulamin (TERMS_ENABLED): flaga, akceptacja z wersją, nieaktualna wersja, eksport danych (izolacja, limit 3/dobę, trener bez danych podopiecznych). */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { like, eq } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "tx_solo_a" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, clientsTable, trainersTable, termsAcceptancesTable, dataExportsTable, surveysTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { REGULAMIN_VERSION, legalDocument } from "@workspace/survey-config";

const A = "tx_solo_a", B = "tx_solo_b", TR = "tx_trener", NONE = "tx_nikt";
const as = (id: string | null) => { auth.userId = id; };
const on = () => vi.stubEnv("TERMS_ENABLED", "1");
async function wipe() {
  await db.delete(termsAcceptancesTable).where(like(termsAcceptancesTable.clerkUserId, "tx_%"));
  await db.delete(dataExportsTable).where(like(dataExportsTable.clerkUserId, "tx_%"));
  const cl = await db.select({ id: clientsTable.id }).from(clientsTable).where(like(clientsTable.clerkUserId, "tx_%"));
  for (const c of cl) await db.delete(surveysTable).where(eq(surveysTable.clientId, c.id));
  await db.delete(clientsTable).where(like(clientsTable.clerkUserId, "tx_%"));
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "tx_%"));
}
beforeAll(async () => {
  await wipe();
  const t = await provisionTrainer(TR);
  await db.insert(clientsTable).values([
    { firstName: "AnnaTX", lastName: "", trainerId: null, status: "active", clerkUserId: A },
    { firstName: "BeataTX", lastName: "", trainerId: null, status: "active", clerkUserId: B },
    { firstName: "PodopiecznyTX", lastName: "", trainerId: t!.id, status: "active", clerkUserId: "tx_pod" },
  ]);
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); await pool.end(); });

describe("Regulamin — treść i flaga", () => {
  it("dokument w aplikacji: 18 paragrafów z zachowanymi znacznikami [ ] i [DECYZJA], oznaczony jako projekt", () => {
    const d = legalDocument("regulamin")!;
    expect(d.draft).toBe(true); expect(d.version).toBe(REGULAMIN_VERSION); expect(d.sections).toHaveLength(18);
    const all = d.sections.map((s) => s.text).join("\n");
    expect(all).toContain("[IMIĘ I NAZWISKO / NAZWA FIRMY]"); expect(all).toContain("[DECYZJA]"); expect(all).toContain("[DO USTALENIA Z PRAWNIKIEM]");
    expect(d.sections[1]!.text).toContain("Aplikacja nie jest wyrobem medycznym");
  });
  it("wyłączona: status false, a zgoda i eksport to 404", async () => {
    expect((await request(app).get("/api/terms/status")).body).toMatchObject({ enabled: false, version: REGULAMIN_VERSION });
    expect((await request(app).get("/api/terms/me")).status).toBe(404);
    expect((await request(app).get("/api/me/export")).status).toBe(404);
  });
});

describe("akceptacja", () => {
  it("najpierw niezaakceptowany, po akceptacji zapis wersji i daty; stara wersja odrzucona; ponowna akceptacja bez duplikatu", async () => {
    on();
    expect((await request(app).get("/api/terms/me")).body).toMatchObject({ accepted: false, version: REGULAMIN_VERSION });
    expect((await request(app).post("/api/terms/accept").send({ version: "stara-0.0" })).status).toBe(409);
    expect((await request(app).post("/api/terms/accept").send({ version: REGULAMIN_VERSION })).status).toBe(200);
    expect((await request(app).post("/api/terms/accept").send({ version: REGULAMIN_VERSION })).status).toBe(200);
    const me = (await request(app).get("/api/terms/me")).body; expect(me.accepted).toBe(true); expect(me.acceptedAt).toBeTruthy();
    expect(await db.select().from(termsAcceptancesTable).where(eq(termsAcceptancesTable.clerkUserId, A))).toHaveLength(1);
    as(B); expect((await request(app).get("/api/terms/me")).body.accepted).toBe(false); // zgoda jest per konto
    as(null); expect((await request(app).get("/api/terms/me")).status).toBe(401);
  });
  it("po zmianie wersji konto widzi „wcześniej zaakceptowana wersja” i musi zaakceptować ponownie", async () => {
    on();
    await db.insert(termsAcceptancesTable).values({ clerkUserId: NONE, version: "projekt-0.0" });
    as(NONE); expect((await request(app).get("/api/terms/me")).body).toMatchObject({ accepted: false, previousVersion: "projekt-0.0" });
  });
});

describe("eksport danych „Pobierz moje dane”", () => {
  it("osoba Solo: tylko własne dane (bez cudzych), plik JSON, wpis w dzienniku bez treści", async () => {
    on(); as(A);
    const r = await request(app).get("/api/me/export"); expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toContain("optimatren-moje-dane.json"); expect(r.headers["cache-control"]).toBe("no-store");
    const body = JSON.parse(r.text);
    expect(body.rola).toBe("solo"); expect(body.dane.profil.firstName).toBe("AnnaTX");
    expect(r.text).not.toContain("BeataTX"); expect(r.text).not.toContain("PodopiecznyTX");
    for (const k of ["wywiady", "plany", "treningi", "zgloszeniaBolu", "kroki", "osiagniecia", "przerwy"]) expect(Array.isArray(body.dane[k])).toBe(true);
    const log = await db.select().from(dataExportsTable).where(eq(dataExportsTable.clerkUserId, A)); expect(log).toHaveLength(1); expect(log[0]!.role).toBe("solo");
  });
  it("limit 3 na dobę → czwarte pobranie 429", async () => {
    on(); as(B);
    for (let i = 0; i < 3; i++) expect((await request(app).get("/api/me/export")).status).toBe(200);
    const r = await request(app).get("/api/me/export"); expect(r.status).toBe(429); expect(r.body.code).toBe("EXPORT_LIMIT");
  });
  it("trener: własny profil i ćwiczenia, bez danych podopiecznych; konto bez danych 404; bez sesji 401", async () => {
    on(); as(TR);
    const r = await request(app).get("/api/me/export"); expect(r.status).toBe(200);
    const body = JSON.parse(r.text); expect(body.rola).toBe("trener"); expect(body.dane.liczbaPodopiecznych).toBe(1);
    expect(r.text).not.toContain("PodopiecznyTX"); expect(body.dane.uwaga).toContain("należą do nich");
    as(NONE); expect((await request(app).get("/api/me/export")).status).toBe(404);
    as(null); expect((await request(app).get("/api/me/export")).status).toBe(401);
  });
});
