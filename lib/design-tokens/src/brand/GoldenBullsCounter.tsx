import { useEffect, useState } from "react";
import { GoldenBullBadge } from "./GoldenBullBadge";

interface Status { enabled: boolean; trainer: { pool: number; left: number }; solo: { pool: number; left: number } }

/** Mały, nienachalny licznik kampanii: „Zostało X z 10” (trenerzy) / „X z 100” (Solo). Znika, gdy kampania wyłączona, pula pusta lub błąd. */
export function GoldenBullsCounter({ kind, className }: { kind: "trainer" | "solo"; className?: string }) {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/golden-bulls/status", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((b) => { if (alive) setS(b); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!s?.enabled) return null;
  const p = s[kind];
  if (!p || p.left <= 0) return null;
  const who = kind === "trainer" ? "Złotych Byczków dla trenerów" : "Złotych Byczków";
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`} data-testid="golden-bulls-counter" data-kind={kind}>
      <GoldenBullBadge size={18} decorative />
      <span>{who}: zostało {p.left} z {p.pool}</span>
    </p>
  );
}
