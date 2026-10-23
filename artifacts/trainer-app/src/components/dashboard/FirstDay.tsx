import { Link } from "wouter";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/lib/dashboardApi";

const STEP_HINT: Partial<Record<string, string>> = {
  plan: "Generator zaproponuje szkic. Ty decydujesz, co zostaje.",
};

const STEP_ACTION: Partial<Record<string, { label: string; href: string }>> = {
  invite: { label: "Wygeneruj link", href: "/survey-invite" },
};

export function FirstStepsCard({ onboarding }: { onboarding: DashboardSummary["onboarding"] }) {
  return (
    <Card className="border-border/50 shadow-sm" data-testid="first-steps">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Pierwsze kroki</CardTitle>
          <span className="text-sm text-muted-foreground" data-testid="first-steps-count">
            {onboarding.completed} z {onboarding.total}
          </span>
        </div>
        <Progress
          value={(onboarding.completed / onboarding.total) * 100}
          aria-label={`Ukończono ${onboarding.completed} z ${onboarding.total} pierwszych kroków`}
        />
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {onboarding.steps.map((step, i) => {
            const isNext = onboarding.next === step.key;
            const action = isNext ? STEP_ACTION[step.key] : undefined;
            return (
              <li
                key={step.key}
                aria-current={isNext ? "step" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-lg p-2",
                  isNext && "bg-primary/5 ring-1 ring-primary/30",
                  step.done && "text-muted-foreground",
                )}
                data-testid={`first-step-${step.key}`}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    step.done ? "border-green-700 bg-green-700 text-white" : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", step.done && "line-through decoration-1")}>
                    {step.title}
                    {step.done && <span className="sr-only"> — ukończone</span>}
                    {isNext && <span className="sr-only"> — następny krok</span>}
                  </p>
                  {STEP_HINT[step.key] && !step.done && (
                    <p className="mt-1 text-sm text-muted-foreground">{STEP_HINT[step.key]}</p>
                  )}
                  {action && (
                    <Link
                      href={action.href}
                      className={cn(buttonVariants({ size: "sm" }), "mt-2 min-h-11 w-full sm:w-auto")}
                    >
                      {action.label}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function WillAppearCard() {
  return (
    <Card className="border-border/50 shadow-sm" data-testid="will-appear">
      <CardHeader>
        <CardTitle className="text-lg">Tu pojawi się</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">Kto wymaga uwagi</dt>
            <dd className="text-muted-foreground">Nowe wywiady, klienci bez planu i plany, które się kończą.</dd>
          </div>
          <div>
            <dt className="font-medium">Dzisiejsze treningi</dt>
            <dd className="text-muted-foreground">Rezerwacje z Twojego kalendarza na dziś.</dd>
          </div>
          <div>
            <dt className="font-medium">Postępy klientów</dt>
            <dd className="text-muted-foreground">Gdy klienci zaczną zapisywać treningi.</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function ExcelCard({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Masz klientów w Excelu lub notatkach?</CardTitle>
        <CardDescription>Dodaj ich ręcznie i zacznij od planu.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="min-h-11 w-full sm:w-auto" data-testid="empty-action-add-manual" onClick={onAdd}>
          Dodaj klienta ręcznie
        </Button>
      </CardContent>
    </Card>
  );
}
