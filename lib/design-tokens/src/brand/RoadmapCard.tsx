/** Karta „Wkrótce w Optimatren”: pozycje z głosowaniem „Chcę to”. Wyłącznie prezentacja — dane i zapis głosu dostarcza aplikacja. Bez dat. */
export interface RoadmapCardItem { id: number; title: string; blurb: string; icon: string; statusLabel: string; votes: number; voted: boolean }

const GLYPH: Record<string, string> = {
  dumbbell: "🏋", wallet: "💳", camera: "📷", calendar: "📅", store: "🏪", calculator: "🧮", trending: "📈",
  scale: "⚖", utensils: "🍽", pill: "💊", check: "✅", sparkles: "✨", star: "⭐",
};

export function RoadmapCard({ items, onToggle, busyId = null, className = "" }: { items: RoadmapCardItem[]; onToggle: (item: RoadmapCardItem) => void; busyId?: number | null; className?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="roadmap-h" className={`rounded-[20px] bg-[#1C1917] p-4 text-white ${className}`} data-testid="roadmap-card">
      <h2 id="roadmap-h" className="text-base font-extrabold">Wkrótce w Optimatren</h2>
      <p className="mt-0.5 text-sm text-white/70">Zaznacz, na czym zależy Ci najbardziej — od tego zależy kolejność prac.</p>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3" data-testid="roadmap-item">
            <span aria-hidden="true" className="text-xl leading-none">{GLYPH[i.icon] ?? GLYPH["star"]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug">{i.title} <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/80">{i.statusLabel}</span></p>
              <p className="text-xs leading-snug text-white/70">{i.blurb}</p>
            </div>
            <button type="button" aria-pressed={i.voted} disabled={busyId === i.id} onClick={() => onToggle(i)}
              className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold ${i.voted ? "bg-white text-[#1C1917]" : "border border-white/40 text-white"}`} data-testid="roadmap-vote">
              {i.voted ? "Chcę to ✓" : "Chcę to"} · {i.votes}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
