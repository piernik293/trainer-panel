/**
 * Własny plan w Solo (za flagą OWN_PLAN_ENABLED; bez niej 404 OWN_PLAN_DISABLED, status odpowiada zawsze):
 *  GET  /own-plan/status                      { enabled }
 *  GET  /own-plan/search?q=                   wyszukiwarka ćwiczeń z katalogu (z ostrzeżeniem przy zgłoszonym stawie)
 *  GET  /own-plan                             bieżący aktywny plan do edycji ({ plan: null } gdy brak)
 *  PUT  /own-plan                             zapis (utworzenie albo edycja w miejscu), { title, days:[{id?, name, exercises:[…]}] }
 *  GET  /own-plan/template.csv                szablon pliku
 *  POST /own-plan/import/preview              { fileName, contentBase64, sheet? } → tabela i zgadnięte kolumny (ten sam silnik co u trenera)
 *  POST /own-plan/import/analyze              { …, mapping, hasHeader } → dni, dopasowania do katalogu, ostrzeżenia
 * Tylko osoba bez trenera (albo „Mój trening” trenera) i tylko własny plan. Nic nie jest blokowane — ostrzeżenia są spokojne.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { soloActor } from "./solo";
import { ownPlanEnabled, searchCatalogue, loadEditable, savePlan, SaveBody, realSurvey, jointNotice, resetOwnPlanCatalogueCache } from "../services/ownPlan";
import { MAX_FILE_BYTES, FIELDS, ImportFileError, TEMPLATE_CSV, guessMapping, matchExercise, parseRows, readTable, type Mapping } from "../services/planImportParse";
import { db, exercisesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { isMainPlanExercise } from "../lib/exerciseRoles";
import { loadBlockedJoints, reportedJointsLoaded } from "../services/jointExclusion";

const router: IRouter = Router();
void resetOwnPlanCatalogueCache;

const gate = (_req: Request, res: Response, next: NextFunction): void => {
  if (!ownPlanEnabled()) { res.status(404).json({ error: "Nie znaleziono.", code: "OWN_PLAN_DISABLED" }); return; }
  next();
};
async function actor(req: Request, res: Response): Promise<{ id: number } | null> {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return null; }
  const a = await soloActor(userId);
  if (!a) { res.status(403).json({ error: "Plan dla podopiecznego układa jego trener.", code: "NOT_SOLO" }); return null; }
  return a;
}

router.get("/own-plan/status", (_req, res): void => { res.json({ enabled: ownPlanEnabled() }); });

router.get("/own-plan/search", gate, async (req, res): Promise<void> => {
  const a = await actor(req, res); if (!a) return;
  res.json({ results: await searchCatalogue(a.id, String(req.query["q"] ?? "").slice(0, 80)) });
});

router.get("/own-plan", gate, async (req, res): Promise<void> => {
  const a = await actor(req, res); if (!a) return;
  res.json({ plan: await loadEditable(a.id) });
});

router.put("/own-plan", gate, async (req, res): Promise<void> => {
  const a = await actor(req, res); if (!a) return;
  const b = SaveBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.issues[0]?.message && !/^Invalid|Expected|Required/.test(b.error.issues[0].message) ? b.error.issues[0].message : "Sprawdź plan: do 7 dni, do 15 ćwiczeń w dniu, serie 1–10, powtórzenia 1–100." }); return; }
  const r = await savePlan(a.id, b.data);
  if (!r.ok) { res.status(r.status).json({ error: r.message, code: r.code }); return; }
  res.status(r.created ? 201 : 200).json({ planId: r.planId, created: r.created, warnings: r.warnings });
});

router.get("/own-plan/template.csv", gate, (_req, res): void => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="szablon-planu.csv"');
  res.send(TEMPLATE_CSV);
});

const FileBody = z.object({ fileName: z.string().min(1).max(200), contentBase64: z.string().min(4).max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16), sheet: z.string().max(100).optional() });
const MappingSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.number().int().min(0).max(29).optional()])) as Record<(typeof FIELDS)[number], z.ZodOptional<z.ZodNumber>>);
const AnalyzeBody = FileBody.extend({ mapping: MappingSchema, hasHeader: z.boolean() });
const decode = (res: Response, b: z.infer<typeof FileBody>): Buffer | null => {
  const buf = Buffer.from(b.contentBase64, "base64");
  if (buf.length > MAX_FILE_BYTES) { res.status(413).json({ error: "Plik jest za duży (maksymalnie 2 MB)." }); return null; }
  return buf;
};

router.post("/own-plan/import/preview", gate, async (req, res): Promise<void> => {
  const a = await actor(req, res); if (!a) return;
  const b = FileBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Wybierz plik .xlsx lub .csv (do 2 MB)." }); return; }
  const buf = decode(res, b.data); if (!buf) return;
  try {
    const t = readTable(buf, b.data.fileName, b.data.sheet);
    const g = guessMapping(t.rows);
    res.json({ sheetNames: t.sheetNames, sheet: t.sheet, rows: t.rows.slice(0, 40), totalRows: t.rows.length, mapping: g.mapping, hasHeader: g.hasHeader });
  } catch (e) { if (e instanceof ImportFileError) { res.status(400).json({ error: e.message }); return; } throw e; }
});

router.post("/own-plan/import/analyze", gate, async (req, res): Promise<void> => {
  const a = await actor(req, res); if (!a) return;
  const b = AnalyzeBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź plik i wskazane kolumny." }); return; }
  const buf = decode(res, b.data); if (!buf) return;
  try {
    const t = readTable(buf, b.data.fileName, b.data.sheet);
    const parsed = parseRows(t.rows, b.data.mapping as Mapping, b.data.hasHeader);
    const cat = (await db.select({ id: exercisesTable.id, name: exercisesTable.name, jointStressAreas: exercisesTable.jointStressAreas, role: exercisesTable.role }).from(exercisesTable)
      .where(and(eq(exercisesTable.isActive, true), eq(exercisesTable.hidden, false), isNull(exercisesTable.createdByTrainerId), isNull(exercisesTable.createdByClientId)))).filter(isMainPlanExercise);
    const byId = new Map(cat.map((c) => [c.id, c]));
    const survey = await realSurvey(a.id);
    const blocked = await loadBlockedJoints(a.id, survey?.healthLimitations);
    const names = cat.map((c) => ({ id: c.id, name: c.name }));
    const days = parsed.days.map((d) => ({
      name: d.name,
      rows: d.rows.map((r) => {
        const m = matchExercise(r.exerciseText, names);
        const ex = m.best ? byId.get(m.best.exerciseId) : undefined;
        const joints = ex ? reportedJointsLoaded(ex.jointStressAreas, blocked) : [];
        return { ...r, match: m.best, candidates: m.candidates, jointWarning: joints.length ? jointNotice(joints) : null };
      }),
    }));
    res.json({ days, skipped: parsed.skipped });
  } catch (e) { if (e instanceof ImportFileError) { res.status(400).json({ error: e.message }); return; } throw e; }
});

export default router;
