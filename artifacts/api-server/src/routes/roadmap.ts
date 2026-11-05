/**
 * „Wkrótce w Optimatren” (flaga ROADMAP_ENABLED, domyślnie wyłączona → 404):
 *  GET    /roadmap/status         { enabled } (publiczne)
 *  GET    /roadmap                pozycje widoczne + licznik głosów + mój głos (zalogowany trener, osoba Solo lub podopieczny)
 *  POST   /roadmap/:id/vote       „Chcę to” (jeden głos na konto na pozycję)
 *  DELETE /roadmap/:id/vote       cofnięcie głosu
 *  GET    /admin/roadmap          wszystkie pozycje + wyniki z podziałem trener/Solo/podopieczny (administrator)
 *  POST   /admin/roadmap          dodanie pozycji; PATCH /admin/roadmap/:id  ukrycie, status, treść, kolejność
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, roadmapItemsTable } from "@workspace/db";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { roadmapEnabled, voterRole, listForUser, listForAdmin, vote, unvote } from "../services/roadmap";

const router: IRouter = Router();
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!roadmapEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];
const idOf = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function who(req: Request, res: Response): Promise<{ userId: string; role: NonNullable<Awaited<ReturnType<typeof voterRole>>> } | null> {
  const userId = getAuth(req)?.userId;
  if (!userId) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return null; }
  const role = await voterRole(userId);
  if (!role) { res.status(403).json({ error: "Głosować mogą trenerzy i osoby z kontem w aplikacji." }); return null; }
  return { userId, role };
}

router.get("/roadmap/status", (_req, res): void => { res.json({ enabled: roadmapEnabled() }); });

router.get("/roadmap", gate, async (req, res): Promise<void> => {
  const w = await who(req, res); if (!w) return;
  res.json({ items: await listForUser(w.userId) });
});
router.post("/roadmap/:id/vote", gate, async (req, res): Promise<void> => {
  const w = await who(req, res); if (!w) return;
  const id = idOf(req.params["id"]); if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  if (!(await vote(id, w.userId, w.role))) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});
router.delete("/roadmap/:id/vote", gate, async (req, res): Promise<void> => {
  const w = await who(req, res); if (!w) return;
  const id = idOf(req.params["id"]); if (!id) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  await unvote(id, w.userId);
  res.json({ ok: true });
});

router.get("/admin/roadmap", ...admin, async (_req, res): Promise<void> => { res.json({ enabled: roadmapEnabled(), items: await listForAdmin() }); });

const Create = z.object({ title: z.string().trim().min(3).max(80), blurb: z.string().trim().min(3).max(200), icon: z.string().trim().min(1).max(30).default("star"), sortOrder: z.number().int().min(0).max(9999).optional() });
router.post("/admin/roadmap", ...admin, async (req, res): Promise<void> => {
  const b = Create.safeParse(req.body); if (!b.success) { res.status(400).json({ error: "Podaj tytuł (3–80 znaków) i krótki opis (do 200)." }); return; }
  const slug = `${b.data.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${Date.now().toString(36)}`;
  const [row] = await db.insert(roadmapItemsTable).values({ slug, title: b.data.title, blurb: b.data.blurb, icon: b.data.icon, sortOrder: b.data.sortOrder ?? 200 }).returning({ id: roadmapItemsTable.id });
  res.status(201).json({ id: row!.id });
});
const Patch = z.object({ title: z.string().trim().min(3).max(80).optional(), blurb: z.string().trim().min(3).max(200).optional(), hidden: z.boolean().optional(),
  status: z.enum(["soon", "in_progress", "done"]).optional(), sortOrder: z.number().int().min(0).max(9999).optional() }).strict();
router.patch("/admin/roadmap/:id", ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]); const b = Patch.safeParse(req.body);
  if (!id || !b.success || Object.keys(b.data).length === 0) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const done = await db.update(roadmapItemsTable).set(b.data).where(eq(roadmapItemsTable.id, id)).returning({ id: roadmapItemsTable.id });
  if (done.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

export default router;
