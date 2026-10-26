/**
 * Import of a plan from Excel / CSV (block 9): file → columns → exercises → save as the client's plan (draft) or as a template.
 * No AI. Matching with the catalogue is proposed, never silent: ambiguous names are left for the trainer.
 */
import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeError } from "@/lib/userError";
import {
  FIELD_KEYS, FIELD_LABELS, buildSavePayload, defaultChoice, readFileAsBase64, rowWarnings,
  type AnalyzedDay, type Choice, type Mapping,
} from "@/lib/planImportUi";

interface Preview { sheetNames: string[]; sheet: string; rows: string[][]; totalRows: number; mapping: Mapping; hasHeader: boolean }
const json = { "Content-Type": "application/json" };

export default function PlanImport() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const [, navigate] = useLocation();
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [hasHeader, setHasHeader] = useState(true);
  const [days, setDays] = useState<AnalyzedDay[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [title, setTitle] = useState("Plan z pliku");
  const [ack, setAck] = useState(false);
  const [needAck, setNeedAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(humanizeError(e)); return undefined; } finally { setBusy(false); }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    await run(async () => {
      const b64 = await readFileAsBase64(f);
      const p = await customFetch<Preview>(`/api/clients/${clientId}/plan-import/preview`, { method: "POST", headers: json, body: JSON.stringify({ fileName: f.name, contentBase64: b64 }) });
      setFile({ name: f.name, b64 }); setPreview(p); setMapping(p.mapping); setHasHeader(p.hasHeader); setDays(null);
    });
  }
  async function analyze() {
    if (!file) return;
    await run(async () => {
      const r = await customFetch<{ days: AnalyzedDay[] }>(`/api/clients/${clientId}/plan-import/analyze`, { method: "POST", headers: json, body: JSON.stringify({ fileName: file.name, contentBase64: file.b64, mapping, hasHeader }) });
      setDays(r.days); setChoices({});
    });
  }
  async function save(target: "plan" | "template") {
    if (!days) return;
    await run(async () => {
      try {
        const r = await customFetch<{ planId?: number; templateId?: number }>(`/api/clients/${clientId}/plan-import/save`, { method: "POST", headers: json, body: JSON.stringify(buildSavePayload(title, target, days, choices, ack)) });
        if (r.planId) navigate(`/plans/${r.planId}`); else navigate(`/clients/${clientId}`);
      } catch (e) {
        const msg = humanizeError(e);
        if (/EXERCISE_LOADS_REPORTED_JOINT/.test(JSON.stringify(e)) || /zgłosił ból/.test(msg)) setNeedAck(true);
        throw e;
      }
    });
  }
  async function downloadTemplate() {
    await run(async () => {
      const text = await customFetch<string>("/api/plan-import/template.csv", { responseType: "text" } as never);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = "szablon-planu.csv"; a.click();
    });
  }

  const warn = days ? rowWarnings(days, choices) : { joint: [], equipment: [] };
  const blocked = warn.equipment.length > 0;
  const colName = (i: number) => String.fromCharCode(65 + i);
  const colCount = Math.max(0, ...(preview?.rows.map((r) => r.length) ?? [0]));

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="plan-import">
      <div>
        <Link href={`/clients/${clientId}`} className="text-sm text-muted-foreground underline underline-offset-2">← Wróć do klienta</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import planu z pliku</h1>
        <p className="text-sm text-muted-foreground">Wgraj plik .xlsx lub .csv (do 2 MB). Zaproponujemy dopasowanie ćwiczeń — każdą pozycję możesz zmienić.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Plik</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Plik z planem" data-testid="plan-import-file" />
          <Button variant="ghost" size="sm" onClick={() => void downloadTemplate()}>Pobierz szablon pliku</Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Kolumny</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> Pierwszy wiersz to nagłówki</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FIELD_KEYS.map((f) => (
                <label key={f} className="space-y-1 text-sm">
                  <span>{FIELD_LABELS[f]}{f === "exercise" ? " *" : ""}</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-2" aria-label={`Kolumna: ${FIELD_LABELS[f]}`} value={mapping[f] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                    <option value="">— brak —</option>
                    {Array.from({ length: colCount }, (_, i) => <option key={i} value={i}>{colName(i)}{hasHeader && preview.rows[0]?.[i] ? ` — ${preview.rows[0][i]}` : ""}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-md border border-border text-xs">
              <table className="w-full"><tbody>{preview.rows.slice(0, 6).map((r, i) => <tr key={i} className={i === 0 && hasHeader ? "font-semibold" : ""}>{r.map((c, j) => <td key={j} className="border-b border-border px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
            </div>
            <Button onClick={() => void analyze()} disabled={busy || mapping.exercise === undefined}>Dalej — dopasuj ćwiczenia</Button>
          </CardContent>
        </Card>
      )}

      {days && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Ćwiczenia</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {days.map((d) => (
              <section key={d.name} aria-label={d.name} className="space-y-2">
                <h3 className="font-semibold">{d.name}</h3>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {d.rows.map((r) => {
                    const c = choices[r.line] ?? defaultChoice(r);
                    const value = c.kind === "exercise" ? `e:${c.exerciseId}` : c.kind === "custom" ? "custom" : "skip";
                    return (
                      <li key={r.line} className="space-y-1 p-3 text-sm" data-testid="plan-import-row">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{r.exerciseText}</span>
                          <span className="text-muted-foreground">{r.sets ?? 3}× {r.repsMin ? (r.repsMax !== r.repsMin ? `${r.repsMin}-${r.repsMax}` : r.repsMin) : r.repsText || "—"}{r.loadText ? ` · ${r.loadText}` : ""}{r.rir !== null ? ` · RIR ${r.rir}` : ""}</span>
                        </div>
                        <select className="h-9 w-full rounded-md border border-input bg-background px-2" aria-label={`Ćwiczenie dla: ${r.exerciseText}`} value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setChoices({ ...choices, [r.line]: v === "skip" ? { kind: "skip" } : v === "custom" ? { kind: "custom", name: r.exerciseText } : { kind: "exercise", exerciseId: Number(v.slice(2)) } });
                          }}>
                          {r.candidates.map((cd) => <option key={cd.exerciseId} value={`e:${cd.exerciseId}`}>{cd.name}{r.match?.exerciseId === cd.exerciseId ? " (najlepsze dopasowanie)" : ""}</option>)}
                          <option value="custom">Ćwiczenie własne: „{r.exerciseText}”</option>
                          <option value="skip">Pomiń ten wiersz</option>
                        </select>
                        {r.errors.map((e) => <p key={e} className="text-xs text-destructive">{e} (wiersz zostanie pominięty)</p>)}
                        {c.kind === "exercise" && r.jointWarning && c.exerciseId === r.match?.exerciseId && <p className="text-xs text-warning" role="status">{r.jointWarning}</p>}
                        {c.kind === "exercise" && r.equipmentProblem && c.exerciseId === r.match?.exerciseId && <p className="text-xs text-destructive" role="alert">{r.equipmentProblem} Wybierz inne ćwiczenie albo pomiń wiersz.</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {(needAck || warn.joint.length > 0) && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Rozumiem, że część ćwiczeń obciąża staw zgłoszony przez klienta — dodaj mimo to (zapiszemy Twoją decyzję w historii planu).</span>
              </label>
            )}
            <label className="block space-y-1 text-sm"><span>Nazwa planu / szablonu</span><Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nazwa planu" /></label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save("plan")} disabled={busy || blocked || !title.trim()} data-testid="plan-import-save-plan">Zapisz jako plan klienta (szkic)</Button>
              <Button variant="outline" onClick={() => void save("template")} disabled={busy || !title.trim()}>Zapisz jako szablon</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
