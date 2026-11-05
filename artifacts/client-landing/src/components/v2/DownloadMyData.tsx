/** „Pobierz moje dane” (Regulamin §14): widoczne tylko przy włączonej fladze TERMS_ENABLED; plik JSON z danymi konta. */
import { useEffect, useState } from "react";

export function DownloadMyData() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/terms/status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((b: { enabled?: boolean } | null) => { if (alive && b?.enabled === true) setOn(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!on) return null;
  const download = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/me/export", { credentials: "include" });
      if (r.status === 429) { setMsg("Dane można pobrać 3 razy na dobę. Spróbuj jutro."); return; }
      if (!r.ok) { setMsg("Nie udało się pobrać danych. Spróbuj ponownie."); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "optimatren-moje-dane.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { setMsg("Brak połączenia. Spróbuj ponownie."); } finally { setBusy(false); }
  };
  return (
    <div>
      <button type="button" onClick={() => void download()} disabled={busy} className="flex min-h-11 items-center gap-2 font-semibold" data-testid="download-my-data">{busy ? "Przygotowuję…" : "Pobierz moje dane"}</button>
      {msg && <p role="status" className="text-xs">{msg}</p>}
    </div>
  );
}
