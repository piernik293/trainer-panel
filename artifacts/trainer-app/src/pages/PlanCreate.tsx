import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useListClientSurveys } from "@workspace/api-client-react";
import { useCreatePlan } from "@/lib/planApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

export default function PlanCreate() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [surveyId, setSurveyId] = useState<number | null>(null);

  const { data: surveys, isLoading: surveysLoading } = useListClientSurveys(clientId);

  const createPlan = useCreatePlan(clientId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Podaj tytuł planu", variant: "destructive" });
      return;
    }
    if (!surveyId) {
      toast({ title: "Wybierz wywiad treningowy", variant: "destructive" });
      return;
    }

    createPlan.mutate(
      { title: title.trim(), surveyId },
      {
        onSuccess: (plan) => {
          toast({ title: "Plan treningowy utworzony" });
          navigate(`/plans/${plan.id}`);
        },
        onError: (err) => {
          toast({ title: err.message ?? "Błąd podczas tworzenia planu", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-xl pb-12 animate-in fade-in duration-300">
      <div className="space-y-2">
        <Link
          href={`/clients/${clientId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Powrót do klienta
        </Link>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-primary" />
          Nowy plan treningowy
        </h1>
        <p className="text-muted-foreground text-sm">
          Plan zostanie oparty na wybranym wywiadzie treningowym i aktywnej wersji
          wytycznych objętości.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dane planu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Tytuł planu</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Plan siłowy — faza I"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="survey">Wywiad treningowy</Label>
              {surveysLoading ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : !surveys || surveys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Klient nie ma żadnych wywiadów. Najpierw wypełnij wywiad.
                </p>
              ) : (
                <Select
                  value={surveyId ? String(surveyId) : ""}
                  onValueChange={(v) => setSurveyId(Number(v))}
                >
                  <SelectTrigger id="survey">
                    <SelectValue placeholder="Wybierz wywiad treningowy" />
                  </SelectTrigger>
                  <SelectContent>
                    {surveys.map((s, i) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {i === 0 ? "Aktualny" : "Archiwalny"} —{" "}
                        {formatDate(s.createdAt)}
                        {s.experienceLevel ? ` (${s.experienceLevel})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={createPlan.isPending || !title.trim() || !surveyId}
                className="flex-1"
              >
                {createPlan.isPending ? "Tworzenie..." : "Utwórz plan"}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/clients/${clientId}`}>Anuluj</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
