import type { ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * "Ty": profile, discreet role rows (Mój trener / Prowadzę podopiecznych), settings, legal documents, sign out.
 * Presentational: the container passes data and the (self-contained) settings blocks, so it renders the same in the preview.
 */
export function YouScreen({ firstName, lastName, email, accountRows, settings, legal, onSignOut, signingOut = false }: {
  firstName: string; lastName: string; email: string;
  /** dyskretne wiersze „Mój trener” i „Prowadzę podopiecznych” (components/shell/RoleRows.tsx) */
  accountRows: ReactNode;
  settings: ReactNode; legal: ReactNode;
  onSignOut: () => void;
  signingOut?: boolean;
}) {
  const full = `${firstName} ${lastName}`.trim();
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "K";
  return (
    <div className="space-y-6" data-testid="you-screen">
      <h1 className="text-2xl font-bold tracking-tight">Ty</h1>

      <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4" aria-label="Profil">
        <Avatar className="h-12 w-12"><AvatarFallback className="bg-brand-soft text-primary">{initials || <UserRound />}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold">{full}</p>
          {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
        </div>
      </section>

      {accountRows}

      <section className="space-y-2" aria-labelledby="settings-h">
        <h2 id="settings-h" className="section-label">Ustawienia</h2>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">{settings}</div>
      </section>

      <section className="space-y-1" aria-labelledby="docs-h">
        <h2 id="docs-h" className="section-label">Dokumenty</h2>
        {legal}
      </section>

      <Button variant="outline" className="h-12 w-full" onClick={onSignOut} disabled={signingOut}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden /> Wyloguj się
      </Button>
    </div>
  );
}
