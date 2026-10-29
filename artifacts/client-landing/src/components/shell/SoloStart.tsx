import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Start of the Solo path (a person without a trainer): welcome → name → the existing interview → a plan from the generator with the Solo rules →
 * "Dziś". Only behind SOLO_ENABLED. `interviewReady` is false until the server-side plan driver for Solo exists (docs/POSTEP-GCP.md, block 11);
 * the screen then says so plainly instead of offering a button that leads nowhere.
 */
export function SoloStart({ onStart, interviewReady, busy = false, error = null, created = false }: {
  onStart: (firstName: string) => void; interviewReady: boolean; busy?: boolean; error?: string | null; created?: boolean;
}) {
  const [name, setName] = useState("");
  const ok = name.trim().length > 0;
  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 pt-12" data-testid="solo-start">
      <div className="space-y-3 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-primary"><Dumbbell className="h-7 w-7" aria-hidden /></span>
        <h1 className="text-2xl font-bold tracking-tight">Trenuj po swojemu</h1>
        <p className="text-muted-foreground">Odpowiesz na kilka pytań, a my ułożymy Ci bezpieczny plan. Zawsze możesz połączyć się z trenerem.</p>
      </div>
      {created ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm" role="status">
          {interviewReady ? "Świetnie! Teraz kilka pytań o Ciebie." : "Konto gotowe. Pytania o Ciebie i plan będą dostępne wkrótce — wrócisz tu automatycznie."}
        </p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onStart(name.trim()); }}>
          <label className="block text-sm font-semibold" htmlFor="solo-name">Jak masz na imię?</label>
          <Input id="solo-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} className="h-12" />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!ok || busy}>Zaczynamy</Button>
        </form>
      )}
    </div>
  );
}
