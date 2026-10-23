/**
 * Theme preference shared by trainer-app and client-landing.
 * "system" (default) follows prefers-color-scheme; the choice is kept in
 * localStorage, wrapped in try/catch (private mode / blocked storage).
 */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "optimatren-theme";
export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Jasny" },
  { value: "dark", label: "Ciemny" },
  { value: "system", label: "Jak w systemie" },
];

export function readThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage unavailable — the choice lasts for this page only
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  return pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;
}

export function applyTheme(pref: ThemePreference = readThemePreference()): void {
  document.documentElement.classList.toggle("dark", resolveTheme(pref) === "dark");
}

/** Apply now and follow system changes while the preference is "system". Returns a cleanup. */
export function initTheme(): () => void {
  applyTheme();
  let mq: MediaQueryList | null = null;
  try {
    mq = window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (readThemePreference() === "system") applyTheme("system");
  };
  mq.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}

export function setThemePreference(pref: ThemePreference): void {
  writeThemePreference(pref);
  applyTheme(pref);
}
