import { useState } from "react";
import { Link } from "wouter";
import { useListClients, getListClientsQueryKey, useDeleteClient } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Trash2, Edit, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function ClientList() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: clients, isLoading } = useListClients();
  const queryClient = useQueryClient();
  const deleteClient = useDeleteClient();

  const filteredClients = clients?.filter(client => 
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
            Zarządzaj swoimi podopiecznymi i ich ankietami
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
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Szukaj klienta..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
              Nie znaleziono klientów pasujących do wyszukiwania.
            </p>
            {searchTerm && (
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Wyczyść wyszukiwanie
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Imię i nazwisko</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>Data dodania</TableHead>
                <TableHead>Ankieta</TableHead>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(client.createdAt)}
                  </TableCell>
                  <TableCell>
                    {client.hasSurvey ? (
                      <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">Wypełniona</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Brak</Badge>
                    )}
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
        )}
      </div>
    </div>
  );
}

// Need to import Users icon for the empty state
import { Users } from "lucide-react";