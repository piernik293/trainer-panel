/**
 * Monthly report of a client for the trainer (block 10): attendance, sessions, records, volume, steps, pain reports (counts), trainer's note.
 * Built on the server as a PDF (own small writer, Manrope embedded) — no paid service. Style B: Manrope, accent #C2410C, no ornaments.
 * Not a "Wrapped" (that comes later with the mascot). Pain: only the NUMBER of reports; area/date/severity/description only when the trainer
 * ticks "include pain details" — and the description of a report is shown only then.
 */
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db, clientsTable, trainersTable, workoutSessionsTable, workoutPlansTable, workoutPlanDaysTable, setLogsTable, exercisesTable, painReportsTable, dailyStepsTable,
} from "@workspace/db";
import { MANROPE_BOLD_B64, MANROPE_REGULAR_B64 } from "../assets/manropeFonts";
import { A4, PdfDoc, hex, type PdfPage } from "./pdf/pdfDoc";

export const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
export const MAX_NOTE = 1200;

// ─── Model ────────────────────────────────────────────────────────────────────

export interface ReportSession { id: number; date: string; dayName: string; rating: string | null }
export interface ReportSet { exerciseId: number; exerciseName: string; muscle: string; weightKg: number | null; reps: number | null; skipped: boolean; date: string }
export interface ReportPain { date: string; area: string; severity: number; description: string | null }
export interface ReportSteps { daysEntered: number; average: number | null; goal: number | null; daysAtGoal: number | null }
export interface ReportModel {
  month: string; clientName: string; trainerName: string | null;
  sessions: ReportSession[]; plannedPerWeek: number | null;
  sets: ReportSet[]; priorMax: Map<number, number>;
  pain: ReportPain[]; steps: ReportSteps | null;
}
export interface ReportOptions { note?: string; includePainDetails?: boolean; includeTrainerName?: boolean; now?: Date }

export const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const monthRange = (m: string) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { first: `${m}-01`, last: `${m}-${String(last).padStart(2, "0")}`, days: last, year: y, monthIndex: mo - 1 };
};
const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
/** 8000 → "8 000" (a plain space: the embedded font has no narrow no-break space) */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

// ─── Calculations (pure) ──────────────────────────────────────────────────────

/** Monday–Sunday weeks that touch the month, with the number of finished sessions in each. */
export function weeklyBuckets(month: string, sessionDates: readonly string[]): Array<{ label: string; count: number }> {
  const { first, last } = monthRange(month);
  const out: Array<{ label: string; count: number }> = [];
  const firstNo = dayNo(first), lastNo = dayNo(last);
  const dow = (n: number) => (new Date(n * 86_400_000).getUTCDay() + 6) % 7; // Monday = 0
  let start = firstNo;
  while (start <= lastNo) {
    const end = Math.min(lastNo, start + (6 - dow(start)));
    const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
    const count = sessionDates.filter((d) => dayNo(d) >= start && dayNo(d) <= end).length;
    out.push({ label: start === end ? dm(iso(start)) : `${dm(iso(start))}–${dm(iso(end))}`, count });
    start = end + 1;
  }
  return out;
}

export function attendance(done: number, plannedPerWeek: number | null, month: string): { planned: number | null; percent: number | null } {
  if (!plannedPerWeek) return { planned: null, percent: null };
  const planned = Math.max(1, Math.round((plannedPerWeek * monthRange(month).days) / 7));
  return { planned, percent: Math.min(100, Math.round((done / planned) * 100)) };
}

export interface RecordRow { name: string; weightKg: number; previous: number | null; date: string }
/** Best weight per exercise in the month; a record when it beats everything logged before the month (or the exercise is new with a weight). */
export function monthRecords(sets: readonly ReportSet[], priorMax: ReadonlyMap<number, number>): RecordRow[] {
  const best = new Map<number, { name: string; w: number; date: string }>();
  for (const s of sets) {
    if (s.skipped || s.weightKg === null || !(s.weightKg > 0) || !s.reps) continue;
    const cur = best.get(s.exerciseId);
    if (!cur || s.weightKg > cur.w) best.set(s.exerciseId, { name: s.exerciseName, w: s.weightKg, date: s.date });
  }
  return [...best.entries()]
    .map(([id, b]) => ({ name: b.name, weightKg: b.w, previous: priorMax.get(id) ?? null, date: b.date }))
    .filter((r) => r.previous === null || r.weightKg > r.previous)
    .sort((a, b) => (b.previous === null ? 0 : b.weightKg - b.previous) - (a.previous === null ? 0 : a.weightKg - a.previous) || a.name.localeCompare(b.name, "pl"))
    .slice(0, 8);
}

/** Working sets (not skipped, with reps or weight) per muscle group. */
export function muscleVolume(sets: readonly ReportSet[]): Array<{ muscle: string; sets: number }> {
  const m = new Map<string, number>();
  for (const s of sets) if (!s.skipped && (s.reps || s.weightKg)) m.set(s.muscle, (m.get(s.muscle) ?? 0) + 1);
  return [...m.entries()].map(([muscle, n]) => ({ muscle, sets: n })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle, "pl"));
}

// ─── Data (database) ──────────────────────────────────────────────────────────

export async function loadReportModel(clientId: number, trainerId: number, month: string): Promise<ReportModel | null> {
  const [client] = await db.select({ firstName: clientsTable.firstName, lastName: clientsTable.lastName, goal: clientsTable.stepsGoal }).from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainerId)));
  if (!client) return null;
  const [trainer] = await db.select({ name: trainersTable.displayName }).from(trainersTable).where(eq(trainersTable.id, trainerId));
  const { first, last } = monthRange(month);

  const sessRows = await db.select({ id: workoutSessionsTable.id, date: workoutSessionsTable.sessionDate, planDayId: workoutSessionsTable.planDayId, rating: workoutSessionsTable.sessionRating })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.isCompleted, true), gte(workoutSessionsTable.sessionDate, first), lte(workoutSessionsTable.sessionDate, last)))
    .orderBy(asc(workoutSessionsTable.sessionDate), asc(workoutSessionsTable.id));
  const dayIds = [...new Set(sessRows.map((s) => s.planDayId))];
  const dayNames = dayIds.length ? new Map((await db.select({ id: workoutPlanDaysTable.id, name: workoutPlanDaysTable.dayName }).from(workoutPlanDaysTable).where(inArray(workoutPlanDaysTable.id, dayIds))).map((d) => [d.id, d.name])) : new Map<number, string>();

  const [plan] = await db.select({ id: workoutPlansTable.id }).from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active"))).limit(1);
  const plannedPerWeek = plan ? (await db.select({ id: workoutPlanDaysTable.id }).from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan.id))).length || null : null;

  const sessionIds = sessRows.map((s) => s.id);
  const setRows = sessionIds.length
    ? await db.select({ exerciseId: setLogsTable.exerciseId, name: exercisesTable.name, muscle: exercisesTable.mainMuscleGroup, weight: setLogsTable.weightKg, reps: setLogsTable.reps, skipped: setLogsTable.skipped, sessionId: setLogsTable.sessionId })
        .from(setLogsTable).innerJoin(exercisesTable, eq(exercisesTable.id, setLogsTable.exerciseId)).where(inArray(setLogsTable.sessionId, sessionIds))
    : [];
  const dateOf = new Map(sessRows.map((s) => [s.id, String(s.date)]));
  const sets: ReportSet[] = setRows.map((r) => ({ exerciseId: r.exerciseId, exerciseName: r.name, muscle: r.muscle, weightKg: r.weight === null ? null : Number(r.weight), reps: r.reps, skipped: r.skipped, date: dateOf.get(r.sessionId)! }));

  // best weight per exercise BEFORE the month (all earlier finished sessions of this client)
  const priorMax = new Map<number, number>();
  const exIds = [...new Set(sets.map((s) => s.exerciseId))];
  if (exIds.length) {
    const prior = await db.select({ exerciseId: setLogsTable.exerciseId, weight: setLogsTable.weightKg, reps: setLogsTable.reps, skipped: setLogsTable.skipped })
      .from(setLogsTable).innerJoin(workoutSessionsTable, eq(workoutSessionsTable.id, setLogsTable.sessionId))
      .where(and(eq(workoutSessionsTable.clientId, clientId), eq(workoutSessionsTable.isCompleted, true), inArray(setLogsTable.exerciseId, exIds), lte(workoutSessionsTable.sessionDate, shiftDay(first, -1))));
    for (const p of prior) if (!p.skipped && p.weight !== null && p.reps && Number(p.weight) > (priorMax.get(p.exerciseId) ?? 0)) priorMax.set(p.exerciseId, Number(p.weight));
  }

  const pains = await db.select({ at: painReportsTable.createdAt, area: painReportsTable.area, severity: painReportsTable.severity, description: painReportsTable.description })
    .from(painReportsTable).where(and(eq(painReportsTable.clientId, clientId), gte(painReportsTable.createdAt, new Date(`${first}T00:00:00Z`)), lte(painReportsTable.createdAt, new Date(`${last}T23:59:59Z`))))
    .orderBy(asc(painReportsTable.createdAt));

  const stepRows = await db.select({ steps: dailyStepsTable.steps }).from(dailyStepsTable).where(and(eq(dailyStepsTable.clientId, clientId), gte(dailyStepsTable.day, first), lte(dailyStepsTable.day, last)));
  const steps: ReportSteps | null = stepRows.length === 0 ? null : {
    daysEntered: stepRows.length, average: Math.round(stepRows.reduce((a, r) => a + r.steps, 0) / stepRows.length), goal: client.goal ?? null,
    daysAtGoal: client.goal ? stepRows.filter((r) => r.steps >= client.goal!).length : null,
  };

  return {
    month, clientName: `${client.firstName} ${client.lastName}`.trim(), trainerName: trainer?.name ?? null,
    sessions: sessRows.map((s) => ({ id: s.id, date: String(s.date), dayName: dayNames.get(s.planDayId) ?? "Trening", rating: s.rating })),
    plannedPerWeek, sets, priorMax,
    pain: pains.map((p) => ({ date: p.at.toISOString().slice(0, 10), area: p.area, severity: p.severity, description: p.description })), steps,
  };
}
const shiftDay = (d: string, n: number) => new Date((dayNo(d) + n) * 86_400_000).toISOString().slice(0, 10);

// ─── PDF ──────────────────────────────────────────────────────────────────────

const INK = hex("#1C1917"), ACCENT = hex("#C2410C"), MUTED = hex("#6B6560"), LINE = hex("#E7E5E4"), SOFT = hex("#FBE9DF");
const RATING: Record<string, string> = { too_easy: "za lekko", just_right: "w sam raz", too_hard: "za ciężko" };
const M = 48; // page margin

export function renderMonthlyReport(model: ReportModel, o: ReportOptions = {}): Buffer {
  const now = o.now ?? new Date();
  const [y, mo] = model.month.split("-").map(Number) as [number, number];
  const monthLabel = `${MONTHS_PL[mo - 1]} ${y}`;
  const title = `Raport miesięczny — ${model.clientName} — ${monthLabel}`;
  const doc = new PdfDoc({ regular: Buffer.from(MANROPE_REGULAR_B64, "base64"), bold: Buffer.from(MANROPE_BOLD_B64, "base64") }, { title, author: o.includeTrainerName ? model.trainerName ?? undefined : undefined });
  let page: PdfPage = doc.addPage(); let y0 = M;
  const W = A4.w - 2 * M;

  const header = () => {
    page.text(M, 34, "Optimatren", { size: 9, font: "bold", color: ACCENT });
    page.text(A4.w - M, 34, `${model.clientName} · ${monthLabel}`, { size: 9, color: MUTED, align: "right" });
    page.line(M, 42, A4.w - M, 42, { color: LINE });
  };
  const ensure = (h: number) => { if (y0 + h > A4.h - 60) { page = doc.addPage(); header(); y0 = 64; } };
  const h2 = (s: string) => { ensure(36); y0 += 14; page.text(M, y0, s, { size: 13, font: "bold", color: ACCENT }); y0 += 8; page.line(M, y0, A4.w - M, y0, { color: LINE }); y0 += 16; };
  const para = (s: string, size = 10, color = INK) => { for (const l of page.wrap(s, W, size)) { ensure(size + 6); page.text(M, y0, l, { size, color }); y0 += size + 5; } };
  const kv = (k: string, v: string) => { ensure(16); page.text(M, y0, k, { size: 10, color: MUTED }); page.text(M + 190, y0, v, { size: 10, font: "bold" }); y0 += 16; };

  header();
  page.text(M, y0 + 22, "Raport miesięczny", { size: 24, font: "bold" }); y0 += 22;
  page.text(M, y0 + 22, `${model.clientName} · ${monthLabel}`, { size: 13, color: MUTED }); y0 += 26;
  if (o.includeTrainerName && model.trainerName) { page.text(M, y0 + 16, `Trener: ${model.trainerName}`, { size: 10, color: MUTED }); y0 += 26; }

  // Attendance
  const dates = model.sessions.map((s) => s.date);
  const att = attendance(dates.length, model.plannedPerWeek, model.month);
  h2("Frekwencja");
  kv("Odbyte treningi", String(dates.length));
  if (att.planned !== null) kv("Zaplanowane w tym miesiącu", `${att.planned} (${att.percent}% zrealizowane)`);
  else kv("Plan", "brak aktywnego planu");
  const buckets = weeklyBuckets(model.month, dates);
  const maxB = Math.max(1, ...buckets.map((b) => b.count), model.plannedPerWeek ?? 0);
  ensure(buckets.length * 18 + 8);
  for (const b of buckets) {
    page.text(M, y0, b.label, { size: 9, color: MUTED });
    page.rect(M + 90, y0 - 8, 3 + ((W - 130) * b.count) / maxB, 9, { fill: b.count ? ACCENT : LINE });
    page.text(M + 96 + ((W - 130) * b.count) / maxB, y0, String(b.count), { size: 9, font: "bold" });
    y0 += 18;
  }

  // Sessions
  h2("Treningi");
  if (model.sessions.length === 0) para("W tym miesiącu nie zapisano żadnego treningu.", 10, MUTED);
  for (const s of model.sessions.slice(0, 20)) {
    ensure(16);
    page.text(M, y0, dm(s.date), { size: 10, font: "bold" });
    page.text(M + 50, y0, s.dayName, { size: 10 });
    page.text(A4.w - M, y0, s.rating ? RATING[s.rating] ?? "" : "", { size: 10, color: MUTED, align: "right" });
    y0 += 16;
  }
  if (model.sessions.length > 20) para(`…i ${model.sessions.length - 20} kolejnych.`, 9, MUTED);

  // Records
  const records = monthRecords(model.sets, model.priorMax);
  h2("Rekordy ciężaru");
  if (records.length === 0) para("Brak nowych rekordów w tym miesiącu.", 10, MUTED);
  for (const r of records) {
    ensure(16);
    page.text(M, y0, r.name, { size: 10 });
    page.text(A4.w - M, y0, `${r.weightKg} kg${r.previous !== null ? ` (poprzednio ${r.previous} kg)` : " (pierwszy zapis)"}`, { size: 10, font: "bold", align: "right" });
    y0 += 16;
  }

  // Volume
  const vol = muscleVolume(model.sets);
  h2("Objętość — serie robocze według partii");
  if (vol.length === 0) para("Brak zapisanych serii.", 10, MUTED);
  const maxV = Math.max(1, ...vol.map((v) => v.sets));
  for (const v of vol.slice(0, 12)) {
    ensure(18);
    page.text(M, y0, v.muscle, { size: 9, color: INK });
    page.rect(M + 150, y0 - 8, 3 + ((W - 190) * v.sets) / maxV, 9, { fill: ACCENT });
    page.text(M + 156 + ((W - 190) * v.sets) / maxV, y0, String(v.sets), { size: 9, font: "bold" });
    y0 += 18;
  }

  // Steps (only when present)
  if (model.steps) {
    h2("Kroki");
    kv("Dni z wpisem", String(model.steps.daysEntered));
    if (model.steps.average !== null) kv("Średnio dziennie", thousands(model.steps.average));
    if (model.steps.goal) kv("Cel dzienny", `${thousands(model.steps.goal)}${model.steps.daysAtGoal !== null ? ` (osiągnięty w ${model.steps.daysAtGoal} dniach)` : ""}`);
  }

  // Pain: number only, unless the trainer ticks the details
  h2("Zgłoszenia bólu");
  kv("Liczba zgłoszeń", String(model.pain.length));
  if (o.includePainDetails) for (const p of model.pain) para(`${dm(p.date)} — ${p.area}, siła ${p.severity}/5${p.description ? `: ${p.description}` : ""}`, 9, MUTED);
  else if (model.pain.length > 0) para("Szczegóły są w profilu podopiecznego.", 9, MUTED);

  // Trainer's note
  const note = (o.note ?? "").trim().slice(0, MAX_NOTE);
  if (note) { h2("Notatka trenera"); ensure(30); para(note, 10); }

  // footers with page numbers
  doc.pages.forEach((p, i) => {
    p.line(M, A4.h - 44, A4.w - M, A4.h - 44, { color: LINE });
    p.text(M, A4.h - 30, `Wygenerowano ${now.toLocaleDateString("pl-PL")} · wartości orientacyjne, nie zalecenia medyczne`, { size: 8, color: MUTED });
    p.text(A4.w - M, A4.h - 30, `${i + 1} / ${doc.pages.length}`, { size: 8, color: MUTED, align: "right" });
  });
  void SOFT;
  return doc.build();
}
