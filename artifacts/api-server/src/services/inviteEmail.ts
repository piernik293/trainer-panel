/**
 * Survey-invite e-mail (Polish). The link is built from APP_PUBLIC_URL — never
 * from request headers (Host / X-Forwarded-* can be spoofed into phishing links).
 * Without SMTP_* the send is refused with a readable code, never silently.
 */

import { logger } from "../lib/logger";

export const DEFAULT_APP_PUBLIC_URL = "http://localhost:23889";
export const INVITE_VALID_DAYS = 7;
/** Shown in the e-mail; adjust if the interview length changes. */
export const SURVEY_DURATION_TEXT = "Wypełnienie zajmuje zwykle kilka minut.";

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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Trainer-supplied display name: trimmed, no control chars, max 80 chars. */
export function cleanTrainerName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || null;
}

export function renderInviteEmail(opts: { trainerName: string | null; url: string; expiresAt: Date }) {
  const who = opts.trainerName ?? "Twój trener";
  const expiry = opts.expiresAt.toLocaleDateString("pl-PL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw",
  });
  const url = escapeHtml(opts.url);
  const subject = `${who} zaprasza Cię do wywiadu treningowego`;
  const text = [
    `${who} zaprasza Cię do wypełnienia wywiadu treningowego.`,
    "",
    "Wywiad to krótki formularz o Twoim celu, doświadczeniu, zdrowiu i sprzęcie. Na jego podstawie trener przygotuje plan dopasowany do Ciebie.",
    SURVEY_DURATION_TEXT,
    "",
    `Wypełnij wywiad: ${opts.url}`,
    "",
    `Link jest jednorazowy i ważny ${INVITE_VALID_DAYS} dni (do ${expiry}).`,
    "Jeśli link nie działa, poproś trenera o nowy.",
  ].join("\n");
  const html = `
    <p><strong>${escapeHtml(who)}</strong> zaprasza Cię do wypełnienia wywiadu treningowego.</p>
    <p>Wywiad to krótki formularz o Twoim celu, doświadczeniu, zdrowiu i sprzęcie.
    Na jego podstawie trener przygotuje plan dopasowany do Ciebie. ${escapeHtml(SURVEY_DURATION_TEXT)}</p>
    <p><a href="${url}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Wypełnij wywiad</a></p>
    <p>Link jest jednorazowy i ważny ${INVITE_VALID_DAYS} dni (do ${escapeHtml(expiry)}).<br>
    Jeśli link nie działa, poproś trenera o nowy.</p>`;
  return { subject, text, html };
}

export async function sendInviteEmail(opts: {
  to: string;
  trainerName: string | null;
  url: string;
  expiresAt: Date;
}): Promise<InviteEmailResult> {
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
    await transporter.sendMail({ from: process.env["SMTP_FROM"] || user, to: opts.to, subject, text, html });
    return { sent: true };
  } catch (err) {
    // Details stay in the server log (never the password); the UI gets a neutral message.
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to send survey invite email");
    return { sent: false, code: "SEND_FAILED", message: SEND_FAILED_MESSAGE };
  }
}
