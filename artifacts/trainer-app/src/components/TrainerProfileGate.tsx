/**
 * TrainerProfileGate — creates (or loads) the trainer profile right after
 * sign-in, before any trainer screen fetches data.
 *
 * The API never creates trainers implicitly: POST /api/trainer/profile is the
 * only place a trainers row is made. Accounts linked to a client (client
 * portal) are refused with 403 CLIENT_ACCOUNT and see where to go instead.
 */

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";

import { IfBrand, Loading } from "@workspace/design-tokens/brand";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CLIENT_PORTAL_PATH = "/client-landing/plan";

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

function PortalRedirect() {
  useEffect(() => { window.location.replace(CLIENT_PORTAL_PATH); }, []);
  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
      Przechodzimy do Twojego konta…
    </div>
  );
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
      <IfBrand fallback={<div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        Przygotowywanie panelu…
      </div>}><div className="min-h-screen flex items-center justify-center"><Loading label="Przygotowywanie panelu" /></div></IfBrand>
    );
  }

  if (isError) {
    const err = error as ProfileError;
    // Osoba bez roli trenera (nowe konto, podopieczny, Solo) nie dostaje ślepego ekranu: od razu trafia do portalu („Dziś”).
    if (err.code === "CLIENT_ACCOUNT" || err.code === "TRAINER_NOT_APPROVED" || err.code === "TRAINER_PROFILE_REQUIRED") {
      return <PortalRedirect />;
    }
    if (err.code === "ACCOUNT_BLOCKED") {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div role="alert" className="max-w-md text-center space-y-4">
            <p className="text-lg font-semibold">To konto jest zablokowane</p>
            <p className="text-sm text-muted-foreground">Skontaktuj się z administratorem.</p>
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
