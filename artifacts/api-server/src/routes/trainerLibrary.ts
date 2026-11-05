/**
 * Biblioteka trenera (flaga TRAINER_LIBRARY_ENABLED, domyślnie wyłączona → 404). Własne ćwiczenia trenera są prywatne (widzi je on i jego podopieczni).
 *  GET  /trainer-library/status               { enabled } (publiczne)
 *  GET  /trainer-library                      własne ćwiczenia (kompletność, zgoda, status), opcja generatora, listy stawów/poziomów
 *  PATCH /trainer-library/:id                 { jointStress, jointStressAreas } — uzupełnienie stawów i poziomu obciążenia własnego ćwiczenia
 *  PUT  /trainer-library/settings             { useOwnInGenerator } — „Używaj moich ćwiczeń w generatorze” (tylko kompletne; domyślnie wyłączone)
 *  PUT  /trainer-library/:id/share            { consent } — zgoda na wspólną bibliotekę (domyślnie NIE; tylko kompletne ćwiczenie), z datą
 *  GET  /admin/exercise-proposals             administrator: ćwiczenia ze zgodą + podobne w katalogu
 *  POST /admin/exercise-proposals/:id/add     KOPIA do katalogu (nieaktywna, do weryfikacji; bez „bez aktywności”); dziennik akcji
 *  POST /admin/exercise-proposals/:id/reject  { reason } — powód wymagany; dziennik akcji
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, exercisesTable, trainersTable, exerciseMuscleAssignmentsTable, exerciseProposalLogTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { trainerLibraryEnabled, ownExercises, proposals, LIBRARY_JOINTS, JOINT_LEVELS } from "../services/trainerLibrary";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!trainerLibraryEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];
const idOf = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get("/trainer-library/status", (_req, res): void => { res.json({ enabled: trainerLibraryEnabled() }); });

router.get("/trainer-library", gate, requireAuth, async (req, res): Promise<void> => {
  const t = req.trainer!;
  const [row] = await db.select({ u: trainersTable.useOwnExercisesInGenerator }).from(trainersTable).where(eq(trainersTable.id, t.id));
  res.json({ useOwnInGenerator: row?.u === true, joints: LIBRARY_JOINTS, levels: JOINT_LEVELS, exercises: await ownExercises(t.id) });
});

const Complete = z.object({ jointStress: z.enum(JOINT_LEVELS), jointStressAreas: z.array(z.enum(LIBRARY_JOINTS)).max(6) }).strict();
router.patch("/trainer-library/:id", gate, requireAuth, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]); const b = Complete.safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Wybierz poziom obciążenia stawów i listę stawów (może być pusta)." }); return; }
  const done = await db.update(exercisesTable).set({ jointStress: b.data.jointStress, jointStressAreas: [...new Set(b.data.jointStressAreas)] })
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.createdByTrainerId, req.trainer!.id))).returning({ id: exercisesTable.id });
  if (done.length === 0) { res.status(404).json({ error: "Nie znaleziono ćwiczenia." }); return; }
  res.json({ ok: true });
});

router.put("/trainer-library/settings", gate, requireAuth, async (req, res): Promise<void> => {
  const b = z.object({ useOwnInGenerator: z.boolean() }).strict().safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Nieprawidłowe ustawienie." }); return; }
  await db.update(trainersTable).set({ useOwnExercisesInGenerator: b.data.useOwnInGenerator }).where(eq(trainersTable.id, req.trainer!.id));
  res.json({ useOwnInGenerator: b.data.useOwnInGenerator });
});

router.put("/trainer-library/:id/share", gate, requireAuth, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]); const b = z.object({ consent: z.boolean() }).strict().safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const list = await ownExercises(req.trainer!.id);
  const ex = list.find((e) => e.id === id);
  if (!ex) { res.status(404).json({ error: "Nie znaleziono ćwiczenia." }); return; }
  if (b.data.consent && !ex.complete) { res.status(422).json({ error: "Uzupełnij dane ćwiczenia, zanim zaproponujesz je do wspólnej biblioteki.", code: "INCOMPLETE", missing: ex.missing }); return; }
  const keep = ex.shareStatus === "added"; // już dodane do wspólnej — kopia zostaje, zgody nie cofamy wstecz
  if (b.data.consent) await db.update(exercisesTable).set({ shareConsent: true, shareConsentAt: new Date(), shareStatus: keep ? "added" : "proposed", shareRejectReason: null }).where(eq(exercisesTable.id, id));
  else await db.update(exercisesTable).set({ shareConsent: false, shareConsentAt: null, shareStatus: keep ? "added" : "none" }).where(eq(exercisesTable.id, id));
  res.json({ ok: true, shareStatus: b.data.consent ? (keep ? "added" : "proposed") : (keep ? "added" : "none") });
});

router.get("/admin/exercise-proposals", gate, ...admin, async (_req, res): Promise<void> => { res.json({ items: await proposals() }); });

router.post("/admin/exercise-proposals/:id/add", gate, ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]); if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const [src] = await db.select().from(exercisesTable).where(and(eq(exercisesTable.id, id), eq(exercisesTable.shareConsent, true), eq(exercisesTable.shareStatus, "proposed")));
  if (!src) { res.status(404).json({ error: "Nie znaleziono propozycji." }); return; }
  const copyId = await db.transaction(async (tx) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
    const [copy] = await tx.insert(exercisesTable).values({
      ...rest, slug: `${src.slug}-wspolna-${src.id}`,
      createdByTrainerId: null, createdByClientId: null,
      isActive: false, hidden: true, reviewedByTrainer: false, // do weryfikacji w przeglądzie katalogu; nie trafia do żadnego planu, dopóki nie zostanie zatwierdzone
      suitableForNoActivity: null, learningDifficulty: null, // „bez aktywności” i poziom nauki NIE są ustawiane — ocenia je przegląd katalogu
      shareConsent: false, shareConsentAt: null, shareStatus: "none", shareRejectReason: null, sharedCopyExerciseId: null,
    } as never).returning({ id: exercisesTable.id });
    const muscles = await tx.select().from(exerciseMuscleAssignmentsTable).where(eq(exerciseMuscleAssignmentsTable.exerciseId, src.id));
    for (const m of muscles) { const { id: _mid, ...mr } = m as Record<string, unknown>; await tx.insert(exerciseMuscleAssignmentsTable).values({ ...mr, exerciseId: copy!.id } as never); }
    await tx.update(exercisesTable).set({ shareStatus: "added", sharedCopyExerciseId: copy!.id }).where(eq(exercisesTable.id, src.id));
    await tx.insert(exerciseProposalLogTable).values({ exerciseId: src.id, actorClerkUserId: req.clerkUserId!, action: "added", copyExerciseId: copy!.id });
    return copy!.id;
  });
  logger.info({ exerciseId: id, copyId }, "Propozycja ćwiczenia dodana do wspólnej biblioteki (do weryfikacji)");
  res.status(201).json({ copyId });
});

router.post("/admin/exercise-proposals/:id/reject", gate, ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]); const b = z.object({ reason: z.string().trim().min(5).max(300) }).safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Podaj powód odrzucenia (co najmniej 5 znaków)." }); return; }
  const done = await db.update(exercisesTable).set({ shareStatus: "rejected", shareRejectReason: b.data.reason })
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.shareConsent, true), eq(exercisesTable.shareStatus, "proposed"))).returning({ id: exercisesTable.id });
  if (done.length === 0) { res.status(404).json({ error: "Nie znaleziono propozycji." }); return; }
  await db.insert(exerciseProposalLogTable).values({ exerciseId: id, actorClerkUserId: req.clerkUserId!, action: "rejected", reason: b.data.reason });
  res.json({ ok: true });
});

export default router;
