import { useEffect, useState } from "react";
import { IfBrand, MascotEvent } from "@workspace/design-tokens/brand";

/** Czy telefon jest teraz bez internetu (navigator.onLine + zdarzenia online/offline). */
export function useOnline(): boolean {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

/** Brak internetu (osobno od błędu aplikacji): byczek „offline” i spokojny tekst; znika, gdy wróci zasięg. Tylko z flagą marki. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <IfBrand fallback={null}>
      <div role="status" data-testid="offline-banner" className="mb-3 flex items-center justify-center rounded-2xl border border-border bg-card px-4 py-2">
        <MascotEvent event="offline" rozmiar="s" className="!flex-row !gap-3 !text-left" />
      </div>
    </IfBrand>
  );
}
