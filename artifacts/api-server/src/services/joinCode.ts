/**
 * Kod trenera (blok 2): ten sam sekret co w linku do dołączenia, wpisywany ręcznie.
 * 10 znaków z alfabetu bez mylących znaków (bez 0/O, 1/I/L) = ~50 bitów; do tego limit prób (ochrona przed zgadywaniem).
 */
import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 znaków
export const JOIN_CODE_LENGTH = 10;

export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/** Wpisany ręcznie kod: wielkie litery, bez spacji i myślników; zwraca null, gdy nie ma kształtu kodu. */
export function normalizeJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

/** Limit prób na klucz (konto albo IP): okno stałe, w pamięci procesu. Nieudane i udane próby liczą się tak samo. */
export const JOIN_ATTEMPT_LIMIT = 10;
export const JOIN_ATTEMPT_WINDOW_MS = 15 * 60_000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function allowJoinAttempt(key: string, now: number = Date.now()): boolean {
  const cur = attempts.get(key);
  if (!cur || cur.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + JOIN_ATTEMPT_WINDOW_MS });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    return true;
  }
  cur.count += 1;
  return cur.count <= JOIN_ATTEMPT_LIMIT;
}

export function resetJoinAttempts(): void { attempts.clear(); }
