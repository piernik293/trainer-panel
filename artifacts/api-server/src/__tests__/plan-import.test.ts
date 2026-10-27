/** Import planu z Excela (blok 9) przez API na bazie testowej: podgląd, dopasowanie, ostrzeżenie stawu, sprzęt, ćwiczenie własne, szablon, izolacja. */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { makeXlsx } from "./helpers/makeXlsx";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } }, // konto bez limitów (test)
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, workoutPlansTable, workoutPlanExercisesTable, workoutPlanDaysTable, jointWarningDecisionsTable, planTemplatesTable } from "@workspace/db";

const A = "plan_import_trainer_a", B = "plan_import_trainer_b";
let idA = 0, idB = 0, cGym = 0, cHome = 0, cB = 0;
const created: number[] = [];
const b64 = (rows: Array<Array<string | number>>) => makeXlsx(rows).toString("base64");
const HEAD = ["Dzień", "Ćwiczenie", "Serie", "Powtórzenia", "Ciężar", "RIR", "Notatka"];
const FILE = [HEAD, ["Dzień 1", "Przysiad ze sztangą", 3, "8-12", "40 kg", 2, ""], ["Dzień 1", "Wyciskanie hantli leżąc", 3, "10", "12", 2, "uwaga"], ["Dzień 2", "Plank", 3, "30s", "", "", ""]];
const S0 = { dateOfBirth: "1990-01-01", gender: "female", heightCm: 170, weightKg: "65", experienceLevel: "Średniozaawansowany", activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny" };

beforeAll(async () => {
  await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
  idA = (await db.insert(trainersTable).values({ clerkUserId: A }).returning())[0]!.id;
  idB = (await db.insert(trainersTable).values({ clerkUserId: B }).returning())[0]!.id;
  const mk = async (tid: number, n: string) => (await db.insert(clientsTable).values({ firstName: n, lastName: "Import", trainerId: tid, status: "active" }).returning())[0]!.id;
  cGym = await mk(idA, "Siłownia"); cHome = await mk(idA, "Dom"); cB = await mk(idB, "Obcy");
  await db.insert(surveysTable).values({ clientId: cGym, ...S0, trainingLocation: "Siłownia", healthLimitations: "ból barku", injuryStatus: "Tak" } as never);
  await db.insert(surveysTable).values({ clientId: cHome, ...S0, trainingLocation: "Dom", equipment: "Hantle", healthLimitations: null, injuryStatus: "Brak" } as never);
  await db.insert(surveysTable).values({ clientId: cB, ...S0, trainingLocation: "Siłownia" } as never);
});
afterAll(async () => {
  await db.delete(planTemplatesTable).where(inArray(planTemplatesTable.trainerId, [idA, idB]));
  await db.delete(clientsTable).where(inArray(clientsTable.id, [cGym, cHome, cB]));
  if (created.length) await db.delete(exercisesTable).where(inArray(exercisesTable.id, created));
  await db.delete(exercisesTable).where(inArray(exercisesTable.createdByTrainerId, [idA, idB]));
  await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
  await pool.end();
});

describe("podgląd i analiza", () => {
  it("podgląd zgaduje kolumny; plik za duży / zły format / cudzy klient", async () => {
    mockUser = A;
    const r = await request(app).post(`/api/clients/${cGym}/plan-import/preview`).send({ fileName: "plan.xlsx", contentBase64: b64(FILE) });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ hasHeader: true, totalRows: 4, mapping: { day: 0, exercise: 1, sets: 2, reps: 3, load: 4, rir: 5, note: 6 } });
    expect((await request(app).post(`/api/clients/${cGym}/plan-import/preview`).send({ fileName: "plan.pdf", contentBase64: Buffer.from("x").toString("base64") })).status).toBe(400);
    expect((await request(app).post(`/api/clients/${cGym}/plan-import/preview`).send({ fileName: "a.csv", contentBase64: Buffer.alloc(3 * 1024 * 1024, 65).toString("base64") })).status).toBeGreaterThanOrEqual(400);
    mockUser = B;
    expect((await request(app).post(`/api/clients/${cGym}/plan-import/preview`).send({ fileName: "plan.xlsx", contentBase64: b64(FILE) })).status).toBe(404);
    mockUser = null;
    expect((await request(app).post(`/api/clients/${cGym}/plan-import/preview`).send({})).status).toBeGreaterThanOrEqual(401);
  });
  it("analiza: dopasowanie do katalogu i ostrzeżenie o zgłoszonym stawie (bark) przy wyciskaniu hantli", async () => {
    mockUser = A;
    const r = await request(app).post(`/api/clients/${cGym}/plan-import/analyze`).send({ fileName: "plan.xlsx", contentBase64: b64(FILE), mapping: { day: 0, exercise: 1, sets: 2, reps: 3, load: 4, rir: 5, note: 6 }, hasHeader: true });
    expect(r.status).toBe(200);
    expect(r.body.days.map((d: { name: string }) => d.name)).toEqual(["Dzień 1", "Dzień 2"]);
    const [sq, bench] = r.body.days[0].rows;
    expect(sq.match.name).toBe("Przysiad ze sztangą"); expect(sq.jointWarning).toBeNull();
    expect(bench.match.name).toBe("Wyciskanie hantli leżąc"); expect(bench.jointWarning).toContain("bark");
    expect(r.body.days[1].rows[0].match.name).toBe("Plank");
    expect((await request(app).post(`/api/clients/${cGym}/plan-import/analyze`).send({ fileName: "plan.xlsx", contentBase64: b64(FILE), mapping: { sets: 2 }, hasHeader: true })).status).toBe(400); // brak kolumny ćwiczenia
  });
});

describe("zapis", () => {
  const day = (ids: Array<{ exerciseId: number | null; customName?: string }>) => ({ dayName: "Dzień 1", exercises: ids.map((e) => ({ sets: 3, repsMin: 8, repsMax: 12, loadText: "20 kg", rir: 2, note: "", ...e })) });
  it("ćwiczenie na zgłoszony staw: 409 bez potwierdzenia, 201 z potwierdzeniem i zapisem decyzji; plan jest szkicem", async () => {
    mockUser = A;
    const body = { title: "Import test", target: "plan", days: [day([{ exerciseId: 170 }])] };
    const no = await request(app).post(`/api/clients/${cGym}/plan-import/save`).send(body);
    expect(no.status).toBe(409); expect(no.body.code).toBe("EXERCISE_LOADS_REPORTED_JOINT");
    const ok = await request(app).post(`/api/clients/${cGym}/plan-import/save`).send({ ...body, acknowledgeJointWarning: true });
    expect(ok.status).toBe(201);
    const [plan] = await db.select().from(workoutPlansTable).where(eq(workoutPlansTable.id, ok.body.planId));
    expect(plan).toMatchObject({ clientId: cGym, status: "draft", title: "Import test", experienceLevelUsed: "Średniozaawansowany" });
    const days = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan!.id));
    const [row] = await db.select().from(workoutPlanExercisesTable).where(eq(workoutPlanExercisesTable.dayId, days[0]!.id));
    expect(row).toMatchObject({ exerciseId: 170, workingSets: 3, repType: "range", repRangeMin: 8, repRangeMax: 12, loadType: "fixed", loadValue: "20", rir: 2 });
    expect((await db.select().from(jointWarningDecisionsTable).where(eq(jointWarningDecisionsTable.planId, plan!.id)))).toHaveLength(1);
  });
  it("sprzęt klienta (dom + hantle): ćwiczenie ze sztangą → 422 jak przy ręcznym dodaniu", async () => {
    mockUser = A;
    const r = await request(app).post(`/api/clients/${cHome}/plan-import/save`).send({ title: "x", target: "plan", days: [day([{ exerciseId: 3 }])] });
    expect(r.status).toBe(422); expect(r.body.code).toBe("EXERCISE_INCOMPATIBLE");
  });
  it("ćwiczenie własne: tworzone prywatnie dla trenera A; trener B nie może go użyć", async () => {
    mockUser = A;
    const r = await request(app).post(`/api/clients/${cGym}/plan-import/save`).send({ title: "Własne", target: "plan", days: [day([{ exerciseId: null, customName: "Moje dziwne ćwiczenie XYZ" }, { exerciseId: null, customName: "Moje dziwne ćwiczenie XYZ" }])] });
    expect(r.status).toBe(201);
    const own = await db.select().from(exercisesTable).where(eq(exercisesTable.name, "Moje dziwne ćwiczenie XYZ"));
    expect(own).toHaveLength(1); expect(own[0]!.createdByTrainerId).toBe(idA);
    mockUser = B;
    const b = await request(app).post(`/api/clients/${cB}/plan-import/save`).send({ title: "x", target: "plan", days: [day([{ exerciseId: own[0]!.id }])] });
    expect(b.status).toBe(404);
    expect((await request(app).post(`/api/clients/${cB}/plan-import/save`).send({ title: "x", target: "plan", days: [{ dayName: "d", exercises: [{ exerciseId: null }] }] })).status).toBe(400);
  });
  it("szablon: zapis, lista tylko własnych, zastosowanie do klienta tworzy szkic; inny trener nie widzi", async () => {
    mockUser = A;
    const t = await request(app).post(`/api/clients/${cHome}/plan-import/save`).send({ title: "Szablon A", target: "template", days: [day([{ exerciseId: 5 }, { exerciseId: 160 }])] });
    expect(t.status).toBe(201);
    expect((await request(app).get("/api/plan-templates")).body.map((x: { title: string }) => x.title)).toEqual(["Szablon A"]);
    const applied = await request(app).post(`/api/plan-templates/${t.body.templateId}/apply`).send({ clientId: cHome });
    expect(applied.status).toBe(201); expect(applied.body.planId).toBeGreaterThan(0);
    mockUser = B;
    expect((await request(app).get("/api/plan-templates")).body).toEqual([]);
    expect((await request(app).post(`/api/plan-templates/${t.body.templateId}/apply`).send({ clientId: cB })).status).toBe(404);
  });
  it("plik szablonu do pobrania", async () => {
    mockUser = A;
    const r = await request(app).get("/api/plan-import/template.csv");
    expect(r.status).toBe(200); expect(r.headers["content-type"]).toContain("text/csv"); expect(r.text).toContain("Ćwiczenie");
  });
});
