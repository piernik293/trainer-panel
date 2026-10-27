/**
 * „Prowadzę podopiecznych” w koncie osoby (blok 6): wniosek o konto trenera i prosty przełącznik
 * [Mój trening] / [Podopieczni] dla osoby, która ma obie role. Zwykły klient nie widzi niczego poza krótkim formularzem.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface Roles { isTrainer: boolean; isClient: boolean; application: { status: "pending" | "accepted" | "rejected"; canApply: boolean; applyAgainFrom: string | null } | null }

/** Czysta funkcja: co pokazać w sekcji wniosku. */
export function applyView(r: Roles | null): "none" | "form" | "pending" | "rejected_wait" | "switch" {
  if (!r) return "none";
  if (r.isTrainer) return "switch";
  if (r.application?.status === "pending") return "pending";
  if (r.application?.status === "rejected" && !r.application.canApply) return "rejected_wait";
  return "form";
}

export function TrainerApplyCard() {
  const [roles, setRoles] = useState<Roles | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/account/roles", { credentials: "include" }).then((r) => (r.ok ? (r.json() as Promise<Roles>) : null)).then(setRoles).catch(() => setRoles(null));
  useEffect(() => { void load(); }, []);

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/trainer-applications", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note.trim() || undefined }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(typeof body.error === "string" ? body.error : "Nie udało się wysłać wniosku.");
      else { setOpen(false); await load(); }
    } catch { setMsg("Nie udało się wysłać wniosku. Spróbuj ponownie."); }
    finally { setBusy(false); }
  };

  const view = applyView(roles);
  if (view === "none") return null;
  if (view === "switch") {
    return (
      <div className="flex gap-2" data-testid="role-switch">
        <Button size="sm" variant="default" disabled>Mój trening</Button>
        <Button size="sm" variant="outline" onClick={() => window.location.assign("/")}>Podopieczni</Button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid="trainer-apply">
      <p className="text-sm font-medium">Prowadzę podopiecznych</p>
      {view === "pending" && <p className="text-sm text-muted-foreground">Wniosek wysłany. Czeka na rozpatrzenie.</p>}
      {view === "rejected_wait" && <p className="text-sm text-muted-foreground">Poprzedni wniosek został odrzucony. Nowy możesz złożyć po 14 dniach{roles?.application?.applyAgainFrom ? ` (od ${new Date(roles.application.applyAgainFrom).toLocaleDateString("pl-PL")})` : ""}.</p>}
      {view === "form" && (open ? (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kilka słów o Tobie (opcjonalnie)" maxLength={500} aria-label="Kilka słów o Tobie" />
          {msg && <p className="text-sm text-destructive" role="alert">{msg}</p>}
          <Button size="sm" onClick={send} disabled={busy}>{busy ? "Wysyłanie…" : "Wyślij wniosek"}</Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Złóż wniosek o konto trenera</Button>
      ))}
    </div>
  );
}
