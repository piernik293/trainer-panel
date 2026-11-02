/**
 * Maile przy wniosku o konto trenera: do właściciela (nowy wniosek) i do wnioskodawcy (decyzja). Każda wysyłka zostawia w logu serwera wynik
 * (wysłano / nie wysłano i dlaczego), żeby brak maila dało się zdiagnozować. Adresów ani haseł nie logujemy.
 */
import { logger } from "../lib/logger";
import { sendPlainEmail } from "./inviteEmail";

export const ownerAddress = (env: NodeJS.ProcessEnv = process.env) => env["OWNER_NOTIFY_EMAIL"]?.trim() || env["ADMIN_EMAIL"]?.trim() || null;

async function send(kind: string, to: string | null | undefined, subject: string, text: string): Promise<boolean> {
  if (!to) { logger.warn({ kind }, "Mail nie wysłany: brak adresu odbiorcy"); return false; }
  const ok = await sendPlainEmail({ to, subject, text });
  if (ok) logger.info({ kind }, "Mail wysłany"); else logger.warn({ kind }, "Mail NIE wysłany (brak SMTP albo błąd wysyłki — szczegóły w poprzedniej linii)");
  return ok;
}

export const notifyOwnerNewApplication = (a: { name: string | null; email: string | null; note: string | null }) =>
  send("application-owner", ownerAddress(), "Nowy wniosek o konto trenera",
    `Nowy wniosek o konto trenera.\nOsoba: ${a.name ?? "(bez imienia)"}${a.email ? ` · ${a.email}` : ""}\n${a.note ? `Notatka: ${a.note}\n` : ""}\nRozpatrz go w panelu administratora (zakładka „Wnioski”).`);

export const mailApplicationAccepted = (to: string | null | undefined) =>
  send("application-accepted", to, "Twoje konto trenera jest aktywne", "Twoje konto trenera jest aktywne — zaloguj się tym samym kontem, a panel trenera będzie dostępny.");

export const mailApplicationRejected = (to: string | null | undefined) =>
  send("application-rejected", to, "Wniosek o konto trenera", "Twój wniosek o konto trenera nie został przyjęty. Możesz złożyć nowy za 14 dni.");
