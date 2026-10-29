/** „Zgłoś uwagę” (blok 4) — wspólne stałe i czysta logika formularza w panelu. */
export const FEEDBACK_MAX = 1000;
export const FEEDBACK_KINDS = [
  { id: "blad", label: "Błąd" },
  { id: "pomysl", label: "Pomysł" },
  { id: "niejasne", label: "Niejasne" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

export function canSendFeedback(kind: FeedbackKind | null, text: string, busy: boolean): boolean {
  return !busy && kind !== null && text.trim().length > 0 && text.length <= FEEDBACK_MAX;
}
