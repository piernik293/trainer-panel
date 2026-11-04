/**
 * The server decides, when a workout is finished, whether it brings ONE new achievement (never after a pain report, never above the plan). The finish
 * request is queued (it may go out later, offline), so its answer is kept here and "Dziś" shows it once, as a short card.
 */
const KEY = "optimatren-celebration:v1";
export interface Celebration { title: string; body: string | null }

export function rememberFinishAnswer(data: unknown): void {
  const a = (data as { achievement?: { title?: string; body?: string | null } | null } | null)?.achievement;
  if (!a?.title) return;
  try { window.localStorage.setItem(KEY, JSON.stringify({ title: a.title, body: a.body ?? null })); } catch { /* ignore */ }
}
export function readCelebration(): Celebration | null {
  try { const r = window.localStorage.getItem(KEY); return r ? (JSON.parse(r) as Celebration) : null; } catch { return null; }
}
export function clearCelebration(): void { try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } }
