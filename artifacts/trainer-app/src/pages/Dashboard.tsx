import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Users, FileText, Activity, PauseCircle, CheckCircle2, Sparkles, UserPlus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useGetStats({
    query: {
      queryKey: getGetStatsQueryKey(),
      refetchInterval: 12_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-muted rounded w-48 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
        </div>
        <div className="h-64 bg-muted rounded-xl mt-8" />
      </div>
    );
  }

  // ── Empty state: no clients yet ──────────────────────────────────────────
  if (!stats || stats.totalClients === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Pulpit
          </h1>
          <p className="text-muted-foreground mt-1">
            Podsumowanie Twojej działalności trenerskiej
          </p>
        </div>

        <Empty
          className="border border-dashed"
          data-testid="dashboard-empty-state"
        >
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserPlus />
            </EmptyMedia>
            <EmptyTitle data-testid="empty-title">
              Zacznij pracę z pierwszym klientem
            </EmptyTitle>
            <EmptyDescription data-testid="empty-description">
              Wyślij link do Wywiadu treningowego lub dodaj klienta ręcznie, aby
              rozpocząć tworzenie planu.
            </EmptyDescription>
          </EmptyHeader>

          <EmptyContent>
            <Button
              className="w-full sm:w-auto"
              data-testid="empty-action-invite"
              onClick={() => navigate("/survey-invite")}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Wyślij zaproszenie
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              data-testid="empty-action-add-manual"
              onClick={() => navigate("/clients/new")}
            >
              Dodaj klienta ręcznie
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  // ── Populated dashboard ──────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500" data-testid="dashboard-populated">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Pulpit
        </h1>
        <p className="text-muted-foreground mt-1">
          Podsumowanie Twojej działalności trenerskiej
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wszyscy Klienci
            </CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{stats.totalClients}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktywni / Wstrzymani
            </CardTitle>
            <PauseCircle className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{stats.activeClients} / {stats.pausedClients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              zakończonych: {stats.finishedClients}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wypełnione Wywiady Treningowe
            </CardTitle>
            <FileText className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{stats.surveysCompleted}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Niekompletne / Brak
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{stats.incompleteSurveys} / {stats.noSurveyClients}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nowe wywiady treningowe (7 dni)
            </CardTitle>
            <Sparkles className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{stats.newSurveysThisWeek}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kompletność Danych
            </CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{Math.round(stats.surveysPercent)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              klientów posiada wywiad treningowy
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle>Ostatnio dodani klienci</CardTitle>
          <CardDescription>
            Lista 5 najnowszych osób, z którymi rozpocząłeś współpracę
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentClients && stats.recentClients.length > 0 ? (
            <div className="divide-y divide-border/50">
              {stats.recentClients.map(client => (
                <div key={client.id} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {client.firstName} {client.lastName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {client.email || 'Brak email'}
                    </span>
                  </div>
                  <Link
                    href={`/clients/${client.id}`}
                    className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Profil →
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
