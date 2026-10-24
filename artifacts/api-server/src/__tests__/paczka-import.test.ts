/**
 * Import of exercise paczki: encodings, delimiters, decisions, validation, duplicates (pure) and the database part
 * (idempotence, never overwrites, rollback only of unused rows). The DB part runs on the test database.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  decodePaczka, detectDelimiter, parseCsv, readPaczka, interpretDecision, validateRow, buildPlan, findDuplicate,
  planImport, applyImport, rollbackBatch, SPECIFIC_MUSCLES, type ExistingExercise,
} from "../services/paczkaImport";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, pool, exercisesTable, trainersTable, clientsTable, clientExerciseUsageLogTable, exerciseMuscleAssignmentsTable, specificMusclesTable } from "@workspace/db";

const HEAD = ["zrodlo_id", "nazwa_PL", "nazwa_EN", "poziom", "rola", "sprzęt", "wzorzec", "mięśnie", "mięśnie_główne", "mięśnie_pomocnicze", "stawy", "cele", "opis", "wskazówki", "typowe_błędy", "uwaga_bezpieczeństwa", "learningDifficulty", "suitableForNoActivity", "decyzja_trenera"];
type Row = Partial<Record<(typeof HEAD)[number], string>>;
const base: Record<string, string> = {
  zrodlo_id: "Test_Ex_1", nazwa_PL: "Testowe ćwiczenie imp1", nazwa_EN: "Test Ex 1", poziom: "Początkujący", rola: "główne", "sprzęt": "Hantle",
  wzorzec: "Przysiad", "mięśnie": "Mięśnie czworogłowe uda",
  "mięśnie_główne": "Mięsień czworogłowy uda", "mięśnie_pomocnicze": "Mięsień pośladkowy wielki, Mięśnie przywodziciele uda", stawy: "Kolano, Biodro", cele: "siła", opis: "Własny opis ćwiczenia testowego.",
  "wskazówki": "Plecy proste.", "typowe_błędy": "Pośpiech.", "uwaga_bezpieczeństwa": "Przy bólu przerwij.", learningDifficulty: "2", suitableForNoActivity: "", decyzja_trenera: "tak",
};
const csv = (rows: Row[], delim = ";") =>
  [HEAD, ...rows.map((r) => HEAD.map((h) => ({ ...base, ...r })[h] ?? ""))]
    .map((line) => line.map((c) => (/[;,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(delim)).join("\r\n");

// Windows-1250 encoder for the characters used in tests (Polish Excel "CSV").
const CP1250: Record<string, number> = { ą: 0xb9, ć: 0xe6, ę: 0xea, ł: 0xb3, ń: 0xf1, ó: 0xf3, ś: 0x9c, ź: 0x9f, ż: 0xbf, Ą: 0xa5, Ć: 0xc6, Ę: 0xca, Ł: 0xa3, Ń: 0xd1, Ó: 0xd3, Ś: 0x8c, Ź: 0x8f, Ż: 0xaf, "—": 0x97 };
const toCp1250 = (s: string) => Buffer.from([...s].map((ch) => CP1250[ch] ?? ch.charCodeAt(0)));

describe("encodings and delimiters", () => {
  const text = csv([{ nazwa_PL: "Łydki — wspięcie źle żółć", stawy: "Plecy — dół" }]);
  it("UTF-8 with BOM, UTF-8 without BOM and Windows-1250 all keep the Polish characters", () => {
    for (const buf of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]), Buffer.from(text, "utf8"), toCp1250(text)]) {
      const r = readPaczka(buf);
      expect(r.rows[0].cells.nazwapl).toBe("Łydki — wspięcie źle żółć");
      expect(r.rows[0].cells.stawy).toBe("Plecy — dół");
      expect(r.rows[0].cells.miesnie).toBe("Mięśnie czworogłowe uda");
    }
  });
  it("semicolon and comma delimiters, quoted commas and line breaks", () => {
    expect(detectDelimiter(csv([{}], ";"))).toBe(";");
    expect(detectDelimiter(csv([{}], ","))).toBe(",");
    for (const d of [";", ","]) {
      const r = readPaczka(Buffer.from(csv([{ opis: 'Dwa zdania, z przecinkiem; i "cudzysłowem".\nDruga linia.' }], d), "utf8"));
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].cells.opis).toContain('"cudzysłowem"');
      expect(r.rows[0].cells.opis).toContain("Druga linia.");
    }
    expect(parseCsv("a;b\n1;2\n", ";")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("missing learningDifficulty column is reported", () => {
    expect(readPaczka(Buffer.from("nazwa_PL;decyzja_trenera\nx;tak", "utf8")).missingColumns).toContain("learningdifficulty");
  });
});

describe("decision column", () => {
  it.each([["tak", "tak"], ["TAK", "tak"], [" Tak. ", "tak"], ["nie", "nie"], ["NIE", "nie"], ["", "pusta"], ["   ", "pusta"]])("%j → %s", (v, kind) => expect(interpretDecision(v).kind).toBe(kind));
  it("any other text is 'do poprawy' with the note", () => {
    expect(interpretDecision("popraw: zmień nazwę")).toEqual({ kind: "poprawa", note: "popraw: zmień nazwę" });
    expect(interpretDecision("może").kind).toBe("poprawa");
  });
  it("buildPlan: tak → import, nie → skip, empty → skip and listed, other → NOT imported, listed with the note", () => {
    const rows = readPaczka(Buffer.from(csv([
      { zrodlo_id: "A", nazwa_PL: "Alfa unikalne ćwiczenie", decyzja_trenera: "tak" }, { zrodlo_id: "B", nazwa_PL: "Beta inne zadanie", decyzja_trenera: "nie" },
      { zrodlo_id: "C", nazwa_PL: "Gamma trzecie", decyzja_trenera: "" }, { zrodlo_id: "D", nazwa_PL: "Delta czwarte", decyzja_trenera: "popraw: nazwa" },
    ]), "utf8")).rows;
    const p = buildPlan(rows, [], "free-exercise-db");
    expect(p.toImport.map((i) => i.name)).toEqual(["Alfa unikalne ćwiczenie"]);
    expect(p.skippedNo).toHaveLength(1); expect(p.skippedEmpty).toHaveLength(1);
    expect(p.toFix).toEqual([{ line: 5, name: "Delta czwarte", detail: "popraw: nazwa" }]);
  });
});

describe("validation", () => {
  const v = (o: Record<string, string>) => validateRow(Object.fromEntries(Object.entries({ ...base, ...o }).map(([k, x]) => [k.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]/g, ""), x])));
  it("valid row passes and values come from the file (trainer's corrections)", () => {
    const r = v({ nazwa_PL: "Poprawiona nazwa przez trenera", poziom: "Średniozaawansowany", opis: "Nowy opis." });
    expect(r.ok && r.value.name).toBe("Poprawiona nazwa przez trenera");
    expect(r.ok && r.value.level).toBe("Średniozaawansowany");
    expect(r.ok && r.value.description).toBe("Nowy opis.");
  });
  it.each([
    [{ poziom: "Mistrz" }, "poziom"], [{ rola: "gwiazda" }, "rola"], [{ "sprzęt": "Teleportacja" }, "sprzęt"], [{ wzorzec: "Taniec" }, "wzorzec"],
    [{ "mięśnie": "Skrzydła" }, "partia"], [{ stawy: "Kolano, Dziób" }, "staw"], [{ opis: "" }, "opisu"], [{ nazwa_PL: "" }, "nazwy"],
  ])("closed lists / required fields: %j", (o, frag) => {
    const r = v(o); expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons.join(" ")).toContain(frag);
  });
  it.each([[""], ["  "], ["0"], ["6"], ["2,5"], ["abc"]])("learningDifficulty %j → rejected", (ld) => {
    const r = v({ learningDifficulty: ld }); expect(r.ok).toBe(false);
  });
  it("mięśnie szczegółowe: główne i pomocnicze z pliku, partie pomocnicze bez partii głównej", () => {
    const r = v({});
    expect(r.ok && r.value.primaryMuscles).toEqual(["Mięsień czworogłowy uda"]);
    expect(r.ok && r.value.secondaryMuscles).toEqual(["Mięsień pośladkowy wielki", "Mięśnie przywodziciele uda"]);
    expect(r.ok && r.value.secondaryMuscleGroups).toEqual(["Pośladki", "Przywodziciele"]);
  });
  it.each([
    [{ "mięśnie_główne": "" }, "brak mięśni głównych"],
    [{ "mięśnie_główne": "Mięsień czworogłowy" }, "nieznany mięsień szczegółowy"],
    [{ "mięśnie_pomocnicze": "Skrzydło" }, "nieznany mięsień szczegółowy"],
    [{ "mięśnie_pomocnicze": "Mięsień czworogłowy uda" }, "jednocześnie główny i pomocniczy"],
    [{ "mięśnie_główne": "Mięsień dwugłowy ramienia" }, "żaden mięsień główny nie należy do partii"],
    [{ "wskazówki": "" }, "brak wskazówek"],
    [{ "typowe_błędy": "" }, "brak typowych błędów"],
  ])("mięśnie i kompletność: %j → odrzucone", (o, frag) => {
    const r = v(o); expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons.join(" ")).toContain(frag);
  });
  it("partia „Całe ciało” nie wymaga zgodności partii mięśnia głównego", () => {
    expect(v({ "mięśnie": "Całe ciało", "mięśnie_główne": "Mięsień dwugłowy ramienia" }).ok).toBe(true);
  });
  it("brak kolumny mięśnie_główne jest zgłaszany", () => {
    const text = ["nazwa_PL;decyzja_trenera;learningDifficulty", "X;tak;2"].join("\r\n");
    expect(readPaczka(Buffer.from(text, "utf8")).missingColumns).toEqual(["miesnieglowne"]);
  });
  it("paczki 1–6 w docs/: każdy wiersz ma poprawne mięśnie szczegółowe", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { rows, missingColumns } = readPaczka(readFileSync(join(__dirname, "..", "..", "..", "..", "docs", `BAZA-PACZKA-0${n}.csv`)));
      expect(missingColumns).toEqual([]);
      for (const r of rows) {
        const res = validateRow(r.cells);
        const muscleProblems = res.ok ? [] : res.reasons.filter((x) => /mięś/.test(x));
        expect({ paczka: n, wiersz: r.line, problemy: muscleProblems }).toEqual({ paczka: n, wiersz: r.line, problemy: [] });
      }
    }
  });
  it("a rejected row does not stop the rest", () => {
    const rows = readPaczka(Buffer.from(csv([{ zrodlo_id: "X1", nazwa_PL: "Dobre jedno ćwiczenie", decyzja_trenera: "tak" }, { zrodlo_id: "X2", nazwa_PL: "Złe drugie zadanie", learningDifficulty: "", decyzja_trenera: "tak" }]), "utf8")).rows;
    const p = buildPlan(rows, [], "s");
    expect(p.toImport).toHaveLength(1); expect(p.rejected).toHaveLength(1);
  });
  it("suitableForNoActivity is true ONLY for 'tak'", () => {
    for (const [cell, expected] of [["tak", true], ["Tak", true], ["", false], ["nie", false], ["tak?", false], ["tak, ale", false], ["x", false], ["true", false], ["1", false]] as const) {
      const r = v({ suitableForNoActivity: cell });
      expect(r.ok && r.value.suitableForNoActivity).toBe(expected);
    }
  });
});

describe("duplicate detection at import time", () => {
  const ex = (id: number, name: string, over: Partial<ExistingExercise> = {}): ExistingExercise => ({
    id, name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-"), mainMuscleGroup: "Klatka piersiowa", movementPattern: "Pchanie poziome", equipment: ["Hantle"], ...over,
  });
  const cand = (name: string, over = {}) => ({ name, slug: "x-" + name.length, pattern: "Pchanie poziome", mainMuscle: "Klatka piersiowa", equipment: ["Hantle"], ...over });
  it("same name after normalisation / inflection → duplicate", () => {
    expect(findDuplicate(cand("Wyciskanie hantlami leżąc"), [ex(1, "Wyciskanie hantli leżąc")])?.id).toBe(1);
    expect(findDuplicate(cand("WYCISKANIE HANTLI LEŻĄC"), [ex(1, "Wyciskanie hantli leżąc")])?.id).toBe(1);
  });
  it("same slug → duplicate; different exercise → none", () => {
    expect(findDuplicate({ ...cand("Inna"), slug: "wyciskanie-hantli" }, [ex(1, "Cokolwiek", { slug: "wyciskanie-hantli" })])?.why).toBe("ten sam slug");
    expect(findDuplicate(cand("Pompki na kółkach", { equipment: ["Inny"], mainMuscle: "Klatka piersiowa" }), [ex(1, "Wyciskanie hantli leżąc")])).toBeNull();
  });
  it("very similar name with the same pattern/muscle/equipment → suspected duplicate", () => {
    expect(findDuplicate(cand("Wyciskanie hantli leżąc na ławce płaskiej"), [ex(1, "Wyciskanie hantli leżąc na ławce")])?.id).toBe(1);
  });
  it("two rows of the same paczka with the same name: the second is a duplicate of the first", () => {
    const rows = readPaczka(Buffer.from(csv([{ zrodlo_id: "P1", nazwa_PL: "Przysiad testowy dublet" }, { zrodlo_id: "P2", nazwa_PL: "Przysiad testowy dublet" }]), "utf8")).rows;
    const p = buildPlan(rows, [], "s");
    expect(p.toImport).toHaveLength(1); expect(p.duplicates).toHaveLength(1);
  });
});

describe("lista mięśni szczegółowych", () => {
  it("SPECIFIC_MUSCLES = 28 mięśni z katalogu", () => {
    const seed = readFileSync(join(__dirname, "..", "seeds", "catalogueSeed.ts"), "utf8");
    const names = [...seed.matchAll(/\((\d+),'([^']+)','([^']+)'\)/g)].filter((m) => Number(m[1]) <= 28).slice(0, 28);
    expect(new Map(names.map((m) => [m[2], m[3]]))).toEqual(SPECIFIC_MUSCLES);
  });
});

describe("database: idempotence, no overwrite, rollback", () => {
  const BATCH = "test-paczka-import";
  const SRC = "free-exercise-db";
  const createdTrainer: number[] = []; const createdClient: number[] = [];
  const file = Buffer.from(csv([
    { zrodlo_id: "IMP_T1", nazwa_PL: "Zupełnie nowe ćwiczenie imptest alfa", suitableForNoActivity: "tak", decyzja_trenera: "tak" },
    { zrodlo_id: "IMP_T2", nazwa_PL: "Zupełnie nowe ćwiczenie imptest beta", "sprzęt": "Masa własnego ciała", wzorzec: "Wykrok", decyzja_trenera: "tak" },
  ]), "utf8");

  async function purge() {
    await db.delete(exercisesTable).where(eq(exercisesTable.reviewBatch, BATCH));
  }
  beforeAll(purge);
  afterAll(async () => {
    await purge();
    if (createdClient.length) await db.delete(clientsTable).where(inArray(clientsTable.id, createdClient));
    if (createdTrainer.length) await db.delete(trainersTable).where(inArray(trainersTable.id, createdTrainer));
    await pool.end();
  });

  it("imports once, writes provenance, flags suitableForNoActivity only for 'tak', second run changes nothing", async () => {
    const p1 = await planImport(file, SRC);
    expect(p1.toImport).toHaveLength(2);
    const ids = await applyImport(p1, SRC, BATCH);
    expect(ids).toHaveLength(2);
    const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, BATCH));
    const a = rows.find((r) => r.sourceId === "IMP_T1")!; const b = rows.find((r) => r.sourceId === "IMP_T2")!;
    expect(a.source).toBe(SRC); expect(a.importedAt).not.toBeNull();
    expect(a.suitableForNoActivity).toBe(true); expect(b.suitableForNoActivity).toBe(false);
    expect(a.learningDifficulty).toBe(2); expect(a.createdByTrainerId).toBeNull();
    // muscle assignments: primary 1.0, secondary 0.5 — and the exercise is complete for the generator
    const asg = await db.select({ name: specificMusclesTable.name, isPrimary: exerciseMuscleAssignmentsTable.isPrimary, coefficient: exerciseMuscleAssignmentsTable.coefficient })
      .from(exerciseMuscleAssignmentsTable).innerJoin(specificMusclesTable, eq(specificMusclesTable.id, exerciseMuscleAssignmentsTable.specificMuscleId))
      .where(eq(exerciseMuscleAssignmentsTable.exerciseId, a.id));
    expect(asg.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      { name: "Mięsień czworogłowy uda", isPrimary: true, coefficient: 1 },
      { name: "Mięsień pośladkowy wielki", isPrimary: false, coefficient: 0.5 },
      { name: "Mięśnie przywodziciele uda", isPrimary: false, coefficient: 0.5 },
    ]);
    expect(a.secondaryMuscleGroups).toEqual(["Pośladki", "Przywodziciele"]);
    const stats = await fetchMuscleStats([a.id, b.id]);
    expect(computeCompleteness(a, stats.get(a.id))).toEqual({ isComplete: true, missingFields: [] });
    expect(computeCompleteness(b, stats.get(b.id)).isComplete).toBe(true);
    // second run: nothing to import, nothing inserted
    const p2 = await planImport(file, SRC);
    expect(p2.toImport).toHaveLength(0); expect(p2.alreadyImported).toHaveLength(2);
    expect(await applyImport(p2, SRC, BATCH)).toHaveLength(0);
    expect((await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, BATCH)))).toHaveLength(2);
  });

  it("never overwrites an existing exercise (same name → duplicate, existing row untouched)", async () => {
    const [existing] = await db.select().from(exercisesTable).where(eq(exercisesTable.name, "Przysiad goblet z hantlem")).limit(1);
    if (!existing) return; // catalogue not seeded in this database
    const f = Buffer.from(csv([{ zrodlo_id: "IMP_DUP", nazwa_PL: "Przysiad goblet z hantlem", opis: "NOWY OPIS", decyzja_trenera: "tak" }]), "utf8");
    const p = await planImport(f, SRC);
    expect(p.duplicates).toHaveLength(1); expect(p.toImport).toHaveLength(0);
    const [after] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, existing.id));
    expect(after.executionInstructions).toBe(existing.executionInstructions);
  });

  it("rollback removes only unused rows of the batch; used rows stay; 'own' rows are never touched", async () => {
    const [t] = await db.insert(trainersTable).values({ clerkUserId: "paczka_import_t_" + randomUUID() }).returning(); createdTrainer.push(t.id);
    const [c] = await db.insert(clientsTable).values({ firstName: "Imp", lastName: "test", trainerId: t.id, status: "active" }).returning(); createdClient.push(c.id);
    const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, BATCH));
    const used = rows.find((r) => r.sourceId === "IMP_T1")!;
    await db.insert(clientExerciseUsageLogTable).values({ clientId: c.id, generationId: randomUUID(), exerciseId: used.id });
    const [ownBefore] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.source, "own")).limit(1);
    const r = await rollbackBatch(BATCH);
    expect(r.removed.map((x) => x.name)).toEqual(["Zupełnie nowe ćwiczenie imptest beta"]);
    expect(r.kept.map((x) => x.id)).toEqual([used.id]);
    expect((await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, BATCH))).map((x) => x.id)).toEqual([used.id]);
    if (ownBefore) expect((await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.id, ownBefore.id))).length).toBe(1);
    // a rollback of an unknown batch removes nothing
    expect((await rollbackBatch("nie-ma-takiej")).removed).toEqual([]);
  });
});
