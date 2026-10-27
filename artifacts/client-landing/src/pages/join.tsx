/**
 * Dołączanie do trenera przez link lub kod (blok 2). Trasa: /join/:code
 *  1. kod/link jest sprawdzany publicznie (GET /api/join/:code) — widać tylko imię trenera;
 *  2. logowanie lub rejestracja (Clerk);
 *  3. „Poproś o dołączenie” → prośba trafia do trenera ([Odrzuć] [Akceptuj]); dostęp do danych ma dopiero po akceptacji.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useUser, SignIn, SignUp } from "@clerk/react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NETWORK_ERROR_MESSAGE, statusMessage } from "@/lib/userError";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" && res.status < 500 ? body.error : statusMessage(res.status));
  }
  return res.json() as Promise<T>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col px-4 py-6">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center gap-4 text-center">{children}</div>
    </div>
  );
}

export default function JoinPage() {
  const { code = "" } = useParams<{ code: string }>();
  const { isLoaded, isSignedIn } = useUser();
  const [trainer, setTrainer] = useState<{ name: string } | null | "loading">("loading");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [firstName, setFirstName] = useState("");
  const [phase, setPhase] = useState<"form" | "sending" | "done" | "error">("form");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ trainerName: string }>(`/join/${encodeURIComponent(code)}`)
      .then((d) => { if (!cancelled) setTrainer({ name: d.trainerName }); })
      .catch((e: Error) => { if (!cancelled) { setTrainer(null); setMessage(e.message); } });
    return () => { cancelled = true; };
  }, [code]);

  const send = async () => {
    setPhase("sending");
    try {
      await apiFetch(`/join/${encodeURIComponent(code)}/request`, { method: "POST", body: JSON.stringify({ firstName: firstName.trim() || undefined }) });
      setPhase("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Nie udało się wysłać prośby.");
      setPhase("error");
    }
  };

  if (trainer === "loading" || !isLoaded) {
    return <Shell><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /><p>Sprawdzamy kod…</p></Shell>;
  }
  if (trainer === null) {
    return (
      <Shell>
        <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
        <h1 className="text-2xl font-bold">Nie znaleziono trenera</h1>
        <p className="text-muted-foreground">{message || "Sprawdź kod lub poproś trenera o nowy link."}</p>
      </Shell>
    );
  }
  if (phase === "done") {
    return (
      <Shell>
        <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Prośba wysłana</h1>
        <p className="text-muted-foreground">{trainer.name} zobaczy Twoją prośbę. Gdy ją zaakceptuje, zobaczysz tu swój plan.</p>
      </Shell>
    );
  }
  if (!isSignedIn) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Dołącz do: {trainer.name}</h1>
        <p className="text-muted-foreground">Załóż konto lub zaloguj się, a potem wyślij prośbę.</p>
        <div className="flex gap-2">
          {(["signup", "signin"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn("flex-1 min-h-12 px-3 py-2 text-sm font-semibold border", mode === m ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
              {m === "signup" ? "Nie mam konta" : "Mam konto"}
            </button>
          ))}
        </div>
        <div className="flex justify-center [&_.cl-rootBox]:w-full [&_.cl-card]:w-full [&_.cl-cardBox]:w-full">
          {mode === "signup"
            ? <SignUp routing="hash" fallbackRedirectUrl={window.location.pathname} signInFallbackRedirectUrl={window.location.pathname} />
            : <SignIn routing="hash" fallbackRedirectUrl={window.location.pathname} signUpFallbackRedirectUrl={window.location.pathname} />}
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 className="text-2xl font-bold">Dołącz do: {trainer.name}</h1>
      <p className="text-muted-foreground">Trener zobaczy Twoje dane dopiero po zaakceptowaniu prośby.</p>
      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Twoje imię" aria-label="Twoje imię" maxLength={60} />
      {phase === "error" && <p className="text-sm text-destructive" role="alert">{message}</p>}
      <Button onClick={send} disabled={phase === "sending"} className="min-h-12">{phase === "sending" ? "Wysyłanie…" : "Poproś o dołączenie"}</Button>
    </Shell>
  );
}
