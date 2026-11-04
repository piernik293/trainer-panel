/**
 * Adresy e-mail dla maili systemowych. Dwie zasady:
 *  1) nigdy nie wysyłamy na adresy zastępcze (domeny .invalid, .example, .test, .localhost, .local) — to nie są prawdziwe skrzynki,
 *     a odbicia wracają do właściciela (profil „Mój trening” ma adres zastępczy);
 *  2) mail do osoby z kontem idzie na główny e-mail konta z Clerk, nie na adres z rekordu klienta/profilu.
 */
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";

const BLOCKED_TLDS = new Set(["invalid", "example", "test", "localhost", "local"]);

export function isPlaceholderAddress(addr: string | null | undefined): boolean {
  const a = (addr ?? "").trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1 || at === a.length - 1) return true; // brak/niepoprawny adres traktujemy jak zastępczy
  const domain = a.slice(at + 1);
  return BLOCKED_TLDS.has(domain.split(".").pop() ?? "");
}

/** Prawdziwy adres albo null (bez adresu w logu — tylko powód). */
export function realAddressOrNull(addr: string | null | undefined): string | null {
  return addr && !isPlaceholderAddress(addr) ? addr.trim() : null;
}

/** Główny e-mail konta z Clerk; gdy niedostępny lub zastępczy — `fallback` (jeśli prawdziwy), inaczej null. */
export async function accountEmail(clerkUserId: string | null | undefined, fallback?: string | null): Promise<string | null> {
  if (clerkUserId) {
    try {
      const u = await clerkClient.users.getUser(clerkUserId);
      const primary = u.primaryEmailAddress?.emailAddress ?? null;
      if (primary && !isPlaceholderAddress(primary)) return primary;
    } catch { /* bez danych z konta — spróbujemy adresu zapasowego */ }
  }
  return realAddressOrNull(fallback);
}

export function warnBlocked(kind: string): void {
  logger.warn({ kind }, "Mail NIE wysłany: adres zastępczy lub nieprawidłowy (blokada)");
}
