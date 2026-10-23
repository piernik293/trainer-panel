import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSummary } from "@/lib/dashboardApi";
import { EVENT_TEXT, formatTime } from "@/lib/dashboardFormat";

export function TodayCard({ bookings }: { bookings: DashboardSummary["todayBookings"] }) {
  return (
    <Card className="border-border/50 shadow-sm" data-testid="today-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">Dziś</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {bookings.length === 0 ? (
          <div className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">Brak zaplanowanych treningów.</p>
            <Link href="/calendar" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
              Otwórz Kalendarz
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-4 text-sm">
                <span className="w-12 shrink-0 font-semibold tabular-nums">{formatTime(b.startsAt)}</span>
                <Link href={`/clients/${b.clientId}`} className="min-w-0 flex-1 font-medium hover:underline break-words">
                  {b.clientName}
                </Link>
                <span className="shrink-0 text-muted-foreground">Trening, {b.durationMinutes} min</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentEventsCard({ events, today }: { events: DashboardSummary["recentEvents"]; today: string }) {
  if (events.length === 0) return null;
  const day = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
  const when = (iso: string) => {
    const d = day(today) - day(iso);
    return d <= 0 ? "dziś" : d === 1 ? "wczoraj" : `${d} dni temu`;
  };
  return (
    <Card className="border-border/50 shadow-sm" data-testid="recent-events">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">Ostatnie zdarzenia</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/50">
          {events.map((e, i) => (
            <li key={`${e.type}-${e.clientId}-${i}`} className="p-4 text-sm">
              <Link href={`/clients/${e.clientId}`} className="font-medium hover:underline">
                {e.clientName}
              </Link>{" "}
              <span className="text-muted-foreground">
                {EVENT_TEXT[e.type]} · {when(e.at)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
