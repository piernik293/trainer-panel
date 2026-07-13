import { useState } from "react";
import { Link } from "wouter";
import { useListClients, getListClientsQueryKey, useDeleteClient } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Trash2, FileText, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { clientStatusLabel, surveyStatusLabel } from "@/lib/client-status";

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

export default function ClientList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [surveyFilter, setSurveyFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const { data: clients, isLoading } = useListClients();
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

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Czy na pewno chcesz usunąć klienta ${name}?`)) {
      deleteClient.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        }
      });
    }
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

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">
            Ładowanie danych...
          </div>
        ) : filteredClients?.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground/50" />
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
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>Kontakt</TableHead>
                    <TableHead>Status klienta</TableHead>
                    <TableHead>Wywiad treningowy</TableHead>
                    <TableHead>Data dodania</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients?.map((client) => (
                    <TableRow key={client.id} className="group">
                      <TableCell className="font-medium">
                        <Link href={`/clients/${client.id}`} className="hover:underline">
                          {client.firstName} {client.lastName}
                        </Link>
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
                          {(client as { experienceLevel?: string | null }).experienceLevel === "Brak aktywności fizycznej" && (
                            <Badge variant="outline" className="text-xs px-1.5 border-sky-200 text-sky-600 bg-sky-50">
                              Start adaptacyjny · Nie rozpoczęto
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(client.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Link href={`/clients/${client.id}/survey`}>
                              <FileText size={16} />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(client.id, `${client.firstName} ${client.lastName}`)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/50">
              {filteredClients?.map((client) => (
                <div key={client.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <Link href={`/clients/${client.id}`} className="font-medium hover:underline">
                      {client.firstName} {client.lastName}
                    </Link>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <Link href={`/clients/${client.id}/survey`}>
                          <FileText size={16} />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(client.id, `${client.firstName} ${client.lastName}`)}
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
                    {(client as { experienceLevel?: string | null }).experienceLevel === "Brak aktywności fizycznej" && (
                      <Badge variant="outline" className="text-xs px-1.5 border-sky-200 text-sky-600 bg-sky-50">
                        Start adaptacyjny
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{formatDate(client.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
