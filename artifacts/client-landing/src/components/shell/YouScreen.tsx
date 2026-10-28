import type { ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { joinPathFromCode } from "@/components/AccountNotice";
import { useState } from "react";

/**
 * "Ty": profile, my trainer / connect with a trainer (code), settings, "Prowadzę podopiecznych", legal documents, sign out.
 * Presentational: the container passes data and the (self-contained) settings blocks, so it renders the same in the preview.
 */
export function YouScreen({ firstName, lastName, email, trainerName, pendingTrainerName, settings, trainerApply, legal, onSignOut, onJoin, signingOut = false }: {
  firstName: string; lastName: string; email: string;
  /** null = no trainer (Solo) */
  trainerName: string | null;
  pendingTrainerName?: string | null;
  settings: ReactNode; trainerApply: ReactNode; legal: ReactNode;
  onSignOut: () => void;
  onJoin: (path: string) => void;
  signingOut?: boolean;
}) {
  const [code, setCode] = useState("");
  const path = joinPathFromCode(code);
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

      <section className="space-y-2" aria-labelledby="trainer-h">
        <h2 id="trainer-h" className="section-label">Mój trener</h2>
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          {trainerName ? (
            <p className="text-sm">Trener: <span className="font-semibold">{trainerName}</span>. Pytania o plan kieruj do niego.</p>
          ) : pendingTrainerName ? (
            <p className="text-sm text-muted-foreground">Prośba do: {pendingTrainerName}. Czeka na akceptację.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Trenujesz samodzielnie. Masz kod od trenera? Wpisz go, żeby się połączyć.</p>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod trenera" aria-label="Kod trenera" maxLength={14} className="h-11" />
                <Button className="h-11" disabled={!path} onClick={() => { if (path) onJoin(path); }}>Połącz</Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="settings-h">
        <h2 id="settings-h" className="section-label">Ustawienia</h2>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">{settings}</div>
      </section>

      <section className="space-y-2" aria-labelledby="coach-h">
        <h2 id="coach-h" className="section-label">Prowadzę podopiecznych</h2>
        {trainerApply}
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
