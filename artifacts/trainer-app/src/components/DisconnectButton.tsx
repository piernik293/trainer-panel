/** „Odłącz” podopiecznego z kontem (blok 2): trener traci dostęp do danych, historia zostaje u podopiecznego, podopieczny dostaje wiadomość. */
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { DISCONNECT_CONFIRM, useDisconnectClient } from "@/lib/joinApi";

export function DisconnectButton({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const disconnect = useDisconnectClient(clientId);
  return (
    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={disconnect.isPending} data-testid="disconnect-client"
      onClick={() => {
        if (!window.confirm(DISCONNECT_CONFIRM)) return;
        disconnect.mutate(undefined, {
          onSuccess: () => { toast({ title: "Odłączono podopiecznego" }); navigate("/clients"); },
          onError: (e) => toast({ title: humanizeError(e), variant: "destructive" }),
        });
      }}>Odłącz</Button>
  );
}
