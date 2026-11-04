import { useEffect, useState, type ReactNode } from "react";
import { Maskotka } from "./Maskotka";
import { useBrandV1 } from "./useBrandV1";

/** Z flagą BRAND_V1_ENABLED pokazuje `children`, bez flagi `fallback` (dotychczasowy wygląd). */
export function IfBrand({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useBrandV1() ? children : fallback}</>;
}

/**
 * Układanie planu: byczek idzie (Walk) → podnosi sztangę (Lift, 2–3 powtórzenia) → cieszy się (Success), gdy plan jest gotowy (`done`).
 * Czasy: Walk 1,2 s, Lift do końca generowania (min. 2 powtórzenia = 4,8 s).
 */
export const PLAN_WALK_MS = 1200;
export const PLAN_LIFT_MIN_MS = 4800;
export function PlanBuilding({ done = false, label = "Układamy Twój plan…" }: { done?: boolean; label?: string }) {
  const [phase, setPhase] = useState<"walk" | "lift">("walk");
  const [liftedEnough, setLiftedEnough] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPhase("lift"), PLAN_WALK_MS); return () => clearTimeout(t); }, []);
  useEffect(() => { if (phase !== "lift") return; const t = setTimeout(() => setLiftedEnough(true), PLAN_LIFT_MIN_MS); return () => clearTimeout(t); }, [phase]);
  const stan = done && liftedEnough ? "success" : phase;
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="status" data-testid="plan-building" data-stan={stan}>
      <Maskotka stan={stan} rozmiar="l" decorative />
      <p className="font-semibold">{stan === "success" ? "Plan gotowy!" : label}</p>
    </div>
  );
}

const DAY_KEY = "optimatren-bull-login-day:v1";
/** Czy pokazać sekwencję logowania: raz dziennie (przy pierwszym wejściu danego dnia); zapis w localStorage (bez niego — przy każdym wejściu). */
export function shouldPlayLoginSequence(today: string, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try { if (storage?.getItem(DAY_KEY) === today) return false; storage?.setItem(DAY_KEY, today); } catch { /* bez pamięci — pokazuj */ }
  return true;
}
export const LOGIN_STEPS: ReadonlyArray<{ stan: "idle" | "walk" | "lift" | "success"; ms: number }> = [{ stan: "idle", ms: 250 }, { stan: "walk", ms: 400 }, { stan: "lift", ms: 450 }, { stan: "success", ms: 400 }];

/** Krótka sekwencja po zalogowaniu: Idle → Walk → Lift → Success (łącznie ok. 1,5 s), pomijalna dotknięciem, raz dziennie, tylko z flagą. */
export function LoginSequence({ today, onDone }: { today: string; onDone?: () => void }) {
  const on = useBrandV1();
  const [play] = useState(() => { try { return shouldPlayLoginSequence(today, window.localStorage); } catch { return true; } });
  const [i, setI] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const active = on && play && !skipped && i < LOGIN_STEPS.length;
  useEffect(() => {
    if (!active) { if (on && play) onDone?.(); return; }
    const t = setTimeout(() => setI((n) => n + 1), LOGIN_STEPS[i]!.ms);
    return () => clearTimeout(t);
  }, [active, i, on, play]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  return (
    <button type="button" onClick={() => setSkipped(true)} aria-label="Pomiń animację" data-testid="login-sequence" data-stan={LOGIN_STEPS[i]!.stan}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background">
      <Maskotka stan={LOGIN_STEPS[i]!.stan} rozmiar="l" decorative />
    </button>
  );
}
