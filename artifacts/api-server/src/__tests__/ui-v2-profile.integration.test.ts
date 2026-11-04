/**
 * Nowy wygląd portalu: flaga UI_V2_ENABLED, profil i zasady nicka — unikalność bez względu na wielkość liter, nicki zarezerwowane i „prawie identyczne”,
 * zmiana najwyżej raz na 30 dni, stary nick zablokowany dla innych na 30 dni, odznaka „Trener”, izolacja kont.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "uiv2_client_a" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async () => ({}) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, nickHistoryTable } from "@workspace/db";

const A = "uiv2_client_a", B = "uiv2_client_b", T = "uiv2_client_trainer", C = "uiv2_client_c", D = "uiv2_client_d", E = "uiv2_client_e";
const IDS = [A, B, T, C, D, E];
let trainerId = 0;
const put = (body: unknown) => request(app).put("/api/client-portal/profile").send(body as object);
const as = (id: string) => { auth.userId = id; };
const DAY = 86_400_000;
/** pretend the last change was `days` ago (the 30-day limit) */
const backdate = (clerk: string, days: number) => db.update(clientsTable).set({ nickChangedAt: new Date(Date.now() - days * DAY) }).where(eq(clientsTable.clerkUserId, clerk));
const idOf = async (clerk: string) => (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.clerkUserId, clerk)))[0]!.id;

async function wipe() {
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, IDS)); // nick_history goes with it (ON DELETE CASCADE)
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
}
beforeAll(async () => {
  await wipe();
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "uiv2_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "uiv2_trainer" } }).returning();
  trainerId = t.id;
  await db.insert(trainersTable).values({ clerkUserId: T }).onConflictDoNothing();
  for (const [i, id] of IDS.entries()) await db.insert(clientsTable).values({ firstName: ["Anna", "Beata", "Tomasz", "Celina", "Dorota", "Ewa"][i]!, lastName: "uiv2-test", trainerId, status: "active", clerkUserId: id });
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); await pool.end(); });

describe("UI_V2_ENABLED", () => {
  it("wyłączona (domyślnie): status mówi false, profil to 404", async () => {
    vi.stubEnv("UI_V2_ENABLED", ""); // niezależnie od .env (tam flaga może być włączona)
    expect((await request(app).get("/api/ui-v2/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/client-portal/profile")).status).toBe(404);
    expect((await put({ nick: "abc" })).status).toBe(404);
  });
  it("włączona: status true", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    expect((await request(app).get("/api/ui-v2/status")).body).toEqual({ enabled: true });
  });
});

describe("profil i nick", () => {
  it("pierwsze ustawienie nicka jest wolne; nazwa i kolor zapisują się; odczyt zwraca 6 kolorów", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    const r = await put({ nick: "ShiiFuu", displayName: "Shii", avatarColor: "#0F766E" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nick: "ShiiFuu", displayName: "Shii", avatarColor: "#0F766E", firstName: "Anna", isTrainer: false });
    expect(r.body.colors).toHaveLength(6);
    expect(typeof r.body.nickChangeAvailableAt).toBe("string"); // a change is now locked for 30 days
  });
  it("zmiana innego nicka zaraz potem → 429 z datą; sama zmiana wielkości liter jest wolna", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    const r = await put({ nick: "InnyNick" });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("NICK_COOLDOWN");
    expect(r.body.availableAt).toBeTruthy();
    expect((await put({ nick: "SHIIFUU" })).status).toBe(200);
    expect((await request(app).get("/api/client-portal/profile")).body.nick).toBe("SHIIFUU");
    expect((await put({ displayName: "Nowa" })).status).toBe(200); // nazwa i kolor bez ograniczeń
  });
  it("nick zajęty, także inną wielkością liter → 409", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(B);
    const r = await put({ nick: "shiifuu" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NICK_TAKEN");
  });
  it("nick prawie identyczny z cudzym (różnice tylko w wielkości liter oraz _ i .) → 409", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(B);
    for (const n of ["shii_fuu", "Shii.Fuu", "_shiifuu_", "S.H.I.I.F.U.U"]) {
      const r = await put({ nick: n });
      expect(r.status, n).toBe(409);
      expect(r.body.code, n).toBe("NICK_TAKEN");
    }
  });
  it("cyfry rozróżniają nicki: kasia, kasia92 i kasia2004 istnieją osobno; kasia_92 to nadal kasia92", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(C); expect((await put({ nick: "kasia" })).status).toBe(200);
    as(D); expect((await put({ nick: "kasia92" })).status).toBe(200);
    as(E); expect((await put({ nick: "kasia2004" })).status).toBe(200);
    as(B);
    expect((await put({ nick: "Kasia_" })).status).toBe(409);
    expect((await put({ nick: "kasia_92" })).status).toBe(409);
    expect((await put({ nick: "kasia.2004" })).status).toBe(409);
    // „shiifuu1” przy istniejącym „shiifuu”: osobny nick (cyfra rozróżnia); zmianę B cofamy, żeby kolejne testy startowały od czystego stanu
    expect((await put({ nick: "shiifuu1" })).status).toBe(200);
    await db.update(clientsTable).set({ nick: null, nickKey: null, nickChangedAt: null }).where(eq(clientsTable.clerkUserId, B));
  });
  it("nick z dopiskiem trenera, którego rdzeń to nick konta z odznaką „Trener”, jest odrzucony (trener_ola przy trenerce ola)", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(T); expect((await put({ nick: "tomek_t" })).status).toBe(200); // konto z rolą trenera
    as(B);
    for (const n of ["trener_tomek_t", "Trenerka.Tomek.T", "tomekt_coach", "tomek_t_pt", "official_tomekt"]) {
      const r = await put({ nick: n });
      expect(r.status, n).toBe(409);
      expect(r.body.code, n).toBe("NICK_TRAINER_LOOKALIKE");
    }
    expect((await put({ nick: "tomek_t92" })).status).toBe(200); // bez dopiska: osobny nick (cyfry rozróżniają)
    await db.update(clientsTable).set({ nick: null, nickKey: null, nickChangedAt: null }).where(eq(clientsTable.clerkUserId, B));
  });
  it("nicki zarezerwowane → 400 NICK_RESERVED; zły format i wulgaryzm → 400; nic się nie zmienia", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(B);
    for (const n of ["admin", "Admin_1", "adm1n", "optimatren", "trener", "trener2004", "support", "pomoc", "moderator", "root", "system"]) {
      const r = await put({ nick: n });
      expect(r.status, n).toBe(400);
      expect(r.body.code, n).toBe("NICK_RESERVED");
    }
    expect((await put({ nick: "a" })).status).toBe(400);
    expect((await put({ nick: "kurwa123" })).status).toBe(400);
    expect((await put({ avatarColor: "#000000" })).status).toBe(400);
    expect((await put({ displayName: "x".repeat(41) })).status).toBe(400);
    expect((await request(app).get("/api/client-portal/profile")).body.nick).toBeNull();
  });
  it("po 30 dniach zmiana jest możliwa, a stary nick zostaje zablokowany dla innych na 30 dni", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    await backdate(A, 31);
    expect((await put({ nick: "NowyNick" })).status).toBe(200);
    as(B);
    for (const n of ["ShiiFuu", "shii_fuu", "S.hii.fuu"]) {
      const r = await put({ nick: n });
      expect(r.status, n).toBe(409);
      expect(r.body.code, n).toBe("NICK_HELD");
    }
    expect((await put({ nick: "MojNick" })).status).toBe(200); // wolny nick przechodzi
  });
  it("po upływie blokady (30 dni) stary nick jest znów dostępny dla innych", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    await db.update(nickHistoryTable).set({ blockedUntil: new Date(Date.now() - DAY) }).where(eq(nickHistoryTable.clientId, await idOf(A)));
    await backdate(B, 31);
    as(B);
    expect((await put({ nick: "ShiiFuu" })).status).toBe(200);
  });
  it("usunięcie nicka też liczy się jako zmiana (nie da się obejść limitu przez „usuń i ustaw”)", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(B);
    await backdate(B, 31);
    expect((await put({ nick: null })).body.nick).toBeNull();
    const again = await put({ nick: "Cokolwiek" });
    expect(again.status).toBe(429);
    expect(again.body.code).toBe("NICK_COOLDOWN");
  });
  it("odznaka „Trener” tylko przy koncie z rolą trenera; imię i nazwisko dla trenera się nie zmieniają", async () => {
    vi.stubEnv("UI_V2_ENABLED", "1");
    as(T);
    expect((await request(app).get("/api/client-portal/profile")).body.isTrainer).toBe(true);
    as(A);
    const p = (await request(app).get("/api/client-portal/profile")).body;
    expect(p.isTrainer).toBe(false);
    expect(p.firstName).toBe("Anna");
  });
});
