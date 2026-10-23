import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function MuscleGroupCombobox({ value, onChange, placeholder = "np. Barki", className }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep query in sync when value is cleared externally
  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If the query doesn't match a known option, clear it
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
          className="w-full pl-4 pr-8 py-3 text-sm bg-background/50 border border-border rounded-lg focus:border-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground h-12"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Wyczyść"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            size={14}
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-px bg-background border border-border rounded-lg max-h-52 overflow-y-auto shadow-xl">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(option);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-card transition-colors",
                value === option ? "text-primary bg-primary/5" : "text-foreground"
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
