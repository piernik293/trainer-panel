import { useState, useRef, useEffect } from "react";
import { X, Search } from "lucide-react";
import { useSearchExercises } from "@workspace/api-client-react";

export interface SelectedExercise {
  id: number;
  name: string;
  reason: string;
}

interface Props {
  selectedExercises: SelectedExercise[];
  onSelectedChange: (exercises: SelectedExercise[]) => void;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  otherReason: string;
  onOtherReasonChange: (v: string) => void;
}

export function AvoidedExercisesPicker({
  selectedExercises,
  onSelectedChange,
  otherText,
  onOtherTextChange,
  otherReason,
  onOtherReasonChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showOther, setShowOther] = useState(!!otherText || !!otherReason);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isLoading } = useSearchExercises(debouncedQuery);

  const selectedIds = new Set(selectedExercises.map((e) => e.id));
  const filtered = (results ?? []).filter((r) => !selectedIds.has(r.id));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (ex: { id: number; name: string }) => {
    onSelectedChange([...selectedExercises, { id: ex.id, name: ex.name, reason: "" }]);
    setQuery("");
    setDebouncedQuery("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleRemove = (id: number) => {
    onSelectedChange(selectedExercises.filter((e) => e.id !== id));
  };

  const handleReasonChange = (id: number, reason: string) => {
    onSelectedChange(
      selectedExercises.map((e) => (e.id === id ? { ...e, reason } : e)),
    );
  };

  return (
    <div className="space-y-4">
      {/* Selected exercises */}
      {selectedExercises.length > 0 && (
        <div className="space-y-3">
          {selectedExercises.map((ex) => (
            <div
              key={ex.id}
              className="border border-border rounded-lg p-3 space-y-2 bg-background/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{ex.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(ex.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Usuń ${ex.name}`}
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={ex.reason}
                onChange={(e) => handleReasonChange(ex.id, e.target.value)}
                placeholder="Podaj powód unikania (opcjonalne)..."
                rows={2}
                className="w-full text-xs bg-background/50 border border-border rounded-lg p-2 resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative" ref={containerRef}>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Wpisz nazwę ćwiczenia..."
            className="w-full pl-8 pr-3 py-2.5 text-sm bg-background/50 border border-border rounded-lg focus:border-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {showDropdown && query.trim().length >= 1 && (
          <div className="absolute z-50 w-full mt-px bg-background border border-border rounded-lg max-h-52 overflow-y-auto shadow-xl">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Szukam...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Brak wyników dla „{query}"
              </div>
            ) : (
              filtered.slice(0, 12).map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(ex);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-card transition-colors"
                >
                  <span className="text-sm text-foreground">{ex.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {ex.mainMuscleGroup}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Unknown / not-in-library toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors underline-offset-2 hover:underline"
        >
          {showOther
            ? "Ukryj pole opisu"
            : "Nie znajduję ćwiczenia / nie znam jego nazwy"}
        </button>

        {showOther && (
          <div className="mt-3 space-y-2">
            <textarea
              value={otherText}
              onChange={(e) => onOtherTextChange(e.target.value)}
              placeholder="Opisz ćwiczenie, którego chcesz unikać (np. wyciskanie nad głowę, klasyczne przysiady)..."
              rows={3}
              className="w-full text-sm bg-background/50 border border-border rounded-lg focus:border-primary/50 focus:outline-none p-3 resize-y text-foreground placeholder:text-muted-foreground"
            />
            <textarea
              value={otherReason}
              onChange={(e) => onOtherReasonChange(e.target.value)}
              placeholder="Powód unikania tych ćwiczeń (opcjonalne)..."
              rows={2}
              className="w-full text-xs bg-background/50 border border-border rounded-lg focus:border-primary/50 focus:outline-none p-2 resize-y text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}
