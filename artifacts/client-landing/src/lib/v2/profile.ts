import { useCallback, useEffect, useState } from "react";

export interface ProfileV2 {
  firstName: string; displayName: string | null; nick: string | null; avatarColor: string; colors: string[]; trainsSince: string | null;
  /** the "Trener" badge next to the nick */
  isTrainer?: boolean;
  /** ISO date from which the nick can be changed again (once per 30 days); null/absent = now */
  nickChangeAvailableAt?: string | null;
}
export const FALLBACK_PROFILE = (firstName: string): ProfileV2 => ({ firstName, displayName: null, nick: null, avatarColor: "#C2410C", colors: ["#C2410C", "#0F766E", "#1D4ED8", "#7E22CE", "#BE123C", "#4D7C0F"], trainsSince: null, isTrainer: false, nickChangeAvailableAt: null });

/** Own profile of the v2 screens. Any failure → fallback built from the first name (the screens still render). */
export function useProfileV2(firstName: string, enabled = true): { profile: ProfileV2; reload: () => void } {
  const [fetched, setFetched] = useState<ProfileV2 | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetch("/api/client-portal/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: ProfileV2 | null) => { if (alive && p) setFetched(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [n, enabled]);
  // until (or without) the server's answer the first name from the plan answer is used
  return { profile: fetched ?? FALLBACK_PROFILE(firstName), reload: useCallback(() => setN((x) => x + 1), []) };
}

export async function saveProfile(patch: { nick?: string | null; displayName?: string; avatarColor?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/client-portal/profile", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (r.ok) return { ok: true };
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: b.error ?? "Nie udało się zapisać. Spróbuj ponownie." };
  } catch { return { ok: false, error: "Brak połączenia. Spróbuj ponownie." }; }
}
