/**
 * "Zamień na inne" in the plan editor: the server picks another exercise for the same slot (same pattern, all safety filters, never one
 * already in the plan). When there is no safe option the slot is emptied and the trainer is told to add one by hand.
 */
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { useSwapExercise } from "@/lib/planApi";

export const SWAP_CONFIRM_TEXT = "Znajdziemy inne ćwiczenie na to miejsce. Jeśli nie ma innej bezpiecznej opcji, miejsce zostanie puste i dodasz ćwiczenie ręcznie. Kontynuować?";

export function SwapExerciseButton({ planId, planExerciseId, readOnly }: { planId: number; planExerciseId: number; readOnly?: boolean }) {
  const { toast } = useToast();
  const swap = useSwapExercise(planId);
  if (readOnly) return null;
  return (
    <Button
      variant="ghost" size="sm" className="mt-1 h-6 px-2 text-xs text-muted-foreground" disabled={swap.isPending} data-testid="swap-exercise"
      onClick={() => {
        if (!window.confirm(SWAP_CONFIRM_TEXT)) return;
        swap.mutate({ planExerciseId }, {
          onSuccess: (res) => toast({ title: res.message, variant: res.outcome === "removed" ? "destructive" : undefined }),
          onError: (err) => toast({ title: humanizeError(err), variant: "destructive" }),
        });
      }}
    >Zamień na inne</Button>
  );
}
