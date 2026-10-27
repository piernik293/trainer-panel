/**
 * Osoba z kontem bez trenera (blok 2): „Wkrótce” dla trybu samodzielnego (bez martwych przycisków),
 * informacja o wysłanej prośbie albo pole na kod trenera. Dla osoby połączonej z trenerem nic nie pokazuje.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AccountStatus { linked: boolean; trainerName: string | null; pendingTrainerName: string | null }

/** Czysta funkcja: kod wpisany ręcznie → ścieżka strony dołączania (bez spacji i myślników). */
export function joinPathFromCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return code.length === 10 && /^[A-Z0-9]+$/.test(code) ? `/join/${code}` : null;
}

export function AccountNotice() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    fetch("/api/account/status", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<AccountStatus>) : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  if (!status || status.linked) return null;
  const path = joinPathFromCode(code);
  return (
    <div className="rounded-lg border border-border p-4 text-left space-y-3" data-testid="account-notice">
      <p className="font-semibold">Trening samodzielny — wkrótce</p>
      {status.pendingTrainerName ? (
        <p className="text-sm text-muted-foreground">Prośba do: {status.pendingTrainerName}. Czeka na akceptację.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Masz kod od trenera? Wpisz go tutaj.</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod trenera" aria-label="Kod trenera" maxLength={14} />
            <Button disabled={!path} onClick={() => { if (path) window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`); }}>Dalej</Button>
          </div>
        </>
      )}
    </div>
  );
}
