import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { AlertTriangle, CalendarCheck, FileText, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";
import { useDashboardSummary, type DashboardSummary } from "@/lib/dashboardApi";
import { formatPolishDate, headerSentence } from "@/lib/dashboardFormat";
import { useSubscriptionSummary } from "@/lib/use-subscription-summary";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { RecentEventsCard, TodayCard } from "@/components/dashboard/SideColumn";
import { ExcelCard, FirstStepsCard, WillAppearCard } from "@/components/dashboard/FirstDay";

function Tile({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="section-label">{label}</p>
          <p className="stat-number">{value}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function LimitBar() {
  const { data } = useSubscriptionSummary();
  const clients = data?.usage.clients;
  if (!clients?.atLimit) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning"
      data-testid="limit-bar"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">
        Osiągnąłeś limit klientów w planie {data?.plan.name ?? "Free"} ({clients.used}/{clients.limit}).
      </span>
      <Link href="/settings#plan-i-limity" className="inline-flex min-h-11 items-center font-semibold underline">
        Plan i limity
      </Link>
    </div>
  );
}

function Greeting({ summary, welcome }: { summary: DashboardSummary; welcome?: boolean }) {
  const { user } = useUser();
  const name = user?.firstName ?? summary.trainerName ?? null;
  const [, navigate] = useLocation();
  const todayCount = summary.todayBookings.length;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground" data-testid="dashboard-date">
          {formatPolishDate(summary.today)}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          {welcome ? "Witaj" : "Dzień dobry"}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-muted-foreground" data-testid="dashboard-sentence">
          {welcome
            ? "Zacznij od pierwszego klienta. Reszta pulpitu wypełni się sama."
            : headerSentence(summary.attention.total, todayCount)}
        </p>
      </div>
      {!welcome && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
            onClick={() => navigate("/clients")}
            data-testid="action-new-plan"
          >
            Nowy plan
          </button>
          <button
            type="button"
            className={cn(buttonVariants(), "min-h-11")}
            onClick={() => navigate("/survey-invite")}
            data-testid="action-invite"
          >
            Zaproś klienta
          </button>
        </div>
      )}
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Ładowanie pulpitu" data-testid="dashboard-skeleton">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useDashboardSummary();

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Pulpit</h1>
        <ErrorState
          title="Nie udało się wczytać pulpitu"
          message={humanizeError(error)}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // ── First day: no clients ───────────────────────────────────────────────
  if (data.counts.totalClients === 0) {
    const allDone = data.onboarding.completed === data.onboarding.total;
    return (
      <div className="space-y-6 animate-in fade-in duration-500" data-testid="dashboard-empty-state">
        <Greeting summary={data} welcome />
        <LimitBar />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {!allDone && <FirstStepsCard onboarding={data.onboarding} />}
            <ExcelCard onAdd={() => navigate("/clients/new")} />
          </div>
          <WillAppearCard />
        </div>
      </div>
    );
  }

  // ── With clients ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="dashboard-populated">
      <Greeting summary={data} />
      <LimitBar />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="dashboard-tiles">
        <Tile label="Aktywni klienci" value={data.counts.activeClients} icon={Users} />
        <Tile label="Nowe wywiady do przejrzenia" value={data.counts.newInterviews} icon={FileText} />
        <Tile label="Plany kończące się w 7 dni" value={data.counts.plansEndingSoon} icon={CalendarCheck} />
        {/* TODO(docs/ROADMAP.md pkt 4): kafelki "Na dobrej drodze / Wymaga uwagi / Zagrożeni"
            według realizacji planu — dopiero gdy klienci zapisują treningi. Nie pokazujemy
            pustych ani udawanych kafelków. */}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.onboarding.completed < data.onboarding.total && <FirstStepsCard onboarding={data.onboarding} />}
          <AttentionList items={data.attention.items} total={data.attention.total} today={data.today} />
          {/* TODO(docs/ROADMAP.md pkt 4): powody wymagające zapisanych treningów
              (zgłoszony ból, przerwa w treningach, spadek realizacji, rekordy). */}
        </div>
        <div className="space-y-6">
          <TodayCard bookings={data.todayBookings} />
          <RecentEventsCard events={data.recentEvents} today={data.today} />
        </div>
      </div>
    </div>
  );
}
