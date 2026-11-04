/**
 * Maile w przepływach (atrapa SMTP i Clerk): prośba o dołączenie → trener, akceptacja / odrzucenie → osoba, odłączenie → druga strona,
 * okres próbny i pakiet (zadanie okresowe, każdy mail najwyżej raz), panel administratora „Maile” (podgląd i test do właściciela).
 */
let authUser: string | null = null;
const sent: Array<{ to: string; subject: string; from: string; text: string; html?: string; replyTo?: string }> = [];
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (m: { to: string; subject: string; from: string; text: string; html?: string; replyTo?: string }) => { sent.push({ to: m.to, subject: m.subject, from: m.from, text: m.text, html: m.html, replyTo: m.replyTo }); } }) } }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, clientPackagesTable, packageSessionsTable, mailLogTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { resetJoinAttempts } from "../services/joinCode";
import { runMailJobs } from "../services/mail/jobs";
import { MAIL_IDS } from "../services/mail/catalogue";

const TR = "mailflow_trainer", ADMIN = "mailflow_admin", NOADMIN = "mailflow_nobody", P1 = "mailflow_person_1", P2 = "mailflow_person_2";
const as = (u: string | null) => { authUser = u; };
const to = (id: string) => `${id}@poczta-testowa.pl`;
let trainerId = 0, code = "";
const DAY = 86_400_000;

async function cleanup() {
  const people = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.clerkUserId, [P1, P2]));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [ADMIN, NOADMIN]));
  if (people.length) await db.delete(clientsTable).where(inArray(clientsTable.id, people.map((p) => p.id)));
  if (trainerId) await db.delete(mailLogTable).where(like(mailLogTable.ref, `${trainerId}:%`));
}
beforeAll(async () => {
  Object.assign(process.env, { SMTP_HOST: "smtp.poczta-testowa.pl", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "noreply@optimatren.pl", OWNER_NOTIFY_EMAIL: "wlasciciel@poczta-testowa.pl", APP_ADMIN_CLERK_IDS: ADMIN });
  await cleanup();
  await provisionTrainer(ADMIN); await provisionTrainer(NOADMIN);
  const t = await provisionTrainer(TR);
  trainerId = t!.id;
  await db.update(trainersTable).set({ displayName: "Marek Nowak", email: "marek@poczta-testowa.pl", trialEndsAt: null }).where(eq(trainersTable.id, trainerId));
  as(TR); code = (await request(app).get("/api/trainer/join")).body.code;
});
afterAll(async () => { await cleanup(); for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "OWNER_NOTIFY_EMAIL", "APP_ADMIN_CLERK_IDS"]) delete process.env[k]; });
beforeEach(() => { sent.length = 0; resetJoinAttempts(); });
const mine = (addr: string) => sent.filter((m) => m.to === addr);

describe("prośba o dołączenie, akceptacja, odrzucenie, odłączenie", () => {
  let requestId = 0;
  it("nowa prośba: mail do trenera („Nowa prośba o dołączenie”, po imieniu); powtórzone kliknięcie nie wysyła drugiego", async () => {
    as(P1);
    expect((await request(app).post(`/api/join/${code}/request`).send({ firstName: "Anna" })).status).toBe(201);
    const m = mine(to(TR));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ subject: "Nowa prośba o dołączenie" });
    expect(m[0]!.text.startsWith("Cześć, Marek,")).toBe(true);
    expect(m[0]!.text).toContain("Anna chce dołączyć");
    sent.length = 0;
    await request(app).post(`/api/join/${code}/request`).send({ firstName: "Anna" });
    expect(mine(to(TR))).toHaveLength(0);
    as(TR);
    requestId = (await request(app).get("/api/trainer/join")).body.requests[0].id;
  });
  it("akceptacja: mail do osoby w imieniu trenera („Marek Nowak przez Optimatren”, Reply-To trenera), adres z konta Clerk", async () => {
    as(TR);
    expect((await request(app).post(`/api/trainer/join-requests/${requestId}/accept`)).status).toBe(200);
    const m = mine(to(P1));
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toBe("Trener przyjął Twoją prośbę");
    expect(m[0]!.from).toContain("Marek Nowak przez Optimatren");
    expect(m[0]!.replyTo).toBe("marek@poczta-testowa.pl");
    expect(m[0]!.html).toContain("<!doctype html>");
    expect(m[0]!.text).toContain("Twoim trenerem jest Marek Nowak");
  });
  it("odłączenie przez trenera: mail do osoby; odłączenie przez osobę: mail do trenera (bez form zależnych od płci)", async () => {
    const client = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.clerkUserId, P1)))[0]!;
    as(TR); sent.length = 0;
    expect((await request(app).post(`/api/clients/${client.id}/disconnect`)).status).toBe(200);
    expect(mine(to(P1))[0]).toMatchObject({ subject: "Zakończono współpracę z trenerem" });
    expect(mine(to(P1))[0]!.text).toContain("Trener: Marek Nowak.");
    // druga osoba: prośba → akceptacja → odłączenie przez osobę
    as(P2); await request(app).post(`/api/join/${code}/request`).send({ firstName: "Beata" });
    as(TR); const rid = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    await request(app).post(`/api/trainer/join-requests/${rid}/accept`);
    as(P2); sent.length = 0;
    expect((await request(app).post("/api/client-portal/disconnect")).status).toBe(200);
    const m = mine(to(TR));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ subject: "Podopieczny odłączył się" });
    expect(m[0]!.text).toContain("Podopieczny: Beata.");
  });
  it("odrzucenie: mail do osoby bez nazwy trenera w odmienionej formie", async () => {
    as(P2); await request(app).post(`/api/join/${code}/request`).send({ firstName: "Beata" });
    as(TR); const rid = (await request(app).get("/api/trainer/join")).body.requests[0].id;
    sent.length = 0;
    expect((await request(app).post(`/api/trainer/join-requests/${rid}/reject`)).status).toBe(200);
    const m = mine(to(P2));
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toBe("Prośba nie została przyjęta");
    expect(m[0]!.text).toContain("Trener: Marek Nowak.");
  });
});

describe("zadanie okresowe: okres próbny i pakiet (każdy mail najwyżej raz)", () => {
  it("3 dni przed końcem: jedna zapowiedź; drugi przebieg nic nie wysyła; po końcu jedna wiadomość o końcu", async () => {
    const now = new Date();
    await db.update(trainersTable).set({ trialEndsAt: new Date(now.getTime() + 2 * DAY) }).where(eq(trainersTable.id, trainerId));
    await runMailJobs(now);
    const first = mine(to(TR));
    expect(first).toHaveLength(1);
    expect(first[0]!.subject).toBe("Okres próbny kończy się za 2 dni");
    expect(first[0]!.text).toContain("plan Free");
    sent.length = 0; await runMailJobs(now);
    expect(mine(to(TR))).toHaveLength(0);
    // 14 dni dalej: za wcześnie (poza oknem 3 dni) — nic
    await db.update(trainersTable).set({ trialEndsAt: new Date(now.getTime() + 10 * DAY) }).where(eq(trainersTable.id, trainerId));
    await runMailJobs(now); expect(mine(to(TR))).toHaveLength(0);
    // koniec dzisiaj
    await db.update(trainersTable).set({ trialEndsAt: new Date(now.getTime() - 60_000) }).where(eq(trainersTable.id, trainerId));
    await runMailJobs(now);
    expect(mine(to(TR)).map((m) => m.subject)).toEqual(["Okres próbny się skończył"]);
    sent.length = 0; await runMailJobs(now); expect(mine(to(TR))).toHaveLength(0);
    // stary koniec (ponad 3 dni temu) nie wysyła zaległej wiadomości
    await db.update(trainersTable).set({ trialEndsAt: new Date(now.getTime() - 20 * DAY) }).where(eq(trainersTable.id, trainerId));
    await runMailJobs(now); expect(mine(to(TR))).toHaveLength(0);
    await db.update(trainersTable).set({ trialEndsAt: null }).where(eq(trainersTable.id, trainerId));
  });
  it("pakiet: 2 sesje lub mniej → mail do trenera raz na stan; więcej → nic", async () => {
    const [c] = await db.insert(clientsTable).values({ firstName: "Anna", lastName: "pakiet-test", trainerId, status: "active", clerkUserId: P1 + "_pk" }).returning();
    try {
      const [pk] = await db.insert(clientPackagesTable).values({ trainerId, clientId: c!.id, totalSessions: 5 }).returning();
      await runMailJobs();
      expect(mine(to(TR))).toHaveLength(0); // 5 zostało
      for (let i = 0; i < 3; i++) await db.insert(packageSessionsTable).values({ packageId: pk!.id });
      await runMailJobs();
      expect(mine(to(TR)).map((m) => m.subject)).toEqual(["Pakiet sesji się kończy"]);
      expect(mine(to(TR))[0]!.text).toContain("Podopieczny: Anna.");
      expect(mine(to(TR))[0]!.text).toContain("pozostało: 2 sesje");
      sent.length = 0; await runMailJobs(); expect(mine(to(TR))).toHaveLength(0);
      await db.insert(packageSessionsTable).values({ packageId: pk!.id }); // zostaje 1 → nowy stan, nowy mail
      await runMailJobs();
      expect(mine(to(TR))[0]!.text).toContain("pozostało: 1 sesja");
    } finally {
      await db.delete(clientsTable).where(eq(clientsTable.id, c!.id));
      await db.delete(mailLogTable).where(like(mailLogTable.kind, "package_ending"));
    }
  });
});

describe("panel administratora „Maile”", () => {
  it("tylko administrator; lista 16 maili; podgląd każdego z danymi przykładowymi; nieznany 404", async () => {
    as(NOADMIN); expect((await request(app).get("/api/admin/mails")).status).toBe(403);
    as(ADMIN);
    const list = await request(app).get("/api/admin/mails");
    expect(list.status).toBe(200);
    expect(list.body.mails).toHaveLength(16);
    expect(list.body.ownerAddressSet).toBe(true);
    for (const id of MAIL_IDS) {
      const r = await request(app).get(`/api/admin/mails/${id}/preview`);
      expect(r.status, id).toBe(200);
      expect(r.body.html, id).toContain("<!doctype html>");
      expect(r.body.subject.length, id).toBeGreaterThan(3);
    }
    expect((await request(app).get("/api/admin/mails/nie_ma/preview")).status).toBe(404);
  });
  it("„Wyślij test do mnie”: mail na OWNER_NOTIFY_EMAIL; bez adresu 400; zwykłe konto 403", async () => {
    as(NOADMIN); expect((await request(app).post("/api/admin/mails/plan_ready/test")).status).toBe(403);
    as(ADMIN); sent.length = 0;
    expect((await request(app).post("/api/admin/mails/plan_ready/test")).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "wlasciciel@poczta-testowa.pl", subject: "Twój plan jest gotowy" });
    const keep = process.env.OWNER_NOTIFY_EMAIL; delete process.env.OWNER_NOTIFY_EMAIL; delete process.env.ADMIN_EMAIL;
    expect((await request(app).post("/api/admin/mails/plan_ready/test")).status).toBe(400);
    process.env.OWNER_NOTIFY_EMAIL = keep;
  });
  it("test na adres zastępczy właściciela jest zablokowany (nic nie wychodzi)", async () => {
    const keep = process.env.OWNER_NOTIFY_EMAIL; process.env.OWNER_NOTIFY_EMAIL = "ktos@example.invalid";
    as(ADMIN); sent.length = 0;
    expect((await request(app).post("/api/admin/mails/plan_ready/test")).status).toBe(502);
    expect(sent).toHaveLength(0);
    process.env.OWNER_NOTIFY_EMAIL = keep;
  });
});
