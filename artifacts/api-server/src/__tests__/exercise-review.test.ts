/**
 * "Do weryfikacji" (blok 3): lista niezweryfikowanych, Zweryfikuj / Ukryj, osobny przełącznik „brak aktywności” z potwierdzeniem,
 * odmiany ćwiczenia. Uprawnienia: zmiana ćwiczenia z katalogu publicznego tylko dla administratora katalogu. Baza testowa.
 */
let authUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authUser }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { inArray, like } from "drizzle-orm";
import app from "../app";
import { db, exercisesTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";

const ADMIN = "review_test_admin", OTHER = "review_test_other";
const as = (u: string | null) => { authUser = u; };
let parentId: number, variantId: number, variant2Id: number, noLdId: number;

beforeAll(async () => {
  process.env.CATALOGUE_ADMIN_CLERK_IDS = ADMIN;
  await provisionTrainer(ADMIN); await provisionTrainer(OTHER);
  await db.delete(exercisesTable).where(like(exercisesTable.slug, "review-test-%"));
  const base = { mainMuscleGroup: "Plecy", equipment: ["Hantle"], difficultyLevel: "Średniozaawansowany", movementPattern: "Przyciąganie poziome", exerciseType: "Złożone", executionInstructions: "Opis." };
  const [p] = await db.insert(exercisesTable).values({ ...base, name: "Review główne", slug: "review-test-main" }).returning();
  parentId = p!.id;
  const [v] = await db.insert(exercisesTable).values({ ...base, name: "Review odmiana", slug: "review-test-variant", parentExerciseId: parentId, reviewedByTrainer: false, learningDifficulty: 2, suitableForNoActivity: false, equipment: ["Gumy oporowe"] }).returning();
  const [v2] = await db.insert(exercisesTable).values({ ...base, name: "Review odmiana 2", slug: "review-test-variant2", parentExerciseId: parentId, reviewedByTrainer: false, learningDifficulty: 3, difficultyLevel: "Zaawansowany" }).returning();
  const [n] = await db.insert(exercisesTable).values({ ...base, name: "Review bez trudności", slug: "review-test-nold", reviewedByTrainer: false }).returning();
  variantId = v!.id; variant2Id = v2!.id; noLdId = n!.id;
});
afterAll(async () => { await db.delete(exercisesTable).where(like(exercisesTable.slug, "review-test-%")); delete process.env.CATALOGUE_ADMIN_CLERK_IDS; });

describe("lista „Do weryfikacji”", () => {
  it("bez sesji 401", async () => { as(null); expect((await request(app).get("/api/exercises/review/pending")).status).toBe(401); });
  it("zawiera niezweryfikowane z nazwą ćwiczenia głównego; zweryfikowane i ukryte nie", async () => {
    as(ADMIN);
    const r = await request(app).get("/api/exercises/review/pending");
    expect(r.status).toBe(200);
    const ids = r.body.map((x: { id: number }) => x.id);
    expect(ids).toEqual(expect.arrayContaining([variantId, variant2Id, noLdId]));
    expect(ids).not.toContain(parentId);
    expect(r.body.find((x: { id: number }) => x.id === variantId)).toMatchObject({ parentName: "Review główne", equipment: ["Gumy oporowe"], canAct: true });
  });
  it("filtry: poziom, wzorzec, sprzęt", async () => {
    as(ADMIN);
    const ids = async (q: string) => (await request(app).get(`/api/exercises/review/pending?${q}`)).body.map((x: { id: number }) => x.id);
    expect(await ids("difficultyLevel=Zaawansowany")).toEqual(expect.arrayContaining([variant2Id]));
    expect(await ids("difficultyLevel=Zaawansowany")).not.toContain(variantId);
    expect(await ids("equipment=Gumy%20oporowe")).toContain(variantId);
    expect(await ids("equipment=Gumy%20oporowe")).not.toContain(variant2Id);
    expect(await ids("movementPattern=Przysiad")).not.toContain(variantId);
  });
  it("zwykły trener widzi listę, ale canAct = false", async () => {
    as(OTHER);
    const r = await request(app).get("/api/exercises/review/pending");
    expect(r.status).toBe(200);
    expect(r.body.find((x: { id: number }) => x.id === variantId)?.canAct).toBe(false);
  });
});

describe("akcje", () => {
  it("zwykły trener nie może zweryfikować ani ukryć ćwiczenia z katalogu (403)", async () => {
    as(OTHER);
    expect((await request(app).post(`/api/exercises/${variantId}/verify`)).status).toBe(403);
    expect((await request(app).post(`/api/exercises/${variantId}/hide`).send({ hidden: true })).status).toBe(403);
    expect((await request(app).post(`/api/exercises/${variantId}/no-activity`).send({ value: true, confirm: true })).status).toBe(403);
  });
  it("przełącznik „brak aktywności”: wymaga potwierdzenia, weryfikacji i oceny trudności; weryfikacja go nie włącza", async () => {
    as(ADMIN);
    const na = (id: number, b: object) => request(app).post(`/api/exercises/${id}/no-activity`).send(b);
    expect((await na(variantId, { value: true })).status).toBe(400);              // brak potwierdzenia
    expect((await na(variantId, { value: true, confirm: true })).status).toBe(409); // niezweryfikowane
    const v = await request(app).post(`/api/exercises/${variantId}/verify`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ reviewedByTrainer: true, suitableForNoActivity: false });
    expect((await na(noLdId, { value: true, confirm: true })).status).toBe(409);   // niezweryfikowane
    await request(app).post(`/api/exercises/${noLdId}/verify`);
    const noLd = await na(noLdId, { value: true, confirm: true });
    expect(noLd.status).toBe(409); expect(noLd.body.code).toBe("NO_LEARNING_DIFFICULTY");
    const ok = await na(variantId, { value: true, confirm: true });
    expect(ok.status).toBe(200); expect(ok.body.suitableForNoActivity).toBe(true);
    expect((await na(variantId, { value: false })).body.suitableForNoActivity).toBe(false); // wyłączenie bez potwierdzenia
  });
  it("zweryfikowane znika z listy; ukrycie wyłącza z generatora i z odmian, nic nie usuwa", async () => {
    as(ADMIN);
    const pending = async () => (await request(app).get("/api/exercises/review/pending")).body.map((x: { id: number }) => x.id);
    expect(await pending()).not.toContain(variantId);
    const h = await request(app).post(`/api/exercises/${variant2Id}/hide`).send({ hidden: true });
    expect(h.status).toBe(200); expect(h.body.hidden).toBe(true);
    expect(await pending()).not.toContain(variant2Id);
    const hiddenList = (await request(app).get("/api/exercises/review/pending?hidden=true")).body.map((x: { id: number }) => x.id);
    expect(hiddenList).toContain(variant2Id);
    const variants = (await request(app).get(`/api/exercises/${parentId}/variants`)).body.map((x: { id: number }) => x.id);
    expect(variants).toContain(variantId); expect(variants).not.toContain(variant2Id);
    const fromVariant = (await request(app).get(`/api/exercises/${variantId}/variants`)).body as { id: number; isMain: boolean }[];
    expect(fromVariant.find((x) => x.id === parentId)?.isMain).toBe(true);   // wariant → widzi ćwiczenie główne
    expect(fromVariant.map((x) => x.id)).not.toContain(variantId);           // ale nie siebie
    const back = await request(app).post(`/api/exercises/${variant2Id}/hide`).send({ hidden: false });
    expect(back.body.hidden).toBe(false);
    const rows = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(inArray(exercisesTable.id, [variant2Id]));
    expect(rows).toHaveLength(1);
  });
  it("zły identyfikator i zły body → 400/404", async () => {
    as(ADMIN);
    expect((await request(app).post("/api/exercises/abc/verify")).status).toBe(400);
    expect((await request(app).post("/api/exercises/99999999/verify")).status).toBe(404);
    expect((await request(app).post(`/api/exercises/${variantId}/hide`).send({})).status).toBe(400);
  });
});
