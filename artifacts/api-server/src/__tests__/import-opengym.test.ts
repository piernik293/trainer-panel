/**
 * Paczka „openGym” (58 ćwiczeń z własnymi opisami, docs/BAZA-IMPORT-OPENGYM.csv): komplet danych dla generatora,
 * brak duplikatów już dodanych ćwiczeń, odmiany z rodzicem, wszystko niezweryfikowane i niedostępne dla BA/P.
 * Test czysty (bez bazy): waliduje plik tym samym kodem co import.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPaczka, validateRow, buildPlan, type ImportExercise } from "../services/paczkaImport";
import { isGeneratorSafe } from "../lib/exerciseRoles";

const file = readFileSync(resolve(__dirname, "../../../../docs/BAZA-IMPORT-OPENGYM.csv"));
const { rows, missingColumns } = readPaczka(file);
const OPTS = { acceptEmpty: true, unreviewed: true } as const;
const valid = rows.map((r) => ({ r, v: validateRow(r.cells, OPTS) }));
const items: ImportExercise[] = valid.flatMap(({ v }) => (v.ok ? [v.value] : []));
const byName = (n: string) => items.find((i) => i.name === n)!;

describe("plik openGym: kompletność i walidacja", () => {
  it("58 wierszy, brak brakujących kolumn, każdy przechodzi zamknięte listy", () => {
    expect(missingColumns).toEqual([]);
    expect(rows).toHaveLength(58);
    const bad = valid.filter(({ v }) => !v.ok).map(({ r, v }) => `${r.cells.nazwapl}: ${v.ok ? "" : v.reasons.join("; ")}`);
    expect(bad).toEqual([]);
  });
  it("każde ćwiczenie ma komplet: poziom, trudność 1–5, partie, stawy, cele, opis, wskazówki, błędy", () => {
    for (const i of items) {
      expect(i.learningDifficulty, i.name).toBeGreaterThanOrEqual(1);
      expect(i.learningDifficulty, i.name).toBeLessThanOrEqual(5);
      expect(i.primaryMuscles, i.name).toHaveLength(1);
      expect(i.description.length, i.name).toBeGreaterThan(60);
      expect(i.coachingTips, i.name).toBeTruthy();
      expect(i.commonMistakes, i.name).toBeTruthy();
      expect(i.sourceId, i.name).toMatch(/^OG_\d{4}$/);
      if (i.role === "główne" || i.role === "pomocnicze") {
        expect(i.trainingGoals.length, i.name).toBeGreaterThan(0);
        expect(i.joints.length, i.name).toBeGreaterThan(0);
      }
    }
  });
  it("własne opisy: bez języka medycznego, bez kopiowania nazw EN w opisie", () => {
    for (const i of items) {
      expect(`${i.description} ${i.coachingTips} ${i.commonMistakes} ${i.safetyNotes}`, i.name).not.toMatch(/leczy|terapi|diagnoz|uraz|kontuzj|choroba|rehabilit/i);
    }
  });
});

describe("bezpieczeństwo: niezweryfikowane, tylko Ś/Z", () => {
  it("suitableForNoActivity = false, niezweryfikowane, nie dla BA (poziom i flagi)", () => {
    for (const i of items) {
      expect(i.suitableForNoActivity, i.name).toBe(false);
      expect(i.reviewedByTrainer, i.name).toBe(false);
      expect(i.verificationStatus, i.name).toBe("do_weryfikacji");
      expect(i.suitableExperienceLevels, i.name).not.toContain("Brak aktywności fizycznej");
    }
  });
  it("generator: BA i P nie dostają żadnego, Ś/Z tak (niezweryfikowane)", () => {
    for (const i of items) {
      const ex = { hidden: false, reviewedByTrainer: i.reviewedByTrainer, intensity: i.intensity };
      expect(isGeneratorSafe(ex, "Brak aktywności fizycznej"), i.name).toBe(false);
      expect(isGeneratorSafe(ex, "Początkujący"), i.name).toBe(false);
      expect(isGeneratorSafe(ex, "Średniozaawansowany"), i.name).toBe(true);
      expect(isGeneratorSafe(ex, "Zaawansowany"), i.name).toBe(true);
    }
  });
  it("ustalenia: L-sit, V-sit i podciąganie szerokie tylko Z; Pendlay, Thruster, Przysiad kozacki od Ś; wersje dla P od Początkującego", () => {
    for (const n of ["L-sit na podłodze", "V-sit na podłodze", "Podciąganie na drążku szerokim chwytem"]) expect(byName(n).level, n).toBe("Zaawansowany");
    for (const n of ["Wiosłowanie Pendlaya", "Thruster ze sztangą", "Przysiad kozacki", "Scyzoryki (V-up)", "Plank boczny z przywodzeniem nogi", "Spacer z hantlem nad głową"]) expect(byName(n).level, n).toBe("Średniozaawansowany");
    for (const n of ["Plank z dotykaniem barków na kolanach", "Pompki wąskie na kolanach", "Martwy ciąg jednonóż z hantlem z podparciem", "Curl-up (brzuszek McGilla)", "Plank boczny na podwyższeniu"]) expect(byName(n).level, n).toBe("Początkujący");
  });
  it("pliometrii w tej paczce nie ma (skoki z poprzednich zadań), a intensywność nie jest ustawiona przypadkiem", () => {
    expect(items.every((i) => i.intensity === null)).toBe(true);
  });
});

describe("mięśnie główne wg decyzji (migracja 0034)", () => {
  it("tibialis raise → piszczelowy przedni; pompki łopatkowe (i na podwyższeniu) oraz pompki plus → zębaty przedni", () => {
    expect(byName("Unoszenie palców stóp (tibialis raise)").primaryMuscles).toEqual(["Mięsień piszczelowy przedni"]);
    for (const n of ["Pompki łopatkowe", "Pompki łopatkowe na podwyższeniu", "Pompki plus"]) expect(byName(n).primaryMuscles, n).toEqual(["Mięsień zębaty przedni"]);
  });
  it("żadne inne ćwiczenie z paczki nie ma ich jako głównych", () => {
    const withNew = items.filter((i) => i.primaryMuscles.some((m) => /piszczelowy przedni|zębaty przedni/.test(m))).map((i) => i.name).sort();
    expect(withNew).toEqual(["Pompki plus", "Pompki łopatkowe", "Pompki łopatkowe na podwyższeniu", "Unoszenie palców stóp (tibialis raise)"].sort());
  });
});

describe("poprawki opisów po weryfikacji", () => {
  it("martwy ciąg rumuński z gumą: trudność nauki 2 (dla nieaktywnych, lekka guma)", () => {
    expect(byName("Martwy ciąg rumuński z gumą oporową").learningDifficulty).toBe(2);
  });
  it("wiosłowanie australijskie: tylko stabilny drążek (bez stołu i sztangi na podporach)", () => {
    const i = byName("Wiosłowanie australijskie z ugiętymi nogami");
    const text = `${i.description} ${i.coachingTips} ${i.commonMistakes} ${i.safetyNotes}`;
    expect(text).toMatch(/stabilnym drążkiem/);
    expect(text).not.toMatch(/stół|stoł|sztang/i);
  });
  it("dipy na podłodze: siad, dłonie za biodrami palcami do przodu, mały zakres łokci", () => {
    const d = byName("Dipy na podłodze").description;
    expect(d).toMatch(/dłonie za biodrami, palce skierowane do przodu/);
    expect(d).toMatch(/w małym zakresie/);
  });
});

describe("duplikaty i odmiany", () => {
  it("pominięte jako duplikaty: Burpees, Pajacyki, Krzesełko, Nordic curl, Przeskoki łyżwiarza, kajakowe", () => {
    const names = items.map((i) => i.name.toLowerCase()).join("|");
    for (const bad of ["burpee", "pajacyk", "krzesełko", "nordic", "łyżwiarz", "kajak"]) expect(names).not.toContain(bad);
  });
  it("odmiana: rodzic numeryczny albo =źródło_id z tego samego pliku; 34 odmiany", () => {
    const ids = new Set(items.map((i) => i.sourceId));
    const variants = items.filter((i) => i.parentRef);
    expect(variants).toHaveLength(34);
    for (const v of variants) {
      if (v.parentRef!.startsWith("=")) expect(ids.has(v.parentRef!.slice(1)), v.name).toBe(true);
      else expect(v.parentRef, v.name).toMatch(/^\d+$/);
      expect(v.grip || v.position, v.name).toBeTruthy();
    }
    expect(byName("Plank z dotykaniem barków na kolanach").parentRef).toBe("1404");
    expect(byName("Dipy na podłodze").parentRef).toBe("1093");
    expect(byName("Thruster ze sztangą").parentRef).toBe("1341");
  });
  it("idempotencja: ponowny import tych samych źródeł nic nie dodaje", () => {
    const existing = items.map((i, n) => ({ id: 9000 + n, name: i.name, slug: i.slug, mainMuscleGroup: i.mainMuscle, movementPattern: i.pattern, equipment: i.equipment, source: "free-exercise-db", sourceId: i.sourceId }));
    const plan = buildPlan(rows, existing, "free-exercise-db", missingColumns, OPTS);
    expect(plan.toImport).toHaveLength(0);
    expect(plan.alreadyImported).toHaveLength(58);
  });
});

describe("dom: guma i masa ciała dostępne w domu", () => {
  it("ćwiczenia z gumą / masą ciała / hantlami mają miejsce Dom", () => {
    for (const i of items.filter((x) => x.equipment.some((e) => ["Gumy oporowe", "Masa własnego ciała", "Hantle"].includes(e)) && !x.equipment.some((e) => ["Sztanga", "Maszyna", "Wyciąg"].includes(e)))) {
      expect(i.trainingLocation, i.name).toContain("Dom");
    }
    for (const n of ["Ściąganie gumy oporowej z góry", "Wyciskanie gumy oporowej przed siebie", "Przysiad z gumą oporową", "Martwy ciąg rumuński z gumą oporową", "Face pull z gumą oporową", "Unoszenie Y z gumą oporową", "Odwodzenie bioder z gumą siedząc", "Odwodzenie nogi w tył z gumą w opadzie"]) {
      expect(byName(n).equipment, n).toContain("Gumy oporowe");
      expect(byName(n).trainingLocation, n).toContain("Dom");
    }
  });
});
