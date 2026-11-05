/** „Moja biblioteka”: własne ćwiczenia trenera — uzupełnienie stawów i poziomu obciążenia, zgoda na wspólną bibliotekę, opcja generatora (flaga TRAINER_LIBRARY_ENABLED). */
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { useLibrary, useLibraryActions, useLibraryStatus, type LibraryExercise } from "@/lib/libraryApi";

const SHARE_LABEL: Record<string, string> = { none: "", proposed: "Wysłane do weryfikacji", added: "Dodane do wspólnej biblioteki", rejected: "Odrzucone" };

function Row({ ex, joints, levels }: { ex: LibraryExercise; joints: string[]; levels: string[] }) {
  const { toast } = useToast();
  const { complete, share } = useLibraryActions();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(ex.jointStress ?? "");
  const [areas, setAreas] = useState<string[]>(ex.jointStressAreas ?? []);
  const err = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  return (
    <li className="space-y-2 p-3" data-testid="library-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{ex.name}</span>
        <span className="text-xs text-muted-foreground">{ex.complete ? "Komplet danych" : `Brakuje: ${ex.missing.join(", ")}`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Stawy i poziom obciążenia</Button>
        <Button size="sm" variant="ghost" className="min-h-11" asChild><Link href={`/exercises/${ex.id}`}>Otwórz ćwiczenie</Link></Button>
      </div>
      {open && (
        <div className="space-y-2 rounded-md border p-3" data-testid="library-joints">
          <label className="block text-sm font-medium">Poziom obciążenia stawów
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 h-11 w-full rounded-md border bg-background px-2">
              <option value="">Wybierz…</option>{levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Obciążane stawy (zostaw puste, jeśli żaden)</legend>
            {joints.map((j) => (
              <label key={j} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={areas.includes(j)} onChange={(e) => setAreas((a) => (e.target.checked ? [...a, j] : a.filter((x) => x !== j)))} />{j}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">Bez tych danych ćwiczenie nie trafi do podopiecznego ze zgłoszonym stawem ani do osoby bez zgody zdrowotnej.</p>
          <Button size="sm" className="min-h-11" disabled={!level || complete.isPending} onClick={() => complete.mutate({ id: ex.id, jointStress: level, jointStressAreas: areas }, { onSuccess: () => { toast({ title: "Zapisano" }); setOpen(false); }, onError: err })}>Zapisz</Button>
        </div>
      )}
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ex.shareConsent} disabled={share.isPending || (!ex.complete && !ex.shareConsent)}
          onChange={(e) => share.mutate({ id: ex.id, consent: e.target.checked }, { onError: err })} data-testid="library-consent" />
        <span>Zgadzam się, by Optimatren dodał to ćwiczenie do wspólnej biblioteki. <Link href="/legal/regulamin" className="underline underline-offset-2">Regulamin, §8</Link>{!ex.complete && " (najpierw uzupełnij dane)"}</span>
      </label>
      {ex.shareStatus !== "none" && <p className="text-xs text-muted-foreground" data-testid="library-share-status">{SHARE_LABEL[ex.shareStatus]}{ex.shareStatus === "rejected" && ex.shareRejectReason ? `: ${ex.shareRejectReason}` : ""}</p>}
    </li>
  );
}

export default function TrainerLibrary() {
  const status = useLibraryStatus();
  const on = status.data?.enabled === true;
  const { data, isLoading } = useLibrary(on);
  const { settings } = useLibraryActions();
  const { toast } = useToast();
  if (status.isLoading) return <div className="h-16 animate-pulse rounded bg-muted" />;
  if (!on) return <p className="text-sm text-muted-foreground">Ta funkcja jest jeszcze niedostępna.</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moja biblioteka</h1>
        <p className="text-sm text-muted-foreground">Twoje własne ćwiczenia widzisz tylko Ty i Twoi podopieczni.</p>
      </div>
      {isLoading || !data ? <div className="h-16 animate-pulse rounded bg-muted" /> : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Generator</CardTitle><CardDescription>Domyślnie generator korzysta tylko ze wspólnego katalogu. Możesz pozwolić mu użyć Twoich ćwiczeń — tylko tych z kompletem danych.</CardDescription></CardHeader>
            <CardContent>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={data.useOwnInGenerator} onChange={(e) => settings.mutate({ useOwnInGenerator: e.target.checked }, { onError: (er) => toast({ title: humanizeError(er), variant: "destructive" }) })} data-testid="library-generator" />
                Używaj moich ćwiczeń w generatorze
              </label>
            </CardContent>
          </Card>
          <ul className="divide-y rounded-md border" data-testid="library-list">
            {data.exercises.map((e) => <Row key={e.id} ex={e} joints={data.joints} levels={data.levels} />)}
            {data.exercises.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nie masz jeszcze własnych ćwiczeń. Dodasz je w „Biblioteka ćwiczeń” → „Dodaj Ćwiczenie”.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
