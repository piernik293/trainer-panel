/**
 * Manual add of an exercise loading a joint the client reported: the API answers 409
 * EXERCISE_LOADS_REPORTED_JOINT with the trainer-facing text. Returns that text, or null for any other error.
 */
export function jointWarningFromError(err: unknown): string | null {
  const data = (err as { data?: { code?: unknown; error?: unknown } } | null)?.data;
  if (data?.code !== "EXERCISE_LOADS_REPORTED_JOINT") return null;
  return typeof data.error === "string" && data.error ? data.error : "Klient zgłosił ból. To ćwiczenie obciąża zgłoszony staw. Dodać mimo to?";
}
