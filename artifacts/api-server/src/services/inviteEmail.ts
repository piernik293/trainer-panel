/**
 * Survey-invite e-mails (Polish): invitation and reminder.
 * The link is built from APP_PUBLIC_URL — never from request headers (Host /
 * X-Forwarded-* can be spoofed into phishing links).
 * HTML is table-based with inline CSS (Gmail, Outlook, Apple Mail, dark mode),
 * one header banner embedded as a CID attachment (no remote images; the text never depends on it).
 * Without SMTP_* the send is refused with a
 * readable code, never silently.
 */

import { logger } from "../lib/logger";
import { EMAIL_BANNER_ALT, EMAIL_BANNER_BASE64, EMAIL_BANNER_CID } from "../assets/emailBanner";

export const DEFAULT_APP_PUBLIC_URL = "http://localhost:23889";
export const INVITE_VALID_DAYS = 7;
/** Shown in the e-mail; adjust if the interview length changes. */
export const SURVEY_DURATION_TEXT = "Wypełnienie zajmuje zwykle kilka minut.";
const ACCENT = "#C2410C";

export type InviteEmailResult =
  | { sent: true }
  | { sent: false; code: "SMTP_NOT_CONFIGURED" | "SEND_FAILED"; message: string };

export const SMTP_NOT_CONFIGURED_MESSAGE =
  "Wysyłka e-mailem nie jest skonfigurowana (brak ustawień SMTP na serwerze). Skopiuj link i wyślij go klientowi samodzielnie.";
export const SEND_FAILED_MESSAGE =
  "Nie udało się wysłać e-maila. Zaproszenie zostało utworzone — skopiuj link i wyślij go klientowi samodzielnie.";

export function appPublicUrl(): string {
  const raw = (process.env["APP_PUBLIC_URL"] ?? "").trim() || DEFAULT_APP_PUBLIC_URL;
  return raw.replace(/\/+$/, "");
}

export function buildPublicSurveyUrl(token: string): string {
  return `${appPublicUrl()}/client-landing/survey/${token}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Free text from the trainer: trimmed, no control chars (newlines kept when allowed), max length. */
export function cleanText(value: unknown, max: number, { multiline = false } = {}): string | null {
  if (typeof value !== "string") return null;
  const ctrl = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  let s = value.replace(ctrl, " ");
  s = multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  s = s.trim().slice(0, max);
  return s || null;
}

export function cleanTrainerName(name: unknown): string | null {
  return cleanText(name, 80);
}

export function initialsOf(name: string | null): string {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.map((p) => p[0] ?? "").join("").slice(0, 2) || "T").toUpperCase();
}

function formatExpiry(d: Date): string {
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });
}

export interface InviteEmailContent {
  trainerName: string | null;
  clientName: string | null;
  trainerMessage: string | null;
  url: string;
  expiresAt: Date;
  kind?: "invite" | "reminder";
}

export function renderInviteEmail(c: InviteEmailContent) {
  const kind = c.kind ?? "invite";
  const trainer = c.trainerName ?? "Twój trener";
  const firstName = c.trainerName?.split(/\s+/)[0] ?? "Twój trener";
  const hello = c.clientName ? `Cześć ${c.clientName},` : "Cześć,";
  const expiry = formatExpiry(c.expiresAt);
  const subject =
    kind === "invite"
      ? `${firstName} zaprasza Cię do wywiadu treningowego`
      : `Przypomnienie: wywiad treningowy od ${firstName}`;
  const lead =
    kind === "invite"
      ? `Zapraszam Cię do wypełnienia wywiadu treningowego. Na podstawie Twoich odpowiedzi przygotuję plan dopasowany do Ciebie. ${SURVEY_DURATION_TEXT}`
      : `Przypominam o wywiadzie treningowym — gdy go wypełnisz, przygotuję Twój plan. ${SURVEY_DURATION_TEXT}`;

  const text = [
    hello,
    "",
    ...(c.trainerMessage && kind === "invite" ? [c.trainerMessage, ""] : []),
    lead,
    "",
    `Wypełnij wywiad: ${c.url}`,
    "",
    `Link jest jednorazowy i ważny do ${expiry}.`,
    "",
    `${trainer} · Trener personalny`,
    "Wysłano przez Optimatren",
  ].join("\n");

  const url = escapeHtml(c.url);
  const message =
    c.trainerMessage && kind === "invite"
      ? `<tr><td style="padding:0 0 16px 0;"><div style="border-left:3px solid ${ACCENT};padding:4px 0 4px 12px;color:#1C1917;font-size:16px;line-height:24px;white-space:pre-line;">${escapeHtml(c.trainerMessage)}</div></td></tr>`
      : "";
  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAFAF9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF9;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:8px;font-family:Manrope,Segoe UI,Helvetica,Arial,sans-serif;">
<tr><td bgcolor="#1C1917" height="180" style="background:#1C1917;height:180px;line-height:0;font-size:0;border-radius:8px 8px 0 0;overflow:hidden;">
  <!-- Banner: the graphite cell behind keeps the layout when images are off; the text below never depends on it.
       Later the mascot goes here (replace the image, keep size 560 x 180, CID and alt). -->
  <img src="cid:${EMAIL_BANNER_CID}" width="560" height="180" alt="${escapeHtml(EMAIL_BANNER_ALT)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;color:#FFFFFF;font:700 16px/24px Arial,Helvetica,sans-serif;text-align:center;">
</td></tr>
<tr><td style="padding:24px 24px 8px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;border-radius:22px;background:#F0EFED;color:#1C1917;font-size:16px;font-weight:700;">${escapeHtml(initialsOf(c.trainerName))}</td>
    <td style="padding-left:12px;">
      <div style="color:#1C1917;font-size:16px;font-weight:700;line-height:20px;">${escapeHtml(trainer)}</div>
      <div style="color:#57534E;font-size:14px;line-height:20px;">Trener personalny</div>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 24px 0 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 0 12px 0;color:#1C1917;font-size:16px;line-height:24px;font-weight:700;">${escapeHtml(hello)}</td></tr>
    ${message}
    <tr><td style="padding:0 0 20px 0;color:#1C1917;font-size:16px;line-height:24px;">${escapeHtml(lead)}</td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;background:${ACCENT};">
          <a href="${url}" style="display:inline-block;padding:14px 28px;min-height:16px;line-height:16px;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">Wypełnij wywiad</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;color:#57534E;font-size:13px;line-height:20px;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br><a href="${url}" style="color:${ACCENT};word-break:break-all;">${url}</a></td></tr>
    <tr><td style="padding:0 0 24px 0;color:#57534E;font-size:14px;line-height:20px;">Link jest jednorazowy i ważny do ${escapeHtml(expiry)}.</td></tr>
  </table>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #E7E5E4;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="20" height="20" align="center" valign="middle" style="width:20px;height:20px;border-radius:4px;background:${ACCENT};color:#FFFFFF;font-size:12px;font-weight:800;line-height:20px;">O</td>
    <td style="padding-left:8px;color:#57534E;font-size:12px;line-height:20px;">Wysłano przez Optimatren</td>
  </tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/** "Anna Nowak · Optimatren" <smtp-address> — the display name says who invites. */
export function senderHeader(trainerName: string | null): string {
  const address = process.env["SMTP_FROM"] || process.env["SMTP_USER"] || "";
  const name = `${trainerName ?? "Twój trener"} · Optimatren`.replace(/["\\\r\n]/g, "");
  return `"${name}" <${address}>`;
}

export async function sendInviteEmail(
  opts: InviteEmailContent & { to: string; replyTo: string | null },
): Promise<InviteEmailResult> {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !user || !pass) {
    return { sent: false, code: "SMTP_NOT_CONFIGURED", message: SMTP_NOT_CONFIGURED_MESSAGE };
  }
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const { subject, text, html } = renderInviteEmail(opts);
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    });
    await transporter.sendMail({
      from: senderHeader(opts.trainerName),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      to: opts.to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: "optimatren-banner.jpg",
          content: Buffer.from(EMAIL_BANNER_BASE64, "base64"),
          contentType: "image/jpeg",
          contentDisposition: "inline",
          cid: EMAIL_BANNER_CID,
        },
      ],
    });
    return { sent: true };
  } catch (err) {
    // Details stay in the server log (never the password); the UI gets a neutral message.
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to send survey invite email");
    return { sent: false, code: "SEND_FAILED", message: SEND_FAILED_MESSAGE };
  }
}

/** Krótki mail tekstowy do jednej osoby (np. odłączenie od trenera). Ten sam SMTP co zaproszenia; bez SMTP — cichy brak wysyłki. */
export async function sendPlainEmail(opts: { to: string | null | undefined; subject: string; text: string; fromName?: string | null }): Promise<boolean> {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!opts.to || !host || !user || !pass) return false;
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({ from: senderHeader(opts.fromName ?? null), to: opts.to, subject: opts.subject, text: opts.text });
    return true;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to send notification email");
    return false;
  }
}
