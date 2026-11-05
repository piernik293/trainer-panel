/** Podpowiedź „Dodaj do ekranu głównego”: tylko w przeglądarce telefonu (nie w zainstalowanej aplikacji), do zamknięcia, zapamiętywana. */
import { useState } from "react";

const KEY = "optimatren-a2hs-dismissed:v1";

export type HomeScreenPlatform = "ios" | "android" | null;

export function detectPlatform(ua: string, standalone: boolean): HomeScreenPlatform {
  if (standalone) return null;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

function isStandalone(): boolean {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}
function wasDismissed(): boolean { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } }

export function AddToHomeHint({ show }: { show: boolean }) {
  const [hidden, setHidden] = useState(wasDismissed);
  if (!show || hidden || typeof navigator === "undefined") return null;
  const platform = detectPlatform(navigator.userAgent, isStandalone());
  if (!platform) return null;
  const how = platform === "ios" ? "W Safari: „Udostępnij” → „Dodaj do ekranu początkowego”." : "W Chrome: menu ⋮ → „Dodaj do ekranu głównego”.";
  return (
    <section className="flex items-start gap-3 rounded-[20px] border border-border bg-card p-4" data-testid="a2hs-hint">
      <div className="min-w-0 flex-1">
        <p className="font-bold">Dodaj Optimatren do ekranu głównego</p>
        <p className="mt-1 text-sm text-muted-foreground">Otworzysz plan jednym dotknięciem, jak zwykłą aplikację. {how}</p>
      </div>
      <button type="button" onClick={() => { try { window.localStorage.setItem(KEY, "1"); } catch { /* bez pamięci: wróci przy następnym wejściu */ } setHidden(true); }}
        className="min-h-11 shrink-0 rounded-xl px-3 font-bold text-primary" data-testid="a2hs-dismiss">Rozumiem</button>
    </section>
  );
}
