/**
 * Manual add of an exercise loading a joint the client reported: the API answers 409
 * EXERCISE_LOADS_REPORTED_JOINT with the trainer-facing text. Returns that text, or null for any other error.
 */
export function jointWarningFromError(err: unknown): string | null {
  const data = (err as { data?: { code?: unknown; error?: unknown } } | null)?.data;
  if (data?.code !== "EXERCISE_LOADS_REPORTED_JOINT") return null;
  return typeof data.error === "string" && data.error ? data.error : "Klient zgłosił ból. To ćwiczenie obciąża zgłoszony staw. Dodać mimo to?";
}

/** Plan warning line: "To ćwiczenie obciąża zgłoszony staw: bark, łokieć". */
export function planJointWarningText(joints: readonly string[]): string {
  const list = joints.map((j) => j.toLowerCase()).join(", ");
  return list ? `To ćwiczenie obciąża zgłoszony staw: ${list}` : "To ćwiczenie obciąża zgłoszony staw";
}

/** Confirmation before the one-click swap. */
export function jointReplaceConfirmText(from: string, to: string, clientName: string | null | undefined): string {
  return `Zamienić ${from} na ${to} w planie ${clientName?.trim() || "klienta"}? Serie i powtórzenia zostaną.`;
}
