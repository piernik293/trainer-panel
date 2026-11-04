/** Po zalogowaniu: pyta serwer, dokąd skierować osobę (panel / portal), i tam ją przenosi. */
import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { Show, useClerk } from "@clerk/react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { homeTargetUrl, type AccountHome } from "@/lib/authHome";

import { IfBrand, Loading } from "@workspace/design-tokens/brand";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function Resolver() {
  const { signOut } = useClerk();
  const [state, setState] = useState<"loading" | "blocked" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`${BASE}/api/account/home`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<AccountHome>) : Promise.reject(new Error(String(r.status)))))
      .then((h) => {
        if (!alive) return;
        const url = homeTargetUrl(h, BASE);
        if (url) window.location.replace(url); else setState("blocked");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [attempt]);

  if (state === "blocked") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <p className="text-lg font-semibold">To konto jest zablokowane</p>
          <p className="text-sm text-muted-foreground">Skontaktuj się z administratorem.</p>
          <Button variant="outline" className="gap-1.5" onClick={() => void signOut()}><LogOut size={14} />Wyloguj się</Button>
        </div>
      </div>
    );
  }
  if (state === "error") {
    return <div className="flex min-h-[100dvh] items-center justify-center px-4"><ErrorState title="Nie udało się otworzyć konta" message="Sprawdź połączenie i spróbuj ponownie." onRetry={() => setAttempt((n) => n + 1)} /></div>;
  }
  return (
    <IfBrand fallback={<div className="flex min-h-[100dvh] items-center justify-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Przygotowywanie konta…
    </div>}><div className="flex min-h-[100dvh] items-center justify-center"><Loading label="Przygotowywanie konta" /></div></IfBrand>
  );
}

export default function AuthRedirectPage() {
  return (
    <>
      <Show when="signed-in"><Resolver /></Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}
