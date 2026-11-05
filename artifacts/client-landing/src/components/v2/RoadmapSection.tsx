/** „Wkrótce w Optimatren” w „Ty”: pokazuje się tylko przy włączonej fladze ROADMAP_ENABLED (każdy błąd = brak karty). */
import { useEffect, useState } from "react";
import { RoadmapCard, type RoadmapCardItem } from "@workspace/design-tokens/brand";

export function RoadmapSection() {
  const [items, setItems] = useState<RoadmapCardItem[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const st = await fetch("/api/roadmap/status", { credentials: "include" });
        if (!st.ok || ((await st.json()) as { enabled?: boolean }).enabled !== true) return;
        const r = await fetch("/api/roadmap", { credentials: "include" });
        if (!r.ok) return;
        const b = (await r.json()) as { items?: RoadmapCardItem[] };
        if (alive && Array.isArray(b.items)) setItems(b.items);
      } catch { /* bez karty */ }
    })();
    return () => { alive = false; };
  }, []);
  if (!items || items.length === 0) return null;
  const toggle = async (i: RoadmapCardItem) => {
    setBusy(i.id);
    // od razu pokazujemy zmianę; przy błędzie wracamy do stanu sprzed kliknięcia
    const apply = (voted: boolean) => setItems((cur) => (cur ?? []).map((x) => (x.id === i.id ? { ...x, voted, votes: Math.max(0, x.votes + (voted ? 1 : -1) * (x.voted === voted ? 0 : 1)) } : x)));
    apply(!i.voted);
    try {
      const r = await fetch(`/api/roadmap/${i.id}/vote`, { method: i.voted ? "DELETE" : "POST", credentials: "include" });
      if (!r.ok) apply(i.voted);
    } catch { apply(i.voted); } finally { setBusy(null); }
  };
  return <RoadmapCard items={items} onToggle={(i) => void toggle(i)} busyId={busy} />;
}
