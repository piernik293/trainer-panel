import { useSyncExternalStore } from "react";

/**
 * Flaga BRAND_V1_ENABLED (nowe logo w aplikacji i byczek), czytana z `/api/brand-v1/status`. Domyślnie (i przy każdym błędzie) WYŁĄCZONA — aplikacja wygląda
 * jak dotąd. Jedno zapytanie na kartę; wynik współdzielony przez wszystkie komponenty.
 */
let value = false;
let started = false;
const listeners = new Set<() => void>();
function start() {
  if (started || typeof fetch === "undefined") return;
  started = true;
  void fetch("/api/brand-v1/status", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { enabled?: boolean } | null) => { if (b?.enabled === true && !value) { value = true; listeners.forEach((l) => l()); } })
    .catch(() => {});
}
export function useBrandV1(): boolean {
  start();
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => value, () => false);
}
/** Tylko testy. */
export function setBrandV1ForTests(v: boolean): void { value = v; started = true; listeners.forEach((l) => l()); }
export function resetBrandV1ForTests(): void { value = false; started = false; listeners.clear(); }
