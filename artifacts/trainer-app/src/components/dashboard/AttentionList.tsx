import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getInitials } from "@/components/layout/AccountMenu";
import type { AttentionItem, AttentionKind } from "@/lib/dashboardApi";
import { formatWhen } from "@/lib/dashboardFormat";

// The pill always carries a text label: colour only reinforces it.
const PILL: Record<AttentionKind, string> = {
  pain: "bg-destructive/10 text-destructive",
  interview: "bg-brand-soft text-primary",
  no_plan: "bg-warning-soft text-warning",
  plan_ending: "bg-warning-soft text-warning",
  invite_pending: "bg-muted text-foreground",
};

export function AttentionList({
  items,
  total,
  today,
}: {
  items: AttentionItem[];
  total: number;
  today: string;
}) {
  return (
    <Card className="border-border/50 shadow-sm" data-testid="attention-list">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/50">
        <CardTitle className="text-lg">Wymaga Twojej uwagi</CardTitle>
        <Link href="/clients" className="text-sm font-medium text-primary hover:underline min-h-11 inline-flex items-center">
          Wszyscy klienci
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground" data-testid="attention-empty">
            Nic nie czeka na Twoją reakcję.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item, i) => (
              <li
                key={`${item.kind}-${item.clientId ?? item.name}-${i}`}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                data-testid="attention-row"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback aria-hidden="true">{getInitials(item.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-words">{item.name}</span>
                      <span className={cn("rounded-sm px-2 py-0.5 text-xs font-semibold", PILL[item.kind])}>
                        {item.reasonLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description} <span className="whitespace-nowrap">· {formatWhen(item, today)}</span>
                    </p>
                  </div>
                </div>
                <Link
                  href={item.actionHref}
                  className={cn(buttonVariants({ variant: "outline" }), "min-h-11 w-full sm:w-auto")}
                >
                  {item.actionLabel}
                  <span className="sr-only"> — {item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > items.length && (
          <p className="border-t border-border/50 px-4 py-3 text-sm text-muted-foreground">
            Pokazano {items.length} z {total}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
