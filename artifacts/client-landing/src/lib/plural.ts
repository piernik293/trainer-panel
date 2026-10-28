/** Polska liczba mnoga: 1 → one, 2–4 (poza 12–14) → few, reszta → many. */
export function pluralPl(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.trunc(n));
  if (a === 1) return one;
  const last = a % 10, last2 = a % 100;
  return last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14) ? few : many;
}
