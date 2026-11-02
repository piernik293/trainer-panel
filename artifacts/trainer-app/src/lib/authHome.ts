/** Jedno logowanie: dokąd kieruje osoba po zalogowaniu (decyzja serwera, GET /api/account/home). */
export const AUTH_REDIRECT_PATH = "/auth/redirect";
export const PORTAL_HOME_PATH = "/client-landing/plan";

export interface AccountHome { destination: "panel" | "portal" | "blocked"; isTrainer: boolean; isClient: boolean; linked?: boolean }

/** Adres docelowy (pełne przejście strony, bo portal to osobna aplikacja); `null` = zostań i pokaż komunikat. */
export function homeTargetUrl(h: Pick<AccountHome, "destination">, basePath = ""): string | null {
  if (h.destination === "portal") return PORTAL_HOME_PATH;
  if (h.destination === "panel") return basePath || "/";
  return null;
}
