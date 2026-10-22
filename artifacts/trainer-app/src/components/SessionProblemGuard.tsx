/**
 * SessionProblemGuard — one place that reacts to HTTP 401 from the API.
 *
 *   - no session in the browser (Clerk signed out) → go to the sign-in page,
 *   - the browser has a session but the server rejects it (e.g. wrong server
 *     key, revoked session) → "Problem z logowaniem" with a sign-out button.
 *     No automatic redirect here: signing in again would hit the same 401 and
 *     loop.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function isUnauthorized(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 401;
}

export function SessionProblemGuard({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, navigate] = useLocation();
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    const on401 = () => {
      if (isSignedIn) setRejected(true);
      else navigate("/trainer/sign-in");
    };
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error" && isUnauthorized(event.action.error)) on401();
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error" && isUnauthorized(event.action.error)) on401();
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [queryClient, isSignedIn, navigate]);

  if (rejected) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div role="alert" className="max-w-md text-center space-y-4">
          <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto" aria-hidden="true" />
          <p className="text-lg font-semibold">Problem z logowaniem</p>
          <p className="text-sm text-muted-foreground">
            Jesteś zalogowany, ale serwer nie przyjął Twojej sesji. Wyloguj się i zaloguj
            ponownie. Jeśli problem się powtarza, skontaktuj się z administratorem.
          </p>
          <Button className="gap-1.5" onClick={() => void signOut()}>
            <LogOut size={14} />
            Wyloguj się
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
