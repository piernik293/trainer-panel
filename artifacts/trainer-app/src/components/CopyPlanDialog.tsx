/** „Kopiuj plan”: do innego podopiecznego (szkic, z filtrami jego wywiadu) albo do szablonu — jedno okno, dwa kliknięcia. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { customFetch, useListClients } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";

export function CopyPlanDialog({ planId, fromClientId, open, onOpenChange }: { planId: number; fromClientId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: clients } = useListClients({ query: { enabled: open } } as never);
  const [busy, setBusy] = useState(false);
  const [joint, setJoint] = useState<{ clientId: number; message: string } | null>(null);
  const others = ((clients as unknown as Array<{ id: number; firstName: string; lastName: string }> | undefined) ?? []).filter((c) => c.id !== fromClientId);

  const run = async (body: Record<string, unknown>, doneMsg: string) => {
    setBusy(true);
    try {
      const out = await customFetch<{ planId?: number; templateId?: number }>(`/api/plans/${planId}/copy`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: doneMsg }); setJoint(null); onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["/api/plan-templates"] });
      if (out.planId) setLocation(`/plans/${out.planId}`);
    } catch (e) {
      const err = e as { status?: number; data?: { code?: string; error?: string } };
      if (err.status === 409 && err.data?.code === "EXERCISE_LOADS_REPORTED_JOINT" && typeof body["clientId"] === "number") setJoint({ clientId: body["clientId"], message: err.data.error ?? "" });
      else toast({ title: humanizeError(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Kopiuj plan</DialogTitle></DialogHeader>
        {joint ? (
          <div className="space-y-3" role="alert" data-testid="copy-joint-warning">
            <p className="text-sm">Ten plan zawiera ćwiczenia obciążające staw zgłoszony przez tego podopiecznego. {joint.message}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setJoint(null)}>Wróć</Button>
              <Button disabled={busy} onClick={() => void run({ target: "client", clientId: joint.clientId, acknowledgeJointWarning: true }, "Plan skopiowany jako szkic")}>Kopiuj mimo to</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Do podopiecznego (jako szkic)</p>
              <ul className="max-h-56 space-y-1 overflow-auto" data-testid="copy-targets">
                {others.length === 0 && <li className="text-sm text-muted-foreground">Nie masz innych podopiecznych.</li>}
                {others.map((c) => (
                  <li key={c.id}><Button variant="outline" className="h-11 w-full justify-start" disabled={busy} onClick={() => void run({ target: "client", clientId: c.id }, "Plan skopiowany jako szkic")}>{c.firstName} {c.lastName}</Button></li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Sprzęt i zgłoszone stawy nowego podopiecznego są sprawdzane tak jak przy ręcznym dodaniu.</p>
            </div>
            <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => void run({ target: "template" }, "Zapisano jako szablon")} data-testid="copy-to-template">Zapisz jako szablon</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
