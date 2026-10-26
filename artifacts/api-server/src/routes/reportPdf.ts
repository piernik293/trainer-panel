/**
 * POST /clients/:clientId/monthly-report  { month: "YYYY-MM", note?, includePainDetails?, includeTrainerName? } → application/pdf (attachment)
 * Trainer only, own clients only (another trainer's client → 404). Pain: only a count unless includePainDetails.
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { MAX_NOTE, isMonth, loadReportModel, renderMonthlyReport } from "../services/monthlyReport";

const router: IRouter = Router();
const Body = z.object({
  month: z.string().refine(isMonth, "Miesiąc w formacie RRRR-MM"),
  note: z.string().max(MAX_NOTE).optional(),
  includePainDetails: z.boolean().optional(),
  includeTrainerName: z.boolean().optional(),
});

router.post("/clients/:clientId/monthly-report", requireAuth, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) { res.status(400).json({ error: "Nieprawidłowe ID" }); return; }
  const b = Body.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Wybierz miesiąc (RRRR-MM); notatka do 1200 znaków." }); return; }
  const model = await loadReportModel(clientId, req.trainer!.id, b.data.month);
  if (!model) { res.status(404).json({ error: "Klient nie znaleziony." }); return; }
  const pdf = renderMonthlyReport(model, b.data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="raport-${b.data.month}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

export default router;
