import { useState } from "react";
import { clientFullName } from "@/lib/clientName";
import { Link } from "wouter";
import { useListClients, getListClientsQueryKey, useDeleteClient } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Search, Trash2, FileText, Users, AlertTriangle, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { clientStatusLabel, surveyStatusLabel } from "@/lib/client-status";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";

function statusBadgeVariant(status: string | null | undefined) {
  switch (status) {
    case "paused":
      return "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20";
    case "finished":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20";
  }
}

function surveyBadgeVariant(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "bg-primary/10 text-primary hover:bg-primary/20";
    case "incomplete":
      return "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20";
    default:
      return "";
  }
}

/** Polish plural for "profil/profile/profili" */
function profilePlural(n: number) {
  if (n === 1) return "profil";
  if (n >= 2 && n <= 4) return "profile";
  return "profili";
}

export default function ClientList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [surveyFilter, setSurveyFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  // Bulk selection — Set of all selected IDs (may include IDs hidden by filters)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [failedDeleteIds, setFailedDeleteIds] = useState<Set<number>>(new Set());

  const { data: clients, isLoading, isError, error, refetch } = useListClients({
    query: {
      queryKey: getListClientsQueryKey(),
      // refresh every 15 s — new submissions appear promptly; no polling after
      // a failure (a never-loaded query would flip back to loading each time)
      refetchInterval: (query) => (query.state.status === "error" ? false : 15_000),
      refetchOnWindowFocus: true,    // also refresh when trainer returns to the tab
      refetchOnReconnect: true,
    },
  });
  const queryClient = useQueryClient();
  const deleteClient = useDeleteClient();

  const hasActiveFilters =
    searchTerm !== "" || statusFilter !== "all" || surveyFilter !== "all" || segmentFilter !== "all";

  const filteredClients = clients?.filter((client) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      term === "" ||
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(term) ||
      (client.email && client.email.toLowerCase().includes(term)) ||
      (client.phone && client.phone.toLowerCase().includes(term));

    const matchesStatus = statusFilter === "all" || client.status === statusFilter;
    const matchesSurvey = surveyFilter === "all" || client.surveyStatus === surveyFilter;
    const matchesSegment =
      segmentFilter === "all" ||
      (segmentFilter === "start_adaptacyjny" &&
        (client as { experienceLevel?: string | null }).experienceLevel ===
          "Brak aktywności fizycznej");

    return matchesSearch && matchesStatus && matchesSurvey && matchesSegment;
  });

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSurveyFilter("all");
    setSegmentFilter("all");
  };

  // ── Derived selection state (scoped to currently visible rows) ──────────────
  const visibleIds = filteredClients?.map((c) => c.id) ?? [];
  const selectedInView = visibleIds.filter((id) => selectedIds.has(id));
  const selectedCount = selectedInView.length;
  const allVisibleSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Clear failure indicator for this row when re-toggled
    setFailedDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Single-profile delete (unchanged flow) ──────────────────────────────────
  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Czy na pewno chcesz usunąć klienta ${name}?`)) {
      deleteClient.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          // Also remove from selection if it was selected
          setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      });
    }
  };

  // ── Bulk delete ─────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setFailedDeleteIds(new Set());

    // Snapshot the IDs to delete at confirmation time
    const toDelete = [...selectedInView];

    const results = await Promise.allSettled(
      toDelete.map((id) => deleteClient.mutateAsync({ id }))
    );

    const succeededIds = new Set<number>();
    const newFailedIds = new Set<number>();
    results.forEach((result, i) => {
      if (result.status === "fulfilled") succeededIds.add(toDelete[i]);
      else newFailedIds.add(toDelete[i]);
    });

    // Remove succeeded IDs from selection; keep failed IDs selected
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });

    if (newFailedIds.size > 0) setFailedDeleteIds(newFailedIds);

    if (succeededIds.size > 0) {
      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    }

    setShowBulkConfirm(false);
    setBulkDeleting(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Klienci
          </h1>
          <p className="text-muted-foreground mt-1">
            Zarządzaj swoimi podopiecznymi i ich wywiadami treningowymi
          </p>
        </div>
        <Button asChild>
          <Link href="/clients/new" className="flex items-center gap-2">
            <PlusCircle size={18} />
            Dodaj Klienta
          </Link>
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative max-w-sm w-full sm:w-auto flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Szukaj po imieniu, e-mailu lub telefonie..."
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[170px] bg-background">
              <SelectValue placeholder="Status klienta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              <SelectItem value="active">Aktywny</SelectItem>
              <SelectItem value="paused">Wstrzymany</SelectItem>
              <SelectItem value="finished">Zakończony</SelectItem>
            </SelectContent>
          </Select>

          <Select value={surveyFilter} onValueChange={setSurveyFilter}>
            <SelectTrigger className="w-full sm:w-[190px] bg-background">
              <SelectValue placeholder="Status wywiadu treningowego" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie wywiady treningowe</SelectItem>
              <SelectItem value="not_started">Nie rozpoczęta</SelectItem>
              <SelectItem value="incomplete">Niekompletna</SelectItem>
              <SelectItem value="completed">Wypełniona</SelectItem>
            </SelectContent>
          </Select>

          <Select value={segmentFilter} onValueChange={setSegmentFilter}>
            <SelectTrigger className="w-full sm:w-[210px] bg-background">
              <SelectValue placeholder="Segment klienta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie segmenty</SelectItem>
              <SelectItem value="start_adaptacyjny">Start adaptacyjny</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
              Wyczyść filtry
            </Button>
          )}
        </div>

        {/* ── Bulk action bar (visible when ≥1 row is selected) ────────────── */}
        {selectedCount > 0 && (
          <div className="px-4 py-2.5 bg-primary/5 border-b border-border/50 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Zaznaczono: {selectedCount}
            </span>

            {failedDeleteIds.size > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle size={14} />
                Nie udało się usunąć {failedDeleteIds.size} {profilePlural(failedDeleteIds.size)} — spróbuj ponownie
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={bulkDeleting}
                className="text-muted-foreground"
              >
                Wyczyść zaznaczenie
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkConfirm(true)}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5"
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Usuwanie…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Usuń zaznaczone
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">
            Ładowanie danych...
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorState
              title="Nie udało się wczytać listy klientów"
              message={humanizeError(error)}
              onRetry={() => void refetch()}
            />
          </div>
        ) : filteredClients?.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Brak wyników</h3>
            <p className="text-muted-foreground mt-1 mb-6">
              Nie znaleziono klientów pasujących do wybranych filtrów.
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Wyczyść filtry
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* ── Desktop table ─────────────────────────────────────────── */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-10 pr-0">
                      <Checkbox
                        checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Zaznacz wszystkich widocznych klientów"
                      />
                    </TableHead>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>Kontakt</TableHead>
                    <TableHead>Status klienta</TableHead>
                    <TableHead>Wywiad treningowy</TableHead>
                    <TableHead>Data dodania</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients?.map((client) => {
                    const isSelected = selectedIds.has(client.id);
                    const hasFailed = failedDeleteIds.has(client.id);
                    return (
                      <TableRow
                        key={client.id}
                        className={`group ${isSelected ? "bg-primary/5" : ""} ${hasFailed ? "bg-destructive/5" : ""}`}
                        data-selected={isSelected}
                      >
                        <TableCell
                          className="w-10 pr-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(client.id)}
                            aria-label={`Zaznacz klienta ${client.firstName} ${client.lastName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {hasFailed && (
                              <AlertTriangle size={14} className="text-destructive shrink-0" />
                            )}
                            <Link href={`/clients/${client.id}`} className="hover:underline">
                              {clientFullName(client)}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{client.email || "-"}</span>
                            <span className="text-xs text-muted-foreground">{client.phone || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeVariant(client.status)}>
                            {clientStatusLabel(client.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={client.surveyStatus === "not_started" ? "outline" : "default"}
                              className={client.surveyStatus === "not_started" ? "text-muted-foreground" : surveyBadgeVariant(client.surveyStatus)}
                            >
                              {surveyStatusLabel(client.surveyStatus)}
                            </Badge>
                            {(["Brak aktywności fizycznej", "Początkujący"] as const).includes(
                              (client as any).experienceLevel ?? ""
                            ) && (
                              <Badge
                                variant="outline"
                                className={`text-xs px-1.5 ${
                                  (client as any).adaptiveStartDecision === "accepted"
                                    ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                    : (client as any).adaptiveStartDecision === "declined"
                                    ? "border-slate-200 text-slate-500 bg-slate-50"
                                    : "border-sky-200 text-sky-600 bg-sky-50"
                                }`}
                              >
                                {`Start adaptacyjny · ${
                                  (client as any).adaptiveStartDecision === "accepted"
                                    ? "Zastosowany"
                                    : (client as any).adaptiveStartDecision === "declined"
                                    ? "Pominięty"
                                    : "Oczekuje na decyzję"
                                }`}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(client.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground hover:text-primary">
                              <Link href={`/clients/${client.id}/survey`} aria-label={`Wywiad: ${client.firstName} ${client.lastName}`}>
                                <FileText size={16} />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Usuń klienta ${client.firstName} ${client.lastName}`}
                              onClick={() => handleDelete(client.id, `${client.firstName} ${client.lastName}`)}
                              disabled={bulkDeleting}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ── Mobile cards ──────────────────────────────────────────── */}
            <div className="md:hidden divide-y divide-border/50">
              {filteredClients?.map((client) => {
                const isSelected = selectedIds.has(client.id);
                const hasFailed = failedDeleteIds.has(client.id);
                return (
                  <div
                    key={client.id}
                    className={`p-4 space-y-3 ${isSelected ? "bg-primary/5" : ""} ${hasFailed ? "bg-destructive/5" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(client.id)}
                          aria-label={`Zaznacz klienta ${client.firstName} ${client.lastName}`}
                        />
                        <div className="flex items-center gap-1.5 min-w-0">
                          {hasFailed && (
                            <AlertTriangle size={14} className="text-destructive shrink-0" />
                          )}
                          <Link href={`/clients/${client.id}`} className="font-medium hover:underline truncate">
                            {clientFullName(client)}
                          </Link>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <Link href={`/clients/${client.id}/survey`} aria-label={`Wywiad: ${client.firstName} ${client.lastName}`}>
                            <FileText size={16} />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Usuń klienta ${client.firstName} ${client.lastName}`}
                          onClick={() => handleDelete(client.id, `${client.firstName} ${client.lastName}`)}
                          disabled={bulkDeleting}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{client.email || "-"} · {client.phone || "-"}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={statusBadgeVariant(client.status)}>
                        {clientStatusLabel(client.status)}
                      </Badge>
                      <Badge
                        variant={client.surveyStatus === "not_started" ? "outline" : "default"}
                        className={client.surveyStatus === "not_started" ? "text-muted-foreground" : surveyBadgeVariant(client.surveyStatus)}
                      >
                        {surveyStatusLabel(client.surveyStatus)}
                      </Badge>
                      {(["Brak aktywności fizycznej", "Początkujący"] as const).includes(
                        (client as any).experienceLevel ?? ""
                      ) && (
                        <Badge
                          variant="outline"
                          className={`text-xs px-1.5 ${
                            (client as any).adaptiveStartDecision === "accepted"
                              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                              : (client as any).adaptiveStartDecision === "declined"
                              ? "border-slate-200 text-slate-500 bg-slate-50"
                              : "border-sky-200 text-sky-600 bg-sky-50"
                          }`}
                        >
                          {`Start adaptacyjny · ${
                            (client as any).adaptiveStartDecision === "accepted"
                              ? "Zastosowany"
                              : (client as any).adaptiveStartDecision === "declined"
                              ? "Pominięty"
                              : "Oczekuje na decyzję"
                          }`}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{formatDate(client.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Bulk delete confirmation modal ─────────────────────────────────── */}
      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          // Prevent closing while deletion is in progress
          if (!bulkDeleting) setShowBulkConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć zaznaczone profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Zostanie trwale usuniętych{" "}
              <span className="font-semibold text-foreground">
                {selectedCount} {profilePlural(selectedCount)}
              </span>{" "}
              klientów. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Anuluj</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-2"
            >
              {bulkDeleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Usuwanie…
                </>
              ) : (
                `Usuń ${selectedCount} ${profilePlural(selectedCount)}`
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
