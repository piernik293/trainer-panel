/**
 * „Zgłoś uwagę” w koncie klienta (blok 4). Widoczne tylko, gdy serwer ma włączoną flagę FEEDBACK_ENABLED.
 * Wysyłamy: rodzaj, treść (do 1000 znaków), ścieżkę strony. Bez zrzutu ekranu.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const FEEDBACK_MAX = 1000;
export const FEEDBACK_KINDS = [
  { id: "blad", label: "Błąd" },
  { id: "pomysl", label: "Pomysł" },
  { id: "niejasne", label: "Niejasne" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

/** Czysta funkcja: czy można wysłać. */
export function canSendFeedback(kind: FeedbackKind | null, text: string, busy: boolean): boolean {
  return !busy && kind !== null && text.trim().length > 0 && text.length <= FEEDBACK_MAX;
}

export function FeedbackCard() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/feedback/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : { enabled: false })).then((b: { enabled?: boolean }) => setEnabled(!!b.enabled)).catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: kind, message: text, page: window.location.pathname, source: "portal" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: typeof body.error === "string" ? body.error : "Nie udało się wysłać. Spróbuj ponownie." });
      else { setMsg({ ok: true, text: "Dziękujemy! Uwaga została wysłana." }); setText(""); setKind(null); setOpen(false); }
    } catch { setMsg({ ok: false, text: "Nie udało się wysłać. Spróbuj ponownie." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid="feedback-card">
      <p className="text-sm font-medium">Zgłoś uwagę</p>
      {msg?.ok && <p className="text-sm text-muted-foreground" role="status">{msg.text}</p>}
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => { setOpen(true); setMsg(null); }}>Napisz do nas</Button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rodzaj uwagi">
            {FEEDBACK_KINDS.map((k) => (
              <Button key={k.id} type="button" size="sm" role="radio" aria-checked={kind === k.id} variant={kind === k.id ? "default" : "outline"} onClick={() => setKind(k.id)}>{k.label}</Button>
            ))}
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={FEEDBACK_MAX} placeholder="Co się stało albo co warto zmienić?" aria-label="Treść uwagi" />
          <p className="text-xs text-muted-foreground">{text.length}/{FEEDBACK_MAX}. Nie wpisuj danych zdrowotnych ani haseł.</p>
          {msg && !msg.ok && <p className="text-sm text-destructive" role="alert">{msg.text}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={send} disabled={!canSendFeedback(kind, text, busy)}>{busy ? "Wysyłanie…" : "Wyślij"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
          </div>
        </>
      )}
    </div>
  );
}
