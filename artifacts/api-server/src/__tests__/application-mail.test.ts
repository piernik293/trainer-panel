/** Maile przy wniosku o konto trenera (atrapa SMTP): do właściciela przy nowym wniosku, do wnioskodawcy po akceptacji i odrzuceniu; brak SMTP nie psuje wniosku. */
let authUser: string | null = null;
const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => { sent.push({ to: m.to, subject: m.subject, text: m.text }); } }) } }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: id.endsWith("a") ? "Ala" : "Bartek", lastName: "Test", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, trainersTable, trainerApplicationsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { ownerAddress } from "../services/applicationMail";

const ADMIN = "appmail_admin", PA = "appmail_person_a", PB = "appmail_person_b";
const USERS = [PA, PB];
const as = (u: string | null) => { authUser = u; };
async function cleanup() {
  await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, USERS));
  await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, USERS));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, USERS));
}
beforeAll(async () => {
  Object.assign(process.env, { SMTP_HOST: "smtp.example.invalid", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "noreply@example.invalid", OWNER_NOTIFY_EMAIL: "wlasciciel@poczta-testowa.pl", APP_ADMIN_CLERK_IDS: ADMIN });
  await provisionTrainer(ADMIN); await cleanup();
});
afterAll(async () => { await cleanup(); for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "OWNER_NOTIFY_EMAIL"]) delete process.env[k]; });
beforeEach(() => { sent.length = 0; });

describe("adres właściciela", () => {
  it("OWNER_NOTIFY_EMAIL, a gdy pusty — ADMIN_EMAIL; bez obu null", () => {
    expect(ownerAddress({ OWNER_NOTIFY_EMAIL: " a@b.pl ", ADMIN_EMAIL: "x@y.pl" })).toBe("a@b.pl");
    expect(ownerAddress({ OWNER_NOTIFY_EMAIL: "", ADMIN_EMAIL: "x@y.pl" })).toBe("x@y.pl");
    expect(ownerAddress({})).toBeNull();
  });
});

describe("maile", () => {
  it("nowy wniosek: mail do właściciela z imieniem wnioskodawcy", async () => {
    as(PA); expect((await request(app).post("/api/trainer-applications").send({ note: "Prowadzę klientów" })).status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "wlasciciel@poczta-testowa.pl", subject: "Nowy wniosek o konto trenera" });
    expect(sent[0]!.text).toContain("Ala Test"); expect(sent[0]!.text).toContain("Prowadzę klientów");
  });
  it("akceptacja: mail „Twoje konto trenera jest aktywne” do wnioskodawcy", async () => {
    as(ADMIN); const list = await request(app).get("/api/admin/trainer-applications?status=pending");
    const mine = list.body.applications.find((a: { name: string }) => a.name === "Ala Test");
    sent.length = 0;
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/accept`)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: `${PA}@poczta-testowa.pl`, subject: "Twoje konto trenera jest aktywne" });
    expect(sent[0]!.text).toContain("zaloguj się");
  });
  it("odrzucenie: krótka odmowa z ponownym wnioskiem za 14 dni", async () => {
    as(PB); await request(app).post("/api/trainer-applications").send({});
    as(ADMIN); const list = await request(app).get("/api/admin/trainer-applications?status=pending");
    const mine = list.body.applications.find((a: { name: string }) => a.name === "Bartek Test");
    sent.length = 0;
    expect((await request(app).post(`/api/admin/trainer-applications/${mine.id}/reject`)).status).toBe(200);
    expect(sent[0]).toMatchObject({ to: `${PB}@poczta-testowa.pl` });
    expect(sent[0]!.text).toContain("14 dni");
  });
  it("bez ustawień SMTP wniosek i tak się zapisuje (mail jest dodatkiem)", async () => {
    const keep = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
    await db.delete(trainerApplicationsTable).where(inArray(trainerApplicationsTable.clerkUserId, [PB]));
    as(PB); expect((await request(app).post("/api/trainer-applications").send({})).status).toBe(201);
    expect(sent).toHaveLength(0);
    process.env.SMTP_HOST = keep;
  });
});
