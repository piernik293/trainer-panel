/**
 * „Zgłoś uwagę” (blok 4) — krótkie uwagi z panelu trenera i portalu klienta. Za flagą FEEDBACK_ENABLED (domyślnie wyłączona).
 * Zapisujemy: treść (oczyszczoną jak w dzienniku błędów), kategorię, ścieżkę strony bez parametrów i wersję aplikacji.
 * Nie zapisujemy zrzutów ekranu, adresu e-mail ani identyfikatora konta (tylko skrót). Treść wyglądająca na dane zdrowotne jest odrzucana.
 */
import crypto from "node:crypto";
import { db, userFeedbackTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { HEALTH_HIDDEN_TEXT, normalizePlace, scrubMessage } from "./errorLog";
import { sendPlainEmail } from "./inviteEmail";

export const FEEDBACK_MAX_LENGTH = 1000;
export const FEEDBACK_CATEGORIES = ["blad", "pomysl", "niejasne"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<FeedbackCategory, string> = { blad: "Błąd", pomysl: "Pomysł", niejasne: "Niejasne" };

export const feedbackEnabled = (env: NodeJS.ProcessEnv = process.env) => env["FEEDBACK_ENABLED"] === "1";

export const appVersion = (env: NodeJS.ProcessEnv = process.env) => (env["APP_VERSION"] ?? env["npm_package_version"] ?? "dev").slice(0, 40);

export type CleanFeedback = { ok: true; text: string } | { ok: false; code: "EMPTY" | "HEALTH_CONTENT" };

/** Czysta funkcja: oczyszcza treść uwagi; puste albo wyglądające na dane zdrowotne — odrzuca. */
export function cleanFeedbackText(raw: unknown): CleanFeedback {
  const text = scrubMessage(raw, FEEDBACK_MAX_LENGTH);
  if (!text) return { ok: false, code: "EMPTY" };
  if (text === HEALTH_HIDDEN_TEXT) return { ok: false, code: "HEALTH_CONTENT" };
  return { ok: true, text };
}

const authorHash = (userKey: string) => crypto.createHash("sha256").update(`feedback-authors|${userKey}`).digest("hex").slice(0, 32);

export interface NewFeedback {
  source: "panel" | "portal";
  role: "trener" | "klient";
  category: FeedbackCategory;
  text: string;
  page: unknown;
  userKey: string;
}

export async function saveFeedback(input: NewFeedback): Promise<number> {
  const [row] = await db.insert(userFeedbackTable).values({
    source: input.source, authorRole: input.role, category: input.category, message: input.text,
    page: normalizePlace(input.page), appVersion: appVersion(), authorHash: authorHash(input.userKey),
  }).returning({ id: userFeedbackTable.id });
  return row!.id;
}

/** Mail do właściciela (jeśli poczta działa). Nigdy nie rzuca i nie blokuje odpowiedzi. */
export function notifyOwner(input: Pick<NewFeedback, "source" | "role" | "category" | "text"> & { page: string }): void {
  const to = process.env["OWNER_NOTIFY_EMAIL"] || process.env["ADMIN_EMAIL"];
  if (!to) return;
  void sendPlainEmail({
    to,
    subject: `Nowa uwaga: ${CATEGORY_LABEL[input.category]} (${input.source === "panel" ? "panel" : "portal"})`,
    text: `${CATEGORY_LABEL[input.category]} · ${input.role} · ${input.page}\n\n${input.text}\n\nWszystkie uwagi: panel administratora → Uwagi.`,
  }).catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, "feedback mail failed"));
}
