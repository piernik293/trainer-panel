/** Bramka Regulaminu w portalu (TERMS_ENABLED): po zalogowaniu, gdy bieżąca wersja nie jest zaakceptowana. Wyłączona flaga lub błąd = nic nie blokuje. */
import { useEffect, useState } from "react";
import { TermsScreen } from "@workspace/design-tokens/brand";

type State = { phase: "ok" } | { phase: "needs"; version: string; update: boolean };

export function useTermsGate(active: boolean): { state: State; accept: () => Promise<string | null> } {
  const [state, setState] = useState<State>({ phase: "ok" });
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void (async () => {
      try {
        const st = await fetch("/api/terms/status", { credentials: "include" });
        if (!st.ok || ((await st.json()) as { enabled?: boolean }).enabled !== true) return;
        const r = await fetch("/api/terms/me", { credentials: "include" });
        if (!r.ok) return;
        const me = (await r.json()) as { accepted: boolean; version: string; previousVersion: string | null };
        if (alive && !me.accepted) setState({ phase: "needs", version: me.version, update: !!me.previousVersion });
      } catch { /* bez bramki */ }
    })();
    return () => { alive = false; };
  }, [active]);
  const accept = async (): Promise<string | null> => {
    if (state.phase !== "needs") return null;
    try {
      const r = await fetch("/api/terms/accept", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: state.version }) });
      if (!r.ok) return "Nie udało się zapisać zgody. Odśwież stronę i spróbuj ponownie.";
      setState({ phase: "ok" }); return null;
    } catch { return "Brak połączenia. Spróbuj ponownie."; }
  };
  return { state, accept };
}

export function TermsGateScreen({ update, onAccept }: { update: boolean; onAccept: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <TermsScreen update={update} busy={busy} error={error} legalBase={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/legal`}
    onAccept={() => { setBusy(true); void onAccept().then((e) => { setError(e); setBusy(false); }); }} />;
}
