/** Wywiad wpisywany przez trenera: zgoda na dane o zdrowiu (27.10.2026). Bez zaznaczenia = najostrożniejsze ustawienia; starsze wywiady (NULL) bez zmian. */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { isConservativeHealth } from "../services/jointExclusion";
import { trainerConsentFields } from "../routes/surveys";

const TA = "consent_iv_trainer_a", EMAIL = "consent-iv-a1@example.invalid";
let clientId: number;
const as = (u: string | null) => { authUser = u; };
const base = { trainingGoal: "Budowa sylwetki", experienceLevel: "Początkujący", weeklyFrequency: 3 };
const statusOf = async (surveyId: number) => (await db.select({ s: surveysTable.healthConsentStatus, v: surveysTable.healthConsentVersion }).from(surveysTable).where(eq(surveysTable.id, surveyId)))[0]!;

beforeAll(async () => {
  const t = (await provisionTrainer(TA))!;
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  clientId = (await db.insert(clientsTable).values({ firstName: "Zgoda", lastName: "Wywiad", email: EMAIL, trainerId: t.id }).returning())[0]!.id;
});
afterAll(async () => { await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL)); });

describe("trainerConsentFields", () => {
  it("brak pola = bez zmian; true = given; false = declined", () => {
    expect(trainerConsentFields(undefined)).toEqual({});
    expect(trainerConsentFields(true).healthConsentStatus).toBe("given");
    expect(trainerConsentFields(false).healthConsentStatus).toBe("declined");
    expect(isConservativeHealth(trainerConsentFields(false).healthConsentStatus)).toBe(true);
    expect(isConservativeHealth(trainerConsentFields(true).healthConsentStatus)).toBe(false);
  });
});

describe("zapis wywiadu przez trenera", () => {
  it("bez zaznaczenia (false) → declined, czyli najostrożniejsze ustawienia", async () => {
    as(TA);
    const r = await request(app).put(`/api/clients/${clientId}/survey`).send({ ...base, healthConsent: false });
    expect(r.status).toBe(200);
    const s = await statusOf(r.body.id);
    expect(s.s).toBe("declined");
    expect(isConservativeHealth(s.s)).toBe(true);
  });
  it("zaznaczone (true) → given, wersja oznaczona jako od trenera", async () => {
    as(TA);
    const r = await request(app).put(`/api/clients/${clientId}/survey`).send({ ...base, healthConsent: true });
    const s = await statusOf(r.body.id);
    expect(s.s).toBe("given"); expect(s.v).toMatch(/:trainer$/);
    expect(isConservativeHealth(s.s)).toBe(false);
  });
  it("pole pominięte (starszy klient API) → status NULL, zachowanie bez zmian", async () => {
    as(TA);
    const r = await request(app).put(`/api/clients/${clientId}/survey`).send(base);
    expect((await statusOf(r.body.id)).s).toBeNull();
  });
  it("edycja istniejącego wywiadu bez pola nie zmienia statusu; z polem zmienia", async () => {
    as(TA);
    const created = await request(app).put(`/api/clients/${clientId}/survey`).send(base);
    const id = created.body.id;
    await request(app).patch(`/api/clients/${clientId}/surveys/${id}`).send({ ...base, weeklyFrequency: 4 });
    expect((await statusOf(id)).s).toBeNull();
    await request(app).patch(`/api/clients/${clientId}/surveys/${id}`).send({ ...base, healthConsent: true });
    expect((await statusOf(id)).s).toBe("given");
  });
  it("cudzy trener nie ustawi zgody cudzemu klientowi", async () => {
    await provisionTrainer("consent_iv_trainer_b");
    as("consent_iv_trainer_b");
    expect((await request(app).put(`/api/clients/${clientId}/survey`).send({ ...base, healthConsent: true })).status).toBe(404);
  });
});
