/** Wysyłka dostępu do aplikacji klientowi po aktywacji planu (B5): treść wiadomości i link `mailto:` — bez wysyłki z serwera. */
export function portalInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/client-landing/invite/${token}`;
}

export function portalMailto(email: string | null | undefined, firstName: string, url: string): string | null {
  if (!email) return null;
  const subject = "Twój plan treningowy jest gotowy";
  const body = `Cześć ${firstName},\n\nTwój plan treningowy jest gotowy. Aby zobaczyć go w aplikacji, otwórz ten link i załóż konto:\n${url}\n\nLink jest jednorazowy.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
