/**
 * „Zgłoś uwagę” w ustawieniach panelu (blok 4). Widoczne tylko, gdy serwer ma włączoną flagę FEEDBACK_ENABLED.
 * Wysyłamy: rodzaj, treść (do 1000 znaków), ścieżkę strony. Bez zrzutu ekranu.
 */
import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeError } from "@/lib/userError";
import { FEEDBACK_KINDS, FEEDBACK_MAX, canSendFeedback, type FeedbackKind } from "@/lib/feedback";

export function FeedbackCard() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => customFetch<{ enabled: boolean }>("/api/feedback/status")).then((r) => { if (!cancelled) setEnabled(!!r?.enabled); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!enabled) return null;

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      await customFetch("/api/feedback", { method: "POST", body: JSON.stringify({ category: kind, message: text, page: window.location.pathname, source: "panel" }) });
      setMsg({ ok: true, text: "Dziękujemy! Uwaga została wysłana." }); setText(""); setKind(null); setOpen(false);
    } catch (err) {
      setMsg({ ok: false, text: humanizeError(err, "Nie udało się wysłać. Spróbuj ponownie.") });
    } finally { setBusy(false); }
  };

  return (
    <Card data-testid="feedback-card">
      <CardHeader>
        <CardTitle className="text-base">Zgłoś uwagę</CardTitle>
        <CardDescription>Coś nie działa albo masz pomysł? Napisz — czytamy każdą uwagę.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {msg?.ok && <p className="text-sm text-muted-foreground" role="status">{msg.text}</p>}
        {!open ? (
          <Button variant="outline" onClick={() => { setOpen(true); setMsg(null); }}>Napisz do nas</Button>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rodzaj uwagi">
              {FEEDBACK_KINDS.map((k) => (
                <Button key={k.id} type="button" size="sm" role="radio" aria-checked={kind === k.id} variant={kind === k.id ? "default" : "outline"} onClick={() => setKind(k.id)}>{k.label}</Button>
              ))}
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={FEEDBACK_MAX} placeholder="Co się stało albo co warto zmienić?" aria-label="Treść uwagi" />
            <p className="text-xs text-muted-foreground">{text.length}/{FEEDBACK_MAX}. Nie wpisuj danych zdrowotnych klientów ani haseł.</p>
            {msg && !msg.ok && <p className="text-sm text-destructive" role="alert">{msg.text}</p>}
            <div className="flex gap-2">
              <Button onClick={send} disabled={!canSendFeedback(kind, text, busy)}>{busy ? "Wysyłanie…" : "Wyślij"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
