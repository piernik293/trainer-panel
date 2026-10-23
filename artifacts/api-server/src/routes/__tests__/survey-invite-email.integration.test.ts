/**
 * "Zaproś klienta" (real database):
 *   - validation, link from APP_PUBLIC_URL (never from the Host header),
 *   - e-mail: sender "{trainer} · Optimatren", Reply-To trainer, text version,
 *     client name and trainer message, readable message without SMTP,
 *   - duplicate active invitation → 409, replace → previous revoked (not deleted),
 *   - statuses sent / opened / completed / expired / revoked,
 *   - reminder at most once per 24 h; the previous link keeps working,
 *   - isolation: trainer B neither sees nor changes trainer A's invitations.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

let mockUserId: string | null = null;
const sendMail = vi.fn();

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

import app from "../../app";
import { db, pool, trainersTable, surveyInvitesTable } from "@workspace/db";

const A = "invite_email_test_trainer";
const B = "invite_email_test_trainer_b";
const SMTP_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "SMTP_FROM", "APP_PUBLIC_URL"] as const;
let idA = 0;
let idB = 0;
const saved: Record<string, string | undefined> = {};
let seq = 0;
const uniqueEmail = () => `klient-${Date.now()}-${++seq}@example.com`;

beforeAll(async () => {
  for (const k of SMTP_KEYS) saved[k] = process.env[k];
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
  const [a] = await db
    .insert(trainersTable)
    .values({ clerkUserId: A, displayName: "Anna Nowak", email: "anna.trener@example.com" })
    .returning();
  const [b] = await db.insert(trainersTable).values({ clerkUserId: B }).returning();
  idA = a.id;
  idB = b.id;
});
beforeEach(() => {
  mockUserId = A;
  sendMail.mockReset();
  sendMail.mockResolvedValue({});
  for (const k of SMTP_KEYS) delete process.env[k];
});
afterEach(() => {
  mockUserId = null;
});
afterAll(async () => {
  for (const k of SMTP_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await db.delete(surveyInvitesTable).where(inArray(surveyInvitesTable.trainerId, [idA, idB]));
  await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
  await pool.end();
});

const configureSmtp = () => {
  process.env["SMTP_HOST"] = "smtp.example.invalid";
  process.env["SMTP_USER"] = "sender@example.invalid";
  process.env["SMTP_PASS"] = "not-a-real-password";
};
const create = (body: Record<string, unknown>) => request(app).post("/api/survey-invites").send(body);
const list = async () => (await request(app).get("/api/survey-invites")).body as Array<Record<string, unknown>>;

describe("walidacja", () => {
  it("imię dłuższe niż 80 znaków, wiadomość dłuższa niż 500 i zły e-mail → 400", async () => {
    expect((await create({ clientName: "x".repeat(81) })).status).toBe(400);
    expect((await create({ clientName: "Marta", trainerMessage: "x".repeat(501) })).status).toBe(400);
    expect((await create({ clientName: "Marta", intendedEmail: "to-nie-email" })).status).toBe(400);
  });

  it("brak sesji → 401", async () => {
    mockUserId = null;
    expect((await create({ clientName: "Marta" })).status).toBe(401);
  });
});

describe("wysyłka e-mailem", () => {
  it("bez SMTP: zaproszenie powstaje, czytelny komunikat, nic nie wysłane", async () => {
    const res = await create({ clientName: "Ola", intendedEmail: uniqueEmail(), sendEmail: true });
    expect(res.status).toBe(201);
    expect(res.body.email).toMatchObject({ requested: true, sent: false, code: "SMTP_NOT_CONFIGURED" });
    expect(res.body.email.message).toContain("nie jest skonfigurowana");
    expect(res.body.url).toBe(`http://localhost:23889/client-landing/survey/${res.body.token}`);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("nadawca, Reply-To, temat, imię klienta, wiadomość trenera, wersja tekstowa; link z APP_PUBLIC_URL mimo wrogiego Host", async () => {
    configureSmtp();
    process.env["APP_PUBLIC_URL"] = "https://panel.example.pl/";
    const to = uniqueEmail();
    const res = await request(app)
      .post("/api/survey-invites")
      .set("Host", "evil.example")
      .set("X-Forwarded-Host", "evil.example")
      .send({ clientName: "Marta", intendedEmail: to, sendEmail: true, trainerMessage: "Do zobaczenia <b>w poniedziałek</b>!" });
    expect(res.status).toBe(201);
    expect(res.body.email).toEqual({ requested: true, sent: true });
    const expectedUrl = `https://panel.example.pl/client-landing/survey/${res.body.token}`;
    expect(res.body.url).toBe(expectedUrl);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe(to);
    expect(mail.from).toBe('"Anna Nowak · Optimatren" <sender@example.invalid>');
    expect(mail.replyTo).toBe("anna.trener@example.com");
    expect(mail.subject).toBe("Anna zaprasza Cię do wywiadu treningowego");
    expect(mail.html).toContain("Cześć Marta,");
    expect(mail.html).toContain("Do zobaczenia &lt;b&gt;w poniedziałek&lt;/b&gt;!"); // escaped
    expect(mail.html).toContain(`href="${expectedUrl}"`);
    expect(mail.html).toContain("Wypełnij wywiad");
    expect(mail.html).toContain("Wysłano przez Optimatren");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("evil.example");
    expect(mail.text).toContain("Cześć Marta,");
    expect(mail.text).toContain("Do zobaczenia <b>w poniedziałek</b>!");
    expect(mail.text).toContain(expectedUrl);
    expect(mail.text).toContain("Link jest jednorazowy i ważny do");
  });

  it("błąd wysyłki: zaproszenie powstaje, komunikat bez szczegółów serwera", async () => {
    configureSmtp();
    sendMail.mockRejectedValue(new Error("535 auth failed for sender@example.invalid / not-a-real-password"));
    const res = await create({ clientName: "Ewa", intendedEmail: uniqueEmail(), sendEmail: true });
    expect(res.status).toBe(201);
    expect(res.body.email).toMatchObject({ sent: false, code: "SEND_FAILED" });
    expect(JSON.stringify(res.body)).not.toContain("not-a-real-password");
  });

  it("bez adresu: czytelny komunikat; bez sendEmail: nic nie wysłane (tylko link)", async () => {
    configureSmtp();
    expect((await create({ clientName: "Bez Adresu 1", sendEmail: true })).body.email).toMatchObject({ code: "NO_RECIPIENT" });
    const link = await create({ clientName: "Link Only", intendedEmail: uniqueEmail() });
    expect(link.body.email).toEqual({ requested: false, sent: false });
    expect(link.body.channel).toBe("link");
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("duplikaty", () => {
  it("aktywne zaproszenie dla tego samego e-maila → 409 z datą; replaceExisting → nowe, poprzednie odwołane (nie usunięte)", async () => {
    const email = uniqueEmail();
    const first = await create({ clientName: "Marta", intendedEmail: email });
    expect(first.status).toBe(201);
    const dup = await create({ clientName: "Marta", intendedEmail: email.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_ACTIVE_INVITE");
    expect(dup.body.existing.id).toBe(first.body.id);
    expect(dup.body.existing.createdAt).toBeTruthy();

    const replaced = await create({ clientName: "Marta", intendedEmail: email, replaceExisting: true });
    expect(replaced.status).toBe(201);
    expect(replaced.body.replacedInviteIds).toEqual([first.body.id]);
    const [old] = await db.select().from(surveyInvitesTable).where(eq(surveyInvitesTable.id, first.body.id));
    expect(old.revokedAt).not.toBeNull();
    const statuses = Object.fromEntries((await list()).map((i) => [i.id, i.status]));
    expect(statuses[first.body.id]).toBe("revoked");
    expect(statuses[replaced.body.id]).toBe("sent");
  });

  it("bez e-maila duplikatem jest to samo imię (bez e-maila)", async () => {
    expect((await create({ clientName: "Zosia Bez Maila" })).status).toBe(201);
    expect((await create({ clientName: "zosia bez maila" })).status).toBe(409);
    expect((await create({ clientName: "Zosia Bez Maila", intendedEmail: uniqueEmail() })).status).toBe(201);
  });
});

describe("statusy", () => {
  it("wysłane → otwarte (pierwsze otwarcie linku) → wypełniony; wygasło; odwołane", async () => {
    const inv = await create({ clientName: "Status Test", intendedEmail: uniqueEmail() });
    const id = inv.body.id;
    const statusOf = async (x: number) => (await list()).find((i) => i.id === x)?.status;
    expect(await statusOf(id)).toBe("sent");

    expect((await request(app).get(`/api/public/survey/${inv.body.token}`)).status).toBe(200);
    const row = (await list()).find((i) => i.id === id)!;
    expect(row.status).toBe("opened");
    expect(row.openedAt).toBeTruthy();

    await db.update(surveyInvitesTable).set({ usedAt: new Date() }).where(eq(surveyInvitesTable.id, id));
    expect(await statusOf(id)).toBe("completed");

    const exp = await create({ clientName: "Wygasłe", intendedEmail: uniqueEmail() });
    await db.update(surveyInvitesTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(surveyInvitesTable.id, exp.body.id));
    expect(await statusOf(exp.body.id)).toBe("expired");

    const rev = await create({ clientName: "Odwołane", intendedEmail: uniqueEmail() });
    expect((await request(app).delete(`/api/survey-invites/${rev.body.id}`)).status).toBe(204);
    expect(await statusOf(rev.body.id)).toBe("revoked");
  });

  it("lista: tylko ostatnie 30 dni", async () => {
    const old = await create({ clientName: "Stare", intendedEmail: uniqueEmail() });
    await db
      .update(surveyInvitesTable)
      .set({ createdAt: new Date(Date.now() - 31 * 864e5), expiresAt: new Date(Date.now() - 24 * 864e5) })
      .where(eq(surveyInvitesTable.id, old.body.id));
    expect((await list()).some((i) => i.id === old.body.id)).toBe(false);
  });
});

describe("przypomnienie i ponowne wysłanie", () => {
  it("przypomnienie: wysyła krótszy mail, drugi raz w ciągu 24 h → 429; poprzedni link dalej działa", async () => {
    configureSmtp();
    const inv = await create({ clientName: "Kasia", intendedEmail: uniqueEmail(), sendEmail: true });
    expect(inv.body.email.sent).toBe(true);
    const firstToken = inv.body.token;
    await request(app).get(`/api/public/survey/${firstToken}`); // opened

    // The invitation e-mail itself counts: a reminder right after it is too soon.
    const tooSoon = await request(app).post(`/api/survey-invites/${inv.body.id}/remind`);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.code).toBe("REMINDER_TOO_SOON");

    await db
      .update(surveyInvitesTable)
      .set({ lastSentAt: new Date(Date.now() - 25 * 3600e3) })
      .where(eq(surveyInvitesTable.id, inv.body.id));
    sendMail.mockClear();
    const remind = await request(app).post(`/api/survey-invites/${inv.body.id}/remind`);
    expect(remind.status).toBe(200);
    expect(remind.body.email).toEqual({ requested: true, sent: true });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Przypomnienie: wywiad treningowy od Anna");
    expect(mail.text).toContain(remind.body.url);

    expect((await request(app).post(`/api/survey-invites/${inv.body.id}/remind`)).status).toBe(429);

    // Both the old and the new link open the same invitation.
    expect((await request(app).get(`/api/public/survey/${firstToken}`)).status).toBe(200);
    expect((await request(app).get(`/api/public/survey/${remind.body.token}`)).status).toBe(200);
  });

  it("zaproszenie typu link: „wyślij ponownie” daje nowy link bez maila", async () => {
    configureSmtp();
    const inv = await create({ clientName: "Link Resend" });
    const res = await request(app).post(`/api/survey-invites/${inv.body.id}/resend`);
    expect(res.status).toBe(200);
    expect(res.body.token).not.toBe(inv.body.token);
    expect(res.body.email).toEqual({ requested: false, sent: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("nieaktywne zaproszenie (odwołane) → 409", async () => {
    const inv = await create({ clientName: "Odwołane 2", intendedEmail: uniqueEmail() });
    await request(app).delete(`/api/survey-invites/${inv.body.id}`);
    expect((await request(app).post(`/api/survey-invites/${inv.body.id}/remind`)).status).toBe(409);
  });
});

describe("izolacja trener A / B", () => {
  it("trener B nie widzi, nie przypomina, nie wysyła ponownie i nie odwołuje zaproszeń A", async () => {
    const inv = await create({ clientName: "Tylko A", intendedEmail: uniqueEmail() });
    mockUserId = B;
    const listB = await list();
    expect(listB.some((i) => i.id === inv.body.id)).toBe(false);
    expect(JSON.stringify(listB)).not.toContain("Tylko A");
    expect((await request(app).post(`/api/survey-invites/${inv.body.id}/remind`)).status).toBe(404);
    expect((await request(app).post(`/api/survey-invites/${inv.body.id}/resend`)).status).toBe(404);
    expect((await request(app).delete(`/api/survey-invites/${inv.body.id}`)).status).toBe(404);
    // B's duplicate check does not see A's invitation either.
    expect((await create({ clientName: "Tylko A" })).status).toBe(201);
    mockUserId = A;
    expect((await list()).find((i) => i.id === inv.body.id)?.status).toBe("sent");
  });
});
