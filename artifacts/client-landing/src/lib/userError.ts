/**
 * User-facing error mapping — turns any thrown error into a safe Polish
 * message. Never surfaces HTTP codes, "Failed to fetch", stack traces or
 * endpoint paths; technical details stay in the developer console.
 */

export const GENERIC_ERROR_MESSAGE =
  "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę.";
export const NETWORK_ERROR_MESSAGE =
  "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.";
export const SESSION_EXPIRED_MESSAGE = "Twoja sesja wygasła. Zaloguj się ponownie.";
export const FORBIDDEN_MESSAGE = "Nie masz dostępu do tego widoku.";
export const NOT_FOUND_MESSAGE =
  "Nie znaleziono potrzebnych danych. Mogły zostać usunięte lub zmienione.";
export const SAVE_WORKOUT_ERROR_MESSAGE =
  "Nie udało się zapisać treningu. Wprowadzone dane pozostają na ekranie — spróbuj ponownie.";
export const PLAN_LOAD_ERROR_MESSAGE = "Nie udało się pobrać planu treningowego. Spróbuj ponownie.";

export function statusMessage(status: number): string {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status >= 500) return GENERIC_ERROR_MESSAGE;
  return "Nie udało się wykonać tej operacji. Spróbuj ponownie.";
}

function looksTechnical(message: string): boolean {
  return (
    /HTTP \d{3}/i.test(message) ||
    /failed to fetch|networkerror|load failed/i.test(message) ||
    /unexpected token|json/i.test(message) ||
    /^\s*at /m.test(message) ||
    /^\//.test(message)
  );
}

/** Turn any error into a message safe to display. */
export function humanizeError(err: unknown, fallback?: string): string {
  if (err instanceof TypeError || (err instanceof Error && /failed to fetch|load failed/i.test(err.message))) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (typeof status === "number" && status >= 500) return fallback ?? GENERIC_ERROR_MESSAGE;
    if (err.message && !looksTechnical(err.message)) return err.message;
    if (typeof status === "number") return fallback ?? statusMessage(status);
  }
  return fallback ?? GENERIC_ERROR_MESSAGE;
}
