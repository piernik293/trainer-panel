import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface AdminError { id: number; source: "api" | "panel" | "portal"; place: string; message: string; occurrences: number; users: number; status: "new" | "reviewed"; firstSeen: string; lastSeen: string }
export interface AdminTrainer { id: number; name: string | null; email: string | null; planCode: "FREE" | "PRO" | "UNLIMITED"; clients: number; lastActivity: string | null; createdAt: string; blocked: boolean; isAdmin: boolean }
export interface AdminUsage { trainerId: number; name: string | null; email: string | null; planCode: string; limits: Limits; used: Limits }
export interface Limits { clients: number | null; customExercises: number | null; planGenerations: number | null }
export interface AccessEntry { id: number; at: string; action: string; clientId: number | null; reason: string; admin: string }

/** Bez react-query (menu konta działa też poza dostawcą zapytań). Błąd lub brak odpowiedzi = nie administrator. */
export function useIsAdmin(): { data: { isAdmin: boolean } | undefined; isLoading: boolean } {
  const [state, setState] = useState<{ data: { isAdmin: boolean } | undefined; isLoading: boolean }>({ data: undefined, isLoading: true });
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => customFetch<{ isAdmin: boolean }>("/api/admin/me"))
      .then((d) => { if (!cancelled) setState({ data: d, isLoading: false }); })
      .catch(() => { if (!cancelled) setState({ data: { isAdmin: false }, isLoading: false }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}
export const useAdminErrors = (status: "new" | "reviewed" | "all") =>
  useQuery<{ errors: AdminError[] }>({ queryKey: ["admin-errors", status], queryFn: () => customFetch(`/api/admin/errors${status === "all" ? "" : `?status=${status}`}`) });
export const useAdminTrainers = () => useQuery<{ trainers: AdminTrainer[]; howToAddTrainer: string }>({ queryKey: ["admin-trainers"], queryFn: () => customFetch("/api/admin/trainers") });
export const useAdminSolo = () => useQuery<{ total: number; accounts: { id: number; firstName: string; createdAt: string }[] }>({ queryKey: ["admin-solo"], queryFn: () => customFetch("/api/admin/solo") });
export const useAdminSubscriptions = () => useQuery<{ plans: { code: string; name: string; monthlyPricePln: number | null; limits: Limits }[]; usage: AdminUsage[] }>({ queryKey: ["admin-subs"], queryFn: () => customFetch("/api/admin/subscriptions") });
export const useAccessLog = () => useQuery<{ entries: AccessEntry[] }>({ queryKey: ["admin-access-log"], queryFn: () => customFetch("/api/admin/access-log") });

export function useAdminAction() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries();
  return {
    review: useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/errors/${id}/reviewed`, { method: "POST" }), onSuccess: done }),
    setPlan: useMutation({ mutationFn: (v: { id: number; planCode: string }) => customFetch(`/api/admin/trainers/${v.id}/plan`, { method: "PATCH", body: JSON.stringify({ planCode: v.planCode }) }), onSuccess: done }),
    block: useMutation({ mutationFn: (v: { id: number; blocked: boolean }) => customFetch(`/api/admin/trainers/${v.id}/block`, { method: "POST", body: JSON.stringify({ blocked: v.blocked, confirm: true }) }), onSuccess: done }),
    access: useMutation({ mutationFn: (v: { clientId: number; reason: string }) => customFetch<Record<string, unknown>>("/api/admin/access/client", { method: "POST", body: JSON.stringify(v) }), onSuccess: done }),
  };
}

export const BLOCK_CONFIRM = "Zablokować to konto? Trener nie zaloguje się do panelu, dopóki go nie odblokujesz.";
export const SOURCE_LABEL: Record<AdminError["source"], string> = { api: "Serwer", panel: "Panel", portal: "Portal" };

export interface TrainerApplication { id: number; name: string | null; email: string | null; note: string | null; status: "pending" | "accepted" | "rejected"; createdAt: string; decidedAt: string | null }
export const useTrainerApplications = () => useQuery<{ applications: TrainerApplication[] }>({ queryKey: ["admin-applications"], queryFn: () => customFetch("/api/admin/trainer-applications") });
export const useAutoAccept = () => useQuery<{ autoAccept: boolean }>({ queryKey: ["admin-settings"], queryFn: () => customFetch("/api/admin/settings") });
export function useApplicationActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries();
  return {
    decide: useMutation({ mutationFn: (v: { id: number; accept: boolean }) => customFetch(`/api/admin/trainer-applications/${v.id}/${v.accept ? "accept" : "reject"}`, { method: "POST" }), onSuccess: done }),
    setAutoAccept: useMutation({ mutationFn: (autoAccept: boolean) => customFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ autoAccept }) }), onSuccess: done }),
  };
}
export const AUTO_ACCEPT_CONFIRM = "Włączyć automatyczne przyjmowanie? Każdy, kto złoży wniosek, od razu dostanie konto trenera.";

/** Czy konto ma też własny trening (do linku „Mój trening” w menu). Bez react-query, błąd = false. */
export function useHasOwnTraining(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => customFetch<{ isClient: boolean }>("/api/account/roles")).then((r) => { if (!cancelled) setHas(!!r?.isClient); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return has;
}
