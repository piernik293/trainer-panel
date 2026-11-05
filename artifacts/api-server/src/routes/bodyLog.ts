/**
 * Masa ciała i obwody wpisywane przez osobę (flaga BODY_LOG_ENABLED, domyślnie wyłączona → 404). Tylko własne dane, id z sesji.
 *  GET    /body-log/status            { enabled } (publiczne)
 *  GET    /client-portal/body         ostatnie wpisy (do 180) — od najstarszego
 *  POST   /client-portal/body         { measuredOn?, weightKg?, waistCm?, hipsCm?, chestCm?, armCm?, thighCm? } — jeden wpis na dzień (kolejny z tą datą nadpisuje podane pola)
 *  DELETE /client-portal/body/:id     usunięcie własnego wpisu
 * Bez ocen, celów i porównań z „normą” — tylko liczby i wykres. Trener tych danych nie widzi.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, bodyMeasurementsTable } from "@workspace/db";
import { requireClientAuth } from "../middlewares/requireClientAuth";

const router: IRouter = Router();
export const bodyLogEnabled = (): boolean => process.env["BODY_LOG_ENABLED"] === "1";
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!bodyLogEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };

const num = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const Body = z.object({
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weightKg: num(20, 400), waistCm: num(20, 300), hipsCm: num(20, 300), chestCm: num(20, 300), armCm: num(5, 100), thighCm: num(10, 200),
}).strict();
const FIELDS = ["weightKg", "waistCm", "hipsCm", "chestCm", "armCm", "thighCm"] as const;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
const asNum = (v: string | null) => (v == null ? null : Number(v));

router.get("/body-log/status", (_req, res): void => { res.json({ enabled: bodyLogEnabled() }); });

router.get("/client-portal/body", gate, requireClientAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.clientId, req.client!.id)).orderBy(desc(bodyMeasurementsTable.measuredOn)).limit(180);
  res.json({ items: rows.reverse().map((r) => ({ id: r.id, measuredOn: r.measuredOn, weightKg: asNum(r.weightKg), waistCm: asNum(r.waistCm), hipsCm: asNum(r.hipsCm), chestCm: asNum(r.chestCm), armCm: asNum(r.armCm), thighCm: asNum(r.thighCm) })) });
});

router.post("/client-portal/body", gate, requireClientAuth, async (req, res): Promise<void> => {
  const b = Body.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Sprawdź wpisane liczby (np. masa 20–400 kg)." }); return; }
  const given = FIELDS.filter((f) => b.data[f] != null);
  if (given.length === 0) { res.status(400).json({ error: "Wpisz co najmniej jedną wartość." }); return; }
  const day = b.data.measuredOn ?? today();
  if (day > today()) { res.status(400).json({ error: "Data nie może być z przyszłości." }); return; }
  const values = Object.fromEntries(given.map((f) => [f, String(b.data[f])])) as Record<string, string>;
  const [row] = await db.insert(bodyMeasurementsTable).values({ clientId: req.client!.id, measuredOn: day, ...values })
    .onConflictDoUpdate({ target: [bodyMeasurementsTable.clientId, bodyMeasurementsTable.measuredOn], set: values }).returning({ id: bodyMeasurementsTable.id });
  res.status(201).json({ id: row!.id, measuredOn: day });
});

router.delete("/client-portal/body/:id", gate, requireClientAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Nieprawidłowe parametry żądania." }); return; }
  const gone = await db.delete(bodyMeasurementsTable).where(and(eq(bodyMeasurementsTable.id, id), eq(bodyMeasurementsTable.clientId, req.client!.id))).returning({ id: bodyMeasurementsTable.id });
  if (gone.length === 0) { res.status(404).json({ error: "Nie znaleziono." }); return; }
  res.json({ ok: true });
});

export default router;
