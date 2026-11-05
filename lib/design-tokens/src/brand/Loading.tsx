import { useEffect, useState, type ReactNode } from "react";
import { MascotEvent } from "./events";

/** Czasy ekranu ładowania: pokazuje się dopiero po 600 ms (żeby szybkie odpowiedzi nie migały), po 5 s dopisuje „Jeszcze chwila…”. */
export const LOADING_DELAY_MS = 600;
export const LOADING_SLOW_MS = 5000;

/** Hook: false przez pierwsze `delay` ms, potem true. */
export function useAfter(delay: number): boolean {
  const [on, setOn] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) { setOn(true); return; }
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

/** Wspólne ładowanie: byczek (stan „loading”), widoczny dopiero po 600 ms; po 5 s „Jeszcze chwila…”. Przed 600 ms nie renderuje niczego widocznego. */
export function Loading({ label = "Ładowanie", fullScreen = false, rozmiar = "m" }: { label?: string; fullScreen?: boolean; rozmiar?: "s" | "m" | "l" }) {
  const visible = useAfter(LOADING_DELAY_MS);
  const slow = useAfter(LOADING_SLOW_MS);
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="loading" data-visible={visible ? "1" : "0"}
      className={fullScreen ? "flex min-h-[60vh] flex-col items-center justify-center gap-2" : "flex flex-col items-center justify-center gap-2 py-8"}>
      <span className="sr-only">{label}</span>
      {visible && (
        <>
          <MascotEvent event="loading_long" rozmiar={rozmiar} />
          {slow && <p className="text-sm text-muted-foreground" data-testid="loading-slow">Jeszcze chwila…</p>}
        </>
      )}
    </div>
  );
}

/** Błąd aplikacji (byczek „error”) albo brak internetu (byczek „offline” z tekstem o zapisie po powrocie zasięgu) — osobne zdarzenia. */
export function ErrorState({ title = "Coś poszło nie tak", message, onRetry, retryLabel = "Spróbuj ponownie", offline }: { title?: string; message?: string; onRetry?: () => void; retryLabel?: string; /** wymuś brak sieci; domyślnie wykrywa navigator.onLine */ offline?: boolean }) {
  const off = offline ?? (typeof navigator !== "undefined" && navigator.onLine === false);
  return (
    <div role="alert" data-testid="error-state" data-offline={off ? "1" : "0"} className="flex flex-col items-center gap-2 py-8 text-center">
      <MascotEvent event={off ? "offline" : "app_error"} rozmiar="m" />
      {!off && <p className="text-lg font-bold">{title}</p>}
      {!off && message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground">{retryLabel}</button>}
    </div>
  );
}

/** Pusty stan (brak planu, brak podopiecznych, brak osiągnięć): byczek (idle) + krótki tekst + opcjonalna akcja. */
export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center gap-2 py-8 text-center">
      <MascotEvent event="empty_state" rozmiar="m" />
      <p className="text-lg font-bold">{title}</p>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action}
    </div>
  );
}
