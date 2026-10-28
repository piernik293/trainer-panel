/** "Imię Nazwisko" without stray spaces when the surname is empty (people accepted from a join request have no surname). */
export const clientFullName = (c: { firstName?: string | null; lastName?: string | null }): string =>
  [c.firstName, c.lastName].map((x) => x?.trim()).filter(Boolean).join(" ");
