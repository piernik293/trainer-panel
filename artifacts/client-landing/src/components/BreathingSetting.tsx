import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";

const LABEL = "Kończ schłodzenie minutą spokojnego oddechu";

/** Client setting (default off): one short breathing exercise at the end of every cool-down. Only the client sets it. */
export function BreathingSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/client-portal/settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { breathingCooldown?: boolean }) => { if (alive) setOn(d.breathingCooldown === true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const change = async (next: boolean) => {
    const before = on;
    setOn(next); setFailed(false);
    try {
      const r = await fetch("/api/client-portal/settings", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ breathingCooldown: next }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch { setOn(before); setFailed(true); }
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <label id="breathing-label" htmlFor="breathing-switch" className="text-sm font-semibold">{LABEL}</label>
        <p className="mt-0.5 text-xs text-muted-foreground">Na końcu schłodzenia dodamy jedno krótkie ćwiczenie oddechowe.</p>
        {failed && <p role="alert" className="mt-1 text-xs text-destructive">Nie udało się zapisać. Spróbuj ponownie.</p>}
      </div>
      <Switch id="breathing-switch" aria-labelledby="breathing-label" checked={on === true} disabled={on === null && !failed} onCheckedChange={(v) => void change(v)} />
    </div>
  );
}
