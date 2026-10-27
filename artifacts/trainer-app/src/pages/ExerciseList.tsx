import { useState } from "react";
import { Link } from "wouter";
import { useListExercises } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Dumbbell, CheckCircle, AlertCircle } from "lucide-react";
import {
  MAIN_MUSCLE_GROUPS,
  EQUIPMENT_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  MOVEMENT_PATTERN_OPTIONS,
  LOCATION_DISPLAY_LABELS,
  getLocationDisplayLabel,
} from "@/lib/exercise-constants";
import { useSubscriptionSummary } from "@/lib/use-subscription-summary";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";
import { CATALOGUE_TABS, splitByTab, type CatalogueTab } from "@/lib/catalogueTabs";

export default function ExerciseList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  /**
   * Unified level/purpose filter.
   * "adaptive" → suitableForNoActivity = true (not the same as Początkujący).
   * Other values are passed as difficultyLevel directly.
   */
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<string>("all");
  const [movementPatternFilter, setMovementPatternFilter] = useState<string>("all");
  const { data: exercises, isLoading, isError, error, refetch } = useListExercises({
    search: searchTerm || undefined,
    mainMuscleGroup: muscleFilter !== "all" ? muscleFilter : undefined,
    equipment: equipmentFilter !== "all" ? equipmentFilter : undefined,
    difficultyLevel: (levelFilter !== "all" && levelFilter !== "adaptive") ? levelFilter : undefined,
    trainingLocation: locationFilter !== "all" ? locationFilter : undefined,
    exerciseType: exerciseTypeFilter !== "all" ? exerciseTypeFilter : undefined,
    movementPattern: movementPatternFilter !== "all" ? movementPatternFilter : undefined,
    suitableForNoActivity: levelFilter === "adaptive" ? true : undefined,
  });
  // Zakładki katalogu: ćwiczenia treningowe osobno od rozgrzewek i rozciągania (decyzja właściciela 26.10.2026).
  const [tab, setTab] = useState<CatalogueTab>("training");
  const shown = splitByTab(exercises, tab);
  const { data: subscription } = useSubscriptionSummary();
  const customExerciseLimitReached =
    subscription?.usage.customExercises.atLimit ?? false;

  const hasActiveFilters =
    searchTerm !== "" ||
    muscleFilter !== "all" ||
    equipmentFilter !== "all" ||
    levelFilter !== "all" ||
    locationFilter !== "all" ||
    exerciseTypeFilter !== "all" ||
    movementPatternFilter !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setMuscleFilter("all");
    setEquipmentFilter("all");
    setLevelFilter("all");
    setLocationFilter("all");
    setExerciseTypeFilter("all");
    setMovementPatternFilter("all");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Biblioteka ćwiczeń
          </h1>
          <p className="text-muted-foreground mt-1">
            Twoja baza ćwiczeń do wykorzystania w planach treningowych
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline"><Link href="/exercises/review" data-testid="link-review">Do weryfikacji</Link></Button>
          <Button asChild={!customExerciseLimitReached} disabled={customExerciseLimitReached}>
            {customExerciseLimitReached ? (
              <span className="flex items-center gap-2" title="Osiągnięto limit własnych ćwiczeń">
                <PlusCircle size={18} />
                Limit ćwiczeń
              </span>
            ) : (
              <Link href="/exercises/new" className="flex items-center gap-2">
                <PlusCircle size={18} />
                Dodaj Ćwiczenie
              </Link>
            )}
          </Button>
        </div>
      </div>

      {customExerciseLimitReached && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Wykorzystano {subscription?.usage.customExercises.used}/
          {subscription?.usage.customExercises.limit} własnych ćwiczeń w planie{" "}
          {subscription?.plan.name}. Usunięcie własnego ćwiczenia zwolni miejsce.
        </div>
      )}

      <div role="tablist" className="flex gap-2" data-testid="catalogue-tabs">
        {CATALOGUE_TABS.map((t) => (
          <Button
            key={t.id} role="tab" aria-selected={tab === t.id} data-testid={`tab-${t.id}`}
            variant={tab === t.id ? "default" : "outline"} size="sm" onClick={() => setTab(t.id)}
          >{t.label}</Button>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col gap-3">
          {/* Row 1: search + primary filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <div className="relative max-w-sm w-full sm:w-auto flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj po nazwie ćwiczenia..."
                className="pl-9 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Select value={muscleFilter} onValueChange={setMuscleFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background">
                <SelectValue placeholder="Partia mięśniowa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie partie</SelectItem>
                {MAIN_MUSCLE_GROUPS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Sprzęt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystki sprzęt</SelectItem>
                {EQUIPMENT_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-full sm:w-[260px] bg-background">
                <SelectValue placeholder="Poziom / przeznaczenie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="adaptive">Program adaptacyjny — brak aktywności</SelectItem>
                <SelectItem value="Początkujący">Początkujący</SelectItem>
                <SelectItem value="Średniozaawansowany">Średniozaawansowany</SelectItem>
                <SelectItem value="Zaawansowany">Zaawansowany</SelectItem>
              </SelectContent>
            </Select>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Miejsce treningu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie miejsca</SelectItem>
                {TRAINING_LOCATION_OPTIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LOCATION_DISPLAY_LABELS[l] ?? l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: secondary filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <Select value={exerciseTypeFilter} onValueChange={setExerciseTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Typ ćwiczenia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie typy</SelectItem>
                {EXERCISE_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={movementPatternFilter} onValueChange={setMovementPatternFilter}>
              <SelectTrigger className="w-full sm:w-[200px] bg-background">
                <SelectValue placeholder="Wzorzec ruchowy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie wzorce</SelectItem>
                {MOVEMENT_PATTERN_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                Wyczyść filtry
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">
            Ładowanie danych...
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorState
              title="Nie udało się wczytać biblioteki ćwiczeń"
              message={humanizeError(error)}
              onRetry={() => void refetch()}
            />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Dumbbell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Brak wyników</h3>
            <p className="text-muted-foreground mt-1 mb-6">
              Nie znaleziono ćwiczeń pasujących do wybranych filtrów.
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Wyczyść filtry
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Nazwa</TableHead>
                    <TableHead>Główna partia</TableHead>
                    <TableHead>Sprzęt</TableHead>
                    <TableHead>Poziom</TableHead>
                    <TableHead>Miejsce</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kompletność</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((exercise) => (
                    <TableRow key={exercise.id} className="group">
                      <TableCell className="font-medium">
                        <Link href={`/exercises/${exercise.id}`} className="hover:underline">
                          {exercise.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{exercise.mainMuscleGroup}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {exercise.equipment.length > 0 ? exercise.equipment.join(", ") : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{exercise.difficultyLevel || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {exercise.trainingLocation.length > 0
                          ? exercise.trainingLocation.map(getLocationDisplayLabel).join(", ")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={exercise.isActive
                            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                            : "bg-muted text-muted-foreground"}
                        >
                          {exercise.isActive ? "Aktywne" : "Nieaktywne"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exercise.isComplete ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-sm">
                            <CheckCircle size={14} />
                            Kompletne
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 text-sm">
                            <AlertCircle size={14} />
                            Niekompletne
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/50">
              {shown.map((exercise) => (
                <Link
                  key={exercise.id}
                  href={`/exercises/${exercise.id}`}
                  className="p-4 space-y-2 block hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{exercise.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={exercise.isActive
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"}
                      >
                        {exercise.isActive ? "Aktywne" : "Nieaktywne"}
                      </Badge>
                      {!exercise.isComplete && (
                        <AlertCircle size={14} className="text-amber-500" />
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {exercise.mainMuscleGroup} · {exercise.difficultyLevel || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {exercise.equipment.length > 0 ? exercise.equipment.join(", ") : "Brak sprzętu"}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
