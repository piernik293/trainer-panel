/**
 * Session package of a client (block 7): "zostało X z Y", mark a held session, undo, reminders, visibility for the client.
 * No online payments. The price is optional and stays with the trainer.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Ticket } from "lucide-react";
import { humanizeError } from "@/lib/userError";

export interface PackageReminder { code: string; text: string }
export interface PackageView {
  id: number; title: string; totalSessions: number; usedSessions: number; remaining: number; pricePln: string | null;
  validUntil: string | null; showToClient: boolean; status: string; reminders: PackageReminder[];
}
interface PackagesResponse { packages: PackageView[]; activeSessions: { id: number; heldOn: string; note: string | null }[] }
const key = (clientId: number) => ["client-packages", clientId] as const;
const json = { "Content-Type": "application/json" };

export function PackageCard({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ total: "10", price: "", validUntil: "", show: false });
  const { data } = useQuery<PackagesResponse>({
    queryKey: key(clientId),
    queryFn: ({ signal }) => customFetch<PackagesResponse>(`/api/clients/${clientId}/packages`, { signal }),
    enabled: Number.isFinite(clientId) && clientId > 0,
  });
  const refresh = () => { setError(null); void qc.invalidateQueries({ queryKey: key(clientId) }); };
  const fail = (e: unknown) => setError(humanizeError(e));
  const create = useMutation({
    mutationFn: () => customFetch(`/api/clients/${clientId}/packages`, {
      method: "POST", headers: json,
      body: JSON.stringify({ totalSessions: Number(form.total), ...(form.price.trim() ? { pricePln: Number(form.price.replace(",", ".")) } : {}), ...(form.validUntil ? { validUntil: form.validUntil } : {}), showToClient: form.show }),
    }),
    onSuccess: refresh, onError: fail,
  });
  const mark = useMutation({ mutationFn: (id: number) => customFetch(`/api/packages/${id}/sessions`, { method: "POST", headers: json, body: "{}" }), onSuccess: refresh, onError: fail });
  const undo = useMutation({ mutationFn: (v: { id: number; sessionId: number }) => customFetch(`/api/packages/${v.id}/sessions/${v.sessionId}`, { method: "DELETE" }), onSuccess: refresh, onError: fail });
  const patch = useMutation({ mutationFn: (v: { id: number; body: Record<string, unknown> }) => customFetch(`/api/packages/${v.id}`, { method: "PATCH", headers: json, body: JSON.stringify(v.body) }), onSuccess: refresh, onError: fail });
  if (!data) return null;

  const active = data.packages.find((p) => p.status === "active");
  return (
    <Card className="border-border/50" data-testid="package-card">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Ticket className="h-4 w-4" aria-hidden /> Pakiet sesji</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {active ? (
          <>
            <p className="text-lg font-semibold" data-testid="package-remaining">Zostało {active.remaining} z {active.totalSessions}</p>
            <p className="text-muted-foreground">{active.title}{active.validUntil ? ` · ważny do ${new Date(active.validUntil + "T00:00:00").toLocaleDateString("pl-PL")}` : ""}{active.pricePln ? ` · ${Number(active.pricePln).toLocaleString("pl-PL")} zł` : ""}</p>
            {active.reminders.map((r) => <p key={r.code} className="rounded-md border border-border bg-muted px-3 py-1.5" role="status">{r.text}</p>)}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={active.remaining === 0 || mark.isPending} onClick={() => mark.mutate(active.id)} data-testid="package-mark">Odhacz sesję</Button>
              <Button size="sm" variant="outline" onClick={() => { if (window.confirm("Zamknąć pakiet? Podopieczny przestanie go widzieć.")) patch.mutate({ id: active.id, body: { status: "closed" } }); }}>Zamknij pakiet</Button>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span>Pokaż podopiecznemu „zostało X sesji”</span>
              <Switch checked={active.showToClient} onCheckedChange={(v) => patch.mutate({ id: active.id, body: { showToClient: v } })} aria-label="Pokaż podopiecznemu liczbę pozostałych sesji" />
            </label>
            {data.activeSessions.length > 0 && (
              <ul className="space-y-1" aria-label="Odbyte sesje">
                {data.activeSessions.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span>{new Date(s.heldOn + "T00:00:00").toLocaleDateString("pl-PL")}{s.note ? ` — ${s.note}` : ""}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => undo.mutate({ id: active.id, sessionId: s.id })}>Cofnij</Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <p className="text-muted-foreground">Brak aktywnego pakietu. Dodaj pakiet, żeby liczyć sesje.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="space-y-1"><span className="text-xs">Liczba sesji</span><Input inputMode="numeric" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} aria-label="Liczba sesji" /></label>
              <label className="space-y-1"><span className="text-xs">Cena (zł, opcjonalnie)</span><Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} aria-label="Cena" /></label>
              <label className="space-y-1"><span className="text-xs">Ważny do (opcjonalnie)</span><Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} aria-label="Ważny do" /></label>
            </div>
            <label className="flex items-center gap-2"><Switch checked={form.show} onCheckedChange={(v) => setForm({ ...form, show: v })} aria-label="Pokaż podopiecznemu" /><span>Pokaż podopiecznemu „zostało X sesji”</span></label>
            <Button type="submit" size="sm" disabled={create.isPending}>Dodaj pakiet</Button>
          </form>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
