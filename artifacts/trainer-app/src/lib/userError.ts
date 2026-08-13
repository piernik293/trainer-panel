/**
 * User-facing error mapping — one place that turns any thrown error into a
 * safe Polish message. Never surfaces HTTP codes, "Failed to fetch", stack
 * traces or endpoint paths; technical details stay in the developer console.
 */

export interface UserFacingError extends Error {
  status?: number;
  data?: unknown;
}

export const GENERIC_ERROR_MESSAGE =
  "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę.";
export const NETWORK_ERROR_MESSAGE =
  "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.";
export const SESSION_EXPIRED_MESSAGE = "Twoja sesja wygasła. Zaloguj się ponownie.";
export const FORBIDDEN_MESSAGE = "Nie masz dostępu do tego widoku.";
export const NOT_FOUND_MESSAGE =
  "Nie znaleziono potrzebnych danych. Mogły zostać usunięte lub zmienione.";
export const VALIDATION_MESSAGE = "Uzupełnij lub popraw zaznaczone pola.";

/** Heuristic: does a message look technical (should never be shown)? */
function looksTechnical(message: string): boolean {
  return (
    /HTTP \d{3}/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /networkerror|load failed/i.test(message) ||
    /^\s*at /m.test(message) ||
    /\b(select|insert|update|delete)\b.*\bfrom\b/i.test(message) ||
    /unexpected token|json/i.test(message) ||
    /^\//.test(message)
  );
}

export function statusMessage(status: number): string {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status >= 500) return GENERIC_ERROR_MESSAGE;
  return "Nie udało się wykonać tej operacji. Spróbuj ponownie.";
}

/**
 * Turn any error into a message safe to display.
 * `fallback` lets callers give operation context (e.g. workout-save message).
 */
export function humanizeError(err: unknown, fallback?: string): string {
  if (err instanceof TypeError || (err instanceof Error && /failed to fetch|load failed/i.test(err.message))) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (err instanceof Error) {
    const status = (err as UserFacingError).status;
    if (typeof status === "number" && status >= 500) return fallback ?? GENERIC_ERROR_MESSAGE;
    if (err.message && !looksTechnical(err.message)) return err.message;
    if (typeof status === "number") return fallback ?? statusMessage(status);
  }
  return fallback ?? GENERIC_ERROR_MESSAGE;
}
