/**
 * Sounds of the rest timer, generated with the Web Audio API (no files, no licences). Browsers allow sound only after a tap: call `unlockAudio()`
 * from a click handler. The cues are SCHEDULED on the audio clock (3 short beeps, then an energetic rising tune), so on Android they keep sounding
 * when the page is throttled; on iPhone the audio is suspended with a locked screen (see docs/screens/ux-v2/STOPER.md).
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
let scheduled: OscillatorNode[] = [];

function context(): Ctx | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx ??= new Ctor(); } catch { return null; }
  return ctx;
}
/** Call from a tap ("Zacznij trening", "Zapisz serię"). Safe everywhere; does nothing without Web Audio. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

function tone(c: Ctx, at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
  scheduled.push(o);
}
/** 3 short beeps at T−3, T−2, T−1 s and the finishing tune at T (seconds from now). Returns false when nothing could be scheduled. */
export function scheduleRestCues(secondsLeft: number): boolean {
  cancelRestCues();
  const c = context();
  if (!c) return false;
  const now = c.currentTime;
  for (const before of [3, 2, 1]) if (secondsLeft - before > 0.05) tone(c, now + secondsLeft - before, 880, 0.12, 0.25);
  const t = now + secondsLeft;
  // energetic: four rising notes and a held top note
  [[523.25, 0], [659.25, 0.11], [783.99, 0.22], [1046.5, 0.33]].forEach(([f, d], i) => tone(c, t + d!, f!, i === 3 ? 0.45 : 0.1, 0.32, "triangle"));
  return true;
}
export function cancelRestCues(): void {
  for (const o of scheduled) { try { o.stop(); } catch { /* already stopped */ } try { o.disconnect(); } catch { /* ignore */ } }
  scheduled = [];
}
/** Vibration when the phone allows it (Android Chrome; iOS Safari has no vibration API). */
export function vibrate(pattern: number | number[]): boolean {
  try { return typeof navigator !== "undefined" && typeof navigator.vibrate === "function" ? navigator.vibrate(pattern) : false; } catch { return false; }
}
