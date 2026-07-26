/**
 * TempoInput — four single-character cells for entering exercise tempo.
 *
 * Format stored and emitted: "4-2-2-0"
 * Accepted characters per cell: digit 0–9 or uppercase X.
 *
 * Behaviour:
 * - Typing a valid character auto-advances focus to the next cell.
 * - Backspace on an empty cell moves focus to the previous cell.
 * - Paste of "4220" or "4-2-2-0" populates all four cells at once.
 * - onChange fires with the "A-B-C-D" string when all four cells are filled,
 *   or undefined when all four cells are cleared.
 *   Partial state (some filled, some empty) does NOT fire onChange so the
 *   parent never stores a half-formed value.
 * - An inline error is shown once the user has blurred a cell and the state
 *   is still partial (at least one empty, at least one filled).
 */

import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const VALID = /^[0-9X]$/;

function parseValue(value: string | undefined): [string, string, string, string] {
  if (!value) return ["", "", "", ""];
  const chars = value
    .toUpperCase()
    .replace(/-/g, "")
    .split("")
    .filter((c) => VALID.test(c))
    .slice(0, 4);
  return [chars[0] ?? "", chars[1] ?? "", chars[2] ?? "", chars[3] ?? ""] as [
    string,
    string,
    string,
    string,
  ];
}

interface TempoInputProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  /** "sm" = compact exercise card (w-6 h-6); "default" = editor panel (w-8 h-8) */
  size?: "sm" | "default";
  className?: string;
}

export function TempoInput({
  value,
  onChange,
  size = "default",
  className,
}: TempoInputProps) {
  const [parts, setParts] = useState<[string, string, string, string]>(() =>
    parseValue(value),
  );
  const [touched, setTouched] = useState(false);

  // Ref used for external-sync comparison without triggering the effect loop.
  const partsRef = useRef(parts);
  partsRef.current = parts;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  // Sync when the parent's value changes from outside this component.
  useEffect(() => {
    const incoming = parseValue(value);
    if (incoming.join("") !== partsRef.current.join("")) {
      setParts(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(newParts: [string, string, string, string]) {
    const allFilled = newParts.every((p) => p !== "");
    const allEmpty = newParts.every((p) => p === "");
    if (allFilled) {
      onChange(newParts.join("-"));
    } else if (allEmpty) {
      onChange(undefined);
    }
    // Partial state: do not fire onChange — keep parent value stable.
  }

  function handleChange(index: number, raw: string) {
    // Take the last character typed (handles browser autocorrect / composition).
    const char = raw.toUpperCase().replace(/[^0-9X]/g, "").slice(-1);
    if (raw.length > 1 && !char) return; // ignore invalid multi-char input
    const newParts = [...parts] as [string, string, string, string];
    newParts[index] = char;
    setParts(newParts);
    commit(newParts);
    if (char && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && parts[index] === "" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const raw = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/-/g, "")
      .replace(/[^0-9X]/g, "")
      .slice(0, 4);
    const newParts = ["", "", "", ""] as [string, string, string, string];
    for (let i = 0; i < 4; i++) newParts[i] = raw[i] ?? "";
    setParts(newParts);
    commit(newParts);
    // Place focus on the first empty cell, or the last if all filled.
    const firstEmpty = newParts.findIndex((p) => p === "");
    const focusIndex = firstEmpty === -1 ? 3 : firstEmpty;
    inputRefs.current[focusIndex]?.focus();
  }

  function handleBlur() {
    setTouched(true);
  }

  const isPartial =
    touched && parts.some((p) => p === "") && parts.some((p) => p !== "");

  const cellBase = cn(
    "border border-input rounded text-center font-mono leading-none",
    "bg-background text-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
    "transition-colors",
    size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm",
  );

  const sepClass = cn(
    "select-none text-muted-foreground",
    size === "sm" ? "text-[10px]" : "text-xs",
  );

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-0.5">
        {([0, 1, 2, 3] as const).map((i) => (
          <span key={i} className="contents">
            <input
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={parts[i]}
              className={cellBase}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onBlur={handleBlur}
              aria-label={`Tempo pozycja ${i + 1}`}
            />
            {i < 3 && <span className={sepClass}>–</span>}
          </span>
        ))}
      </div>
      {isPartial && (
        <p className={cn("text-destructive", size === "sm" ? "text-[10px]" : "text-xs")}>
          Uzupełnij pełne tempo, np. 4-2-2-0
        </p>
      )}
    </div>
  );
}
