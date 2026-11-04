import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarV2 } from "./Avatar";
import { kgLabel, shownName, trainsSinceLabel } from "@/lib/v2/helpers";
import { saveProfile, type ProfileV2 } from "@/lib/v2/profile";
import { fetchSummary, saveGoal, cacheSummary } from "@/lib/steps/sync";
import type { CatalogueItem } from "@/lib/v2/achievements";
import { setTimerSettings, useTimerSettings } from "@/lib/timer/settings";

function ListRow({ label, value, open, onToggle, children, testId }: { label: string; value?: string; open: boolean; onToggle: () => void; children?: ReactNode; testId: string }) {
  return (
    <div className="border-b border-border last:border-b-0" data-testid={testId}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">{value}<ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} aria-hidden /></span>
      </button>
      {open && <div className="px-4 pb-4 text-sm">{children}</div>}
    </div>
  );
}

/** Small badge next to the nick of a trainer's account. */
export function TrainerBadge() {
  return <span data-testid="trainer-badge" className="ml-2 inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 align-middle text-xs font-bold text-primary">Trener</span>;
}

/** Timer: sound and vibration on/off (default both on). The sound switch is the same state as the speaker button on the timer screen. */
function TimerSettingsRows() {
  const t = useTimerSettings();
  const row = (label: string, on: boolean, key: "sound" | "vibration") => (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => setTimerSettings({ [key]: e.target.checked })} className="h-6 w-11 cursor-pointer accent-[#C2410C]" />
    </label>
  );
  return <div className="space-y-1" data-testid="timer-settings">{row("Dźwięk stopera", t.sound, "sound")}{row("Wibracja", t.vibration, "vibration")}</div>;
}

/** Steps goal: presets or off; same API as the "Kroki" tile. */
function GoalEditor({ onChange }: { onChange: (goal: number | null) => void }) {
  const [goal, setGoal] = useState<number | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let alive = true; void fetchSummary().then((s) => { if (alive) setGoal(s.goal); }).catch(() => { if (alive) setGoal(null); }); return () => { alive = false; }; }, []);
  const pick = async (g: number | null) => {
    try { const s = await saveGoal(g); cacheSummary(s); setGoal(s.goal); onChange(s.goal); setErr(null); } catch { setErr("Nie udało się zapisać celu. Spróbuj, gdy wróci sieć."); }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cel kroków">
        {[6000, 8000, 10000, null].map((g) => (
          <button key={String(g)} type="button" role="radio" aria-checked={goal === g} onClick={() => void pick(g)}
            className={cn("min-h-11 rounded-lg border px-4 text-sm font-semibold", goal === g ? "border-primary bg-brand-soft text-primary" : "border-input bg-card")}>{g ? kgLabel(g) : "Bez celu"}</button>
        ))}
      </div>
      {err && <p role="alert" className="mt-2 text-destructive">{err}</p>}
    </div>
  );
}

/** Edit profile: nick (optional, unique), display name, avatar colour (6 to choose from, no photos yet). */
export function EditProfile({ profile, onSaved, onCancel }: { profile: ProfileV2; onSaved: () => void; onCancel: () => void }) {
  const [nick, setNick] = useState(profile.nick ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [color, setColor] = useState(profile.avatarColor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = shownName({ nick: nick.trim() || null, displayName: displayName.trim() || null, firstName: profile.firstName });
  // a nick can be changed once per 30 days; until then the field is read-only (the server enforces it too)
  const lockedUntil = profile.nickChangeAvailableAt && new Date(profile.nickChangeAvailableAt).getTime() > Date.now() ? new Date(profile.nickChangeAvailableAt) : null;
  const submit = async () => {
    setBusy(true); setError(null);
    const r = await saveProfile({ ...(lockedUntil ? {} : { nick: nick.trim() === "" ? null : nick.trim() }), displayName, avatarColor: color });
    setBusy(false);
    if (r.ok) onSaved(); else setError(r.error);
  };
  return (
    <form className="space-y-4 rounded-[20px] border border-border bg-card p-4" data-testid="edit-profile" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="flex justify-center"><AvatarV2 name={name} color={color} size={72} /></div>
      <div role="radiogroup" aria-label="Kolor awatara" className="flex justify-center gap-2">
        {profile.colors.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Kolor ${c}`} onClick={() => setColor(c)} className="flex h-11 w-11 items-center justify-center rounded-full">
            <span className={cn("h-8 w-8 rounded-full", color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-card")} style={{ background: c }} />
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="pv2-name" className="mb-1 block text-xs font-semibold text-muted-foreground">Wyświetlana nazwa</label>
        <input id="pv2-name" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder={profile.firstName} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base" />
      </div>
      <div>
        <label htmlFor="pv2-nick" className="mb-1 block text-xs font-semibold text-muted-foreground">Nick (opcjonalnie)</label>
        <input id="pv2-nick" value={nick} maxLength={21} autoCapitalize="none" autoCorrect="off" disabled={!!lockedUntil} onChange={(e) => setNick(e.target.value)} placeholder="np. ola_trenuje" className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base disabled:opacity-60" />
        <p className="mt-1 text-xs text-muted-foreground" data-testid="nick-hint">{lockedUntil
          ? `Nick możesz zmienić ponownie ${lockedUntil.toLocaleDateString("pl-PL")}.`
          : "3–20 znaków: litery, cyfry, _ lub kropka. Nick można zmienić raz na 30 dni; stary nick przez 30 dni nie jest dostępny dla innych."}</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-border bg-background font-bold">Anuluj</button>
        <button type="submit" disabled={busy} className="h-12 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60">{busy ? "Zapisuję…" : "Zapisz"}</button>
      </div>
    </form>
  );
}

/**
 * "Ty" in the new look: avatar + name + "@nick · trenuje od …", edit profile, featured achievements (3 latest), list (Mój trener, Cel kroków,
 * Wygląd, Prywatność i zgody) and, small at the bottom, "Prowadzę podopiecznych", legal documents and sign out.
 */
export function YouV2({ profile, featured, trainerRow, applyRow, appearance, privacy, legal, onEdited, onAllAchievements, onSignOut, signingOut = false }: {
  profile: ProfileV2; featured: readonly CatalogueItem[];
  trainerRow: ReactNode; applyRow: ReactNode; appearance: ReactNode; privacy: ReactNode; legal: ReactNode;
  onEdited: () => void; onAllAchievements: () => void; onSignOut: () => void; signingOut?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<"goal" | "look" | "timer" | "privacy" | null>(null);
  const [goal, setGoal] = useState<number | null | undefined>(undefined);
  useEffect(() => { let alive = true; void fetchSummary().then((s) => { if (alive) setGoal(s.goal); }).catch(() => {}); return () => { alive = false; }; }, []);
  const name = shownName(profile);
  const since = trainsSinceLabel(profile.trainsSince);
  const sub = [profile.nick ? `@${profile.nick}` : null, since].filter(Boolean).join(" · ");
  const toggle = (k: "goal" | "look" | "timer" | "privacy") => setOpen(open === k ? null : k);
  return (
    <div className="space-y-4" data-testid="you-v2">
      {editing ? (
        <EditProfile profile={profile} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onEdited(); }} />
      ) : (
        <section aria-label="Profil" className="flex flex-col items-center gap-1.5 pt-2 text-center">
          <AvatarV2 name={name} color={profile.avatarColor} size={88} />
          <h1 className="mt-1 text-2xl font-extrabold" data-testid="you-name">{name}{profile.isTrainer && <TrainerBadge />}</h1>
          {sub && <p className="text-sm text-muted-foreground" data-testid="you-sub">{sub}</p>}
          <button type="button" onClick={() => setEditing(true)} className="mt-1 flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-bold">Edytuj profil</button>
        </section>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="feat-h" className="space-y-2">
          <div className="flex items-baseline justify-between"><h2 id="feat-h" className="text-xs font-bold tracking-[0.08em] text-muted-foreground">WYRÓŻNIONE OSIĄGNIĘCIA</h2>
            <button type="button" onClick={onAllAchievements} className="flex min-h-11 items-center text-sm font-bold text-primary">Wszystkie</button></div>
          <ul className="grid grid-cols-3 gap-2" data-testid="featured">
            {featured.slice(0, 3).map((a) => <li key={a.id} className="flex min-h-[88px] items-center justify-center rounded-2xl border border-border bg-card p-2 text-center text-xs font-bold leading-tight">{a.title}</li>)}
          </ul>
        </section>
      )}

      <section aria-label="Ustawienia" className="overflow-hidden rounded-[20px] border border-border bg-card">
        <div className="border-b border-border px-4 [&_[data-testid=row-trainer]]:border-0 [&_button]:px-0">{trainerRow}</div>
        <ListRow testId="row-goal" label="Cel kroków" value={goal === undefined ? "" : goal ? kgLabel(goal) : "Brak"} open={open === "goal"} onToggle={() => toggle("goal")}><GoalEditor onChange={setGoal} /></ListRow>
        <ListRow testId="row-look" label="Wygląd" open={open === "look"} onToggle={() => toggle("look")}>{appearance}</ListRow>
        <ListRow testId="row-timer" label="Stoper przerw" open={open === "timer"} onToggle={() => toggle("timer")}><TimerSettingsRows /></ListRow>
        <ListRow testId="row-privacy" label="Prywatność i zgody" open={open === "privacy"} onToggle={() => toggle("privacy")}><div className="space-y-4">{privacy}</div></ListRow>
      </section>

      <section aria-label="Pozostałe" className="space-y-1 text-sm text-muted-foreground">
        <div className="[&_*]:text-muted-foreground">{applyRow}</div>
        <div className="flex flex-wrap items-center gap-x-1">{legal}</div>
        <button type="button" onClick={onSignOut} disabled={signingOut} className="flex min-h-11 items-center gap-2 font-semibold"><LogOut className="h-4 w-4" aria-hidden /> Wyloguj się</button>
      </section>
    </div>
  );
}
