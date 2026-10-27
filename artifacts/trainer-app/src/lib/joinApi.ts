import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface JoinInfo { code: string; link: string; requests: { id: number; firstName: string; createdAt: string }[] }
const key = ["trainer-join"] as const;

export function useJoinInfo() {
  return useQuery<JoinInfo>({ queryKey: key, queryFn: ({ signal }) => customFetch<JoinInfo>("/api/trainer/join", { signal }), refetchInterval: 60_000 });
}
export function useNewJoinCode() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => customFetch<{ code: string; link: string }>("/api/trainer/join/code", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
}
export function useDecideJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) => customFetch(`/api/trainer/join-requests/${id}/${accept ? "accept" : "reject"}`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["dashboard-summary"] }); },
  });
}
export function useDisconnectClient(clientId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => customFetch(`/api/clients/${clientId}/disconnect`, { method: "POST" }), onSuccess: () => qc.invalidateQueries() });
}

export const NEW_CODE_CONFIRM = "Nowy kod unieważni poprzedni link i kod. Kontynuować?";
export const DISCONNECT_CONFIRM = "Odłączyć tego podopiecznego? Stracisz dostęp do jego danych, a jego historia treningów zostanie u niego. Dostanie o tym wiadomość.";
