/** Wnioski o konto trenera (blok 6): po odrzuceniu można złożyć kolejny wniosek dopiero po 14 dniach. Czysta logika bez bazy. */
export const REAPPLY_AFTER_DAYS = 14;
export const AUTO_ACCEPT_KEY = "trainer_auto_accept";

export function nextApplyAt(rejectedAt: Date): Date {
  return new Date(rejectedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000);
}

export function canApplyNow(lastRejectedAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !lastRejectedAt || nextApplyAt(lastRejectedAt).getTime() <= now.getTime();
}

export const REAPPLY_LATER_MESSAGE = (until: Date) =>
  `Poprzedni wniosek został odrzucony. Możesz złożyć nowy od ${until.toLocaleDateString("pl-PL")}.`;
