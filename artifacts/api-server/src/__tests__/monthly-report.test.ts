/** Raport miesięczny PDF (blok 10): format pliku, polskie znaki, obliczenia, prywatność bólu, izolacja trenerów. Baza testowa. */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { checkXref, pdfText } from "./helpers/pdfText";

let mockUser: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUser }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "x@example.invalid" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import { db, pool, trainersTable, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutSessionsTable, setLogsTable, painReportsTable, dailyStepsTable, volumeGuidelineVersionsTable } from "@workspace/db";
import { attendance, monthRecords, muscleVolume, weeklyBuckets, isMonth, type ReportSet } from "../services/monthlyReport";
import { PdfDoc } from "../services/pdf/pdfDoc";
import { MANROPE_BOLD_B64, MANROPE_REGULAR_B64 } from "../assets/manropeFonts";

describe("obliczenia", () => {
  it("tygodnie poniedziałek–niedziela dotykające miesiąca z liczbą treningów", () => {
    const b = weeklyBuckets("2026-09", ["2026-09-01", "2026-09-02", "2026-09-10", "2026-09-30"]);
    expect(b.map((x) => x.label)).toEqual(["01.09–06.09", "07.09–13.09", "14.09–20.09", "21.09–27.09", "28.09–30.09"]);
    expect(b.map((x) => x.count)).toEqual([2, 1, 0, 0, 1]);
    expect(weeklyBuckets("2026-02", []).reduce((a, x) => a + x.count, 0)).toBe(0);
  });
  it("frekwencja: zaplanowane z liczby dni planu na tydzień; do 100%; bez planu brak procentu", () => {
    expect(attendance(8, 3, "2026-09")).toEqual({ planned: 13, percent: 62 });
    expect(attendance(20, 3, "2026-09").percent).toBe(100);
    expect(attendance(3, null, "2026-09")).toEqual({ planned: null, percent: null });
  });
  const S = (id: number, name: string, w: number | null, reps: number | null, skipped = false, muscle = "Plecy"): ReportSet => ({ exerciseId: id, exerciseName: name, muscle, weightKg: w, reps, skipped, date: "2026-09-10" });
  it("rekord = najlepszy ciężar w miesiącu większy niż wszystko wcześniej; nowe ćwiczenie z ciężarem to pierwszy zapis; pominięte serie i serie bez powtórzeń nie liczą się", () => {
    const sets = [S(1, "Przysiad", 60, 8), S(1, "Przysiad", 70, 5), S(2, "Wiosłowanie", 40, 10), S(3, "Martwy ciąg", 100, 5, true), S(4, "Plank", null, 1), S(5, "Wyciskanie", 50, 0)];
    const r = monthRecords(sets, new Map([[1, 65], [2, 45]]));
    expect(r.map((x) => [x.name, x.weightKg, x.previous])).toEqual([["Przysiad", 70, 65]]);
    expect(monthRecords([S(9, "Nowe", 20, 10)], new Map()).map((x) => [x.name, x.previous])).toEqual([["Nowe", null]]);
  });
  it("objętość: serie robocze według partii, malejąco", () => {
    expect(muscleVolume([S(1, "a", 10, 5, false, "Plecy"), S(2, "b", 10, 5, false, "Plecy"), S(3, "c", 10, 5, false, "Barki"), S(4, "d", 10, 5, true, "Barki")])).toEqual([{ muscle: "Plecy", sets: 2 }, { muscle: "Barki", sets: 1 }]);
  });
  it("miesiąc: poprawny format", () => { expect(["2026-09", "2026-12"].every(isMonth)).toBe(true); expect(["2026-13", "2026-9", "", "wrzesien"].some(isMonth)).toBe(false); });
});

describe("zapis PDF", () => {
  it("poprawna struktura (xref, trailer), polskie litery i fonty osadzone, tekst do wyszukiwania", () => {
    const doc = new PdfDoc({ regular: Buffer.from(MANROPE_REGULAR_B64, "base64"), bold: Buffer.from(MANROPE_BOLD_B64, "base64") }, { title: "Zażółć gęślą jaźń" });
    const p = doc.addPage();
    p.text(50, 80, "Zażółć gęślą jaźń — ŁÓDŹ", { size: 14, font: "bold" });
    p.text(50, 110, "Frekwencja 80% · Ćwiczenie", { size: 10 });
    const pdf = doc.build();
    expect(checkXref(pdf)).toEqual([]);
    const text = pdfText(pdf);
    expect(text).toContain("Zażółć gęślą jaźń — ŁÓDŹ"); expect(text).toContain("Frekwencja 80% · Ćwiczenie");
    expect(pdf.toString("latin1")).toContain("/FontFile2");
    expect(pdf.length).toBeLessThan(120_000);
  });
});

describe("API raportu", () => {
  const A = "raport_trainer_a", B = "raport_trainer_b";
  let idA = 0, idB = 0, cid = 0, cOther = 0;
  const MONTH = "2026-09";
  beforeAll(async () => {
    await db.delete(trainersTable).where(inArray(trainersTable.clerkUserId, [A, B]));
    idA = (await db.insert(trainersTable).values({ clerkUserId: A, displayName: "Trener Ząb" }).returning())[0]!.id;
    idB = (await db.insert(trainersTable).values({ clerkUserId: B }).returning())[0]!.id;
    cid = (await db.insert(clientsTable).values({ firstName: "Żaneta", lastName: "Łącka", trainerId: idA, status: "active", stepsGoal: 8000 }).returning())[0]!.id;
    cOther = (await db.insert(clientsTable).values({ firstName: "Obcy", lastName: "Klient", trainerId: idB, status: "active" }).returning())[0]!.id;
    const [sv] = await db.insert(surveysTable).values({ clientId: cid, experienceLevel: "Początkujący" } as never).returning();
    const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
    const [plan] = await db.insert(workoutPlansTable).values({ clientId: cid, surveyId: sv!.id, guidelineVersionId: ver!.id, experienceLevelUsed: "Początkujący", title: "Plan", status: "active" } as never).returning();
    const days: Array<{ id: number }> = [];
    for (const n of [1, 2, 3]) days.push((await db.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: n, dayName: n === 1 ? "Dół ciała" : `Dzień ${n}` } as never).returning())[0]!);
    const mkSession = async (date: string, rating: string | null) => (await db.insert(workoutSessionsTable).values({ clientId: cid, planId: plan!.id, planDayId: days[0]!.id, sessionDate: date, isCompleted: true, sessionRating: rating } as never).returning())[0]!;
    const prior = await mkSession("2026-08-20", null);
    const s1 = await mkSession("2026-09-02", "just_right"), s2 = await mkSession("2026-09-09", "too_hard"), s3 = await mkSession("2026-09-16", "just_right");
    const set = (sessionId: number, exerciseId: number, n: number, w: string | null, reps: number, skipped = false) => db.insert(setLogsTable).values({ sessionId, exerciseId, setNumber: n, weightKg: w, reps, skipped, clientUuid: randomUUID() } as never);
    await set(prior.id, 3, 1, "60", 8);
    await set(s1.id, 3, 1, "60", 8); await set(s1.id, 3, 2, "65", 6); await set(s2.id, 3, 1, "70", 5); await set(s3.id, 170, 1, "20", 10);
    await db.insert(painReportsTable).values({ sessionId: s2.id, clientId: cid, area: "Bark", severity: 3, description: "SEKRETNY-OPIS-BOLU", clientUuid: randomUUID(), createdAt: new Date("2026-09-09T10:00:00Z") });
    await db.insert(dailyStepsTable).values([{ clientId: cid, day: "2026-09-01", steps: 9000 }, { clientId: cid, day: "2026-09-02", steps: 6000 }] as never);
  });
  afterAll(async () => {
    await db.delete(clientsTable).where(inArray(clientsTable.id, [cid, cOther]));
    await db.delete(trainersTable).where(inArray(trainersTable.id, [idA, idB]));
    await pool.end();
  });
  const get = (body: Record<string, unknown>, id = cid) => request(app).post(`/api/clients/${id}/monthly-report`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); }).send(body);

  it("PDF z poprawnymi danymi: frekwencja, treningi, rekord, objętość, kroki; ból tylko liczbą", async () => {
    mockUser = A;
    const r = await get({ month: MONTH, note: "Świetny miesiąc — trzymaj tempo." });
    expect(r.status).toBe(200); expect(r.headers["content-type"]).toBe("application/pdf"); expect(r.headers["content-disposition"]).toContain("raport-2026-09.pdf");
    const pdf = r.body as Buffer; expect(checkXref(pdf)).toEqual([]);
    const t = pdfText(pdf);
    for (const s of ["Raport miesięczny", "Żaneta Łącka", "wrzesień 2026", "Frekwencja", "Dół ciała", "za ciężko", "Notatka trenera", "Świetny miesiąc — trzymaj tempo."]) expect(t, s).toContain(s);
    expect(t).toMatch(/Odbyte treningi\s+3/); expect(t).toMatch(/Zaplanowane w tym miesiącu\s+13 \(23% zrealizowane\)/);
    expect(t).toMatch(/Przysiad ze sztangą\s+70 kg \(poprzednio 60 kg\)/);
    expect(t).toMatch(/Średnio dziennie\s+7 500/); expect(t).toMatch(/Liczba zgłoszeń\s+1/);
    expect(t).not.toContain("SEKRETNY-OPIS-BOLU"); expect(t).not.toContain("Trener Ząb");
  });
  it("szczegóły bólu i nazwa trenera tylko po zaznaczeniu", async () => {
    mockUser = A;
    const t = pdfText((await get({ month: MONTH, includePainDetails: true, includeTrainerName: true })).body as Buffer);
    expect(t).toContain("SEKRETNY-OPIS-BOLU"); expect(t).toContain("09.09 — Bark, siła 3/5"); expect(t).toContain("Trener: Trener Ząb");
  });
  it("miesiąc bez treningów: raport się generuje z informacją o braku danych", async () => {
    mockUser = A;
    const r = await get({ month: "2026-01" }); expect(r.status).toBe(200);
    expect(pdfText(r.body as Buffer)).toContain("W tym miesiącu nie zapisano żadnego treningu.");
  });
  it("izolacja i walidacja: cudzy klient 404, bez logowania 401, zły miesiąc/za długa notatka 400", async () => {
    mockUser = B; expect((await get({ month: MONTH })).status).toBe(404);
    mockUser = A; expect((await get({ month: MONTH }, cOther)).status).toBe(404);
    expect((await get({ month: "2026-13" })).status).toBe(400); expect((await get({ month: MONTH, note: "x".repeat(1300) })).status).toBe(400);
    mockUser = null; expect((await get({ month: MONTH })).status).toBeGreaterThanOrEqual(401);
  });
});
