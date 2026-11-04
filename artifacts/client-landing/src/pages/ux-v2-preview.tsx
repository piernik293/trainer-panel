/**
 * Dev-only visual preview of the new look of the portal (docs/screens/ux-v2/), outside Clerk, every /api call answered by an in-page mock.
 * ?screen=dzis|dzis-odpoczynek|dzis-nowe-konto|dzis-brak-planu|koniec|koniec-bol|story|postepy|postepy-nowe|ty|ty-bez-nicka|przerwa|przerwa-koniec|edycja
 */
import { useEffect, useRef } from "react";
import { PortalShell } from "@/components/shell/PortalShell";
import type { ShellTab } from "@/components/shell/BottomBar";
import { HomeV2 } from "@/components/v2/HomeV2";
import { FinishV2, storyDataFor } from "@/components/v2/FinishV2";
import { ProgressV2 } from "@/components/v2/ProgressV2";
import { YouV2, EditProfile } from "@/components/v2/YouV2";
import { RestTimer } from "@/components/timer/RestTimer";
import { RoleRows } from "@/components/shell/RoleRows";
import { StepsTile } from "@/components/StepsTile";
import { ThemeSelect } from "@/components/ThemeSelect";
import { BreathingSetting } from "@/components/BreathingSetting";
import { LegalLinks } from "@/components/LegalLinks";
import { drawStory, STORY_H, STORY_W } from "@/lib/v2/story";
import { FALLBACK_PROFILE } from "@/lib/v2/profile";
import { startRest } from "@/lib/timer/rest";
import type { CatalogueItem, Overview } from "@/lib/v2/achievements";
import type { RunState } from "@/lib/training/run";
import type { Summary } from "@/components/training/TrainingFlow";
import type { TrainingDay } from "@/lib/training/types";

const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const SCREEN = params.get("screen") ?? "dzis";
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ex = (i: number, name: string, reps: string, sets = 3) => ({ planExerciseId: i, exerciseId: i, name, muscleGroup: "x", equipment: [], sets, reps, repMin: 8, repMax: 10, rir: 2, restText: "90 s", weightStepKg: 2, showWeight: true, howTo: null, note: null, videoUrl: null, imageUrl: null, previous: [], record: null, history: [] });
const DAY = {
  planDayId: 11, weekday: "wtorek", position: { index: 2, total: 3 }, name: "Góra ciała", estimatedMinutes: 50, exerciseCount: 5, equipment: ["hantle"], trainerNote: null,
  exercises: [ex(1, "Wyciskanie hantli leżąc", "8–10", 4), ex(2, "Wiosłowanie hantlem", "10–12"), ex(3, "Wyciskanie nad głowę", "8–10"), ex(4, "Uginanie ramion", "12"), ex(5, "Prostowanie ramion", "12")],
  warmup: [{ name: "Marsz", detail: "1 min", description: "" }, { name: "Krążenia", detail: "10 ×", description: "" }], cooldown: [{ name: "Rozciąganie", detail: "30 s", description: "" }], activeSession: null, warmupMinutes: 5,
};
const TODAY_DATA = { client: { firstName: "Anna" }, plan: { id: 1, title: "Plan" }, week: { done: SCREEN === "dzis-nowe-konto" ? 0 : 1, target: 3 }, lastSession: null, today: SCREEN === "dzis-odpoczynek" ? null : DAY, next: SCREEN === "dzis-odpoczynek" ? { ...DAY, name: "Dół ciała" } : null };
const SHIFT = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const NOW = new Date().toISOString().slice(0, 10);
const STEPS = { today: NOW, goal: 8000, todaySteps: 5400, todayPercent: 68, days: Array.from({ length: 7 }, (_, i) => ({ date: SHIFT(NOW, i - 6), steps: [7200, 9100, 8300, 6400, 10200, 8800, 5400][i]! })), average: 7914, daysAtGoal: 4, averagePercent: 99 };

const item = (id: string, kind: string, title: string, state: CatalogueItem["state"], extra: Partial<CatalogueItem> = {}): CatalogueItem => ({ id, kind, title, hint: `Jak zdobyć: ${title.toLowerCase()}.`, state, progress: null, earnedAt: state === "earned" ? ago(3) : null, seen: true, ...extra });
const FULL: CatalogueItem[] = [
  item("m1", "milestone", "Pierwszy trening", "earned"), item("w4", "week_streak", "4 tygodnie z rzędu", "earned", { seen: false }), item("rec", "record", "Pierwszy rekord", "earned"),
  item("l1", "ladder_step", "Pompki klasyczne", "earned", { seen: false }),
  item("m10", "milestone", "10 treningów", "progress", { progress: { value: 8, target: 10 } }), item("w8", "week_streak", "8 tygodni z rzędu", "progress", { progress: { value: 4, target: 8 } }),
  item("fm", "first_month", "Pierwszy miesiąc", "locked"), item("m25", "milestone", "25 treningów", "locked"), item("m50", "milestone", "50 treningów", "locked"), item("w12", "week_streak", "12 tygodni z rzędu", "locked"),
];
const OVERVIEW: Overview = { streakWeeks: 4, sessionCount: 8, recordCount: 5, earnedCount: 4, total: FULL.length, items: FULL };
const NEW_OVERVIEW: Overview = { streakWeeks: null, sessionCount: 0, recordCount: 0, earnedCount: 0, total: 9, items: [item("m1", "milestone", "Pierwszy trening", "progress", { progress: { value: 0, target: 1 } }), item("w2", "week_streak", "2 tygodnie z rzędu", "progress", { progress: { value: 0, target: 2 } }), item("fm", "first_month", "Pierwszy miesiąc", "locked"), item("rec", "record", "Pierwszy rekord", "locked"), item("m10", "milestone", "10 treningów", "locked")] };
const PROFILE = { firstName: "Anna", displayName: null, nick: SCREEN === "ty-bez-nicka" ? null : "shiifuu", avatarColor: "#C2410C", colors: ["#C2410C", "#0F766E", "#1D4ED8", "#7E22CE", "#BE123C", "#4D7C0F"], trainsSince: "2026-10" };

export const isUxV2PreviewPath = () => import.meta.env.DEV && typeof window !== "undefined" && window.location.pathname.endsWith("/ux-v2-preview");
if (isUxV2PreviewPath()) {
  const realFetch = window.fetch.bind(window);
  const ROUTES: Record<string, unknown> = {
    "/api/client-portal/training/today": SCREEN === "dzis-brak-planu" ? null : TODAY_DATA, "/api/client-portal/steps": STEPS, "/api/client-portal/settings": { breathingCooldown: false },
    "/api/account/roles": { isTrainer: false, isClient: true, application: null }, "/api/client-portal/profile": PROFILE, "/api/account/status": { linked: false },
  };
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url).split("?")[0]!;
    if (url in ROUTES && ROUTES[url] !== null) return new Response(JSON.stringify(ROUTES[url]), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/")) return new Response("{}", { status: 404 });
    return realFetch(input, init);
  }) as typeof window.fetch;
}

const RUN = { rating: null, note: "", painAreas: [] } as unknown as RunState;
const SUM: Summary = { minutes: 48, sets: 15, kg: 3240, reps: 130, hadPain: false, weekDone: 2, weekTarget: 3, records: [{ name: "Wyciskanie hantli leżąc", weightKg: 24, reps: 8, gainKg: 2 }] };
const noop = () => {};

function StoryPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (c) drawStory(c, storyDataFor(DAY as unknown as TrainingDay, SUM, { streakWeeks: 4, nick: "shiifuu" }, new Date(2026, 10, 3)));
  }, []);
  return <canvas ref={ref} width={STORY_W} height={STORY_H} style={{ width: 375, height: 667, display: "block" }} aria-label="Story 9:16" />;
}

export default function UxV2PreviewPage() {
  const profile = { ...FALLBACK_PROFILE("Anna"), ...PROFILE };
  const home = (
    <PortalShell tab={"dzis" as ShellTab} onTab={noop}>
      <HomeV2 profile={profile} reloadKey={0} streakWeeks={SCREEN === "dzis-nowe-konto" ? null : 4} achievements={(SCREEN === "dzis-nowe-konto" ? NEW_OVERVIEW : OVERVIEW).items} onStart={noop} onRamp={noop} onOpenYou={noop} />
    </PortalShell>
  );
  switch (SCREEN) {
    case "dzis": case "dzis-odpoczynek": case "dzis-nowe-konto": case "dzis-brak-planu": return home;
    case "koniec": case "koniec-bol":
      return <div className="mx-auto min-h-screen max-w-lg bg-background px-5 pb-6 pt-7 text-foreground"><FinishV2 day={DAY as unknown as TrainingDay} run={RUN} sum={{ ...SUM, hadPain: SCREEN === "koniec-bol" }} v2={{ streakWeeks: 4, nick: "shiifuu" }} onFeedback={noop} onFinish={noop} /></div>;
    case "story": return <div style={{ background: "#000" }}><StoryPreview /></div>;
    case "postepy": case "postepy-nowe":
      return <PortalShell tab={"postepy" as ShellTab} onTab={noop}><ProgressV2 overview={SCREEN === "postepy" ? OVERVIEW : NEW_OVERVIEW} records={[]} activityDays={SCREEN === "postepy" ? Array.from({ length: 90 }, (_, i) => SHIFT(NOW, -i)).filter((_, i) => i % 3 !== 1) : []} today={NOW} steps={<StepsTile />} /></PortalShell>;
    case "ty": case "ty-bez-nicka":
      return <PortalShell tab={"ty" as ShellTab} onTab={noop}><YouV2 profile={profile} featured={FULL.filter((i) => i.state === "earned")} trainerRow={<RoleRows part="trainer" bare trainerName={null} onJoin={noop} />} applyRow={<RoleRows part="apply" bare trainerName={null} onJoin={noop} />} appearance={<ThemeSelect />} privacy={<BreathingSetting />} legal={<LegalLinks className="justify-start" />} onEdited={noop} onAllAchievements={noop} onSignOut={noop} /></PortalShell>;
    case "edycja": return <PortalShell tab={"ty" as ShellTab} onTab={noop}><EditProfile profile={profile} onSaved={noop} onCancel={noop} /></PortalShell>;
    case "przerwa": return <RestTimer state={startRest(90, "Seria 2 z 3")} counter={1} onChange={noop} onClose={noop} />;
    case "przerwa-koniec": return <RestTimer state={{ endsAt: Date.now() - 1000, total: 90, next: "Seria 2 z 3" }} counter={1} onChange={noop} onClose={noop} />;
    default: return home;
  }
}
