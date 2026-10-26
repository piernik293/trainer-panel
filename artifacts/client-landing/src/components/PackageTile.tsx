import { useEffect, useState } from "react";

/** "Zostało X sesji" — only when the trainer allowed it; never a price. Renders nothing otherwise. */
export function PackageTile() {
  const [d, setD] = useState<{ visible: boolean; remaining?: number; total?: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/client-portal/package", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setD(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!d?.visible || d.remaining === undefined) return null;
  const n = d.remaining;
  const word = n === 1 ? "sesja" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "sesje" : "sesji";
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm" data-testid="package-tile">
      <span className="font-semibold">Zostało {n} {word}</span>
      <span className="text-muted-foreground"> z {d.total} w pakiecie</span>
    </div>
  );
}
