/** Przełącznik [Mój trening] [Podopieczni] — widoczny, gdy konto trenera ma też własny trening (U1). */
import { useHasOwnTraining } from "@/lib/adminApi";
import { cn } from "@/lib/utils";

export function RoleSwitch({ className }: { className?: string }) {
  const hasOwnTraining = useHasOwnTraining();
  if (!hasOwnTraining) return null;
  const base = "min-h-11 flex-1 px-3 text-sm font-semibold transition-colors";
  return (
    <div role="group" aria-label="Przełącznik widoku" data-testid="role-switch" className={cn("flex overflow-hidden rounded-lg border border-border", className)}>
      <button type="button" className={cn(base, "text-muted-foreground hover:bg-sidebar-accent")} onClick={() => window.location.assign("/client-landing/plan")}>Mój trening</button>
      <button type="button" aria-pressed="true" className={cn(base, "bg-primary text-primary-foreground")} disabled>Podopieczni</button>
    </div>
  );
}
