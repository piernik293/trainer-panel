import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

/** Settings: the client sees whether the consent to process health data is given and can withdraw it. */
export function HealthConsentSetting() {
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/client-portal/health-consent", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { status: string | null }) => { if (alive) setStatus(d.status); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const withdraw = async () => {
    if (!window.confirm("Wycofać zgodę na przetwarzanie danych o zdrowiu? Plan będzie przygotowywany z najostrożniejszymi ustawieniami.")) return;
    setFailed(false);
    try {
      const r = await fetch("/api/client-portal/health-consent/withdraw", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      setStatus((await r.json()).status);
    } catch { setFailed(true); }
  };

  if (status === undefined && !failed) return null;
  if (status === null || status === undefined) return null; // no consent record (older interview): nothing to withdraw
  return (
    <div className="flex items-start justify-between gap-3" data-testid="health-consent-setting">
      <div>
        <p className="text-sm font-semibold">Zgoda na dane o zdrowiu</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {status === "given" ? "Udzielona. Możesz ją wycofać w każdej chwili." : status === "withdrawn" ? "Wycofana." : "Nie udzielono."}{" "}
          <Link href="/legal/zgoda-zdrowie" className="underline underline-offset-2">Treść zgody</Link>
        </p>
        {failed && <p role="alert" className="mt-1 text-xs text-destructive">Nie udało się zapisać. Spróbuj ponownie.</p>}
      </div>
      {status === "given" && <Button variant="outline" size="sm" onClick={() => void withdraw()}>Wycofaj zgodę</Button>}
    </div>
  );
}
