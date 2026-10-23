import { useState } from "react";
import { Lightbulb, X } from "lucide-react";

/**
 * Short, dismissible tip shown on the screen a "Pierwsze kroki" step leads to.
 * Appears only when the address carries ?krok=<step> (set by the Pulpit link).
 * Dismissing is per visit — no storage, no library.
 */
export function StepHint({ step, children }: { step: 2 | 3 | 4 | 5; children: React.ReactNode }) {
  const [closed, setClosed] = useState(false);
  const krok = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("krok");
  if (closed || krok !== String(step)) return null;
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
      data-testid={`step-hint-${step}`}
    >
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Krok {step} z 5. </span>
        {children}
      </p>
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="Zamknij podpowiedź"
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-primary/10"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
