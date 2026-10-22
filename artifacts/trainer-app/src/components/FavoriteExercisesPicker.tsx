import { useState, useRef, useEffect } from "react";
import { X, Search, Heart, Loader2 } from "lucide-react";
import { useSearchExercises } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export interface FavoriteExercise {
  id: number;
  name: string;
}

interface Props {
  selectedExercises: FavoriteExercise[];
  onSelectedChange: (exercises: FavoriteExercise[]) => void;
}

/**
 * Exercise picker for "Ulubione ćwiczenia" in the trainer survey form.
 * Searches the DB by name; selected items shown as dismissable chips.
 * Equivalent to the client-landing FavoriteExercisesPicker, adapted to the
 * trainer-app Shadcn UI light theme.
 */
export function FavoriteExercisesPicker({ selectedExercises, onSelectedChange }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isLoading, isError } = useSearchExercises(debouncedQuery);

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
    onSelectedChange([...selectedExercises, { id: ex.id, name: ex.name }]);
    setQuery("");
    setDebouncedQuery("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleRemove = (id: number) => {
    onSelectedChange(selectedExercises.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selectedExercises.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedExercises.map((ex) => (
            <span
              key={ex.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-full bg-primary/10 border border-primary/20 text-primary"
            >
              <Heart size={11} className="shrink-0" />
              {ex.name}
              <button
                type="button"
                onClick={() => handleRemove(ex.id)}
                className="ml-0.5 text-primary/70 hover:text-primary transition-colors"
                aria-label={`Usuń ${ex.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative" ref={containerRef}>
        <div className="relative">
          <Search
            size={13}
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
            placeholder="Wpisz nazwę ćwiczenia…"
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1",
              "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          />
          {isLoading && (
            <Loader2
              size={13}
              className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          )}
        </div>

        {showDropdown && query.trim().length >= 1 && (
          <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Szukam…</div>
            ) : isError ? (
              <div role="alert" className="px-3 py-2 text-xs text-destructive">
                Nie udało się wyszukać ćwiczeń. Spróbuj ponownie za chwilę.
              </div>
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {ex.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {ex.mainMuscleGroup}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
