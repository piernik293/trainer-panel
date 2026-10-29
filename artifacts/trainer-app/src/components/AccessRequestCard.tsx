/** Konto bez dostępu trenera: przycisk „Poproś o dostęp trenera” → krótki wniosek (istniejące POST /api/trainer-applications). */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS_SENT_TEXT, accessView, type AccessRoles } from "@/lib/accessRequest";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AccessRequestCard() {
  const [roles, setRoles] = useState<AccessRoles | null>(null);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/account/roles`, { credentials: "include" }).then((r) => (r.ok ? (r.json() as Promise<AccessRoles>) : null)).then(setRoles).catch(() => setRoles(null));
  }, []);

  useEffect(() => {
    fetch(`${BASE}/api/contact`).then((r) => (r.ok ? r.json() : null)).then((b: { email?: string | null } | null) => setContact(b?.email ?? null)).catch(() => setContact(null));
  }, []);

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${BASE}/api/trainer-applications`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note.trim() || undefined }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.ok || body.code === "PENDING") setSent(true);
      else setMsg(body.error ?? "Nie udało się wysłać wniosku. Spróbuj ponownie.");
    } catch { setMsg("Nie udało się wysłać wniosku. Spróbuj ponownie."); }
    finally { setBusy(false); }
  };

  const view = accessView(roles, sent);
  const contactLine = contact ? <p className="text-sm text-muted-foreground">Pytania? Napisz: <a className="underline" href={`mailto:${contact}`}>{contact}</a></p> : null;
  if (view === "sent") return <div className="space-y-1"><p className="text-sm font-medium" role="status" data-testid="access-sent">{ACCESS_SENT_TEXT}</p>{contactLine}</div>;
  if (view === "rejected_wait") return <p className="text-sm text-muted-foreground">Poprzedni wniosek nie został przyjęty. Nowy możesz wysłać za kilka dni.</p>;
  return open ? (
    <div className="space-y-2 text-left">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Kilka słów o Tobie (opcjonalnie)" aria-label="Kilka słów o Tobie" />
      {msg && <p className="text-sm text-destructive" role="alert">{msg}</p>}
      <Button onClick={send} disabled={busy}>{busy ? "Wysyłanie…" : "Wyślij wniosek"}</Button>
    </div>
  ) : (
    <div className="space-y-2"><Button onClick={() => setOpen(true)}>Poproś o dostęp trenera</Button>{contactLine}</div>
  );
}
