/**
 * Import w trybie „odmiany” (decyzja właściciela 25.10.2026): odmiana → ćwiczenie główne, status niezweryfikowane,
 * suitableForNoActivity zawsze false, pliometria nigdy dla BA/P. Część DB działa na bazie testowej.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { validateRow, buildPlan, applyImport, type RawRow } from "../services/paczkaImport";
import { db, pool, exercisesTable } from "@workspace/db";

const base: Record<string, string> = {
  zrodloid: "T_Odm_1", nazwapl: "Testowe odmiana imp1", nazwaen: "T Odm 1", poziom: "Średniozaawansowany", rola: "główne", sprzet: "Hantle",
  wzorzec: "Przysiad", miesnie: "Mięśnie czworogłowe uda", miesnieglowne: "Mięsień czworogłowy uda", miesniepomocnicze: "Mięsień pośladkowy wielki",
  stawy: "Kolano", cele: "siła", opis: "Własny opis.", wskazowki: "Plecy proste.", typowebledy: "Pośpiech.", uwagabezpieczenstwa: "",
  learningdifficulty: "2", suitablefornoactivity: "tak", decyzjatrenera: "",
};
const row = (o: Record<string, string> = {}, line = 2): RawRow => ({ line, cells: { ...base, ...o } });

describe("tryb odmiany (unreviewed)", () => {
  it("suitableForNoActivity zawsze false, niezweryfikowane, status do_weryfikacji — nawet z „tak” w pliku", () => {
    const v = validateRow(base, { unreviewed: true });
    expect(v.ok && v.value.suitableForNoActivity).toBe(false);
    expect(v.ok && v.value.reviewedByTrainer).toBe(false);
    expect(v.ok && v.value.verificationStatus).toBe("do_weryfikacji");
    expect(v.ok && v.value.suitableExperienceLevels).not.toContain("Brak aktywności fizycznej");
  });
  it("bez trybu odmian zachowanie jak dotąd („tak” → true)", () => {
    const v = validateRow(base);
    expect(v.ok && v.value.suitableForNoActivity).toBe(true);
    expect(v.ok && v.value.reviewedByTrainer).toBe(true);
  });
  it("pliometria: intensywność wymaga min. średniozaawansowanego; wysoka tylko zaawansowany", () => {
    expect(validateRow({ ...base, poziom: "Początkujący", intensywnosc: "niska" }).ok).toBe(false);
    expect(validateRow({ ...base, poziom: "Brak aktywności fizycznej", intensywnosc: "niska" }).ok).toBe(false);
    expect(validateRow({ ...base, poziom: "Średniozaawansowany", intensywnosc: "wysoka" }).ok).toBe(false);
    expect(validateRow({ ...base, poziom: "Zaawansowany", intensywnosc: "wysoka" }).ok).toBe(true);
    expect(validateRow({ ...base, intensywnosc: "bardzo" }).ok).toBe(false);
  });
  it("odmiana_id: numer lub =źródło_id, inaczej odrzucone", () => {
    expect(validateRow({ ...base, odmianaid: "157" }).ok).toBe(true);
    expect(validateRow({ ...base, odmianaid: "=Floor_Ex" }).ok).toBe(true);
    expect(validateRow({ ...base, odmianaid: "ćwiczenie 157" }).ok).toBe(false);
  });
  it("pusta decyzja = tak tylko z acceptEmpty", () => {
    expect(buildPlan([row()], [], "free-exercise-db", []).skippedEmpty).toHaveLength(1);
    expect(buildPlan([row()], [], "free-exercise-db", [], { acceptEmpty: true, unreviewed: true }).toImport).toHaveLength(1);
  });
  it("odmiana nie jest porównywana rozmyciem z innymi, ale identyczna nazwa nadal blokuje", () => {
    const ex = { id: 5, name: "Testowe odmiana imp", slug: "testowe-odmiana-imp", mainMuscleGroup: "Mięśnie czworogłowe uda", movementPattern: "Przysiad", equipment: ["Hantle"] };
    const near = buildPlan([row({ nazwapl: "Testowe odmiana imp 1" })], [ex], "free-exercise-db", [], { acceptEmpty: true });
    expect(near.duplicates).toHaveLength(1);
    const variant = buildPlan([row({ nazwapl: "Testowe odmiana imp 1", odmianaid: "99" })], [ex], "free-exercise-db", [], { acceptEmpty: true });
    expect(variant.toImport).toHaveLength(1);
    const same = buildPlan([row({ nazwapl: "Testowe odmiana imp", odmianaid: "99" })], [ex], "free-exercise-db", [], { acceptEmpty: true });
    expect(same.duplicates).toHaveLength(1);
  });
});

describe("zapis odmian (baza testowa)", () => {
  const batch = `test-odm-${randomUUID().slice(0, 8)}`;
  afterAll(async () => {
    const rows = await db.select({ id: exercisesTable.id, p: exercisesTable.parentExerciseId }).from(exercisesTable).where(eq(exercisesTable.reviewBatch, batch));
    for (const r of rows.filter((x) => x.p !== null)) await db.delete(exercisesTable).where(eq(exercisesTable.id, r.id));
    for (const r of rows.filter((x) => x.p === null)) await db.delete(exercisesTable).where(eq(exercisesTable.id, r.id));
    await pool.end();
  });
  it("rodzic przed odmianą, odmiana wskazuje rodzica, wszystko niezweryfikowane i niedostępne dla nieaktywnych", async () => {
    const id = randomUUID().slice(0, 6);
    const rows = [
      row({ zrodloid: `V_${id}`, nazwapl: `Zzodm wariant ${id}`, odmianaid: `=P_${id}`, jednostronne: "tak", chwyt: "nachwyt" }, 2),
      row({ zrodloid: `P_${id}`, nazwapl: `Zzodm glowne ${id}`, intensywnosc: "średnia" }, 3),
    ];
    const plan = buildPlan(rows, [], "test-odm", [], { acceptEmpty: true, unreviewed: true });
    expect(plan.toImport).toHaveLength(2);
    const ids = await applyImport(plan, "test-odm", batch);
    expect(ids).toHaveLength(2);
    const saved = await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, batch));
    const parent = saved.find((e) => e.sourceId === `P_${id}`)!;
    const variant = saved.find((e) => e.sourceId === `V_${id}`)!;
    expect(variant.parentExerciseId).toBe(parent.id);
    expect(parent.parentExerciseId).toBeNull();
    expect(variant.unilateral).toBe(true);
    expect(variant.variantGrip).toBe("nachwyt");
    expect(parent.intensity).toBe("średnia");
    for (const e of saved) {
      expect(e.reviewedByTrainer).toBe(false);
      expect(e.suitableForNoActivity).toBe(false);
      expect(e.hidden).toBe(false);
    }
  });
  it("odmiana bez istniejącego rodzica nie jest zapisywana", async () => {
    const id = randomUUID().slice(0, 6);
    const plan = buildPlan([row({ zrodloid: `O_${id}`, nazwapl: `Zzodm sierota ${id}`, odmianaid: "99999999" })], [], "test-odm", [], { acceptEmpty: true, unreviewed: true });
    const ids = await applyImport(plan, "test-odm", batch);
    expect(ids).toHaveLength(0);
  });
});
