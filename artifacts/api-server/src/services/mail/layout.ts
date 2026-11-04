/**
 * Jeden szablon wszystkich maili Optimatren (styl B): logo „Optimatren” (tekst, bez zdalnych obrazków), akcent #C2410C, Manrope z fallbackiem,
 * jasne tło, max 600 px, tabele i style w liniach (Gmail, Outlook, telefon), wersja tekstowa obok. Zwraca się po imieniu (bez form zależnych od płci),
 * jeden przycisk akcji, stopka: kto wysłał, dlaczego dostajesz ten mail, kontakt (CONTACT_EMAIL, jeśli ustawiony) i polityka prywatności.
 * W treści NIE ma danych zdrowotnych (ból, wywiad) — tylko „masz nowe zgłoszenie, zobacz w aplikacji”.
 */
export const MAIL_ACCENT = "#C2410C";

export interface MailContent {
  /** imię odbiorcy; brak → „Cześć,” */
  name: string | null;
  subject: string;
  /** 3–5 krótkich zdań (akapity); tekst zwykły — zostanie zabezpieczony przed HTML */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** „dlaczego dostajesz ten mail”, np. „złożyłeś wniosek o konto trenera” — bez form zależnych od płci */
  reason: string;
  /** wiadomość w imieniu trenera: „Imię Nazwisko przez Optimatren” */
  onBehalfOf?: string | null;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const appUrl = () => ((process.env["APP_PUBLIC_URL"] ?? "").trim() || "http://localhost:23889").replace(/\/+$/, "");
export const privacyUrl = () => `${appUrl()}/client-landing/legal/polityka-prywatnosci`;
const contactAddress = () => { const v = (process.env["CONTACT_EMAIL"] ?? "").trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null; };

export const greeting = (name: string | null) => (name?.trim() ? `Cześć, ${name.trim()},` : "Cześć,");

export function renderMail(c: MailContent): { subject: string; html: string; text: string } {
  const hello = greeting(c.name);
  const contact = contactAddress();
  const sender = c.onBehalfOf ? `${c.onBehalfOf} przez Optimatren` : "Optimatren";
  const footerText = [`Wysyła: ${sender}.`, `Dostajesz tę wiadomość, bo ${c.reason}.`, contact ? `Kontakt: ${contact}` : null, `Polityka prywatności: ${privacyUrl()}`].filter(Boolean).join("\n");
  const text = [hello, "", ...c.paragraphs.flatMap((p) => [p, ""]), ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []), "—", footerText].join("\n");

  const font = "Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF8F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #ECE7E2;border-radius:16px;">
<tr><td style="padding:24px 28px 8px 28px;font-family:${font};"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:9px;background:${MAIL_ACCENT};color:#FFFFFF;font-weight:800;font-size:17px;">O</span><span style="font-size:18px;font-weight:800;color:#1C1917;vertical-align:middle;margin-left:10px;">Optimatren</span></td></tr>
<tr><td style="padding:12px 28px 4px 28px;font-family:${font};color:#1C1917;font-size:16px;line-height:1.55;">
<p style="margin:0 0 14px 0;font-weight:700;">${esc(hello)}</p>
${c.paragraphs.map((p) => `<p style="margin:0 0 14px 0;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
</td></tr>
${c.button ? `<tr><td style="padding:6px 28px 22px 28px;font-family:${font};"><a href="${esc(c.button.url)}" style="display:inline-block;background:${MAIL_ACCENT};color:#FFFFFF;text-decoration:none;font-weight:800;font-size:16px;padding:14px 26px;border-radius:12px;">${esc(c.button.label)}</a><p style="margin:12px 0 0 0;font-size:12px;color:#57534E;">Jeśli przycisk nie działa, skopiuj adres: ${esc(c.button.url)}</p></td></tr>` : ""}
<tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #ECE7E2;font-family:${font};font-size:12px;line-height:1.5;color:#57534E;">
Wysyła: ${esc(sender)}.<br>Dostajesz tę wiadomość, bo ${esc(c.reason)}.${contact ? `<br>Kontakt: <a href="mailto:${esc(contact)}" style="color:${MAIL_ACCENT};">${esc(contact)}</a>` : ""}<br><a href="${esc(privacyUrl())}" style="color:${MAIL_ACCENT};">Polityka prywatności</a>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject, html, text };
}
