/**
 * Dziennik błędów aplikacji (blok 3) — własna prosta tabela, bez płatnych usług.
 * Do bazy trafia wyłącznie oczyszczony, krótki opis: bez adresów e-mail, tokenów, haseł, długich liczb i treści zdrowotnych.
 * Treści żądań nigdy nie są zapisywane. Retencja: 90 dni.
 */
import crypto from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, appErrorsTable, appErrorUsersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { maskSecretsInPath } from "../lib/maskUrl";

export const ERROR_RETENTION_DAYS = 90;
const MAX_MESSAGE = 300;
const MAX_PLACE = 120;

const HEALTH_WORDS = /\b(ból|bol|bóle|kontuzj\w*|chor\w*|zdrow\w*|lek\w*|leki|ciąż\w*|operacj\w*|uraz\w*|diagnoz\w*|schorzen\w*|alergi\w*|cukrzyc\w*|ciśnien\w*)\b/i;

/** Czysta funkcja: usuwa z tekstu wszystko, co mogłoby być sekretem lub daną osobową. */
export function scrubMessage(raw: unknown): string {
  let s = typeof raw === "string" ? raw : raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw ?? "");
  s = maskSecretsInPath(s.replace(/\s+/g, " ").trim());
  if (HEALTH_WORDS.test(s)) return "[treść ukryta — mogła zawierać dane zdrowotne]";
  s = s
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [ukryte]")
    .replace(/\b(authorization|password|passwd|haslo|hasło|token|secret|api[_-]?key|apikey|key|cookie|session)\b\s*[:=]\s*\S+/gi, "$1=[ukryte]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]+/g, "[klucz]")
    .replace(/https?:\/\/[^\s"')]+/g, (u) => u.split(/[?#]/)[0] ?? u) // adresy bez parametrów
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[liczba]");
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE)}…` : s;
}

/** Miejsce błędu: ścieżka bez parametrów, identyfikatory zamienione na :id. */
export function normalizePlace(raw: unknown): string {
  const s = maskSecretsInPath(String(raw ?? "").split(/[?#]/)[0] ?? "");
  const out = s
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id")
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/[^\x20-\x7EĄ-ż]/g, "");
  return out.slice(0, MAX_PLACE) || "(nieznane)";
}

const fingerprintOf = (source: string, place: string, message: string) =>
  crypto.createHash("sha256").update(`${source}|${place}|${message.slice(0, 120)}`).digest("hex");

const userHash = (userKey: string) =>
  crypto.createHash("sha256").update(`err-users|${userKey}`).digest("hex").slice(0, 32);

let lastPurge = 0;
export async function purgeOldErrors(now: number = Date.now()): Promise<void> {
  if (now - lastPurge < 3_600_000) return;
  lastPurge = now;
  const cutoff = new Date(now - ERROR_RETENTION_DAYS * 86_400_000);
  await db.delete(appErrorsTable).where(lt(appErrorsTable.lastSeen, cutoff));
}

export type ErrorSource = "api" | "panel" | "portal";

/** Zapis błędu; nigdy nie rzuca (dziennik nie może sam psuć aplikacji). */
export async function recordError(input: { source: ErrorSource; place: unknown; message: unknown; userKey?: string | null }): Promise<void> {
  try {
    const place = normalizePlace(input.place);
    const message = scrubMessage(input.message);
    const fp = fingerprintOf(input.source, place, message);
    const [row] = await db.insert(appErrorsTable).values({ fingerprint: fp, source: input.source, place, message })
      .onConflictDoUpdate({
        target: appErrorsTable.fingerprint,
        set: { occurrences: sql`${appErrorsTable.occurrences} + 1`, lastSeen: new Date(), status: "new" },
      }).returning({ id: appErrorsTable.id });
    if (row && input.userKey) {
      await db.insert(appErrorUsersTable).values({ errorId: row.id, userHash: userHash(input.userKey) }).onConflictDoNothing();
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(appErrorUsersTable).where(eq(appErrorUsersTable.errorId, row.id));
      await db.update(appErrorsTable).set({ usersCount: c?.n ?? 0 }).where(and(eq(appErrorsTable.id, row.id)));
    }
    await purgeOldErrors();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "recordError failed");
  }
}
