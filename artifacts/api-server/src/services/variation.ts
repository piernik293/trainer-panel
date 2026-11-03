/**
 * Zmienność planów: dwa identyczne profile na różnych kontach dostają różne plany. Losowość jest TYLKO wyborem wśród
 * równorzędnych kandydatów, którzy przeszli wszystkie filtry bezpieczeństwa; ziarno zależy od konta i numeru planu,
 * więc w testach wynik jest powtarzalny.
 */
export function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return h >>> 0;
}
/** Ziarno: konto (np. id klienta), numer planu tego konta, opcjonalnie numer dnia. */
export const variationSeed = (account: string, planNo: number, dayIndex = 0) => hash32(`${account}|${planNo}|${dayIndex}`);
/** Indeks 0..n-1 zależny od ziarna i klucza (np. nazwa miejsca w planie). */
export const seededIndex = (seed: number, key: string, n: number) => (n <= 1 ? 0 : hash32(`${seed}|${key}`) % n);
