/** Nick w portalu: opcjonalny, 3–20 znaków (litery bez polskich znaków, cyfry, _ .), filtr wulgaryzmów. */
export const NICK_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const AVATAR_COLORS = ["#C2410C", "#0F766E", "#1D4ED8", "#7E22CE", "#BE123C", "#4D7C0F"] as const;

// Prosta lista rdzeni; sprawdzamy po usunięciu _ . i zamianie cyfr podobnych do liter. To zabezpieczenie podstawowe, nie pełna moderacja.
const BAD = ["kurw", "chuj", "huj", "pierdol", "jeb", "pizd", "cwel", "szmat", "dziwk", "fuck", "shit", "bitch", "cunt", "nigg", "dupa", "dupek", "pedal", "spierd", "skurw", "kutas", "fiut"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

export function isBadNick(nick: string): boolean {
  const flat = nick.toLowerCase().replace(/[_.]/g, "").replace(/[0134577@$]/g, (c) => LEET[c] ?? c);
  return BAD.some((w) => flat.includes(w));
}

export type NickCheck = { ok: true; nick: string | null } | { ok: false; error: string };
export function checkNick(raw: unknown): NickCheck {
  if (raw === null || raw === undefined || raw === "") return { ok: true, nick: null };
  if (typeof raw !== "string") return { ok: false, error: "Nick ma 3–20 znaków: litery, cyfry, _ lub kropka." };
  const nick = raw.trim().replace(/^@/, "");
  if (!NICK_RE.test(nick)) return { ok: false, error: "Nick ma 3–20 znaków: litery, cyfry, _ lub kropka." };
  if (isBadNick(nick)) return { ok: false, error: "Wybierz inny nick." };
  return { ok: true, nick };
}
