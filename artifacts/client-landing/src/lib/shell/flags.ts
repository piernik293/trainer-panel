/**
 * Flags of the new portal shell (bottom bar Dziś · Plan · Postępy · Ty), read from the API: SOLO_ENABLED, ACHIEVEMENTS_ENABLED and UI_V2_ENABLED.
 * All OFF (the default, or any failure to read them) → the portal is exactly what it was before; nothing here renders.
 */
import { useEffect, useState } from "react";

/** `uiV2`: UI_V2_ENABLED — the new look of the portal screens (Dziś, koniec treningu, Postępy, Ty). */
export interface PortalFlags { solo: boolean; achievements: boolean; uiV2: boolean }
export const NO_FLAGS: PortalFlags = { solo: false, achievements: false, uiV2: false };
export const shellEnabled = (f: PortalFlags) => f.solo || f.achievements || f.uiV2;

async function enabled(path: string): Promise<boolean> {
  try {
    const r = await fetch(path, { credentials: "include" });
    if (!r.ok) return false;
    return ((await r.json()) as { enabled?: boolean }).enabled === true;
  } catch { return false; }
}

/** Never throws: any failure counts as "off". */
export async function fetchPortalFlags(): Promise<PortalFlags> {
  const [solo, achievements, uiV2] = await Promise.all([enabled("/api/solo/status"), enabled("/api/achievements/status"), enabled("/api/ui-v2/status")]);
  return { solo, achievements, uiV2 };
}

export function usePortalFlags(): { ready: boolean; flags: PortalFlags } {
  const [state, setState] = useState<{ ready: boolean; flags: PortalFlags }>({ ready: false, flags: NO_FLAGS });
  useEffect(() => {
    let alive = true;
    void fetchPortalFlags().then((flags) => { if (alive) setState({ ready: true, flags }); });
    return () => { alive = false; };
  }, []);
  return state;
}
