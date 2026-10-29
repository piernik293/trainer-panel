/**
 * Dev-only visual preview of the new portal shell and the Solo screens (docs/screens/solo/). Mounted only when import.meta.env.DEV (see App.tsx),
 * outside Clerk, with every /api call answered by an in-page mock. ?screen=solo-start|solo-created|dzis|plan|postepy|postepy-puste|ty|ty-solo
 */
import { useState } from "react";
import { PortalShell } from "@/components/shell/PortalShell";
import { SoloStart } from "@/components/shell/SoloStart";
import { ProgressScreen, type AchievementItem } from "@/components/shell/ProgressScreen";
import { YouScreen } from "@/components/shell/YouScreen";
import type { ShellTab } from "@/components/shell/BottomBar";
import { TodayCard } from "@/components/training/TodayCard";
import { StepsTile } from "@/components/StepsTile";
import { ThemeSelect } from "@/components/ThemeSelect";
import { BreathingSetting } from "@/components/BreathingSetting";
import { TrainerApplyCard } from "@/components/TrainerApplyCard";
import { LegalLinks } from "@/components/LegalLinks";
import { PlanView } from "./plan";

const TODAY = new Date().toISOString().slice(0, 10);
const shift = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// a believable year: three trainings a week with some gaps
// a believable year: about three trainings a week, a few weeks off (deterministic pseudo-random)
const hash = (n: number) => { let x = (n + 1) * 2654435761 % 4294967296; x ^= x >>> 13; return (x % 1000) / 1000; };
const ACTIVE_DAYS = Array.from({ length: 330 }, (_, i) => i).filter((i) => !(i > 150 && i < 172) && hash(i) < 0.3).map((i) => shift(TODAY, -i));
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ITEMS: AchievementItem[] = [
  { id: 6, kind: "ladder_step", title: "Nowy szczebel: Pompki klasyczne", body: "Nowy poziom tego ruchu!", earnedAt: ago(1), seen: false },
  { id: 5, kind: "week_streak", title: "4 tygodnie z rzędu", body: "Trenujesz regularnie — tak trzymaj.", earnedAt: ago(3), seen: false },
  { id: 4, kind: "record", title: "Nowy rekord: Przysiad ze sztangą", body: "62,5 kg × 8 (o 2,5 kg więcej niż dotąd)", earnedAt: ago(4), seen: true },
  { id: 3, kind: "milestone", title: "10. trening", body: "Tak trzymaj — to naprawdę się sumuje.", earnedAt: ago(12), seen: true },
  { id: 2, kind: "record", title: "Nowy rekord: Wyciskanie hantli leżąc", body: "22 kg × 10 (o 2 kg więcej niż dotąd)", earnedAt: ago(20), seen: true },
  { id: 1, kind: "milestone", title: "Pierwszy trening za Tobą", body: "Najtrudniejszy krok zrobiony.", earnedAt: ago(34), seen: true },
];
const ex = (i: number, name: string, group: string, reps: string) => ({ planExerciseId: i, exerciseId: i, name, muscleGroup: group, equipment: [], sets: 3, reps, repMin: 8, repMax: 10, rir: 2, restText: "przerwa 90 s", weightStepKg: 2.5, showWeight: true, howTo: null, note: null, videoUrl: null, imageUrl: null, previous: [], record: null, history: [] });
const TODAY_DATA = {
  client: { firstName: "Anna" }, plan: { id: 1, title: "Plan siłowy 3 dni" }, week: { done: 1, target: 3 }, lastSession: { id: 9, completedAt: ago(2), dayName: "Dzień A" },
  today: {
    planDayId: 11, weekday: "środa", position: { index: 2, total: 3 }, name: "Dzień B — dół ciała", estimatedMinutes: 55, exerciseCount: 5, equipment: ["hantle", "ławka"], trainerNote: null,
    exercises: [ex(1, "Przysiad goblet", "Nogi", "10"), ex(2, "Martwy ciąg rumuński z hantlami", "Nogi", "10"), ex(3, "Wykrok w tył", "Nogi", "8"), ex(4, "Glute bridge", "Pośladki", "12"), ex(5, "Plank", "Brzuch", "30 s")],
    warmup: [{ name: "Marsz w miejscu", detail: "1 min", description: "" }, { name: "Krążenia bioder", detail: "10 ×", description: "" }, { name: "Przysiad powitalny", detail: "8 ×", description: "" }],
    cooldown: [{ name: "Rozciąganie czworogłowego", detail: "30 s", description: "" }, { name: "Skłon w siadzie", detail: "30 s", description: "" }],
    activeSession: null,
  },
  next: null,
};
const STEPS = { today: TODAY, goal: 8000, todaySteps: 5400, todayPercent: 68, days: Array.from({ length: 7 }, (_, i) => ({ date: shift(TODAY, i - 6), steps: [7200, 9100, 8300, 6400, 10200, 8800, 5400][i]! })), average: 7914, daysAtGoal: 4, averagePercent: 99 };
const PLAN = {
  id: 1, clientId: 1, title: "Plan siłowy 3 dni", goal: "Budowa siły i masy mięśniowej", description: null, startDate: null, endDate: null, status: "active", updatedAt: new Date().toISOString(), cardioRecommendation: null,
  days: [
    { id: 1, planId: 1, dayOrder: 1, dayName: "Dzień A", subtitle: "Góra ciała", description: null, estimatedDurationMinutes: 55, exercises: [] },
    { id: 2, planId: 1, dayOrder: 2, dayName: "Dzień B", subtitle: "Dół ciała", description: null, estimatedDurationMinutes: 60, exercises: [] },
    { id: 3, planId: 1, dayOrder: 3, dayName: "Dzień C", subtitle: "Całe ciało", description: null, estimatedDurationMinutes: 50, exercises: [] },
  ],
} as never;

const ROUTES: Record<string, unknown> = {
  "/api/client-portal/training/today": TODAY_DATA,
  "/api/client-portal/steps": STEPS,
  "/api/client-portal/settings": { breathingCooldown: false },
  "/api/account/roles": { isTrainer: false, isClient: true, application: null },
  "/api/client-portal/booking": { bookable: false },
  "/api/client-portal/history": { items: [], hasMore: false, offset: 0, limit: 12 },
  "/api/client-portal/package": null,
};
// Atrapa API TYLKO na stronie podglądu (dev, /solo-preview). Ten moduł jest importowany przez App.tsx, więc podmiana fetch
// nie może wykonywać się przy samym imporcie — inaczej psuje wszystkie wywołania API w całym portalu (także w produkcji).
export const isSoloPreviewPath = () => import.meta.env.DEV && typeof window !== "undefined" && window.location.pathname.endsWith("/solo-preview");
if (isSoloPreviewPath()) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url).split("?")[0]!;
    if (url in ROUTES && ROUTES[url] !== null) return new Response(JSON.stringify(ROUTES[url]), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/")) return new Response("{}", { status: 404 });
    return realFetch(input, init);
  }) as typeof window.fetch;
}

const params = new URLSearchParams(window.location.search);
const SCREEN = params.get("screen") ?? "dzis";

export default function SoloPreviewPage() {
  const [tab, setTab] = useState<ShellTab>(SCREEN === "plan" ? "plan" : SCREEN.startsWith("postepy") ? "postepy" : SCREEN.startsWith("ty") ? "ty" : "dzis");
  if (SCREEN === "solo-start" || SCREEN === "solo-created") {
    return <div className="min-h-screen bg-background text-foreground"><SoloStart onStart={() => {}} interviewReady={false} created={SCREEN === "solo-created"} /></div>;
  }
  return (
    <PortalShell tab={tab} onTab={setTab}>
      {tab === "dzis" && (
        <div className="space-y-6">
          <div><p className="section-label">Dziś</p><h1 className="text-2xl font-bold tracking-tight">Cześć, Anna!</h1></div>
          <TodayCard reloadKey={0} onStart={() => {}} onRamp={() => {}} />
          <StepsTile compact />
        </div>
      )}
      {tab === "plan" && <PlanView client={{ id: 1, firstName: "Anna", lastName: "Testowa" } as never} plan={PLAN} onSelectDay={() => {}} embedded />}
      {tab === "postepy" && (
        SCREEN === "postepy-puste"
          ? <ProgressScreen items={[]} streakWeeks={null} activityDays={[]} today={TODAY} steps={<StepsTile />} />
          : <ProgressScreen items={ITEMS} streakWeeks={4} activityDays={ACTIVE_DAYS} today={TODAY} steps={<StepsTile />} />
      )}
      {tab === "ty" && (
        <YouScreen
          firstName="Anna" lastName="Testowa" email="anna@example.com" trainerName={SCREEN === "ty-solo" ? null : "Marek Nowak"}
          settings={<><ThemeSelect /><BreathingSetting /></>} trainerApply={<TrainerApplyCard />} legal={<LegalLinks className="justify-start" />}
          onSignOut={() => {}} onJoin={() => {}}
        />
      )}
    </PortalShell>
  );
}
