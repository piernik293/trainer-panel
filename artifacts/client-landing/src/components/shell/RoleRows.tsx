/**
 * Dyskretne wiersze rang w „Ty” (zwykłe wiersze listy ustawień — bez kart, kolorowych przycisków i okien):
 *  „Mój trener — Wpisz kod trenera ›” i „Prowadzę podopiecznych ›”. Wiersz rozwija się w miejscu. Nie pojawiają się na „Dziś”.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { joinPathFromCode } from "@/components/AccountNotice";

export const APPLICATION_SENT_TEXT = "Wniosek wysłany — odpowiemy zwykle w ciągu 24 godzin";

function Row({ label, value, open, onToggle, children, testId }: { label: string; value: string; open: boolean; onToggle?: () => void; children?: ReactNode; testId: string }) {
  const Tag = onToggle ? "button" : "div";
  return (
    <div className="border-b border-border last:border-b-0" data-testid={testId}>
      <Tag {...(onToggle ? { type: "button" as const, onClick: onToggle, "aria-expanded": open } : {})} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">{value}{onToggle && <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} aria-hidden />}</span>
      </Tag>
      {open && <div className="pb-3 text-sm">{children}</div>}
    </div>
  );
}

/** Czysta funkcja: tekst przy wierszu „Prowadzę podopiecznych” wg stanu wniosku. */
export function applicationValue(r: { isTrainer: boolean; application: { status: string; canApply: boolean } | null } | null): string {
  if (!r) return "";
  if (r.isTrainer) return "Masz dostęp trenera";
  if (r.application?.status === "pending") return APPLICATION_SENT_TEXT;
  if (r.application?.status === "rejected" && !r.application.canApply) return "Wniosek nieprzyjęty — ponownie po 14 dniach";
  return "";
}

export function RoleRows({ trainerName, pendingTrainerName, onJoin, part, bare }: {
  trainerName: string | null; pendingTrainerName?: string | null; onJoin: (path: string) => void;
  /** new look: show only one of the two rows ("Mój trener" in the list, "Prowadzę podopiecznych" at the bottom) */
  part?: "trainer" | "apply";
  /** without the card frame (the caller provides it) */
  bare?: boolean;
}) {
  const [open, setOpen] = useState<"trainer" | "apply" | null>(null);
  const [code, setCode] = useState("");
  const [roles, setRoles] = useState<{ isTrainer: boolean; application: { status: string; canApply: boolean } | null } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const loadRoles = () => fetch("/api/account/roles", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then(setRoles).catch(() => setRoles(null));
  useEffect(() => { void loadRoles(); }, []);
  const path = joinPathFromCode(code);
  const value = applicationValue(roles);
  const canApply = !!roles && !roles.isTrainer && !(roles.application?.status === "pending") && !(roles.application?.status === "rejected" && !roles.application.canApply);
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/trainer-applications", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note.trim() || undefined }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok && b.code !== "PENDING") setMsg(typeof b.error === "string" ? b.error : "Nie udało się wysłać wniosku.");
      else { setOpen(null); await loadRoles(); }
    } catch { setMsg("Nie udało się wysłać wniosku. Spróbuj ponownie."); } finally { setBusy(false); }
  };
  const link = "min-h-11 font-semibold text-primary underline underline-offset-4 disabled:opacity-40 disabled:no-underline";
  return (
    <section aria-label="Konto" className={bare ? "" : "rounded-lg border border-border bg-card px-4"} data-testid="role-rows">
      {part === "apply" ? null : trainerName ? (
        <Row testId="row-trainer" label="Mój trener" value={trainerName} open={false} />
      ) : pendingTrainerName ? (
        <Row testId="row-trainer" label="Mój trener" value={`Prośba do: ${pendingTrainerName} — czeka na akceptację`} open={false} />
      ) : (
        <Row testId="row-trainer" label="Mój trener" value="Wpisz kod trenera" open={open === "trainer"} onToggle={() => setOpen(open === "trainer" ? null : "trainer")}>
          <div className="flex items-center gap-3">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod trenera" aria-label="Kod trenera" maxLength={14} className="h-11 flex-1 rounded-md border border-input bg-transparent px-3" />
            <button type="button" className={link} disabled={!path} onClick={() => { if (path) onJoin(path); }}>Dalej</button>
          </div>
        </Row>
      )}
      {roles && part !== "trainer" && (value && !canApply ? (
        <Row testId="row-apply" label="Prowadzę podopiecznych" value={value} open={false} />
      ) : roles.isTrainer ? null : (
        <Row testId="row-apply" label="Prowadzę podopiecznych" value="" open={open === "apply"} onToggle={() => setOpen(open === "apply" ? null : "apply")}>
          <div className="space-y-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Kilka słów o Tobie (opcjonalnie)" aria-label="Kilka słów o Tobie" className="min-h-20 w-full rounded-md border border-input bg-transparent p-3" />
            {msg && <p className="text-destructive" role="alert">{msg}</p>}
            <button type="button" className={link} disabled={busy} onClick={() => void send()}>{busy ? "Wysyłanie…" : "Wyślij wniosek"}</button>
          </div>
        </Row>
      ))}
    </section>
  );
}
