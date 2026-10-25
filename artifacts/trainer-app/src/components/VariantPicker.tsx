/**
 * Variants of an exercise in the plan editor (blok 3): a collapsible list with each variant's equipment.
 * Swapping keeps the prescription and is recorded in the plan history.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { useExerciseVariants, useReplaceWithVariant } from "@/lib/planApi";

export function VariantPicker({ planId, planExerciseId, exerciseId, readOnly }: { planId: number; planExerciseId: number; exerciseId: number; readOnly?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useExerciseVariants(exerciseId, true);
  const replace = useReplaceWithVariant(planId);
  if (!isLoading && data.length === 0) return null;
  return (
    <div className="mt-1" data-testid="variant-picker">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground" aria-expanded={open}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>Odmiany{data.length ? ` (${data.length})` : ""}</span>
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {data.map((v) => (
            <li key={v.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1">
                <span className="text-foreground">{v.name}</span>
                <span className="text-muted-foreground"> · {v.equipment.join(", ") || "bez sprzętu"}{v.unilateral ? " · jednostronne" : ""}{v.reviewedByTrainer ? "" : " · niezweryfikowane"}</span>
              </span>
              {!readOnly && (
                <Button
                  variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={replace.isPending}
                  onClick={() => replace.mutate({ planExerciseId, exerciseId: v.id }, {
                    onSuccess: () => toast({ title: `Zamieniono na: ${v.name}` }),
                    onError: (err) => toast({ title: humanizeError(err), variant: "destructive" }),
                  })}
                >Zamień</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
