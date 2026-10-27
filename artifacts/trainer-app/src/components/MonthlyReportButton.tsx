/** "Raport PDF" in the client profile (block 10): month, optional note, optional pain details / trainer name → downloads the PDF. */
import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";
import { humanizeError } from "@/lib/userError";

/** The month before `now` as YYYY-MM (the report is usually made right after the month ends). */
export function previousMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyReportButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(previousMonth());
  const [note, setNote] = useState("");
  const [pain, setPain] = useState(false);
  const [trainer, setTrainer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      const blob = await customFetch<Blob>(`/api/clients/${clientId}/monthly-report`, {
        method: "POST", headers: { "Content-Type": "application/json" }, responseType: "blob",
        body: JSON.stringify({ month, ...(note.trim() ? { note: note.trim() } : {}), includePainDetails: pain, includeTrainerName: trainer }),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `raport-${month}-${clientName.replace(/\s+/g, "-")}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setOpen(false);
    } catch (e) { setError(humanizeError(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1.5" data-testid="report-open"><FileText size={14} />Raport PDF</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raport miesięczny — {clientName}</DialogTitle>
          <DialogDescription>Frekwencja, treningi, rekordy, objętość, kroki i liczba zgłoszeń bólu. Raport jest dla Ciebie, nie dla podopiecznego.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span>Miesiąc</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2" aria-label="Miesiąc raportu" /></label>
          <label className="block space-y-1"><span>Notatka trenera (opcjonalnie, do 1200 znaków)</span><Textarea value={note} maxLength={1200} onChange={(e) => setNote(e.target.value)} aria-label="Notatka trenera" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Dołącz szczegóły zgłoszeń bólu (obszar, siła, opis)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={trainer} onChange={(e) => setTrainer(e.target.checked)} /> Dopisz moje imię i nazwisko jako trenera</label>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <Button onClick={() => void download()} disabled={busy || !/^\d{4}-\d{2}$/.test(month)} data-testid="report-download">{busy ? "Tworzę raport…" : "Pobierz PDF"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
