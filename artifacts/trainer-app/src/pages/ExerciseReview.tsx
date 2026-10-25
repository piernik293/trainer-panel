/**
 * "Do weryfikacji" (blok 3): imported exercises not yet reviewed by the trainer.
 * Zweryfikuj / Ukryj; "nadaje się dla braku aktywności" is a separate switch with its own confirmation (verifying never sets it).
 * Hidden exercises are not used by the generator and are never deleted (tab "Ukryte").
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle, EyeOff, Eye } from "lucide-react";
import { DIFFICULTY_LEVEL_OPTIONS, EQUIPMENT_OPTIONS, MOVEMENT_PATTERN_OPTIONS } from "@/lib/exercise-constants";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";

export interface ReviewRow {
  id: number; name: string; difficultyLevel: string | null; movementPattern: string | null; equipment: string[]; jointStressAreas: string[];
  parentExerciseId: number | null; parentName: string | null; variantGrip: string | null; variantPosition: string | null; unilateral: boolean | null;
  intensity: string | null; description: string | null; learningDifficulty: number | null; suitableForNoActivity: boolean | null;
  reviewedByTrainer: boolean; hidden: boolean; canAct: boolean;
}

const KEY = (hidden: boolean, level: string, pattern: string, equipment: string) => ["exercise-review", hidden, level, pattern, equipment] as const;

export default function ExerciseReview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showHidden, setShowHidden] = useState(false);
  const [level, setLevel] = useState("all");
  const [pattern, setPattern] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [confirmNoActivity, setConfirmNoActivity] = useState<ReviewRow | null>(null);

  const params = new URLSearchParams();
  if (showHidden) params.set("hidden", "true");
  if (level !== "all") params.set("difficultyLevel", level);
  if (pattern !== "all") params.set("movementPattern", pattern);
  if (equipment !== "all") params.set("equipment", equipment);
  const { data = [], isLoading } = useQuery<ReviewRow[]>({
    queryKey: KEY(showHidden, level, pattern, equipment),
    queryFn: ({ signal }) => customFetch<ReviewRow[]>(`/api/exercises/review/pending?${params.toString()}`, { signal }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["exercise-review"] });
  const post = (path: string, body?: object) => customFetch(`/api/exercises/${path}`, { method: "POST", body: JSON.stringify(body ?? {}), headers: { "Content-Type": "application/json" } });
  const onError = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });

  const verify = useMutation({ mutationFn: (id: number) => post(`${id}/verify`), onSuccess: () => { void refresh(); toast({ title: "Zweryfikowano" }); }, onError });
  const hide = useMutation({ mutationFn: (v: { id: number; hidden: boolean }) => post(`${v.id}/hide`, { hidden: v.hidden }), onSuccess: (_d, v) => { void refresh(); toast({ title: v.hidden ? "Ukryto — generator go nie użyje" : "Przywrócono" }); }, onError });
  // Separate switch: confirmed in its own dialog. Turning it on needs a reviewed exercise, so the dialog says it verifies it too.
  const noActivity = useMutation({
    mutationFn: async (v: { id: number; verifyFirst: boolean }) => { if (v.verifyFirst) await post(`${v.id}/verify`); return post(`${v.id}/no-activity`, { value: true, confirm: true }); },
    onSuccess: () => { void refresh(); setConfirmNoActivity(null); toast({ title: "Zweryfikowano i oznaczono jako dostępne dla braku aktywności" }); },
    onError: (e: unknown) => { setConfirmNoActivity(null); void refresh(); onError(e); },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="exercise-review">
      <div>
        <Link href="/exercises" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Biblioteka ćwiczeń</Link>
        <h1 className="text-3xl font-display font-bold tracking-tight">Do weryfikacji</h1>
        <p className="mt-1 text-muted-foreground">Zaimportowane ćwiczenia, których jeszcze nie sprawdziłeś. Generator używa ich tylko dla poziomu średniozaawansowanego i zaawansowanego, dopóki ich nie zweryfikujesz. Ukryte ćwiczenia nie trafiają do generatora i nie są usuwane.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          <button type="button" className={`rounded-md px-3 py-1 ${!showHidden ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setShowHidden(false)}>Do weryfikacji</button>
          <button type="button" className={`rounded-md px-3 py-1 ${showHidden ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setShowHidden(true)}>Ukryte</button>
        </div>
        <Select value={level} onValueChange={setLevel}><SelectTrigger className="w-[190px]" aria-label="Poziom"><SelectValue placeholder="Poziom" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Wszystkie poziomy</SelectItem>{DIFFICULTY_LEVEL_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
        <Select value={pattern} onValueChange={setPattern}><SelectTrigger className="w-[210px]" aria-label="Wzorzec ruchu"><SelectValue placeholder="Wzorzec" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Wszystkie wzorce</SelectItem>{MOVEMENT_PATTERN_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
        <Select value={equipment} onValueChange={setEquipment}><SelectTrigger className="w-[190px]" aria-label="Sprzęt"><SelectValue placeholder="Sprzęt" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Cały sprzęt</SelectItem>{EQUIPMENT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
        <span className="text-sm text-muted-foreground" data-testid="review-count">{isLoading ? "Ładowanie…" : `${data.length} ćwiczeń`}</span>
      </div>

      <ul className="space-y-3">
        {data.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4" data-testid="review-row">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {r.parentName ? <>Odmiana: <b className="text-foreground">{r.parentName}</b>{r.variantGrip ? ` · chwyt: ${r.variantGrip}` : ""}{r.variantPosition ? ` · ${r.variantPosition}` : ""}{r.unilateral ? " · jednostronne" : ""} · </> : null}
                  {r.difficultyLevel ?? "poziom?"} · {r.equipment.join(", ") || "bez sprzętu"} · {r.movementPattern ?? "wzorzec?"}
                </p>
                <p className="text-sm text-muted-foreground">Stawy: {r.jointStressAreas.length ? r.jointStressAreas.join(", ") : "brak oznaczeń"}{r.intensity ? ` · intensywność: ${r.intensity}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {r.suitableForNoActivity && <Badge variant="outline">Dla braku aktywności</Badge>}
                {r.canAct ? (
                  <>
                    {!showHidden && <Button size="sm" onClick={() => verify.mutate(r.id)} disabled={verify.isPending}><CheckCircle size={14} className="mr-1" /> Zweryfikuj</Button>}
                    {!showHidden && !r.suitableForNoActivity && <Button size="sm" variant="outline" onClick={() => setConfirmNoActivity(r)}>Dla braku aktywności…</Button>}
                    <Button size="sm" variant="outline" onClick={() => hide.mutate({ id: r.id, hidden: !showHidden })} disabled={hide.isPending}>{showHidden ? <><Eye size={14} className="mr-1" /> Przywróć</> : <><EyeOff size={14} className="mr-1" /> Ukryj</>}</Button>
                  </>
                ) : <span className="text-xs text-muted-foreground">Tylko administrator katalogu może zmienić to ćwiczenie.</span>}
              </div>
            </div>
            {r.description && <p className="mt-2 text-sm">{r.description}</p>}
          </li>
        ))}
        {!isLoading && data.length === 0 && <li className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">{showHidden ? "Brak ukrytych ćwiczeń." : "Wszystko zweryfikowane — nic do sprawdzenia."}</li>}
      </ul>

      <AlertDialog open={!!confirmNoActivity} onOpenChange={(o) => { if (!o) setConfirmNoActivity(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dostępne dla braku aktywności?</AlertDialogTitle>
            <AlertDialogDescription>„{confirmNoActivity?.name}” będzie mogło trafiać do planów osób na poziomie „Brak aktywności fizycznej”. Zaznacz to tylko wtedy, gdy ćwiczenie jest naprawdę proste i bezpieczne dla takiej osoby. Ćwiczenie zostanie też oznaczone jako zweryfikowane.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Anuluj</AlertDialogCancel><AlertDialogAction onClick={() => confirmNoActivity && noActivity.mutate({ id: confirmNoActivity.id, verifyFirst: !confirmNoActivity.reviewedByTrainer })}>Tak, zaznacz</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
