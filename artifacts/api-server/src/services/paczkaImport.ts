/**
 * Import of exercise "paczki" (CSV reviewed by the owner in Excel) into the catalogue.
 *
 * Pure part (no database): decoding (UTF-8 with/without BOM, Windows-1250), delimiter (; or ,), CSV parsing,
 * the trainer's decision, row validation against the closed lists, duplicate detection.
 * Database part: planImport (read-only, used by --dry-run), applyImport, rollbackBatch.
 *
 * Rules (docs/IMPORT-LOG.md, owner's brief):
 *  - decyzja_trenera: "tak" → import; "nie" → skip; empty → skip and list; anything else ("popraw: …") → NOT imported, listed as "do poprawy";
 *  - values are taken FROM THE FILE (the trainer may correct name, level, description…), after validation;
 *  - suitableForNoActivity = true ONLY when the cell says exactly "tak"; otherwise false;
 *  - empty learningDifficulty → row rejected (no difficulty = not allowed);
 *  - a second duplicate check against the CURRENT database at import time; a suspected duplicate is not imported;
 *  - existing exercises are never overwritten; the import is idempotent (source, source_id);
 *  - rollback removes only rows of one review batch that no plan/session/log uses;
 *  - every imported exercise is complete for the generator (computeCompleteness): specific muscles from
 *    mięśnie_główne / mięśnie_pomocnicze (our 28 muscles; primary 1.0, secondary 0.5), description, tips, mistakes.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, exercisesTable, exerciseMuscleAssignmentsTable, specificMusclesTable } from "@workspace/db";

export { pool };

// ─── Decoding and CSV ─────────────────────────────────────────────────────────

/** UTF-8 (BOM stripped) when the bytes are valid UTF-8, otherwise Windows-1250 (Polish Excel). */
export function decodePaczka(buf: Buffer): string {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1250").decode(b);
  }
}

/** ';' or ',' — whichever is more frequent in the header line outside quotes. */
export function detectDelimiter(text: string): ";" | "," {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  let semi = 0, comma = 0, inQ = false;
  for (const ch of first) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ";") semi++;
    else if (!inQ && ch === ",") comma++;
  }
  return semi >= comma ? ";" : ",";
}

export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").replace(/Ł/g, "L");
const headerKey = (s: string) => stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]/g, "");

export type RawRow = { line: number; cells: Record<string, string> };

/** Header → canonical keys: nazwapl, nazwaen, poziom, rola, sprzet, wzorzec, miesnie, miesnieglowne, miesniepomocnicze, stawy, cele, opis, wskazowki, typowebledy, uwagabezpieczenstwa, suitablefornoactivity, learningdifficulty, decyzjatrenera, zrodloid. */
export function readPaczka(buf: Buffer): { delimiter: string; rows: RawRow[]; missingColumns: string[] } {
  const text = decodePaczka(buf);
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  if (table.length === 0) return { delimiter, rows: [], missingColumns: ["nazwapl", "decyzjatrenera"] };
  const keys = table[0].map(headerKey);
  const need = ["nazwapl", "decyzjatrenera", "learningdifficulty", "miesnieglowne"];
  const missingColumns = need.filter((k) => !keys.includes(k));
  const rows: RawRow[] = table.slice(1).map((r, i) => ({
    line: i + 2,
    cells: Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? "").trim()])),
  }));
  return { delimiter, rows, missingColumns };
}

// ─── Decision ─────────────────────────────────────────────────────────────────

export type Decision = { kind: "tak" } | { kind: "nie" } | { kind: "pusta" } | { kind: "poprawa"; note: string };

export function interpretDecision(v: string | undefined): Decision {
  const t = (v ?? "").trim();
  if (t === "") return { kind: "pusta" };
  const n = t.toLowerCase().replace(/[.!\s]+$/g, "");
  if (n === "tak") return { kind: "tak" };
  if (n === "nie") return { kind: "nie" };
  return { kind: "poprawa", note: t };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export const IMPORT_LEVELS = new Set(["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]);
export const IMPORT_ROLES = new Set(["główne", "pomocnicze", "rozgrzewka", "rozciąganie", "technika biegu", "przygotowanie do skoków"]);
/** `cele` column (owner's short list) → the client goal names used by the recommendation engine. Unknown values are ignored. */
export const GOAL_MAP: Readonly<Record<string, string>> = {
  siła: "Zwiększenie siły", sylwetka: "Budowa sylwetki", redukcja: "Redukcja tkanki tłuszczowej", kondycja: "Poprawa kondycji", sprawność: "Poprawa sprawności", sport: "Cel sportowy",
};
export const IMPORT_MUSCLES = new Set([
  "Klatka piersiowa", "Plecy", "Barki", "Biceps", "Triceps", "Przedramiona", "Brzuch", "Pośladki", "Mięśnie czworogłowe uda",
  "Mięśnie dwugłowe uda", "Przywodziciele", "Odwodziciele", "Łydki", "Całe ciało", "Inne",
]);
export const IMPORT_EQUIPMENT = new Set([
  "Sztanga", "Hantle", "Kettlebell", "Maszyna", "Wyciąg", "Drążek", "Poręcze", "Ławka", "Gumy oporowe", "TRX",
  "Masa własnego ciała", "Piłka", "Piłka lekarska", "Talerz obciążeniowy", "Uchwyty do pompek", "Kółka gimnastyczne", "Roller", "Landmine", "Worek bokserski", "Młot i opona", "Brak sprzętu", "Inny",
]);
export const IMPORT_PATTERNS = new Set([
  "Pchanie poziome", "Pchanie pionowe", "Przyciąganie poziome", "Przyciąganie pionowe", "Przysiad", "Zawias biodrowy", "Wykrok",
  "Zgięcie kolana", "Wyprost kolana", "Odwodzenie", "Przywodzenie", "Zgięcie łokcia", "Wyprost łokcia", "Zgięcie/wyprost nadgarstka",
  "Wzruszanie ramion", "Wspięcie na palce", "Stabilizacja tułowia", "Zgięcie tułowia", "Rotacja", "Lokomocja", "Anti-ekstensja",
  "Anti-rotacja", "Mobilizacja", "Rozciąganie", "Aktywacja", "Oddychanie", "Inne",
]);
export const IMPORT_JOINTS = new Set(["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"]);

/** Our 28 specific muscles (specific_muscles.name → broad category), exactly as in catalogueSeed.ts. */
export const SPECIFIC_MUSCLES: ReadonlyMap<string, string> = new Map([
  ["Mięsień piersiowy większy", "Klatka piersiowa"], ["Mięsień piersiowy mniejszy", "Klatka piersiowa"],
  ["Mięsień najszerszy grzbietu", "Plecy"], ["Mięsień czworoboczny grzbietu", "Plecy"], ["Mięśnie równoległoboczne", "Plecy"],
  ["Mięsień obły większy", "Plecy"], ["Prostowniki grzbietu", "Plecy"],
  ["Mięsień naramienny (głowa przednia)", "Barki"], ["Mięsień naramienny (głowa boczna)", "Barki"],
  ["Mięsień naramienny (głowa tylna)", "Barki"], ["Mięśnie stożka rotatorów", "Barki"],
  ["Mięsień dwugłowy ramienia", "Biceps"], ["Mięsień ramienny", "Biceps"], ["Mięsień trójgłowy ramienia", "Triceps"],
  ["Zginacze nadgarstka i palców", "Przedramiona"], ["Prostowniki nadgarstka i palców", "Przedramiona"],
  ["Mięsień prosty brzucha", "Brzuch"], ["Mięśnie skośne brzucha", "Brzuch"], ["Mięsień poprzeczny brzucha", "Brzuch"],
  ["Mięsień pośladkowy wielki", "Pośladki"], ["Mięsień pośladkowy średni", "Pośladki"], ["Mięsień pośladkowy mały", "Pośladki"],
  ["Mięsień czworogłowy uda", "Mięśnie czworogłowe uda"], ["Mięśnie kulszowo-goleniowe", "Mięśnie dwugłowe uda"],
  ["Mięśnie przywodziciele uda", "Przywodziciele"], ["Mięśnie odwodziciele uda", "Odwodziciele"],
  ["Mięsień brzuchaty łydki", "Łydki"], ["Mięsień płaszczkowaty", "Łydki"],
]);
export const PRIMARY_COEFFICIENT = 1;
export const SECONDARY_COEFFICIENT = 0.5;

const splitList = (v: string | undefined) => (v ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);

export interface ImportExercise {
  name: string;
  nameEn: string;
  slug: string;
  sourceId: string;
  level: string;
  role: string;
  equipment: string[];
  pattern: string;
  mainMuscle: string;
  joints: string[];
  /** specific muscles (names from SPECIFIC_MUSCLES) */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** broad categories of the secondary muscles, other than the main one */
  secondaryMuscleGroups: string[];
  description: string;
  coachingTips: string | null;
  commonMistakes: string | null;
  safetyNotes: string | null;
  learningDifficulty: number;
  suitableForNoActivity: boolean;
  exerciseType: string;
  suitableExperienceLevels: string[];
  trainingLocation: string[];
  verificationStatus: "zweryfikowane" | "do_weryfikacji";
  /** Variant of: our exercise id ("157"), or "=<źródło_id>" of another row of the same file; null for main exercises. */
  parentRef: string | null;
  grip: string | null;
  position: string | null;
  unilateral: boolean | null;
  intensity: string | null;
  trainingGoals: string[];
  /** Amount shown for stretching / breathing / rolling (information only): seconds and whether it is per side. */
  durationSeconds: number | null;
  perSide: boolean | null;
  /** Variant of a main exercise, or a row checked by hand as "not a duplicate": only an identical slug / name blocks it (no fuzzy match). */
  exactDuplicateOnly: boolean;
  /** false for imports in "odmiany" mode (owner's decision 25.10.2026): the generator uses it only for intermediate / advanced. */
  reviewedByTrainer: boolean;
}

export interface ImportOptions {
  /** Empty decision_trenera counts as "tak" (owner's blanket approval of a vetted file). */
  acceptEmpty?: boolean;
  /** suitableForNoActivity is always false, reviewed_by_trainer = false, status do_weryfikacji. */
  unreviewed?: boolean;
}

export const IMPORT_INTENSITIES = new Set(["niska", "średnia", "wysoka"]);

export function slugify(name: string): string {
  return stripDiacritics(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function locationFor(equipment: string[]): string[] {
  const heavy = equipment.some((e) => ["Sztanga", "Maszyna", "Wyciąg", "Poręcze", "Landmine"].includes(e));
  if (heavy || equipment.includes("Inny")) return ["Siłownia"];
  if (equipment.some((e) => ["Drążek", "Ławka", "TRX", "Piłka lekarska", "Talerz obciążeniowy"].includes(e))) return ["Siłownia", "Dom"];
  return ["Siłownia", "Dom", "Plener"];
}

function levelsFrom(level: string, suitable: boolean): string[] {
  const order = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];
  const from = Math.max(1, order.indexOf(level));
  const base = order.slice(from);
  return suitable ? [order[0], ...base] : base;
}

export type Validation = { ok: true; value: ImportExercise } | { ok: false; reasons: string[] };

export function validateRow(c: Record<string, string>, opts: ImportOptions = {}): Validation {
  const reasons: string[] = [];
  const name = (c.nazwapl ?? "").trim();
  if (!name) reasons.push("brak nazwy (nazwa_PL)");
  const level = (c.poziom ?? "").trim();
  if (!IMPORT_LEVELS.has(level)) reasons.push(`nieznany poziom: „${level}”`);
  const role = (c.rola ?? "").trim();
  if (!IMPORT_ROLES.has(role)) reasons.push(`nieznana rola: „${role}”`);
  const equipment = splitList(c.sprzet);
  if (equipment.length === 0) reasons.push("brak sprzętu");
  for (const e of equipment) if (!IMPORT_EQUIPMENT.has(e)) reasons.push(`sprzęt spoza zamkniętej listy: „${e}”`);
  const pattern = (c.wzorzec ?? "").trim();
  if (!IMPORT_PATTERNS.has(pattern)) reasons.push(`nieznany wzorzec ruchu: „${pattern}”`);
  const mainMuscle = (c.miesnie ?? "").trim();
  if (!IMPORT_MUSCLES.has(mainMuscle)) reasons.push(`nieznana partia mięśniowa: „${mainMuscle}”`);
  const joints = splitList(c.stawy);
  for (const j of joints) if (!IMPORT_JOINTS.has(j)) reasons.push(`nieznany staw: „${j}”`);
  const primaryMuscles = splitList(c.miesnieglowne);
  const secondaryMuscles = splitList(c.miesniepomocnicze);
  if (primaryMuscles.length === 0) reasons.push("brak mięśni głównych (mięśnie_główne)");
  if (new Set(primaryMuscles).size > 1) reasons.push("więcej niż jeden mięsień główny (baza dopuszcza jeden; resztę wpisz jako pomocnicze)");
  for (const m of [...primaryMuscles, ...secondaryMuscles]) if (!SPECIFIC_MUSCLES.has(m)) reasons.push(`nieznany mięsień szczegółowy: „${m}”`);
  for (const m of primaryMuscles) if (secondaryMuscles.includes(m)) reasons.push(`mięsień „${m}” jednocześnie główny i pomocniczy`);
  if (
    IMPORT_MUSCLES.has(mainMuscle) && mainMuscle !== "Całe ciało" && mainMuscle !== "Inne" &&
    primaryMuscles.length > 0 && !primaryMuscles.some((m) => SPECIFIC_MUSCLES.get(m) === mainMuscle)
  ) reasons.push(`żaden mięsień główny nie należy do partii „${mainMuscle}”`);
  const description = (c.opis ?? "").trim();
  if (!description) reasons.push("brak opisu");
  if (!(c.wskazowki ?? "").trim()) reasons.push("brak wskazówek (wymagane, by ćwiczenie było kompletne)");
  if (!(c.typowebledy ?? "").trim()) reasons.push("brak typowych błędów (wymagane, by ćwiczenie było kompletne)");
  const ldRaw = (c.learningdifficulty ?? "").trim();
  let ld = NaN;
  if (ldRaw === "") reasons.push("brak learningDifficulty (brak trudności = niedopuszczone)");
  else {
    ld = Number(ldRaw.replace(",", "."));
    if (!Number.isInteger(ld) || ld < 1 || ld > 5) reasons.push(`learningDifficulty musi być liczbą całkowitą 1–5, jest „${ldRaw}”`);
  }
  const intensity = (c.intensywnosc ?? "").trim();
  if (intensity) {
    if (!IMPORT_INTENSITIES.has(intensity)) reasons.push(`nieznana intensywność: „${intensity}”`);
    else if (!["Średniozaawansowany", "Zaawansowany"].includes(level)) reasons.push("pliometria (intensywność) tylko od poziomu średniozaawansowanego");
    else if (intensity === "wysoka" && level !== "Zaawansowany") reasons.push("pliometria o wysokiej intensywności tylko dla zaawansowanych");
  }
  const durRaw = (c.czass ?? "").trim();
  const duration = durRaw === "" ? null : Number(durRaw);
  if (duration !== null && (!Number.isInteger(duration) || duration < 5 || duration > 600)) reasons.push(`czas_s musi być liczbą całkowitą 5–600, jest „${durRaw}”`);
  const parentRef = (c.odmianaid ?? "").trim();
  if (parentRef && !/^\d+$/.test(parentRef) && !/^=\S+$/.test(parentRef)) reasons.push(`odmiana_id: oczekiwano numeru ćwiczenia lub „=źródło_id”, jest „${parentRef}”`);
  if (reasons.length > 0) return { ok: false, reasons };

  // suitableForNoActivity: true ONLY with exactly "tak" in this column — and never in "unreviewed" mode (all imports false).
  const suitable = !opts.unreviewed && (c.suitablefornoactivity ?? "").trim().toLowerCase() === "tak";
  const nameEn = (c.nazwaen ?? "").trim();
  const sourceId = ((c.zrodloid ?? "").trim() || nameEn.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")) || slugify(name);
  return {
    ok: true,
    value: {
      name, nameEn, slug: slugify(name), sourceId, level, role, equipment, pattern, mainMuscle, joints, description,
      primaryMuscles: [...new Set(primaryMuscles)],
      secondaryMuscles: [...new Set(secondaryMuscles)],
      secondaryMuscleGroups: [...new Set(secondaryMuscles.map((m) => SPECIFIC_MUSCLES.get(m)!))].filter((g) => g !== mainMuscle),
      coachingTips: (c.wskazowki ?? "").trim() || null,
      commonMistakes: (c.typowebledy ?? "").trim() || null,
      safetyNotes: (c.uwagabezpieczenstwa ?? "").trim() || null,
      learningDifficulty: ld,
      suitableForNoActivity: suitable,
      exerciseType: role === "główne" ? "Złożone" : "Izolowane",
      suitableExperienceLevels: levelsFrom(level, suitable),
      trainingLocation: locationFor(equipment),
      verificationStatus: suitable ? "zweryfikowane" : "do_weryfikacji",
      parentRef: parentRef || null,
      grip: (c.chwyt ?? "").trim() || null,
      position: (c.pozycja ?? "").trim() || null,
      unilateral: (c.jednostronne ?? "").trim().toLowerCase() === "tak" ? true : null,
      intensity: intensity || null,
      durationSeconds: duration,
      perSide: (c.nastrone ?? "").trim().toLowerCase() === "tak" ? true : null,
      trainingGoals: [...new Set(splitList(c.cele).map((g) => GOAL_MAP[g.toLowerCase()]).filter((g): g is string => !!g))],
      reviewedByTrainer: !opts.unreviewed,
      exactDuplicateOnly: !!parentRef || (c.nieduplikat ?? "").trim().toLowerCase() === "tak",
    },
  };
}

// ─── Duplicates ───────────────────────────────────────────────────────────────

const STOP = new Set(["z", "ze", "na", "do", "w", "i", "po", "przy", "oraz", "ćwiczenie"]);
/** Prefix stem of 5 letters — folds Polish inflection (hantle/hantli/hantlami, sztangą/sztanga). */
const stem = (t: string) => t.slice(0, 5);

export function nameTokens(name: string): Set<string> {
  const toks = stripDiacritics(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !STOP.has(t));
  return new Set(toks.map(stem));
}

export interface ExistingExercise { id: number; name: string; slug: string; mainMuscleGroup: string; movementPattern: string | null; equipment: string[]; source?: string | null; sourceId?: string | null }

export function findDuplicate(c: Pick<ImportExercise, "name" | "slug" | "pattern" | "mainMuscle" | "equipment">, existing: readonly ExistingExercise[], exactOnly = false): { id: number; name: string; why: string } | null {
  const ct = nameTokens(c.name);
  for (const e of existing) {
    if (e.slug === c.slug) return { id: e.id, name: e.name, why: "ten sam slug" };
    const et = nameTokens(e.name);
    const inter = [...ct].filter((t) => et.has(t)).length;
    const union = new Set([...ct, ...et]).size;
    if (union > 0 && inter === ct.size && inter === et.size) return { id: e.id, name: e.name, why: "ta sama nazwa po normalizacji" };
    if (exactOnly) continue;
    const jac = union === 0 ? 0 : inter / union;
    const sameShape = e.mainMuscleGroup === c.mainMuscle && (e.movementPattern ?? "") === c.pattern && e.equipment.some((q) => c.equipment.includes(q));
    if (sameShape && jac >= 0.75) return { id: e.id, name: e.name, why: `bardzo podobna nazwa (${Math.round(jac * 100)}%) i ten sam wzorzec, mięsień, sprzęt` };
  }
  return null;
}

// ─── Plan (dry-run) ───────────────────────────────────────────────────────────

export interface PlanItem { line: number; name: string; detail?: string }
export interface ImportPlan {
  toImport: Array<PlanItem & { value: ImportExercise }>;
  skippedNo: PlanItem[];
  skippedEmpty: PlanItem[];
  toFix: PlanItem[];
  rejected: PlanItem[];
  duplicates: PlanItem[];
  alreadyImported: PlanItem[];
  missingColumns: string[];
}

/** Pure given the existing catalogue — used by the dry-run and by the tests. */
export function buildPlan(rows: readonly RawRow[], existing: readonly ExistingExercise[], source: string, missingColumns: string[] = [], opts: ImportOptions = {}): ImportPlan {
  const plan: ImportPlan = { toImport: [], skippedNo: [], skippedEmpty: [], toFix: [], rejected: [], duplicates: [], alreadyImported: [], missingColumns };
  const taken: ExistingExercise[] = [...existing];
  for (const r of rows) {
    const name = r.cells.nazwapl || "(bez nazwy)";
    let d = interpretDecision(r.cells.decyzjatrenera);
    if (opts.acceptEmpty && d.kind === "pusta") d = { kind: "tak" };
    if (d.kind === "nie") { plan.skippedNo.push({ line: r.line, name }); continue; }
    if (d.kind === "pusta") { plan.skippedEmpty.push({ line: r.line, name, detail: "pusta decyzja — pominięte" }); continue; }
    if (d.kind === "poprawa") { plan.toFix.push({ line: r.line, name, detail: d.note }); continue; }
    const v = validateRow(r.cells, opts);
    if (!v.ok) { plan.rejected.push({ line: r.line, name, detail: v.reasons.join("; ") }); continue; }
    if (taken.some((e) => e.source === source && e.sourceId === v.value.sourceId)) { plan.alreadyImported.push({ line: r.line, name, detail: `źródło ${source}/${v.value.sourceId}` }); continue; }
    // A variant legitimately looks like its main exercise: do not compare it with its own parent.
    const parentNumeric = v.value.parentRef && /^\d+$/.test(v.value.parentRef) ? Number(v.value.parentRef) : null;
    const parentSource = v.value.parentRef?.startsWith("=") ? v.value.parentRef.slice(1) : null;
    const dup = findDuplicate(v.value, taken.filter((e) => e.id !== parentNumeric && !(parentSource && e.sourceId === parentSource)), v.value.exactDuplicateOnly);
    if (dup) { plan.duplicates.push({ line: r.line, name, detail: `podejrzenie duplikatu id ${dup.id} „${dup.name}” (${dup.why})` }); continue; }
    plan.toImport.push({ line: r.line, name, value: v.value });
    taken.push({ id: -plan.toImport.length, name: v.value.name, slug: v.value.slug, mainMuscleGroup: v.value.mainMuscle, movementPattern: v.value.pattern, equipment: v.value.equipment, source, sourceId: v.value.sourceId });
  }
  return plan;
}

// ─── Database ─────────────────────────────────────────────────────────────────

export async function loadExisting(): Promise<ExistingExercise[]> {
  const rows = await db.select({
    id: exercisesTable.id, name: exercisesTable.name, slug: exercisesTable.slug, mainMuscleGroup: exercisesTable.mainMuscleGroup,
    movementPattern: exercisesTable.movementPattern, equipment: exercisesTable.equipment, source: exercisesTable.source, sourceId: exercisesTable.sourceId,
  }).from(exercisesTable);
  return rows;
}

export async function planImport(buf: Buffer, source: string, opts: ImportOptions = {}): Promise<ImportPlan> {
  const { rows, missingColumns } = readPaczka(buf);
  return buildPlan(rows, await loadExisting(), source, missingColumns, opts);
}

/** Inserts the "toImport" items with their muscle assignments. Never updates or deletes anything. Returns the ids created. */
export async function applyImport(plan: ImportPlan, source: string, batch: string): Promise<number[]> {
  const ids: number[] = [];
  const usedSlugs = new Set((await db.select({ slug: exercisesTable.slug }).from(exercisesTable)).map((r) => r.slug));
  const muscleIds = new Map((await db.select({ id: specificMusclesTable.id, name: specificMusclesTable.name }).from(specificMusclesTable)).map((m) => [m.name, m.id]));
  const missing = [...SPECIFIC_MUSCLES.keys()].filter((n) => !muscleIds.has(n));
  if (missing.length) throw new Error(`W bazie brakuje mięśni szczegółowych: ${missing.join(", ")} — import przerwany, nic nie zapisano`);
  // Parents first: a variant referring to another row of the file ("=źródło_id") is inserted after it.
  const ordered = [...plan.toImport].sort((a, b) => Number(!!a.value.parentRef?.startsWith("=")) - Number(!!b.value.parentRef?.startsWith("=")));
  const existingIds = new Set((await db.select({ id: exercisesTable.id }).from(exercisesTable)).map((r) => r.id));
  for (const item of ordered) {
    const v = item.value;
    let parentId: number | null = null;
    if (v.parentRef) {
      if (v.parentRef.startsWith("=")) {
        const [p] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(and(eq(exercisesTable.source, source), eq(exercisesTable.sourceId, v.parentRef.slice(1))));
        parentId = p?.id ?? null;
      } else if (existingIds.has(Number(v.parentRef))) parentId = Number(v.parentRef);
      if (parentId === null) { console.warn(`Pominięto „${v.name}”: nie ma ćwiczenia głównego „${v.parentRef}”`); continue; }
    }
    let slug = v.slug, n = 2;
    while (usedSlugs.has(slug)) slug = `${v.slug}-${n++}`;
    usedSlugs.add(slug);
    // exercise + its muscle assignments together: an exercise without muscles never reaches the catalogue
    const id = await db.transaction(async (tx) => {
      const inserted = await tx.insert(exercisesTable).values({
        name: v.name, slug, mainMuscleGroup: v.mainMuscle, secondaryMuscleGroups: v.secondaryMuscleGroups,
        equipment: v.equipment, trainingLocation: v.trainingLocation, difficultyLevel: v.level, movementPattern: v.pattern,
        description: v.description, executionInstructions: v.description,
        coachingTips: v.coachingTips, commonMistakes: v.commonMistakes, safetyNotes: v.safetyNotes,
        exerciseType: v.exerciseType, suitableExperienceLevels: v.suitableExperienceLevels, learningDifficulty: v.learningDifficulty,
        suitableForNoActivity: v.suitableForNoActivity, role: v.role, verificationStatus: v.verificationStatus, jointStressAreas: v.joints,
        parentExerciseId: parentId, variantGrip: v.grip, variantPosition: v.position, unilateral: v.unilateral, intensity: v.intensity, trainingGoals: v.trainingGoals, defaultDurationSeconds: v.durationSeconds, perSide: v.perSide,
        reviewedByTrainer: v.reviewedByTrainer,
        isActive: true, source, sourceId: v.sourceId, importedAt: new Date(), reviewBatch: batch,
      } as never).onConflictDoNothing().returning({ id: exercisesTable.id });
      if (!inserted[0]) return null;
      await tx.insert(exerciseMuscleAssignmentsTable).values([
        ...v.primaryMuscles.map((m) => ({ exerciseId: inserted[0].id, specificMuscleId: muscleIds.get(m)!, isPrimary: true, coefficient: PRIMARY_COEFFICIENT })),
        ...v.secondaryMuscles.map((m) => ({ exerciseId: inserted[0].id, specificMuscleId: muscleIds.get(m)!, isPrimary: false, coefficient: SECONDARY_COEFFICIENT })),
      ]);
      return inserted[0].id;
    });
    if (id !== null) ids.push(id);
  }
  return ids;
}

/** Tables that reference an exercise by id (plans, sessions, logs). */
const USAGE_QUERIES = [
  "select 1 from workout_plan_exercises where exercise_id = $1 limit 1",
  "select 1 from set_logs where exercise_id = $1 limit 1",
  "select 1 from exercise_execution_logs where exercise_id = $1 limit 1",
  "select 1 from client_exercise_usage_log where exercise_id = $1 limit 1",
  "select 1 from pain_reports where exercise_id = $1 limit 1",
];

export async function rollbackBatch(batch: string): Promise<{ removed: Array<{ id: number; name: string }>; kept: Array<{ id: number; name: string; why: string }> }> {
  const rows = await db.select({ id: exercisesTable.id, name: exercisesTable.name })
    .from(exercisesTable).where(and(eq(exercisesTable.reviewBatch, batch), sql`${exercisesTable.source} <> 'own'`));
  const removed: Array<{ id: number; name: string }> = [];
  const kept: Array<{ id: number; name: string; why: string }> = [];
  for (const r of rows) {
    let used = false;
    for (const q of USAGE_QUERIES) {
      const res = await db.execute(sql.raw(q.replace("$1", String(r.id))));
      if ((res as { rows?: unknown[] }).rows?.length) { used = true; break; }
    }
    if (used) kept.push({ ...r, why: "użyte w planie/sesji/logu — nie usuwam" });
    else { await db.delete(exercisesTable).where(inArray(exercisesTable.id, [r.id])); removed.push(r); }
  }
  return { removed, kept };
}
