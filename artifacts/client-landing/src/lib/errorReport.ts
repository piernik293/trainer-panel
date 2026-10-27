/**
 * Zgłaszanie błędów aplikacji do dziennika administratora (blok 3). Wysyłamy tylko krótki opis i ścieżkę ekranu —
 * bez treści formularzy, bez danych użytkownika; serwer dodatkowo oczyszcza tekst. Limit: kilka zgłoszeń na sesję.
 */
let sent = 0;
const MAX_PER_SESSION = 10;

export function reportClientError(message: unknown, place: string = window.location.pathname): void {
  if (sent >= MAX_PER_SESSION) return;
  sent += 1;
  const text = message instanceof Error ? `${message.name}: ${message.message}` : String(message ?? "");
  try {
    void fetch("/api/client-errors", {
      method: "POST", credentials: "include", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "portal", place: place.slice(0, 300), message: text.slice(0, 2000) }),
    }).catch(() => undefined);
  } catch { /* zgłaszanie błędów nigdy nie psuje aplikacji */ }
}

export function installErrorReporting(): void {
  window.addEventListener("error", (e) => reportClientError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason));
}
