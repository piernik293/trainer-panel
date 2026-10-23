import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Minus, Plus, WifiOff, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trainingQueue } from "@/lib/training/sync";

/** Round ± button, 48 px (touch target >= 44 px). */
export function StepButton({ label, onClick, kind }: { label: string; onClick: () => void; kind: "minus" | "plus" }) {
  const Icon = kind === "minus" ? Minus : Plus;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground active:bg-brand-soft"
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/**
 * Number with − / + and an exact-value input. The text is kept locally while typing
 * and committed on blur / Enter; invalid text is reverted.
 */
export function NumberField({
  label, value, onChange, step, decimal, unit, parse, format,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  decimal: boolean;
  unit?: string;
  parse: (raw: string) => number | null;
  format: (v: number | null) => string;
}) {
  const id = useId();
  const [text, setText] = useState(format(value));
  useEffect(() => setText(format(value)), [value, format]);
  const commit = () => {
    const parsed = parse(text);
    if (text.trim() === "") onChange(null);
    else if (parsed == null) setText(format(value));
    else onChange(parsed);
  };
  const bump = (dir: 1 | -1) => {
    const base = parse(text) ?? value ?? 0;
    const next = Math.max(0, Math.round((base + dir * step) * 100) / 100);
    onChange(decimal ? next : Math.min(200, Math.round(next)));
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <StepButton kind="minus" label={`${label}: mniej`} onClick={() => bump(-1)} />
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            inputMode={decimal ? "decimal" : "numeric"}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
            className="h-12 w-full rounded-lg border border-input bg-background px-2 text-center text-xl font-bold tabular-nums"
          />
          {unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
        </div>
        <StepButton kind="plus" label={`${label}: więcej`} onClick={() => bump(1)} />
      </div>
    </div>
  );
}

/** One tap: 0 1 2 3 4+ (radiogroup). */
export function RirPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const opts = [0, 1, 2, 3, 4];
  return (
    <div>
      <p id="rir-label" className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        RIR <span className="font-normal normal-case tracking-normal">(ile powtórzeń zostało w zapasie)</span>
      </p>
      <div role="radiogroup" aria-labelledby="rir-label" className="grid grid-cols-5 gap-2">
        {opts.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : o)}
              className={cn(
                "h-12 rounded-lg border text-base font-bold",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
              )}
            >
              {o === 4 ? "4+" : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Offline — zapisane na telefonie" / "Zsynchronizowano". */
export function SyncBadge() {
  const q = trainingQueue();
  const pending = useSyncExternalStore((cb) => q.subscribe(cb), () => q.pending());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [justSynced, setJustSynced] = useState(false);
  useEffect(() => {
    const on = () => { setOnline(true); void q.flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [q]);
  const [hadPending, setHadPending] = useState(false);
  useEffect(() => {
    if (pending > 0) { setHadPending(true); setJustSynced(false); return undefined; }
    if (hadPending) {
      setJustSynced(true);
      const t = window.setTimeout(() => { setJustSynced(false); setHadPending(false); }, 4000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [pending, hadPending]);

  if (!online || pending > 0) {
    return (
      <span role="status" className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
        <WifiOff className="h-3.5 w-3.5" aria-hidden /> {online ? "Zapisywanie…" : "Offline — zapisane na telefonie"}
      </span>
    );
  }
  if (justSynced) {
    return (
      <span role="status" className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Zsynchronizowano
      </span>
    );
  }
  return null;
}

/** Placeholder until videos / animations exist. */
export function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground" aria-hidden>
      {label}
    </div>
  );
}
