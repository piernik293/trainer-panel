/**
 * Panel administratora → „Maile”: podgląd każdego szablonu (z danymi przykładowymi) i „Wyślij test do mnie” (na OWNER_NOTIFY_EMAIL).
 *  GET  /admin/mails                 lista maili (nazwa, do kogo, kiedy wychodzi)
 *  GET  /admin/mails/:id/preview     { subject, html, text }
 *  POST /admin/mails/:id/test        wysyła przykładowy mail na adres właściciela
 * Tylko administrator (APP_ADMIN_CLERK_IDS). Podglądy nie zawierają prawdziwych danych — tylko przykłady z katalogu.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";
import { MAIL_CATALOGUE, MAIL_IDS, buildMail, type MailId } from "../services/mail/catalogue";
import { sendCatalogueMail } from "../services/mail/send";
import { ownerAddress } from "../services/applicationMail";

const router: IRouter = Router();
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!checkIsAppAdmin(req.clerkUserId)) { res.status(403).json({ error: "Nie masz dostępu do tego widoku." }); return; }
  next();
};
const admin = [requireAuth, requireAdmin];
const idOf = (v: unknown): MailId | null => (typeof v === "string" && (MAIL_IDS as string[]).includes(v) ? (v as MailId) : null);

router.get("/admin/mails", ...admin, (_req, res): void => {
  res.json({ ownerAddressSet: !!ownerAddress(), mails: MAIL_IDS.map((id) => { const m = MAIL_CATALOGUE[id]; return { id, label: m.label, audience: m.audience, when: m.when }; }) });
});

router.get("/admin/mails/:id/preview", ...admin, (req, res): void => {
  const id = idOf(req.params["id"]);
  if (!id) { res.status(404).json({ error: "Nie ma takiego maila." }); return; }
  res.json(buildMail(id, MAIL_CATALOGUE[id].sample));
});

router.post("/admin/mails/:id/test", ...admin, async (req, res): Promise<void> => {
  const id = idOf(req.params["id"]);
  if (!id) { res.status(404).json({ error: "Nie ma takiego maila." }); return; }
  const to = ownerAddress();
  if (!to) { res.status(400).json({ error: "Brak adresu właściciela (OWNER_NOTIFY_EMAIL w .env).", code: "NO_OWNER_ADDRESS" }); return; }
  const ok = await sendCatalogueMail(id, { to, data: MAIL_CATALOGUE[id].sample });
  if (!ok) { res.status(502).json({ error: "Nie udało się wysłać testu (brak ustawień SMTP, adres zastępczy albo błąd poczty — szczegóły w logu serwera).", code: "SEND_FAILED" }); return; }
  res.json({ ok: true });
});

export default router;
