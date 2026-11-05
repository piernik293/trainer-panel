/** 3 krótkie podpowiedzi przy pierwszym wejściu (Dziś → stoper przerwy → „Coś boli?”), do zamknięcia; flaga ONBOARDING_ENABLED. */
import { useEffect, useState } from "react";

const KEY = "optimatren-first-tips:v1";
const seen = () => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } };

export function FirstTips({ show }: { show: boolean }) {
  const [on, setOn] = useState(false);
  const [hidden, setHidden] = useState(seen);
  useEffect(() => {
    if (!show || hidden) return;
    let alive = true;
    void fetch("/api/onboarding/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((b: { enabled?: boolean } | null) => { if (alive && b?.enabled === true) setOn(true); }).catch(() => {});
    return () => { alive = false; };
  }, [show, hidden]);
  if (!on || hidden || !show) return null;
  return (
    <section className="space-y-2 rounded-[20px] border border-border bg-card p-4" data-testid="first-tips" aria-label="Na początek">
      <h2 className="font-extrabold">Na początek — 3 rzeczy</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li><b>Dziś</b> pokazuje trening na ten dzień. Naciśnij „Start”.</li>
        <li><b>Stoper przerwy</b> odlicza sam po każdej serii. Możesz go wyciszyć w „Ty”.</li>
        <li><b>„Coś boli?”</b> — gdy coś Cię zaboli, przerwij to ćwiczenie i naciśnij ten przycisk.</li>
      </ol>
      <button type="button" onClick={() => { try { window.localStorage.setItem(KEY, "1"); } catch { /* wróci następnym razem */ } setHidden(true); }}
        className="min-h-11 rounded-xl px-3 font-bold text-primary" data-testid="first-tips-close">Rozumiem</button>
    </section>
  );
}
