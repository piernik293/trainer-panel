/** Po aktywacji planu (B5): „Plan aktywny. Wyślij klientowi dostęp do aplikacji” + jeden przycisk (kopiuj link) i wysyłka mailem. */
import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { humanizeError } from "@/lib/userError";
import { portalInviteUrl, portalMailto } from "@/lib/portalAccess";

export function PlanActiveDialog({ open, onOpenChange, clientId, firstName, email }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: number; firstName: string; email: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const makeLink = async (): Promise<string | null> => {
    if (url) return url;
    setBusy(true); setErr(null);
    try {
      const r: { token: string } = await customFetch(`/api/clients/${clientId}/invite`, { method: "POST" });
      const u = portalInviteUrl(window.location.origin, r.token);
      setUrl(u);
      return u;
    } catch (e) { setErr(humanizeError(e, "Nie udało się przygotować linku. Spróbuj ponownie.")); return null; }
    finally { setBusy(false); }
  };
  const copy = async () => {
    const u = await makeLink();
    if (!u) return;
    try { await navigator.clipboard.writeText(u); setCopied(true); } catch { setErr("Nie udało się skopiować. Skopiuj link ręcznie."); }
  };
  const mail = async () => {
    const u = await makeLink();
    const href = u ? portalMailto(email, firstName, u) : null;
    if (href) window.location.href = href;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="plan-active-dialog">
        <DialogHeader>
          <DialogTitle>Plan aktywny</DialogTitle>
          <DialogDescription>Wyślij klientowi dostęp do aplikacji — dopiero wtedy zobaczy swój plan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button className="w-full" onClick={copy} disabled={busy}>{copied ? "Skopiowano" : "Kopiuj link"}</Button>
          {email && <Button variant="outline" className="w-full" onClick={mail} disabled={busy}>Wyślij mailem</Button>}
          {url && <p className="break-all text-xs text-muted-foreground">{url}</p>}
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Później</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
