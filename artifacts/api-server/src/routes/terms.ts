/**
 * Regulamin i eksport danych (flaga TERMS_ENABLED, domyślnie wyłączona → 404):
 *  GET  /terms/status   { enabled, version } (publiczne)
 *  GET  /terms/me       { version, accepted, previousVersion } — czy to konto zaakceptowało bieżącą wersję
 *  POST /terms/accept   { version } — zapis zgody z wersją i datą (tylko bieżąca wersja)
 *  GET  /me/export      „Pobierz moje dane” (§14): plik JSON z danymi konta; limit 3 na dobę; w dzienniku tylko fakt eksportu (bez treści)
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { termsEnabled, CURRENT_TERMS_VERSION, termsState, acceptTerms, buildExport, exportsLast24h, logExport, EXPORT_LIMIT_PER_DAY } from "../services/terms";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const gate = (_req: Request, res: Response, next: NextFunction): void => { if (!termsEnabled()) { res.status(404).json({ error: "Nie znaleziono." }); return; } next(); };
const userOf = (req: Request, res: Response): string | null => {
  const id = getAuth(req)?.userId;
  if (!id) { res.status(401).json({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }); return null; }
  return id;
};

router.get("/terms/status", (_req, res): void => { res.json({ enabled: termsEnabled(), version: CURRENT_TERMS_VERSION }); });

router.get("/terms/me", gate, async (req, res): Promise<void> => {
  const id = userOf(req, res); if (!id) return;
  res.json(await termsState(id));
});
router.post("/terms/accept", gate, async (req, res): Promise<void> => {
  const id = userOf(req, res); if (!id) return;
  const b = z.object({ version: z.string().min(1).max(40) }).safeParse(req.body);
  if (!b.success || !(await acceptTerms(id, b.data.version))) { res.status(409).json({ error: "Regulamin został zaktualizowany. Odśwież stronę i zaakceptuj aktualną wersję.", code: "STALE_VERSION" }); return; }
  res.json({ ok: true, version: CURRENT_TERMS_VERSION });
});

router.get("/me/export", gate, async (req, res): Promise<void> => {
  const id = userOf(req, res); if (!id) return;
  if ((await exportsLast24h(id)) >= EXPORT_LIMIT_PER_DAY) {
    res.status(429).json({ error: `Dane można pobrać ${EXPORT_LIMIT_PER_DAY} razy na dobę. Spróbuj jutro.`, code: "EXPORT_LIMIT" }); return;
  }
  const out = await buildExport(id);
  if (!out) { res.status(404).json({ error: "Nie znaleziono danych konta." }); return; }
  await logExport(id, out.role);
  logger.info({ role: out.role }, "Eksport danych użytkownika"); // bez identyfikatora i bez treści
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="optimatren-moje-dane.json"');
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify({ wygenerowano: new Date().toISOString(), wersjaRegulaminu: CURRENT_TERMS_VERSION, rola: out.role, dane: out.data }, null, 2));
});

export default router;
