import { useState } from "react";

/** Ekran akceptacji Regulaminu: pierwszy raz („Regulamin”) albo po zmianie wersji („Zaktualizowaliśmy regulamin”). Tylko prezentacja. */
export function TermsScreen({ update, busy = false, error = null, onAccept, legalBase = "/legal" }: { update: boolean; busy?: boolean; error?: string | null; onAccept: () => void; legalBase?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-10" data-testid="terms-screen">
      <h1 className="text-2xl font-extrabold tracking-tight">{update ? "Zaktualizowaliśmy regulamin" : "Zanim zaczniesz"}</h1>
      <p className="text-sm text-muted-foreground">
        {update ? "Żeby korzystać dalej, zapoznaj się z nową wersją i zaakceptuj ją." : "Przeczytaj krótkie zasady korzystania z Optimatren i zaakceptuj je, żeby założyć konto."}
      </p>
      <p className="rounded-xl border border-border bg-muted px-3 py-2 text-sm" role="note">Wersja testowa — dokument w trakcie weryfikacji prawnej.</p>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" data-testid="terms-checkbox" />
        <span>Akceptuję{" "}
          <a href={`${legalBase}/regulamin`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Regulamin</a>{" "}i{" "}
          <a href={`${legalBase}/polityka-prywatnosci`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Politykę prywatności</a>.
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" disabled={!checked || busy} onClick={onAccept} className="min-h-12 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50" data-testid="terms-accept">{busy ? "Zapisuję…" : "Dalej"}</button>
    </main>
  );
}
