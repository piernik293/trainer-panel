/**
 * Activate — Client portal activation page
 *
 * Route: /invite/:token
 *
 * Flow:
 *  1. Token is validated (GET /api/client-invitations/:token) — public call.
 *  2. If invalid/expired/revoked/used → show appropriate error state.
 *  3. If valid → show Clerk SignIn / SignUp so the client can authenticate.
 *  4. Once Clerk auth is complete → POST /api/client-invitations/:token/activate.
 *  5. On success → redirect to /plan.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useUser, SignIn } from "@clerk/react";
import { Loader2, CheckCircle2, AlertCircle, Clock, XCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── API helper (mirrors plan.tsx) ────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { state?: string; status: number };
    err.state = body.state;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InviteState =
  | { phase: "loading" }
  | { phase: "valid"; clientName: string | null; expiresAt: string }
  | { phase: "invalid"; reason: "expired" | "revoked" | "used" | "not_found" }
  | { phase: "activating" }
  | { phase: "success" }
  | { phase: "error"; message: string };

// ─── Invitation state display ─────────────────────────────────────────────────

function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm mx-auto py-12 px-6 gap-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
        {icon}
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {body && <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>}
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivatePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { isLoaded: clerkLoaded, isSignedIn, user } = useUser();
  const [state, setState] = useState<InviteState>({ phase: "loading" });

  // ── Step 1: validate the token ────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setState({ phase: "invalid", reason: "not_found" });
      return;
    }

    let cancelled = false;
    apiFetch<{ state: string; clientName: string | null; expiresAt: string }>(
      `/client-invitations/${encodeURIComponent(token)}`,
    )
      .then((data) => {
        if (!cancelled) {
          setState({ phase: "valid", clientName: data.clientName, expiresAt: data.expiresAt });
        }
      })
      .catch((err: Error & { state?: string; status?: number }) => {
        if (cancelled) return;
        const reason = (err.state as InviteState extends { phase: "invalid"; reason: infer R } ? R : never) ?? "not_found";
        setState({
          phase: "invalid",
          reason: err.state === "expired" ? "expired"
            : err.state === "revoked" ? "revoked"
            : err.state === "used" ? "used"
            : "not_found",
        });
      });

    return () => { cancelled = true; };
  }, [token]);

  // ── Step 2: once Clerk is ready and the token is valid, activate ──────────

  const activate = useCallback(async () => {
    if (!token) return;
    setState({ phase: "activating" });
    try {
      await apiFetch(`/client-invitations/${encodeURIComponent(token)}/activate`, { method: "POST" });
      setState({ phase: "success" });
      // Give the user a moment to read the success message, then navigate.
      setTimeout(() => setLocation("/plan"), 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd.";
      setState({ phase: "error", message: msg });
    }
  }, [token, setLocation]);

  // When Clerk auth completes and we still have a valid invite, activate.
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn) return;
    if (state.phase === "valid") {
      activate();
    }
  }, [clerkLoaded, isSignedIn, state.phase, activate]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (state.phase === "loading" || !clerkLoaded) {
    return (
      <StateCard
        icon={<Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />}
        title="Weryfikacja zaproszenia…"
      />
    );
  }

  if (state.phase === "invalid") {
    const copy: Record<typeof state.reason, { icon: React.ReactNode; title: string; body: string }> = {
      expired: {
        icon: <Clock className="w-8 h-8 text-amber-500" />,
        title: "Zaproszenie wygasło",
        body: "Ten link aktywacyjny stracił ważność. Poproś trenera o nowe zaproszenie.",
      },
      revoked: {
        icon: <XCircle className="w-8 h-8 text-destructive" />,
        title: "Zaproszenie odwołane",
        body: "Trener odwołał to zaproszenie. Skontaktuj się z trenerem w celu uzyskania nowego linku.",
      },
      used: {
        icon: <CheckCircle2 className="w-8 h-8 text-green-600" />,
        title: "Zaproszenie już wykorzystane",
        body: "To zaproszenie zostało już wcześniej użyte. Jeśli masz konto, możesz się zalogować na stronie swojego planu.",
      },
      not_found: {
        icon: <AlertCircle className="w-8 h-8 text-destructive" />,
        title: "Nieprawidłowe zaproszenie",
        body: "Ten link aktywacyjny nie istnieje lub jest nieprawidłowy. Upewnij się, że skopiowałeś pełny link.",
      },
    };
    const c = copy[state.reason];
    return (
      <StateCard icon={c.icon} title={c.title} body={c.body}>
        {state.reason === "used" && (
          <Button onClick={() => setLocation("/plan")} className="mt-2">
            Przejdź do planu
          </Button>
        )}
      </StateCard>
    );
  }

  if (state.phase === "activating") {
    return (
      <StateCard
        icon={<Loader2 className="w-8 h-8 text-primary animate-spin" />}
        title="Aktywowanie konta…"
        body="Trwa łączenie Twojego konta z profilem klienta."
      />
    );
  }

  if (state.phase === "success") {
    return (
      <StateCard
        icon={<ShieldCheck className="w-8 h-8 text-green-600" />}
        title="Konto aktywowane!"
        body="Twój portal klienta jest gotowy. Za chwilę zostaniesz przekierowany do planu treningowego."
      />
    );
  }

  if (state.phase === "error") {
    return (
      <StateCard
        icon={<AlertCircle className="w-8 h-8 text-destructive" />}
        title="Błąd aktywacji"
        body={state.message}
      >
        <Button variant="outline" onClick={() => setLocation("/")}>
          Wróć na stronę główną
        </Button>
      </StateCard>
    );
  }

  // phase === "valid" — show Clerk sign-in/sign-up
  const greeting = state.clientName ? `Witaj, ${state.clientName}!` : "Witaj w portalu klienta";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">
      {/* Greeting card */}
      <div className="text-center max-w-sm">
        <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">{greeting}</h1>
        <p className="text-muted-foreground text-sm">
          Zaloguj się lub utwórz konto, aby uzyskać dostęp do swojego planu treningowego.
          Możesz użyć dowolnego adresu e-mail — nie musisz potwierdzać zaproszenia przez e-mail.
        </p>
      </div>

      {/* Clerk widget */}
      <SignIn
        routing="hash"
        fallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
        signUpFallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
      />
    </div>
  );
}
