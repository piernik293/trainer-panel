/**
 * Activate — Client portal activation page (mobile-first)
 *
 * Route: /invite/:token
 *
 * Flow:
 *  1. Token is validated (GET /api/client-invitations/:token) — public call.
 *  2. If invalid/expired/revoked/used → show appropriate error state.
 *  3. If valid → mobile onboarding screen with a clear login/signup choice
 *     (Clerk SignIn / SignUp) under an explanatory header.
 *  4. Once Clerk auth is complete → POST /api/client-invitations/:token/activate.
 *  5. On success → explicit "Przejdź do planu" button (no auto-redirect).
 */

import { BrandMark } from "@/components/BrandMark";
import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useUser, SignIn, SignUp } from "@clerk/react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  ShieldCheck,
  User,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NETWORK_ERROR_MESSAGE, statusMessage } from "@/lib/userError";

// ─── API helper (mirrors plan.tsx) ────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch (cause) {
    // Network-level failure — user-safe message; detail stays in console.
    console.error("apiFetch network error:", path, cause);
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { cause });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMsg = typeof body.error === "string" ? body.error : null;
    const err = new Error(
      serverMsg && res.status < 500 ? serverMsg : statusMessage(res.status),
    ) as Error & { state?: string; status: number };
    err.state = body.state;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InviteState =
  | { phase: "loading" }
  | { phase: "valid"; clientName: string | null; clientEmail: string | null; trainerName: string | null; expiresAt: string }
  | { phase: "invalid"; reason: "expired" | "revoked" | "used" | "not_found" }
  | { phase: "activating" }
  | { phase: "success" }
  | { phase: "error"; message: string };

// ─── Full-page mobile shell ───────────────────────────────────────────────────
// min-height 100dvh + safe-area padding; content is a comfortable single column.

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        paddingLeft: "max(env(safe-area-inset-left), 1rem)",
        paddingRight: "max(env(safe-area-inset-right), 1rem)",
      }}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col">{children}</div>
    </div>
  );
}

// ─── Status screen (loading / error / expired / success) ─────────────────────

function StatusScreen({
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
    <PageShell>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-2">
        <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-1">
          {icon}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {body && <p className="text-muted-foreground text-base leading-relaxed max-w-sm">{body}</p>}
        {children && <div className="w-full max-w-sm pt-2 space-y-3">{children}</div>}
      </div>
    </PageShell>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivatePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [state, setState] = useState<InviteState>({ phase: "loading" });
  const [mode, setMode] = useState<"signin" | "signup">("signup");

  // ── Step 1: validate the token ────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setState({ phase: "invalid", reason: "not_found" });
      return;
    }

    let cancelled = false;
    apiFetch<{ state: string; clientName: string | null; clientEmail: string | null; trainerName: string | null; expiresAt: string }>(
      `/client-invitations/${encodeURIComponent(token)}`,
    )
      .then((data) => {
        if (!cancelled) {
          setState({
            phase: "valid",
            clientName: data.clientName,
            clientEmail: data.clientEmail ?? null,
            trainerName: data.trainerName ?? null,
            expiresAt: data.expiresAt,
          });
        }
      })
      .catch((err: Error & { state?: string; status?: number }) => {
        if (cancelled) return;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd.";
      setState({ phase: "error", message: msg });
    }
  }, [token]);

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
      <StatusScreen
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
        icon: <CheckCircle2 className="w-8 h-8 text-green-500" />,
        title: "Zaproszenie już wykorzystane",
        body: "To zaproszenie zostało już wcześniej użyte. Jeśli masz konto, możesz się zalogować na stronie swojego planu.",
      },
      not_found: {
        icon: <AlertCircle className="w-8 h-8 text-destructive" />,
        title: "Nieprawidłowe zaproszenie",
        body: "Ten link aktywacyjny nie istnieje lub jest nieprawidłowy. Upewnij się, że link jest skopiowany w całości.",
      },
    };
    const c = copy[state.reason];
    return (
      <StatusScreen icon={c.icon} title={c.title} body={c.body}>
        {state.reason === "used" && (
          <Button onClick={() => setLocation("/plan")} className="w-full h-12 rounded-lg font-semibold uppercase tracking-wide">
            Przejdź do planu
          </Button>
        )}
      </StatusScreen>
    );
  }

  if (state.phase === "activating") {
    return (
      <StatusScreen
        icon={<Loader2 className="w-8 h-8 text-primary animate-spin" />}
        title="Łączenie konta…"
        body="Trwa łączenie Twojego konta z profilem klienta."
      />
    );
  }

  if (state.phase === "success") {
    return (
      <StatusScreen
        icon={<ShieldCheck className="w-8 h-8 text-green-500" />}
        title="Konto połączone pomyślnie"
        body="Możesz teraz przejść do swojego planu treningowego."
      >
        <Button
          onClick={() => setLocation("/plan")}
          className="w-full h-12 rounded-lg font-semibold uppercase tracking-wide"
        >
          Przejdź do planu
        </Button>
      </StatusScreen>
    );
  }

  if (state.phase === "error") {
    return (
      <StatusScreen
        icon={<AlertCircle className="w-8 h-8 text-destructive" />}
        title="Błąd aktywacji"
        body={state.message}
      >
        <Button variant="outline" onClick={() => setLocation("/")} className="w-full h-12 rounded-lg">
          Wróć na stronę główną
        </Button>
      </StatusScreen>
    );
  }

  // phase === "valid" — full mobile onboarding screen with login/signup choice

  return (
    <PageShell>
      <div className="flex-1 flex flex-col gap-6 py-4">
        {/* Context header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-11 w-11 text-xl" />
            <span className="font-bold text-lg tracking-tight">Optimatren</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            Dostęp do planu treningowego
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Twój trener udostępnił Ci konto klienta. Zaloguj się lub utwórz konto,
            aby zobaczyć plan treningowy, historię treningów i zapisywać ciężary.
          </p>
        </div>

        {/* Invite details */}
        {(state.clientName || state.clientEmail || state.trainerName) && (
          <div className="border border-border rounded-lg bg-card divide-y divide-border">
            {state.clientName && (
              <div className="flex items-center gap-3 px-4 py-3">
                <User className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Zaproszenie dla</p>
                  <p className="text-sm font-medium truncate">{state.clientName}</p>
                </div>
              </div>
            )}
            {state.clientEmail && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="text-sm font-medium truncate">{state.clientEmail}</p>
                </div>
              </div>
            )}
            {state.trainerName && (
              <div className="flex items-center gap-3 px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Trener</p>
                  <p className="text-sm font-medium truncate">{state.trainerName}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Login / signup intent switch */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={cn(
                "w-full min-h-12 px-4 py-3 text-sm font-semibold border transition-colors text-left",
                mode === "signup"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              Nie mam konta — Utwórz konto
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={cn(
                "w-full min-h-12 px-4 py-3 text-sm font-semibold border transition-colors text-left",
                mode === "signin"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              Mam już konto — Zaloguj się
            </button>
          </div>

          {/* Clerk widget — full width on mobile */}
          <div className="flex justify-center [&_.cl-rootBox]:w-full [&_.cl-card]:w-full [&_.cl-cardBox]:w-full">
            {mode === "signup" ? (
              <SignUp
                routing="hash"
                fallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
                signInFallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
              />
            ) : (
              <SignIn
                routing="hash"
                fallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
                signUpFallbackRedirectUrl={`${window.location.pathname}${window.location.search}`}
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed text-center px-2">
            Możesz użyć dowolnego adresu e-mail — nie musisz potwierdzać zaproszenia przez e-mail.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
