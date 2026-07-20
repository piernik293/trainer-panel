import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same canonical list as the client-side survey's MuscleGroupCombobox. */
const MUSCLE_OPTIONS = [
  "Klatka piersiowa",
  "Plecy",
  "Barki",
  "Biceps",
  "Triceps",
  "Przedramiona",
  "Brzuch",
  "Pośladki",
  "Mięśnie czworogłowe uda",
  "Mięśnie dwugłowe uda",
  "Przywodziciele",
  "Odwodziciele",
  "Łydki",
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Autocomplete combobox for selecting a canonical muscle group.
 * Styled to match the trainer-app Shadcn UI (light theme).
 * Equivalent to the client-landing MuscleGroupCombobox.
 */
export function MuscleGroupCombobox({
  value,
  onChange,
  placeholder = "np. Barki",
  className,
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep query in sync when value is cleared externally (e.g. form.reset())
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If typed text doesn't match any option, revert to last confirmed value
        if (!MUSCLE_OPTIONS.find((o) => o.toLowerCase() === query.toLowerCase())) {
          setQuery(value);
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [query, value]);

  const filtered = query.trim()
    ? MUSCLE_OPTIONS.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : MUSCLE_OPTIONS;

  const handleSelect = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(""); // clear confirmed value while typing
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-8",
            "text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Wyczyść"
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown
            size={13}
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(option);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm transition-colors",
                value === option
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
