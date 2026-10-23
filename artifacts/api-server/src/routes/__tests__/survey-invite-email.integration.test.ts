/**
 * POST /survey-invites with sendEmail: link from APP_PUBLIC_URL (never from the
 * request Host), Polish e-mail content, readable message without SMTP config.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

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

const TRAINER = "invite_email_test_trainer";
const SMTP_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "APP_PUBLIC_URL"] as const;
let trainerId = 0;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const k of SMTP_KEYS) saved[k] = process.env[k];
  await db.delete(trainersTable).where(eq(trainersTable.clerkUserId, TRAINER));
  const [t] = await db.insert(trainersTable).values({ clerkUserId: TRAINER }).returning();
  trainerId = t.id;
});
beforeEach(() => {
  mockUserId = TRAINER;
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
  await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

const configureSmtp = () => {
  process.env["SMTP_HOST"] = "smtp.example.invalid";
  process.env["SMTP_USER"] = "sender@example.invalid";
  process.env["SMTP_PASS"] = "not-a-real-password";
};

describe("POST /api/survey-invites with sendEmail", () => {
  it("without SMTP config: invite still created, readable message, nothing sent", async () => {
    const res = await request(app).post("/api/survey-invites").send({ intendedEmail: "k@example.com", sendEmail: true });
    expect(res.status).toBe(201);
    expect(res.body.email).toMatchObject({ requested: true, sent: false, code: "SMTP_NOT_CONFIGURED" });
    expect(res.body.email.message).toContain("nie jest skonfigurowana");
    expect(res.body.url).toBe(`http://localhost:23889/client-landing/survey/${res.body.token}`);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a Polish e-mail with the APP_PUBLIC_URL link, even when the Host header is hostile", async () => {
    configureSmtp();
    process.env["APP_PUBLIC_URL"] = "https://panel.example.pl/";
    const res = await request(app)
      .post("/api/survey-invites")
      .set("Host", "evil.example")
      .set("X-Forwarded-Host", "evil.example")
      .send({ intendedEmail: "k@example.com", sendEmail: true, trainerName: "Anna <b>Nowak</b>" });
    expect(res.status).toBe(201);
    expect(res.body.email).toEqual({ requested: true, sent: true });
    const expectedUrl = `https://panel.example.pl/client-landing/survey/${res.body.token}`;
    expect(res.body.url).toBe(expectedUrl);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("k@example.com");
    expect(mail.subject).toContain("zaprasza Cię do wywiadu treningowego");
    expect(mail.text).toContain(expectedUrl);
    expect(mail.html).toContain(`href="${expectedUrl}"`);
    expect(mail.html).toContain("Anna &lt;b&gt;Nowak&lt;/b&gt;"); // escaped
    expect(mail.html).not.toContain("evil.example");
    expect(mail.text).toContain("ważny 7 dni");
    expect(mail.text).toContain("wywiad");
  });

  it("send failure: invite created, neutral message without server details", async () => {
    configureSmtp();
    sendMail.mockRejectedValue(new Error("535 auth failed for sender@example.invalid / not-a-real-password"));
    const res = await request(app).post("/api/survey-invites").send({ intendedEmail: "k@example.com", sendEmail: true });
    expect(res.status).toBe(201);
    expect(res.body.email).toMatchObject({ sent: false, code: "SEND_FAILED" });
    expect(JSON.stringify(res.body)).not.toContain("not-a-real-password");
  });

  it("sendEmail without an address: readable message, nothing sent", async () => {
    configureSmtp();
    const res = await request(app).post("/api/survey-invites").send({ sendEmail: true });
    expect(res.status).toBe(201);
    expect(res.body.email).toMatchObject({ sent: false, code: "NO_RECIPIENT" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("without sendEmail nothing is sent (link only)", async () => {
    configureSmtp();
    const res = await request(app).post("/api/survey-invites").send({ intendedEmail: "k@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.email).toEqual({ requested: false, sent: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("no session → 401", async () => {
    mockUserId = null;
    expect((await request(app).post("/api/survey-invites").send({ sendEmail: true })).status).toBe(401);
  });
});
