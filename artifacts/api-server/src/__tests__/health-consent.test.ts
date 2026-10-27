/**
 * Zgoda na dane o zdrowiu (blok 5d): zapis (data + wersja), brak zgody = brak odpowiedzi zdrowotnych, wycofanie przez klienta,
 * podgląd dla trenera tylko u własnego klienta, najostrożniejsze ustawienia generatora bez zgody. Baza testowa.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, surveyInvitesTable } from "@workspace/db";
import { HEALTH_CONSENT_VERSION } from "@workspace/survey-config";
import { buildCompatibilityFilter } from "../services/planDraftDayRecommendationsService";
import { isConservativeHealth, violatesConservative } from "../services/jointExclusion";

const A = "health_consent_trainer_a", B = "health_consent_trainer_b", CLIENT = "health_consent_client_x";
let idA = 0, idB = 0;
const emails: string[] = [];
let seq = 0;

beforeAll(async () => {
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
  idA = (await db.insert(trainersTable).values({ clerkUserId: A }).returning())[0]!.id;
  idB = (await db.insert(trainersTable).values({ clerkUserId: B }).returning())[0]!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(inArray(clientsTable.email, emails));
  await db.delete(surveyInvitesTable).where(inArray(surveyInvitesTable.trainerId, [idA, idB]));
  await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
  await pool.end();
});

async function submit(over: Record<string, unknown>, clientAuthId?: string) {
  // the fixture trainer is on the FREE plan (3 clients): rows are removed right after reading unless the test needs the client
  if (!clientAuthId) await db.delete(clientsTable).where(inArray(clientsTable.email, emails));
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(surveyInvitesTable).values({ trainerId: idA, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) });
  const email = `consent-${Date.now()}-${++seq}@example.invalid`; emails.push(email);
  const res = await request(app).post(`/api/public/survey/${token}`).send({
    firstName: "Zgoda", lastName: "Test", email, dateOfBirth: "1990-05-05", gender: "Kobieta", experienceLevel: "Początkujący", trainingDuration: "6 miesięcy",
    sessionDuration: "45–60 min", desiredWeeklyFrequency: 3, trainingLocation: "Siłownia", activityLevel: "Lekko aktywny", heightCm: 170, weightKg: 65, ...over,
  });
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
  if (client && clientAuthId) await db.update(clientsTable).set({ clerkUserId: clientAuthId } as never).where(eq(clientsTable.id, client.id));
  const [survey] = client ? await db.select().from(surveysTable).where(eq(surveysTable.clientId, client.id)) : [];
  return { res, client, survey };
}

describe("zapis zgody w wywiadzie", () => {
  it("zgoda udzielona: status, data i wersja; pytanie o zdrowie obowiązuje", async () => {
    const { res, survey } = await submit({ healthConsent: true, injuryStatus: "Tak", healthLimitations: "bark" });
    expect(res.status).toBe(201);
    expect(survey!.healthConsentStatus).toBe("given");
    expect(survey!.healthConsentAt).toBeInstanceOf(Date);
    expect(survey!.healthConsentVersion).toBe(HEALTH_CONSENT_VERSION);
    expect(survey!.healthLimitations).toBe("bark");
    expect((await submit({ healthConsent: true })).res.status).toBe(400); // zgoda bez odpowiedzi na pytanie
  });
  it("zgoda nieudzielona: wywiad działa, dane zdrowotne nie są zapisane (nawet gdy przyszły w zgłoszeniu)", async () => {
    const { res, survey } = await submit({ healthConsent: false, injuryStatus: "Tak", healthLimitations: "kolano" });
    expect(res.status).toBe(201);
    expect(survey!.healthConsentStatus).toBe("declined");
    expect(survey!.injuryStatus).toBeNull();
    expect(survey!.healthLimitations ?? "").toBe("");
  });
  it("starszy klient bez pola: dotychczasowe zachowanie (status NULL, pytanie o zdrowie wymagane)", async () => {
    const ok = await submit({ injuryStatus: "Brak" });
    expect(ok.res.status).toBe(201); expect(ok.survey!.healthConsentStatus).toBeNull();
    expect((await submit({})).res.status).toBe(400);
  });
});

describe("wycofanie i podgląd", () => {
  it("klient wycofuje zgodę; trener widzi status tylko u własnego klienta", async () => {
    const { client, res: r0 } = await submit({ healthConsent: true, injuryStatus: "Brak" }, CLIENT);
    expect(r0.status, JSON.stringify(r0.body)).toBe(201);
    const [chk] = await db.select({ c: clientsTable.clerkUserId }).from(clientsTable).where(eq(clientsTable.id, client!.id));
    expect(chk!.c, 'clerkUserId').toBe(CLIENT);
    mockUser = CLIENT;
    const before = await request(app).get("/api/client-portal/health-consent");
    expect(before.status).toBe(200); expect(before.body.status).toBe("given");
    const w = await request(app).post("/api/client-portal/health-consent/withdraw");
    expect(w.status).toBe(200); expect(w.body.status).toBe("withdrawn"); expect(w.body.withdrawnAt).toBeTruthy();
    mockUser = A;
    const own = await request(app).get(`/api/clients/${client!.id}/health-consent`);
    expect(own.status).toBe(200); expect(own.body.status).toBe("withdrawn");
    mockUser = B;
    expect((await request(app).get(`/api/clients/${client!.id}/health-consent`)).status).toBe(404);
    mockUser = null;
    expect((await request(app).get("/api/client-portal/health-consent")).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).post("/api/client-portal/health-consent/withdraw")).status).toBeGreaterThanOrEqual(401);
  });
});

describe("najostrożniejsze ustawienia bez zgody", () => {
  it("tylko declined/withdrawn; wysokie obciążenie stawów odpada, reszta zostaje", () => {
    expect(isConservativeHealth("declined")).toBe(true); expect(isConservativeHealth("withdrawn")).toBe(true);
    for (const s of ["given", null, undefined]) expect(isConservativeHealth(s)).toBe(false);
    expect(violatesConservative({ jointStress: "Wysokie" }, true)).toBe(true);
    expect(violatesConservative({ jointStress: "Wysokie" }, false)).toBe(false);
    expect(violatesConservative({ jointStress: "Średnie" }, true)).toBe(false);
    const base = { trainingLocation: ["Siłownia"], equipment: ["Masa własnego ciała"], requiredEquipmentAll: [] as string[] };
    const f = buildCompatibilityFilter("Siłownia", null, new Set(), new Set(), true);
    expect(f({ id: 1, ...base, jointStress: "Wysokie" })).toBe(false);
    expect(f({ id: 2, ...base, jointStress: "Niskie" })).toBe(true);
    expect(buildCompatibilityFilter("Siłownia", null, new Set())({ id: 1, ...base, jointStress: "Wysokie" })).toBe(true);
  });
});
