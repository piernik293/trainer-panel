/**
 * BulkImportModal
 *
 * Multi-step modal for bulk-importing exercises from CSV or JSON files.
 *
 * Steps:
 *   1. Upload  — drag-drop or file picker
 *   2. Preview — validation errors & duplicate detection (server round-trip)
 *   3. Options — duplicate strategy + skip-invalid toggle
 *   4. Summary — imported / updated / skipped / failed counts
 */
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePreviewExerciseImport, useImportExercises, getListExercisesQueryKey } from "@workspace/api-client-react";
import type { ImportExerciseRow, ImportPreviewResponse } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertTriangle, Upload, FileText, X, Info } from "lucide-react";

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Minimal RFC-4180 CSV parser.
 * Multi-value fields use | as the in-cell separator.
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function toArray(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("|").map((s) => s.trim()).filter(Boolean);
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

function toBool(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === "true" || lower === "1" || lower === "tak") return true;
  if (lower === "false" || lower === "0" || lower === "nie") return false;
  return undefined;
}

function csvRowToImportRow(raw: Record<string, string>): ImportExerciseRow {
  return {
    name: raw.name ?? "",
    mainMuscleGroup: raw.mainMuscleGroup ?? "",
    secondaryMuscleGroups: toArray(raw.secondaryMuscleGroups),
    movementPattern: raw.movementPattern || undefined,
    difficultyLevel: raw.difficultyLevel || undefined,
    equipment: toArray(raw.equipment),
    equipmentOther: raw.equipmentOther || undefined,
    trainingLocation: toArray(raw.trainingLocation),
    exerciseType: raw.exerciseType || undefined,
    description: raw.description || undefined,
    executionInstructions: raw.executionInstructions || undefined,
    commonMistakes: raw.commonMistakes || undefined,
    coachingTips: raw.coachingTips || undefined,
    breathingTips: raw.breathingTips || undefined,
    safetyNotes: raw.safetyNotes || undefined,
    tempo: raw.tempo || undefined,
    rangeOfMotion: raw.rangeOfMotion || undefined,
    videoUrl: raw.videoUrl || undefined,
    imageUrl: raw.imageUrl || undefined,
    suitableExperienceLevels: toArray(raw.suitableExperienceLevels),
    trainingGoals: toArray(raw.trainingGoals),
    movementCategory: raw.movementCategory || undefined,
    planeOfMotion: raw.planeOfMotion || undefined,
    execution: raw.execution || undefined,
    resistanceType: raw.resistanceType || undefined,
    requiresSpotter: toBool(raw.requiresSpotter),
    canBePerformedToFailure: raw.canBePerformedToFailure || undefined,
    jointStress: raw.jointStress || undefined,
    learningDifficulty: toInt(raw.learningDifficulty),
    neurologicalFatigue: toInt(raw.neurologicalFatigue),
    domsPotential: toInt(raw.domsPotential),
    exercisePriority: raw.exercisePriority || undefined,
  };
}

function parseFile(text: string, fileName: string): ImportExerciseRow[] | string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return "Plik JSON musi zawierać tablicę obiektów.";
      return parsed as ImportExerciseRow[];
    } catch {
      return "Nie można sparsować pliku JSON.";
    }
  }

  if (ext === "csv") {
    const rows = parseCsv(text);
    if (rows.length === 0) return "Plik CSV nie zawiera danych (minimum nagłówek + 1 wiersz).";
    return rows.map(csvRowToImportRow);
  }

  return "Nieobsługiwany format. Użyj CSV lub JSON.";
}

// ─── Step components ──────────────────────────────────────────────────────────

type DuplicateStrategy = "skip" | "update" | "create";

type Step = "upload" | "preview" | "options" | "summary";

interface ModalState {
  step: Step;
  rows: ImportExerciseRow[];
  fileName: string;
  parseError: string | null;
  preview: ImportPreviewResponse | null;
  skipInvalid: boolean;
  duplicateStrategy: DuplicateStrategy;
}

const INITIAL_STATE: ModalState = {
  step: "upload",
  rows: [],
  fileName: "",
  parseError: null,
  preview: null,
  skipInvalid: true,
  duplicateStrategy: "skip",
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BulkImportModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ModalState>(INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; updated: number; skipped: number; failed: number } | null>(null);

  const preview = usePreviewExerciseImport();
  const importExercises = useImportExercises();

  const reset = () => {
    setState(INITIAL_STATE);
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseFile(text, file.name);
      if (typeof result === "string") {
        setState((s) => ({ ...s, parseError: result, rows: [], fileName: file.name }));
      } else {
        setState((s) => ({ ...s, parseError: null, rows: result, fileName: file.name }));
      }
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleValidate = () => {
    if (state.rows.length === 0) return;
    preview.mutate(
      { data: { rows: state.rows } },
      {
        onSuccess: (result) => {
          setState((s) => ({ ...s, step: "preview", preview: result }));
        },
      },
    );
  };

  const handleImport = () => {
    const rowsToImport = state.skipInvalid
      ? state.rows.filter((_, i) => !state.preview!.errors.some((e) => e.rowIndex === i))
      : state.rows;

    importExercises.mutate(
      {
        data: {
          rows: rowsToImport,
          duplicateStrategy: state.duplicateStrategy,
          skipInvalidRows: state.skipInvalid,
        },
      },
      {
        onSuccess: (result) => {
          setSummary(result);
          setState((s) => ({ ...s, step: "summary" }));
          queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
        },
      },
    );
  };

  const hasErrors = (state.preview?.errors.length ?? 0) > 0;
  const hasDuplicates = (state.preview?.duplicates.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import ćwiczeń</DialogTitle>
          <DialogDescription>
            Importuj ćwiczenia zbiorczo z pliku CSV lub JSON.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {state.step === "upload" && (
          <div className="space-y-4">
            {/* Drag-drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50 hover:bg-muted/10"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">Przeciągnij plik tutaj lub kliknij, aby wybrać</p>
              <p className="text-sm text-muted-foreground mt-1">Obsługiwane formaty: CSV, JSON</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {state.parseError && (
              <Alert variant="destructive">
                <AlertDescription>{state.parseError}</AlertDescription>
              </Alert>
            )}

            {state.fileName && !state.parseError && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{state.fileName}</p>
                  <p className="text-xs text-muted-foreground">{state.rows.length} wierszy</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
                  <X size={14} />
                </Button>
              </div>
            )}

            {/* Format reference */}
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                <Info size={13} />
                Oczekiwany format pliku
              </summary>
              <div className="mt-2 bg-muted/30 rounded-lg p-3 font-mono text-xs space-y-1">
                <p className="font-sans font-medium text-foreground mb-2">CSV (kolumny oddzielone przecinkami, wartości wielokrotne rozdzielone |):</p>
                <p>name,mainMuscleGroup,equipment,trainingLocation,exerciseType,...</p>
                <p>Wyciskanie sztangi leżąc,Klatka piersiowa,Sztanga|Ławka,Siłownia,Złożone,...</p>
                <p className="font-sans font-medium text-foreground mt-3 mb-2">JSON (tablica obiektów):</p>
                <p>{`[{ "name": "Wyciskanie", "mainMuscleGroup": "Klatka piersiowa", ... }]`}</p>
              </div>
            </details>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Anuluj</Button>
              <Button
                onClick={handleValidate}
                disabled={state.rows.length === 0 || preview.isPending}
              >
                {preview.isPending ? "Walidacja..." : `Waliduj ${state.rows.length} wierszy →`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {state.step === "preview" && state.preview && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 text-emerald-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{state.preview.validCount}</p>
                <p className="text-xs mt-1">Poprawne</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${hasErrors ? "bg-destructive/10 text-destructive" : "bg-muted/30 text-muted-foreground"}`}>
                <p className="text-2xl font-bold">{state.preview.errors.length}</p>
                <p className="text-xs mt-1">Błędy</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${hasDuplicates ? "bg-amber-500/10 text-amber-700" : "bg-muted/30 text-muted-foreground"}`}>
                <p className="text-2xl font-bold">{state.preview.duplicates.length}</p>
                <p className="text-xs mt-1">Duplikaty</p>
              </div>
            </div>

            {/* Error list */}
            {hasErrors && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-1">
                  <AlertTriangle size={14} /> Błędy walidacji
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {state.preview.errors.map((err) => (
                    <div key={err.rowIndex} className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-sm">
                      <p className="font-medium">Wiersz {err.rowIndex + 1}{err.exerciseName ? ` — ${err.exerciseName}` : ""}</p>
                      <ul className="mt-1 text-muted-foreground list-disc list-inside text-xs">
                        {err.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate list */}
            {hasDuplicates && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={14} /> Wykryte duplikaty
                </h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {state.preview.duplicates.map((dup) => (
                    <div key={dup.rowIndex} className="bg-amber-500/5 border border-amber-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                      <span>Wiersz {dup.rowIndex + 1} — <span className="font-medium">{dup.exerciseName}</span></span>
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-200">Istnieje (ID {dup.existingId})</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setState((s) => ({ ...s, step: "upload" }))}>
                ← Wróć
              </Button>
              <Button
                onClick={() => setState((s) => ({ ...s, step: "options" }))}
                disabled={state.preview.validCount === 0 && !hasDuplicates}
              >
                Dalej — opcje importu →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Options ── */}
        {state.step === "options" && state.preview && (
          <div className="space-y-5">
            {/* Skip invalid */}
            {hasErrors && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Wiersze z błędami</h4>
                <div className="flex gap-3">
                  {[
                    { value: true, label: "Pomiń błędne wiersze", desc: "Importuj tylko poprawne wiersze" },
                    { value: false, label: "Anuluj import", desc: "Nie importuj niczego, jeśli są błędy" },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setState((s) => ({ ...s, skipInvalid: opt.value }))}
                      className={`flex-1 rounded-xl border p-3 text-left text-sm transition-colors ${
                        state.skipInvalid === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:bg-muted/20"
                      }`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate strategy */}
            {hasDuplicates && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Strategie dla duplikatów ({state.preview.duplicates.length})</h4>
                <div className="grid gap-2">
                  {(
                    [
                      { value: "skip", label: "Pomiń duplikaty", desc: "Zostaw istniejące ćwiczenia bez zmian" },
                      { value: "update", label: "Aktualizuj istniejące", desc: "Zastąp dane importowanymi wartościami" },
                      { value: "create", label: "Utwórz duplikat", desc: "Dodaj jako nowe ćwiczenie ze zmodyfikowaną nazwą" },
                    ] as { value: DuplicateStrategy; label: string; desc: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setState((s) => ({ ...s, duplicateStrategy: opt.value }))}
                      className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                        state.duplicateStrategy === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:bg-muted/20"
                      }`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Confirmation */}
            {!hasErrors && !hasDuplicates && (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <p className="text-sm text-emerald-700">
                  {state.preview.validCount} ćwiczeń gotowych do importu bez błędów ani duplikatów.
                </p>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setState((s) => ({ ...s, step: "preview" }))}>
                ← Wróć
              </Button>
              <Button
                onClick={handleImport}
                disabled={importExercises.isPending || (!state.skipInvalid && hasErrors)}
              >
                {importExercises.isPending ? "Importowanie..." : `Importuj ${state.preview.validCount} ćwiczeń`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Summary ── */}
        {state.step === "summary" && summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/10 text-emerald-700 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold">{summary.imported}</p>
                <p className="text-sm mt-1">Zaimportowano</p>
              </div>
              <div className="bg-blue-500/10 text-blue-700 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold">{summary.updated}</p>
                <p className="text-sm mt-1">Zaktualizowano</p>
              </div>
              <div className="bg-muted/50 text-muted-foreground rounded-xl p-4 text-center">
                <p className="text-3xl font-bold">{summary.skipped}</p>
                <p className="text-sm mt-1">Pominięto</p>
              </div>
              <div className={`rounded-xl p-4 text-center ${summary.failed > 0 ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground"}`}>
                <p className="text-3xl font-bold">{summary.failed}</p>
                <p className="text-sm mt-1">Błędy</p>
              </div>
            </div>

            {summary.failed > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {summary.failed} ćwiczeń nie udało się zaimportować. Sprawdź dane i spróbuj ponownie.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Importuj kolejny plik</Button>
              <Button onClick={handleClose}>
                <CheckCircle size={16} className="mr-2" />
                Gotowe
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
