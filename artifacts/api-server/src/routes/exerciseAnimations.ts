/**
 * Animacje ćwiczeń (flaga EXERCISE_ANIMATIONS_ENABLED — NIE włączać bez zgody właściciela; domyślnie wyłączona → 404).
 *  GET  /exercise-animations/status               { enabled } (publiczne)
 *  GET  /exercise-animations/:exerciseId          ZATWIERDZONA animacja (zalogowany trener lub podopieczny); inne statusy = 404
 *  (trasy /admin/animations* działają ZAWSZE — właściciel ocenia animacje przed włączeniem flagi)
 *  GET  /admin/animations                         wszystkie + opis, wskazówki, błędy walidacji — administrator
 *  POST /admin/animations/seed                    wstawia brakujące animacje z biblioteki (status „do sprawdzenia”); nie rusza istniejących
 *  POST /admin/animations/:exerciseId/approve     [Zatwierdź] (kto i kiedy)
 *  POST /admin/animations/:exerciseId/needs-work  { note } [Do poprawy] — wraca do „do sprawdzenia” z uwagą, cofa zatwierdzenie
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { ANIMATION_LIBRARY, validateSpec, type AnimSpec } from "@workspace/survey-config";
import { db, exerciseAnimationsTable, exercisesTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();
export const animationsEnabled = (): boolean => process.env["EXERCISE_ANIMATIONS_ENABLED"] === "1";
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!animationsEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];
const idOf = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get("/exercise-animations/status", (_req, res): void => { res.json({ enabled: animationsEnabled() }); });

router.get("/exercise-animations/:exerciseId", gate, async (req, res): Promise<void> => {
  if (!getAuth(req)?.userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return; }
  const id = idOf(req.params["exerciseId"]); if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const [row] = await db.select().from(exerciseAnimationsTable).where(eq(exerciseAnimationsTable.exerciseId, id));
  if (!row || row.status !== "approved") { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ exerciseId: id, spec: row.spec });
});

router.get("/admin/animations", ...admin, async (_req, res): Promise<void> => {
  const rows = await db.select({ a: exerciseAnimationsTable, name: exercisesTable.name, description: exercisesTable.description, executionInstructions: exercisesTable.executionInstructions, coachingTips: exercisesTable.coachingTips, commonMistakes: exercisesTable.commonMistakes })
    .from(exerciseAnimationsTable).innerJoin(exercisesTable, eq(exercisesTable.id, exerciseAnimationsTable.exerciseId)).orderBy(exerciseAnimationsTable.id);
  res.json({ items: rows.map((r) => ({ exerciseId: r.a.exerciseId, name: r.name, status: r.a.status, reviewNote: r.a.reviewNote, approvedBy: r.a.approvedBy, approvedAt: r.a.approvedAt, spec: r.a.spec, problems: validateSpec(r.a.spec as AnimSpec),
    description: r.description, executionInstructions: r.executionInstructions, coachingTips: r.coachingTips, commonMistakes: r.commonMistakes })) });
});

router.post("/admin/animations/seed", ...admin, async (_req, res): Promise<void> => {
  const ids = ANIMATION_LIBRARY.map((a) => a.exerciseId);
  const have = new Set((await db.select({ id: exerciseAnimationsTable.exerciseId }).from(exerciseAnimationsTable).where(inArray(exerciseAnimationsTable.exerciseId, ids))).map((r) => r.id));
  const ex = new Map((await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable).where(inArray(exercisesTable.id, ids))).map((r) => [r.id, r.name]));
  const added: number[] = [], skipped: { id: number; why: string }[] = [];
  for (const a of ANIMATION_LIBRARY) {
    if (have.has(a.exerciseId)) { skipped.push({ id: a.exerciseId, why: "już istnieje" }); continue; }
    if (!ex.has(a.exerciseId)) { skipped.push({ id: a.exerciseId, why: "brak ćwiczenia o tym numerze" }); continue; }
    if (ex.get(a.exerciseId) !== a.name) { skipped.push({ id: a.exerciseId, why: `nazwa w katalogu inna niż w bibliotece („${ex.get(a.exerciseId)}”)` }); continue; }
    const problems = validateSpec(a.spec); if (problems.length) { skipped.push({ id: a.exerciseId, why: problems.join("; ") }); continue; }
    await db.insert(exerciseAnimationsTable).values({ exerciseId: a.exerciseId, spec: a.spec as never, status: "review" }); added.push(a.exerciseId);
  }
  res.status(201).json({ added, skipped });
});

router.post("/admin/animations/:exerciseId/approve", ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["exerciseId"]); if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const [row] = await db.select().from(exerciseAnimationsTable).where(eq(exerciseAnimationsTable.exerciseId, id));
  if (!row) { res.status(404).json({ error: "Nie znaleziono animacji." }); return; }
  if (validateSpec(row.spec as AnimSpec).length) { res.status(422).json({ error: "Dane animacji mają błędy — nie można zatwierdzić.", code: "INVALID_SPEC" }); return; }
  await db.update(exerciseAnimationsTable).set({ status: "approved", approvedBy: req.clerkUserId!, approvedAt: new Date(), reviewNote: null, updatedAt: new Date() }).where(eq(exerciseAnimationsTable.exerciseId, id));
  res.json({ ok: true });
});

router.post("/admin/animations/:exerciseId/needs-work", ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["exerciseId"]); const b = z.object({ note: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Napisz, co poprawić (co najmniej 3 znaki)." }); return; }
  const done = await db.update(exerciseAnimationsTable).set({ status: "review", reviewNote: b.data.note, approvedBy: null, approvedAt: null, updatedAt: new Date() }).where(eq(exerciseAnimationsTable.exerciseId, id)).returning({ id: exerciseAnimationsTable.id });
  if (done.length === 0) { res.status(404).json({ error: "Nie znaleziono animacji." }); return; }
  res.json({ ok: true });
});

export default router;
