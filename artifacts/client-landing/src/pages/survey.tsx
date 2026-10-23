import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { useParams } from "wouter";
import SurveyWizard from "@/components/SurveyWizard";
import { motion } from "framer-motion";
import { Loader2, XCircle, Clock, ShieldOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The survey verification endpoint is public and unauthenticated.
 * No session cookie is needed — credentials: "omit" is correct here.
 *
 * URL convention: always use absolute /api/... (no BASE_URL prefix).
 * The Replit proxy routes /api/* → API server for all artifacts on the same
 * domain.  Using BASE_URL would produce /client-landing/api/..., which the
 * proxy routes to the Vite dev server instead.
 */

interface TokenValidation {
  valid: true;
  intendedEmail: string | null;
  /** First name typed by the trainer when creating the invitation. */
  clientName?: string | null;
  /** Set when the invitation is tied to an existing client (name / contact screens are skipped). */
  existingClient?: { firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  expiresAt: string;
}

/** Codes returned by the API on non-200 responses for clean state discrimination. */
type InviteErrorCode =
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_USED";

type TokenState =
  | { status: "loading" }
  | { status: "valid"; data: TokenValidation }
  /** Token not found or bad format — link is simply wrong. */
  | { status: "invalid"; message: string }
  /** Token found but the invitation window has passed. */
  | { status: "expired" }
  /** Trainer revoked the invitation before it was used. */
  | { status: "revoked" }
  /** Token was already used to submit a survey. */
  | { status: "used" }
  /**
   * API returned a 5xx, or the response was not JSON at all (routing error:
   * a Vite SPA page was returned instead of the API).  Not the client's fault.
   */
  | { status: "server_error" }
  /** Fetch threw — genuine network failure or CORS block. */
  | { status: "network_error" };

export default function SurveyTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [state, setState] = useState<TokenState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid", message: "Nieprawidłowy link zaproszeniowy." });
      return;
    }

    // Absolute /api/... path — see module comment above.
    fetch(`/api/public/survey/${encodeURIComponent(token)}`, {
      credentials: "omit",
    })
      .then(async (res) => {
        // Before trying to parse JSON, verify the response is actually JSON.
        // A Vite SPA page (text/html) would be returned if the /api/... path
        // was misconfigured to point at the Vite dev server.
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          if (import.meta.env.DEV) {
            console.error(
              `[survey] unexpected response from ${res.url}: ` +
              `status=${res.status}, content-type="${ct}" — ` +
              `expected JSON from the API server.  ` +
              `Check that /api/... routes to the API artifact and ` +
              `not to the Vite dev server.`,
            );
          }
          setState({ status: "server_error" });
          return;
        }

        if (res.ok) {
          const data = (await res.json()) as TokenValidation;
          setState({ status: "valid", data });
          return;
        }

        // Parse the error body — fall back gracefully if the JSON is malformed.
        const body = await res.json().catch(() => ({ error: res.statusText })) as {
          error?: string;
          code?: string;
        };

        const code = body.code as InviteErrorCode | undefined;

        if (res.status === 410) {
          if (code === "INVITE_EXPIRED") { setState({ status: "expired" });  return; }
          if (code === "INVITE_REVOKED") { setState({ status: "revoked" });  return; }
          if (code === "INVITE_USED")    { setState({ status: "used" });     return; }
        }

        if (res.status >= 500) {
          setState({ status: "server_error" });
          return;
        }

        setState({
          status: "invalid",
          message: body.error ?? "Nieprawidłowy link.",
        });
      })
      // Only genuine fetch failures (network down, CORS block) land here.
      // HTTP error responses (4xx, 5xx) are handled in .then() above.
      .catch(() => setState({ status: "network_error" }));
  }, [token]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Sprawdzanie linku zaproszeniowego…</p>
        </div>
      </div>
    );
  }

  // ── Network / CORS failure ─────────────────────────────────────────────────
  if (state.status === "network_error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-14 h-14 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">Błąd połączenia</h2>
          <p className="text-muted-foreground">
            Nie udało się nawiązać połączenia z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
          </p>
          <Button onClick={() => window.location.reload()}>Spróbuj ponownie</Button>
        </div>
      </div>
    );
  }

  // ── Server / routing error ─────────────────────────────────────────────────
  if (state.status === "server_error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-14 h-14 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">Błąd serwera</h2>
          <p className="text-muted-foreground">
            Wystąpił nieoczekiwany błąd po stronie serwera. Spróbuj ponownie za chwilę.
          </p>
          <Button onClick={() => window.location.reload()}>Spróbuj ponownie</Button>
        </div>
      </div>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (state.status === "expired") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <Clock className="w-14 h-14 text-yellow-500 mx-auto" />
          <h2 className="text-2xl font-bold">Link wygasł</h2>
          <p className="text-muted-foreground">
            Ten link zaproszeniowy wygasł. Poproś swojego trenera o nowy link.
          </p>
        </div>
      </div>
    );
  }

  // ── Revoked ────────────────────────────────────────────────────────────────
  if (state.status === "revoked") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <ShieldOff className="w-14 h-14 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">Link odwołany</h2>
          <p className="text-muted-foreground">
            Ten link zaproszeniowy został odwołany przez trenera. Poproś o nowy link.
          </p>
        </div>
      </div>
    );
  }

  // ── Already used ───────────────────────────────────────────────────────────
  if (state.status === "used") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <CheckCircle2 className="w-14 h-14 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-bold">Link już wykorzystany</h2>
          <p className="text-muted-foreground">
            Ten jednorazowy link zaproszeniowy został już użyty. Skontaktuj się z trenerem, jeśli to błąd.
          </p>
        </div>
      </div>
    );
  }

  // ── Invalid / not found ────────────────────────────────────────────────────
  if (state.status === "invalid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-14 h-14 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">Nieprawidłowy link</h2>
          <p className="text-muted-foreground">{state.message}</p>
          <p className="text-sm text-muted-foreground">
            Poproś swojego trenera o nowy link zaproszeniowy.
          </p>
        </div>
      </div>
    );
  }

  // ── Valid — render the survey form ─────────────────────────────────────────
  const { intendedEmail, clientName, existingClient } = state.data;
  const prefill = existingClient
    ? { existingClient: true, firstName: existingClient.firstName, lastName: existingClient.lastName, email: existingClient.email ?? intendedEmail ?? "", phone: existingClient.phone ?? "" }
    : { firstName: clientName ?? "", email: intendedEmail ?? "" };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-brand-soft">
      {/* HEADER — compact: the question itself is the heading of each step */}
      <header className="border-b border-border bg-card px-6 py-2">
        <div className="mx-auto flex max-w-[560px] items-center gap-3">
          <BrandMark />
          <span className="font-bold tracking-tight">Optimatren</span>
          <span className="section-label ml-auto">Wywiad treningowy</span>
        </div>
      </header>

      {/* FORM SECTION */}
      <section className="flex-1 px-4 py-3 md:py-10">
        <SurveyWizard inviteToken={token} prefill={prefill} />
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-8 text-center bg-card/50">
        <p className="text-muted-foreground text-sm uppercase tracking-widest">
          © {new Date().getFullYear()} Premium Personal Training. Wszelkie prawa zastrzeżone.
        </p>
      </footer>
    </div>
  );
}
