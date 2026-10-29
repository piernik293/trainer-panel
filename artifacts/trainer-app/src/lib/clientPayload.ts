/** Dane z formularza „Nowy klient” → treść żądania. Puste pola są pomijane (serwer odrzuca pusty e-mail). */
export function toCreateClientPayload<T extends { firstName: string; lastName: string; email?: string; phone?: string; notes?: string }>(data: T) {
  const trimmed = (v?: string) => v?.trim() || undefined;
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: trimmed(data.email),
    phone: trimmed(data.phone),
    notes: trimmed(data.notes),
  };
}
