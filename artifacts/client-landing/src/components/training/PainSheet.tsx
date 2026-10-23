import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PAIN_AREAS, type PainArea } from "@/lib/training/types";

export const PAIN_NOTICE = "Przerwij to ćwiczenie. Pozostałe możesz robić, jeśli nie bolą. Przy silnym bólu skonsultuj się z lekarzem.";

export interface PainInput { area: PainArea; severity: number; description: string }

/** Bottom sheet "Coś boli?" — role="dialog". The only way out of an exercise through pain. */
export function PainSheet({ exerciseName, onCancel, onSubmit }: { exerciseName: string; onCancel: () => void; onSubmit: (p: PainInput) => void }) {
  const [area, setArea] = useState<PainArea | null>(null);
  const [severity, setSeverity] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onCancel]);

  const ready = area != null && severity != null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pain-title"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 pb-6 shadow-xl"
      >
        <h2 id="pain-title" ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-none">Coś boli?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{exerciseName}</p>

        <p id="pain-area" className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Gdzie?</p>
        <div role="radiogroup" aria-labelledby="pain-area" className="flex flex-wrap gap-2">
          {PAIN_AREAS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)}
              className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold", area === a ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
              {a}
            </button>
          ))}
        </div>

        <p id="pain-sev" className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Jak mocno? <span className="font-normal normal-case tracking-normal">(1 — lekko, 5 — bardzo mocno)</span></p>
        <div role="radiogroup" aria-labelledby="pain-sev" className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={severity === n} onClick={() => setSeverity(n)}
              className={cn("h-12 rounded-lg border text-base font-bold", severity === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
              {n}
            </button>
          ))}
        </div>

        <label htmlFor="pain-desc" className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Kilka słów (opcjonalnie)</label>
        <textarea id="pain-desc" value={description} maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-input bg-background p-3 text-base" />
        <p className="text-right text-xs text-muted-foreground">{description.length}/500</p>

        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-foreground">{PAIN_NOTICE}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="h-12 rounded-lg border border-border bg-background font-semibold">Anuluj</button>
          <button type="button" disabled={!ready} onClick={() => ready && onSubmit({ area, severity, description: description.trim() })}
            className="h-12 rounded-lg bg-primary px-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            Wyślij i pomiń ćwiczenie
          </button>
        </div>
      </div>
    </div>
  );
}
