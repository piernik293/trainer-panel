import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface WeeklyDay {
  name: string;
  type: string;
  note: string;
  exercises?: string[];
}

interface PlanReadySummaryProps {
  split: string;
  trainingDays: number;
  sessionDurationMinutes: number;
  priority: string;
  status: string;
  whyThisPlan: string[];
  warnings: string[];
  suggestions: string[];
  weeklyLayout: WeeklyDay[];
  clientProfile: {
    level: string;
    goal: string;
    days: number;
    duration: number;
    priorities: string[];
    preferredExercises: string[];
    restrictions: string[];
  };
  onEditAssumptions?: () => void;
  onRegenerate?: () => void;
  onSavePlan?: () => void;
  isSaving?: boolean;
}

export function PlanReadySummary({
  split,
  trainingDays,
  sessionDurationMinutes,
  priority,
  status,
  whyThisPlan,
  warnings,
  suggestions,
  weeklyLayout,
  clientProfile,
  onEditAssumptions,
  onRegenerate,
  onSavePlan,
  isSaving,
}: PlanReadySummaryProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Nagłówek */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Plan treningowy</h1>
        <p className="text-sm text-muted-foreground">
          Wygenerowany na podstawie profilu klienta i założeń planu
        </p>
      </div>

      {/* Szybki przegląd */}
      <Card>
        <CardHeader>
          <CardTitle>Szybki przegląd</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Split</span>
            <p className="font-medium">{split}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Liczba dni</span>
            <p className="font-medium">{trainingDays}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Czas sesji</span>
            <p className="font-medium">{sessionDurationMinutes} min</p>
          </div>
          <div>
            <span className="text-muted-foreground">Priorytet</span>
            <p className="font-medium">{priority}</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Status planu</span>
            <p className="font-medium">{status}</p>
          </div>
        </CardContent>
      </Card>

      {/* Dlaczego taki plan? */}
      <Card>
        <CardHeader>
          <CardTitle>Dlaczego taki plan?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {whyThisPlan.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Ostrzeżenia i rekomendacje */}
      <Card>
        <CardHeader>
          <CardTitle>Ostrzeżenia i rekomendacje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {warnings.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium">Ostrzeżenia</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium">Rekomendacje</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length === 0 && suggestions.length === 0 && (
            <p className="text-muted-foreground">Brak ostrzeżeń i rekomendacji.</p>
          )}
        </CardContent>
      </Card>

      {/* Rozkład tygodnia */}
      <Card>
        <CardHeader>
          <CardTitle>Rozkład tygodnia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {weeklyLayout.map((day, i) => (
              <Card key={i} className="bg-muted/30">
                <CardContent className="p-3 text-sm">
                  <p className="font-medium">{day.name}</p>
                  <p className="text-muted-foreground">{day.type}</p>
                  {day.exercises && day.exercises.length > 0 ? (
                    <ul className="mt-2 space-y-0.5">
                      {day.exercises.map((ex, j) => (
                        <li key={j} className="text-xs text-muted-foreground leading-snug">
                          {ex}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">{day.note}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Profil klienta */}
      <Card className="bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base">Profil klienta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-xs uppercase tracking-wide">Poziom</span>
              <span className="font-medium text-foreground">{clientProfile.level}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide">Cel</span>
              <span className="font-medium text-foreground">{clientProfile.goal}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide">Dni</span>
              <span className="font-medium text-foreground">{clientProfile.days}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide">Czas</span>
              <span className="font-medium text-foreground">{clientProfile.duration} min</span>
            </div>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide">Priorytety</span>
            <p className="font-medium text-foreground">
              {clientProfile.priorities.join(", ") || "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide">Preferowane ćwiczenia</span>
            <p className="font-medium text-foreground">
              {clientProfile.preferredExercises.join(", ") || "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide">Ograniczenia</span>
            <p className="font-medium text-foreground">
              {clientProfile.restrictions.join(", ") || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bottom action row */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={onEditAssumptions}>
          Edytuj założenia
        </Button>
        <Button variant="outline" onClick={onRegenerate}>
          Wygeneruj ponownie
        </Button>
        <Button onClick={onSavePlan} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <><Loader2 size={14} className="animate-spin" />Zapisywanie…</>
          ) : "Zapisz plan"}
        </Button>
      </div>
    </div>
  );
}
