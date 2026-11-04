/**
 * Maile przy wniosku o konto trenera: potwierdzenie przyjęcia i decyzja (do wnioskodawcy), nowy wniosek (do właściciela). Teksty i szablon:
 * services/mail (docs/MAILE.md). Każda wysyłka zostawia w logu serwera wynik (wysłano / nie wysłano i dlaczego); adresów ani haseł nie logujemy.
 */
import { sendCatalogueMail } from "./mail/send";

export const ownerAddress = (env: NodeJS.ProcessEnv = process.env) => env["OWNER_NOTIFY_EMAIL"]?.trim() || env["ADMIN_EMAIL"]?.trim() || null;

export const notifyOwnerNewApplication = (a: { name: string | null; email: string | null; note: string | null }) =>
  sendCatalogueMail("application_new", { to: ownerAddress(), data: { name: a.name, email: a.email, note: a.note } });

export const mailApplicationReceived = (to: string | null | undefined, name: string | null) =>
  sendCatalogueMail("application_received", { to, data: { name: firstName(name) } });

export const mailApplicationAccepted = (to: string | null | undefined, name: string | null = null) =>
  sendCatalogueMail("application_accepted", { to, data: { name: firstName(name) } });

export const mailApplicationRejected = (to: string | null | undefined, name: string | null = null) =>
  sendCatalogueMail("application_rejected", { to, data: { name: firstName(name) } });

/** Pierwsze imię z „Imię Nazwisko” (do zwrotu „Cześć, Anna,”); brak → null. */
export const firstName = (full: string | null | undefined) => full?.trim().split(/\s+/)[0] || null;
