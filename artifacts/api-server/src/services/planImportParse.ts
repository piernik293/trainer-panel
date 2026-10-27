/**
 * Import of a training plan from Excel / CSV (block 9) — parsing only, no database, no AI, no new libraries.
 *  - .xlsx: a minimal reader (ZIP container with node:zlib + the few XML parts we need), protected against huge files;
 *  - .csv: UTF-8 (with/without BOM) or Windows-1250, ";" or ",";
 *  - the trainer maps the columns; names are matched with the catalogue by `matchExercise` (best hit + candidates, never silently wrong).
 */
import { inflateRawSync } from "node:zlib";

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // decoded file
export const MAX_ROWS = 1500;
export const MAX_COLS = 30;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024; // decompressed size of one part (zip-bomb guard)

export class ImportFileError extends Error {}

// ─── Table reading ────────────────────────────────────────────────────────────

export interface RawTable { sheetNames: string[]; sheet: string; rows: string[][] }

export function readTable(buf: Buffer, fileName: string, sheet?: string): RawTable {
  if (buf.length === 0) throw new ImportFileError("Plik jest pusty.");
  if (buf.length > MAX_FILE_BYTES) throw new ImportFileError("Plik jest za duży (maksymalnie 2 MB).");
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
  const lower = fileName.toLowerCase();
  let t: RawTable;
  if (isZip) {
    if (!lower.endsWith(".xlsx")) throw new ImportFileError("Obsługujemy pliki .xlsx i .csv.");
    t = readXlsx(buf, sheet);
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    t = { sheetNames: ["CSV"], sheet: "CSV", rows: readCsvRows(buf) };
  } else {
    throw new ImportFileError("Obsługujemy pliki .xlsx i .csv (nie .xls ani inne formaty).");
  }
  const rows = t.rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) throw new ImportFileError("W pliku nie ma żadnych danych.");
  return { ...t, rows };
}

export function decodeText(buf: Buffer): string {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1250").decode(b); }
}

export function readCsvRows(buf: Buffer): string[][] {
  const text = decodeText(buf);
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  let semi = 0, comma = 0, tab = 0, q = false;
  for (const ch of first) { if (ch === '"') q = !q; else if (!q) { if (ch === ";") semi++; else if (ch === ",") comma++; else if (ch === "\t") tab++; } }
  const delim = tab > semi && tab > comma ? "\t" : semi >= comma ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) break; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}

// ─── Minimal .xlsx ────────────────────────────────────────────────────────────

interface ZipEntry { name: string; method: number; compSize: number; offset: number }

function zipEntries(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ImportFileError("Nie udało się odczytać pliku .xlsx (uszkodzony plik).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > 500) throw new ImportFileError("Plik .xlsx ma zbyt wiele elementów.");
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ImportFileError("Nie udało się odczytać pliku .xlsx (uszkodzony plik).");
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    out.set(buf.toString("utf8", p + 46, p + 46 + nameLen), { name: buf.toString("utf8", p + 46, p + 46 + nameLen), method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function zipRead(buf: Buffer, e: ZipEntry): string {
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) throw new ImportFileError("Nie udało się odczytać pliku .xlsx (uszkodzony plik).");
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.compSize);
  try {
    const raw = e.method === 0 ? data : e.method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }) : null;
    if (!raw) throw new ImportFileError("Nieobsługiwana kompresja w pliku .xlsx.");
    if (raw.length > MAX_ENTRY_BYTES) throw new ImportFileError("Plik .xlsx jest zbyt duży po rozpakowaniu.");
    return raw.toString("utf8");
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new ImportFileError("Plik .xlsx jest zbyt duży po rozpakowaniu albo uszkodzony.");
  }
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const textsIn = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]!)).join("");
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function readXlsx(buf: Buffer, wanted?: string): RawTable {
  const z = zipEntries(buf);
  const get = (n: string) => { const e = z.get(n); return e ? zipRead(buf, e) : null; };
  const wb = get("xl/workbook.xml");
  if (!wb) throw new ImportFileError("To nie wygląda na arkusz Excela (.xlsx).");
  const rels = get("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/\bId="([^"]*)"/.exec(m[0])?.[1] ?? "", /\bTarget="([^"]*)"/.exec(m[0])?.[1] ?? ""]));
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unxml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? ""), rid: /\br:id="([^"]*)"/.exec(m[0])?.[1] ?? "" }));
  if (sheets.length === 0) throw new ImportFileError("W pliku nie ma arkuszy.");
  const chosen = sheets.find((s) => s.name === wanted) ?? sheets[0]!;
  const path = (target.get(chosen.rid) ?? "worksheets/sheet1.xml").replace(/^\//, "");
  const xml = get(path.startsWith("xl/") ? path : `xl/${path}`);
  if (!xml) throw new ImportFileError("Nie udało się odczytać arkusza.");
  const sst = get("xl/sharedStrings.xml");
  const shared = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textsIn(m[1]!)) : [];
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!, body = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : row.length;
      if (idx >= MAX_COLS) continue;
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1])] ?? "";
      else if (type === "inlineStr") val = textsIn(body);
      else { const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]; val = v === undefined ? "" : unxml(v); if (type === "b") val = v === "1" ? "TAK" : "NIE"; }
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    rows.push(row);
    if (rows.length > MAX_ROWS + 1) break;
  }
  return { sheetNames: sheets.map((s) => s.name), sheet: chosen.name, rows };
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export const FIELDS = ["day", "exercise", "sets", "reps", "load", "rir", "note"] as const;
export type Field = (typeof FIELDS)[number];
export type Mapping = Partial<Record<Field, number>>;

export const FIELD_LABELS: Record<Field, string> = { day: "Dzień", exercise: "Ćwiczenie", sets: "Serie", reps: "Powtórzenia", load: "Ciężar", rir: "RIR", note: "Notatka" };

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const HEADER_HINTS: Record<Field, RegExp> = {
  day: /^(dzien|trening|day|sesja|jednostka)\b/, exercise: /^(cwiczenie|nazwa|exercise|ruch)\b/, sets: /^(serie|seria|sety|set|sets|s)$/,
  reps: /^(powt|reps|repetycje|powtorzenia|zakres)/, load: /^(ciezar|obciazenie|kg|load|weight)/, rir: /^(rir|rpe|zapas)/, note: /^(notatka|uwagi|komentarz|opis|note|notes)/,
};

/** Guesses the mapping from the first row (header). Returns the guess and whether row 1 looks like a header. */
export function guessMapping(rows: string[][]): { mapping: Mapping; hasHeader: boolean } {
  const head = (rows[0] ?? []).map(fold);
  const mapping: Mapping = {};
  head.forEach((h, i) => { for (const f of FIELDS) if (mapping[f] === undefined && h && HEADER_HINTS[f].test(h)) { mapping[f] = i; break; } });
  const hasHeader = Object.keys(mapping).length >= 2;
  return { mapping, hasHeader };
}

// ─── Rows → plan ──────────────────────────────────────────────────────────────

export interface ParsedRow {
  line: number; // 1-based line in the file
  day: string; exerciseText: string; sets: number | null; repsMin: number | null; repsMax: number | null; repsText: string;
  loadText: string; rir: number | null; note: string; errors: string[];
}

const num = (s: string) => { const n = Number(s.replace(",", ".").trim()); return Number.isFinite(n) ? n : null; };

export function parseReps(raw: string): { min: number | null; max: number | null; text: string } {
  const t = raw.trim().replace(/[–—]/g, "-");
  const range = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(t);
  if (range) { const a = Number(range[1]), b = Number(range[2]); return { min: Math.min(a, b), max: Math.max(a, b), text: raw.trim() }; }
  const one = /^(\d{1,3})(\s*x)?$/i.exec(t);
  if (one) return { min: Number(one[1]), max: Number(one[1]), text: raw.trim() };
  return { min: null, max: null, text: raw.trim() };
}

export function parseRows(rows: string[][], mapping: Mapping, hasHeader: boolean): { days: Array<{ name: string; rows: ParsedRow[] }>; skipped: number } {
  if (mapping.exercise === undefined) throw new ImportFileError("Wskaż kolumnę z nazwą ćwiczenia.");
  const days: Array<{ name: string; rows: ParsedRow[] }> = [];
  let current: { name: string; rows: ParsedRow[] } | null = null; let skipped = 0;
  const cell = (r: string[], f: Field) => (mapping[f] === undefined ? "" : (r[mapping[f]!] ?? "").trim());
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0);
    const ex = cell(r, "exercise"), day = cell(r, "day");
    if (!ex) { if (day && (!current || current.name !== day)) { current = { name: day, rows: [] }; days.push(current); } else if (r.some((c) => c.trim())) skipped++; return; }
    if (!current || (day && day !== current.name)) { current = { name: day || `Dzień ${days.length + 1}`, rows: [] }; days.push(current); }
    const errors: string[] = [];
    const setsRaw = cell(r, "sets"); const sets = setsRaw ? num(setsRaw) : null;
    if (setsRaw && (sets === null || !Number.isInteger(sets) || sets < 1 || sets > 20)) errors.push("Serie: liczba całkowita 1–20.");
    const reps = parseReps(cell(r, "reps"));
    if (cell(r, "reps") && reps.min === null) errors.push("Powtórzenia: podaj liczbę albo zakres, np. 8-12.");
    const rirRaw = cell(r, "rir").replace(/^(rir|rpe)\s*/i, ""); const rir = rirRaw ? num(rirRaw) : null;
    if (rirRaw && (rir === null || !Number.isInteger(rir) || rir < 0 || rir > 5)) errors.push("RIR: liczba całkowita 0–5.");
    current.rows.push({ line, day: current.name, exerciseText: ex, sets: sets !== null && Number.isInteger(sets) ? sets : null, repsMin: reps.min, repsMax: reps.max, repsText: reps.text, loadText: cell(r, "load"), rir: rir !== null && Number.isInteger(rir) ? rir : null, note: cell(r, "note"), errors });
  });
  return { days: days.filter((d) => d.rows.length > 0), skipped };
}

// ─── Matching names with the catalogue ────────────────────────────────────────

const STOP = new Set(["z", "ze", "na", "do", "w", "i", "po", "przy", "oraz", "the", "with", "a"]);
const stem = (t: string) => t.slice(0, 5);
export function nameKey(name: string): Set<string> {
  return new Set(fold(name).split(" ").filter((t) => t && !STOP.has(t)).map(stem));
}

export interface CatalogueName { id: number; name: string }
export interface Match { exerciseId: number; name: string; score: number }

export function matchExercise(text: string, catalogue: readonly CatalogueName[], limit = 5): { best: Match | null; candidates: Match[] } {
  const a = nameKey(text);
  if (a.size === 0) return { best: null, candidates: [] };
  const scored: Match[] = [];
  for (const c of catalogue) {
    const b = nameKey(c.name);
    const inter = [...a].filter((t) => b.has(t)).length;
    if (inter === 0) continue;
    const jac = inter / new Set([...a, ...b]).size;
    const exact = fold(text) === fold(c.name) ? 1 : 0;
    scored.push({ exerciseId: c.id, name: c.name, score: Math.round((exact ? 1 : jac) * 100) / 100 });
  }
  scored.sort((x, y) => y.score - x.score || x.name.length - y.name.length || x.exerciseId - y.exerciseId);
  const candidates = scored.slice(0, limit);
  // "best" only when it is convincing; otherwise the trainer chooses (never a silent wrong guess)
  const top = candidates[0];
  const second = candidates[1];
  const best = top && top.score >= 0.6 && (!second || top.score - second.score >= 0.1 || top.score === 1) ? top : null;
  return { best, candidates };
}

export const TEMPLATE_CSV = "﻿Dzień;Ćwiczenie;Serie;Powtórzenia;Ciężar;RIR;Notatka\r\nDzień 1;Przysiad ze sztangą;3;8-12;40 kg;2;Pięty na podłodze\r\nDzień 1;Wyciskanie hantli leżąc;3;8-12;12 kg;2;\r\nDzień 2;Martwy ciąg rumuński ze sztangą;3;8-10;50 kg;3;Plecy proste\r\n";
