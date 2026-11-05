/** Bramka Regulaminu w panelu trenera (TERMS_ENABLED): po zalogowaniu, gdy bieżąca wersja nie jest zaakceptowana. Wyłączona flaga lub błąd = nic nie blokuje. */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { TermsScreen } from "@workspace/design-tokens/brand";

export function TermsGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery<{ enabled: boolean }>({ queryKey: ["terms-status"], queryFn: () => customFetch("/api/terms/status"), staleTime: 300_000, retry: false });
  const on = status.data?.enabled === true;
  const me = useQuery<{ accepted: boolean; version: string; previousVersion: string | null }>({ queryKey: ["terms-me"], enabled: on, retry: false, queryFn: () => customFetch("/api/terms/me") });
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: (version: string) => customFetch("/api/terms/accept", { method: "POST", body: JSON.stringify({ version }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terms-me"] }),
    onError: () => setError("Nie udało się zapisać zgody. Odśwież stronę i spróbuj ponownie."),
  });
  if (on && me.data && !me.data.accepted) {
    return <TermsScreen update={!!me.data.previousVersion} busy={accept.isPending} error={error} onAccept={() => { setError(null); accept.mutate(me.data!.version); }} />;
  }
  return <>{children}</>;
}
