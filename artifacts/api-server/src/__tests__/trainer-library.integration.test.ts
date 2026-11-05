/** Biblioteka trenera (TRAINER_LIBRARY_ENABLED): izolacja, brak własnych w generatorze domyślnie, wymagane stawy/poziom, zgoda tylko dla kompletnych, kopia dla admina i dziennik. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, like, inArray } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "tl_a" as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async (id: string) => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: `${id}@poczta-testowa.pl` } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, exercisesTable, exerciseMuscleAssignmentsTable, specificMusclesTable, exerciseProposalLogTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { generatorOwnerFilter } from "../services/exerciseOwnership";

const A = "tl_a", B = "tl_b", ADMIN = "tl_admin";
const as = (id: string | null) => { auth.userId = id; };
const on = () => vi.stubEnv("TRAINER_LIBRARY_ENABLED", "1");
let idA = 0, idB = 0, exFull = 0, exPart = 0, exOfB = 0, muscleId = 0;
const created: number[] = [];
const FULL = { movementPattern: "Pchanie poziome", difficultyLevel: "Początkujący", equipment: ["Hantle"], trainingLocation: ["Dom"], exerciseType: "Wielostawowe", description: "Opis testowy ćwiczenia.",
  executionInstructions: "Wykonanie testowe.", commonMistakes: "Błędy testowe.", coachingTips: "Wskazówki testowe.", mainMuscleGroup: "Klatka piersiowa", isActive: true };

async function wipe() {
  const ex = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(like(exercisesTable.slug, "tl-test-%"));
  const ids = ex.map((e) => e.id);
  if (ids.length) { await db.delete(exerciseProposalLogTable).where(inArray(exerciseProposalLogTable.exerciseId, ids)); await db.delete(exercisesTable).where(inArray(exercisesTable.id, ids)); }
  await db.delete(trainersTable).where(like(trainersTable.clerkUserId, "tl_%"));
}
beforeAll(async () => {
  await wipe();
  Object.assign(process.env, { APP_ADMIN_CLERK_IDS: ADMIN });
  idA = (await provisionTrainer(A))!.id; idB = (await provisionTrainer(B))!.id; await provisionTrainer(ADMIN);
  muscleId = (await db.select({ id: specificMusclesTable.id }).from(specificMusclesTable).limit(1))[0]!.id;
  const mk = async (slug: string, name: string, trainerId: number, extra: object = {}) => (await db.insert(exercisesTable).values({ slug, name, createdByTrainerId: trainerId, ...FULL, ...extra } as never).returning({ id: exercisesTable.id }))[0]!.id;
  exFull = await mk("tl-test-pelne", "Wyciskanie TL pełne", idA);
  await db.insert(exerciseMuscleAssignmentsTable).values({ exerciseId: exFull, specificMuscleId: muscleId, isPrimary: true, coefficient: 1 });
  exPart = await mk("tl-test-niepelne", "Ćwiczenie TL niepełne", idA, { coachingTips: null });
  exOfB = await mk("tl-test-b", "Ćwiczenie TL trenera B", idB);
  created.push(exFull, exPart, exOfB);
}, 60_000);
afterEach(() => { vi.unstubAllEnvs(); as(A); });
afterAll(async () => { await wipe(); delete process.env.APP_ADMIN_CLERK_IDS; await pool.end(); });

describe("flaga i izolacja", () => {
  it("wyłączona: 404; włączona: trener widzi tylko swoje ćwiczenia", async () => {
    expect((await request(app).get("/api/trainer-library/status")).body).toEqual({ enabled: false });
    expect((await request(app).get("/api/trainer-library")).status).toBe(404);
    on();
    const a = (await request(app).get("/api/trainer-library")).body;
    expect(a.exercises.map((e: { id: number }) => e.id).sort()).toEqual([exFull, exPart].sort());
    as(B); expect((await request(app).get("/api/trainer-library")).body.exercises.map((e: { id: number }) => e.id)).toEqual([exOfB]);
    as(null); expect((await request(app).get("/api/trainer-library")).status).toBe(401);
  });
});

describe("kompletność, stawy i poziom", () => {
  it("bez stawów i poziomu ćwiczenie jest niekompletne; PATCH uzupełnia (walidacja listy); cudzego nie ruszy", async () => {
    on();
    let l = (await request(app).get("/api/trainer-library")).body.exercises.find((e: { id: number }) => e.id === exFull);
    expect(l.complete).toBe(false); expect(l.missing).toContain("Poziom obciążenia stawów");
    expect((await request(app).patch(`/api/trainer-library/${exFull}`).send({ jointStress: "Bardzo", jointStressAreas: [] })).status).toBe(400);
    expect((await request(app).patch(`/api/trainer-library/${exFull}`).send({ jointStress: "Niskie", jointStressAreas: ["Kark"] })).status).toBe(400);
    expect((await request(app).patch(`/api/trainer-library/${exFull}`).send({ jointStress: "Średnie", jointStressAreas: ["Bark", "Bark"] })).status).toBe(200);
    l = (await request(app).get("/api/trainer-library")).body.exercises.find((e: { id: number }) => e.id === exFull);
    expect(l.complete).toBe(true); expect(l.jointStressAreas).toEqual(["Bark"]);
    expect((await request(app).patch(`/api/trainer-library/${exOfB}`).send({ jointStress: "Niskie", jointStressAreas: [] })).status).toBe(404);
  });
});

describe("generator", () => {
  it("domyślnie bez własnych ćwiczeń trenera; po włączeniu opcji tylko jego i tylko kompletne; cudzych i ćwiczeń Solo nigdy", async () => {
    on();
    const pub = { createdByTrainerId: null, createdByClientId: null };
    const own = { createdByTrainerId: idA, createdByClientId: null, jointStress: "Niskie", jointStressAreas: [] as string[] };
    const ownNoJoints = { createdByTrainerId: idA, createdByClientId: null, jointStress: null, jointStressAreas: null };
    const theirs = { createdByTrainerId: idB, createdByClientId: null, jointStress: "Niskie", jointStressAreas: [] as string[] };
    const solo = { createdByTrainerId: null, createdByClientId: 99 };
    let f = await generatorOwnerFilter(idA);
    expect([f(pub), f(own), f(theirs), f(solo)]).toEqual([true, false, false, false]);
    expect((await request(app).put("/api/trainer-library/settings").send({ useOwnInGenerator: true })).status).toBe(200);
    f = await generatorOwnerFilter(idA);
    expect([f(pub), f(own), f(ownNoJoints), f(theirs), f(solo)]).toEqual([true, true, false, false, false]);
    as(B); f = await generatorOwnerFilter(idB); expect(f(own)).toBe(false); // opcja trenera A nie otwiera jego ćwiczeń dla B
    as(A); await request(app).put("/api/trainer-library/settings").send({ useOwnInGenerator: false });
    expect((await request(app).put("/api/trainer-library/settings").send({ useOwnInGenerator: "tak" })).status).toBe(400);
  });
});

describe("zgoda i propozycje", () => {
  it("zgoda domyślnie wyłączona; niekompletne 422; kompletne zapisuje datę i status „proposed”; cofnięcie czyści", async () => {
    on();
    const l0 = (await request(app).get("/api/trainer-library")).body.exercises.find((e: { id: number }) => e.id === exFull);
    expect(l0.shareConsent).toBe(false); expect(l0.shareStatus).toBe("none");
    const bad = await request(app).put(`/api/trainer-library/${exPart}/share`).send({ consent: true });
    expect(bad.status).toBe(422); expect(bad.body.code).toBe("INCOMPLETE"); expect(bad.body.missing.length).toBeGreaterThan(0);
    expect((await request(app).put(`/api/trainer-library/${exOfB}/share`).send({ consent: true })).status).toBe(404);
    expect((await request(app).put(`/api/trainer-library/${exFull}/share`).send({ consent: true })).body.shareStatus).toBe("proposed");
    const [row] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exFull)); expect(row!.shareConsentAt).toBeTruthy();
    expect((await request(app).put(`/api/trainer-library/${exFull}/share`).send({ consent: false })).body.shareStatus).toBe("none");
    await request(app).put(`/api/trainer-library/${exFull}/share`).send({ consent: true });
  });
  it("administrator: lista z ćwiczeniem; zwykły trener 403; dodanie tworzy nieaktywną KOPIĘ (bez „bez aktywności”, z mięśniami) i wpis w dzienniku", async () => {
    on(); as(B); expect((await request(app).get("/api/admin/exercise-proposals")).status).toBe(403);
    as(ADMIN);
    const list = (await request(app).get("/api/admin/exercise-proposals")).body.items; const p = list.find((x: { id: number }) => x.id === exFull);
    expect(p).toMatchObject({ name: "Wyciskanie TL pełne", status: "proposed", author: expect.any(String) });
    const add = await request(app).post(`/api/admin/exercise-proposals/${exFull}/add`); expect(add.status).toBe(201);
    const copyId = add.body.copyId as number; created.push(copyId);
    const [copy] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, copyId));
    expect(copy).toMatchObject({ createdByTrainerId: null, isActive: false, hidden: true, reviewedByTrainer: false, suitableForNoActivity: null, learningDifficulty: null, shareStatus: "none", name: "Wyciskanie TL pełne" });
    expect((await db.select().from(exerciseMuscleAssignmentsTable).where(eq(exerciseMuscleAssignmentsTable.exerciseId, copyId))).length).toBe(1);
    const [orig] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exFull));
    expect(orig).toMatchObject({ shareStatus: "added", sharedCopyExerciseId: copyId, createdByTrainerId: idA }); // oryginał zostaje u trenera
    expect((await request(app).post(`/api/admin/exercise-proposals/${exFull}/add`)).status).toBe(404); // drugi raz nie powiela
    const log = await db.select().from(exerciseProposalLogTable).where(eq(exerciseProposalLogTable.exerciseId, exFull));
    expect(log).toHaveLength(1); expect(log[0]).toMatchObject({ action: "added", copyExerciseId: copyId, actorClerkUserId: ADMIN });
    await db.delete(exercisesTable).where(eq(exercisesTable.id, copyId));
  });
  it("odrzucenie wymaga powodu; trener widzi powód; wpis w dzienniku", async () => {
    on(); as(A);
    await db.update(exercisesTable).set({ shareConsent: true, shareConsentAt: new Date(), shareStatus: "proposed" }).where(eq(exercisesTable.id, exPart));
    as(ADMIN);
    expect((await request(app).post(`/api/admin/exercise-proposals/${exPart}/reject`).send({ reason: "no" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/exercise-proposals/${exPart}/reject`).send({ reason: "Za mało szczegółów w opisie" })).status).toBe(200);
    as(A); const l = (await request(app).get("/api/trainer-library")).body.exercises.find((e: { id: number }) => e.id === exPart);
    expect(l).toMatchObject({ shareStatus: "rejected", shareRejectReason: "Za mało szczegółów w opisie" });
    const log = await db.select().from(exerciseProposalLogTable).where(eq(exerciseProposalLogTable.exerciseId, exPart));
    expect(log[0]).toMatchObject({ action: "rejected", reason: "Za mało szczegółów w opisie" });
  });
});
