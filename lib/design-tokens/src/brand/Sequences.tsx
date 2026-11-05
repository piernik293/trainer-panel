import { useEffect, useState, type ReactNode } from "react";
import { MascotEvent, MASCOT_EVENTS } from "./events";
import { useBrandV1 } from "./useBrandV1";

/** Z flagą BRAND_V1_ENABLED pokazuje `children`, bez flagi `fallback` (dotychczasowy wygląd). */
export function IfBrand({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useBrandV1() ? children : fallback}</>;
}

/**
 * Układanie planu (trener i Solo): byczek myśli (plan_generating) → gdy plan gotowy, cieszy się (plan_ready). Zdarzenia z mapy `events.tsx`.
 */
export function PlanBuilding({ done = false, label = "Układamy Twój plan…" }: { done?: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="status" data-testid="plan-building" data-stan={done ? "success" : "thinking"}>
      <MascotEvent key={done ? "ready" : "gen"} event={done ? "plan_ready" : "plan_generating"} rozmiar="l" />
      {!done && <p className="font-semibold">{label}</p>}
    </div>
  );
}

const DAY_KEY = "optimatren-bull-login-day:v1";
/** Czy pokazać sekwencję logowania: raz dziennie (przy pierwszym wejściu danego dnia); zapis w localStorage (bez niego — przy każdym wejściu). */
export function shouldPlayLoginSequence(today: string, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try { if (storage?.getItem(DAY_KEY) === today) return false; storage?.setItem(DAY_KEY, today); } catch { /* bez pamięci — pokazuj */ }
  return true;
}
const FIRST_KEY = "optimatren-first-login:v1";
/** Pierwsze wejście w ogóle (po rejestracji)? Zapamiętuje, że już było. */
export function isFirstLogin(storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try { if (storage?.getItem(FIRST_KEY)) return false; storage?.setItem(FIRST_KEY, "1"); } catch { /* bez pamięci — bez powitania */ return false; }
  return true;
}

/** Krótka sekwencja po zalogowaniu: pierwsze wejście → first_login (wave → idle, ok. 2 s), potem login (walk, ok. 1,5 s); raz dziennie, pomijalna dotknięciem, tylko z flagą. */
export function LoginSequence({ today, onDone }: { today: string; onDone?: () => void }) {
  const on = useBrandV1();
  const [first] = useState(() => { try { return isFirstLogin(window.localStorage); } catch { return false; } });
  const [play] = useState(() => { try { return first || shouldPlayLoginSequence(today, window.localStorage); } catch { return true; } });
  const [done, setDone] = useState(false);
  const ev = first ? "first_login" : "login";
  const ms = (MASCOT_EVENTS[ev] as { ms: number }).ms;
  const active = on && play && !done;
  useEffect(() => {
    if (!active) { if (on && play) onDone?.(); return; }
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [active, ms, on, play]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  return (
    <button type="button" onClick={() => setDone(true)} aria-label="Pomiń animację" data-testid="login-sequence" data-event={ev}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background">
      <MascotEvent event={ev} rozmiar="l" />
    </button>
  );
}
