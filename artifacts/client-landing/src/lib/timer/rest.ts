/** Pure logic of the rest timer between sets (no React, no audio): parsing the rest from the plan, remaining time from a timestamp, cheers. */
import type { ExerciseInfo } from "@/lib/training/types";

export const ADJUST_SECONDS = 15;
export const MIN_SECONDS = 15;
export const MAX_SECONDS = 600;

/** "90 s", "ok. 90 s", "2 min", "60–90 s", "1,5 min" → seconds; a range gives its middle, rounded to 15 s. Unknown → null. */
export function parseRestSeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".");
  const m = t.match(/(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?\s*(min|m\b|sek|s\b)/);
  if (!m) return null;
  const unit = m[3]!.startsWith("m") ? 60 : 1;
  const a = Number(m[1]) * unit;
  const b = m[2] ? Number(m[2]) * unit : a;
  const mid = (a + b) / 2;
  const sec = m[2] ? Math.round(mid / 15) * 15 : Math.round(mid);
  return sec >= MIN_SECONDS && sec <= MAX_SECONDS ? sec : null;
}

/** The plan's rest, or the default for the exercise: 90 s with a load, 60 s for bodyweight / timed exercises. */
export function restSecondsFor(ex: Pick<ExerciseInfo, "restText" | "showWeight" | "timed">): number {
  return parseRestSeconds(ex.restText) ?? (ex.showWeight && !ex.timed ? 90 : 60);
}

export interface RestState { endsAt: number; total: number; /** the set that follows the rest, e.g. "Seria 2 z 3" */ next: string }
export const startRest = (seconds: number, next: string, now = Date.now()): RestState => ({ endsAt: now + seconds * 1000, total: seconds, next });
/** Whole seconds left (rounded up), never negative — computed from the timestamp, so a locked screen cannot make it drift. */
export const remainingSeconds = (s: RestState, now = Date.now()) => Math.max(0, Math.ceil((s.endsAt - now) / 1000));
export function adjustRest(s: RestState, deltaSeconds: number, now = Date.now()): RestState {
  const left = Math.max(0, (s.endsAt - now) / 1000);
  const next = Math.min(MAX_SECONDS, Math.max(0, left + deltaSeconds));
  return { ...s, endsAt: now + next * 1000, total: Math.max(s.total, Math.round(next)) };
}

/** Short, gender-neutral cheers; they rotate with the set counter. */
export const CHEERS = ["Dawaj!", "Jeszcze jedna!", "Do roboty!", "Jedziemy!"] as const;
export const cheerFor = (n: number) => CHEERS[Math.abs(n) % CHEERS.length]!;

export const formatClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
