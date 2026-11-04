/** Wysyłka maili z katalogu (services/mail/catalogue.ts): jeden szablon, blokada adresów zastępczych (w sendPlainEmail), opcjonalnie bez powtórek. */
import { db, mailLogTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendPlainEmail } from "../inviteEmail";
import { buildMail, MAIL_CATALOGUE, type MailData, type MailId } from "./catalogue";
import { realAddressOrNull } from "../mailAddress";

export interface SendOpts {
  to: string | null | undefined;
  data: MailData;
  /** mail w imieniu trenera: nadawca „Imię Nazwisko przez Optimatren”, Reply-To = e-mail trenera */
  onBehalfOf?: { name: string | null; email: string | null };
  /** automatyczne maile: ten sam (rodzaj, odniesienie) nie wychodzi drugi raz */
  once?: { kind: string; ref: string };
}

/** true = wysłano. Nigdy nie rzuca (maile nie mogą psuć działania aplikacji); powód niewysłania trafia do logu serwera (bez adresów). */
export async function sendCatalogueMail(id: MailId, o: SendOpts): Promise<boolean> {
  try {
    if (!o.to) { logger.warn({ mail: id }, "Mail nie wysłany: brak adresu odbiorcy"); return false; }
    if (o.once) {
      const [row] = await db.insert(mailLogTable).values({ kind: o.once.kind, ref: o.once.ref }).onConflictDoNothing().returning({ id: mailLogTable.id });
      if (!row) return false; // już wysłany
    }
    const m = buildMail(id, { ...o.data, trainerName: o.onBehalfOf?.name ?? o.data.trainerName ?? null });
    const ok = await sendPlainEmail({ to: o.to, subject: m.subject, text: m.text, html: m.html, fromName: o.onBehalfOf?.name ?? null, replyTo: realAddressOrNull(o.onBehalfOf?.email) });
    if (ok) logger.info({ mail: id }, "Mail wysłany"); else logger.warn({ mail: id }, "Mail NIE wysłany (brak SMTP, adres zastępczy albo błąd wysyłki)");
    return ok;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), mail: id }, "Mail: nieoczekiwany błąd wysyłki");
    return false;
  }
}

export const mailLabel = (id: MailId) => MAIL_CATALOGUE[id].label;
