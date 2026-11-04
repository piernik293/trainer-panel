import { useEffect, useState } from "react";

export interface CatalogueItem {
  id: string; kind: string; title: string; hint: string; state: "earned" | "progress" | "locked";
  progress: { value: number; target: number } | null; earnedAt: string | null; seen: boolean;
}
export interface Overview { streakWeeks: number | null; sessionCount: number; recordCount: number; items: CatalogueItem[]; earnedCount: number; total: number }

/** Achievements catalogue for Postępy / Dziś / Ty. `enabled` false (ACHIEVEMENTS_ENABLED off) or any failure → null (the screens simply leave it out). */
export function useOverview(enabled: boolean): { overview: Overview | null; loaded: boolean } {
  const [state, setState] = useState<{ overview: Overview | null; loaded: boolean }>({ overview: null, loaded: !enabled });
  useEffect(() => {
    if (!enabled) { setState({ overview: null, loaded: true }); return; }
    let alive = true;
    void fetch("/api/client-portal/achievements/overview", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Overview>) : null))
      .catch(() => null)
      .then((o) => { if (alive) setState({ overview: o, loaded: true }); });
    return () => { alive = false; };
  }, [enabled]);
  return state;
}

/** The nearest achievement to earn: the "progress" item with the highest share done. */
export function nextAchievement(items: readonly CatalogueItem[]): CatalogueItem | null {
  const p = items.filter((i) => i.state === "progress" && i.progress);
  if (p.length === 0) return null;
  return p.reduce((a, b) => (b.progress!.value / b.progress!.target > a.progress!.value / a.progress!.target ? b : a));
}
