/**
 * Every way of sending the interview invitation uses ONE template (services/inviteEmail.ts).
 * 1) static: only inviteEmail.ts may call sendMail for invitations; the old texts/colours are gone;
 * 2) behaviour: the profile-page route POST /clients/:id/survey-invite sends the new e-mail.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

let mockUserId: string | null = null;
const sendMail = vi.fn();
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveyInvitesTable } from "@workspace/db";

const SRC = join(__dirname, "..");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" || n === "node_modules" ? [] : sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("one invitation template", () => {
  const files = sources(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf8") }));
  it("only services/inviteEmail.ts sends invitations; the only other sendMail is the admin notification", () => {
    const senders = files.filter((f) => /\.sendMail\(/.test(f.text)).map((f) => f.path).sort();
    expect(senders).toEqual(["routes/public.ts", "services/inviteEmail.ts"]);
    const pub = files.find((f) => f.path === "routes/public.ts")!.text;
    expect(pub).toMatch(/Nowy wywiad treningowy od klienta/); // admin notification, not an invitation
    expect(pub).not.toMatch(/Wypełnij wywiad|Twój wywiad treningowy/);
  });
  it("the old template (subject, blue button) exists nowhere", () => {
    for (const f of files) {
      expect(f.text, f.path).not.toMatch(/Twój wywiad treningowy/);
      expect(f.text, f.path).not.toMatch(/#2563eb/i);
      expect(f.text, f.path).not.toMatch(/sendSurveyInviteEmail/);
    }
  });
});

describe("POST /clients/:id/survey-invite (profile / new client path)", () => {
  const T = "single_template_trainer";
  let clientId = 0, trainerId = 0;
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "SMTP_FROM", "APP_PUBLIC_URL"] as const;
  beforeAll(async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, T));
    const [t] = await db.insert(trainersTable).values({ clerkUserId: T, displayName: "Anna Nowak", email: "anna.trener@example.com" }).returning();
    trainerId = t!.id;
    const [c] = await db.insert(clientsTable).values({ firstName: "Marta", lastName: "T", email: "marta-template@example.invalid", trainerId }).returning();
    clientId = c!.id;
  });
  beforeEach(() => {
    mockUserId = T; sendMail.mockReset(); sendMail.mockResolvedValue({});
    Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_USER: "bot@example.com", SMTP_PASS: "x", SMTP_PORT: "587", APP_PUBLIC_URL: "https://app.example.com" });
  });
  afterAll(async () => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
    await db.delete(clientsTable).where(inArray(clientsTable.id, [clientId]));
    await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
    await pool.end();
  });

  it("sends the new template: trainer in sender and subject, orange button, text version, Reply-To, public link", async () => {
    const res = await request(app).post(`/api/clients/${clientId}/survey-invite`).send({});
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]![0] as { from: string; subject: string; html: string; text: string; replyTo?: string };
    expect(mail.subject).toBe("Anna zaprasza Cię do wywiadu treningowego");
    expect(mail.subject).not.toBe("Twój wywiad treningowy");
    expect(mail.from).toContain("Anna Nowak · Optimatren");
    expect(mail.replyTo).toBe("anna.trener@example.com");
    expect(mail.html).not.toMatch(/#2563eb/i);
    expect(mail.html).toContain("https://app.example.com/client-landing/survey/");
    expect(mail.text).toContain("Cześć Marta,");
    expect(res.body.url).toBe(mail.text.match(/https:\/\/\S+/)![0]);
  });
  it("SMTP failure is reported with the neutral message, the invitation stays", async () => {
    sendMail.mockRejectedValue(new Error("boom smtp secret"));
    const res = await request(app).post(`/api/clients/${clientId}/survey-invite`).send({});
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.emailError).toMatch(/skopiuj link/);
    expect(JSON.stringify(res.body)).not.toMatch(/boom|secret/);
  });
});
