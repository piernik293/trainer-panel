/** Blok 1: maile systemowe idą na e-mail konta z Clerk, nigdy na adres zastępczy (profil „Mój trening”); blokada domen .invalid/.example/.test. */
let authUser: string | null = null;
const sent: Array<{ to: string; subject: string; from: string; replyTo?: string }> = [];
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (m: { to: string; subject: string; from: string; replyTo?: string }) => { sent.push({ to: m.to, subject: m.subject, from: m.from, replyTo: m.replyTo }); } }) } }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "Ola", lastName: "Wniosek", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, trainerApplicationsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { isPlaceholderAddress } from "../services/mailAddress";
import { sendPlainEmail, senderHeader } from "../services/inviteEmail";

const ADMIN = "mailadr_admin", P = "mailadr_person";
async function cleanup() {
  await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, [P]));
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [P]));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [P]));
}
beforeAll(async () => {
  Object.assign(process.env, { SMTP_HOST: "smtp.test.pl", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "noreply@optimatren.pl", OWNER_NOTIFY_EMAIL: "wlasciciel@poczta-testowa.pl", APP_ADMIN_CLERK_IDS: ADMIN });
  await provisionTrainer(ADMIN); await cleanup();
});
afterAll(async () => { await cleanup(); for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "OWNER_NOTIFY_EMAIL"]) delete process.env[k]; });
beforeEach(() => { sent.length = 0; });

describe("adresy zastępcze", () => {
  it("rozpoznaje .invalid/.example/.test/.localhost i błędne adresy", () => {
    for (const a of ["self.training@example.invalid", "a@b.example", "a@b.test", "a@localhost", "bez-malpy", "", null, undefined]) expect(isPlaceholderAddress(a)).toBe(true);
    for (const a of ["anna@gmail.com", "ola@poczta-testowa.pl"]) expect(isPlaceholderAddress(a)).toBe(false);
  });
  it("sendPlainEmail nie wysyła na adres zastępczy (zwraca false, nic nie wychodzi)", async () => {
    expect(await sendPlainEmail({ to: "self.training@example.invalid", subject: "x", text: "y" })).toBe(false);
    expect(sent).toHaveLength(0);
    expect(await sendPlainEmail({ to: "ola@poczta-testowa.pl", subject: "x", text: "y" })).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe("nazwa nadawcy", () => {
  it("systemowy: „Optimatren”; w imieniu trenera: „Imię Nazwisko przez Optimatren”", () => {
    expect(senderHeader(null)).toBe('"Optimatren" <noreply@optimatren.pl>');
    expect(senderHeader("Marek Nowak")).toBe('"Marek Nowak przez Optimatren" <noreply@optimatren.pl>');
  });
  it("Reply-To trenera w mailu w jego imieniu", async () => {
    await sendPlainEmail({ to: "ola@poczta-testowa.pl", subject: "x", text: "y", fromName: "Marek Nowak", replyTo: "marek@gmail.com" });
    expect(sent[0]).toMatchObject({ replyTo: "marek@gmail.com", from: '"Marek Nowak przez Optimatren" <noreply@optimatren.pl>' });
  });
});

describe("regresja: akceptacja wniosku przy profilu „Mój trening” z adresem zastępczym", () => {
  it("mail „konto trenera aktywne” idzie na e-mail z Clerk, nie na adres z rekordu klienta", async () => {
    await db.insert(clientsTable).values({ firstName: "Mój trening", lastName: "", email: "self.training@example.invalid", clerkUserId: P });
    authUser = P; expect((await request(app).post("/api/trainer-applications").send({})).status).toBe(201);
    authUser = ADMIN;
    const list = await request(app).get("/api/admin/trainer-applications?status=pending");
    const mine = list.body.applications.find((a: { email: string }) => a.email === `${P}@poczta-testowa.pl`);
    expect(mine).toBeTruthy(); // wniosek zapisany z adresem z Clerk
    sent.length = 0;
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/accept`)).status).toBe(200);
    expect(sent.map((m) => m.to)).toEqual([`${P}@poczta-testowa.pl`]);
    expect(sent.some((m) => m.to.includes("invalid"))).toBe(false);
  });
});
