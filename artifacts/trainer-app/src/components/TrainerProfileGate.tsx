/**
 * TrainerProfileGate — creates (or loads) the trainer profile right after
 * sign-in, before any trainer screen fetches data.
 *
 * The API never creates trainers implicitly: POST /api/trainer/profile is the
 * only place a trainers row is made. Accounts linked to a client (client
 * portal) are refused with 403 CLIENT_ACCOUNT and see where to go instead.
 */

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { AccessRequestCard } from "@/components/AccessRequestCard";
import { humanizeError } from "@/lib/userError";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CLIENT_PORTAL_PATH = "/client-landing/";

interface ProfileError extends Error {
  status?: number;
  code?: string;
}

async function ensureTrainerProfile(): Promise<{ id: number }> {
  const res = await fetch(`${BASE}/api/trainer/profile`, { method: "POST", credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as { id?: number; error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(body.error ?? res.statusText), {
      status: res.status,
      code: body.code,
    }) as ProfileError;
  }
  return body as { id: number };
}

export function TrainerProfileGate({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const { isPending, isError, error, refetch } = useQuery({
    queryKey: ["trainer-profile"],
    queryFn: ensureTrainerProfile,
    staleTime: Infinity,
  });

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        Przygotowywanie panelu…
      </div>
    );
  }

  if (isError) {
    const err = error as ProfileError;
    if (err.code === "CLIENT_ACCOUNT") {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div role="alert" className="max-w-md text-center space-y-4">
            <p className="text-lg font-semibold">To konto należy do klienta</p>
            <p className="text-sm text-muted-foreground">{err.message}</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={() => window.location.assign(CLIENT_PORTAL_PATH)}>
                Przejdź do portalu klienta
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={() => void signOut()}>
                <LogOut size={14} />
                Wyloguj się
              </Button>
            </div>
          </div>
        </div>
      );
    }
    if (err.code === "TRAINER_NOT_APPROVED") {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div role="alert" className="max-w-md text-center space-y-4">
            <p className="text-lg font-semibold">To konto nie ma jeszcze dostępu trenera</p>
            <p className="text-sm text-muted-foreground">Dostęp do panelu przyznajemy po zgłoszeniu. Wyślij wniosek, a my go rozpatrzymy.</p>
            <AccessRequestCard />
            <Button variant="outline" className="gap-1.5" onClick={() => void signOut()}>
              <LogOut size={14} />
              Wyloguj się
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <ErrorState
          title="Nie udało się otworzyć panelu trenera"
          message={humanizeError(err)}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return <>{children}</>;
}
