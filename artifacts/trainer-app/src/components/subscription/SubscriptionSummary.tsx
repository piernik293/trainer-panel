import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptionSummary, UsageStat } from "@/lib/use-subscription-summary";
import { Check, Sparkles, Users, Activity, Clock, Zap, ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

function UsageBar({ stat, label, icon: Icon }: { stat: UsageStat, label: string, icon: React.ElementType }) {
  const percent = stat.limit ? Math.min(100, Math.round((stat.used / stat.limit) * 100)) : 0;
  const isDanger = stat.atLimit || (stat.limit && percent >= 90);
  
  return (
    <div className="space-y-2" data-testid={`usage-stat-${stat.label}`}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </div>
        <span className="font-medium text-foreground">
          {stat.used} {stat.limit ? <span className="text-muted-foreground">/ {stat.limit}</span> : <span className="text-muted-foreground">/ nielimitowane</span>}
        </span>
      </div>
      
      {stat.limit ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full flex-1 transition-all ${isDanger ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-full bg-primary/40" />
        </div>
      )}
      
      {isDanger && stat.remaining !== null && (
        <p className="text-xs text-destructive font-medium">
          Pozostało: {stat.remaining}
        </p>
      )}
    </div>
  );
}

export function SubscriptionSummary({ context = "dashboard" }: { context?: "dashboard" | "settings" }) {
  const { data, isLoading, isError } = useSubscriptionSummary();

  if (isLoading) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-destructive text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Brak dostępu do subskrypcji
          </CardTitle>
          <CardDescription className="text-destructive/80">
            Nie udało się załadować informacji o Twoim planie i limitach.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isFree = data.plan.code === "FREE";
  
  return (
    <div className="space-y-6" data-testid={`subscription-summary-${context}`}>
      <Card className="border-border/50 shadow-sm relative overflow-hidden">
        {/* Subtle background glow for higher plans */}
        {!isFree && (
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-32 h-32 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
        )}
        
        <CardHeader className="pb-6 border-b border-border/30 bg-muted/20">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                Plan {data.plan.name}
                {!isFree && <Zap className="w-4 h-4 text-primary fill-primary/20" />}
              </CardTitle>
              <CardDescription className="mt-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Limit generatora odnawia się: {format(parseISO(data.resetsAt), 'd MMMM yyyy', { locale: pl })}
              </CardDescription>
            </div>
            <div className={`px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide uppercase ${
              isFree ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary'
            }`}>
              {data.plan.code}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <UsageBar stat={data.usage.clients} label="Aktywni klienci" icon={Users} />
          <UsageBar stat={data.usage.planGenerations} label="Generacje planów (AI)" icon={Sparkles} />
          <UsageBar stat={data.usage.customExercises} label="Własne ćwiczenia" icon={Activity} />
        </CardContent>
      </Card>

      {context === "settings" && data.availablePlans && data.availablePlans.length > 1 && (
        <div className="pt-4 space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            Możliwości rozszerzenia konta
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.availablePlans.filter(p => p.code !== data.plan.code).map(plan => (
              <Card key={plan.code} className="border-border/50 shadow-sm flex flex-col bg-card hover:border-primary/30 transition-colors">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      <CardDescription className="font-medium text-foreground mt-1">
                        {plan.monthlyPricePln ? `${plan.monthlyPricePln} PLN / miesiąc` : 'Darmowy'}
                      </CardDescription>
                    </div>
                    {plan.code === 'UNLIMITED' && (
                      <span className="bg-primary text-primary-foreground text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-sm">
                        Max
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pt-0">
                  <ul className="space-y-2.5 text-sm text-muted-foreground">
                    {plan.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start gap-2.5 leading-snug">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
