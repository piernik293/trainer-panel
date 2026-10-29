/** „Zgłoś uwagę” (blok 4): flaga, oczyszczanie, limit na osobę, izolacja (tylko administrator czyta), brak danych zdrowotnych. */
process.env.RATE_LIMIT_FORCE = "1";
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "ktos@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, trainersTable, userFeedbackTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { cleanFeedbackText, feedbackEnabled, FEEDBACK_MAX_LENGTH } from "../services/feedback";

const ADMIN = "feedback_test_admin", TR = "feedback_test_trainer", CL = "feedback_test_client", SPAMMER = "feedback_test_spammer", OTHER = "feedback_test_other";
const PAGE = "/feedback-test";
const as = (u: string | null) => { authUser = u; };
const send = (over: Record<string, unknown> = {}) => request(app).post("/api/feedback").send({ category: "pomysl", message: "Przydałby się ciemny motyw.", page: PAGE, source: "portal", ...over });

beforeAll(async () => {
  process.env.APP_ADMIN_CLERK_IDS = ADMIN;
  await provisionTrainer(ADMIN); await provisionTrainer(TR);
});
afterAll(async () => {
  delete process.env.FEEDBACK_ENABLED;
  await db.delete(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE));
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TR));
});

describe("oczyszczanie treści (czysta logika)", () => {
  it("usuwa e-maile, tokeny i numery; zostawia sens", () => {
    const r = cleanFeedbackText("Napisz do mnie: jan@example.com albo 600 700 800, token=abc123 — przycisk nie działa");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.text).not.toMatch(/jan@example|600 700|abc123/); expect(r.text).toContain("przycisk nie działa"); }
  });
  it("puste i zdrowotne odrzuca", () => {
    expect(cleanFeedbackText("   ")).toEqual({ ok: false, code: "EMPTY" });
    expect(cleanFeedbackText("Klient ma ból kolana i kontuzję")).toEqual({ ok: false, code: "HEALTH_CONTENT" });
  });
  it("przycina do 1000 znaków", () => {
    const r = cleanFeedbackText("a ".repeat(900));
    expect(r.ok && r.text.length <= FEEDBACK_MAX_LENGTH + 1).toBe(true);
  });
  it("flaga domyślnie wyłączona", () => {
    expect(feedbackEnabled({})).toBe(false);
    expect(feedbackEnabled({ FEEDBACK_ENABLED: "1" })).toBe(true);
    expect(feedbackEnabled({ FEEDBACK_ENABLED: "true" })).toBe(false);
  });
});

describe("flaga wyłączona (domyślnie)", () => {
  it("wszystko poza /feedback/status to 404, a status mówi false", async () => {
    delete process.env.FEEDBACK_ENABLED; as(TR);
    expect((await request(app).get("/api/feedback/status")).body).toEqual({ enabled: false });
    expect((await send()).status).toBe(404);
    as(ADMIN);
    expect((await request(app).get("/api/admin/feedback")).status).toBe(404);
    expect((await request(app).post("/api/admin/feedback/1/read")).status).toBe(404);
    expect(await db.select().from(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE))).toHaveLength(0);
  });
});

describe("flaga włączona", () => {
  beforeAll(() => { process.env.FEEDBACK_ENABLED = "1"; });

  it("status mówi true; bez sesji 401", async () => {
    expect((await request(app).get("/api/feedback/status")).body).toEqual({ enabled: true });
    as(null);
    expect((await send()).status).toBe(401);
  });

  it("klient (bez profilu trenera) zapisuje uwagę: rola, ścieżka bez parametrów, wersja, bez e-maila", async () => {
    as(CL);
    const r = await send({ page: `${PAGE}?token=SEKRET&email=a@b.pl`, message: "Niejasne: co znaczy RIR? Pisz na jan@example.com", category: "niejasne" });
    expect(r.status).toBe(201);
    const [row] = await db.select().from(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE));
    expect(row).toMatchObject({ authorRole: "klient", category: "niejasne", source: "portal", status: "new" });
    expect(row!.message).not.toMatch(/jan@example/);
    expect(row!.page).toBe(PAGE);
    expect(row!.appVersion.length).toBeGreaterThan(0);
    expect(row!.authorHash).not.toContain(CL); // tylko skrót
    expect(Object.keys(row!).join(" ")).not.toMatch(/screenshot|email/i);
  });

  it("trener ma rolę „trener”", async () => {
    as(TR);
    expect((await send({ source: "panel", category: "blad", message: "Strona planu się nie ładuje." })).status).toBe(201);
    const rows = await db.select().from(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE));
    expect(rows.some((x) => x.authorRole === "trener" && x.source === "panel")).toBe(true);
  });

  it("odrzuca: złą kategorię, za długą, pustą i zdrowotną (nic nie zapisuje)", async () => {
    as(CL);
    const before = (await db.select().from(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE))).length;
    expect((await send({ category: "inne" })).status).toBe(400);
    expect((await send({ message: "x".repeat(FEEDBACK_MAX_LENGTH + 1) })).status).toBe(400);
    const empty = await send({ message: "   " }); expect(empty.status).toBe(422); expect(empty.body.code).toBe("EMPTY");
    const health = await send({ message: "U klienta ból kolana, kontuzja" }); expect(health.status).toBe(422); expect(health.body.code).toBe("HEALTH_CONTENT");
    expect((await db.select().from(userFeedbackTable).where(eq(userFeedbackTable.page, PAGE))).length).toBe(before);
  });

  it("limit na osobę: 5 na godzinę, szósta to 429; inna osoba nie jest blokowana", async () => {
    as(SPAMMER);
    for (let i = 0; i < 5; i++) expect((await send({ message: `Uwaga numer ${i + 1}` })).status).toBe(201);
    const r = await send({ message: "Szósta" });
    expect(r.status).toBe(429); expect(r.headers["retry-after"]).toBeTruthy();
    as(OTHER);
    expect((await send({ message: "Inna osoba może" })).status).toBe(201);
  });

  it("izolacja: tylko administrator widzi listę; trener i klient dostają 403, bez sesji 401", async () => {
    as(null); expect((await request(app).get("/api/admin/feedback")).status).toBe(401);
    for (const u of [TR, CL]) { as(u); expect((await request(app).get("/api/admin/feedback")).status, u).toBe(403); expect((await request(app).post("/api/admin/feedback/1/read")).status, u).toBe(403); }
    as(ADMIN);
    const r = await request(app).get("/api/admin/feedback");
    expect(r.status).toBe(200);
    const mine = (r.body.feedback as Array<{ page: string; message: string }>).filter((f) => f.page === PAGE);
    expect(mine.length).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(r.body)).not.toMatch(/authorHash|author_hash|feedback_test_/);
  });

  it("administrator oznacza jako przeczytane i filtruje", async () => {
    as(ADMIN);
    const list = (await request(app).get("/api/admin/feedback?status=new")).body.feedback as Array<{ id: number; page: string }>;
    const one = list.find((f) => f.page === PAGE)!;
    expect((await request(app).post(`/api/admin/feedback/${one.id}/read`)).status).toBe(200);
    const read = (await request(app).get("/api/admin/feedback?status=read")).body.feedback as Array<{ id: number }>;
    expect(read.some((f) => f.id === one.id)).toBe(true);
    const nw = (await request(app).get("/api/admin/feedback?status=new")).body.feedback as Array<{ id: number }>;
    expect(nw.some((f) => f.id === one.id)).toBe(false);
    expect((await request(app).post("/api/admin/feedback/999999999/read")).status).toBe(404);
    expect((await request(app).post("/api/admin/feedback/abc/read")).status).toBe(400);
  });
});
