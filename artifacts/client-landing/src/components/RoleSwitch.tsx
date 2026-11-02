/** Przełącznik [Mój trening] [Podopieczni] w portalu — tylko dla konta trenera (U1). Trenera rozpoznaje serwer (GET /api/account/roles). */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function RoleSwitch({ className }: { className?: string }) {
  const [isTrainer, setIsTrainer] = useState(false);
  useEffect(() => {
    fetch("/api/account/roles", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((b: { isTrainer?: boolean } | null) => setIsTrainer(!!b?.isTrainer)).catch(() => setIsTrainer(false));
  }, []);
  if (!isTrainer) return null;
  const base = "min-h-11 flex-1 px-3 text-sm font-semibold transition-colors";
  return (
    <div role="group" aria-label="Przełącznik widoku" data-testid="role-switch" className={cn("flex overflow-hidden rounded-lg border border-border", className)}>
      <button type="button" aria-pressed="true" className={cn(base, "bg-primary text-primary-foreground")} disabled>Mój trening</button>
      <button type="button" className={cn(base, "text-muted-foreground hover:bg-muted")} onClick={() => window.location.assign("/")}>Podopieczni</button>
    </div>
  );
}
