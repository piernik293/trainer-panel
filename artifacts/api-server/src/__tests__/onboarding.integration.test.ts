/** Samouczek trenera (ONBOARDING_ENABLED): flaga, kroki z danych, pominięcie/powrót, klient przykładowy nie liczy się do limitów/statystyk/pulpitu, usuwanie, izolacja. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, like, inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "ob_a" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, onboardingStateTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const A = "ob_a", B = "ob_b";
const as = (id: string | null) => { auth.userId = id; };
const on = () => vi.stubEnv("ONBOARDING_ENABLED", "1");
let idA = 0;
async function wipe() {
  const ts = await db.select({ id: trainersTable.id }).from(trainersTable).where(like(trainersTable.clerkUserId, "ob_%"));
  const ids = ts.map((t) => t.id);
  if (ids.length) {
    const cl = await db.select({ id: clientsTable.id }).from(clientsTable).where(inArray(clientsTable.trainerId, ids));
    if (cl.length) { await db.delete(surveysTable).where(inArray(surveysTable.clientId, cl.map((c) => c.id))); await db.delete(clientsTable).where(inArray(clientsTable.id, cl.map((c) => c.id))); }
    await db.delete(onboardingStateTable).where(inArray(onboardingStateTable.trainerId, ids));
  }
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "ob_%"));
}
beforeAll(async () => { await wipe(); idA = (await provisionTrainer(A))!.id; await provisionTrainer(B); }, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); await pool.end(); });

describe("samouczek", () => {
  it("wyłączony: status false, 404", async () => {
    expect((await request(app).get("/api/onboarding/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/onboarding")).status).toBe(404);
    expect((await request(app).post("/api/onboarding/example")).status).toBe(404);
  });
  it("4 kroki, początkowo żaden; pominięcie i powrót z menu zapamiętane na koncie", async () => {
    on();
    const v = (await request(app).get("/api/onboarding")).body;
    expect(v.steps.map((s: { id: string }) => s.id)).toEqual(["client", "invite", "plan", "activate"]);
    expect(v.steps.every((s: { done: boolean }) => !s.done)).toBe(true); expect(v.dismissed).toBe(false); expect(v.completed).toBe(false);
    await request(app).post("/api/onboarding/dismiss"); expect((await request(app).get("/api/onboarding")).body.dismissed).toBe(true);
    as(B); expect((await request(app).get("/api/onboarding")).body.dismissed).toBe(false); // per konto
    as(A); await request(app).post("/api/onboarding/show"); expect((await request(app).get("/api/onboarding")).body.dismissed).toBe(false);
    as(null); expect((await request(app).get("/api/onboarding")).status).toBe(401);
  });
  it("klient przykładowy: Anna (przykład), ból prawego kolana, status „przyklad”; idempotentny; zalicza krok „podopieczny” i „wywiad”", async () => {
    on();
    const c1 = (await request(app).post("/api/onboarding/example")).body.clientId as number;
    const c2 = (await request(app).post("/api/onboarding/example")).body.clientId as number; expect(c2).toBe(c1);
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, c1));
    expect(c).toMatchObject({ firstName: "Anna (przykład)", status: "active", isExample: true, trainerId: idA, email: null });
    const [s] = await db.select().from(surveysTable).where(eq(surveysTable.clientId, c1));
    expect(s).toMatchObject({ experienceLevel: "Początkujący", trainingLocation: "Siłownia", healthLimitations: "ból prawego kolana" });
    const v = (await request(app).get("/api/onboarding")).body;
    expect(v.steps.find((x: { id: string }) => x.id === "client").done).toBe(true); expect(v.steps.find((x: { id: string }) => x.id === "invite").done).toBe(true);
    expect(v.exampleClientId).toBe(c1);
  });
  it("przykład nie liczy się do statystyk, pulpitu ani limitu klientów", async () => {
    on();
    const stats = (await request(app).get("/api/stats")).body; expect(stats.totalClients).toBe(0);
    const dash = (await request(app).get("/api/dashboard/summary")).body;
    expect(JSON.stringify(dash)).not.toContain("Anna (przykład)");
    // limit klientów: zużycie „clients” bez przykładu
    const usage = (await request(app).get("/api/subscription/summary")).body;
    expect(usage.usage?.clients?.used ?? usage.clients?.used).toBe(0);
  });
  it("usunięcie jednym kliknięciem; cudzego przykładu nie usunie; ponowne usunięcie 404", async () => {
    on(); as(B);
    expect((await request(app).delete("/api/onboarding/example")).status).toBe(404); // B nie ma przykładu
    as(A);
    expect((await request(app).delete("/api/onboarding/example")).status).toBe(200);
    expect(await db.select().from(clientsTable).where(eq(clientsTable.isExample, true))).toEqual([]);
    expect((await request(app).delete("/api/onboarding/example")).status).toBe(404);
    expect((await request(app).get("/api/onboarding")).body.exampleClientId).toBeNull();
  });
});
