/** Ustawienia trenera: link i kod do dołączania podopiecznych oraz prośby do rozpatrzenia (blok 2). */
import { Copy, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { NEW_CODE_CONFIRM, useDecideJoinRequest, useJoinInfo, useNewJoinCode } from "@/lib/joinApi";

export function JoinCard() {
  const { toast } = useToast();
  const { data, isLoading } = useJoinInfo();
  const newCode = useNewJoinCode();
  const decide = useDecideJoinRequest();
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `Skopiowano ${what}` }); }
    catch { toast({ title: "Nie udało się skopiować", variant: "destructive" }); }
  };
  return (
    <Card data-testid="join-card">
      <CardHeader>
        <CardTitle className="text-base">Dołączanie podopiecznych</CardTitle>
        <CardDescription>Wyślij link albo kod (SMS, WhatsApp, Instagram). Osoba prosi o dołączenie, a Ty ją akceptujesz.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? <div className="h-16 bg-muted animate-pulse rounded" /> : (
          <>
            <div className="space-y-2">
              <p className="text-sm">Kod: <span className="font-mono font-semibold tracking-wider" data-testid="join-code">{data.code}</span></p>
              <p className="text-xs text-muted-foreground break-all">{data.link}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(data.link, "link")}><Copy className="w-3.5 h-3.5 mr-1.5" />Skopiuj link</Button>
                <Button size="sm" variant="outline" onClick={() => copy(data.code, "kod")}><Copy className="w-3.5 h-3.5 mr-1.5" />Skopiuj kod</Button>
                <Button size="sm" variant="ghost" disabled={newCode.isPending}
                  onClick={() => { if (window.confirm(NEW_CODE_CONFIRM)) newCode.mutate(undefined, { onError: (e) => toast({ title: humanizeError(e), variant: "destructive" }) }); }}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Nowy kod
                </Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Prośby o dołączenie ({data.requests.length})</p>
              {data.requests.length === 0 ? <p className="text-sm text-muted-foreground">Brak próśb.</p> : (
                <ul className="space-y-2">
                  {data.requests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2" data-testid="join-request">
                      <span className="text-sm">{r.firstName}</span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: false })}>Odrzuć</Button>
                        <Button size="sm" disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, accept: true }, { onError: (e) => toast({ title: humanizeError(e), variant: "destructive" }) })}>Akceptuj</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
