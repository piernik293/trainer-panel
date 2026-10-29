/** Containers of the new portal shell: they fetch data and talk to Clerk; the screens themselves are presentational (ProgressScreen, YouScreen, SoloStart). */
import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { ThemeSelect } from "@/components/ThemeSelect";
import { BreathingSetting } from "@/components/BreathingSetting";
import { HealthConsentSetting } from "@/components/HealthConsentSetting";
import { TrainerApplyCard } from "@/components/TrainerApplyCard";
import { LegalLinks } from "@/components/LegalLinks";
import { StepsTile } from "@/components/StepsTile";
import type { AccountStatus } from "@/components/AccountNotice";
import { ProgressScreen, type AchievementItem } from "./ProgressScreen";
import { YouScreen } from "./YouScreen";
import { SoloStart } from "./SoloStart";

const todayWarsaw = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const base = () => import.meta.env.BASE_URL.replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T | null> {
  try { const r = await fetch(path, { credentials: "include" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function ProgressContainer({ achievementsOn }: { achievementsOn: boolean }) {
  const [data, setData] = useState<{ items: AchievementItem[]; streakWeeks: number | null; days: string[] } | null>(null);
  useEffect(() => {
    if (!achievementsOn) { setData({ items: [], streakWeeks: null, days: [] }); return; }
    let alive = true;
    void (async () => {
      const [a, act] = await Promise.all([
        getJson<{ items: AchievementItem[]; streakWeeks: number | null }>("/api/client-portal/achievements"),
        getJson<{ days: string[] }>("/api/client-portal/activity"),
      ]);
      if (!alive) return;
      setData({ items: a?.items ?? [], streakWeeks: a?.streakWeeks ?? null, days: act?.days ?? [] });
      // what was just shown counts as seen (the "Nowe" mark stays on screen for this visit)
      if (a?.items.some((i) => !i.seen)) void fetch("/api/client-portal/achievements/seen", { method: "POST", credentials: "include" }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [achievementsOn]);
  if (!data) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Ładowanie" /></div>;
  return <ProgressScreen items={data.items} streakWeeks={data.streakWeeks} activityDays={data.days} today={todayWarsaw()} steps={<StepsTile />} showAchievements={achievementsOn} />;
}

export function YouContainer({ firstName, lastName }: { firstName: string; lastName: string }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { let alive = true; void getJson<AccountStatus>("/api/account/status").then((s) => { if (alive) setStatus(s); }); return () => { alive = false; }; }, []);
  return (
    <YouScreen
      firstName={firstName} lastName={lastName} email={user?.primaryEmailAddress?.emailAddress ?? ""}
      trainerName={status?.linked ? status.trainerName ?? "Twój trener" : null} pendingTrainerName={status?.pendingTrainerName ?? null}
      settings={<><ThemeSelect /><BreathingSetting /><HealthConsentSetting /></>}
      trainerApply={<TrainerApplyCard />}
      legal={<LegalLinks className="justify-start" />}
      signingOut={signingOut}
      onSignOut={async () => { if (signingOut) return; setSigningOut(true); try { await signOut({ redirectUrl: `${import.meta.env.BASE_URL}plan` }); } finally { setSigningOut(false); } }}
      onJoin={(path) => window.location.assign(`${base()}${path}`)}
    />
  );
}

/** For a signed-in person without a plan: when SOLO_ENABLED is on this replaces the "Wkrótce" notice. A person with a trainer sees nothing. */
export function SoloGate({ onStatus }: { onStatus?: (s: AccountStatus | null) => void }) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null; created: boolean }>({ busy: false, error: null, created: false });
  useEffect(() => { let alive = true; void getJson<AccountStatus>("/api/account/status").then((s) => { if (alive) { setStatus(s); onStatus?.(s); } }); return () => { alive = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!status || status.linked) return null;
  const start = async (firstName: string) => {
    setState({ busy: true, error: null, created: false });
    try {
      const r = await fetch("/api/solo/start", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName }) });
      if (!r.ok) throw new Error(String(r.status));
      setState({ busy: false, error: null, created: true });
    } catch { setState({ busy: false, error: "Nie udało się zacząć. Spróbuj ponownie za chwilę.", created: false }); }
  };
  return (
    <div className="space-y-6">
      <SoloStart onStart={(n) => void start(n)} interviewReady={false} busy={state.busy} error={state.error} created={state.created} />
      <div className="mx-auto max-w-sm px-4"><TrainerApplyCard /></div>
    </div>
  );
}
