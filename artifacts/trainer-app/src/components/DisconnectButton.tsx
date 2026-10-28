/** „Odłącz” podopiecznego z kontem (blok 2): trener traci dostęp do danych, historia zostaje u podopiecznego, podopieczny dostaje wiadomość. */
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import { DISCONNECT_CONFIRM, useDisconnectClient } from "@/lib/joinApi";

export function DisconnectButton({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const disconnect = useDisconnectClient(clientId);
  const queryClient = useQueryClient();
  return (
    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={disconnect.isPending} data-testid="disconnect-client"
      onClick={async () => {
        if (!window.confirm(DISCONNECT_CONFIRM)) return;
        try {
          await disconnect.mutateAsync();
          toast({ title: "Odłączono podopiecznego" });
          navigate("/clients"); // najpierw lista, potem odświeżenie — strona odłączonego klienta zwraca już 404
          await queryClient.invalidateQueries();
        } catch (e) {
          toast({ title: humanizeError(e), variant: "destructive" });
        }
      }}>Odłącz</Button>
  );
}
