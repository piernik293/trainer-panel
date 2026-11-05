/** „Pobierz moje dane” (Regulamin §14) w Ustawieniach trenera; widoczne tylko przy włączonej fladze TERMS_ENABLED. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MyDataCard() {
  const status = useQuery<{ enabled: boolean }>({ queryKey: ["terms-status"], queryFn: () => customFetch("/api/terms/status"), staleTime: 300_000, retry: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (status.data?.enabled !== true) return null;
  const download = async () => {
    setBusy(true); setMsg(null);
    try {
      const blob = await customFetch<Blob>("/api/me/export", { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "optimatren-moje-dane.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setMsg(String((e as { status?: number })?.status) === "429" ? "Dane można pobrać 3 razy na dobę. Spróbuj jutro." : "Nie udało się pobrać danych. Spróbuj ponownie.");
    } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Moje dane</CardTitle>
        <CardDescription>Pobierz plik z danymi swojego konta (profil, własne ćwiczenia, szablony). Dane podopiecznych nie wchodzą do tego pliku — każdy pobiera własne.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button variant="outline" onClick={() => void download()} disabled={busy} data-testid="download-my-data">{busy ? "Przygotowuję…" : "Pobierz moje dane"}</Button>
        {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
