/** Animacje ćwiczeń (EXERCISE_ANIMATIONS_ENABLED): flaga, seed „do sprawdzenia”, w aplikacji tylko zatwierdzone, zatwierdzanie/do poprawy tylko przez administratora, walidacja danych. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { ANIMATION_LIBRARY, validateSpec, solve, poseAt, type AnimSpec } from "@workspace/survey-config";

const auth = vi.hoisted(() => ({ userId: "an_admin" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, exerciseAnimationsTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const ADMIN = "an_admin", TR = "an_trener";
const as = (id: string | null) => { auth.userId = id; };
const on = () => vi.stubEnv("EXERCISE_ANIMATIONS_ENABLED", "1");
const IDS = ANIMATION_LIBRARY.map((a) => a.exerciseId);
async function wipe() {
  await db.delete(exerciseAnimationsTable).where(inArray(exerciseAnimationsTable.exerciseId, IDS));
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [ADMIN, TR]));
}
beforeAll(async () => { await wipe(); Object.assign(process.env, { APP_ADMIN_CLERK_IDS: ADMIN }); await provisionTrainer(ADMIN); await provisionTrainer(TR); }, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(ADMIN); });
afterAll(async () => { await wipe(); delete process.env.APP_ADMIN_CLERK_IDS; await pool.end(); });

describe("biblioteka animacji (dane)", () => {
  it("każda animacja przechodzi walidację (pętla bez skoku, nic pod podłogą ani poza kadrem), a ćwiczenia są unikalne", () => {
    expect(ANIMATION_LIBRARY.length).toBeGreaterThanOrEqual(8);
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const a of ANIMATION_LIBRARY) expect(validateSpec(a.spec), a.name).toEqual([]);
  });
  it("kontakt z podłożem: w pompkach, pompkach na kolanach i desce nadgarstek/łokieć dotyka podłogi, a kostka stoi na niej przez cały ruch", () => {
    for (const id of [117, 118, 5]) {
      const a = ANIMATION_LIBRARY.find((x) => x.exerciseId === id)!;
      for (let u = 0; u < 1; u += 0.05) {
        const sk = solve(a.spec, poseAt(a.spec.frames, u));
        expect(Math.abs(sk.points.wrist.y - (a.spec.floorY - 4)), `${a.name} u=${u.toFixed(2)} nadgarstek`).toBeLessThan(6);
        expect(Math.abs(sk.points.ankle.y - (a.spec.floorY - 8)), `${a.name} kostka`).toBeLessThan(1);
      }
    }
  });
  it("walidator odrzuca złe dane", () => {
    const base = ANIMATION_LIBRARY[0]!.spec;
    expect(validateSpec({ ...base, frames: base.frames.slice(0, 2) })).toContain("Za mało klatek kluczowych");
    expect(validateSpec({ ...base, duration: 10 })).toContain("Pętla powinna trwać 1,5–4 s");
    const jump = JSON.parse(JSON.stringify(base)) as AnimSpec; jump.frames[jump.frames.length - 1]!.pose.base += 20;
    expect(validateSpec(jump)).toContain("Pierwsza i ostatnia klatka muszą być takie same (pętla bez skoku)");
  });
});

describe("API", () => {
  it("wyłączona: status false i 404 dla użytkowników — nawet zatwierdzona animacja nie wychodzi; administrator może oceniać (panel działa bez flagi)", async () => {
    expect((await request(app).get("/api/exercise-animations/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/exercise-animations/117")).status).toBe(404);
    as(ADMIN); expect((await request(app).get("/api/admin/animations")).status).toBe(200);
    as(TR); expect((await request(app).get("/api/admin/animations")).status).toBe(403);
  });
  it("seed wstawia „do sprawdzenia”; zwykły użytkownik nie widzi niezatwierdzonych; trener nie zatwierdza", async () => {
    on(); as(TR); expect((await request(app).post("/api/admin/animations/seed")).status).toBe(403);
    as(ADMIN); const s = await request(app).post("/api/admin/animations/seed"); expect(s.status).toBe(201);
    expect(s.body.added.length + s.body.skipped.length).toBe(IDS.length);
    const again = await request(app).post("/api/admin/animations/seed"); expect(again.body.added).toEqual([]); // idempotentne
    const id = s.body.added[0] as number;
    as(TR); expect((await request(app).get(`/api/exercise-animations/${id}`)).status).toBe(404); // „do sprawdzenia” nie wychodzi
    expect((await request(app).post(`/api/admin/animations/${id}/approve`)).status).toBe(403);
    as(null); expect((await request(app).get(`/api/exercise-animations/${id}`)).status).toBe(401);
  });
  it("zatwierdzenie: kto i kiedy, wtedy widoczna; „Do poprawy” wymaga uwagi i ją cofa; niepoprawne dane nie przejdą", async () => {
    on(); as(ADMIN);
    const list = (await request(app).get("/api/admin/animations")).body.items as { exerciseId: number; status: string }[];
    expect(list.length).toBeGreaterThan(0); expect(list.every((i) => i.status === "review")).toBe(true);
    const id = list[0]!.exerciseId;
    expect((await request(app).post(`/api/admin/animations/${id}/approve`)).status).toBe(200);
    const [row] = await db.select().from(exerciseAnimationsTable).where(eq(exerciseAnimationsTable.exerciseId, id));
    expect(row).toMatchObject({ status: "approved", approvedBy: ADMIN }); expect(row!.approvedAt).toBeTruthy();
    as(TR); const ok = await request(app).get(`/api/exercise-animations/${id}`); expect(ok.status).toBe(200); expect(ok.body.spec.version).toBe(1);
    as(ADMIN);
    expect((await request(app).post(`/api/admin/animations/${id}/needs-work`).send({ note: "x" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/animations/${id}/needs-work`).send({ note: "Kolana za mocno do środka" })).status).toBe(200);
    as(TR); expect((await request(app).get(`/api/exercise-animations/${id}`)).status).toBe(404); // znów ukryta
    as(ADMIN);
    const bad = JSON.parse(JSON.stringify((await db.select().from(exerciseAnimationsTable).where(eq(exerciseAnimationsTable.exerciseId, id)))[0]!.spec));
    bad.duration = 99; await db.update(exerciseAnimationsTable).set({ spec: bad }).where(eq(exerciseAnimationsTable.exerciseId, id));
    const r = await request(app).post(`/api/admin/animations/${id}/approve`); expect(r.status).toBe(422); expect(r.body.code).toBe("INVALID_SPEC");
    expect((await request(app).post("/api/admin/animations/99999999/approve")).status).toBe(404);
  });
});
