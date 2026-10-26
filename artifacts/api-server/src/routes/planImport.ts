/**
 * Plan import from Excel / CSV (block 9). No AI. Trainer-only, own clients only.
 *  GET  /plan-import/template.csv                    template file
 *  POST /clients/:clientId/plan-import/preview       { fileName, contentBase64, sheet? } → table, guessed column mapping
 *  POST /clients/:clientId/plan-import/analyze       { fileName, contentBase64, sheet?, mapping, hasHeader } → days/rows, catalogue matches, warnings
 *  POST /clients/:clientId/plan-import/save          { title, target: "plan"|"template", days, acknowledgeJointWarning? } → draft plan or template
 *  GET  /plan-templates, POST /plan-templates/:id/apply { clientId }
 * Safety is the same as for a manual add: equipment/place of the client's interview is a hard check (422), an exercise loading a reported
 * joint needs the trainer's confirmation (409 → acknowledgeJointWarning) and the decision is recorded. File limits: 2 MB, 1500 rows, 30 columns.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  db, clientsTable, surveysTable, exercisesTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable,
  volumeGuidelineVersionsTable, jointWarningDecisionsTable, planTemplatesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { isValidExperienceLevel } from "../services/volumeCalculator";
import { buildCompatibilityFilter, getExerciseCompatibilityError } from "../services/planDraftDayRecommendationsService";
import { loadBlockedJoints, reportedJointsLoaded, jointWarningMessage } from "../services/jointExclusion";
import { isSubscriptionLimitError, runWithSubscriptionLimit } from "../services/subscriptionService";
import { isMainPlanExercise } from "../lib/exerciseRoles";
import { MAX_FILE_BYTES, FIELDS, ImportFileError, TEMPLATE_CSV, guessMapping, matchExercise, parseRows, readTable, type Mapping } from "../services/planImportParse";

const router: IRouter = Router();

const FileBody = z.object({ fileName: z.string().min(1).max(200), contentBase64: z.string().min(4).max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16), sheet: z.string().max(100).optional() });
const MappingSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.number().int().min(0).max(29).optional()])) as Record<(typeof FIELDS)[number], z.ZodOptional<z.ZodNumber>>);
const AnalyzeBody = FileBody.extend({ mapping: MappingSchema, hasHeader: z.boolean() });

const ExerciseIn = z.object({
  exerciseId: z.number().int().positive().nullable(),
  customName: z.string().trim().min(1).max(120).optional(),
  sets: z.number().int().min(1).max(20).nullable().optional(),
  repsMin: z.number().int().min(1).max(200).nullable().optional(),
  repsMax: z.number().int().min(1).max(200).nullable().optional(),
  repsText: z.string().max(60).optional(),
  loadText: z.string().max(60).optional(),
  rir: z.number().int().min(0).max(5).nullable().optional(),
  note: z.string().max(500).optional(),
});
const SaveBody = z.object({
  title: z.string().trim().min(1).max(120),
  target: z.enum(["plan", "template"]),
  goal: z.string().max(120).optional(),
  acknowledgeJointWarning: z.boolean().optional(),
  days: z.array(z.object({ dayName: z.string().trim().min(1).max(80), exercises: z.array(ExerciseIn).min(1).max(30) })).min(1).max(14),
});
type SaveIn = z.infer<typeof SaveBody>;

async function ownClient(req: Request, res: Response, clientId: number) {
  if (!Number.isInteger(clientId)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return undefined; }
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
  if (!c) { res.status(404).json({ error: "Klient nie znaleziony." }); return undefined; }
  return c;
}
function decode(res: Response, body: z.infer<typeof FileBody>): Buffer | null {
  const buf = Buffer.from(body.contentBase64, "base64");
  if (buf.length > MAX_FILE_BYTES) { res.status(413).json({ error: "Plik jest za duży (maksymalnie 2 MB)." }); return null; }
  return buf;
}
const fail = (res: Response, e: unknown): boolean => {
  if (e instanceof ImportFileError) { res.status(400).json({ error: e.message }); return true; }
  return false;
};

router.get("/plan-import/template.csv", requireAuth, (_req, res): void => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="szablon-planu.csv"');
  res.send(TEMPLATE_CSV);
});

router.post("/clients/:clientId/plan-import/preview", requireAuth, async (req, res): Promise<void> => {
  if (!(await ownClient(req, res, Number(req.params.clientId)))) return;
  const b = FileBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Wybierz plik .xlsx lub .csv (do 2 MB)." }); return; }
  const buf = decode(res, b.data); if (!buf) return;
  try {
    const t = readTable(buf, b.data.fileName, b.data.sheet);
    const g = guessMapping(t.rows);
    res.json({ sheetNames: t.sheetNames, sheet: t.sheet, rows: t.rows.slice(0, 40), totalRows: t.rows.length, mapping: g.mapping, hasHeader: g.hasHeader });
  } catch (e) { if (!fail(res, e)) throw e; }
});

router.post("/clients/:clientId/plan-import/analyze", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!(await ownClient(req, res, clientId))) return;
  const b = AnalyzeBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź plik i wskazane kolumny." }); return; }
  const buf = decode(res, b.data); if (!buf) return;
  try {
    const t = readTable(buf, b.data.fileName, b.data.sheet);
    const parsed = parseRows(t.rows, b.data.mapping as Mapping, b.data.hasHeader);
    const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
    const catalogue = await db.select({
      id: exercisesTable.id, name: exercisesTable.name, trainingLocation: exercisesTable.trainingLocation, equipment: exercisesTable.equipment,
      requiredEquipmentAll: exercisesTable.requiredEquipmentAll, jointStressAreas: exercisesTable.jointStressAreas, role: exercisesTable.role,
    }).from(exercisesTable).where(and(eq(exercisesTable.isActive, true), or(isNull(exercisesTable.createdByTrainerId), eq(exercisesTable.createdByTrainerId, req.trainer!.id))));
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    const blocked = survey ? await loadBlockedJoints(clientId, survey.healthLimitations) : new Set<string>();
    const compatible = survey ? buildCompatibilityFilter(survey.trainingLocation, survey.equipment, new Set<number>()) : () => true;
    const names = catalogue.filter(isMainPlanExercise).map((c) => ({ id: c.id, name: c.name }));
    const days = parsed.days.map((d) => ({
      name: d.name,
      rows: d.rows.map((r) => {
        const m = matchExercise(r.exerciseText, names);
        const ex = m.best ? byId.get(m.best.exerciseId) : undefined;
        const joints = ex ? reportedJointsLoaded(ex.jointStressAreas, blocked) : [];
        const equipmentOk = !ex || !survey || compatible({ id: ex.id, trainingLocation: ex.trainingLocation ?? [], equipment: ex.equipment ?? [], requiredEquipmentAll: ex.requiredEquipmentAll ?? [] });
        return { ...r, match: m.best, candidates: m.candidates, jointWarning: joints.length ? jointWarningMessage(joints) : null, equipmentProblem: equipmentOk || !ex ? null : getExerciseCompatibilityError({ id: ex.id, name: ex.name, trainingLocation: ex.trainingLocation ?? [], equipment: ex.equipment ?? [], requiredEquipmentAll: ex.requiredEquipmentAll ?? [] }, survey ?? {}) };
      }),
    }));
    res.json({ days, skipped: parsed.skipped, hasSurvey: !!survey });
  } catch (e) { if (!fail(res, e)) throw e; }
});

// ─── Save ─────────────────────────────────────────────────────────────────────

const slugify = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cwiczenie";
const loadOf = (t: string | undefined) => {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(kg)?\s*$/i.exec(t ?? "");
  return m ? { loadType: "fixed", loadValue: m[1]!.replace(",", "."), loadInstruction: null } : t?.trim() ? { loadType: null, loadValue: null, loadInstruction: t.trim() } : { loadType: null, loadValue: null, loadInstruction: null };
};
const repsOf = (e: SaveIn["days"][number]["exercises"][number]) => {
  if (e.repsMin && e.repsMax && e.repsMin !== e.repsMax) return { repType: "range" as const, repsExact: null, repRangeMin: Math.min(e.repsMin, e.repsMax), repRangeMax: Math.max(e.repsMin, e.repsMax), repOpenInstruction: null };
  if (e.repsMin) return { repType: "exact" as const, repsExact: e.repsMin, repRangeMin: null, repRangeMax: null, repOpenInstruction: null };
  return e.repsText?.trim() ? { repType: "open" as const, repsExact: null, repRangeMin: null, repRangeMax: null, repOpenInstruction: e.repsText.trim() } : { repType: null, repsExact: null, repRangeMin: null, repRangeMax: null, repOpenInstruction: null };
};

/** Creates the trainer's own exercises for names without a catalogue match (one per distinct name). Returns name → id. */
async function createCustomExercises(trainerId: number, names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const name of [...new Set(names)]) {
    const [e] = await runWithSubscriptionLimit(trainerId, "customExercises", (tx) =>
      tx.insert(exercisesTable).values({
        name, slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`, mainMuscleGroup: "Inne", createdByTrainerId: trainerId,
        description: "Ćwiczenie własne trenera (import z pliku). Uzupełnij opis i partie mięśniowe w katalogu.",
      }).returning({ id: exercisesTable.id }));
    out.set(name, e!.id);
  }
  return out;
}

router.post("/clients/:clientId/plan-import/save", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;
  const clientId = Number(req.params.clientId);
  if (!(await ownClient(req, res, clientId))) return;
  const b = SaveBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź dane planu (dni, ćwiczenia, serie 1–20)." }); return; }
  try {
    const out = await savePlan(req, res, trainerId, clientId, b.data);
    if (out) res.status(201).json(out);
  } catch (e) {
    if (isSubscriptionLimitError(e)) { res.status(409).json(e.toResponse()); return; }
    throw e;
  }
});

async function savePlan(req: Request, res: Response, trainerId: number, clientId: number, body: SaveIn): Promise<{ planId?: number; templateId?: number } | null> {
  const all = body.days.flatMap((d) => d.exercises);
  if (all.length > 200) { res.status(400).json({ error: "Za dużo ćwiczeń (maksymalnie 200)." }); return null; }
  for (const e of all) if (e.exerciseId === null && !e.customName) { res.status(400).json({ error: "Przy ćwiczeniu bez dopasowania podaj nazwę (ćwiczenie własne)." }); return null; }

  const ids = [...new Set(all.map((e) => e.exerciseId).filter((x): x is number => x !== null))];
  const found = ids.length ? await db.select({
    id: exercisesTable.id, name: exercisesTable.name, trainingLocation: exercisesTable.trainingLocation, equipment: exercisesTable.equipment,
    requiredEquipmentAll: exercisesTable.requiredEquipmentAll, jointStressAreas: exercisesTable.jointStressAreas, createdByTrainerId: exercisesTable.createdByTrainerId, isActive: exercisesTable.isActive,
  }).from(exercisesTable).where(inArray(exercisesTable.id, ids)) : [];
  const usable = new Map(found.filter((e) => e.isActive && (e.createdByTrainerId === null || e.createdByTrainerId === trainerId)).map((e) => [e.id, e]));
  const missing = ids.find((i) => !usable.has(i));
  if (missing !== undefined) { res.status(404).json({ error: `Ćwiczenie o ID ${missing} nie zostało znalezione.` }); return null; }

  let surveyId = 0, level = "";
  if (body.target === "plan") {
    const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
    if (!survey?.experienceLevel || !isValidExperienceLevel(survey.experienceLevel)) { res.status(400).json({ error: "Wywiad klienta nie ma poziomu doświadczenia. Uzupełnij wywiad, zanim zapiszesz plan." }); return null; }
    surveyId = survey.id; level = survey.experienceLevel;
    // equipment / place of the interview: a hard check, like a manual add
    const compatible = buildCompatibilityFilter(survey.trainingLocation, survey.equipment, new Set<number>());
    for (const ex of usable.values()) {
      if (!compatible({ id: ex.id, trainingLocation: ex.trainingLocation ?? [], equipment: ex.equipment ?? [], requiredEquipmentAll: ex.requiredEquipmentAll ?? [] })) {
        res.status(422).json({ error: getExerciseCompatibilityError({ id: ex.id, name: ex.name, trainingLocation: ex.trainingLocation ?? [], equipment: ex.equipment ?? [], requiredEquipmentAll: ex.requiredEquipmentAll ?? [] }, survey), code: "EXERCISE_INCOMPATIBLE", exerciseId: ex.id });
        return null;
      }
    }
    // a reported joint: confirmation required, decision recorded
    const blocked = await loadBlockedJoints(clientId, survey.healthLimitations);
    const conflicts = [...usable.values()].map((ex) => ({ ex, joints: reportedJointsLoaded(ex.jointStressAreas, blocked) })).filter((c) => c.joints.length > 0);
    if (conflicts.length > 0 && body.acknowledgeJointWarning !== true) {
      res.status(409).json({ error: conflicts.map((c) => `${c.ex.name}: ${jointWarningMessage(c.joints)}`).join(" "), code: "EXERCISE_LOADS_REPORTED_JOINT", conflicts: conflicts.map((c) => ({ exerciseId: c.ex.id, exerciseName: c.ex.name, joints: c.joints })) });
      return null;
    }
  }

  const customIds = await createCustomExercises(trainerId, all.filter((e) => e.exerciseId === null).map((e) => e.customName!));
  const idOf = (e: (typeof all)[number]) => e.exerciseId ?? customIds.get(e.customName!)!;

  if (body.target === "template") {
    const payload = { goal: body.goal ?? null, days: body.days.map((d) => ({ dayName: d.dayName, exercises: d.exercises.map((e) => ({ exerciseId: idOf(e), sets: e.sets ?? 3, repsMin: e.repsMin ?? null, repsMax: e.repsMax ?? null, repsText: e.repsText ?? "", loadText: e.loadText ?? "", rir: e.rir ?? null, note: e.note ?? "" })) })) };
    const [t] = await db.insert(planTemplatesTable).values({ trainerId, title: body.title, payload }).returning({ id: planTemplatesTable.id });
    return { templateId: t!.id };
  }

  const [ver] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).where(eq(volumeGuidelineVersionsTable.isActive, true)).orderBy(volumeGuidelineVersionsTable.id).limit(1);
  if (!ver) { res.status(500).json({ error: "Brak aktywnej wersji wytycznych objętości." }); return null; }
  const blocked = await loadBlockedJoints(clientId, (await db.select({ h: surveysTable.healthLimitations }).from(surveysTable).where(eq(surveysTable.id, surveyId)))[0]?.h);
  const planId = await db.transaction(async (tx) => {
    const [plan] = await tx.insert(workoutPlansTable).values({ clientId, surveyId, guidelineVersionId: ver.id, experienceLevelUsed: level, title: body.title, goal: body.goal ?? null, description: "Zaimportowany z pliku", status: "draft" }).returning({ id: workoutPlansTable.id });
    for (let i = 0; i < body.days.length; i++) {
      const d = body.days[i]!;
      const [day] = await tx.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: i + 1, dayName: d.dayName }).returning({ id: workoutPlanDaysTable.id });
      for (let j = 0; j < d.exercises.length; j++) {
        const e = d.exercises[j]!;
        const [row] = await tx.insert(workoutPlanExercisesTable).values({
          dayId: day!.id, exerciseId: idOf(e), orderInDay: j + 1, workingSets: e.sets ?? 3, warmUpSets: 0, ...repsOf(e), ...loadOf(e.loadText),
          rir: e.rir ?? null, notes: e.note?.trim() || null,
        }).returning({ id: workoutPlanExercisesTable.id });
        const ex = e.exerciseId !== null ? usable.get(e.exerciseId) : undefined;
        const joints = ex ? reportedJointsLoaded(ex.jointStressAreas, blocked) : [];
        if (ex && joints.length > 0) await tx.insert(jointWarningDecisionsTable).values({ trainerId, clientId, planId: plan!.id, planExerciseId: row!.id, exerciseId: ex.id, exerciseNameSnapshot: ex.name, joints, decision: "dodaj_mimo_to" });
      }
    }
    return plan!.id;
  });
  return { planId };
}

// ─── Templates ────────────────────────────────────────────────────────────────

router.get("/plan-templates", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ id: planTemplatesTable.id, title: planTemplatesTable.title, createdAt: planTemplatesTable.createdAt, payload: planTemplatesTable.payload })
    .from(planTemplatesTable).where(eq(planTemplatesTable.trainerId, req.trainer!.id)).orderBy(desc(planTemplatesTable.createdAt));
  res.json(rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, days: ((r.payload as { days?: unknown[] }).days ?? []).length })));
});

router.post("/plan-templates/:id/apply", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number((req.body as { clientId?: unknown })?.clientId);
  if (!(await ownClient(req, res, clientId))) return;
  const [t] = await db.select().from(planTemplatesTable).where(and(eq(planTemplatesTable.id, Number(req.params.id)), eq(planTemplatesTable.trainerId, req.trainer!.id)));
  if (!t) { res.status(404).json({ error: "Szablon nie znaleziony." }); return; }
  const p = t.payload as { goal: string | null; days: Array<{ dayName: string; exercises: Array<{ exerciseId: number; sets: number; repsMin: number | null; repsMax: number | null; repsText: string; loadText: string; rir: number | null; note: string }> }> };
  const body: SaveIn = {
    title: t.title, target: "plan", goal: p.goal ?? undefined, acknowledgeJointWarning: (req.body as { acknowledgeJointWarning?: boolean }).acknowledgeJointWarning === true,
    days: p.days.map((d) => ({ dayName: d.dayName, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, repsText: e.repsText, loadText: e.loadText, rir: e.rir, note: e.note })) })),
  };
  const out = await savePlan(req, res, req.trainer!.id, clientId, body);
  if (out) res.status(201).json(out);
});

export default router;
