/**
 * Ustawienie podopiecznego „Kończ schłodzenie minutą spokojnego oddechu” (blok 3b): domyślnie wyłączone,
 * zmienia je tylko sam podopieczny, ustawienie jednego klienta nie wpływa na drugiego. Baza testowa.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, clientsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const TA = "settings_test_trainer_a";
const CA = "settings_test_client_a", CB = "settings_test_client_b";
const EMAILS = ["settings-a@example.invalid", "settings-b@example.invalid"];
const as = (u: string | null) => { authUser = u; };

beforeAll(async () => {
  const tA = (await provisionTrainer(TA))!;
  await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS));
  await db.insert(clientsTable).values([
    { firstName: "Ala", lastName: "Test", email: EMAILS[0]!, trainerId: tA.id, clerkUserId: CA },
    { firstName: "Ola", lastName: "Test", email: EMAILS[1]!, trainerId: tA.id, clerkUserId: CB },
  ]);
});
afterAll(async () => { await db.delete(clientsTable).where(inArray(clientsTable.email, EMAILS)); });

describe("/client-portal/settings", () => {
  it("domyślnie oddech w schłodzeniu jest wyłączony", async () => {
    as(CA);
    const r = await request(app).get("/api/client-portal/settings");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ breathingCooldown: false });
  });
  it("podopieczny włącza i wyłącza; drugi podopieczny zostaje przy swoim", async () => {
    as(CA);
    expect((await request(app).put("/api/client-portal/settings").send({ breathingCooldown: true })).body).toEqual({ breathingCooldown: true });
    expect((await request(app).get("/api/client-portal/settings")).body.breathingCooldown).toBe(true);
    as(CB);
    expect((await request(app).get("/api/client-portal/settings")).body.breathingCooldown).toBe(false);
    as(CA);
    await request(app).put("/api/client-portal/settings").send({ breathingCooldown: false });
    expect((await request(app).get("/api/client-portal/settings")).body.breathingCooldown).toBe(false);
  });
  it("odrzuca nieprawidłowe dane", async () => {
    as(CA);
    for (const body of [{}, { breathingCooldown: "tak" }, { breathingCooldown: 1 }]) {
      expect((await request(app).put("/api/client-portal/settings").send(body)).status).toBe(400);
    }
  });
  it("trener ani niezalogowany nie zmienią ustawienia", async () => {
    as(TA);
    expect((await request(app).put("/api/client-portal/settings").send({ breathingCooldown: true })).status).toBeGreaterThanOrEqual(401);
    as(null);
    expect((await request(app).put("/api/client-portal/settings").send({ breathingCooldown: true })).status).toBe(401);
  });
});
