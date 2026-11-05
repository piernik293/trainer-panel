/**
 * Własny plan w Solo (OWN_PLAN_ENABLED, domyślnie wyłączona): osoba bez trenera wpisuje albo importuje własny plan i dalej go zmienia.
 * Plan to zwykły aktywny plan (tabele workout_plan_*), więc stoper, rekordy i osiągnięcia działają tak samo jak przy planie z generatora.
 * Plan jest użytkownika, więc NIE blokujemy — przy ćwiczeniu obciążającym zgłoszony staw pokazujemy spokojne ostrzeżenie. Ćwiczenia własne osoby
 * są nieaktywne i ukryte (poza katalogiem, generatorem i listami trenerów), ale plan i trening je wyświetlają.
 * Edycja w miejscu: istniejące dni i ćwiczenia zachowują numery (zapisane serie i rekordy nie tracą powiązania z ćwiczeniem w planie).
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, surveysTable, exercisesTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, volumeGuidelineVersionsTable } from "@workspace/db";
import { isValidExperienceLevel } from "./volumeCalculator";
import { loadBlockedJoints, reportedJointsLoaded } from "./jointExclusion";
import { isMainPlanExercise } from "../lib/exerciseRoles";
import { matchExercise } from "./planImportParse";

export const ownPlanEnabled = (env: NodeJS.ProcessEnv = process.env) => env["OWN_PLAN_ENABLED"] === "1";
/** Znacznik wywiadu-zaślepki (osoba wpisała własny plan, nie odpowiadała na pytania): generator go ignoruje. */
export const OWN_PLAN_STUB = "[plan własny — bez wywiadu]";
export const MAX_DAYS = 7;
export const MAX_EXERCISES_PER_DAY = 15;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").toLowerCase().trim();
const slugify = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cwiczenie";

export const ExerciseIn = z.object({
  id: z.number().int().positive().optional(),
  exerciseId: z.number().int().positive().nullable().optional(),
  customName: z.string().trim().min(1).max(120).optional(),
  sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1).max(100),
  repMax: z.number().int().min(1).max(100).optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  rir: z.number().int().min(0).max(4).nullable().optional(),
  restSeconds: z.number().int().min(0).max(600).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
}).refine((e) => e.exerciseId != null || !!e.customName, { message: "Wybierz ćwiczenie z listy albo wpisz własne." })
  .refine((e) => e.repMax == null || e.repMax >= e.repMin, { message: "Górna liczba powtórzeń nie może być mniejsza niż dolna." });
export const DayIn = z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(60), exercises: z.array(ExerciseIn).max(MAX_EXERCISES_PER_DAY) });
export const SaveBody = z.object({ title: z.string().trim().min(1).max(80), days: z.array(DayIn).min(1).max(MAX_DAYS) });
export type SaveIn = z.infer<typeof SaveBody>;

export interface OwnPlanWarning { dayIndex: number; exerciseIndex: number; name: string; message: string }

/** Spokojne ostrzeżenie (bez języka medycznego i bez zakazu — plan jest użytkownika). */
export const jointNotice = (joints: readonly string[]) => `Zgłaszałeś ból: ${joints.map((j) => j.toLowerCase()).join(", ")}. To ćwiczenie może to obciążać — jeśli coś boli, pomiń je albo zamień.`;
export const customNotice = (joints: readonly string[]) => `Własne ćwiczenie — nie wiemy, co obciąża. Zgłaszałeś ból: ${joints.map((j) => j.toLowerCase()).join(", ")} — uważaj i przerwij, jeśli zaboli.`;

/** Ostatni PRAWDZIWY wywiad (zaślepka nie liczy się). */
export async function realSurvey(clientId: number) {
  const rows = await db.select().from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(20);
  return rows.find((s) => s.additionalInfo !== OWN_PLAN_STUB) ?? null;
}
async function surveyForPlan(clientId: number): Promise<{ id: number; level: string }> {
  const real = await realSurvey(clientId);
  if (real) return { id: real.id, level: real.experienceLevel && isValidExperienceLevel(real.experienceLevel) ? real.experienceLevel : "Początkujący" };
  const [existingStub] = await db.select({ id: surveysTable.id }).from(surveysTable).where(and(eq(surveysTable.clientId, clientId), eq(surveysTable.additionalInfo, OWN_PLAN_STUB))).limit(1);
  if (existingStub) return { id: existingStub.id, level: "Początkujący" };
  const [s] = await db.insert(surveysTable).values({ clientId, experienceLevel: "Początkujący", additionalInfo: OWN_PLAN_STUB } as never).returning({ id: surveysTable.id });
  return { id: s!.id, level: "Początkujący" };
}

let cache: { at: number; rows: Array<{ id: number; name: string; mainMuscleGroup: string | null; equipment: string[] | null; jointStressAreas: string[] | null }> } | null = null;
async function catalogue() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const rows = await db.select({ id: exercisesTable.id, name: exercisesTable.name, mainMuscleGroup: exercisesTable.mainMuscleGroup, equipment: exercisesTable.equipment, jointStressAreas: exercisesTable.jointStressAreas, role: exercisesTable.role })
    .from(exercisesTable).where(and(eq(exercisesTable.isActive, true), eq(exercisesTable.hidden, false), isNull(exercisesTable.createdByTrainerId), isNull(exercisesTable.createdByClientId)));
  cache = { at: Date.now(), rows: rows.filter(isMainPlanExercise).map(({ role: _r, ...x }) => x) };
  return cache.rows;
}
export const resetOwnPlanCatalogueCache = () => { cache = null; };

/** Wyszukiwarka z katalogu (bez ćwiczeń cudzych i własnych): fragment nazwy bez polskich znaków, potem dopasowanie po słowach. Do 20 wyników. */
export async function searchCatalogue(clientId: number, q: string) {
  const query = fold(q);
  if (query.length < 2) return [];
  const all = await catalogue();
  const sub = all.filter((e) => fold(e.name).includes(query)).sort((a, b) => fold(a.name).indexOf(query) - fold(b.name).indexOf(query) || a.name.length - b.name.length);
  const fuzzy = matchExercise(q, all.map((e) => ({ id: e.id, name: e.name })), 20).candidates.map((c) => all.find((e) => e.id === c.exerciseId)!).filter(Boolean);
  const merged = [...new Map([...sub, ...fuzzy].map((e) => [e.id, e])).values()].slice(0, 20);
  const survey = await realSurvey(clientId);
  const blocked = await loadBlockedJoints(clientId, survey?.healthLimitations);
  return merged.map((e) => { const j = reportedJointsLoaded(e.jointStressAreas, blocked); return { id: e.id, name: e.name, muscleGroup: e.mainMuscleGroup, equipment: e.equipment ?? [], warning: j.length ? jointNotice(j) : null }; });
}

/** Bieżący aktywny plan w postaci do edycji (albo null). */
export async function loadEditable(clientId: number) {
  const [plan] = await db.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active"))).orderBy(desc(workoutPlansTable.activatedAt)).limit(1);
  if (!plan) return null;
  const days = await db.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, plan.id)).orderBy(asc(workoutPlanDaysTable.dayOrder));
  const ids = days.map((d) => d.id);
  const exs = ids.length ? await db.select({
    id: workoutPlanExercisesTable.id, dayId: workoutPlanExercisesTable.dayId, orderInDay: workoutPlanExercisesTable.orderInDay, exerciseId: workoutPlanExercisesTable.exerciseId, name: exercisesTable.name,
    custom: exercisesTable.createdByClientId, sets: workoutPlanExercisesTable.workingSets, repsExact: workoutPlanExercisesTable.repsExact, repMin: workoutPlanExercisesTable.repRangeMin, repMax: workoutPlanExercisesTable.repRangeMax,
    loadValue: workoutPlanExercisesTable.loadValue, rir: workoutPlanExercisesTable.rir, restSeconds: workoutPlanExercisesTable.restSeconds, note: workoutPlanExercisesTable.clientInstructions,
  }).from(workoutPlanExercisesTable).innerJoin(exercisesTable, eq(exercisesTable.id, workoutPlanExercisesTable.exerciseId)).where(inArray(workoutPlanExercisesTable.dayId, ids)).orderBy(asc(workoutPlanExercisesTable.orderInDay)) : [];
  return {
    planId: plan.id, title: plan.title, origin: plan.createdBy ?? null,
    days: days.map((d) => ({ id: d.id, name: d.dayName ?? `Dzień ${d.dayOrder}`, exercises: exs.filter((e) => e.dayId === d.id).map((e) => ({
      id: e.id, exerciseId: e.exerciseId, name: e.name, custom: e.custom != null, sets: e.sets, repMin: e.repMin ?? e.repsExact ?? 8, repMax: e.repMax ?? e.repsExact ?? e.repMin ?? 8,
      weightKg: e.loadValue != null && e.loadValue !== "" && Number.isFinite(Number(e.loadValue)) ? Number(e.loadValue) : null, rir: e.rir ?? null, restSeconds: e.restSeconds ?? null, note: e.note ?? null,
    })) })),
  };
}

const loadFields = (w: number | null | undefined) => (w != null ? { loadType: "fixed", loadValue: String(w), loadInstruction: null } : { loadType: null, loadValue: null, loadInstruction: null });
const repFields = (e: { repMin: number; repMax?: number }) => (e.repMax && e.repMax !== e.repMin
  ? { repType: "range", repsExact: null, repRangeMin: Math.min(e.repMin, e.repMax), repRangeMax: Math.max(e.repMin, e.repMax) }
  : { repType: "exact", repsExact: e.repMin, repRangeMin: null, repRangeMax: null });

export type SaveResult = { ok: true; planId: number; created: boolean; warnings: OwnPlanWarning[] } | { ok: false; status: number; code: string; message: string };

export async function savePlan(clientId: number, body: SaveIn): Promise<SaveResult> {
  const ids = [...new Set(body.days.flatMap((d) => d.exercises).map((e) => e.exerciseId).filter((x): x is number => x != null))];
  const found = ids.length ? await db.select({ id: exercisesTable.id, name: exercisesTable.name, isActive: exercisesTable.isActive, hidden: exercisesTable.hidden, createdByTrainerId: exercisesTable.createdByTrainerId, createdByClientId: exercisesTable.createdByClientId, joints: exercisesTable.jointStressAreas }).from(exercisesTable).where(inArray(exercisesTable.id, ids)) : [];
  const usable = new Map(found.filter((e) => (e.isActive && !e.hidden && e.createdByTrainerId == null && e.createdByClientId == null) || e.createdByClientId === clientId).map((e) => [e.id, e]));
  const bad = ids.find((i) => !usable.has(i));
  if (bad !== undefined) return { ok: false, status: 404, code: "EXERCISE_NOT_FOUND", message: "Nie znaleziono jednego z ćwiczeń. Wybierz je ponownie z listy." };
  const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).where(eq(volumeGuidelineVersionsTable.isActive, true)).orderBy(volumeGuidelineVersionsTable.id).limit(1);
  if (!ver) return { ok: false, status: 500, code: "NO_GUIDELINES", message: "Chwilowy problem techniczny. Spróbuj ponownie za chwilę." };
  const survey = await surveyForPlan(clientId);
  const realS = await realSurvey(clientId);
  const blocked = await loadBlockedJoints(clientId, realS?.healthLimitations);

  const result = await db.transaction(async (tx) => {
    // ćwiczenia własne osoby: jedno na nazwę (ponowne użycie), nieaktywne i ukryte
    const customIds = new Map<string, number>();
    for (const name of [...new Set(body.days.flatMap((d) => d.exercises).filter((e) => e.exerciseId == null).map((e) => e.customName!))]) {
      const [have] = await tx.select({ id: exercisesTable.id, n: exercisesTable.name }).from(exercisesTable).where(and(eq(exercisesTable.createdByClientId, clientId), eq(exercisesTable.name, name))).limit(1);
      if (have) { customIds.set(name, have.id); continue; }
      const [e] = await tx.insert(exercisesTable).values({ name, slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`, mainMuscleGroup: "Inne", isActive: false, hidden: true, createdByClientId: clientId, description: "Ćwiczenie własne (własny plan)." } as never).returning({ id: exercisesTable.id });
      customIds.set(name, e!.id);
    }
    let [plan] = await tx.select().from(workoutPlansTable).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active"))).orderBy(desc(workoutPlansTable.activatedAt)).limit(1);
    const created = !plan;
    const now = new Date();
    if (!plan) {
      [plan] = await tx.insert(workoutPlansTable).values({ clientId, surveyId: survey.id, guidelineVersionId: ver.id, experienceLevelUsed: survey.level, title: body.title, status: "active", activatedAt: now, startDate: now.toISOString().slice(0, 10), createdBy: "own", description: "Własny plan" } as never).returning();
    } else {
      await tx.update(workoutPlansTable).set({ title: body.title, updatedAt: now } as never).where(eq(workoutPlansTable.id, plan.id));
    }
    const planId = plan!.id;
    const oldDays = await tx.select().from(workoutPlanDaysTable).where(eq(workoutPlanDaysTable.planId, planId));
    const oldDayIds = oldDays.map((d) => d.id);
    const oldExs = oldDayIds.length ? await tx.select({ id: workoutPlanExercisesTable.id, dayId: workoutPlanExercisesTable.dayId }).from(workoutPlanExercisesTable).where(inArray(workoutPlanExercisesTable.dayId, oldDayIds)) : [];
    const oldDaySet = new Set(oldDayIds); const oldExSet = new Set(oldExs.map((e) => e.id));
    const keepDays = new Set<number>(); const keepExs = new Set<number>();
    const warnings: OwnPlanWarning[] = [];
    for (let di = 0; di < body.days.length; di++) {
      const d = body.days[di]!;
      let dayId: number;
      if (d.id && oldDaySet.has(d.id)) { dayId = d.id; await tx.update(workoutPlanDaysTable).set({ dayOrder: di + 1, dayName: d.name } as never).where(eq(workoutPlanDaysTable.id, dayId)); }
      else { const [nd] = await tx.insert(workoutPlanDaysTable).values({ planId, dayOrder: di + 1, dayName: d.name } as never).returning({ id: workoutPlanDaysTable.id }); dayId = nd!.id; }
      keepDays.add(dayId);
      for (let ei = 0; ei < d.exercises.length; ei++) {
        const e = d.exercises[ei]!;
        const exerciseId = e.exerciseId ?? customIds.get(e.customName!)!;
        const values = { dayId, exerciseId, orderInDay: ei + 1, workingSets: e.sets, ...repFields(e), ...loadFields(e.weightKg), rir: e.rir ?? null, restSeconds: e.restSeconds ?? null, clientInstructions: e.note?.trim() ? e.note.trim() : null };
        if (e.id && oldExSet.has(e.id)) { await tx.update(workoutPlanExercisesTable).set(values as never).where(eq(workoutPlanExercisesTable.id, e.id)); keepExs.add(e.id); }
        else { const [ne] = await tx.insert(workoutPlanExercisesTable).values(values as never).returning({ id: workoutPlanExercisesTable.id }); keepExs.add(ne!.id); }
        const u = usable.get(exerciseId);
        const joints = u && u.createdByClientId == null ? reportedJointsLoaded(u.joints, blocked) : [];
        if (joints.length) warnings.push({ dayIndex: di, exerciseIndex: ei, name: u!.name, message: jointNotice(joints) });
        else if (blocked.size > 0 && (e.exerciseId == null || u?.createdByClientId === clientId)) warnings.push({ dayIndex: di, exerciseIndex: ei, name: e.customName ?? u?.name ?? "Własne ćwiczenie", message: customNotice([...blocked]) });
      }
    }
    const dropEx = oldExs.filter((e) => !keepExs.has(e.id)).map((e) => e.id);
    if (dropEx.length) await tx.delete(workoutPlanExercisesTable).where(inArray(workoutPlanExercisesTable.id, dropEx));
    const dropDays = oldDayIds.filter((id) => !keepDays.has(id));
    if (dropDays.length) await tx.delete(workoutPlanDaysTable).where(inArray(workoutPlanDaysTable.id, dropDays));
    return { planId, created, warnings };
  });
  return { ok: true, ...result };
}
