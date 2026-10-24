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
 *  - rollback removes only rows of one review batch that no plan/session/log uses.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, exercisesTable } from "@workspace/db";

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

/** Header → canonical keys: nazwapl, nazwaen, poziom, rola, sprzet, wzorzec, miesnie, stawy, cele, opis, wskazowki, typowebledy, uwagabezpieczenstwa, suitablefornoactivity, learningdifficulty, decyzjatrenera, zrodloid. */
export function readPaczka(buf: Buffer): { delimiter: string; rows: RawRow[]; missingColumns: string[] } {
  const text = decodePaczka(buf);
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  if (table.length === 0) return { delimiter, rows: [], missingColumns: ["nazwapl", "decyzjatrenera"] };
  const keys = table[0].map(headerKey);
  const need = ["nazwapl", "decyzjatrenera", "learningdifficulty"];
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
export const IMPORT_ROLES = new Set(["główne", "pomocnicze", "rozgrzewka", "rozciąganie"]);
export const IMPORT_MUSCLES = new Set([
  "Klatka piersiowa", "Plecy", "Barki", "Biceps", "Triceps", "Przedramiona", "Brzuch", "Pośladki", "Mięśnie czworogłowe uda",
  "Mięśnie dwugłowe uda", "Przywodziciele", "Odwodziciele", "Łydki", "Całe ciało", "Inne",
]);
export const IMPORT_EQUIPMENT = new Set([
  "Sztanga", "Hantle", "Kettlebell", "Maszyna", "Wyciąg", "Drążek", "Poręcze", "Ławka", "Gumy oporowe", "TRX",
  "Masa własnego ciała", "Piłka", "Piłka lekarska", "Talerz obciążeniowy", "Uchwyty do pompek", "Kółka gimnastyczne", "Brak sprzętu", "Inny",
]);
export const IMPORT_PATTERNS = new Set([
  "Pchanie poziome", "Pchanie pionowe", "Przyciąganie poziome", "Przyciąganie pionowe", "Przysiad", "Zawias biodrowy", "Wykrok",
  "Zgięcie kolana", "Wyprost kolana", "Odwodzenie", "Przywodzenie", "Zgięcie łokcia", "Wyprost łokcia", "Zgięcie/wyprost nadgarstka",
  "Wzruszanie ramion", "Wspięcie na palce", "Stabilizacja tułowia", "Zgięcie tułowia", "Rotacja", "Lokomocja", "Anti-ekstensja",
  "Anti-rotacja", "Mobilizacja", "Rozciąganie", "Aktywacja", "Inne",
]);
export const IMPORT_JOINTS = new Set(["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"]);

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
}

export function slugify(name: string): string {
  return stripDiacritics(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function locationFor(equipment: string[]): string[] {
  const heavy = equipment.some((e) => ["Sztanga", "Maszyna", "Wyciąg", "Poręcze"].includes(e));
  if (heavy) return ["Siłownia"];
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

export function validateRow(c: Record<string, string>): Validation {
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
  const description = (c.opis ?? "").trim();
  if (!description) reasons.push("brak opisu");
  const ldRaw = (c.learningdifficulty ?? "").trim();
  let ld = NaN;
  if (ldRaw === "") reasons.push("brak learningDifficulty (brak trudności = niedopuszczone)");
  else {
    ld = Number(ldRaw.replace(",", "."));
    if (!Number.isInteger(ld) || ld < 1 || ld > 5) reasons.push(`learningDifficulty musi być liczbą całkowitą 1–5, jest „${ldRaw}”`);
  }
  if (reasons.length > 0) return { ok: false, reasons };

  // suitableForNoActivity: true ONLY with exactly "tak" in this column.
  const suitable = (c.suitablefornoactivity ?? "").trim().toLowerCase() === "tak";
  const nameEn = (c.nazwaen ?? "").trim();
  const sourceId = ((c.zrodloid ?? "").trim() || nameEn.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")) || slugify(name);
  return {
    ok: true,
    value: {
      name, nameEn, slug: slugify(name), sourceId, level, role, equipment, pattern, mainMuscle, joints, description,
      coachingTips: (c.wskazowki ?? "").trim() || null,
      commonMistakes: (c.typowebledy ?? "").trim() || null,
      safetyNotes: (c.uwagabezpieczenstwa ?? "").trim() || null,
      learningDifficulty: ld,
      suitableForNoActivity: suitable,
      exerciseType: role === "główne" ? "Złożone" : "Izolowane",
      suitableExperienceLevels: levelsFrom(level, suitable),
      trainingLocation: locationFor(equipment),
      verificationStatus: suitable ? "zweryfikowane" : "do_weryfikacji",
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

export function findDuplicate(c: Pick<ImportExercise, "name" | "slug" | "pattern" | "mainMuscle" | "equipment">, existing: readonly ExistingExercise[]): { id: number; name: string; why: string } | null {
  const ct = nameTokens(c.name);
  for (const e of existing) {
    if (e.slug === c.slug) return { id: e.id, name: e.name, why: "ten sam slug" };
    const et = nameTokens(e.name);
    const inter = [...ct].filter((t) => et.has(t)).length;
    const union = new Set([...ct, ...et]).size;
    if (union > 0 && inter === ct.size && inter === et.size) return { id: e.id, name: e.name, why: "ta sama nazwa po normalizacji" };
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
export function buildPlan(rows: readonly RawRow[], existing: readonly ExistingExercise[], source: string, missingColumns: string[] = []): ImportPlan {
  const plan: ImportPlan = { toImport: [], skippedNo: [], skippedEmpty: [], toFix: [], rejected: [], duplicates: [], alreadyImported: [], missingColumns };
  const taken: ExistingExercise[] = [...existing];
  for (const r of rows) {
    const name = r.cells.nazwapl || "(bez nazwy)";
    const d = interpretDecision(r.cells.decyzjatrenera);
    if (d.kind === "nie") { plan.skippedNo.push({ line: r.line, name }); continue; }
    if (d.kind === "pusta") { plan.skippedEmpty.push({ line: r.line, name, detail: "pusta decyzja — pominięte" }); continue; }
    if (d.kind === "poprawa") { plan.toFix.push({ line: r.line, name, detail: d.note }); continue; }
    const v = validateRow(r.cells);
    if (!v.ok) { plan.rejected.push({ line: r.line, name, detail: v.reasons.join("; ") }); continue; }
    if (taken.some((e) => e.source === source && e.sourceId === v.value.sourceId)) { plan.alreadyImported.push({ line: r.line, name, detail: `źródło ${source}/${v.value.sourceId}` }); continue; }
    const dup = findDuplicate(v.value, taken);
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

export async function planImport(buf: Buffer, source: string): Promise<ImportPlan> {
  const { rows, missingColumns } = readPaczka(buf);
  return buildPlan(rows, await loadExisting(), source, missingColumns);
}

/** Inserts the "toImport" items. Never updates or deletes anything. Returns the ids created. */
export async function applyImport(plan: ImportPlan, source: string, batch: string): Promise<number[]> {
  const ids: number[] = [];
  const usedSlugs = new Set((await db.select({ slug: exercisesTable.slug }).from(exercisesTable)).map((r) => r.slug));
  for (const item of plan.toImport) {
    const v = item.value;
    let slug = v.slug, n = 2;
    while (usedSlugs.has(slug)) slug = `${v.slug}-${n++}`;
    usedSlugs.add(slug);
    const inserted = await db.insert(exercisesTable).values({
      name: v.name, slug, mainMuscleGroup: v.mainMuscle, equipment: v.equipment, trainingLocation: v.trainingLocation,
      difficultyLevel: v.level, movementPattern: v.pattern,
      executionInstructions: v.description, coachingTips: v.coachingTips, commonMistakes: v.commonMistakes, safetyNotes: v.safetyNotes,
      exerciseType: v.exerciseType, suitableExperienceLevels: v.suitableExperienceLevels, learningDifficulty: v.learningDifficulty,
      suitableForNoActivity: v.suitableForNoActivity, role: v.role, verificationStatus: v.verificationStatus, jointStressAreas: v.joints,
      isActive: true, source, sourceId: v.sourceId, importedAt: new Date(), reviewBatch: batch,
    } as never).onConflictDoNothing().returning({ id: exercisesTable.id });
    if (inserted[0]) ids.push(inserted[0].id);
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
