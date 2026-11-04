import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { ADJUST_SECONDS, adjustRest, cheerFor, formatClock, remainingSeconds, type RestState } from "@/lib/timer/rest";
import { setTimerSettings, useTimerSettings } from "@/lib/timer/settings";
import { cancelRestCues, scheduleRestCues, vibrate } from "@/lib/timer/sound";

/**
 * Rest between sets (reusable: the trainer's "Prowadzę trening" will use it too). The time is computed from `state.endsAt`, so after a locked
 * screen it shows the right value at once. Cues: 3 beeps before the end, an energetic tune + vibration at the end, "Dawaj! <next set>".
 */
export function RestTimer({ state, counter, onChange, onClose }: {
  state: RestState; /** number of the set just done (rotates the cheer) */ counter: number;
  onChange: (s: RestState) => void; onClose: () => void;
}) {
  const settings = useTimerSettings();
  const [now, setNow] = useState(() => Date.now());
  const left = remainingSeconds(state, now);
  const finished = left <= 0;
  const cued = useRef<string>("");

  // clock: recomputed from the timestamp; also when the page becomes visible again
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);

  // sound cues are scheduled on the audio clock whenever the end time (or the sound setting) changes
  useEffect(() => {
    cancelRestCues();
    if (settings.sound && remainingSeconds(state, Date.now()) > 0) scheduleRestCues(Math.max(0, (state.endsAt - Date.now()) / 1000));
    return () => cancelRestCues();
  }, [state.endsAt, settings.sound]); // eslint-disable-line react-hooks/exhaustive-deps

  // end: vibration once per end time (per settings)
  useEffect(() => {
    if (!finished) return;
    const key = String(state.endsAt);
    if (cued.current === key) return;
    cued.current = key;
    if (settings.vibration) vibrate([200, 100, 200, 100, 350]);
  }, [finished, state.endsAt, settings.vibration]);

  const pct = Math.min(100, Math.round(((state.total - left) / Math.max(1, state.total)) * 100));
  return (
    <div role="dialog" aria-modal="true" aria-label="Przerwa" className="fixed inset-0 z-50 flex flex-col bg-background px-5 pb-6 pt-4" data-testid="rest-timer">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between">
        <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground">PRZERWA</p>
        <button type="button" onClick={() => setTimerSettings({ sound: !settings.sound })} aria-pressed={!settings.sound} aria-label={settings.sound ? "Wycisz dźwięk" : "Włącz dźwięk"} data-testid="rest-mute"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">
          {settings.sound ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-lg grow flex-col items-center justify-center gap-4 text-center">
        {finished ? (
          <>
            <p className="text-5xl font-extrabold text-primary" role="status" data-testid="rest-cheer">{cheerFor(counter)}</p>
            <p className="text-2xl font-bold" data-testid="rest-next">{state.next}</p>
          </>
        ) : (
          <>
            <p className="text-[88px] font-extrabold leading-none tabular-nums" role="timer" aria-live="off" aria-label={`Zostało ${left} sekund`} data-testid="rest-left">{formatClock(left)}</p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <p className="text-base text-muted-foreground" data-testid="rest-next-small">Następnie: {state.next}</p>
          </>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {!finished && (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => onChange(adjustRest(state, -ADJUST_SECONDS))} aria-label={`Skróć przerwę o ${ADJUST_SECONDS} sekund`} className="flex h-14 items-center justify-center gap-1 rounded-2xl border border-border bg-card text-lg font-bold"><Minus className="h-5 w-5" aria-hidden /> {ADJUST_SECONDS} s</button>
            <button type="button" onClick={() => onChange(adjustRest(state, ADJUST_SECONDS))} aria-label={`Wydłuż przerwę o ${ADJUST_SECONDS} sekund`} className="flex h-14 items-center justify-center gap-1 rounded-2xl border border-border bg-card text-lg font-bold"><Plus className="h-5 w-5" aria-hidden /> {ADJUST_SECONDS} s</button>
          </div>
        )}
        <button type="button" onClick={onClose} className={`h-14 rounded-2xl text-lg font-extrabold ${finished ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>{finished ? "Zaczynam" : "Pomiń przerwę"}</button>
      </div>
    </div>
  );
}
