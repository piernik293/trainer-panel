/** Nick w portalu: opcjonalny, 3–20 znaków (litery bez polskich znaków, cyfry, _ .), filtr wulgaryzmów, nicki zarezerwowane i „prawie identyczne”. */
export const NICK_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const AVATAR_COLORS = ["#C2410C", "#0F766E", "#1D4ED8", "#7E22CE", "#BE123C", "#4D7C0F"] as const;
export const NICK_CHANGE_DAYS = 30;
export const NICK_HOLD_DAYS = 30;

// Prosta lista rdzeni; sprawdzamy po usunięciu _ . i zamianie cyfr podobnych do liter. To zabezpieczenie podstawowe, nie pełna moderacja.
const BAD = ["kurw", "chuj", "huj", "pierdol", "jeb", "pizd", "cwel", "szmat", "dziwk", "fuck", "shit", "bitch", "cunt", "nigg", "dupa", "dupek", "pedal", "spierd", "skurw", "kutas", "fiut"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

export function isBadNick(nick: string): boolean {
  const flat = nick.toLowerCase().replace(/[_.]/g, "").replace(/[0134577@$]/g, (c) => LEET[c] ?? c);
  return BAD.some((w) => flat.includes(w));
}

/**
 * Klucz nicka: małe litery, bez _ i ., bez cyfr na końcu (o ile zostaje ≥ 3 znaki), cyfry w środku jak litery (k0wal = kowal).
 * Dwa nicki o tym samym kluczu są „prawie identyczne” (np. ola, Ola_, o.l.a, ola1, ola22).
 */
export function nickKey(nick: string): string {
  let k = nick.toLowerCase().replace(/[_.]/g, "");
  const stripped = k.replace(/\d+$/, "");
  if (stripped.length >= 3) k = stripped;
  return k.replace(/[0134577]/g, (c) => LEET[c] ?? c);
}

/** Nicki zarezerwowane (po normalizacji kluczem: „admin”, „Admin_1”, „a.d.m.i.n” — wszystkie odpadają). */
const RESERVED = [
  "admin", "administrator", "administracja", "optimatren", "trener", "trenerzy", "support", "pomoc", "moderator", "mod", "root", "system",
  "owner", "wlasciciel", "staff", "team", "zespol", "kontakt", "help", "info", "bot", "official", "oficjalny", "byczek", "zlotybyczek", "goldenbull",
];
const RESERVED_PREFIX = ["optimatren", "administrator"];
export function isReservedNick(nick: string): boolean {
  const k = nickKey(nick);
  return RESERVED.includes(k) || RESERVED_PREFIX.some((p) => k.startsWith(p));
}

export type NickCheck = { ok: true; nick: string | null } | { ok: false; error: string; code: "NICK_INVALID" | "NICK_RESERVED" };
export function checkNick(raw: unknown): NickCheck {
  if (raw === null || raw === undefined || raw === "") return { ok: true, nick: null };
  if (typeof raw !== "string") return { ok: false, code: "NICK_INVALID", error: "Nick ma 3–20 znaków: litery, cyfry, _ lub kropka." };
  const nick = raw.trim().replace(/^@/, "");
  if (!NICK_RE.test(nick)) return { ok: false, code: "NICK_INVALID", error: "Nick ma 3–20 znaków: litery, cyfry, _ lub kropka." };
  if (isBadNick(nick)) return { ok: false, code: "NICK_INVALID", error: "Wybierz inny nick." };
  if (isReservedNick(nick)) return { ok: false, code: "NICK_RESERVED", error: "Ten nick jest zarezerwowany. Wybierz inny." };
  return { ok: true, nick };
}

/** Zmiana nicka: najwyżej raz na 30 dni. Pierwsze ustawienie (brak daty poprzedniej zmiany) jest wolne. Zwraca datę, od której można zmienić, albo null. */
export function nextNickChangeAt(changedAt: Date | null, now = new Date()): Date | null {
  if (!changedAt) return null;
  const at = new Date(changedAt.getTime() + NICK_CHANGE_DAYS * 86_400_000);
  return at.getTime() > now.getTime() ? at : null;
}
export const holdUntil = (now = new Date()) => new Date(now.getTime() + NICK_HOLD_DAYS * 86_400_000);
